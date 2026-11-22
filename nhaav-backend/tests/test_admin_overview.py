"""Admin operational surface: overview, account follow-up, procurement oversight.

These tests pin the properties that matter operationally:

* the numbers come from rows (no demo data), and an empty database is valid;
* every endpoint refuses a non-admin token at the server, not just the UI;
* every account lands in exactly ONE onboarding stage, so stage counts are not
  double-counted and always add up to the account total;
* procurement oversight is read-only and never leaks credentials or receipts.
"""
import uuid
from datetime import datetime, timedelta

import pytest
from fastapi.testclient import TestClient
import jwt
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.config import settings
from app.database import Base, get_db
from app.main import app
from app.models.payment import Payment, PaymentStatus
from app.models.payment_audit import PaymentAuditLog
from app.models.profile import Profile, VerificationStatus
from app.models.profile_visibility import (
    ProfileVisibility,
    ProfileVisibilityPlan,
    ProfileVisibilityStatus,
)
from app.models.quote import Quote, QuoteStatus
from app.models.request import RequestStatus, RequestType, ServiceRequest
from app.models.service import Service, ServiceListingStatus
from app.models.subscription import BillingPeriod, SubscriptionPlan
from app.models.user import User, UserRole

SQLALCHEMY_DATABASE_URL = "sqlite:///./test_admin_overview.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


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
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture(autouse=True)
def _pin_app_db():
    prev = app.dependency_overrides.get(get_db)
    app.dependency_overrides[get_db] = override_get_db
    yield
    if prev is not None:
        app.dependency_overrides[get_db] = prev


@pytest.fixture(scope="module")
def api():
    return TestClient(app)


def _token(user: User) -> dict:
    tok = jwt.encode({"sub": str(user.id)}, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)
    return {"Authorization": f"Bearer {tok}"}


