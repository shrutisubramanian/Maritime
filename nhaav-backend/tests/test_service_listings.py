import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.database import Base, get_db

# Setup test DB
SQLALCHEMY_DATABASE_URL = "sqlite:///./test_services_unit.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class _MailRecorder:
    """Records emails so tests can extract verification tokens honestly."""

    def __init__(self):
        self.sent = []

    def send(self, to_email, subject, body):
        self.sent.append({"to": to_email, "subject": subject, "body": body})


def _last_token(mailbox):
    """The token now travels only inside the link (no bare code line)."""
    import re

    body = mailbox.sent[-1]["body"]
    match = re.search(r"(?:verify_token|reset_token)=([^\s&\"']+)", body)
    assert match, f"no token in the delivered link: {body!r}"
    return match.group(1)


@pytest.fixture(scope="module", autouse=True)
def setup_db():
    # Route registration/verification emails through a recorder instead of
    # the console backend (tokens are never printed to stdout anymore).
    from app.services import email_service
    from unittest.mock import patch as _patch

    mailbox = _MailRecorder()

    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()
    app.dependency_overrides[get_db] = override_get_db
    with _patch.object(email_service, "get_email_backend", lambda: mailbox):
        yield mailbox
    Base.metadata.drop_all(bind=engine)
    app.dependency_overrides.pop(get_db, None)

def test_service_listing_uniqueness(setup_db):
    mailbox = setup_db
    client = TestClient(app)

    # 1. Register provider user
    reg_resp = client.post("/auth/register", json={
        "email": "provider_uniq@nhaav.com",
        "password": "Password123!",
        "role": "provider",
        "full_name": "Unique Provider",
        "phone": "9876543210"
    })
    assert reg_resp.status_code == 201

    verify_token = _last_token(mailbox)
    client.post("/auth/verify-email", json={"token": verify_token})

    # 2. Login to get access token
    login_resp = client.post("/auth/login", json={
        "email": "provider_uniq@nhaav.com",
        "password": "Password123!"
    })
    assert login_resp.status_code == 200
    access_token = login_resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {access_token}"}

    # 3. Create Slot 1: Hydraulic Repairs → Mumbai Port
    payload1 = {
        "service_id": "Hydraulic Repairs",
        "port_id": "Mumbai Port",
        "name": "Hydraulic Repairs",
        "category": "Repairs & Maintenance",
        "description": "Hydraulic system repair at Mumbai",
        "pricing_model": "Quotation Based",
        "is_active": True
    }
    resp1 = client.post("/services/", json=payload1, headers=headers)
    assert resp1.status_code == 201
    data1 = resp1.json()
    assert data1["service_id"] == "Hydraulic Repairs"
    assert data1["port_id"] == "Mumbai Port"

    # 4. Create Slot 2: Hydraulic Repairs → Chennai Port (Different Port = Allowed)
    payload2 = {
        "service_id": "Hydraulic Repairs",
        "port_id": "Chennai Port",
        "name": "Hydraulic Repairs",
        "category": "Repairs & Maintenance",
        "description": "Hydraulic repairs at Chennai",
        "pricing_model": "Quotation Based",
        "is_active": True
    }
    resp2 = client.post("/services/", json=payload2, headers=headers)
    assert resp2.status_code == 201

    # 5. Create Slot 3: Electrical Repairs → Mumbai Port (Different Service = Allowed)
    payload3 = {
        "service_id": "Electrical Repairs",
        "port_id": "Mumbai Port",
        "name": "Electrical Repairs",
        "category": "Repairs & Maintenance",
        "description": "Electrical repairs at Mumbai",
        "pricing_model": "Quotation Based",
        "is_active": True
    }
    resp3 = client.post("/services/", json=payload3, headers=headers)
    assert resp3.status_code == 201

    # 6. DUPLICATE ATTEMPT: Hydraulic Repairs → Mumbai Port (SAME Provider + Service + Port = BLOCKED)
    resp_dup = client.post("/services/", json=payload1, headers=headers)
    assert resp_dup.status_code == 409
    assert "Duplicate listing" in resp_dup.json()["detail"]
