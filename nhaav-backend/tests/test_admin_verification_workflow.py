"""Admin verification / payment workflow — security, idempotency and audit.

Pins the properties of the admin console's decision paths:

* account rejection requires a reason and is recorded (actor, action, reason);
* vendor approval is document-gated and cannot be applied twice;
* client approval verifies the bank transfer and issues the paid passes exactly
  once (a second approval changes nothing);
* reviewing one document never changes the account's own verdict;
* non-admin tokens are refused on every privileged route;
* receipts stay private to the owner and to admins;
* a visibility payment is verified once and the decision is audited.

Every fixture is synthetic — no real customer, payment or document is used.
"""
import os
import sys
import uuid
from datetime import datetime, timedelta

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

os.environ.setdefault("DATABASE_URL", "sqlite:///./test_admin_verification_workflow.db")
os.environ.setdefault("JWT_SECRET", "test-secret")
os.environ.setdefault("ENVIRONMENT", "development")

from fastapi.testclient import TestClient
import jwt
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.config import settings
from app.database import Base, get_db
from app.main import app
from app.models.access_token import AccessToken
from app.models.document import Document, DocumentStatus, DocumentType
from app.models.moderation_audit import ModerationAuditLog
from app.models.payment import Payment, PaymentStatus
from app.models.profile import Profile, VerificationStatus
from app.models.profile_visibility import (
    ProfileVisibility,
    ProfileVisibilityPlan,
    ProfileVisibilityStatus,
)
from app.models.subscription import Subscription, SubscriptionStatus
from app.models.user import User, UserRole
from app.services.subscription_service import SubscriptionService, plan_total_paise

_DB_URL = "sqlite:///./test_admin_verification_workflow.db"
engine = create_engine(_DB_URL, connect_args={"check_same_thread": False, "timeout": 30})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def _override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = _override_get_db
client = TestClient(app)


@pytest.fixture(autouse=True)
def _fresh_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    app.dependency_overrides[get_db] = _override_get_db
    yield
    app.dependency_overrides.pop(get_db, None)


def _auth(user: User) -> dict:
    token = jwt.encode(
        {"sub": str(user.id)}, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM
    )
    return {"Authorization": f"Bearer {token}"}