def _make_user(db, role, *, verified=True, email=None):
    user = User(
        email=email or f"{uuid.uuid4().hex[:8]}@nhaav.test",
        password_hash="x",
        role=role,
        full_name="Test Person",
        phone="+91 90000 00000",
        is_verified=verified,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _make_profile(db, user, company, status=VerificationStatus.verified):
    profile = Profile(
        user_id=user.id,
        company_name=company,
        verification_status=status,
        country="India",
        bio="",
    )
    db.add(profile)
    db.commit()
    db.refresh(profile)
    return profile


def _make_visibility(db, profile, user, status, expires_at):
    row = ProfileVisibility(
        profile_id=profile.id,
        owner_user_id=user.id,
        plan=ProfileVisibilityPlan.monthly,
        period_days=30,
        base_amount_paise=100000,
        gst_rate_percent=18,
        gst_amount_paise=18000,
        total_amount_paise=118000,
        currency="INR",
        utr=f"UTR{uuid.uuid4().hex[:10]}",
        payment_date=datetime.utcnow(),
        receipt_path="/private/receipts/x.pdf",
        receipt_filename="receipt.pdf",
        status=status,
        expires_at=expires_at,
    )
    db.add(row)
    db.commit()
    return row


@pytest.fixture(scope="module", autouse=True)
def seed(setup_db):
    """A small, realistic platform: 3 clients, 2 providers, 1 supplier, 1 admin."""
    db = TestingSessionLocal()
    try:
        now = datetime.utcnow()
        admin = _make_user(db, UserRole.admin, email="admin@nhaav.test")

        client_a = _make_user(db, UserRole.client, email="ops@alpha-shipping.test")
        _make_profile(db, client_a, "Alpha Shipping")
        client_b = _make_user(db, UserRole.client, verified=False, email="b@beta.test")
        _make_profile(db, client_b, "Beta Logistics", VerificationStatus.pending)
        client_c = _make_user(db, UserRole.client, email="c@gamma.test")
        _make_profile(db, client_c, "Gamma Marine", VerificationStatus.pending)

        provider_p = _make_user(db, UserRole.provider, email="p@delta.test")
        provider_profile = _make_profile(db, provider_p, "Delta Services")
        provider_q = _make_user(db, UserRole.provider, email="q@epsilon.test")
        provider_q_profile = _make_profile(db, provider_q, "Epsilon Engineering")

        supplier = _make_user(db, UserRole.supplier, email="s@zeta.test")
        _make_profile(db, supplier, "Zeta Supplies")

        # Visibility: one live entitlement, one expired, one never purchased.
        _make_visibility(
            db, provider_profile, provider_p,
            ProfileVisibilityStatus.VERIFIED, now + timedelta(days=20),
        )
        _make_visibility(
            db, provider_q_profile, provider_q,
            ProfileVisibilityStatus.VERIFIED, now - timedelta(days=1),
        )

        # The supplier still runs a legacy paid LISTING window, which is a real
        # entitlement even though it is not a profile visibility row.
        db.add(
            Service(
                provider_id=supplier.id,
                name="Legacy listing",
                category="Hull Inspection",
                is_active=True,
                status=ServiceListingStatus.approved,
                expires_at=now + timedelta(days=10),
            )
        )

        # One pending bank transfer awaiting admin review.
        plan = SubscriptionPlan(
            code="MONTHLY",
            name="Monthly",
            price_paise=100000,
            currency="INR",
            duration_value=40,
            duration_unit=BillingPeriod.DAY,
            pass_count=10,
        )
        db.add(plan)
        db.commit()
        db.refresh(plan)
        payment = Payment(
            owner_user_id=client_a.id,
            plan_id=plan.id,
            amount_paise=118000,
            currency="INR",
            utr="UTRADMIN0001",
            payment_date=now,
            receipt_path="/private/receipts/p.pdf",
            receipt_filename="p.pdf",
            status=PaymentStatus.SUBMITTED,
            submitted_at=now,
        )
        db.add(payment)
        db.commit()
        db.refresh(payment)
        db.add(
            PaymentAuditLog(
                payment_id=payment.id,
                actor_id=client_a.id,
                actor_role="organization",
                action="submitted",
            )
        )

        # Procurement: one open request carrying two live quotes, one cancelled.
        request = ServiceRequest(
            client_id=client_a.id,
            title="Hull inspection at JNPT",
            request_type=RequestType.service,
            service_type="Hull Inspection",
            port="JNPT",
            status=RequestStatus.open,
            quantity=1,
        )
        db.add(request)
        db.add(
            ServiceRequest(
                client_id=client_b.id,
                title="Cancelled paint job",
                request_type=RequestType.service,
                service_type="Painting",
                port="Mumbai",
                status=RequestStatus.cancelled,
            )
        )
        db.commit()
        db.refresh(request)
        for provider in (provider_p, provider_q):
            db.add(
                Quote(
                    request_id=request.id,
                    provider_id=provider.id,
                    amount=15000.0,
                    currency="INR",
                    status=QuoteStatus.submitted,
                )
            )
        db.commit()

        yield {"admin": admin, "client_a": client_a, "request": request, "payment": payment}
    finally:
        db.close()


# ------------------------------------------------------------------ auth gate
def test_every_admin_endpoint_rejects_non_admin(api, seed):
    headers = _token(seed["client_a"])
    rid = seed["request"].id
    for path in (
        "/admin/overview",
        "/admin/accounts",
        "/admin/procurement/requests",
        f"/admin/procurement/requests/{rid}",
        "/admin/procurement/summary",
    ):
        response = api.get(path, headers=headers)
        assert response.status_code == 403, path


def test_anonymous_is_refused(api):
    assert api.get("/admin/overview").status_code in (401, 403)


# ------------------------------------------------------------------- overview
def test_overview_counts_match_rows(api, seed):
    response = api.get("/admin/overview", headers=_token(seed["admin"]))
    assert response.status_code == 200
    body = response.json()

    accounts = body["accounts"]
    assert accounts["total"] == 6            # admin is staff, never counted
    assert accounts["clients"] == 3
    assert accounts["providers"] == 2
    assert accounts["suppliers"] == 1
    assert accounts["vendors"] == 3
    assert accounts["registered_last_30_days"] == 6

    assert body["verification"] == {"pending": 2, "verified": 4, "rejected": 0}
    assert body["payments"]["awaiting_review"] == 1
    assert body["visibility"] == {"active": 1, "expired": 1, "awaiting_review": 0}
    assert body["procurement"] == {"requests_total": 2, "requests_open": 1, "quotes_live": 2}

    series = accounts["registrations_series"]
    assert len(series) == 14
    assert sum(point["count"] for point in series) == 6
    assert all("date" in point for point in series)

    assert len(body["recent_registrations"]) == 6
    assert any(action["source"] == "payment" for action in body["recent_admin_actions"])


def test_overview_empty_database(api):
    mem = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=mem)
    EmptySession = sessionmaker(autocommit=False, autoflush=False, bind=mem)

    def empty_db():
        db = EmptySession()
        try:
            yield db
        finally:
            db.close()

    prev = app.dependency_overrides.get(get_db)
    app.dependency_overrides[get_db] = empty_db
    try:
        admin = User(
            email="empty-admin@nhaav.test",
            password_hash="x",
            role=UserRole.admin,
            full_name="Admin",
            phone="+91 90000 00000",
            is_verified=True,
        )
        bootstrap = EmptySession()
        bootstrap.add(admin)
        bootstrap.commit()
        admin_id = admin.id  # read before close: the instance is detached after
        bootstrap.close()
        tok = jwt.encode(
            {"sub": str(admin_id)}, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM
        )
        headers = {"Authorization": f"Bearer {tok}"}

        overview = api.get("/admin/overview", headers=headers)
        assert overview.status_code == 200
        body = overview.json()
        assert body["accounts"]["total"] == 0
        assert body["accounts"]["clients"] == 0
        assert sum(p["count"] for p in body["accounts"]["registrations_series"]) == 0
        assert body["verification"] == {"pending": 0, "verified": 0, "rejected": 0}
        assert body["payments"] == {"awaiting_review": 0, "verified_last_30_days": 0}
        assert body["visibility"] == {"active": 0, "expired": 0, "awaiting_review": 0}
        assert body["procurement"] == {"requests_total": 0, "requests_open": 0, "quotes_live": 0}
        assert body["recent_registrations"] == []
        assert body["recent_admin_actions"] == []

        accounts = api.get("/admin/accounts", headers=headers).json()
        assert accounts["total"] == 0
        assert accounts["data"] == []
        assert set(accounts["stage_counts"].values()) == {0}

        procurement = api.get("/admin/procurement/requests", headers=headers).json()
        assert procurement["total"] == 0
        assert procurement["data"] == []
    finally:
        app.dependency_overrides[get_db] = prev


