"""Support ticket intake → notification email.

Pins the operational contract that every in-app support ticket (and the general
queries the popup collects) is emailed to the platform support inbox,
``nhaavnotifications@gmail.com``. That address is configuration, not a literal sprinkled
through the code: it is ``SUPPORT_EMAIL`` in app/config.py and .env, so the
tests assert the configured value resolves to the real inbox AND that the
notification actually targets it.

Delivery is recorded, never performed: a recording backend stands in for
``get_email_backend`` exactly as tests/test_auth_flow.py does, so no SMTP
connection is opened.
"""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.database import Base, get_db
from app.config import settings
from app.models.support_ticket import SupportTicket
from app.services.email_service import EmailDeliveryError

SQLALCHEMY_DATABASE_URL = "sqlite:///./test_support_ticket_email.db"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(scope="module", autouse=True)
def _isolated_db():
    """Point the app at this module's own database for its whole lifetime.

    ``app.dependency_overrides`` is process-global and other modules register an
    override at import time; setting (and restoring) it here keeps this module
    independent of collection order.
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
    Base.metadata.drop_all(bind=engine)
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
        return True


class _FailingBackend:
    """Simulates an unreachable SMTP server."""

    def send(self, to_email, subject, body):
        raise EmailDeliveryError("simulated transport failure")


@pytest.fixture()
def mailbox(monkeypatch):
    backend = _RecordingBackend()
    monkeypatch.setattr(
        "app.services.email_service.get_email_backend", lambda: backend
    )
    return backend


def _ticket_payload(**overrides):
    payload = {
        "name": "Ravi",
        "email": "ravi@example.com",
        "subject": "Cannot upload KYC document",
        "message": "The upload spins forever and never finishes.",
        "category": "technical",
    }
    payload.update(overrides)
    return payload


def test_support_inbox_is_configured_to_nhaav_notifications():
    # The operator-facing knob resolves to the real inbox by default.
    assert settings.SUPPORT_EMAIL == "nhaavnotifications@gmail.com"


def test_ticket_notification_is_emailed_to_the_support_inbox(mailbox):
    response = client.post("/support/tickets", json=_ticket_payload())
    assert response.status_code == 201, response.text

    ticket_number = response.json()["ticket_number"]
    assert len(mailbox.sent) == 1, "exactly one notification must be sent"

    message = mailbox.sent[-1]
    assert message["to"] == "nhaavnotifications@gmail.com"
    assert ticket_number in message["subject"]
    # The reporter's grievance subject is what support sees in the mail subject.
    assert message["subject"].endswith("Cannot upload KYC document")
    # The reporter's own details travel with the notification for context.
    assert "ravi@example.com" in message["body"]


def test_ticket_is_persisted_even_when_notification_fails(monkeypatch):
    monkeypatch.setattr(
        "app.services.email_service.get_email_backend", lambda: _FailingBackend()
    )
    response = client.post(
        "/support/tickets",
        json=_ticket_payload(subject="Payments query", message="A payment query that fails to notify."),
    )
    # Best-effort delivery: the request still succeeds and the ticket is stored.
    assert response.status_code == 201, response.text
    ticket_number = response.json()["ticket_number"]

    db = TestingSessionLocal()
    try:
        stored = (
            db.query(SupportTicket)
            .filter(SupportTicket.ticket_number == ticket_number)
            .one_or_none()
        )
    finally:
        db.close()
    assert stored is not None
    # The confirmation must not claim the team was emailed when it was not.
    assert "sent it" not in response.json()["message"].lower()
