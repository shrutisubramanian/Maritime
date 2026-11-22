"""Website contact form (Services page) → services@nhaav.com.

The contact form is a real intake, not decoration: every enquiry is persisted as
a ticket AND emailed to ``CONTACT_EMAIL`` (services@nhaav.com). ``CONTACT_EMAIL``
is configuration, so these tests assert the default resolves to the real address
and that the notification actually targets it — a silent redirect to the support
inbox would leave sales enquiries unanswered.

Delivery is recorded, never performed: a recording backend stands in for
``get_email_backend`` exactly as tests/test_support_ticket_email.py does.
"""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.config import settings
from app.database import Base, get_db
from app.main import app
from app.models.support_ticket import SupportTicket
from app.services.email_service import EmailDeliveryError

SQLALCHEMY_DATABASE_URL = "sqlite:///./test_contact_enquiry.db"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


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
    def __init__(self):
        self.sent = []

    def send(self, to_email, subject, body):
        self.sent.append({"to": to_email, "subject": subject, "body": body})
        return True


class _FailingBackend:
    def send(self, to_email, subject, body):
        raise EmailDeliveryError("simulated transport failure")


@pytest.fixture()
def mailbox(monkeypatch):
    backend = _RecordingBackend()
    monkeypatch.setattr(
        "app.services.email_service.get_email_backend", lambda: backend
    )
    return backend


def _enquiry_payload(**overrides):
    payload = {
        "name": "Priya Nair",
        "email": "priya@shippingline.example",
        "company": "Nair Ship Management",
        "phone": "+91 98765 43210",
        "inquiry_type": "buyer",
        "subject": "Draft survey coverage at Chennai",
        "message": "We need draft surveys at Chennai for two bulkers next week.",
    }
    payload.update(overrides)
    return payload


def test_contact_inbox_defaults_to_services_at_nhaav():
    assert settings.CONTACT_EMAIL == "services@nhaav.com"
    # Sales enquiries and support tickets are deliberately different inboxes.
    assert settings.CONTACT_EMAIL != settings.SUPPORT_EMAIL


def test_enquiry_is_emailed_to_the_services_inbox(mailbox):
    response = client.post("/support/contact", json=_enquiry_payload())
    assert response.status_code == 201, response.text

    reference = response.json()["ticket_number"]
    assert len(mailbox.sent) == 1, "exactly one notification must be sent"

    message = mailbox.sent[-1]
    assert message["to"] == "services@nhaav.com"
    assert reference in message["subject"]
    assert message["subject"].endswith("Draft survey coverage at Chennai")
    # The details the team needs to reply travel with the notification.
    assert "priya@shippingline.example" in message["body"]
    assert "Nair Ship Management" in message["body"]
    assert "+91 98765 43210" in message["body"]
    assert "Enquiry type: buyer" in message["body"]


def test_enquiry_is_stored_even_when_the_mail_fails(monkeypatch):
    monkeypatch.setattr(
        "app.services.email_service.get_email_backend", lambda: _FailingBackend()
    )
    response = client.post(
        "/support/contact",
        json=_enquiry_payload(message="A supply enquiry whose notification fails."),
    )
    assert response.status_code == 201, response.text
    reference = response.json()["ticket_number"]

    db = TestingSessionLocal()
    try:
        stored = (
            db.query(SupportTicket)
            .filter(SupportTicket.ticket_number == reference)
            .one_or_none()
        )
    finally:
        db.close()

    assert stored is not None
    assert stored.contact_email == "priya@shippingline.example"
    assert "Nair Ship Management" in stored.description


def test_a_too_short_message_is_rejected(mailbox):
    response = client.post("/support/contact", json=_enquiry_payload(message="hi"))
    assert response.status_code == 422
    assert mailbox.sent == []
