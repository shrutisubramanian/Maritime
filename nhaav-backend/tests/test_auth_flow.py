# pyrefly: ignore [missing-import]
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.database import Base, get_db
from app.models.user import User

# Use a fresh in-memory SQLite database for testing
SQLALCHEMY_DATABASE_URL = "sqlite:///./test_auth.db"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(scope="module", autouse=True)
def _isolated_db():
    """
    Point the app at this module's own SQLite database.

    ``app.dependency_overrides`` is process-global and several test modules
    register an override at import time, so whichever module imports last would
    otherwise win and route these requests into another module's database. Set
    the override here — and restore whatever was there before — so the flow no
    longer depends on collection order.
    """
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)

    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    previous_override = app.dependency_overrides.get(get_db)
    app.dependency_overrides[get_db] = override_get_db
    yield
    if previous_override is None:
        app.dependency_overrides.pop(get_db, None)
    else:
        app.dependency_overrides[get_db] = previous_override


client = TestClient(app)


class _RecordingBackend:
    """Captures rendered messages instead of sending them."""

    def __init__(self):
        self.sent = []

    def send(self, to_email, subject, body):
        self.sent.append({"to": to_email, "subject": subject, "body": body})


@pytest.fixture()
def mailbox(monkeypatch):
    """
    Route delivery into an in-memory mailbox.

    Registration and forgot-password used to print the token to stdout, which
    is exactly what the production email contract forbids (see
    test_email_and_reset.py, which asserts no token reaches stdout). The token
    is taken from the delivered message body instead.
    """
    backend = _RecordingBackend()
    monkeypatch.setattr(
        "app.services.email_service.get_email_backend", lambda: backend
    )
    return backend


def _token_from_last_message(mailbox):
    """
    The token is carried inside the delivered link (and nowhere else) — the
    email no longer prints a bare code line.
    """
    import re

    body = mailbox.sent[-1]["body"]
    match = re.search(r"(?:verify_token|reset_token)=([^\s&\"']+)", body)
    assert match, f"no token in the delivered link: {body!r}"
    return match.group(1)


def test_full_auth_flow(mailbox):
    # 1. Register a new user
    user_data = {
        "email": "test_auth@example.com",
        "password": "Password123!",
        "role": "client",
        "full_name": "Test User",
        "phone": "1234567890"
    }

    response = client.post("/auth/register", json=user_data)
    assert response.status_code == 201, response.text
    assert response.json()["email"] == "test_auth@example.com"
    assert response.json()["is_verified"] == False

    # The verification link is delivered by email, never logged.
    verify_token = _token_from_last_message(mailbox)

    # 2. Verify Email
    verify_response = client.post("/auth/verify-email", json={"token": verify_token})
    assert verify_response.status_code == 200

    # 3. Login
    login_data = {
        "email": "test_auth@example.com",
        "password": "Password123!"
    }
    login_response = client.post("/auth/login", json=login_data)
    assert login_response.status_code == 200
    tokens = login_response.json()
    assert "access_token" in tokens
    assert "refresh_token" in tokens

    access_token = tokens["access_token"]
    refresh_token = tokens["refresh_token"]

    # 4. Access protected route (me)
    me_response = client.get("/auth/me", headers={"Authorization": f"Bearer {access_token}"})
    assert me_response.status_code == 200
    assert me_response.json()["is_verified"] == True

    # 5. Refresh token
    refresh_response = client.post("/auth/refresh", json={"refresh_token": refresh_token})
    assert refresh_response.status_code == 200
    new_tokens = refresh_response.json()
    assert "access_token" in new_tokens
    assert new_tokens["access_token"] != access_token

    # 6. Forgot Password
    forgot_response = client.post("/auth/forgot-password", json={"email": "test_auth@example.com"})
    assert forgot_response.status_code == 200
    reset_token = _token_from_last_message(mailbox)

    # 7. Reset Password
    reset_data = {
        "token": reset_token,
        "new_password": "NewPassword123!"
    }
    reset_response = client.post("/auth/reset-password", json=reset_data)
    assert reset_response.status_code == 200

    # 8. Login with new password
    new_login_data = {
        "email": "test_auth@example.com",
        "password": "NewPassword123!"
    }
    new_login_response = client.post("/auth/login", json=new_login_data)
    assert new_login_response.status_code == 200
