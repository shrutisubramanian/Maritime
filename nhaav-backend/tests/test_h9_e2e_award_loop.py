"""
H9 Phase 4k — Two-account end-to-end award-loop contract test.

Drives the REAL HTTP API surface through FastAPI's TestClient with two
independently-authenticated accounts (client and provider) plus a second
competing provider, exercising the complete business loop:

    client posts request -> verified providers quote -> client accepts ->
    request awarded + Job created + competitor rejected + notifications fan-out
    -> provider-side visibility (/quotes/my-quotations, /jobs)

Predecessors: test_h9_procurement_contract.py pinned the frontend wiring for
this loop; test_h9_shipowner_admin_contract.py pinned honest rendering. This
module pins the live behavior itself, including the invariants introduced by
the H9 honesty work: amounts come back as real numbers (no undefined/eta
fabrication surface), and the award decision belongs to the request owner.

Runs against a dedicated SQLite file (the test_h9_* pattern), so it neither
touches nhaav.db nor the demo seeds.
"""
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.database import Base, get_db
from app.models.user import User, UserRole
from app.models.profile import Profile, VerificationStatus
from app.models.service import Service
from app.utils.password import hash_password
from entitlement_helpers import grant_subscription

SQLALCHEMY_DATABASE_URL = "sqlite:///./test_h9_e2e_award.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

PASSWORD = "Password123!"
CLIENT_EMAIL = "h9_e2e_client@nhaav.com"
PROVIDER_A_EMAIL = "h9_e2e_provider_a@nhaav.com"
PROVIDER_B_EMAIL = "h9_e2e_provider_b@nhaav.com"

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
        client_user = User(email=CLIENT_EMAIL, password_hash=hash_password(PASSWORD),
                           role=UserRole.client, full_name="E2E Client", is_verified=True)
        pa = User(email=PROVIDER_A_EMAIL, password_hash=hash_password(PASSWORD),
                  role=UserRole.provider, full_name="E2E Provider A", is_verified=True)
        pb = User(email=PROVIDER_B_EMAIL, password_hash=hash_password(PASSWORD),
                  role=UserRole.provider, full_name="E2E Provider B", is_verified=True)
        db.add_all([client_user, pa, pb])
        db.flush()

        # Admin-approved profile for the client too: the requests/quotes/jobs
        # gate refuses accounts whose verification is not approved.
        db.add(Profile(user_id=client_user.id,
                       verification_status=VerificationStatus.verified,
                       company_name="E2E Client Co"))

        # Verified profiles (create_quote rejects unverified providers) and
        # active listings matching the request's service_type/port.
        for u in (pa, pb):
            db.add(Profile(user_id=u.id,
                           verification_status=VerificationStatus.verified,
                           company_name=f"{u.full_name} Co"))
            db.add(Service(provider_id=u.id, service_id=SERVICE, port_id=PORT,
                           name=SERVICE, category="Inspection & Survey",
                           description="E2E listing", pricing_model="Per Job",
                           is_active=True))
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


def _verified_provider(db, email: str) -> User:
    u = db.query(User).filter(User.email == email).first()
    assert u is not None and u.role == UserRole.provider
    p = db.query(Profile).filter(Profile.user_id == u.id).first()
    assert p is not None and p.verification_status == VerificationStatus.verified
    return u


