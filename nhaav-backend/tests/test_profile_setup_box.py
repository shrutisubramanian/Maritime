"""The account setup box: profile first, then payment, then review.

The box on the profile page walks a locked account through three stages and
must never skip one. These tests pin the server half of that contract — the
`profile_completed` / `profile_missing` fields of GET /access/onboarding and the
`next_step` ordering they drive:

  * a fresh account is asked for a company name, a contact with a phone number
    and a description BEFORE it is sent to billing, even if documents are in
  * saving those fields is what flips the stage — nothing is inferred locally
  * a partial profile reports exactly what is still missing
  * a vendor never sees a payment stage (no platform fee, no passes), only its
    documents and the admin review
"""
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base, get_db
from app.main import app
from app.models.document import Document, DocumentType
from app.models.profile import Profile, VerificationStatus
from app.models.user import User, UserRole
from app.utils.password import hash_password

SQLALCHEMY_DATABASE_URL = "sqlite:///./test_profile_setup_box.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

PASSWORD = "Password123!"
ALL_FIELDS = {"company_name", "contact_name", "contact_phone", "bio"}


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture(scope="module", autouse=True)
def setup_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    app.dependency_overrides[get_db] = override_get_db
    yield
    app.dependency_overrides.pop(get_db, None)
    Base.metadata.drop_all(bind=engine)


client = TestClient(app)


def _account(email: str, role: UserRole = UserRole.client) -> uuid.UUID:
    """A verified account with the empty profile registration provisions."""
    db = TestingSessionLocal()
    try:
        user = User(
            email=email,
            password_hash=hash_password(PASSWORD),
            role=role,
            full_name="Setup Box",
            is_verified=True,
        )
        db.add(user)
        db.flush()
        db.add(Profile(user_id=user.id))
        db.commit()
        return user.id
    finally:
        db.close()


def _headers(email: str) -> dict:
    resp = TestClient(app).post(
        "/auth/login", json={"email": email, "password": PASSWORD}
    )
    assert resp.status_code == 200, resp.text
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


def _state(email: str) -> dict:
    resp = client.get("/access/onboarding", headers=_headers(email))
    assert resp.status_code == 200, resp.text
    return resp.json()


def _add_document(email: str) -> None:
    db = TestingSessionLocal()
    try:
        user = db.query(User).filter(User.email == email).first()
        db.add(
            Document(
                user_id=user.id,
                document_type=DocumentType.cdc,
                file_url="https://storage.example.com/identity.pdf",
                name="Identity",
            )
        )
        db.commit()
    finally:
        db.close()


def _approve(email: str) -> None:
    db = TestingSessionLocal()
    try:
        user = db.query(User).filter(User.email == email).first()
        profile = db.query(Profile).filter(Profile.user_id == user.id).first()
        profile.verification_status = VerificationStatus.verified
        db.commit()
    finally:
        db.close()


def _save_profile(email: str, **fields):
    return client.put("/profiles/me", headers=_headers(email), json=fields)


COMPLETE_PROFILE = {
    "company_name": "Meridian Ship Management",
    "bio": "Technical management and procurement for bulk carriers.",
    "contacts": [{"name": "A. Menon", "phone": "+91 98765 43210"}],
}


def test_documents_alone_do_not_skip_the_profile_stage():
    """Uploading first must not move the account on to billing."""
    email = "box_docs_first@example.com"
    _account(email)
    _add_document(email)

    state = _state(email)
    assert state["documents_count"] == 1
    assert state["profile_completed"] is False
    assert set(state["profile_missing"]) == ALL_FIELDS
    assert state["payment_required"] is True
    # The client is asked for its profile, not its money.
    assert state["next_step"] == "complete_profile"


def test_saving_the_setup_fields_flips_the_stage_to_payment():
    email = "box_client@example.com"
    _account(email)
    _add_document(email)
    assert _state(email)["profile_completed"] is False

    saved = _save_profile(email, **COMPLETE_PROFILE)
    assert saved.status_code == 200, saved.text

    state = _state(email)
    assert state["profile_completed"] is True
    assert state["profile_missing"] == []
    # Profile in and documents in -> the fee is the only thing left before an
    # admin can approve (approval issues the passes the fee bought).
    assert state["next_step"] == "pay_subscription"
    assert state["marketplace_unlocked"] is False

    # The saved values are the ones the box collected.
    profile = client.get("/profiles/me", headers=_headers(email)).json()
    assert profile["company_name"] == COMPLETE_PROFILE["company_name"]
    assert profile["bio"] == COMPLETE_PROFILE["bio"]
    assert profile["contacts"][0]["phone"] == "+91 98765 43210"


def test_a_partial_profile_reports_exactly_what_is_missing():
    email = "box_partial@example.com"
    _account(email)
    _save_profile(email, company_name="Atlas Marine", contacts=[{"name": "R. Rao"}])

    state = _state(email)
    assert state["profile_completed"] is False
    assert set(state["profile_missing"]) == {"contact_phone", "bio"}
    assert state["next_step"] == "complete_profile"


def test_a_vendor_is_never_asked_for_a_platform_fee():
    email = "box_vendor@example.com"
    _account(email, role=UserRole.supplier)

    state = _state(email)
    assert state["profile_completed"] is False
    assert state["payment_required"] is False
    assert state["next_step"] == "complete_profile"

    assert _save_profile(email, **COMPLETE_PROFILE).status_code == 200
    state = _state(email)
    assert state["profile_completed"] is True
    # No fee and nothing uploaded yet: the reviewer still has nothing to read.
    assert state["payment_required"] is False
    assert state["next_step"] == "complete_profile"

    _add_document(email)
    state = _state(email)
    assert state["next_step"] == "awaiting_review"
    assert state["marketplace_unlocked"] is False

    _approve(email)
    assert _state(email)["marketplace_unlocked"] is True
