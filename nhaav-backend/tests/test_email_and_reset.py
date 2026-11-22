"""
Regression tests for the production email/verification stack.

Pins the honest email contract introduced in the production-readiness pass:
  - registration/forgot-password/resend deliver real emails through the
    configured backend (console in dev, SMTP in production);
  - tokens appear ONLY in email bodies — never in logs/stdout;
  - password-reset tokens are SINGLE USE (iat-vs-password_reset_at guard);
  - production refuses to boot with console email or missing SMTP config.
"""
import logging
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
import jwt
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.database import Base, get_db
from app.config import Settings, settings
from app.models.rate_limit_event import RateLimitEvent
from app.models.user import User
from app.services.email_service import (
    ConsoleEmailBackend,
    EmailConfigurationError,
    EmailDeliveryError,
    SMTPEmailBackend,
)

SQLALCHEMY_DATABASE_URL = "sqlite:///./test_email_reset.db"

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

    # Another test module may have registered its own get_db override at import
    # time. Capture it so teardown restores that override instead of deleting it
    # outright — otherwise the later module's requests fall through to the real
    # application database (which already holds the seeded rows).
    previous_override = app.dependency_overrides.get(get_db)
    app.dependency_overrides[get_db] = override_get_db
    yield
    Base.metadata.drop_all(bind=engine)
    if previous_override is None:
        app.dependency_overrides.pop(get_db, None)
    else:
        app.dependency_overrides[get_db] = previous_override


client = TestClient(app)


@pytest.fixture(autouse=True)
def _clear_rate_limit_counters():
    """
    Rate-limit counters are keyed by client IP, and every request in this module
    arrives from the same TestClient address. Without this, the module's own
    forgot-password calls exhaust the 5-per-window limit and the later tests
    observe 429s instead of the behaviour they assert. Clearing counters between
    tests is test isolation — no assertion is relaxed by it.
    """
    db = TestingSessionLocal()
    try:
        db.query(RateLimitEvent).delete()
        db.commit()
    finally:
        db.close()
    yield


class RecordingBackend:
    """Captures sent emails in memory (test double for any real backend)."""

    def __init__(self):
        self.sent = []

    def send(self, to_email, subject, body):
        self.sent.append({"to": to_email, "subject": subject, "body": body})


@pytest.fixture()
def mailbox(monkeypatch):
    backend = RecordingBackend()
    monkeypatch.setattr(
        "app.services.email_service.get_email_backend", lambda: backend
    )
    return backend


def _extract_token(mailbox):
    """The token now travels ONLY inside the link — there is no bare code line."""
    import re

    body = mailbox.sent[-1]["body"]
    match = re.search(r"(?:verify_token|reset_token)=([^\s&\"']+)", body)
    assert match, f"no token in the delivered link: {body!r}"
    return match.group(1)


def _register(email, mailbox):
    resp = client.post(
        "/auth/register",
        json={
            "email": email,
            "password": "Password123!",
            "role": "client",
            "full_name": "Email User",
        },
    )
    assert resp.status_code == 201, resp.text


# ---------------------------------------------------------------------------
# 1. Registration + verification email
# ---------------------------------------------------------------------------

def test_registration_sends_verification_email(mailbox):
    _register("emailflow@example.com", mailbox)
    assert len(mailbox.sent) == 1
    mail = mailbox.sent[0]
    assert mail["to"] == "emailflow@example.com"
    assert "verify" in mail["subject"].lower()
    # The link is the only place the token appears; no bare code line.
    assert "verify_token=" in mail["body"]
    assert "token:" not in mail["body"]


def test_email_links_point_at_frontend_auth_pages(mailbox, monkeypatch):
    """
    Contract between the backend email composer and the frontend routes.

    The frontend redirects /login?verify_token=<t> -> /verify-email?token=<t>
    and /login?reset_token=<t> -> /reset-password?token=<t>; if these link
    shapes ever change, that redirect (and the reset page) silently breaks.
    """
    from app.services import email_service as es

    monkeypatch.setattr(es.settings, "FRONTEND_URL", "https://app.example.com")

    assert es.EmailService.send_verification_email("link@example.com", "VTOKEN")
    reset_ok = es.EmailService.send_password_reset_email("link@example.com", "RTOKEN")
    assert reset_ok

    verify_mail = mailbox.sent[-2]
    reset_mail = mailbox.sent[-1]
    assert "https://app.example.com/login?verify_token=VTOKEN" in verify_mail["body"]
    assert "https://app.example.com/login?reset_token=RTOKEN" in reset_mail["body"]


def test_registration_never_prints_token_to_logs(mailbox, capsys):
    _register("nolog@example.com", mailbox)
    captured = capsys.readouterr()
    token = _extract_token(mailbox)
    assert token not in captured.out
    assert token not in captured.err
    assert "[MOCK EMAIL]" not in captured.out
    assert "use token" not in captured.out