# ------------------------------------------------------------------- accounts
def test_stage_counts_are_exhaustive_and_disjoint(api, seed):
    body = api.get("/admin/accounts", headers=_token(seed["admin"])).json()
    assert sum(body["stage_counts"].values()) == body["total"] == 6
    # One live visibility + one running legacy listing => two complete vendors.
    assert body["stage_counts"]["complete"] == 2
    assert body["stage_counts"]["awaiting_payment"] == 1     # verified client, no subscription
    assert body["stage_counts"]["no_visibility"] == 1        # verified vendor, expired plan
    assert body["stage_counts"]["unverified_email"] == 1
    # Verified e-mail, approved-never profile, no paperwork uploaded yet.
    assert body["stage_counts"]["awaiting_documents"] == 1

    # Every returned row carries exactly one of the declared stages.
    assert all(row["stage"] in body["stage_counts"] for row in body["data"])


def test_accounts_filters(api, seed):
    headers = _token(seed["admin"])

    awaiting = api.get("/admin/accounts?stage=awaiting_payment", headers=headers).json()
    assert awaiting["total"] == 1
    assert awaiting["data"][0]["email"] == "ops@alpha-shipping.test"
    assert awaiting["data"][0]["company_name"] == "Alpha Shipping"

    vendors = api.get("/admin/accounts?role=vendor", headers=headers).json()
    assert vendors["total"] == 3

    search = api.get("/admin/accounts?q=alpha", headers=headers).json()
    assert search["total"] == 1

    today = datetime.utcnow().date().isoformat()
    ranged = api.get(
        f"/admin/accounts?created_from={today}&created_to={today}", headers=headers
    ).json()
    assert ranged["total"] == 6

    future = (datetime.utcnow() + timedelta(days=5)).date().isoformat()
    assert api.get(f"/admin/accounts?created_from={future}", headers=headers).json()["total"] == 0

    paged = api.get("/admin/accounts?page=2&limit=2", headers=headers).json()
    assert paged["page"] == 2
    assert paged["pages"] == 3
    assert len(paged["data"]) == 2

    bad = api.get("/admin/accounts?stage=not_a_stage", headers=headers)
    assert bad.status_code == 400


