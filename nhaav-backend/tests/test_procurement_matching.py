import pytest
import sys
from io import StringIO
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.database import Base, get_db
from app.models.user import User, UserRole
from app.models.profile import Profile, VerificationStatus
from app.models.service import Service
from app.models.notification import Notification
from app.services.matching_service import MatchingService
from app.services.request_service import ServiceRequestService
from app.schemas.request import ServiceRequestCreate

# Setup test DB
SQLALCHEMY_DATABASE_URL = "sqlite:///./test_matching_unit.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
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

def test_procurement_matching_scenarios():
    db = TestingSessionLocal()

    # 1. Create Client User: ABC Shipping
    client_user = User(
        email="abc_shipping@nhaav.com",
        password_hash="hashed_pw",
        role=UserRole.client,
        full_name="ABC Shipping Client"
    )
    db.add(client_user)
    db.commit()

    client_profile = Profile(
        user_id=client_user.id,
        company_name="ABC Shipping",
        verification_status=VerificationStatus.verified
    )
    db.add(client_profile)
    db.commit()

    # 2. Create Provider A: Hydraulic Repairs → Mumbai Port (Active, Verified) => MATCH ✓
    prov_a_user = User(email="prov_a@nhaav.com", password_hash="hashed", role=UserRole.provider, full_name="Provider A")
    db.add(prov_a_user)
    db.commit()
    prov_a_prof = Profile(user_id=prov_a_user.id, company_name="Provider A Marine", verification_status=VerificationStatus.verified)
    db.add(prov_a_prof)
    db.commit()
    service_a = Service(
        provider_id=prov_a_user.id,
        service_id="Hydraulic Repairs",
        port_id="Mumbai Port",
        name="Hydraulic Repairs",
        category="Repairs & Maintenance",
        is_active=True
    )
    db.add(service_a)
    db.commit()

    # 3. Create Provider B: Hydraulic Repairs → Chennai Port (Active, Verified) => NO MATCH ✕ (Port mismatch)
    prov_b_user = User(email="prov_b@nhaav.com", password_hash="hashed", role=UserRole.provider, full_name="Provider B")
    db.add(prov_b_user)
    db.commit()
    prov_b_prof = Profile(user_id=prov_b_user.id, company_name="Provider B Marine", verification_status=VerificationStatus.verified)
    db.add(prov_b_prof)
    db.commit()
    service_b = Service(
        provider_id=prov_b_user.id,
        service_id="Hydraulic Repairs",
        port_id="Chennai Port",
        name="Hydraulic Repairs",
        category="Repairs & Maintenance",
        is_active=True
    )
    db.add(service_b)
    db.commit()

    # 4. Create Provider C: Electrical Repairs → Mumbai Port (Active, Verified) => NO MATCH ✕ (Service mismatch)
    prov_c_user = User(email="prov_c@nhaav.com", password_hash="hashed", role=UserRole.provider, full_name="Provider C")
    db.add(prov_c_user)
    db.commit()
    prov_c_prof = Profile(user_id=prov_c_user.id, company_name="Provider C Marine", verification_status=VerificationStatus.verified)
    db.add(prov_c_prof)
    db.commit()
    service_c = Service(
        provider_id=prov_c_user.id,
        service_id="Electrical Repairs",
        port_id="Mumbai Port",
        name="Electrical Repairs",
        category="Repairs & Maintenance",
        is_active=True
    )
    db.add(service_c)
    db.commit()

    # 5. Create Provider D: Hydraulic Repairs → Mumbai Port (Listing DISABLED, Verified) => NO MATCH ✕ (is_active=False)
    prov_d_user = User(email="prov_d@nhaav.com", password_hash="hashed", role=UserRole.provider, full_name="Provider D")
    db.add(prov_d_user)
    db.commit()
    prov_d_prof = Profile(user_id=prov_d_user.id, company_name="Provider D Marine", verification_status=VerificationStatus.verified)
    db.add(prov_d_prof)
    db.commit()
    service_d = Service(
        provider_id=prov_d_user.id,
        service_id="Hydraulic Repairs",
        port_id="Mumbai Port",
        name="Hydraulic Repairs",
        category="Repairs & Maintenance",
        is_active=False  # Disabled listing!
    )
    db.add(service_d)
    db.commit()

    # 6. Create Provider E: Hydraulic Repairs → Mumbai Port (UNVERIFIED Profile, Active Listing) => NO MATCH ✕ (Unverified)
    prov_e_user = User(email="prov_e@nhaav.com", password_hash="hashed", role=UserRole.provider, full_name="Provider E")
    db.add(prov_e_user)
    db.commit()
    prov_e_prof = Profile(user_id=prov_e_user.id, company_name="Provider E Marine", verification_status=VerificationStatus.pending)
    db.add(prov_e_prof)
    db.commit()
    service_e = Service(
        provider_id=prov_e_user.id,
        service_id="Hydraulic Repairs",
        port_id="Mumbai Port",
        name="Hydraulic Repairs",
        category="Repairs & Maintenance",
        is_active=True
    )
    db.add(service_e)
    db.commit()

    # 7. Create Procurement Request: Service: Hydraulic Repairs, Port: Mumbai Port
    req_data = ServiceRequestCreate(
        title="Emergency Hydraulic Repair",
        service_type="Hydraulic Repairs",
        port="Mumbai Port",
        description="Urgent hydraulic pump overhaul required at Mumbai Port",
        request_type="service"
    )

    created_request = ServiceRequestService.create_request(db, client_user.id, req_data)

    # 8. VERIFY MATCHING SERVICE:
    matched_providers = MatchingService.get_eligible_providers(db, created_request)
    matched_user_ids = [p.user_id for p in matched_providers]

    # ONLY Provider A must match!
    assert len(matched_providers) == 1
    assert prov_a_user.id in matched_user_ids
    assert prov_b_user.id not in matched_user_ids
    assert prov_c_user.id not in matched_user_ids
    assert prov_d_user.id not in matched_user_ids
    assert prov_e_user.id not in matched_user_ids

    # 9. VERIFY NOTIFICATIONS (Requirement 11):
    # Provider A must have received the notification
    notifs_a = db.query(Notification).filter(Notification.user_id == prov_a_user.id).all()
    assert len(notifs_a) == 1
    assert notifs_a[0].title == "New Procurement Request"
    assert "Hydraulic Repairs" in notifs_a[0].message
    assert "Mumbai Port" in notifs_a[0].message
    assert "ABC Shipping" in notifs_a[0].message
    assert "[View Request]" in notifs_a[0].message

    # Providers B, C, D, E must have received 0 notifications!
    for p_user in [prov_b_user, prov_c_user, prov_d_user, prov_e_user]:
        p_notifs = db.query(Notification).filter(Notification.user_id == p_user.id).all()
        assert len(p_notifs) == 0, f"Provider {p_user.email} should not have received a notification"

    db.close()