def test_verification_email_delivers_token_once(mailbox):
    _register("verifyonce@example.com", mailbox)
    token = _extract_token(mailbox)
    resp = client.post("/auth/verify-email", json={"token": token})
    assert resp.status_code == 200

    db = TestingSessionLocal()
    user = db.query(User).filter(User.email == "verifyonce@example.com").first()
    assert user is not None and user.is_verified is True
    db.close()


def test_resend_verification_sends_new_usable_token(mailbox):
    _register("resend@example.com", mailbox)
    assert len(mailbox.sent) == 1  # registration email

    resp = client.post(
        "/auth/resend-verification", json={"email": "resend@example.com"}
    )
    assert resp.status_code == 200
    assert len(mailbox.sent) == 2  # resend email

    new_token = _extract_token(mailbox)
    resp = client.post("/auth/verify-email", json={"token": new_token})
    assert resp.status_code == 200


def test_resend_verification_enumeration_safe(mailbox):
    before = len(mailbox.sent)
    resp = client.post(
        "/auth/resend-verification", json={"email": "ghost@example.com"}
    )
    assert resp.status_code == 200
    assert len(mailbox.sent) == before  # no email for unknown address


def test_expired_verification_token_fails():
    expired = jwt.encode(
        {
            "email": "emailflow@example.com",
            "type": "verify_email",
            "exp": datetime.utcnow() - timedelta(minutes=1),
        },
        settings.JWT_SECRET,
        algorithm=settings.JWT_ALGORITHM,
    )
    resp = client.post("/auth/verify-email", json={"token": expired})
    assert resp.status_code == 400


def test_email_delivery_failure_returns_503(mailbox, monkeypatch):
    def boom(*args, **kwargs):
        raise EmailDeliveryError("Email delivery failed")

    monkeypatch.setattr(
        "app.services.email_service.EmailService.send_verification_email", boom
    )
    resp = client.post(
        "/auth/register",
        json={
            "email": "smtpdown@example.com",
            "password": "Password123!",
            "role": "client",
            "full_name": "SMTP Down",
        },
    )
    assert resp.status_code == 503
    # The account itself was still created (retryable via resend).
    db = TestingSessionLocal()
    user = (
        db.query(User).filter(User.email == "smtpdown@example.com").first()
    )
    assert user is not None
    db.close()


def test_email_config_error_returns_503(mailbox, monkeypatch):
    def boom(*args, **kwargs):
        raise EmailConfigurationError("EMAIL_BACKEND=smtp requires: EMAIL_HOST")

    monkeypatch.setattr(
        "app.services.email_service.EmailService.send_verification_email", boom
    )
    resp = client.post(
        "/auth/register",
        json={
            "email": "misconfig@example.com",
            "password": "Password123!",
            "role": "client",
            "full_name": "Misconfig",
        },
    )
    assert resp.status_code == 503


# ---------------------------------------------------------------------------
# 2. Password reset flow
# ---------------------------------------------------------------------------

def test_forgot_password_sends_reset_email(mailbox):
    _register("reset1@example.com", mailbox)
    count = len(mailbox.sent)
    resp = client.post("/auth/forgot-password", json={"email": "reset1@example.com"})
    assert resp.status_code == 200
    assert len(mailbox.sent) == count + 1
    assert "reset" in mailbox.sent[-1]["subject"].lower()


def test_forgot_password_unknown_email_enumeration_safe(mailbox):
    count = len(mailbox.sent)
    resp = client.post("/auth/forgot-password", json={"email": "ghost2@example.com"})
    assert resp.status_code == 200
    assert len(mailbox.sent) == count


def test_forgot_password_never_prints_token(mailbox, capsys):
    client.post("/auth/forgot-password", json={"email": "reset1@example.com"})
    captured = capsys.readouterr()
    token = _extract_token(mailbox)
    assert token not in captured.out
    assert "[MOCK EMAIL]" not in captured.out


def test_reset_password_changes_password(mailbox):
    _register("resetflow@example.com", mailbox)
    client.post("/auth/forgot-password", json={"email": "resetflow@example.com"})
    token = _extract_token(mailbox)
    resp = client.post(
        "/auth/reset-password",
        json={"token": token, "new_password": "NewPassword123!"},
    )
    assert resp.status_code == 200
    login = client.post(
        "/auth/login",
        json={"email": "resetflow@example.com", "password": "NewPassword123!"},
    )
    assert login.status_code == 200


def test_reset_token_cannot_be_reused(mailbox):
    _register("reuse@example.com", mailbox)
    resp = client.post("/auth/forgot-password", json={"email": "reuse@example.com"})
    assert resp.status_code == 200
    token = _extract_token(mailbox)

    first = client.post(
        "/auth/reset-password", json={"token": token, "new_password": "Once123!"}
    )
    assert first.status_code == 200

    second = client.post(
        "/auth/reset-password", json={"token": token, "new_password": "Twice123!"}
    )
    assert second.status_code == 400

    # The first reset genuinely took effect and remains the valid password.
    login = client.post(
        "/auth/login", json={"email": "reuse@example.com", "password": "Once123!"}
    )
    assert login.status_code == 200


