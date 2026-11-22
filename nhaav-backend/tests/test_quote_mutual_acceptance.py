"""Two-sided job acceptance and what the client is allowed to see.

The rule under test:

  * a client comparing quotes sees the JOB TITLE and the PRICE only — no
    company name, no provider id, no phone number;
  * accepting a quote does not reveal anything by itself;
  * when the PROVIDER accepts the awarded job, the client is notified and the
    provider's name and phone become visible.

Runs against its own SQLite file (the test_h9_* pattern), so it never touches
the working database.
"""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base, get_db
from app.main import app
from app.models.notification import Notification
from app.models.profile import Profile, VerificationStatus
from app.models.service import Service
from app.models.user import User, UserRole
from app.utils.password import hash_password
from entitlement_helpers import grant_subscription

SQLALCHEMY_DATABASE_URL = "sqlite:///./test_quote_mutual.db"
engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

PASSWORD = "Password123!"
CLIENT_EMAIL = "mutual_client@nhaav.com"
PROVIDER_EMAIL = "mutual_provider@nhaav.com"
RIVAL_EMAIL = "mutual_rival@nhaav.com"
PROVIDER_PHONE = "+911100000123"
COMPANY = "Northwind Marine Services"
SERVICE = "Hull Inspection"
PORT = "Port of Rotterdam"


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
    db = TestingSessionLocal()
    try:
        client_user = User(
            email=CLIENT_EMAIL,
            password_hash=hash_password(PASSWORD),
            role=UserRole.client,
            full_name="Mutual Client",
            phone="+911100000999",
            is_verified=True,
        )
        provider = User(
            email=PROVIDER_EMAIL,
            password_hash=hash_password(PASSWORD),
            role=UserRole.provider,
            full_name="Provider Contact",
            phone=PROVIDER_PHONE,
            is_verified=True,
        )
        rival = User(
            email=RIVAL_EMAIL,
            password_hash=hash_password(PASSWORD),
            role=UserRole.provider,
            full_name="Rival Provider",
            is_verified=True,
        )
        db.add_all([client_user, provider, rival])
        db.flush()

        db.add(
            Profile(
                user_id=client_user.id,
                verification_status=VerificationStatus.verified,
                company_name="Mutual Client Co",
            )
        )
        for u, name in ((provider, COMPANY), (rival, "Rival Marine Ltd")):
            db.add(
                Profile(
                    user_id=u.id,
                    verification_status=VerificationStatus.verified,
                    company_name=name,
                )
            )
            db.add(
                Service(
                    provider_id=u.id,
                    service_id=SERVICE,
                    port_id=PORT,
                    name=SERVICE,
                    category="Inspection & Survey",
                    description="Mutual acceptance listing",
                    pricing_model="Per Job",
                    is_active=True,
                )
            )
        db.commit()
        # A client's platform fee is part of the onboarding gate.
        grant_subscription(db, client_user)
    finally:
        db.close()
    yield
    app.dependency_overrides.pop(get_db, None)


def _login(client: TestClient, email: str) -> str:
    r = client.post("/auth/login", json={"email": email, "password": PASSWORD})
    assert r.status_code == 200, f"login failed for {email}: {r.text}"
    return r.json()["access_token"]


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _client_notifications() -> list[str]:
    db = TestingSessionLocal()
    try:
        user = db.query(User).filter(User.email == CLIENT_EMAIL).first()
        rows = (
            db.query(Notification)
            .filter(Notification.user_id == user.id)
            .order_by(Notification.created_at.asc())
            .all()
        )
        return [n.title or "" for n in rows]
    finally:
        db.close()


def test_offer_is_anonymous_until_the_provider_accepts():
    with TestClient(app) as client:
        client_tok = _login(client, CLIENT_EMAIL)
        provider_tok = _login(client, PROVIDER_EMAIL)
        rival_tok = _login(client, RIVAL_EMAIL)

        # 1. The client posts a job and the provider bids on it.
        r = client.post(
            "/requests/",
            headers=_auth(client_tok),
            json={
                "title": "Hull Inspection — MV Mutual Star",
                "service_type": SERVICE,
                "vessel_name": "MV Mutual Star",
                "port": PORT,
                "description": "Who sees what, and when.",
                "budget": 9000.0,
                "urgency": "medium",
            },
        )
        assert r.status_code in (200, 201), r.text
        request_id = r.json()["id"]

        r = client.post(
            f"/quotes/?request_id={request_id}",
            headers=_auth(provider_tok),
            json={"amount": 7200.0, "currency": "USD", "estimated_duration": "3 days"},
        )
        assert r.status_code == 201, r.text
        quote_id = r.json()["id"]

        # 2. The client sees price and title only — the bidder stays anonymous.
        r = client.get(
            f"/client/requests/{request_id}/quotations", headers=_auth(client_tok)
        )
        assert r.status_code == 200, r.text
        offers = r.json()
        assert len(offers) == 1
        offer = offers[0]
        assert offer["amount"] == 7200.0
        assert offer["provider"] is None, "no provider identity before mutual acceptance"
        assert offer["provider_id"] is None
        assert offer["provider_contact"] is None
        assert offer["contact_revealed"] is False
        assert offer["provider_label"] == "Offer 1"
        assert COMPANY not in str(offer)

        # Same rule on the sibling read the UI also uses.
        r = client.get(f"/quotes/request/{request_id}", headers=_auth(client_tok))
        assert r.status_code == 200, r.text
        assert r.json()[0]["provider"] is None
        assert r.json()[0]["provider_id"] is None

        # 3. A provider cannot accept a job the client has not awarded yet.
        early = client.patch(
            f"/quotes/{quote_id}/provider-accept", headers=_auth(provider_tok)
        )
        assert early.status_code == 400, early.text

        # 4. The client accepts — that awards the job but reveals nothing.
        accepted = client.patch(
            f"/client/quotations/{quote_id}/accept", headers=_auth(client_tok)
        )
        assert accepted.status_code == 200, accepted.text
        assert accepted.json()["status"] == "accepted"
        assert accepted.json()["contact_revealed"] is False
        assert accepted.json()["provider_id"] is None

        assert not any("accepted your job" in t.lower() for t in _client_notifications())

        # 5. Only the awarded provider may accept it.
        wrong = client.patch(
            f"/quotes/{quote_id}/provider-accept", headers=_auth(rival_tok)
        )
        assert wrong.status_code == 403, wrong.text

        # 6. The provider accepts the job -> client is notified.
        took = client.patch(
            f"/quotes/{quote_id}/provider-accept", headers=_auth(provider_tok)
        )
        assert took.status_code == 200, took.text
        assert took.json()["provider_accepted_at"] is not None

        notes = _client_notifications()
        assert any("provider accepted your job" in t.lower() for t in notes), notes

        # 7. Now the client sees who is doing the work, with the phone number.
        r = client.get(
            f"/client/requests/{request_id}/quotations", headers=_auth(client_tok)
        )
        revealed = r.json()[0]
        assert revealed["contact_revealed"] is True
        assert revealed["provider"]["company_name"] == COMPANY
        assert revealed["provider_contact"]["name"] == COMPANY
        assert revealed["provider_contact"]["phone"] == PROVIDER_PHONE
        assert revealed["provider_id"] is not None

        # 8. Idempotent: accepting again neither fails nor spams the client.
        again = client.patch(
            f"/quotes/{quote_id}/provider-accept", headers=_auth(provider_tok)
        )
        assert again.status_code == 200, again.text
        repeats = [t for t in _client_notifications() if "accepted your job" in t.lower()]
        assert len(repeats) == 1, repeats
