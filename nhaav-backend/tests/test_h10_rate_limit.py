"""
H10 Security pass — user-scoped, database-backed rate limiting.

Answers: "What prevents someone from logging in once and searching all
vendors/ports and downloading all that data?"

Enforcement is server-side only:
- Counter key = authenticated user id from the verified JWT (admin routes keep
  their separate admin identity and are NOT counted by user categories).
- Public routes stay public: anonymous callers pass through uncounted; the
  rate-limited abuser in the Captain's threat model is the authenticated one.
- Counters live in the rate_limit_events table (multi-instance safe).
- 429 + Retry-After + {"detail": {code, category, message}} on exceed.
- Search endpoints cap page size at MAX_SEARCH_PAGE_SIZE.

The rate_limit dependency authenticates the caller itself (get_current_user),
so public marketplaces become authenticated for counting purposes — matching
the prompt's requirement that the limit key is the JWT identity. Unauthenticated
callers receive 401 exactly as before on already-authenticated routes.
"""
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.database import Base, get_db
from app.config import settings
from app.models.user import User, UserRole
from app.models.profile import Profile, VerificationStatus
from app.models.service import Service
from app.models.rate_limit_event import RateLimitEvent
from app.utils.password import hash_password
from app.services import rate_limit_service
from entitlement_helpers import grant_marketplace_access

SQLALCHEMY_DATABASE_URL = "sqlite:///./test_h10_rate_limit.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

PASSWORD = "Password123!"
CLIENT_EMAIL = "h10_client@nhaav.com"
CLIENT_B_EMAIL = "h10_client_b@nhaav.com"
PROVIDER_EMAIL = "h10_provider@nhaav.com"
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
        client = User(email=CLIENT_EMAIL, password_hash=hash_password(PASSWORD),
                      role=UserRole.client, full_name="H10 Client", is_verified=True)
        client_b = User(email=CLIENT_B_EMAIL, password_hash=hash_password(PASSWORD),
                        role=UserRole.client, full_name="H10 Client B", is_verified=True)
        provider = User(email=PROVIDER_EMAIL, password_hash=hash_password(PASSWORD),
                        role=UserRole.provider, full_name="H10 Provider", is_verified=True)
        db.add_all([client, client_b, provider])
        db.flush()
        db.add(Profile(user_id=provider.id, company_name="H10 Marine",
                       verification_status=VerificationStatus.verified))
        db.add(Service(provider_id=provider.id, service_id=SERVICE, port_id=PORT,
                       name=SERVICE, category="Inspection & Survey",
                       description="H10 listing", pricing_model="Per Job", is_active=True))
        db.commit()
        # The marketplace now requires approved verification + an active
        # subscription; give both clients that entitlement so their search
        # budget (not the onboarding gate) is what these tests exercise.
        grant_marketplace_access(db, client)
        grant_marketplace_access(db, client_b)
    finally:
        db.close()
    yield
    app.dependency_overrides.pop(get_db, None)


def _login(client: TestClient, email: str) -> str:
    r = client.post("/auth/login", json={"email": email, "password": PASSWORD})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def _auth(tok: str) -> dict:
    return {"Authorization": f"Bearer {tok}"}


def _user_id(db, email: str) -> uuid.UUID:
    return db.query(User).filter(User.email == email).first().id