def test_new_reset_token_invalidates_old_one(mailbox):
    _register("supersede@example.com", mailbox)
    client.post("/auth/forgot-password", json={"email": "supersede@example.com"})
    old_token = _extract_token(mailbox)

    client.post("/auth/forgot-password", json={"email": "supersede@example.com"})
    new_token = _extract_token(mailbox)
    assert new_token != old_token

    use_new = client.post(
        "/auth/reset-password", json={"token": new_token, "new_password": "Latest123!"}
    )
    assert use_new.status_code == 200

    use_old = client.post(
        "/auth/reset-password", json={"token": old_token, "new_password": "Stale123!"}
    )
    assert use_old.status_code == 400


def test_expired_reset_token_fails(mailbox):
    _register("expiredreset@example.com", mailbox)
    expired = jwt.encode(
        {
            "email": "expiredreset@example.com",
            "type": "reset_password",
            "exp": datetime.utcnow() - timedelta(minutes=1),
        },
        settings.JWT_SECRET,
        algorithm=settings.JWT_ALGORITHM,
    )
    resp = client.post(
        "/auth/reset-password",
        json={"token": expired, "new_password": "Whatever123!"},
    )
    assert resp.status_code == 400


def test_reset_password_iat_not_after_last_reset(mailbox):
    """A token whose iat predates the last reset is rejected (single use)."""
    _register("iatskew@example.com", mailbox)
    db = TestingSessionLocal()
    user = db.query(User).filter(User.email == "iatskew@example.com").first()
    user.password_reset_at = datetime.now(timezone.utc) + timedelta(hours=1)
    db.commit()
    db.close()

    token = jwt.encode(
        {
            "email": "iatskew@example.com",
            "type": "reset_password",
            "iat": int(datetime.utcnow().timestamp()),
            "exp": datetime.utcnow() + timedelta(hours=1),
        },
        settings.JWT_SECRET,
        algorithm=settings.JWT_ALGORITHM,
    )
    resp = client.post(
        "/auth/reset-password", json={"token": token, "new_password": "Skew123!"}
    )
    assert resp.status_code == 400


# ---------------------------------------------------------------------------
# 3. Backends + production fail-fast
# ---------------------------------------------------------------------------

def test_console_backend_never_logs_body(caplog):
    backend = ConsoleEmailBackend()
    with caplog.at_level(logging.INFO, logger="nhaav.email"):
        backend.send("a@b.com", "Verify your Nhaav account", "token: SUPERSECRET")
    logged = " ".join(record.getMessage() for record in caplog.records)
    assert "SUPERSECRET" not in logged
    assert "a@b.com" in logged
    assert "Verify your Nhaav account" in logged


def test_smtp_backend_requires_host_and_from():
    from app.services import email_service as es

    with patch(es.settings, "EMAIL_BACKEND", "smtp"), patch(
        es.settings, "EMAIL_HOST", ""
    ), patch(es.settings, "EMAIL_FROM", ""):
        with pytest.raises(es.EmailConfigurationError):
            es.get_email_backend()


def test_smtp_backend_built_when_configured():
    from app.services import email_service as es

    with patch(es.settings, "EMAIL_BACKEND", "smtp"), patch(
        es.settings, "EMAIL_HOST", "smtp.test.local"
    ), patch(es.settings, "EMAIL_FROM", "no-reply@test.local"), patch(
        es.settings, "EMAIL_HOST_USER", "user"
    ), patch(es.settings, "EMAIL_HOST_PASSWORD", "pass"):
        backend = es.get_email_backend()
        assert isinstance(backend, SMTPEmailBackend)
        assert backend.username == "user"


def test_production_rejects_console_backend(monkeypatch):
    # Settings() reads os.environ at construction — patch the environment,
    # not the singleton. The email check runs before the other production
    # fail-safes, so this error surfaces first.
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setenv("EMAIL_BACKEND", "console")
    with pytest.raises(ValueError, match="EMAIL_BACKEND=console is forbidden"):
        Settings()


def test_production_requires_smtp_config(monkeypatch):
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setenv("EMAIL_BACKEND", "smtp")
    monkeypatch.setenv("EMAIL_HOST", "")
    monkeypatch.delenv("EMAIL_FROM", raising=False)
    with pytest.raises(ValueError, match="EMAIL_HOST"):
        Settings()


def test_development_allows_console_backend(monkeypatch):
    monkeypatch.setenv("ENVIRONMENT", "development")
    monkeypatch.setenv("EMAIL_BACKEND", "console")
    s = Settings()  # must not raise
    assert s.EMAIL_BACKEND == "console"


class patch:
    """Minimal attribute patch context manager (no mock import needed)."""

    def __init__(self, obj, name, value):
        self.obj = obj
        self.name = name
        self.value = value
        self.original = None

    def __enter__(self):
        self.original = getattr(self.obj, self.name)
        setattr(self.obj, self.name, self.value)
        return self

    def __exit__(self, *exc):
        setattr(self.obj, self.name, self.original)
        return False
