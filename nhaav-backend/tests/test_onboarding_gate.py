"""End-to-end proof of the marketplace onboarding gate.

Walks ONE account through the whole product flow described in the spec:

    1. register                      -> email unverified, marketplace locked
    2. GET /access/onboarding        -> next_step "verify_email"
    3. GET /marketplace/...          -> 403 onboarding_incomplete (never data)
    4. click the emailed Continue    -> POST /auth/verify-email 200
    5. upload identity/company docs  -> still "complete_profile" (profile blank)
    5b. PUT /profiles/me            -> next_step "pay_subscription"
    6. approve with no payment      -> 409 payment_required (passes not free)
    7. client submits the bank transfer -> queue row shows documents + payment
    8. admin approves               -> verified, payment verified, 10 passes, 200

The point of the test is the CLIENT rule: an account is only approvable — and
only usable — when its paperwork AND its payment are both in, and that single
approval issues the passes the payment bought. A client with an approved
profile but no paid fee stays locked, which is what step 6 and the assertions
around it prove.

Email goes to a recorder (registration no longer prints a token anywhere).
"""
import re

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.database import Base, get_db
from app.models.document import Document, DocumentType
from app.models.profile import Profile, VerificationStatus
from app.models.user import User, UserRole
from app.utils.password import hash_password

SQLALCHEMY_DATABASE_URL = "sqlite:///./test_onboarding_gate.db"
engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

CLIENT_EMAIL = "gate_client@example.com"
CLIENT_PASSWORD = "Password123!"
ADMIN_EMAIL = "gate_admin@nhaavmaritime.com"
ADMIN_PASSWORD = "Admin@123"


@pytest.fixture(scope="module", autouse=True)
def _isolated_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)

    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    previous = app.dependency_overrides.get(get_db)
    app.dependency_overrides[get_db] = override_get_db
    yield
    Base.metadata.drop_all(bind=engine)
    if previous is None:
        app.dependency_overrides.pop(get_db, None)
    else:
        app.dependency_overrides[get_db] = previous


client = TestClient(app)


class _RecordingBackend:
    def __init__(self):
        self.sent = []

    def send(self, to_email, subject, body):
        self.sent.append({"to": to_email, "subject": subject, "body": body})


@pytest.fixture()
def mailbox(monkeypatch):
    backend = _RecordingBackend()
    monkeypatch.setattr(
        "app.services.email_service.get_email_backend", lambda: backend
    )
    return backend


def _verify_token(mailbox) -> str:
    body = mailbox.sent[-1]["body"]
    match = re.search(r"verify_token=([^\s&\"']+)", body)
    assert match, f"no verification link in the delivered email: {body!r}"
    return match.group(1)


def _client_headers() -> dict:
    resp = client.post(
        "/auth/login", json={"email": CLIENT_EMAIL, "password": CLIENT_PASSWORD}
    )
    assert resp.status_code == 200, resp.text
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


def _state(headers) -> dict:
    resp = client.get("/access/onboarding", headers=headers)
    assert resp.status_code == 200, resp.text
    return resp.json()


def _seed_admin() -> None:
    db = TestingSessionLocal()
    try:
        admin = db.query(User).filter(User.email == ADMIN_EMAIL).first()
        if admin is None:
            db.add(
                User(
                    email=ADMIN_EMAIL,
                    password_hash=hash_password(ADMIN_PASSWORD),
                    role=UserRole.admin,
                    full_name="Gate Admin",
                    is_verified=True,
                )
            )
            db.commit()
    finally:
        db.close()


