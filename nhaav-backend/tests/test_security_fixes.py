"""
Security fix pass — regression tests.

Pins the four behavior changes from the security fix pass (see
SECURITY_AUDIT.md / SECURITY_FIX_PASS.md):

1. HIGH-1  GET /quotes/{quote_id} is now owner-scoped: only the submitting
           provider or the client who owns the parent request may read a
           quote; anyone else authenticated gets 403 (parity with
           GET /client/quotations/{quote_id}).
2. MEDIUM-4 Authentication endpoints are rate limited (database-backed
           sliding windows): failed logins per account email, all login
           attempts per source IP, admin login, password reset and
           verification resend — each with configurable limits and a
           Retry-After header on 429.
3. LOW     Attachment values with dangerous URL schemes (javascript:, data:,
           obfuscated variants) are rejected at the schema layer (422); safe
           values (https, absolute upload paths, plain file names) pass.
4. Unit    The auth limiter fails open on store errors and keys counters on
           deterministic normalized subject hashes (never raw emails/IPs).

Runs against a dedicated SQLite file (the test_h9_* pattern) so it neither
touches nhaav.db nor the demo seeds. Each rate-limit test group drives a
distinct X-Forwarded-For address so per-IP budgets are independent and the
tests are order-robust.
"""
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.config import settings
from app.main import app
from app.database import Base, get_db
from app.models.user import User, UserRole
from app.models.profile import Profile, VerificationStatus
from app.models.service import Service
from app.services import rate_limit_service
from app.utils.password import hash_password
from entitlement_helpers import grant_subscription

SQLALCHEMY_DATABASE_URL = "sqlite:///./test_security_fixes.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

PASSWORD = "Password123!"
CLIENT_EMAIL = "secfix_client@nhaav.com"
CLIENT2_EMAIL = "secfix_client2@nhaav.com"
PROVIDER_A_EMAIL = "secfix_provider_a@nhaav.com"
PROVIDER_B_EMAIL = "secfix_provider_b@nhaav.com"
ADMIN_EMAIL = "secfix_admin@nhaav.com"

SERVICE = "Hull Inspection"
PORT = "Port of Rotterdam"

# Isolated X-Forwarded-For identities per test group (client_ip() takes the
# first XFF hop), so no group consumes another group's per-IP budget.
IP_LOGIN_EMAIL_TEST = "203.0.113.50"
IP_ADMIN_EMAIL_TEST = "203.0.113.51"
IP_ADMIN_IP_TEST = "203.0.113.52"
IP_FORGOT_EMAIL_TEST = "203.0.113.53"
IP_FORGOT_IP_TEST = "203.0.113.54"
IP_RESEND_EMAIL_TEST = "203.0.113.55"
IP_RESEND_IP_TEST = "203.0.113.56"
IP_RESET_HELPER_TEST = "203.0.113.57"
IP_ATTACHMENT_TEST = "203.0.113.90"
# Owned only by the per-IP login-budget test: its arithmetic must not depend on
# how many logins other tests already made from their own identities.
IP_LOGIN_IP_TEST = "203.0.113.91"


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
                           role=UserRole.client, full_name="SecFix Client", is_verified=True)
        client2_user = User(email=CLIENT2_EMAIL, password_hash=hash_password(PASSWORD),
                            role=UserRole.client, full_name="SecFix Client Two", is_verified=True)
        pa = User(email=PROVIDER_A_EMAIL, password_hash=hash_password(PASSWORD),
                  role=UserRole.provider, full_name="SecFix Provider A", is_verified=True)
        pb = User(email=PROVIDER_B_EMAIL, password_hash=hash_password(PASSWORD),
                  role=UserRole.provider, full_name="SecFix Provider B", is_verified=True)
        db.add_all([client_user, client2_user, pa, pb])
        db.flush()
        # The requests/quotes/jobs gate needs every participant admin-approved,
        # not just the providers that publish listings.
        for u in (client_user, client2_user, pb):
            db.add(Profile(user_id=u.id,
                           verification_status=VerificationStatus.verified,
                           company_name=f"{u.full_name} Co"))
        db.add(Profile(user_id=pa.id, verification_status=VerificationStatus.verified,
                       company_name="SecFix Provider A Co"))
        db.add(Service(provider_id=pa.id, service_id=SERVICE, port_id=PORT,
                       name=SERVICE, category="Inspection & Survey",
                       description="SecFix listing", pricing_model="Per Job",
                       is_active=True))
        db.add(User(email=ADMIN_EMAIL, password_hash=hash_password(PASSWORD),
                    role=UserRole.admin, full_name="SecFix Admin", is_verified=True))
        db.commit()
        # A client's platform fee is part of the onboarding gate.
        grant_subscription(db, client_user)
        grant_subscription(db, client2_user)
    finally:
        db.close()
    yield
    app.dependency_overrides.pop(get_db, None)