# ---------------------------------------------------------------- procurement
def test_procurement_list_search_filter_and_counts(api, seed):
    headers = _token(seed["admin"])
    body = api.get("/admin/procurement/requests", headers=headers).json()
    assert body["total"] == 2

    open_only = api.get("/admin/procurement/requests?status=open", headers=headers).json()
    assert open_only["total"] == 1
    row = open_only["data"][0]
    assert row["quote_count"] == 2
    assert row["client"]["company_name"] == "Alpha Shipping"
    assert row["request_id"] == str(seed["request"].id)

    by_text = api.get("/admin/procurement/requests?q=jnpt", headers=headers).json()
    assert by_text["total"] == 1

    by_id = api.get(
        f"/admin/procurement/requests?q={seed['request'].id}", headers=headers
    ).json()
    assert by_id["total"] == 1

    assert api.get(
        "/admin/procurement/requests?request_type=supply", headers=headers
    ).json()["total"] == 0

    oldest = api.get("/admin/procurement/requests?sort=oldest", headers=headers).json()
    assert oldest["data"][0]["status"] == "open"

    paged = api.get("/admin/procurement/requests?limit=1&page=2", headers=headers).json()
    assert paged["pages"] == 2
    assert len(paged["data"]) == 1

    assert api.get(
        "/admin/procurement/requests?status=bogus", headers=headers
    ).status_code == 400

    summary = api.get("/admin/procurement/summary", headers=headers).json()
    assert summary["requests_total"] == 2
    assert summary["requests_by_status"]["open"] == 1
    assert summary["quotes_total"] == 2


def test_procurement_detail_is_read_only_and_hides_secrets(api, seed):
    headers = _token(seed["admin"])
    response = api.get(
        f"/admin/procurement/requests/{seed['request'].id}", headers=headers
    )
    assert response.status_code == 200
    body = response.json()
    assert body["read_only"] is True
    assert body["quote_count"] == 2
    assert len(body["quotes"]) == 2
    assert all(quote["status"] == "submitted" for quote in body["quotes"])

    serialized = response.text.lower()
    for forbidden in (
        "password",
        "access_token",
        "refresh_token",
        "receipt_path",
        "utr",
        "reset_code",
    ):
        assert forbidden not in serialized

    assert api.get(
        f"/admin/procurement/requests/{uuid.uuid4()}", headers=headers
    ).status_code == 404

    # No write surface: an admin inspection path cannot mutate a customer request.
    assert api.post(
        f"/admin/procurement/requests/{seed['request'].id}", headers=headers, json={}
    ).status_code in (405, 404)
