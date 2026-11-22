"""
Concurrency + state-machine regression tests.

H5 changed transaction/commit behavior across the request→quote→job
lifecycle, so these tests pin the race-prone seams:

  - duplicate quotation submission (application check + DB unique constraint)
  - double acceptance of the same quote (state machine, no duplicate job)
  - simultaneous acceptance of two competing quotes (only one can win)
  - duplicate profile creation (DB-level uq_profiles_user_id)
  - request status transitions guarded by the PUT state machine

Concurrency is exercised with real threads through the app; SQLite's
database-level write lock serializes writers, and the DB constraints +
state-machine checks make the outcomes deterministic.
"""
import threading
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.database import Base, get_db

SQLALCHEMY_DATABASE_URL = "sqlite:///./test_concurrency.db"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(scope="module", autouse=True)
def setup_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)

    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    yield
    Base.metadata.drop_all(bind=engine)
    app.dependency_overrides.pop(get_db, None)


client = TestClient(app)


def _onboard(email, role):
    """Put a freshly registered account past the onboarding gate.

    The gate requires a verified email and an admin-approved profile for
    everyone, plus an active platform subscription for clients. Tests that
    exercise the quote/job lifecycle start from an OPEN account, so the
    precondition is created directly in the database rather than walked through
    the payment flow (which has its own suites).
    """
    from datetime import datetime, timedelta

    from app.models.profile import Profile, VerificationStatus
    from app.models.subscription import Subscription, SubscriptionPlan, SubscriptionStatus
    from app.models.user import User

    db = TestingSessionLocal()
    try:
        user = db.query(User).filter(User.email == email).first()
        user.is_verified = True
        profile = db.query(Profile).filter(Profile.user_id == user.id).first()
        if profile is not None:
            profile.verification_status = VerificationStatus.verified
        if role == "client":
            plan = db.query(SubscriptionPlan).first()
            if plan is None:
                plan = SubscriptionPlan(
                    code="MONTHLY",
                    name="Monthly",
                    price_paise=100000,
                    duration_value=40,
                    duration_unit="DAY",
                    pass_count=10,
                )
                db.add(plan)
                db.commit()
                db.refresh(plan)
            now = datetime.utcnow()
            db.add(
                Subscription(
                    owner_user_id=user.id,
                    plan_id=plan.id,
                    status=SubscriptionStatus.ACTIVE,
                    starts_at=now,
                    expires_at=now + timedelta(days=40),
                )
            )
        db.commit()
    finally:
        db.close()


def _register_and_login(email, role):
    r = client.post(
        "/auth/register",
        json={
            "email": email,
            "password": "Password123!",
            "role": role,
            "full_name": email.split("@")[0],
        },
    )
    # register now returns 503 if the (patched) email send fails; both fine
    assert r.status_code in (201, 503), r.text

    # An account past registration but not yet verified is confined to its
    # profile by the onboarding gate; the quote/job flows need it open.
    _onboard(email, role)

    r = client.post("/auth/login", json={"email": email, "password": "Password123!"})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _make_client_and_providers():
    """One client + two verified providers with matching service listings.

    Emails are unique per call so multiple tests can build fresh fixtures.
    """
    suffix = uuid.uuid4().hex[:8]
    client_email = f"cclient_{suffix}@example.com"
    client_token = _register_and_login(client_email, "client")

    provider_tokens = {}
    for i in range(2):
        email = f"cprov{i}_{suffix}@example.com"
        token = _register_and_login(email, "provider")
        # Current user id (ProfileResponse does not expose user_id)
        me = client.get("/auth/me", headers=_auth(token)).json()
        user_id = me["id"]
        # Registration provisions the starter profile (onboarding design), so
        # fill it in rather than creating a second one.
        r = client.put(
            "/profiles/me",
            json={"position": "Engineer", "company_name": f"Prov {suffix} {i}"},
            headers=_auth(token),
        )
        assert r.status_code in (200, 201), r.text
        # Verify the profile directly in the DB (admin flow is tested elsewhere)
        from app.models.profile import Profile, VerificationStatus

        db = TestingSessionLocal()
        profile = (
            db.query(Profile).filter(Profile.user_id == uuid.UUID(user_id)).first()
        )
        profile.verification_status = VerificationStatus.verified
        db.commit()
        db.close()
        # Create the matching active service listing
        r = client.post(
            "/services/",
            json={
                "service_id": "hull_inspection",
                "port_id": "singapore",
                "name": "Hull Inspection",
                "category": "Inspection & Survey",
                "description": "x",
                "pricing_model": "Per Job",
            },
            headers=_auth(token),
        )
        assert r.status_code in (200, 201), r.text
        provider_tokens[email] = token

    return client_token, list(provider_tokens.values())