client = TestClient(app)


def _login(email: str, password: str = PASSWORD, ip: str | None = None) -> object:
    headers = {"X-Forwarded-For": ip} if ip else None
    return client.post("/auth/login", json={"email": email, "password": password},
                       headers=headers)


def _token(email: str, ip: str | None = None) -> str:
    r = _login(email, ip=ip)
    assert r.status_code == 200, f"login failed for {email}: {r.text}"
    return r.json()["access_token"]


def _auth(token: str, ip: str | None = None) -> dict:
    headers = {"Authorization": f"Bearer {token}"}
    if ip:
        headers["X-Forwarded-For"] = ip
    return headers


# =============================================================================
# HIGH-1 — Quote IDOR: GET /quotes/{quote_id} is owner-scoped
# =============================================================================

class TestQuoteAccessControl:
    def test_quote_access_control(self):
        owner_token = _token(CLIENT_EMAIL)
        client2_token = _token(CLIENT2_EMAIL)
        provider_a_token = _token(PROVIDER_A_EMAIL)
        provider_b_token = _token(PROVIDER_B_EMAIL)

        # Client (owner) creates a request.
        r = client.post("/requests/", headers=_auth(owner_token), json={
            "title": "SecFix Hull Inspection — MV Audit",
            "service_type": SERVICE,
            "vessel_name": "MV Audit",
            "port": PORT,
            "description": "Security fix pass: quote ownership regression.",
            "budget": 5000.0,
            "urgency": "medium",
        })
        assert r.status_code == 201, r.text
        request_id = r.json()["id"]

        # Provider A submits the only quote.
        r = client.post("/quotes/", headers=_auth(provider_a_token),
                        params={"request_id": request_id},
                        json={
                            "amount": 4200.0,
                            "currency": "USD",
                            "quotation_reference": "SECFIX-Q-1",
                            "pricing_model": "Fixed Price",
                            "message": "Internal pricing — must not leak.",
                            "taxes_included": True,
                        })
        assert r.status_code == 201, r.text
        quote_id = r.json()["id"]

        # 1. Submitting provider can read their own quote -> 200.
        r = client.get(f"/quotes/{quote_id}", headers=_auth(provider_a_token))
        assert r.status_code == 200, r.text
        assert r.json()["amount"] == 4200.0

        # 2. The client who owns the parent request can read it -> 200.
        r = client.get(f"/quotes/{quote_id}", headers=_auth(owner_token))
        assert r.status_code == 200, r.text

        # 3. A different authenticated client gets 403 (was 200 before the fix).
        r = client.get(f"/quotes/{quote_id}", headers=_auth(client2_token))
        assert r.status_code == 403, r.text
        assert r.json()["detail"] == "Not authorized to view this quote"

        # 4. An unrelated authenticated provider gets 403 — competitors can no
        #    longer harvest each other's amounts and payment terms.
        r = client.get(f"/quotes/{quote_id}", headers=_auth(provider_b_token))
        assert r.status_code == 403, r.text

        # 5. Nonexistent quote -> 404.
        r = client.get(f"/quotes/{uuid.uuid4()}", headers=_auth(owner_token))
        assert r.status_code == 404, r.text

        # 6. Sibling parity: the client-procurement variant keeps its existing
        #    ownership check (non-owner client -> 403).
        r = client.get(f"/client/quotations/{quote_id}", headers=_auth(client2_token))
        assert r.status_code == 403, r.text
        # ...and the owner still can.
        r = client.get(f"/client/quotations/{quote_id}", headers=_auth(owner_token))
        assert r.status_code == 200, r.text

        # 6b. EVERY remaining get_quote_by_id caller is authorization-pinned
        #     (review round 2): non-owner provider cannot UPDATE the quote...
        r = client.put(f"/quotes/{quote_id}", headers=_auth(provider_b_token),
                       json={"amount": 1.0, "currency": "USD"})
        assert r.status_code == 403, r.text
        # ...and a non-owner client cannot REJECT it.
        r = client.put(f"/quotes/{quote_id}/reject", headers=_auth(client2_token))
        assert r.status_code == 403, r.text

        # 7. The legitimate award loop is unaffected: owner can still accept.
        r = client.put(f"/quotes/{quote_id}/accept", headers=_auth(owner_token))
        assert r.status_code == 200, r.text