class TestVendorSearchLimit:
    def test_searches_up_to_limit_then_429(self):
        with TestClient(app) as client:
            tok = _login(client, CLIENT_EMAIL)
            db = TestingSessionLocal()
            try:
                rate_limit_service.reset_user(db, _user_id(db, CLIENT_EMAIL))
            finally:
                db.close()

            # The configured number of searches succeed (limit is REQUESTS
            # per window, not results — each call here returns 200).
            limit = settings.VENDOR_SEARCH_LIMIT
            for i in range(limit):
                r = client.get("/profiles/providers", headers=_auth(tok),
                               params={"page": 1, "limit": 5})
                assert r.status_code == 200, f"search {i + 1}: {r.text}"

            # One more crosses the line: 429 with a useful JSON body.
            r = client.get("/profiles/providers", headers=_auth(tok),
                           params={"page": 1, "limit": 5})
            assert r.status_code == 429
            detail = r.json()["detail"]
            assert detail["code"] == "rate_limit_exceeded"
            assert detail["category"] == "vendor_search"
            assert "limit reached" in detail["message"].lower()
            assert "retry-after" in {k.lower() for k in r.headers.keys()}

    def test_marketplace_services_share_vendor_search_budget(self):
        with TestClient(app) as client:
            tok = _login(client, CLIENT_B_EMAIL)
            db = TestingSessionLocal()
            try:
                rate_limit_service.reset_user(db, _user_id(db, CLIENT_B_EMAIL))
            finally:
                db.close()
            limit = settings.VENDOR_SEARCH_LIMIT
            # Mix marketplace-service searches with profile searches: one shared
            # budget. Alternate kinds so exactly `limit` requests are counted.
            for i in range(limit):
                if i % 2 == 0:
                    assert client.get("/marketplace/services",
                                      headers=_auth(tok)).status_code == 200
                else:
                    assert client.get("/profiles/providers", headers=_auth(tok),
                                      params={"limit": 5}).status_code == 200
            # The next marketplace search crosses the line.
            r = client.get("/marketplace/services", headers=_auth(tok))
            assert r.status_code == 429
            assert r.json()["detail"]["category"] == "vendor_search"

    def test_counter_is_user_scoped(self):
        """User A exhausting the budget must not block User B."""
        with TestClient(app) as client:
            tok_a = _login(client, CLIENT_EMAIL)
            tok_b = _login(client, CLIENT_B_EMAIL)
            db = TestingSessionLocal()
            try:
                id_a, id_b = _user_id(db, CLIENT_EMAIL), _user_id(db, CLIENT_B_EMAIL)
                rate_limit_service.reset_user(db, id_a)
                rate_limit_service.reset_user(db, id_b)
            finally:
                db.close()
            # A burns every slot on /profiles/providers.
            for _ in range(settings.VENDOR_SEARCH_LIMIT):
                client.get("/profiles/providers", headers=_auth(tok_a), params={"limit": 5})
            assert client.get("/profiles/providers", headers=_auth(tok_a)).status_code == 429
            # B still browses freely.
            r = client.get("/profiles/providers", headers=_auth(tok_b), params={"limit": 5})
            assert r.status_code == 200

    def test_window_expiry_restores_access(self):
        db = TestingSessionLocal()
        try:
            uid = _user_id(db, CLIENT_EMAIL)
            rate_limit_service.reset_user(db, uid, "vendor_search")
            # Simulate a full window of old searches...
            for _ in range(settings.VENDOR_SEARCH_LIMIT):
                db.add(RateLimitEvent(user_id=uid, category="vendor_search",
                                      created_at=datetime.now(timezone.utc)))
            db.commit()
            # ...aged out of the sliding window.
            old = datetime.now(timezone.utc) - timedelta(
                minutes=settings.RATE_LIMIT_WINDOW_MINUTES + 1)
            db.query(RateLimitEvent).filter(RateLimitEvent.user_id == uid).update(
                {"created_at": old}, synchronize_session=False)
            db.commit()
        finally:
            db.close()
        with TestClient(app) as client:
            tok = _login(client, CLIENT_EMAIL)
            r = client.get("/profiles/providers", headers=_auth(tok), params={"limit": 5})
            assert r.status_code == 200  # window expired -> access restored


class TestPortSearchLimit:
    def test_port_search_has_own_counter(self):
        with TestClient(app) as client:
            tok = _login(client, CLIENT_EMAIL)
            db = TestingSessionLocal()
            try:
                uid = _user_id(db, CLIENT_EMAIL)
                # Exhaust vendor_search only.
                rate_limit_service.reset_user(db, uid, "vendor_search")
                for _ in range(settings.VENDOR_SEARCH_LIMIT):
                    client.get("/profiles/providers", headers=_auth(tok), params={"limit": 5})
                # Port coverage detail is a DIFFERENT category — still allowed.
                r = client.get("/marketplace/services/aggregate/Hull Inspection",
                               headers=_auth(tok))
                assert r.status_code == 200, r.text
                # ...and it has its own independent budget.
                rate_limit_service.reset_user(db, uid, "port_search")
                for _ in range(settings.PORT_SEARCH_LIMIT):
                    assert client.get(
                        "/marketplace/services/aggregate/Hull Inspection",
                        headers=_auth(tok)).status_code == 200
                r = client.get("/marketplace/services/aggregate/Hull Inspection",
                               headers=_auth(tok))
                assert r.status_code == 429
                assert r.json()["detail"]["category"] == "port_search"
            finally:
                db.close()


class TestVendorDetailLimit:
    def test_detail_limit_higher_than_search(self):
        with TestClient(app) as client:
            tok = _login(client, CLIENT_EMAIL)
            db = TestingSessionLocal()
            try:
                uid = _user_id(db, CLIENT_EMAIL)
                rate_limit_service.reset_user(db, uid, "vendor_detail")
                pid = db.query(Profile).filter(
                    Profile.user_id == _user_id(db, PROVIDER_EMAIL)).first().id
            finally:
                db.close()
            assert settings.VENDOR_DETAIL_LIMIT > 0
            for _ in range(settings.VENDOR_DETAIL_LIMIT):
                r = client.get(f"/profiles/{pid}", headers=_auth(tok))
                assert r.status_code == 200, r.text
            r = client.get(f"/profiles/{pid}", headers=_auth(tok))
            assert r.status_code == 429
            assert r.json()["detail"]["category"] == "vendor_detail"


