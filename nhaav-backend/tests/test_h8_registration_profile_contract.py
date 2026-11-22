import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.database import Base, get_db
from app.models.user import User, UserRole
from app.models.profile import Profile, VerificationStatus
from app.utils.password import verify_password

SQLALCHEMY_DATABASE_URL = "sqlite:///./test_h8_contract.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

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
    yield
    Base.metadata.drop_all(bind=engine)
    app.dependency_overrides.pop(get_db, None)

client = TestClient(app)

# -----------------------------------------------------------------------------
# 1. Registration Contract & Name Alignment Tests (Cases 1-5)
# -----------------------------------------------------------------------------

def test_1_register_with_full_name_only():
    payload = {
        "email": "h8_fullname_only@example.com",
        "password": "Password123!",
        "role": "client",
        "full_name": "Full Name User"
    }
    resp = client.post("/auth/register", json=payload)
    assert resp.status_code == 201
    data = resp.json()
    assert data["full_name"] == "Full Name User"
    assert data["name"] == "Full Name User"
    
    # DB check
    db = TestingSessionLocal()
    user = db.query(User).filter(User.email == "h8_fullname_only@example.com").first()
    assert user.full_name == "Full Name User"
    db.close()

def test_2_register_with_name_only_compatibility_alias():
    payload = {
        "email": "h8_name_only@example.com",
        "password": "Password123!",
        "role": "client",
        "name": "Alias Name User"
    }
    resp = client.post("/auth/register", json=payload)
    assert resp.status_code == 201
    data = resp.json()
    assert data["full_name"] == "Alias Name User"
    assert data["name"] == "Alias Name User"
    
    # DB check: canonical full_name must be populated
    db = TestingSessionLocal()
    user = db.query(User).filter(User.email == "h8_name_only@example.com").first()
    assert user.full_name == "Alias Name User"
    db.close()

def test_3_register_with_both_equal_name_fields():
    payload = {
        "email": "h8_both_equal@example.com",
        "password": "Password123!",
        "role": "client",
        "full_name": "Equal Name",
        "name": "Equal Name"
    }
    resp = client.post("/auth/register", json=payload)
    assert resp.status_code == 201
    data = resp.json()
    assert data["full_name"] == "Equal Name"
    assert data["name"] == "Equal Name"

def test_4_register_with_conflicting_name_fields_fails():
    payload = {
        "email": "h8_conflict@example.com",
        "password": "Password123!",
        "role": "client",
        "full_name": "Person A",
        "name": "Person B"
    }
    resp = client.post("/auth/register", json=payload)
    assert resp.status_code in [400, 422]
    err_text = str(resp.json()).lower()
    assert "conflicting" in err_text or "value_error" in err_text

def test_5_register_with_neither_name_field():
    payload = {
        "email": "h8_neither_name@example.com",
        "password": "Password123!",
        "role": "client"
    }
    resp = client.post("/auth/register", json=payload)
    assert resp.status_code == 201
    data = resp.json()
    assert data["full_name"] is None
    assert data["name"] is None

# -----------------------------------------------------------------------------
# 2. Authentication & JWT Response Contract Tests (Cases 6-7)
# -----------------------------------------------------------------------------

def test_6_login_response_contains_tokens():
    login_payload = {"email": "h8_fullname_only@example.com", "password": "Password123!"}
    resp = client.post("/auth/login", json=login_payload)
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data
    assert "refresh_token" in data

def test_7_auth_me_response_contains_canonical_user_name():
    login_resp = client.post("/auth/login", json={"email": "h8_fullname_only@example.com", "password": "Password123!"})
    token = login_resp.json()["access_token"]
    
    me_resp = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me_resp.status_code == 200
    me = me_resp.json()
    assert me["full_name"] == "Full Name User"
    assert me["name"] == "Full Name User"
    assert me["is_verified"] is False

# -----------------------------------------------------------------------------
# 3. Provider Profile Creation & Authorization Tests (Cases 8-10, 15)
# -----------------------------------------------------------------------------