# =============================================================================
# MEDIUM-4 — Authentication endpoint rate limiting
# =============================================================================

class TestAuthRateLimits:
    def test_login_failed_email_limit(self):
        """5 failed logins for one account email pass (401); the 6th is 429."""
        target = "stuffed@nhaav.com"
        for i in range(settings.AUTH_LOGIN_FAILED_PER_EMAIL_LIMIT):
            r = _login(target, "Wrong-Password-1!", ip=IP_LOGIN_EMAIL_TEST)
            assert r.status_code == 401, f"attempt {i + 1}: {r.text}"
        r = _login(target, "Wrong-Password-1!", ip=IP_LOGIN_EMAIL_TEST)
        assert r.status_code == 429, r.text
        detail = r.json()["detail"]
        assert detail["code"] == "rate_limit_exceeded"
        assert detail["category"] == "auth_login_failed_email"
        assert "Retry-After" in r.headers

    def test_failed_email_limit_does_not_block_successful_login(self):
        """A correct password still works after the failed-attempt cap — the
        counter punishes failures, not the account's legitimate owner."""
        r = _login(CLIENT_EMAIL, PASSWORD, ip=IP_LOGIN_EMAIL_TEST)
        assert r.status_code == 200, r.text

    def test_login_per_ip_limit(self, monkeypatch):
        """All login attempts from one source IP count — successful ones too,
        so credential stuffing cannot hide behind occasional real logins — and
        the attempt after the per-network budget gets 429.

        The test owns its source IP, and the window is widened because 60 bcrypt
        attempts can outlast the production one-minute window and silently
        refund their own earlier hits.
        """
        monkeypatch.setattr(settings, "AUTH_LOGIN_WINDOW_MINUTES", 10)
        for _ in range(4):
            assert _login(CLIENT_EMAIL, PASSWORD, ip=IP_LOGIN_IP_TEST).status_code == 200
        for i in range(settings.AUTH_LOGIN_PER_IP_LIMIT - 4):
            r = _login(f"stuff_ip_{i}@nhaav.com", "Wrong-Password-1!", ip=IP_LOGIN_IP_TEST)
            assert r.status_code == 401, f"attempt {i + 1}: {r.text}"
        r = _login("stuff_ip_final@nhaav.com", "Wrong-Password-1!", ip=IP_LOGIN_IP_TEST)
        assert r.status_code == 429, r.text
        detail = r.json()["detail"]
        assert detail["code"] == "rate_limit_exceeded"
        assert detail["category"] == "auth_login_ip"
        assert "Retry-After" in r.headers

    def test_admin_login_failed_email_limit(self):
        """Failed admin logins are throttled per admin email."""
        target = "ghost_admin@nhaav.com"
        for i in range(settings.AUTH_ADMIN_LOGIN_FAILED_PER_EMAIL_LIMIT):
            r = client.post("/admin/auth/login",
                            json={"email": target, "password": "Wrong-Admin-1!"},
                            headers={"X-Forwarded-For": IP_ADMIN_EMAIL_TEST})
            assert r.status_code == 401, f"attempt {i + 1}: {r.text}"
        r = client.post("/admin/auth/login",
                        json={"email": target, "password": "Wrong-Admin-1!"},
                        headers={"X-Forwarded-For": IP_ADMIN_EMAIL_TEST})
        assert r.status_code == 429, r.text
        assert r.json()["detail"]["category"] == "auth_admin_login_failed_email"

    def test_admin_login_success_after_failures(self):
        """The real admin can still log in — failures of other emails never
        touched this account's counter."""
        r = client.post("/admin/auth/login",
                        json={"email": ADMIN_EMAIL, "password": PASSWORD},
                        headers={"X-Forwarded-For": IP_ADMIN_EMAIL_TEST})
        assert r.status_code == 200, r.text

    def test_admin_login_per_ip_limit(self):
        """Admin login attempts from one source IP are capped (20/15min)."""
        for i in range(settings.AUTH_ADMIN_LOGIN_PER_IP_LIMIT):
            r = client.post("/admin/auth/login",
                            json={"email": f"admin_ip_{i}@nhaav.com",
                                  "password": "Wrong-Admin-1!"},
                            headers={"X-Forwarded-For": IP_ADMIN_IP_TEST})
            assert r.status_code == 401, f"attempt {i + 1}: {r.text}"
        r = client.post("/admin/auth/login",
                        json={"email": "admin_ip_final@nhaav.com",
                              "password": "Wrong-Admin-1!"},
                        headers={"X-Forwarded-For": IP_ADMIN_IP_TEST})
        assert r.status_code == 429, r.text
        assert r.json()["detail"]["category"] == "auth_admin_login_ip"

    def test_forgot_password_per_email_limit(self):
        """Password-reset mail-bombing: 3 requests per account email, 4th 429.
        (The endpoint still returns the enumeration-safe generic message while
        under the cap.)"""
        target = "mailbombed@nhaav.com"
        for i in range(settings.AUTH_FORGOT_PER_EMAIL_LIMIT):
            r = client.post("/auth/forgot-password", json={"email": target},
                            headers={"X-Forwarded-For": IP_FORGOT_EMAIL_TEST})
            assert r.status_code == 200, f"attempt {i + 1}: {r.text}"
            assert "password reset link" in r.json()["message"]
        r = client.post("/auth/forgot-password", json={"email": target},
                        headers={"X-Forwarded-For": IP_FORGOT_EMAIL_TEST})
        assert r.status_code == 429, r.text
        assert r.json()["detail"]["category"] == "auth_forgot_email"

    def test_forgot_password_per_ip_limit(self):
        """Password-reset requests from one source IP are capped (10/15min)."""
        for i in range(settings.AUTH_FORGOT_PER_IP_LIMIT):
            r = client.post("/auth/forgot-password",
                            json={"email": f"flood_ip_{i}@nhaav.com"},
                            headers={"X-Forwarded-For": IP_FORGOT_IP_TEST})
            assert r.status_code == 200, f"attempt {i + 1}: {r.text}"
        r = client.post("/auth/forgot-password",
                        json={"email": "flood_ip_final@nhaav.com"},
                        headers={"X-Forwarded-For": IP_FORGOT_IP_TEST})
        assert r.status_code == 429, r.text
        assert r.json()["detail"]["category"] == "auth_forgot_ip"

    def test_resend_verification_per_email_limit(self):
        """Verification resend has a per-account cooldown (3/15min)."""
        target = "resendflood@nhaav.com"
        for i in range(settings.AUTH_RESEND_PER_EMAIL_LIMIT):
            r = client.post("/auth/resend-verification", json={"email": target},
                            headers={"X-Forwarded-For": IP_RESEND_EMAIL_TEST})
            assert r.status_code == 200, f"attempt {i + 1}: {r.text}"
        r = client.post("/auth/resend-verification", json={"email": target},
                        headers={"X-Forwarded-For": IP_RESEND_EMAIL_TEST})
        assert r.status_code == 429, r.text
        assert r.json()["detail"]["category"] == "auth_resend_email"

    def test_resend_verification_per_ip_limit(self):
        """Verification resend from one source IP is capped (10/15min)."""
        for i in range(settings.AUTH_RESEND_PER_IP_LIMIT):
            r = client.post("/auth/resend-verification",
                            json={"email": f"resend_ip_{i}@nhaav.com"},
                            headers={"X-Forwarded-For": IP_RESEND_IP_TEST})
            assert r.status_code == 200, f"attempt {i + 1}: {r.text}"
        r = client.post("/auth/resend-verification",
                        json={"email": "resend_ip_final@nhaav.com"},
                        headers={"X-Forwarded-For": IP_RESEND_IP_TEST})
        assert r.status_code == 429, r.text
        assert r.json()["detail"]["category"] == "auth_resend_ip"

    def test_forgot_password_response_is_enumeration_safe(self):
        """The limiter must not introduce account enumeration: under the cap,
        existing and nonexistent accounts get the identical generic response
        (the counter is incremented before any existence check), and over the
        cap both get the same 429 shape."""
        fresh_ip = "203.0.113.58"
        r_existing = client.post("/auth/forgot-password", json={"email": CLIENT_EMAIL},
                                 headers={"X-Forwarded-For": fresh_ip})
        r_ghost = client.post("/auth/forgot-password", json={"email": "no-such-user@nhaav.com"},
                              headers={"X-Forwarded-For": fresh_ip})
        assert r_existing.status_code == r_ghost.status_code == 200
        assert r_existing.json() == r_ghost.json()

    def test_client_ip_prefers_x_real_ip_when_trusted(self):
        """Trusted-proxy mode: X-Real-IP (set by the Railway edge / configured
        nginx from the real connection) wins over client-supplied XFF."""
        class FakeRequest:
            headers = {"x-real-ip": "198.51.100.9", "x-forwarded-for": "203.0.113.1, 10.0.0.1"}
            client = None

        assert rate_limit_service.client_ip(FakeRequest()) == "198.51.100.9"

    def test_client_ip_ignores_forwarded_headers_when_untrusted(self):
        """Direct-exposure mode (TRUST_PROXY_HEADERS=false): forwarded headers
        are client-controlled and must be ignored entirely — rotating XFF or
        X-Real-IP cannot bypass the per-IP limits (review round 2)."""
        class FakeRequest:
            headers = {"x-real-ip": "198.51.100.9", "x-forwarded-for": "203.0.113.7"}
            client = type("Peer", (), {"host": "10.0.0.9"})()

        original = settings.TRUST_PROXY_HEADERS
        try:
            settings.TRUST_PROXY_HEADERS = False
            assert rate_limit_service.client_ip(FakeRequest()) == "10.0.0.9"
        finally:
            settings.TRUST_PROXY_HEADERS = original

    def test_reset_auth_subject_helper_clears_counters(self):
        """reset_auth_subject() clears a subject's counters so the owner (or a
        test) can lift the throttle — and XFF isolation gives each caller its
        own counter bucket."""
        target = "reset-helper@nhaav.com"
        for _ in range(settings.AUTH_LOGIN_FAILED_PER_EMAIL_LIMIT):
            assert _login(target, "Wrong-Password-1!", ip=IP_RESET_HELPER_TEST).status_code == 401
        assert _login(target, "Wrong-Password-1!", ip=IP_RESET_HELPER_TEST).status_code == 429
        db = TestingSessionLocal()
        try:
            rate_limit_service.reset_auth_subject(db, target)
        finally:
            db.close()
        r = _login(target, "Wrong-Password-1!", ip=IP_RESET_HELPER_TEST)
        assert r.status_code == 401, r.text  # throttled -> allowed again (still wrong password)