class TestTwoAccountAwardLoop:
    def test_full_award_loop_two_accounts(self):
        with TestClient(app) as client:
            # -- Account A: the client --
            client_tok = _login(client, CLIENT_EMAIL)

            # -- Account B: provider A quotes only after the request exists --
            prov_a_tok = _login(client, PROVIDER_A_EMAIL)

            # 1. Client creates a procurement request (JWT-derived ownership).
            r = client.post("/requests/", headers=_auth(client_tok), json={
                "title": "E2E Hull Inspection — MV Test Star",
                "service_type": SERVICE,
                "vessel_name": "MV Test Star",
                "port": PORT,
                "description": "Two-account E2E: request -> quotes -> award.",
                "budget": 9000.0,
                "urgency": "medium",
            })
            assert r.status_code == 201, r.text
            req = r.json()
            request_id = req["id"]
            assert req["status"] == "open"
            assert req["service_type"] == SERVICE

            # 2. Public browse shows the open request (marketplace surface).
            r = client.get("/requests/", params={"port": PORT})
            assert r.status_code == 200
            listing = r.json()
            assert listing["total"] >= 1
            assert any(row["id"] == request_id for row in listing["data"])

            # 3. Provider A submits a real quote through the API.
            r = client.post("/quotes/", headers=_auth(prov_a_tok),
                            params={"request_id": request_id},
                            json={
                                "amount": 8200.0,
                                "currency": "USD",
                                "quotation_reference": "E2E-Q-A1",
                                "pricing_model": "Fixed Price",
                                "message": "E2E quote from provider A.",
                                "scope_of_work": "Underwater hull inspection.",
                                "estimated_duration": "2 days",
                                "warranty_period": "90 days",
                                "payment_terms": "Net 30",
                                "taxes_included": True,
                            })
            assert r.status_code == 201, r.text
            quote_a = r.json()
            assert quote_a["status"] == "submitted"
            assert isinstance(quote_a["amount"], (int, float))
            assert quote_a["amount"] == 8200.0
            assert quote_a["currency"] == "USD"
            # The H9 honesty surface: QuoteResponse carries amount/currency/
            # quotation_reference — there is no price/eta field to mis-map.
            assert "price" not in quote_a and "eta" not in quote_a

            # 4. Request flipped open -> quoted.
            r = client.get(f"/requests/{request_id}", headers=_auth(client_tok))
            assert r.status_code == 200
            assert r.json()["status"] == "quoted"

            # 5. Provider B quotes too — the loop supports competition.
            prov_b_tok = _login(client, PROVIDER_B_EMAIL)
            r = client.post("/quotes/", headers=_auth(prov_b_tok),
                            params={"request_id": request_id},
                            json={
                                "amount": 8900.0,
                                "currency": "USD",
                                "quotation_reference": "E2E-Q-B1",
                                "pricing_model": "Fixed Price",
                                "message": "E2E quote from provider B.",
                                "taxes_included": False,
                            })
            assert r.status_code == 201, r.text

            # 6. Owner-only decision point: a non-owner cannot accept.
            #    (provider B lacks a listing only if we had not given one —
            #    authorization here is ownership, not eligibility.)
            r = client.put(f"/quotes/{quote_a['id']}/accept", headers=_auth(prov_b_tok))
            assert r.status_code == 403, r.text

            # 7. The client accepts provider A's quote.
            r = client.put(f"/quotes/{quote_a['id']}/accept", headers=_auth(client_tok))
            assert r.status_code == 200, r.text
            accepted = r.json()
            assert accepted["status"] == "accepted"

            # 8. Request awarded; selected quotation recorded.
            r = client.get(f"/requests/{request_id}", headers=_auth(client_tok))
            assert r.status_code == 200
            body = r.json()
            assert body["status"] == "awarded"
            assert body["selected_quotation_id"] == quote_a["id"]

            # 9. Competing quote was bulk-rejected.
            r = client.get(f"/quotes/request/{request_id}", headers=_auth(client_tok))
            assert r.status_code == 200
            quotes = r.json()
            by_ref = {q["quotation_reference"]: q["status"] for q in quotes}
            assert by_ref["E2E-Q-A1"] == "accepted"
            assert by_ref["E2E-Q-B1"] == "rejected"

            # 10. A Job was created from the accepted quote.
            r = client.get("/jobs/", headers=_auth(client_tok))
            assert r.status_code == 200
            jobs = r.json()
            assert len(jobs) == 1
            job = jobs[0]
            assert str(job["quote_id"]) == str(quote_a["id"])
            assert job["status"] == "active"

            # 11. Provider-side visibility: provider A sees the accepted quote
            #     and the job; provider B sees the rejection.
            r = client.get("/quotes/my-quotations", headers=_auth(prov_a_tok))
            assert r.status_code == 200
            mine = r.json()
            mine_ref = {q["quotation_reference"]: q["status"] for q in mine}
            assert mine_ref.get("E2E-Q-A1") == "accepted"
            r = client.get("/jobs/", headers=_auth(prov_a_tok))
            assert r.status_code == 200
            assert any(str(j["quote_id"]) == str(quote_a["id"]) for j in r.json())
            r = client.get("/quotes/my-quotations", headers=_auth(prov_b_tok))
            assert r.status_code == 200
            theirs = {q["quotation_reference"]: q["status"] for q in r.json()}
            assert theirs.get("E2E-Q-B1") == "rejected"

            # 12. Notifications fanned out to both providers.
            db = TestingSessionLocal()
            try:
                pa = _verified_provider(db, PROVIDER_A_EMAIL)
                pb = _verified_provider(db, PROVIDER_B_EMAIL)
                from app.models.notification import Notification
                pa_notes = db.query(Notification).filter(Notification.user_id == pa.id).all()
                pb_notes = db.query(Notification).filter(Notification.user_id == pb.id).all()
                assert any("accepted" in (n.title or "").lower() for n in pa_notes)
                assert any("rejected" in (n.title or "").lower() for n in pb_notes)
            finally:
                db.close()

    def test_award_is_single_shot(self):
        """A second accept attempt on the same request must fail cleanly."""
        with TestClient(app) as client:
            client_tok = _login(client, CLIENT_EMAIL)
            prov_b_tok = _login(client, PROVIDER_B_EMAIL)

            r = client.post("/requests/", headers=_auth(client_tok), json={
                "title": "E2E Single-shot Award",
                "service_type": SERVICE,
                "port": PORT,
                "urgency": "low",
            })
            assert r.status_code == 201
            request_id = r.json()["id"]

            r = client.post("/quotes/", headers=_auth(prov_b_tok),
                            params={"request_id": request_id},
                            json={"amount": 7000.0, "currency": "USD",
                                  "quotation_reference": "E2E-Q-B2",
                                  "pricing_model": "Fixed Price"})
            assert r.status_code == 201, r.text
            quote_b = r.json()

            r = client.put(f"/quotes/{quote_b['id']}/accept", headers=_auth(client_tok))
            assert r.status_code == 200
            assert r.json()["status"] == "accepted"

            # A second acceptance of the same quote is rejected by the state machine.
            r = client.put(f"/quotes/{quote_b['id']}/accept", headers=_auth(client_tok))
            assert r.status_code == 400

            # A different quote on the same (now awarded) request is closed to
            # new quotes and cannot revive the award.
            r = client.post("/quotes/", headers=_auth(prov_b_tok),
                            params={"request_id": request_id},
                            json={"amount": 7100.0, "currency": "USD",
                                  "quotation_reference": "E2E-Q-B3"})
            assert r.status_code == 400  # request no longer open/quoted