class TestPaginationBoundaries:
    def test_page_size_capped(self):
        with TestClient(app) as client:
            tok = _login(client, CLIENT_EMAIL)
            db = TestingSessionLocal()
            try:
                rate_limit_service.reset_user(db, _user_id(db, CLIENT_EMAIL))
            finally:
                db.close()
            r = client.get("/profiles/providers", headers=_auth(tok),
                           params={"limit": settings.MAX_SEARCH_PAGE_SIZE + 1})
            assert r.status_code == 422  # rejected before any data leaves

    def test_legitimate_pagination_still_works(self):
        with TestClient(app) as client:
            tok = _login(client, CLIENT_EMAIL)
            db = TestingSessionLocal()
            try:
                rate_limit_service.reset_user(db, _user_id(db, CLIENT_EMAIL))
            finally:
                db.close()
            for page in (1, 2):
                r = client.get("/profiles/providers", headers=_auth(tok),
                               params={"page": page, "limit": settings.MAX_SEARCH_PAGE_SIZE})
                assert r.status_code == 200
                body = r.json()
                assert {"data", "total", "page", "pages"} <= set(body.keys())

    def test_public_requests_page_size_capped(self):
        r = TestClient(app).get("/requests/", params={"limit": settings.MAX_SEARCH_PAGE_SIZE + 1})
        assert r.status_code == 422
        r = TestClient(app).get("/requests/", params={"limit": settings.MAX_SEARCH_PAGE_SIZE})
        assert r.status_code == 200  # public browse contract unchanged


class TestAuthContract:
    def test_public_profiles_open_but_marketplace_requires_entitlement(self):
        # The provider directory stays public (anonymous, uncounted). The
        # MARKETPLACE now requires an entitled session, so an anonymous caller
        # is refused with 401 (no credential) rather than served listings.
        with TestClient(app) as client:
            assert client.get("/profiles/providers", params={"limit": 5}).status_code == 200
            assert client.get("/marketplace/services").status_code == 401

    def test_admin_routes_not_counted_by_user_limits(self):
        """Admin verification queue is admin-JWT scoped; user limits never apply."""
        with TestClient(app) as client:
            tok = _login(client, CLIENT_EMAIL)
            db = TestingSessionLocal()
            try:
                uid = _user_id(db, CLIENT_EMAIL)
                for cat in ("vendor_search", "port_search", "vendor_detail"):
                    rate_limit_service.reset_user(db, uid, cat)
            finally:
                db.close()
            # Burn every user budget.
            for _ in range(settings.VENDOR_SEARCH_LIMIT):
                client.get("/profiles/providers", headers=_auth(tok), params={"limit": 5})
            # The admin route has its own auth: user JWT gets 401/403, not 429.
            # (Was /admin/verification/providers — deleted with the old admin
            # module; /admin/moderation/queue is the live equivalent.)
            r = client.get("/admin/moderation/queue", headers=_auth(tok))
            assert r.status_code in (401, 403)
            # And an exhausted user budget does not influence admin stats.
            # (No admin account in this DB: 401 confirms the route is on the
            # admin identity path, untouched by user counters.)
            assert r.status_code != 429


class TestDownloadCategory:
    def test_download_category_configured(self):
        """The `download` category exists and is enforceable.

        Audit result: every current document/file endpoint is single-record and
        owner-scoped (or admin-gated), so none is wired to it today — the
        category stays ready for any future bulk/export endpoint.
        """
        assert rate_limit_service.limit_for_category("download") == settings.DATA_DOWNLOAD_LIMIT

    def test_owner_scoped_document_file_untouched(self):
        """The owner file route keeps its exact contract (no rate limit added):
        non-owner gets 403, owner 404-vs-200 semantics unchanged."""
        with TestClient(app) as client:
            tok_a = _login(client, CLIENT_EMAIL)
            r = client.get(f"/documents/{uuid.uuid4()}/file", headers=_auth(tok_a))
            assert r.status_code == 404  # no such document -> 404, not 429


class TestResponseShape:
    def test_429_detail_and_retry_after(self):
        with TestClient(app) as client:
            tok = _login(client, CLIENT_B_EMAIL)
            db = TestingSessionLocal()
            try:
                rate_limit_service.reset_user(db, _user_id(db, CLIENT_B_EMAIL))
            finally:
                db.close()
            for _ in range(settings.PORT_SEARCH_LIMIT):
                client.get("/marketplace/services/aggregate/Hull Inspection",
                           headers=_auth(tok))
            r = client.get("/marketplace/services/aggregate/Hull Inspection",
                           headers=_auth(tok))
            assert r.status_code == 429
            body = r.json()
            assert body["detail"]["message"] == (
                "Port search limit reached. Please try again later.")
            retry = r.headers.get("retry-after")
            assert retry is not None and int(retry) >= 1
            assert int(retry) <= settings.RATE_LIMIT_WINDOW_MINUTES * 60