# =============================================================================
# LOW — attachment URL scheme validation (defense in depth vs XSS links)
# =============================================================================

class TestAttachmentSchemeValidation:
    def test_quote_attachments_reject_javascript_scheme(self):
        token = _token(PROVIDER_A_EMAIL, ip=IP_ATTACHMENT_TEST)
        request_id = client.post("/requests/", headers=_auth(_token(CLIENT_EMAIL, ip=IP_ATTACHMENT_TEST), ip=IP_ATTACHMENT_TEST), json={
            "title": "SecFix Attachment Probe",
            "service_type": SERVICE,
            "port": PORT,
            "description": "Scheme validation probe request.",
            "urgency": "medium",
        }).json()["id"]
        r = client.post("/quotes/", headers=_auth(token),
                        params={"request_id": request_id},
                        json={"amount": 100.0, "currency": "USD",
                              "attachments": ["javascript:alert(document.domain)"]})
        assert r.status_code == 422, r.text

    def test_quote_attachments_reject_obfuscated_scheme(self):
        """Whitespace inside the scheme ('jav\\tascript:') must not sneak past."""
        token = _token(PROVIDER_A_EMAIL, ip=IP_ATTACHMENT_TEST)
        request_id = client.post("/requests/", headers=_auth(_token(CLIENT_EMAIL, ip=IP_ATTACHMENT_TEST), ip=IP_ATTACHMENT_TEST), json={
            "title": "SecFix Obfuscation Probe",
            "service_type": SERVICE,
            "port": PORT,
            "description": "Obfuscated scheme probe request.",
            "urgency": "medium",
        }).json()["id"]
        r = client.post("/quotes/", headers=_auth(token),
                        params={"request_id": request_id},
                        json={"amount": 100.0, "currency": "USD",
                              "attachments": ["jav\tascript:alert(1)"]})
        assert r.status_code == 422, r.text
        r = client.post("/quotes/", headers=_auth(token),
                        params={"request_id": request_id},
                        json={"amount": 100.0, "currency": "USD",
                              "attachments": ["data:text/html,<script>alert(1)</script>"]})
        assert r.status_code == 422, r.text

    def test_request_attachments_reject_javascript_scheme(self):
        token = _token(CLIENT_EMAIL, ip=IP_ATTACHMENT_TEST)
        r = client.post("/requests/", headers=_auth(token), json={
            "title": "SecFix Request Attachment Probe",
            "service_type": SERVICE,
            "port": PORT,
            "description": "Request-side scheme validation probe.",
            "urgency": "medium",
            "attachments": ["javascript:alert(document.cookie)"],
        })
        assert r.status_code == 422, r.text

    def test_attachments_reject_case_and_percent_obfuscations(self):
        """Review round 2 normalization: uppercase schemes, protocol-relative
        URLs, and percent-encoded schemes are all rejected."""
        token = _token(PROVIDER_A_EMAIL, ip=IP_ATTACHMENT_TEST)
        request_id = client.post("/requests/", headers=_auth(_token(CLIENT_EMAIL, ip=IP_ATTACHMENT_TEST), ip=IP_ATTACHMENT_TEST), json={
            "title": "SecFix Obfuscation Probe 2",
            "service_type": SERVICE,
            "port": PORT,
            "description": "Case/percent/protocol-relative probe request.",
            "urgency": "medium",
        }).json()["id"]
        for evil in (
            "JAVASCRIPT:alert(1)",          # case-insensitive scheme match
            "//evil.example.com/trap",       # protocol-relative → foreign origin
            "javascript%3Aalert(1)",         # percent-encoded colon
            "%6a%61vascript:alert(1)",       # percent-encoded scheme name
        ):
            r = client.post("/quotes/", headers=_auth(token),
                            params={"request_id": request_id},
                            json={"amount": 100.0, "currency": "USD", "attachments": [evil]})
            assert r.status_code == 422, f"{evil!r}: {r.text}"

    def test_safe_attachment_values_are_accepted(self):
        """https URLs, absolute upload paths and plain file names all pass."""
        token = _token(CLIENT_EMAIL, ip=IP_ATTACHMENT_TEST)
        r = client.post("/requests/", headers=_auth(token), json={
            "title": "SecFix Safe Attachments",
            "service_type": SERVICE,
            "port": PORT,
            "description": "Safe attachment values must keep working.",
            "urgency": "medium",
            "attachments": [
                "https://example.com/specification.pdf",
                "/uploads/documents/specification.pdf",
                "specification.pdf",
            ],
        })
        assert r.status_code == 201, r.text
        assert r.json()["attachments"] == [
            "https://example.com/specification.pdf",
            "/uploads/documents/specification.pdf",
            "specification.pdf",
        ]


