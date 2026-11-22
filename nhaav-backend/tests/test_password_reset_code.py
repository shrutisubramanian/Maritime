"""The emailed-code password reset: request a code, then set a new password.

Covers the contract the login screen depends on:

  * requesting a code replies identically for a real and an unknown address and
    mails a random 6-digit code to the real one;
  * the code plus a new password actually changes the password and ends the
    old one;
  * a code works ONCE, is superseded by a newer request, and dies after its
    attempt budget — so a 6-digit secret cannot be brute forced.
"""
import re

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base, get_db
from app.main import app
from app.models.rate_limit_event import RateLimitEvent
from app.models.user import User, UserRole
from app.services.password_reset_code_service import PasswordResetCodeService
from app.utils.password import hash_password

SQLALCHEMY_DATABASE_URL = "sqlite:///./test_password_reset_code.db"
engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

EMAIL = "code_reset@example.com"
OLD_PASSWORD = "Password123!"
NEW_PASSWORD = "BrandNew123!"


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
        return True


@pytest.fixture()
def mailbox(monkeypatch):
    backend = _RecordingBackend()
    monkeypatch.setattr(
        "app.services.email_service.get_email_backend", lambda: backend
    )
    return backend


@pytest.fixture()
def clean_limits():
    """Reset the auth budgets so one test's requests cannot 429 the next."""
    db = TestingSessionLocal()
    try:
        db.query(RateLimitEvent).delete()
        db.commit()
    finally:
        db.close()


def _seed_user(email: str = EMAIL, password: str = OLD_PASSWORD) -> None:
    db = TestingSessionLocal()
    try:
        if db.query(User).filter(User.email == email).first() is None:
            db.add(
                User(
                    email=email,
                    password_hash=hash_password(password),
                    role=UserRole.client,
                    full_name="Code Reset",
                    is_verified=True,
                )
            )
            db.commit()
    finally:
        db.close()


def _code_from(mailbox) -> str:
    body = mailbox.sent[-1]["body"]
    match = re.search(r"\b(\d{6})\b", body)
    assert match, f"no 6-digit code in the delivered email: {body!r}"
    return match.group(1)


def _request_code(email: str = EMAIL):
    return client.post("/auth/forgot-password/code", json={"email": email})


def _redeem(email: str, code: str, new_password: str = NEW_PASSWORD):
    return client.post(
        "/auth/reset-password/code",
        json={"email": email, "code": code, "new_password": new_password},
    )


def _login(email: str, password: str):
    return client.post("/auth/login", json={"email": email, "password": password})


def test_code_flow_changes_the_password(mailbox, clean_limits):
    _seed_user()

    asked = _request_code()
    assert asked.status_code == 200, asked.text
    assert asked.json()["code_ttl_minutes"] == PasswordResetCodeService.CODE_TTL_MINUTES
    assert len(mailbox.sent) == 1
    assert mailbox.sent[0]["to"] == EMAIL
    assert "reset code" in mailbox.sent[0]["subject"].lower()

    code = _code_from(mailbox)
    assert len(code) == 6

    reset = _redeem(EMAIL, code)
    assert reset.status_code == 200, reset.text

    # The new password works and the old one is gone.
    assert _login(EMAIL, NEW_PASSWORD).status_code == 200
    assert _login(EMAIL, OLD_PASSWORD).status_code == 401

    # Session-invalidating state is recorded, exactly like the link flow.
    db = TestingSessionLocal()
    try:
        user = db.query(User).filter(User.email == EMAIL).first()
        assert user.password_reset_at is not None
    finally:
        db.close()


def test_unknown_address_gets_the_same_answer_and_no_mail(mailbox, clean_limits):
    known = _request_code(EMAIL)
    assert known.status_code == 200, known.text
    mailbox.sent.clear()

    unknown = _request_code("nobody-here@example.com")
    assert unknown.status_code == 200, unknown.text
    assert unknown.json()["message"] == known.json()["message"]
    assert mailbox.sent == [], "no mail may go out for an address with no account"


def test_code_is_single_use(mailbox, clean_limits):
    _seed_user("single_use@example.com")
    _request_code("single_use@example.com")
    code = _code_from(mailbox)

    assert _redeem("single_use@example.com", code).status_code == 200
    second = _redeem("single_use@example.com", code, "Another123!")
    assert second.status_code == 400, second.text


def test_newer_code_supersedes_the_older_one(mailbox, clean_limits):
    _seed_user("supersede_code@example.com")
    _request_code("supersede_code@example.com")
    first = _code_from(mailbox)

    _request_code("supersede_code@example.com")
    second = _code_from(mailbox)

    stale = _redeem("supersede_code@example.com", first)
    assert stale.status_code == 400, "the superseded code must not work"

    fresh = _redeem("supersede_code@example.com", second)
    assert fresh.status_code == 200, fresh.text


def test_guess_budget_burns_the_code(mailbox, clean_limits):
    _seed_user("bruteforce@example.com")
    _request_code("bruteforce@example.com")
    real = _code_from(mailbox)
    wrong = "000000" if real != "000000" else "111111"

    for _ in range(PasswordResetCodeService.MAX_ATTEMPTS):
        assert _redeem("bruteforce@example.com", wrong).status_code == 400

    # The budget is spent, so even the REAL code is now refused.
    burnt = _redeem("bruteforce@example.com", real)
    assert burnt.status_code == 400, burnt.text
    assert _login("bruteforce@example.com", OLD_PASSWORD).status_code == 200