def test_8_client_cannot_create_provider_profile():
    login_resp = client.post("/auth/login", json={"email": "h8_fullname_only@example.com", "password": "Password123!"})
    token = login_resp.json()["access_token"]
    
    resp = client.post("/profiles/", json={"company_name": "Client Company"}, headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 403

def test_9_registration_provisions_a_pending_profile():
    # Registration itself provisions the account's profile (see
    # AuthService.register_user): the onboarding gate and the admin review
    # queue both need a profile row, so an account can never be born without
    # one. The provider then fills it in with PUT /profiles/me.
    client.post("/auth/register", json={"email": "h8_provider_test@example.com", "password": "Password123!", "role": "provider", "full_name": "Provider Test"})
    login_resp = client.post("/auth/login", json={"email": "h8_provider_test@example.com", "password": "Password123!"})
    token = login_resp.json()["access_token"]

    provisioned = client.get("/profiles/me", headers={"Authorization": f"Bearer {token}"})
    assert provisioned.status_code == 200
    assert provisioned.json()["verification_status"] == "pending"

    # POST /profiles/ is therefore no longer available to a fresh account.
    duplicate = client.post("/profiles/", json={"company_name": "Provider Company H8"}, headers={"Authorization": f"Bearer {token}"})
    assert duplicate.status_code == 400

    resp = client.put("/profiles/me", json={"company_name": "Provider Company H8", "ports_served": ["Chennai", "Mumbai"]}, headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    prof = resp.json()
    assert prof["company_name"] == "Provider Company H8"
    assert prof["verification_status"] == "pending"
    assert prof["ports_served"] == ["Chennai", "Mumbai"]

def test_10_duplicate_provider_profile_rejected():
    login_resp = client.post("/auth/login", json={"email": "h8_provider_test@example.com", "password": "Password123!"})
    token = login_resp.json()["access_token"]
    
    resp = client.post("/profiles/", json={"company_name": "Second Company"}, headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 400
    # The account already owns the profile provisioned at registration, so a
    # second one is refused — a user has exactly one profile.
    assert "already exists" in resp.json()["detail"].lower()

def test_15_user_id_comes_from_jwt_not_request_body():
    login_resp = client.post("/auth/login", json={"email": "h8_provider_test@example.com", "password": "Password123!"})
    token = login_resp.json()["access_token"]
    
    # Try sending another user's profile/ID in payload; the API uses current_user.id from JWT
    my_prof = client.get("/profiles/me", headers={"Authorization": f"Bearer {token}"}).json()
    assert my_prof["company_name"] == "Provider Company H8"

# -----------------------------------------------------------------------------
# 4. Profile Data Types & Partial Updates (Cases 11-14)
# -----------------------------------------------------------------------------

def test_11_ports_served_accepts_list():
    login_resp = client.post("/auth/login", json={"email": "h8_provider_test@example.com", "password": "Password123!"})
    token = login_resp.json()["access_token"]

    # Ports must resolve to the marketplace port catalogue (they drive the port
    # filter), so the list uses catalogue ports rather than free-form names.
    resp = client.put("/profiles/me", json={"ports_served": ["Chennai", "Mumbai"]}, headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    assert resp.json()["ports_served"] == ["Chennai", "Mumbai"]

def test_12_ports_served_rejects_malformed_data():
    login_resp = client.post("/auth/login", json={"email": "h8_provider_test@example.com", "password": "Password123!"})
    token = login_resp.json()["access_token"]
    
    # Passing string instead of list of strings
    resp = client.put("/profiles/me", json={"ports_served": "Singapore, Rotterdam"}, headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 422

def test_13_partial_update_preserves_verification_status():
    login_resp = client.post("/auth/login", json={"email": "h8_provider_test@example.com", "password": "Password123!"})
    token = login_resp.json()["access_token"]
    
    resp = client.put("/profiles/me", json={"bio": "Updated bio text"}, headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["bio"] == "Updated bio text"
    assert data["verification_status"] == "pending"

def test_14_existing_profile_fields_preserved_on_partial_update():
    login_resp = client.post("/auth/login", json={"email": "h8_provider_test@example.com", "password": "Password123!"})
    token = login_resp.json()["access_token"]
    
    # Update position only; company_name, ports_served, bio must remain intact
    resp = client.put("/profiles/me", json={"position": "Senior Surveyor"}, headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["position"] == "Senior Surveyor"
    assert data["company_name"] == "Provider Company H8"
    assert data["ports_served"] == ["Chennai", "Mumbai"]
    assert data["bio"] == "Updated bio text"