# =============================================================================
# Unit — subject hashing and fail-open behavior
# =============================================================================

class TestAuthLimiterInternals:
    def test_subject_uuid_is_deterministic_and_normalized(self):
        a = rate_limit_service.subject_uuid("User@Example.com ")
        b = rate_limit_service.subject_uuid("user@example.com")
        assert a == b  # normalization: trim + lowercase
        assert a != rate_limit_service.subject_uuid("other@example.com")
        assert a != rate_limit_service.subject_uuid("203.0.113.9")
        # Raw keys are never stored: the stored value is an opaque UUID.
        assert isinstance(a, uuid.UUID)

    def test_client_ip_prefers_first_xff_hop(self):
        class FakeHeaders(dict):
            def get(self, key, default=None):
                return dict.get(self, key, default)

        class FakeRequest:
            headers = FakeHeaders({"x-forwarded-for": "198.51.100.7, 10.0.0.1"})
            client = None

        assert rate_limit_service.client_ip(FakeRequest()) == "198.51.100.7"

    def test_auth_limiter_fails_open_on_store_error(self):
        """If the counter store is unavailable, requests must still proceed
        (availability over strictness) — same contract as the search limiter."""
        class ExplodingQuery:
            def filter(self, *args, **kwargs):
                raise RuntimeError("store down")

        class ExplodingDB:
            def query(self, *args, **kwargs):
                return ExplodingQuery()

            def rollback(self):
                pass

        # Must not raise despite the store erroring.
        rate_limit_service.check_auth_rate_limit(
            ExplodingDB(), "auth_login_ip", "192.0.2.1"
        )
