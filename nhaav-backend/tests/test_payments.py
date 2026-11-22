"""
End-to-end suite for Nhaav's offline bank-transfer payment submissions.

Covers the required scenarios: monthly and annual activation E2E, rejection with
a visible reason, duplicate approval idempotency, wrong-amount refusal, cross-
organization isolation, receipt privacy, role-based approval denial, status
forging attempts, UTR duplication, upload validation and audit/notification
fan-out.
"""
import os
import uuid
from datetime import datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.database import Base, get_db
from app.config import settings
from app.models.user import User, UserRole
from app.models.profile import Profile
from app.models.access_token import AccessPack, AccessToken, AccessTokenStatus, Organization
from app.models.subscription import Subscription, SubscriptionStatus
from app.models.payment import Payment, PaymentStatus
from app.models.payment_audit import PaymentAuditLog
from app.models.notification import Notification, NotificationType
from app.services.subscription_service import SubscriptionService
from app.utils.password import hash_password
import jwt
import app.services.payment_service as payment_service_module

SQLALCHEMY_DATABASE_URL = "sqlite:///./test_payments.db"
engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=None,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@event.listens_for(engine, "connect")
def _sqlite_concurrency_pragmas(dbapi_connection, _record):
    """WAL + a busy timeout so concurrent writers wait instead of erroring."""
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA busy_timeout=30000")
    cursor.close()


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = override_get_db


@pytest.fixture(scope="module", autouse=True)
def setup_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield
    # Remove receipt files created by this module, then drop the schema.
    db = TestingSessionLocal()
    try:
        for payment in db.query(Payment).all():
            try:
                if payment.receipt_path and os.path.exists(payment.receipt_path):
                    os.remove(payment.receipt_path)
            except OSError:
                pass
    finally:
        db.close()
    Base.metadata.drop_all(bind=engine)


@pytest.fixture(autouse=True)
def _pin_app_db():
    prev = app.dependency_overrides.get(get_db)
    app.dependency_overrides[get_db] = override_get_db
    yield
    if prev is not None:
        app.dependency_overrides[get_db] = prev


# --------------------------------------------------------------------- helpers
RECEIPT_BYTES = b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n%%EOF\n"


def _headers(user: User) -> dict:
    tok = jwt.encode({"sub": str(user.id)}, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)
    return {"Authorization": f"Bearer {tok}"}


def _org(db, name) -> Organization:
    org = Organization(name=name)
    db.add(org)
    db.commit()
    db.refresh(org)
    return org