def _user(db, role: UserRole, name: str = "Test User") -> User:
    user = User(
        email=f"{uuid.uuid4().hex[:10]}@nhaav.test",
        password_hash="x",
        role=role,
        full_name=name,
        is_verified=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _profile(db, user: User, name: str = "Test Co") -> Profile:
    profile = Profile(
        user_id=user.id,
        company_name=name,
        verification_status=VerificationStatus.pending,
    )
    db.add(profile)
    db.commit()
    db.refresh(profile)
    return profile


def _document(db, user: User) -> Document:
    doc = Document(
        user_id=user.id,
        document_type=DocumentType.kyc_due_diligence,
        file_url="uploads/does-not-exist.pdf",
        verification_status=DocumentStatus.pending,
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return doc


def _pending_payment(db, user: User) -> Payment:
    plan = SubscriptionService.get_plan(db, "MONTHLY")
    subscription = Subscription(
        owner_user_id=user.id,
        plan_id=plan.id,
        status=SubscriptionStatus.PENDING,
    )
    db.add(subscription)
    db.flush()
    now = datetime.utcnow()
    payment = Payment(
        owner_user_id=user.id,
        subscription_id=subscription.id,
        plan_id=plan.id,
        submitted_by=user.id,
        amount_paise=plan_total_paise(plan),
        currency="INR",
        utr=f"UTR{uuid.uuid4().hex[:12].upper()}",
        payment_date=now,
        receipt_path="uploads/does-not-exist.pdf",
        receipt_filename="transfer.pdf",
        status=PaymentStatus.SUBMITTED,
        submitted_at=now,
    )
    db.add(payment)
    db.commit()
    db.refresh(payment)
    return payment


# ------------------------------------------------------------------ decisions
def test_rejection_requires_reason_and_is_audited():
    db = TestingSessionLocal()
    admin = _user(db, UserRole.admin, "Admin One")
    vendor = _user(db, UserRole.provider, "Vendor One")
    profile = _profile(db, vendor)
    headers = _auth(admin)

    missing = client.post(
        f"/admin/verification/providers/{profile.id}/action",
        json={"action": "reject"},
        headers=headers,
    )
    assert missing.status_code == 422
    assert missing.json()["detail"]["code"] == "reason_required"

    blank = client.post(
        f"/admin/verification/providers/{profile.id}/action",
        json={"action": "reject", "reason": "  "},
        headers=headers,
    )
    assert blank.status_code == 422

    rejected = client.post(
        f"/admin/verification/providers/{profile.id}/action",
        json={"action": "reject", "reason": "Tax ID does not match the registration"},
        headers=headers,
    )
    assert rejected.status_code == 200, rejected.text

    db.expire_all()
    stored = db.query(Profile).filter(Profile.id == profile.id).first()
    assert stored.verification_status == VerificationStatus.rejected
    meta = stored.profile_metadata or {}
    assert meta["verification_reason"] == "Tax ID does not match the registration"
    assert meta["verification_state"] == "rejected"
    assert meta["verification_decided_at"]

    audit = (
        db.query(ModerationAuditLog)
        .filter(
            ModerationAuditLog.entity_type == "profile",
            ModerationAuditLog.entity_id == profile.id,
        )
        .all()
    )
    assert len(audit) == 1
    assert audit[0].action == "rejected"
    assert audit[0].admin_id == admin.id
    assert audit[0].reason == "Tax ID does not match the registration"

    detail = client.get(f"/admin/verification/providers/{profile.id}", headers=headers)
    assert detail.status_code == 200
    payload = detail.json()
    assert payload["last_reviewed_at"] is not None
    assert payload["review_note"] == "Tax ID does not match the registration"
    assert payload["review_history"][0]["action"] == "rejected"
    assert payload["review_history"][0]["reviewer"] == "Admin One"
    db.close()


def test_vendor_approval_needs_documents_and_happens_once():
    db = TestingSessionLocal()
    admin = _user(db, UserRole.admin)
    vendor = _user(db, UserRole.provider)
    profile = _profile(db, vendor, "Doc Gate Marine")
    headers = _auth(admin)

    blocked = client.post(
        f"/admin/verification/providers/{profile.id}/action",
        json={"action": "approve"},
        headers=headers,
    )
    assert blocked.status_code == 409
    assert blocked.json()["detail"]["code"] == "documents_required"

    _document(db, vendor)
    first = client.post(
        f"/admin/verification/providers/{profile.id}/action",
        json={"action": "approve"},
        headers=headers,
    )
    assert first.status_code == 200, first.text
    assert first.json()["passes_granted"] is None

    second = client.post(
        f"/admin/verification/providers/{profile.id}/action",
        json={"action": "approve"},
        headers=headers,
    )
    assert second.status_code == 409
    assert second.json()["detail"]["code"] == "already_approved"

    db.expire_all()
    assert db.query(Profile).filter(Profile.id == profile.id).first().verification_status == (
        VerificationStatus.verified
    )
    audits = (
        db.query(ModerationAuditLog)
        .filter(
            ModerationAuditLog.entity_type == "profile",
            ModerationAuditLog.entity_id == profile.id,
        )
        .all()
    )
    assert len(audits) == 1, "a repeated approval must not add a second audit row"
    db.close()


def test_client_approval_verifies_payment_and_issues_passes_once():
    db = TestingSessionLocal()
    admin = _user(db, UserRole.admin)
    buyer = _user(db, UserRole.client)
    profile = _profile(db, buyer, "Buyer Co")
    _document(db, buyer)
    payment = _pending_payment(db, buyer)
    headers = _auth(admin)

    approved = client.post(
        f"/admin/verification/providers/{profile.id}/action",
        json={"action": "approve"},
        headers=headers,
    )
    assert approved.status_code == 200, approved.text
    body = approved.json()
    assert body["passes_granted"] == 10

    db.expire_all()
    stored_payment = db.query(Payment).filter(Payment.id == payment.id).first()
    assert stored_payment.status == PaymentStatus.VERIFIED
    assert stored_payment.verified_by == admin.id

    passes = db.query(AccessToken).filter(AccessToken.owner_user_id == buyer.id).all()
    assert len(passes) == 10

    again = client.post(
        f"/admin/verification/providers/{profile.id}/action",
        json={"action": "approve"},
        headers=headers,
    )
    assert again.status_code == 409
    assert again.json()["detail"]["code"] == "already_approved"

    db.expire_all()
    passes_after = db.query(AccessToken).filter(AccessToken.owner_user_id == buyer.id).all()
    assert len(passes_after) == 10, "a second approval must not issue a second pack"
    db.close()


def test_document_review_never_changes_the_account_verdict():
    db = TestingSessionLocal()
    admin = _user(db, UserRole.admin)
    vendor = _user(db, UserRole.provider)
    profile = _profile(db, vendor)
    document = _document(db, vendor)
    headers = _auth(admin)

    no_reason = client.post(
        f"/admin/verification/documents/{document.id}/action",
        json={"action": "reject"},
        headers=headers,
    )
    assert no_reason.status_code == 422
    assert no_reason.json()["detail"]["code"] == "reason_required"

    rejected = client.post(
        f"/admin/verification/documents/{document.id}/action",
        json={"action": "reject", "reason": "Scanned copy is unreadable"},
        headers=headers,
    )
    assert rejected.status_code == 200, rejected.text

    db.expire_all()
    stored_doc = db.query(Document).filter(Document.id == document.id).first()
    assert stored_doc.verification_status == DocumentStatus.rejected
    assert stored_doc.verified_by == admin.id
    stored_profile = db.query(Profile).filter(Profile.id == profile.id).first()
    assert stored_profile.verification_status == VerificationStatus.pending, (
        "rejecting one document must not decide the account"
    )

    audit = (
        db.query(ModerationAuditLog)
        .filter(
            ModerationAuditLog.entity_type == "document",
            ModerationAuditLog.entity_id == document.id,
        )
        .all()
    )
    assert len(audit) == 1
    assert audit[0].action == "rejected" and audit[0].reason == "Scanned copy is unreadable"
    assert audit[0].admin_id == admin.id
    db.close()


def test_non_admin_is_refused_on_every_privileged_route():
    db = TestingSessionLocal()
    vendor = _user(db, UserRole.provider)
    profile = _profile(db, vendor)
    document = _document(db, vendor)
    headers = _auth(vendor)

    for path, payload in [
        (f"/admin/verification/providers/{profile.id}/action", {"action": "approve"}),
        (f"/admin/verification/providers/{profile.id}/action", {"action": "reject", "reason": "nope"}),
        (f"/admin/verification/documents/{document.id}/action", {"action": "approve"}),
        (f"/admin/verification/providers/{profile.id}/grant-passes", {"pack": "10"}),
    ]:
        response = client.post(path, json=payload, headers=headers)
        assert response.status_code == 403, (path, response.status_code)

    assert client.get("/admin/verification/providers", headers=headers).status_code == 403
    assert client.get(
        f"/admin/verification/documents/{document.id}/file", headers=headers
    ).status_code == 403
    assert client.get("/admin/payments/pending", headers=headers).status_code == 403
    assert client.get("/admin/profile-visibility", headers=headers).status_code == 403

    db.expire_all()
    assert db.query(Profile).filter(Profile.id == profile.id).first().verification_status == (
        VerificationStatus.pending
    )
    assert db.query(ModerationAuditLog).count() == 0
    db.close()


def test_receipt_is_readable_only_by_owner_and_admin(tmp_path):
    db = TestingSessionLocal()
    admin = _user(db, UserRole.admin)
    owner = _user(db, UserRole.client)
    stranger = _user(db, UserRole.client)
    payment = _pending_payment(db, owner)

    receipt = tmp_path / "receipt.pdf"
    receipt.write_bytes(b"%PDF-1.4 synthetic test receipt")
    payment.receipt_path = str(receipt)
    db.commit()

    path = f"/payments/{payment.id}/receipt"
    assert client.get(path, headers=_auth(owner)).status_code == 200
    assert client.get(path, headers=_auth(admin)).status_code == 200
    # Another account learns nothing: 404, not 403.
    assert client.get(path, headers=_auth(stranger)).status_code == 404
    assert client.get(path).status_code == 401
    db.close()


def test_visibility_verification_is_audited_and_single_use():
    db = TestingSessionLocal()
    admin = _user(db, UserRole.admin)
    vendor = _user(db, UserRole.provider)
    profile = _profile(db, vendor, "Visible Marine")
    profile.verification_status = VerificationStatus.verified
    record = ProfileVisibility(
        profile_id=profile.id,
        owner_user_id=vendor.id,
        plan=ProfileVisibilityPlan.monthly,
        period_days=30,
        base_amount_paise=100_000,
        gst_rate_percent=18,
        gst_amount_paise=18_000,
        total_amount_paise=118_000,
        utr=f"UTR{uuid.uuid4().hex[:12].upper()}",
        payment_date=datetime.utcnow(),
        receipt_path="uploads/does-not-exist.pdf",
        receipt_filename="visibility.pdf",
        status=ProfileVisibilityStatus.SUBMITTED,
        submitted_at=datetime.utcnow(),
    )
    db.add(record)
    db.commit()
    db.refresh(record)

    headers = _auth(admin)
    first = client.post(f"/admin/profile-visibility/{record.id}/verify", headers=headers)
    assert first.status_code == 200, first.text

    second = client.post(f"/admin/profile-visibility/{record.id}/verify", headers=headers)
    assert second.status_code == 409

    db.expire_all()
    audit = (
        db.query(ModerationAuditLog)
        .filter(
            ModerationAuditLog.entity_type == "profile_visibility",
            ModerationAuditLog.entity_id == record.id,
        )
        .all()
    )
    assert len(audit) == 1
    assert audit[0].action == "approved" and audit[0].admin_id == admin.id

    stored = db.query(ProfileVisibility).filter(ProfileVisibility.id == record.id).first()
    assert stored.status == ProfileVisibilityStatus.VERIFIED
    assert stored.expires_at is not None and stored.expires_at > datetime.utcnow()
    db.close()