def _open_request(client_token, title):
    r = client.post(
        "/requests/",
        json={
            "title": title,
            "description": "concurrency test",
            "port": "singapore",
            "service_type": "hull_inspection",
            "urgency": "medium",
        },
        headers=_auth(client_token),
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


# ---------------------------------------------------------------------------
# 1. Duplicate quotation submission
# ---------------------------------------------------------------------------

def test_duplicate_quote_submission_rejected_sequential():
    client_token, (prov1, prov2) = _make_client_and_providers()
    request_id = _open_request(client_token, "Dup quote request")

    body = {
        "amount": 500.0,
        "currency": "USD",
        "estimated_duration": "3 days",
        "message": "first",
    }
    first = client.post(
        f"/quotes/?request_id={request_id}", json=body,
        headers=_auth(prov1),
    )
    assert first.status_code == 201, first.text

    second = client.post(
        f"/quotes/?request_id={request_id}", json=body,
        headers=_auth(prov1),
    )
    assert second.status_code == 400
    assert "already submitted" in second.json()["detail"].lower()


def test_duplicate_quote_race_between_two_threads():
    """Both workers hammer the endpoint; exactly one quote may be created."""
    client_token, (prov1, prov2) = _make_client_and_providers()
    request_id = _open_request(client_token, "Race dup quote")
    prov_token = prov2

    results = []

    def worker():
        r = client.post(
            f"/quotes/?request_id={request_id}",
            json={
                "amount": 750.0,
                "currency": "USD",
                "estimated_duration": "2 days",
                "message": "race",
            },
            headers=_auth(prov_token),
        )
        results.append(r.status_code)

    threads = [threading.Thread(target=worker) for _ in range(2)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert sorted(results) == [201, 400], (
        f"Exactly one submission must win; got {results}"
    )


# ---------------------------------------------------------------------------
# 2. Double acceptance / simultaneous acceptance
# ---------------------------------------------------------------------------

def _submit_quote(request_id, provider_token, amount):
    r = client.post(
        f"/quotes/?request_id={request_id}",
        json={
            "amount": amount,
            "currency": "USD",
            "estimated_duration": "2 days",
            "message": "quote",
        },
        headers=_auth(provider_token),
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


def test_double_acceptance_of_same_quote_rejected():
    client_token, (prov1, prov2) = _make_client_and_providers()
    request_id = _open_request(client_token, "Double accept")
    quote_id = _submit_quote(request_id, prov1, 300.0)

    first = client.put(f"/quotes/{quote_id}/accept", headers=_auth(client_token))
    assert first.status_code == 200, first.text

    second = client.put(f"/quotes/{quote_id}/accept", headers=_auth(client_token))
    assert second.status_code == 400
    assert "already accepted" in second.json()["detail"].lower()

    # And exactly one job exists for the request
    jobs = client.get("/jobs/", headers=_auth(client_token)).json()
    jobs_for_request = [j for j in jobs if j["request_id"] == request_id]
    assert len(jobs_for_request) == 1


def test_simultaneous_acceptance_of_two_competing_quotes():
    """Two threads accept different quotes at the same time; only one wins."""
    client_token, (prov1, prov2) = _make_client_and_providers()
    request_id = _open_request(client_token, "Race two accepts")
    q1 = _submit_quote(request_id, prov1, 100.0)
    q2 = _submit_quote(request_id, prov2, 200.0)

    results = []
    barrier = threading.Barrier(2)

    def worker(quote_id):
        barrier.wait()  # maximize contention
        r = client.put(f"/quotes/{quote_id}/accept", headers=_auth(client_token))
        results.append(r.status_code)

    t1 = threading.Thread(target=worker, args=(q1,))
    t2 = threading.Thread(target=worker, args=(q2,))
    t1.start()
    t2.start()
    t1.join()
    t2.join()

    assert sorted(results) == [200, 409], (
        f"Exactly one acceptance must succeed; got {results}"
    )
    # State machine consistency: request awarded, exactly one accepted quote,
    # exactly one job.
    detail = client.get(f"/requests/{request_id}").json()
    assert detail["status"] == "awarded"
    db = TestingSessionLocal()
    from app.models.quote import Quote
    from app.models.job import Job

    accepted = db.query(Quote).filter(Quote.request_id == uuid.UUID(request_id), Quote.status == "accepted").count()
    assert accepted == 1
    jobs = db.query(Job).filter(Job.request_id == uuid.UUID(request_id)).count()
    assert jobs == 1
    db.close()


# ---------------------------------------------------------------------------
# 3. Duplicate profile creation
# ---------------------------------------------------------------------------

def test_duplicate_profile_creation_rejected():
    # Registration already creates the starter profile, so a second create is
    # a duplicate by definition — the guard must reject it rather than add a row.
    token = _register_and_login("dupprof@example.com", "provider")
    r = client.post(
        "/profiles/",
        json={"position": "Engineer", "company_name": "Dup Co"},
        headers=_auth(token),
    )
    assert r.status_code == 400
    assert "already exists" in r.json()["detail"].lower()

    # And the starter profile is still the only one.
    from app.models.profile import Profile

    me = client.get("/auth/me", headers=_auth(token)).json()
    db = TestingSessionLocal()
    try:
        assert (
            db.query(Profile).filter(Profile.user_id == uuid.UUID(me["id"])).count()
            == 1
        )
    finally:
        db.close()


# ---------------------------------------------------------------------------
# 4. Request state transitions
# ---------------------------------------------------------------------------

def test_owner_can_cancel_open_request():
    client_token, _provs = _make_client_and_providers()
    request_id = _open_request(client_token, "Cancel me open")
    r = client.put(
        f"/requests/{request_id}",
        json={"status": "cancelled"},
        headers=_auth(client_token),
    )
    assert r.status_code == 200
    assert r.json()["status"] == "cancelled"


def test_owner_cannot_award_request_manually():
    client_token, _provs = _make_client_and_providers()
    request_id = _open_request(client_token, "No manual award")
    r = client.put(
        f"/requests/{request_id}",
        json={"status": "awarded"},
        headers=_auth(client_token),
    )
    assert r.status_code == 409


def test_cannot_cancel_awarded_request_via_put():
    client_token, (prov1, prov2) = _make_client_and_providers()
    request_id = _open_request(client_token, "Awarded not cancellable")
    qid = _submit_quote(request_id, prov1, 120.0)
    r = client.put(f"/quotes/{qid}/accept", headers=_auth(client_token))
    assert r.status_code == 200

    r = client.put(
        f"/requests/{request_id}",
        json={"status": "cancelled"},
        headers=_auth(client_token),
    )
    assert r.status_code == 409
    detail = client.get(f"/requests/{request_id}").json()
    assert detail["status"] == "awarded"


def test_cannot_submit_quote_to_cancelled_request():
    client_token, (prov1, prov2) = _make_client_and_providers()
    request_id = _open_request(client_token, "Closed to quotes")
    r = client.put(
        f"/requests/{request_id}",
        json={"status": "cancelled"},
        headers=_auth(client_token),
    )
    assert r.status_code == 200

    r = client.post(
        f"/quotes/?request_id={request_id}",
        json={
            "amount": 50.0,
            "currency": "USD",
            "estimated_duration": "1 day",
            "message": "too late",
        },
        headers=_auth(prov1),
    )
    assert r.status_code == 400
    assert "not open" in r.json()["detail"].lower()
