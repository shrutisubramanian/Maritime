"""Regression tests for the anonymous procurement projection (M-1).

The public browse/detail endpoints must never serialize a client id, budget,
attachments or award state. These fields are available only to an eligible,
authenticated marketplace participant.
"""
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base, get_db
from app.main import app
from app.models.request import RequestStatus, ServiceRequest
from app.models.user import User, UserRole
from app.utils.password import hash_password

DB_URL = "sqlite:///./test_public_request_projection.db"
engine = create_engine(DB_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def override_get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture(scope="module", autouse=True)
def setup_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    app.dependency_overrides[get_db] = override_get_db
    db = SessionLocal()
    try:
        client = User(
            email=f"projection-{uuid.uuid4().hex[:8]}@example.com",
            password_hash=hash_password("Password123!"),
            role=UserRole.client,
            full_name="Projection Client",
            is_verified=True,
        )
        db.add(client)
        db.commit()
        db.refresh(client)
        open_request = ServiceRequest(
            client_id=client.id,
            title="Open public projection probe",
            service_type="Hull Inspection",
            port="Port of Rotterdam",
            description="Visible scope",
            budget=123456.0,
            attachments=["https://private.example.com/spec.pdf"],
            urgency="medium",
            status=RequestStatus.open,
        )
        awarded_request = ServiceRequest(
            client_id=client.id,
            title="Awarded public projection probe",
            service_type="Hull Inspection",
            port="Port of Rotterdam",
            description="Must not be public",
            budget=999.0,
            urgency="medium",
            status=RequestStatus.awarded,
        )
        db.add_all([open_request, awarded_request])
        db.commit()
        yield {
            "open_id": str(open_request.id),
            "awarded_id": str(awarded_request.id),
            "client_id": str(client.id),
        }
    finally:
        db.close()
        app.dependency_overrides.pop(get_db, None)


def test_anonymous_request_detail_omits_private_fields(setup_db):
    response = TestClient(app).get(f"/requests/{setup_db['open_id']}")
    assert response.status_code == 200, response.text
    payload = response.json()
    for private_field in ("budget", "attachments", "client_id", "selected_quotation_id"):
        assert private_field not in payload


def test_anonymous_request_list_omits_private_fields(setup_db):
    response = TestClient(app).get("/requests/?limit=50")
    assert response.status_code == 200, response.text
    rows = response.json()["data"]
    assert rows
    for row in rows:
        for private_field in ("budget", "attachments", "client_id", "selected_quotation_id"):
            assert private_field not in row


def test_anonymous_cannot_read_awarded_request(setup_db):
    response = TestClient(app).get(f"/requests/{setup_db['awarded_id']}")
    assert response.status_code == 404


def test_anonymous_client_id_filter_cannot_enumerate(setup_db):
    filtered = TestClient(app).get(
        f"/requests/?client_id={setup_db['client_id']}&limit=1"
    )
    unfiltered = TestClient(app).get("/requests/?limit=1")
    assert filtered.status_code == unfiltered.status_code == 200
    assert filtered.json()["total"] == unfiltered.json()["total"]