def test_onboarding_gate_end_to_end(mailbox):
    _seed_admin()

    # ── 1. Register ──────────────────────────────────────────────────────────
    resp = client.post(
        "/auth/register",
        json={
            "email": CLIENT_EMAIL,
            "password": CLIENT_PASSWORD,
            "role": "client",
            "full_name": "Gate Client",
        },
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["is_verified"] is False

    headers = _client_headers()

    # ── 2. Locked, and it says why ───────────────────────────────────────────
    state = _state(headers)
    assert state["marketplace_unlocked"] is False
    assert state["next_step"] == "verify_email"
    assert state["locked_home"] == "/profile"

    # ── 3. Marketplace refuses data, not just the UI ─────────────────────────
    locked = client.get("/marketplace/category-groups", headers=headers)
    assert locked.status_code == 403
    assert locked.json()["detail"]["code"] == "onboarding_incomplete"
    assert locked.json()["detail"]["next_step"] == "verify_email"

    # Same gate on the procurement/job surfaces, not just the catalogue.
    jobs_locked = client.get("/jobs/", headers=headers)
    assert jobs_locked.status_code == 403, jobs_locked.text
    assert jobs_locked.json()["detail"]["code"] == "onboarding_incomplete"

    # Anonymous callers have no business there at all. The shared TestClient
    # holds a session COOKIE from the login above, so clear it first — a request
    # with no cookie and no header is the only truly anonymous one.
    client.cookies.clear()
    anonymous = client.get("/marketplace/category-groups")
    assert anonymous.status_code == 401

    # ── 4. Click "Continue" in the email ─────────────────────────────────────
    resp = client.post(
        "/auth/verify-email", json={"token": _verify_token(mailbox)}
    )
    assert resp.status_code == 200, resp.text

    state = _state(headers)
    assert state["email_verified"] is True
    # The setup box asks for the account's own details FIRST, so the state says
    # exactly what is still missing rather than sending it straight to billing.
    assert state["profile_completed"] is False
    assert "company_name" in state["profile_missing"]
    assert "contact_phone" in state["profile_missing"]
    assert state["next_step"] == "complete_profile"  # nothing uploaded yet

    # ── 5. Upload identity/company documents ─────────────────────────────────
    # Registration already provisioned the profile (pending), so the admin has
    # a reviewable row from the first login; uploading documents is what moves
    # the account into the review queue.
    db = TestingSessionLocal()
    try:
        user = db.query(User).filter(User.email == CLIENT_EMAIL).first()
        profile = db.query(Profile).filter(Profile.user_id == user.id).first()
        assert profile is not None, "registration must provision a profile"
        assert profile.verification_status == VerificationStatus.pending
        db.add(
            Document(
                user_id=user.id,
                document_type=DocumentType.cdc,
                file_url="https://storage.example.com/identity.pdf",
                name="Identity",
            )
        )
        db.commit()
        profile_id = str(profile.id)
    finally:
        db.close()

    state = _state(headers)
    assert state["documents_count"] == 1
    assert state["verification_approved"] is False
    # Documents alone do not stand in for the profile: with the profile blank the
    # account is still on step 1, even though something has been uploaded.
    assert state["profile_completed"] is False
    assert state["next_step"] == "complete_profile"

    # ── 5b. Complete the profile (the big box, step 1) ───────────────────────
    completed = client.put(
        "/profiles/me",
        headers=headers,
        json={
            "company_name": "Meridian Ship Management",
            "bio": "Ship management and technical procurement for bulk carriers.",
            "contacts": [{"name": "Gate Client", "phone": "+91 98765 43210"}],
        },
    )
    assert completed.status_code == 200, completed.text

    state = _state(headers)
    assert state["profile_completed"] is True
    assert state["profile_missing"] == []
    assert state["verification_approved"] is False
    # CLIENT FLOW: profile/documents done, fee still unpaid -> paying is next.
    assert state["payment_required"] is True
    assert state["payment_submitted"] is False
    assert state["next_step"] == "pay_subscription"

    # The admin can actually SEE this client in the review queue — the whole
    # point of covering every role (a client nobody can review is locked out
    # forever).
    admin = client.post(
        "/admin/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
    )
    assert admin.status_code == 200, admin.text
    admin_headers = {"Authorization": f"Bearer {admin.json()['access_token']}"}
    queue = client.get("/admin/verification/providers", headers=admin_headers)
    assert queue.status_code == 200, queue.text
    listed = [row for row in queue.json()["data"] if row["email"] == CLIENT_EMAIL]
    assert listed, "the client account must appear in the admin review queue"
    assert listed[0]["role"] == "client"

    # ── 6. Paperwork but no payment -> approval is REFUSED ───────────────────
    # CLIENT RULE: approving issues the purchased passes, so the admin may not
    # clear the account before the bank transfer exists.
    too_early = client.post(
        f"/admin/verification/providers/{profile_id}/action",
        json={"action": "approve", "reason": "Gate test approval"},
        headers=admin_headers,
    )
    assert too_early.status_code == 409, too_early.text
    assert too_early.json()["detail"]["code"] == "payment_required"

    state = _state(headers)
    assert state["verification_approved"] is False
    assert state["marketplace_unlocked"] is False

    # ── 7. The client submits the bank transfer ──────────────────────────────
    submitted = client.post(
        "/payments/submit",
        headers=headers,
        data={
            "plan_code": "MONTHLY",
            "utr": "UTR-GATE-0001",
            "payment_date": "2026-10-20",
            "amount_paise": "118000",
        },
        files={"receipt": ("receipt.pdf", b"%PDF-1.4 paid", "application/pdf")},
    )
    assert submitted.status_code == 201, submitted.text

    # Submitted but not yet verified by an admin: still no access, and the
    # client is told the wait is the review, not another payment.
    state = _state(headers)
    assert state["payment_submitted"] is True
    assert state["subscription_active"] is False
    assert state["marketplace_unlocked"] is False
    assert state["next_step"] == "awaiting_review"

    # The admin now sees WHO paid AND WHAT they uploaded — the queue row is the
    # approval surface, so it must carry both.
    queue = client.get("/admin/verification/providers", headers=admin_headers)
    assert queue.status_code == 200, queue.text
    row = [r for r in queue.json()["data"] if r["email"] == CLIENT_EMAIL][0]
    assert row["documents_submitted"] is True
    assert row["payment"] is not None and row["payment"]["utr"] == "UTR-GATE-0001"
    assert row["payment"]["plan_code"] == "MONTHLY"
    assert row["ready_for_approval"] is True

    only_ready = client.get(
        "/admin/verification/providers", params={"ready_only": "true"}, headers=admin_headers
    )
    assert only_ready.status_code == 200, only_ready.text
    assert [r["email"] for r in only_ready.json()["data"]] == [CLIENT_EMAIL]

    # ── 8. One approval: verified + payment activated + passes issued ────────
    approved = client.post(
        f"/admin/verification/providers/{profile_id}/action",
        json={"action": "approve", "reason": "Gate test approval"},
        headers=admin_headers,
    )
    assert approved.status_code == 200, approved.text
    assert approved.json()["passes_granted"] == 10, approved.text

    # A second approve cannot re-issue passes (the payment is already consumed);
    # it says so instead of claiming no payment is waiting.
    again = client.post(
        f"/admin/verification/providers/{profile_id}/action",
        json={"action": "approve"},
        headers=admin_headers,
    )
    assert again.status_code == 409, again.text
    assert again.json()["detail"]["code"] == "already_approved"

    state = _state(headers)
    assert state["verification_approved"] is True
    assert state["subscription_active"] is True
    assert state["marketplace_unlocked"] is True
    assert state["next_step"] == "done"

    # Activation starts pass enforcement: the session that began BEFORE the
    # passes existed carries none, so the client signs in again to start one.
    headers = _client_headers()

    opened = client.get("/marketplace/category-groups", headers=headers)
    assert opened.status_code == 200, opened.text

    jobs_opened = client.get("/jobs/", headers=headers)
    assert jobs_opened.status_code == 200, jobs_opened.text

    # The passes came from the payment the admin verified in the same action.
    passes = client.get("/subscription/status", headers=headers)
    assert passes.status_code == 200, passes.text
    assert passes.json()["passes"]["total"] == 10
