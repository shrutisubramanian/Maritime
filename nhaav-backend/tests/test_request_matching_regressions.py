"""Regression tests for the two request-matching launch blockers.

1. A supplier whose listing declares "Mumbai Port" must receive a procurement
   request submitted for "Mumbai" — the marketplace sends the canonical short
   port name while legacy listings store the fuller spelling.
2. A provider whose profile Main Category is "Ship Repair & Services" and whose
   head office is Mumbai must receive a service request for that category even
   when it has NO legacy `Service` row for it.
"""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.database import Base, get_db
from app.models.user import User, UserRole
from app.models.profile import Profile, VerificationStatus
from app.models.service import Service
from app.models.supply_listing import SupplyListing, SupplyListingStatus
from app.models.vendor_category import VendorCategory, VendorType
from app.models.notification import Notification
from app.services.matching_service import MatchingService
from app.services.request_service import ServiceRequestService
from app.schemas.request import ServiceRequestCreate

SQLALCHEMY_DATABASE_URL = "sqlite:///./test_request_matching_regression.db"
engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = override_get_db


@pytest.fixture(scope="module", autouse=True)
def setup_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


def _client(db, email="regression_client@nhaav.com"):
    user = User(
        email=email,
        password_hash="hashed_pw",
        role=UserRole.client,
        full_name="Regression Client",
        is_verified=True,
    )
    db.add(user)
    db.commit()
    db.add(
        Profile(
            user_id=user.id,
            company_name="Regression Shipping",
            verification_status=VerificationStatus.verified,
        )
    )
    db.commit()
    return user


def test_supplier_with_full_port_name_receives_request_for_short_port_name():
    db = TestingSessionLocal()
    client_user = _client(db, "port_client@nhaav.com")

    supplier = User(
        email="port_supplier@nhaav.com",
        password_hash="hashed",
        role=UserRole.supplier,
        full_name="Port Supplier",
        is_verified=True,
    )
    db.add(supplier)
    db.commit()
    db.add(
        Profile(
            user_id=supplier.id,
            company_name="Mumbai Spares",
            verification_status=VerificationStatus.verified,
            head_office="Mumbai",
        )
    )
    db.add(
        SupplyListing(
            supplier_id=supplier.id,
            name="Marine Lubricant Oil 20L Drum",
            category="Lubricants",
            status=SupplyListingStatus.approved,
            # The legacy/full spelling, exactly as the failing check found it.
            ports=["Port of Rotterdam", "Mumbai Port"],
        )
    )
    db.commit()

    created = ServiceRequestService.create_request(
        db,
        client_user.id,
        ServiceRequestCreate(
            title="Lubricants for dry dock",
            service_type="Lubricants",
            port="Mumbai",  # canonical short name the marketplace sends
            request_type="supply",
            quantity=2,
        ),
    )

    recipients = MatchingService.get_eligible_recipients(db, created)
    assert supplier.id in recipients, "supplier listing Mumbai Port must match a Mumbai request"

    notifs = db.query(Notification).filter(Notification.user_id == supplier.id).all()
    assert len(notifs) == 1
    assert notifs[0].title == "New Procurement Request"

    # No false positives: an unrelated port must not match.
    other = ServiceRequestService.create_request(
        db,
        client_user.id,
        ServiceRequestCreate(
            title="Lubricants for dry dock",
            service_type="Lubricants",
            port="Chennai",
            request_type="supply",
            quantity=2,
        ),
    )
    assert supplier.id not in MatchingService.get_eligible_recipients(db, other)
    db.close()


def test_provider_matched_by_main_category_without_legacy_service_row():
    db = TestingSessionLocal()
    client_user = _client(db, "category_client@nhaav.com")

    category = VendorCategory(
        vendor_type=VendorType.provider, name="Ship Repair & Services"
    )
    db.add(category)
    db.commit()

    provider = User(
        email="category_provider@nhaav.com",
        password_hash="hashed",
        role=UserRole.provider,
        full_name="Category Provider",
        is_verified=True,
    )
    db.add(provider)
    db.commit()
    db.add(
        Profile(
            user_id=provider.id,
            company_name="Category Marine Works",
            verification_status=VerificationStatus.verified,
            primary_category_id=category.id,
            head_office="Mumbai",
            ports_served=["Mumbai"],
        )
    )
    db.commit()

    # Deliberately NO Service row for "Ship Repair & Services".
    created = ServiceRequestService.create_request(
        db,
        client_user.id,
        ServiceRequestCreate(
            title="Main category service request",
            service_type="Ship Repair & Services",
            port="Mumbai",
            request_type="service",
        ),
    )

    recipients = MatchingService.get_eligible_recipients(db, created)
    assert provider.id in recipients, (
        "a verified provider whose Main Category matches the request must be eligible"
    )

    notifs = db.query(Notification).filter(Notification.user_id == provider.id).all()
    assert len(notifs) == 1
    assert notifs[0].title == "New Procurement Request"

    # A different category must not reach this provider.
    other = ServiceRequestService.create_request(
        db,
        client_user.id,
        ServiceRequestCreate(
            title="Different category",
            service_type="Fuel and Bunkering",
            port="Mumbai",
            request_type="service",
        ),
    )
    assert provider.id not in MatchingService.get_eligible_recipients(db, other)
    db.close()