def _user(db, email, org, role=UserRole.client) -> User:
    user = User(
        email=email,
        password_hash=hash_password("Password123!"),
        role=role,
        full_name=email,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    if org is not None:
        db.add(Profile(user_id=user.id, company_name=org.name, organization_id=org.id))
    else:
        db.add(Profile(user_id=user.id, company_name="Nhaav Platform"))
    db.commit()
    return user


def _admin(db, email) -> User:
    """Platform staff: admin role, never a member of any organization."""
    user = User(
        email=email,
        password_hash=hash_password("Password123!"),
        role=UserRole.admin,
        full_name=email,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _submit(
    client,
    headers,
    plan_code="MONTHLY",
    utr="UTR-1000000001",
    payment_date="2026-10-01",
    amount_paise=None,
    filename="receipt.pdf",
    content_type="application/pdf",
    content=RECEIPT_BYTES,
    notes="Paid via NEFT",
):
    data = {"plan_code": plan_code, "utr": utr, "payment_date": payment_date, "notes": notes}
    if amount_paise is not None:
        data["amount_paise"] = str(amount_paise)
    return client.post(
        "/payments/submit",
        data=data,
        files={"receipt": (filename, content, content_type)},
        headers=headers,
    )


def _approve(client, admin_headers, payment_id):
    return client.post(f"/admin/payments/{payment_id}/approve", headers=admin_headers)


def _reject(client, admin_headers, payment_id, reason="UTR did not match any credited transfer"):
    return client.post(
        f"/admin/payments/{payment_id}/reject",
        json={"reason": reason},
        headers=admin_headers,
    )


# ------------------------------------------------------ monthly / annual E2E
class TestActivationFlows:
    def test_monthly_end_to_end_activates_and_issues_ten_passes(self):
        db = TestingSessionLocal()
        org = _org(db, "Monthly E2E Co")
        member = _user(db, "monthly@pay.com", org)
        admin = _admin(db, "admin-monthly@nhaav.com")
        headers, admin_headers = _headers(member), _headers(admin)
        org_id, member_id = org.id, member.id
        db.close()

        client = TestClient(app)

        # 1. The plans are visible with the approved monthly figures.
        plans = client.get("/subscription/plans", headers=headers).json()["plans"]
        monthly = next(p for p in plans if p["code"] == "MONTHLY")
        assert monthly["price_paise"] == 100_000 and monthly["pass_count"] == 10
        # GST is added on top: ₹1,000 + 18% = ₹1,180, and the pack lasts six months.
        assert monthly["gst_rate_percent"] == 18
        assert monthly["gst_paise"] == 18_000
        assert monthly["total_paise"] == 118_000
        assert monthly["pass_validity_days"] == 180  # nominal six months

        # 2. Bank details come from configuration, never from frontend source.
        instructions = client.get("/payments/instructions", headers=headers)
        assert instructions.status_code == 200
        assert instructions.json()["currency"] == "INR"

        # 3. Submit the transfer.
        submitted = _submit(client, headers, "MONTHLY", utr="UTR-MONTHLY-0001")
        assert submitted.status_code == 201, submitted.text
        body = submitted.json()
        payment_id = body["id"]
        assert body["status"] == "SUBMITTED"
        assert body["amount_paise"] == 118_000     # ₹1,000 plan price + 18% GST
        assert body["base_paise"] == 100_000
        assert body["gst_paise"] == 18_000
        assert body["pass_count"] == 10

        # Nothing is activated by submitting.
        db = TestingSessionLocal()
        payment = db.query(Payment).filter(Payment.id == uuid.UUID(payment_id)).one()
        subscription = db.query(Subscription).filter(Subscription.id == payment.subscription_id).one()
        assert subscription.status == SubscriptionStatus.PENDING
        assert db.query(AccessPack).filter(AccessPack.owner_user_id == member_id).count() == 0
        assert db.query(User).filter(User.id == member_id).one().access_control_enabled is False
        db.close()

        # 4. The admin sees it in the review queue.
        pending = client.get("/admin/payments/pending", headers=admin_headers)
        assert pending.status_code == 200, pending.text
        items = pending.json()["data"]
        assert [i["id"] for i in items] == [payment_id]
        item = items[0]
        assert item["organization_name"] == "Monthly E2E Co"
        assert item["plan_code"] == "MONTHLY"
        assert item["amount_paise"] == 118_000
        assert item["base_paise"] == 100_000 and item["gst_paise"] == 18_000
        assert item["utr"] == "UTR-MONTHLY-0001"
        assert item["submitted_by_email"] == "monthly@pay.com"
        assert item["receipt_available"] is True

        # 5. Approve.
        approved = _approve(client, admin_headers, payment_id)
        assert approved.status_code == 200, approved.text
        decision = approved.json()
        assert decision["status"] == "VERIFIED"
        assert decision["subscription_status"] == "ACTIVE"
        assert decision["accesspack_created"] is True
        assert decision["total_passes"] == 10
        assert decision["already_processed"] is False

        # 6. Subscription ACTIVE, 10 passes, organization gated.
        db = TestingSessionLocal()
        payment = db.query(Payment).filter(Payment.id == uuid.UUID(payment_id)).one()
        subscription = db.query(Subscription).filter(Subscription.id == payment.subscription_id).one()
        pack = db.query(AccessPack).filter(AccessPack.subscription_id == subscription.id).one()
        tokens = db.query(AccessToken).filter(AccessToken.pack_id == pack.id).all()
        org = db.query(Organization).filter(Organization.id == org_id).one()
        assert payment.status == PaymentStatus.VERIFIED
        assert payment.verified_at is not None and payment.verified_by == admin.id
        assert subscription.status == SubscriptionStatus.ACTIVE
        assert subscription.starts_at is not None and subscription.expires_at is not None
        assert pack.token_count == 10 and len(tokens) == 10
        assert all(t.status == AccessTokenStatus.available for t in tokens)
        # every pass is owned by the purchasing ACCOUNT
        assert pack.owner_user_id == member_id
        assert all(t.owner_user_id == member_id for t in tokens)
        # the ACCOUNT's gate opened (not the company's)
        assert db.query(User).filter(User.id == member_id).one().access_control_enabled is True

        # 7. Audit trail + notification.
        audit = db.query(PaymentAuditLog).filter(PaymentAuditLog.payment_id == payment.id).all()
        actions = sorted(a.action for a in audit)
        assert actions == ["approved", "submitted"]
        approved_audit = next(a for a in audit if a.action == "approved")
        assert approved_audit.actor_id == admin.id and approved_audit.actor_role == "admin"

        notifications = db.query(Notification).filter(
            Notification.user_id == member_id,
            Notification.type == NotificationType.payment,
        ).all()
        assert len(notifications) == 1
        assert notifications[0].title == "Your Nhaav subscription has been activated."
        assert "activated" in notifications[0].message.lower()
        db.close()

        # 8. The member can now actually start a session (passes are live).
        login = client.post("/auth/login", json={"email": "monthly@pay.com", "password": "Password123!"})
        assert login.status_code == 200, login.text
        assert login.json()["access_session"] is not None

        status = client.get("/subscription/status", headers=headers).json()
        assert status["plan"]["code"] == "MONTHLY"
        assert status["passes"] == {"total": 10, "used": 1, "remaining": 9}

    def test_annual_end_to_end_issues_hundred_passes(self):
        db = TestingSessionLocal()
        org = _org(db, "Annual E2E Co")
        member = _user(db, "annual@pay.com", org)
        admin = _admin(db, "admin-annual@nhaav.com")
        headers, admin_headers = _headers(member), _headers(admin)
        org_id = org.id
        db.close()

        client = TestClient(app)
        submitted = _submit(client, headers, "ANNUAL", utr="UTR-ANNUAL-0001")
        assert submitted.status_code == 201, submitted.text
        assert submitted.json()["amount_paise"] == 1_180_000   # ₹10,000 + 18% GST
        assert submitted.json()["pass_count"] == 100
        assert submitted.json()["pass_validity_days"] == 360  # nominal twelve months

        payment_id = submitted.json()["id"]
        approved = _approve(client, admin_headers, payment_id)
        assert approved.status_code == 200, approved.text
        assert approved.json()["total_passes"] == 100

        db = TestingSessionLocal()
        payment = db.query(Payment).filter(Payment.id == uuid.UUID(payment_id)).one()
        subscription = db.query(Subscription).filter(Subscription.id == payment.subscription_id).one()
        pack = db.query(AccessPack).filter(AccessPack.subscription_id == subscription.id).one()
        assert db.query(AccessToken).filter(AccessToken.pack_id == pack.id).count() == 100
        # 100 passes are valid for twelve CALENDAR months.
        from app.models.subscription import BillingPeriod
        from app.services.subscription_service import add_duration

        assert subscription.expires_at == add_duration(
            subscription.starts_at, 12, BillingPeriod.MONTH
        )
        # Every pass in the pack carries that same exact expiry.
        passes = db.query(AccessToken).filter(AccessToken.pack_id == pack.id).all()
        assert {p.unused_expires_at for p in passes} == {subscription.expires_at}
        assert pack.owner_user_id is not None
        db.close()


# ---------------------------------------------------------------- rejection
class TestRejection:
    def test_rejected_payment_creates_no_passes_and_shows_reason(self):
        db = TestingSessionLocal()
        org = _org(db, "Reject Co")
        member = _user(db, "reject@pay.com", org)
        admin = _admin(db, "admin-reject@nhaav.com")
        headers, admin_headers = _headers(member), _headers(admin)
        org_id, member_id = org.id, member.id
        db.close()

        client = TestClient(app)
        submitted = _submit(client, headers, "MONTHLY", utr="UTR-REJECT-0001")
        assert submitted.status_code == 201
        payment_id = submitted.json()["id"]

        rejected = _reject(client, admin_headers, payment_id, reason="No matching credit in the bank statement")
        assert rejected.status_code == 200, rejected.text
        body = rejected.json()
        assert body["status"] == "REJECTED"
        assert body["rejection_reason"] == "No matching credit in the bank statement"
        assert body["accesspack_created"] is False
        assert body["subscription_status"] == "CANCELLED"  # never activated

        db = TestingSessionLocal()
        payment = db.query(Payment).filter(Payment.id == uuid.UUID(payment_id)).one()
        assert payment.status == PaymentStatus.REJECTED
        assert payment.rejection_reason == "No matching credit in the bank statement"
        # No pack, no passes, the account is still unable to use paid access.
        assert db.query(AccessPack).filter(AccessPack.owner_user_id == member_id).count() == 0
        assert db.query(User).filter(User.id == member_id).one().access_control_enabled is False

        audit = db.query(PaymentAuditLog).filter(PaymentAuditLog.payment_id == payment.id).all()
        rejection_audit = next(a for a in audit if a.action == "rejected")
        assert rejection_audit.reason == "No matching credit in the bank statement"

        notifications = db.query(Notification).filter(
            Notification.user_id == member_id,
            Notification.type == NotificationType.payment,
        ).all()
        assert len(notifications) == 1
        assert notifications[0].title == "Your Nhaav payment was rejected."
        assert "No matching credit in the bank statement" in notifications[0].message
        db.close()

        # The organization sees the reason on its own payment record.
        mine = client.get("/payments/my", headers=headers).json()["data"]
        assert mine[0]["status"] == "REJECTED"
        assert mine[0]["rejection_reason"] == "No matching credit in the bank statement"

    def test_rejection_requires_a_reason(self):
        db = TestingSessionLocal()
        org = _org(db, "No Reason Co")
        member = _user(db, "noreason@pay.com", org)
        admin = _admin(db, "admin-noreason@nhaav.com")
        headers, admin_headers = _headers(member), _headers(admin)
        db.close()

        client = TestClient(app)
        payment_id = _submit(client, headers, "MONTHLY", utr="UTR-NOREASON-1").json()["id"]

        empty = client.post(f"/admin/payments/{payment_id}/reject", json={"reason": ""}, headers=admin_headers)
        assert empty.status_code == 422  # schema requires a reason

        db = TestingSessionLocal()
        payment = db.query(Payment).filter(Payment.id == uuid.UUID(payment_id)).one()
        assert payment.status == PaymentStatus.SUBMITTED  # untouched
        db.close()

    def test_verified_payment_cannot_be_rejected(self):
        db = TestingSessionLocal()
        org = _org(db, "Verify Then Reject Co")
        member = _user(db, "vtr@pay.com", org)
        admin = _admin(db, "admin-vtr@nhaav.com")
        headers, admin_headers = _headers(member), _headers(admin)
        db.close()

        client = TestClient(app)
        payment_id = _submit(client, headers, "MONTHLY", utr="UTR-VTR-0001").json()["id"]
        assert _approve(client, admin_headers, payment_id).status_code == 200

        rejected = _reject(client, admin_headers, payment_id)
        assert rejected.status_code == 409


# ------------------------------------------------- idempotency / duplicates
class TestDuplicateProtection:
    def test_approving_twice_creates_only_one_pack_and_extends_once(self):
        db = TestingSessionLocal()
        org = _org(db, "Idempotent Co")
        member = _user(db, "idem@pay.com", org)
        admin = _admin(db, "admin-idem@nhaav.com")
        headers, admin_headers = _headers(member), _headers(admin)
        org_id = org.id
        db.close()

        client = TestClient(app)
        payment_id = _submit(client, headers, "MONTHLY", utr="UTR-IDEM-0001").json()["id"]

        first = _approve(client, admin_headers, payment_id)
        assert first.status_code == 200
        assert first.json()["already_processed"] is False
        pack_id = first.json()["pack_id"]
        expires_at = first.json()["expires_at"]

        second = _approve(client, admin_headers, payment_id)
        assert second.status_code == 200, second.text
        assert second.json()["already_processed"] is True
        assert second.json()["pack_id"] == pack_id          # same pack
        assert second.json()["expires_at"] == expires_at    # not extended twice

        db = TestingSessionLocal()
        payment = db.query(Payment).filter(Payment.id == uuid.UUID(payment_id)).one()
        subscriptions = db.query(Subscription).filter(Subscription.organization_id == org_id).all()
        packs = db.query(AccessPack).filter(AccessPack.organization_id == org_id).all()
        tokens = db.query(AccessToken).filter(AccessToken.organization_id == org_id).all()
        assert len(subscriptions) == 1 and len(packs) == 1 and len(tokens) == 10
        approved_audit = db.query(PaymentAuditLog).filter(
            PaymentAuditLog.payment_id == payment.id, PaymentAuditLog.action == "approved"
        ).count()
        assert approved_audit == 1  # no second audit entry for a no-op approval
        db.close()

    def test_same_utr_cannot_be_submitted_twice(self):
        db = TestingSessionLocal()
        org = _org(db, "UTR Dup Co")
        member = _user(db, "utrdup@pay.com", org)
        headers = _headers(member)
        db.close()

        client = TestClient(app)
        first = _submit(client, headers, "MONTHLY", utr="UTR-SAME-0001")
        assert first.status_code == 201

        second = _submit(client, headers, "MONTHLY", utr="utr-same-0001")  # case-insensitive
        assert second.status_code == 409
        assert "already been submitted" in second.json()["detail"]

    def test_second_purchase_while_passes_remain_is_allowed_and_adds_a_pack(self):
        """
        Captain's rule: an account may buy another pack while passes from an
        earlier pack are still unused. The earlier pack is never overwritten.
        """
        db = TestingSessionLocal()
        org = _org(db, "Double Active Co")
        member = _user(db, "double@pay.com", org)
        admin = _admin(db, "admin-double@nhaav.com")
        headers, admin_headers = _headers(member), _headers(admin)
        member_id, org_id = member.id, org.id
        db.close()

        client = TestClient(app)
        first_id = _submit(client, headers, "MONTHLY", utr="UTR-DBL-0001").json()["id"]
        first = _approve(client, admin_headers, first_id)
        assert first.status_code == 200, first.text
        first_pack_id = first.json()["pack_id"]

        second_id = _submit(client, headers, "MONTHLY", utr="UTR-DBL-0002").json()["id"]
        second = _approve(client, admin_headers, second_id)
        assert second.status_code == 200, second.text
        assert second.json()["pack_id"] != first_pack_id

        db = TestingSessionLocal()
        packs = db.query(AccessPack).filter(AccessPack.owner_user_id == member_id).all()
        assert len(packs) == 2
        assert all(p.token_count == 10 for p in packs)
        assert db.query(AccessToken).filter(
            AccessToken.owner_user_id == member_id
        ).count() == 20
        # the earlier subscription was neither cancelled nor extended
        subs = db.query(Subscription).filter(Subscription.owner_user_id == member_id).all()
        assert len(subs) == 2
        assert all(s.status == SubscriptionStatus.ACTIVE for s in subs)
        db.close()

    def test_duplicate_utr_is_still_refused(self):
        """Multiple packs are allowed, but the SAME transfer can never be reused."""
        db = TestingSessionLocal()
        org = _org(db, "Dup UTR Co")
        member = _user(db, "dup2@pay.com", org)
        headers = _headers(member)
        db.close()

        client = TestClient(app)
        assert _submit(client, headers, "MONTHLY", utr="UTR-DUP-0001").status_code == 201
        again = _submit(client, headers, "MONTHLY", utr="UTR-DUP-0001")
        assert again.status_code == 409


# --------------------------------------------------- server-side amounts/plans
class TestServerSideAmounts:
    def test_mismatched_claimed_amount_is_refused(self):
        db = TestingSessionLocal()
        org = _org(db, "Wrong Amount Co")
        member = _user(db, "wrongamount@pay.com", org)
        headers = _headers(member)
        org_id = org.id
        db.close()

        client = TestClient(app)
        # Claiming ₹1,000 while selecting the ₹10,000 ANNUAL plan.
        cheap_claim = _submit(client, headers, "ANNUAL", utr="UTR-WA-0001", amount_paise=100_000)
        assert cheap_claim.status_code == 400
        assert "does not match" in cheap_claim.json()["detail"]

        # ...and the reverse: claiming ₹10,000 for the ₹1,000 MONTHLY plan.
        rich_claim = _submit(client, headers, "MONTHLY", utr="UTR-WA-0002", amount_paise=1_000_000)
        assert rich_claim.status_code == 400

        db = TestingSessionLocal()
        assert db.query(Payment).filter(Payment.organization_id == org_id).count() == 0
        assert db.query(Subscription).filter(Subscription.organization_id == org_id).count() == 0
        db.close()

    def test_matching_claim_is_accepted_and_amount_is_server_derived(self):
        db = TestingSessionLocal()
        org = _org(db, "Matching Amount Co")
        member = _user(db, "matching@pay.com", org)
        headers = _headers(member)
        db.close()

        client = TestClient(app)
        ok = _submit(client, headers, "ANNUAL", utr="UTR-MA-0001", amount_paise=1_180_000)
        assert ok.status_code == 201, ok.text
        payment_id = ok.json()["id"]

        db = TestingSessionLocal()
        payment = db.query(Payment).filter(Payment.id == uuid.UUID(payment_id)).one()
        # Stored amount is the plan price PLUS GST (integer paise), server-derived.
        assert payment.amount_paise == 1_180_000
        assert payment.amount_paise == payment.plan.price_paise + 180_000
        assert isinstance(payment.amount_paise, int)
        db.close()

    def test_unknown_plan_is_refused(self):
        db = TestingSessionLocal()
        org = _org(db, "Unknown Plan Pay Co")
        member = _user(db, "unknownplan@pay.com", org)
        headers = _headers(member)
        db.close()

        client = TestClient(app)
        resp = _submit(client, headers, "LIFETIME", utr="UTR-UP-0001")
        assert resp.status_code == 404

    def test_utr_alone_never_activates_anything(self):
        db = TestingSessionLocal()
        org = _org(db, "UTR Claim Co")
        member = _user(db, "utrclaim@pay.com", org)
        headers = _headers(member)
        member_id = member.id
        db.close()

        client = TestClient(app)
        resp = _submit(client, headers, "MONTHLY", utr="UTR-CLAIM-0001")
        assert resp.status_code == 201

        db = TestingSessionLocal()
        payment = db.query(Payment).filter(Payment.utr == "UTR-CLAIM-0001").one()
        assert payment.status == PaymentStatus.SUBMITTED          # not VERIFIED
        subscription = db.query(Subscription).filter(Subscription.id == payment.subscription_id).one()
        assert subscription.status == SubscriptionStatus.PENDING  # not ACTIVE
        assert db.query(User).filter(User.id == member.id).one().access_control_enabled is False
        db.close()

    def test_user_cannot_forge_status_or_subscription_state(self):
        db = TestingSessionLocal()
        org = _org(db, "Forge Co")
        member = _user(db, "forge@pay.com", org)
        headers = _headers(member)
        db.close()

        client = TestClient(app)
        # Extra fields attempting to force state are not part of the contract.
        resp = client.post(
            "/payments/submit",
            data={
                "plan_code": "MONTHLY",
                "utr": "UTR-FORGE-0001",
                "payment_date": "2026-10-01",
                "status": "VERIFIED",
                "subscription_status": "ACTIVE",
            },
            files={"receipt": ("receipt.pdf", RECEIPT_BYTES, "application/pdf")},
            headers=headers,
        )
        assert resp.status_code == 201
        assert resp.json()["status"] == "SUBMITTED"

        db = TestingSessionLocal()
        payment = db.query(Payment).filter(Payment.utr == "UTR-FORGE-0001").one()
        assert payment.status == PaymentStatus.SUBMITTED
        subscription = db.query(Subscription).filter(Subscription.id == payment.subscription_id).one()
        assert subscription.status == SubscriptionStatus.PENDING
        db.close()

    def test_amount_cannot_be_changed_after_submission(self):
        db = TestingSessionLocal()
        org = _org(db, "Immutable Amount Co")
        member = _user(db, "immutable@pay.com", org)
        headers = _headers(member)
        db.close()

        client = TestClient(app)
        payment_id = _submit(client, headers, "MONTHLY", utr="UTR-IMM-0001").json()["id"]
        before = client.get("/payments/my", headers=headers).json()["data"][0]["amount_paise"]
        assert before == 118_000

        # No update/delete surface exists for a submitted payment.
        for method in ("PUT", "PATCH", "DELETE"):
            resp = client.request(
                method, f"/payments/{payment_id}", json={"amount_paise": 1}, headers=headers
            )
            assert resp.status_code in (404, 405), resp.text

        after = client.get("/payments/my", headers=headers).json()["data"][0]["amount_paise"]
        assert after == before


# -------------------------------------------------------------- org isolation
class TestOrganizationIsolation:
    def test_organization_cannot_see_another_organizations_payment(self):
        db = TestingSessionLocal()
        org_a = _org(db, "Pay Iso A")
        org_b = _org(db, "Pay Iso B")
        member_a = _user(db, "iso-a@pay.com", org_a)
        member_b = _user(db, "iso-b@pay.com", org_b)
        admin = _admin(db, "admin-iso@nhaav.com")
        headers_a, headers_b, admin_headers = _headers(member_a), _headers(member_b), _headers(admin)
        org_b_id = org_b.id
        db.close()

        client = TestClient(app)
        payment_id = _submit(client, headers_a, "MONTHLY", utr="UTR-ISO-0001").json()["id"]

        # B's list is empty and B cannot fetch A's receipt.
        assert client.get("/payments/my", headers=headers_b).json()["data"] == []
        cross = client.get(f"/payments/{payment_id}/receipt", headers=headers_b)
        assert cross.status_code == 404  # existence is not leaked

        # A can see its own payment and receipt.
        assert len(client.get("/payments/my", headers=headers_a).json()["data"]) == 1
        assert client.get(f"/payments/{payment_id}/receipt", headers=headers_a).status_code == 200

        # The admin queue is platform-wide, but B's org still owns nothing.
        pending = client.get("/admin/payments/pending", headers=admin_headers).json()["data"]
        assert any(i["id"] == payment_id for i in pending)

        db = TestingSessionLocal()
        assert db.query(Payment).filter(Payment.organization_id == org_b_id).count() == 0
        db.close()

    def test_account_without_a_company_can_still_purchase(self):
        """Passes are owned by the ACCOUNT, so a company is no longer required."""
        db = TestingSessionLocal()
        user = _user(db, "noorg@pay.com", None)
        headers = _headers(user)
        admin = _admin(db, "admin-noorg@nhaav.com")
        admin_headers = _headers(admin)
        user_id = user.id
        db.close()

        client = TestClient(app)
        submitted = _submit(client, headers, "MONTHLY", utr="UTR-NOORG-0001")
        assert submitted.status_code == 201, submitted.text
        payment_id = submitted.json()["id"]

        approved = _approve(client, admin_headers, payment_id)
        assert approved.status_code == 200, approved.text

        db = TestingSessionLocal()
        payment = db.query(Payment).filter(Payment.id == uuid.UUID(payment_id)).one()
        assert payment.owner_user_id == user_id
        assert payment.organization_id is None
        pack = db.query(AccessPack).filter(AccessPack.owner_user_id == user_id).one()
        assert pack.token_count == 10
        db.close()


# ------------------------------------------------------------- receipt security
class TestReceiptSecurity:
    def test_receipt_requires_authentication(self):
        db = TestingSessionLocal()
        org = _org(db, "Receipt Auth Co")
        member = _user(db, "receiptauth@pay.com", org)
        headers = _headers(member)
        db.close()

        client = TestClient(app)
        payment_id = _submit(client, headers, "MONTHLY", utr="UTR-RA-0001").json()["id"]

        anonymous = client.get(f"/payments/{payment_id}/receipt")
        assert anonymous.status_code == 401

    def test_receipt_is_never_publicly_served(self):
        db = TestingSessionLocal()
        org = _org(db, "Receipt Static Co")
        member = _user(db, "receiptstatic@pay.com", org)
        headers = _headers(member)
        db.close()

        client = TestClient(app)
        payment_id = _submit(client, headers, "MONTHLY", utr="UTR-RS-0001").json()["id"]

        db = TestingSessionLocal()
        payment = db.query(Payment).filter(Payment.id == uuid.UUID(payment_id)).one()
        stored_path = payment.receipt_path
        db.close()

        # The file sits outside any static mount: the raw path is not routable.
        assert client.get(f"/{stored_path}").status_code == 404
        assert client.get(f"/uploads/{os.path.basename(stored_path)}").status_code == 404
        assert client.get(f"/static/{os.path.basename(stored_path)}").status_code == 404

    def test_receipt_content_is_returned_only_to_authorized_callers(self):
        db = TestingSessionLocal()
        org = _org(db, "Receipt Content Co")
        member = _user(db, "receiptcontent@pay.com", org)
        admin = _admin(db, "admin-receipt@nhaav.com")
        headers, admin_headers = _headers(member), _headers(admin)
        db.close()

        client = TestClient(app)
        payment_id = _submit(client, headers, "MONTHLY", utr="UTR-RC-0001").json()["id"]

        owner = client.get(f"/payments/{payment_id}/receipt", headers=headers)
        assert owner.status_code == 200
        assert owner.content == RECEIPT_BYTES
        assert owner.headers["content-type"].startswith("application/pdf")

        reviewer = client.get(f"/payments/{payment_id}/receipt", headers=admin_headers)
        assert reviewer.status_code == 200
        assert reviewer.content == RECEIPT_BYTES


# ---------------------------------------------------------- upload validation
class TestReceiptValidation:
    def test_disallowed_extension_is_refused(self):
        db = TestingSessionLocal()
        org = _org(db, "Bad Extension Co")
        member = _user(db, "badext@pay.com", org)
        headers = _headers(member)
        db.close()

        client = TestClient(app)
        resp = _submit(
            client, headers, "MONTHLY", utr="UTR-BE-0001",
            filename="payload.exe", content_type="application/pdf",
        )
        assert resp.status_code == 400
        assert "Unsupported receipt file type" in resp.json()["detail"]

    def test_disallowed_content_type_is_refused(self):
        db = TestingSessionLocal()
        org = _org(db, "Bad Type Co")
        member = _user(db, "badtype@pay.com", org)
        headers = _headers(member)
        db.close()

        client = TestClient(app)
        resp = _submit(
            client, headers, "MONTHLY", utr="UTR-BT-0001",
            filename="receipt.pdf", content_type="application/x-msdownload",
        )
        assert resp.status_code == 400
        assert "Unsupported receipt content type" in resp.json()["detail"]

    def test_oversized_receipt_is_refused(self):
        db = TestingSessionLocal()
        org = _org(db, "Too Big Co")
        member = _user(db, "toobig@pay.com", org)
        headers = _headers(member)
        db.close()

        client = TestClient(app)
        oversize = b"%PDF-1.4" + b"0" * (settings.PAYMENT_RECEIPT_MAX_BYTES + 10)
        resp = _submit(client, headers, "MONTHLY", utr="UTR-TB-0001", content=oversize)
        assert resp.status_code == 400
        assert "exceeds" in resp.json()["detail"]

    def test_empty_receipt_is_refused(self):
        db = TestingSessionLocal()
        org = _org(db, "Empty Receipt Co")
        member = _user(db, "empty@pay.com", org)
        headers = _headers(member)
        db.close()

        client = TestClient(app)
        resp = _submit(client, headers, "MONTHLY", utr="UTR-ER-0001", content=b"")
        assert resp.status_code == 400

    def test_path_traversal_filename_is_stored_safely(self):
        db = TestingSessionLocal()
        org = _org(db, "Traversal Co")
        member = _user(db, "traversal@pay.com", org)
        headers = _headers(member)
        db.close()

        client = TestClient(app)
        resp = _submit(
            client, headers, "MONTHLY", utr="UTR-TV-0001",
            filename="../../../../evil.pdf",
        )
        assert resp.status_code == 201, resp.text
        payment_id = resp.json()["id"]

        db = TestingSessionLocal()
        payment = db.query(Payment).filter(Payment.id == uuid.UUID(payment_id)).one()
        stored = os.path.abspath(payment.receipt_path)
        receipts_dir = os.path.abspath(settings.PAYMENT_RECEIPTS_DIR)
        # Stored under the receipts directory under a server-generated uuid name.
        assert stored.startswith(receipts_dir + os.sep)
        stem = os.path.splitext(os.path.basename(stored))[0]
        uuid.UUID(stem)  # raises if the on-disk name is not a generated uuid
        # The display name carries no directory component.
        assert ".." not in payment.receipt_filename and "/" not in payment.receipt_filename
        db.close()


# ------------------------------------------------------- role-based denial
class TestAdminOnlyDecisions:
    def _non_admin_headers(self):
        # Unique org/emails per call: multiple tests use this helper and the
        # module-scoped DB keeps every row alive between them.
        suffix = uuid.uuid4().hex[:8]
        db = TestingSessionLocal()
        org = _org(db, f"Role Denial Co {suffix}")
        client_user = _user(db, f"role-client-{suffix}@pay.com", org, UserRole.client)
        supplier = _user(db, f"role-supplier-{suffix}@pay.com", org, UserRole.supplier)
        provider = _user(db, f"role-provider-{suffix}@pay.com", org, UserRole.provider)
        headers = {
            "client": _headers(client_user),
            "supplier": _headers(supplier),
            "provider": _headers(provider),
        }
        db.close()
        return headers

    def test_non_admins_cannot_approve_or_reject(self):
        db = TestingSessionLocal()
        org = _org(db, "Approve Denied Co")
        member = _user(db, "approve-denied@pay.com", org)
        headers = _headers(member)
        db.close()

        client = TestClient(app)
        payment_id = _submit(client, headers, "MONTHLY", utr="UTR-DENY-0001").json()["id"]

        for role, role_headers in self._non_admin_headers().items():
            approve = _approve(client, role_headers, payment_id)
            assert approve.status_code == 403, f"{role} could approve: {approve.text}"
            assert approve.json()["detail"] == "Admin access required"

            reject = _reject(client, role_headers, payment_id)
            assert reject.status_code == 403, f"{role} could reject"

        db = TestingSessionLocal()
        payment = db.query(Payment).filter(Payment.id == uuid.UUID(payment_id)).one()
        assert payment.status == PaymentStatus.SUBMITTED  # untouched
        db.close()

    def test_non_admins_cannot_list_pending_payments(self):
        for role, role_headers in self._non_admin_headers().items():
            client = TestClient(app)
            resp = client.get("/admin/payments/pending", headers=role_headers)
            assert resp.status_code == 403, f"{role} could read the queue"

    def test_unauthenticated_callers_are_refused(self):
        client = TestClient(app)
        assert client.get("/admin/payments/pending").status_code == 401
        assert client.post(f"/admin/payments/{uuid.uuid4()}/approve").status_code == 401

    def test_unknown_payment_is_404_for_admin(self):
        db = TestingSessionLocal()
        admin = _admin(db, "admin-unknown@nhaav.com")
        admin_headers = _headers(admin)
        db.close()

        client = TestClient(app)
        missing = _approve(client, admin_headers, uuid.uuid4())
        assert missing.status_code == 404


# --------------------------------------------------------------- bank details
class TestBankInstructions:
    def test_bank_details_are_not_hardcoded_and_report_unconfigured(self, monkeypatch):
        db = TestingSessionLocal()
        org = _org(db, "Instructions Co")
        member = _user(db, "instructions@pay.com", org)
        headers = _headers(member)
        db.close()

        # Default configuration ships with NO bank details at all.
        for field in (
            "PAYMENT_BANK_ACCOUNT_HOLDER",
            "PAYMENT_BANK_NAME",
            "PAYMENT_BANK_ACCOUNT_NUMBER",
            "PAYMENT_BANK_IFSC",
        ):
            monkeypatch.setattr(settings, field, "")

        client = TestClient(app)
        body = client.get("/payments/instructions", headers=headers).json()
        assert body["configured"] is False
        assert body["account_number"] is None and body["ifsc"] is None

    def test_configured_bank_details_are_exposed_via_api(self, monkeypatch):
        db = TestingSessionLocal()
        org = _org(db, "Configured Instructions Co")
        member = _user(db, "configured@pay.com", org)
        headers = _headers(member)
        db.close()

        monkeypatch.setattr(settings, "PAYMENT_BANK_ACCOUNT_HOLDER", "Nhaav Maritime Services Pvt Ltd")
        monkeypatch.setattr(settings, "PAYMENT_BANK_NAME", "Example Bank")
        monkeypatch.setattr(settings, "PAYMENT_BANK_ACCOUNT_NUMBER", "000123456789")
        monkeypatch.setattr(settings, "PAYMENT_BANK_IFSC", "EXAM0001234")
        monkeypatch.setattr(settings, "PAYMENT_BANK_BRANCH", "Mumbai")
        monkeypatch.setattr(settings, "PAYMENT_INSTRUCTIONS", "Quote your organization name in the transfer remarks.")

        client = TestClient(app)
        body = client.get("/payments/instructions", headers=headers).json()
        assert body["configured"] is True
        assert body["account_holder"] == "Nhaav Maritime Services Pvt Ltd"
        assert body["account_number"] == "000123456789"
        assert body["ifsc"] == "EXAM0001234"
        assert body["currency"] == "INR"

    def test_instructions_endpoint_requires_authentication(self):
        client = TestClient(app)
        assert client.get("/payments/instructions").status_code == 401


# ------------------------------------------------ activation helper (shared)
def _activate(db, owner: User, plan_code="MONTHLY"):
    """Activate a plan for this ACCOUNT (passes are account-owned)."""
    subscription = SubscriptionService.create_subscription(db, owner, plan_code)
    pack = SubscriptionService.activate_subscription(db, subscription, source="test_helper")
    return subscription, pack


def _use_up_every_pass(db, owner: User):
    """Leave the account with NO usable pass (all used or past the 40-day window)."""
    for token in db.query(AccessToken).filter(AccessToken.owner_user_id == owner.id).all():
        token.status = AccessTokenStatus.expired
    db.commit()


# --------------------------- multiple packs + admin-approved plan changes
class TestMultiplePacksAndPlanChanges:
    """
    A later purchase ADDS a pack. Plan changes are never automatic: the purchase
    goes through the bank-transfer review and only that admin approval applies
    it. Nothing is cancelled, merged, prorated or extended.
    """

    def test_annual_purchase_while_monthly_active_adds_a_second_pack(self):
        db = TestingSessionLocal()
        org = _org(db, "Cross Plan A Co")
        member = _user(db, "crossa@pay.com", org)
        admin = _admin(db, "admin-crossa@nhaav.com")
        headers, admin_headers = _headers(member), _headers(admin)
        member_id = member.id
        db.close()

        client = TestClient(app)
        monthly_id = _submit(client, headers, "MONTHLY", utr="UTR-CROSS-A1").json()["id"]
        assert _approve(client, admin_headers, monthly_id).status_code == 200

        # A DIFFERENT plan while the monthly is active is allowed: it is a
        # SECOND pack, explicitly approved by the admin above.
        annual_id = _submit(client, headers, "ANNUAL", utr="UTR-CROSS-A2").json()["id"]
        approved = _approve(client, admin_headers, annual_id)
        assert approved.status_code == 200, approved.text
        assert approved.json()["total_passes"] == 100

        db = TestingSessionLocal()
        packs = (
            db.query(AccessPack)
            .filter(AccessPack.owner_user_id == member_id)
            .order_by(AccessPack.created_at)
            .all()
        )
        assert [p.token_count for p in packs] == [10, 100]
        subs = db.query(Subscription).filter(Subscription.owner_user_id == member_id).all()
        assert len(subs) == 2
        assert all(s.status == SubscriptionStatus.ACTIVE for s in subs)
        # the monthly pack's ten passes are untouched
        assert db.query(AccessToken).filter(
            AccessToken.pack_id == packs[0].id,
            AccessToken.status == AccessTokenStatus.available,
        ).count() == 10
        db.close()

    def test_monthly_purchase_while_annual_active_adds_a_second_pack(self):
        db = TestingSessionLocal()
        org = _org(db, "Cross Plan B Co")
        member = _user(db, "crossb@pay.com", org)
        admin = _admin(db, "admin-crossb@nhaav.com")
        headers, admin_headers = _headers(member), _headers(admin)
        member_id = member.id
        db.close()

        client = TestClient(app)
        annual_id = _submit(client, headers, "ANNUAL", utr="UTR-CROSS-B1").json()["id"]
        assert _approve(client, admin_headers, annual_id).status_code == 200

        monthly_id = _submit(client, headers, "MONTHLY", utr="UTR-CROSS-B2").json()["id"]
        approved = _approve(client, admin_headers, monthly_id)
        assert approved.status_code == 200, approved.text

        db = TestingSessionLocal()
        packs = (
            db.query(AccessPack)
            .filter(AccessPack.owner_user_id == member_id)
            .order_by(AccessPack.created_at)
            .all()
        )
        assert [p.token_count for p in packs] == [100, 10]
        assert db.query(Subscription).filter(
            Subscription.owner_user_id == member_id
        ).count() == 2
        db.close()

    def test_plan_change_is_flagged_for_the_admin_queue(self):
        """The reviewer sees that this purchase changes the account's plan."""
        db = TestingSessionLocal()
        org = _org(db, "Plan Flag Co")
        member = _user(db, "planflag@pay.com", org)
        admin = _admin(db, "admin-planflag@nhaav.com")
        headers, admin_headers = _headers(member), _headers(admin)
        db.close()

        client = TestClient(app)
        first_id = _submit(client, headers, "MONTHLY", utr="UTR-FLAG-0001").json()["id"]
        assert _approve(client, admin_headers, first_id).status_code == 200

        # a same-plan repeat is NOT a plan change
        same_id = _submit(client, headers, "MONTHLY", utr="UTR-FLAG-0002").json()["id"]
        queue = client.get("/admin/payments/pending", headers=admin_headers).json()["data"]
        same_item = next(i for i in queue if i["id"] == same_id)
        assert same_item["plan_change"] is False

        # switching plan IS flagged as a change needing this approval
        change_id = _submit(client, headers, "ANNUAL", utr="UTR-FLAG-0003").json()["id"]
        queue = client.get("/admin/payments/pending", headers=admin_headers).json()["data"]
        change_item = next(i for i in queue if i["id"] == change_id)
        assert change_item["plan_change"] is True
        assert change_item["owner_email"] == "planflag@pay.com"
        db.close()

    def test_plan_change_is_recorded_in_the_audit_trail_on_approval(self):
        db = TestingSessionLocal()
        org = _org(db, "Plan Audit Co")
        member = _user(db, "planaudit@pay.com", org)
        admin = _admin(db, "admin-planaudit@nhaav.com")
        headers, admin_headers = _headers(member), _headers(admin)
        db.close()

        client = TestClient(app)
        first_id = _submit(client, headers, "MONTHLY", utr="UTR-PAUD-0001").json()["id"]
        assert _approve(client, admin_headers, first_id).status_code == 200

        second_id = _submit(client, headers, "ANNUAL", utr="UTR-PAUD-0002").json()["id"]
        assert _approve(client, admin_headers, second_id).status_code == 200

        db = TestingSessionLocal()
        audit = db.query(PaymentAuditLog).filter(
            PaymentAuditLog.payment_id == uuid.UUID(second_id),
            PaymentAuditLog.action == "approved",
        ).one()
        assert "plan_change=MONTHLY -> ANNUAL" in (audit.detail or "")
        db.close()

    def test_purchase_without_a_company_is_owned_by_the_account(self):
        db = TestingSessionLocal()
        member = _user(db, "nocompany@pay.com", None)
        admin = _admin(db, "admin-nocompany@nhaav.com")
        headers, admin_headers = _headers(member), _headers(admin)
        member_id = member.id
        db.close()

        client = TestClient(app)
        payment_id = _submit(client, headers, "MONTHLY", utr="UTR-NOCO-0001").json()["id"]
        assert _approve(client, admin_headers, payment_id).status_code == 200

        db = TestingSessionLocal()
        payment = db.query(Payment).filter(Payment.id == uuid.UUID(payment_id)).one()
        assert payment.owner_user_id == member_id
        assert payment.organization_id is None
        db.close()

    def test_expired_subscription_can_still_be_renewed_with_a_new_one(self):
        """A renewal after the previous subscription expired must activate."""
        db = TestingSessionLocal()
        org = _org(db, "Renew After Expiry Co")
        member = _user(db, "renewafter@pay.com", org)
        admin = _admin(db, "admin-renewafter@nhaav.com")
        headers, admin_headers = _headers(member), _headers(admin)
        old_sub, _old_pack = _activate(db, member, "MONTHLY")
        old_sub.expires_at = datetime.utcnow() - timedelta(seconds=1)
        db.commit()
        member_id = member.id
        db.close()

        client = TestClient(app)
        payment_id = _submit(client, headers, "ANNUAL", utr="UTR-RENEW-AFTER").json()["id"]
        approved = _approve(client, admin_headers, payment_id)
        assert approved.status_code == 200, approved.text
        assert approved.json()["subscription_status"] == "ACTIVE"
        assert approved.json()["total_passes"] == 100

        db = TestingSessionLocal()
        subs = db.query(Subscription).filter(Subscription.owner_user_id == member_id).all()
        active = [s for s in subs if s.status == SubscriptionStatus.ACTIVE]
        assert len(active) == 1 and active[0].plan.code == "ANNUAL"
        db.close()


# -------------------------- FIX 3: renewal access after subscription expiry
class TestExpiredAccountRenewal:
    """
    An account with NOTHING LEFT TO USE (subscription lapsed AND every pass
    spent or past its 40-day window) can still AUTHENTICATE and reach the
    payment/renewal flow — without regaining platform access until a new
    subscription is verified and activated.
    """

    def test_expired_account_renews_end_to_end_without_platform_access(self):
        db = TestingSessionLocal()
        org = _org(db, "Renewal Co")
        member = _user(db, "renew@pay.com", org)
        admin = _admin(db, "admin-renew@nhaav.com")
        subscription, _pack = _activate(db, member, "MONTHLY")
        subscription.expires_at = datetime.utcnow() - timedelta(seconds=1)
        db.commit()
        # No usable pass remains: the unused windows have closed.
        _use_up_every_pass(db, member)
        member_id, member_email = member.id, member.email
        admin_headers = _headers(admin)
        db.close()

        client = TestClient(app)

        # 1. Login SUCCEEDS but issues NO pass (renewal-only) and says why.
        login = client.post("/auth/login", json={"email": member_email, "password": "Password123!"})
        assert login.status_code == 200, login.text
        body = login.json()
        assert body["access_session"] is None
        assert body["access_blocked"] and "expired" in body["access_blocked"].lower()
        assert body["user"] and body["user"]["email"] == member_email
        headers = {"Authorization": f"Bearer {body['access_token']}"}

        # 2. Protected platform functionality is still refused.
        assert client.get("/auth/me", headers=headers).status_code == 401

        # 3. The renewal/payment flow IS reachable (identity-only endpoints).
        assert client.get("/subscription/status", headers=headers).status_code == 200
        assert client.get("/subscription/plans", headers=headers).status_code == 200
        assert client.get("/payments/instructions", headers=headers).status_code == 200
        assert client.get("/payments/my", headers=headers).status_code == 200

        # 4. The expired organization can submit a NEW payment.
        submitted = _submit(client, headers, "ANNUAL", utr="UTR-RENEW-0001")
        assert submitted.status_code == 201, submitted.text
        payment_id = submitted.json()["id"]

        # 5. Approval activates the new subscription and access pack.
        approved = _approve(client, admin_headers, payment_id)
        assert approved.status_code == 200, approved.text
        assert approved.json()["subscription_status"] == "ACTIVE"
        assert approved.json()["total_passes"] == 100

        db = TestingSessionLocal()
        subs = db.query(Subscription).filter(Subscription.owner_user_id == member_id).all()
        active = [s for s in subs if s.status == SubscriptionStatus.ACTIVE]
        assert len(active) == 1
        pack = db.query(AccessPack).filter(AccessPack.subscription_id == active[0].id).one()
        assert pack.token_count == 100
        assert pack.owner_user_id == member_id
        db.close()

        # 6. With a live subscription, a FRESH login allocates a pass again.
        relogin = client.post(
            "/auth/login", json={"email": member_email, "password": "Password123!"}
        )
        assert relogin.status_code == 200, relogin.text
        assert relogin.json()["access_session"] is not None
        assert relogin.json()["access_blocked"] is None

    def test_cross_account_renewal_access_is_impossible(self):
        db = TestingSessionLocal()
        org_a = _org(db, "Renewal Iso A")
        org_b = _org(db, "Renewal Iso B")
        a = _user(db, "renew-a@pay.com", org_a)
        b = _user(db, "renew-b@pay.com", org_b)
        sub_a, _pack_a = _activate(db, a, "MONTHLY")
        sub_a.expires_at = datetime.utcnow() - timedelta(seconds=1)
        _activate(db, b, "ANNUAL")  # B stays active
        a_headers, b_headers = _headers(a), _headers(b)
        db.close()

        client = TestClient(app)
        # Expired A submits a renewal payment...
        submitted = _submit(client, a_headers, "MONTHLY", utr="UTR-RISO-0001")
        assert submitted.status_code == 201
        a_payment_id = submitted.json()["id"]

        # ...and active B can neither see it in its list nor read its receipt.
        b_ids = [p["id"] for p in client.get("/payments/my", headers=b_headers).json()["data"]]
        assert a_payment_id not in b_ids
        assert client.get(
            f"/payments/{a_payment_id}/receipt", headers=b_headers
        ).status_code == 404

        # A's own list contains exactly its own payment.
        a_ids = [p["id"] for p in client.get("/payments/my", headers=a_headers).json()["data"]]
        assert a_ids == [a_payment_id]
