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

Base.metadata.drop_all(bind=engine)
Base.metadata.create_all(bind=engine)

def override_get_db():
    try:
        db = TestingSessionLocal()
        yield db
    finally:
        db.close()

app.dependency_overrides[get_db] = override_get_db

client = TestClient(app)

def test_full_auth_flow():
    # 1. Register a new user
    user_data = {
        "email": "test_auth@example.com",
        "password": "Password123!",
        "role": "client",
        "full_name": "Test User",
        "phone": "1234567890"
    }
    
    # Capture print output to get the verification token
    import sys
    from io import StringIO
    
    captured_output = StringIO()
    sys.stdout = captured_output
    
    response = client.post("/auth/register", json=user_data)
    if response.status_code != 201:
        print("Register failed:", response.text)
    assert response.status_code == 201
    assert response.json()["email"] == "test_auth@example.com"
    assert response.json()["is_verified"] == False
    
    sys.stdout = sys.__stdout__
    output = captured_output.getvalue()
    
    # Extract verification token
    # e.g. [MOCK EMAIL] To verify email for test_auth@example.com, use token: eyJhb...
    token_marker = "use token: "
    assert token_marker in output
    verify_token = output.split(token_marker)[1].split()[0]
    
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
    captured_output = StringIO()
    sys.stdout = captured_output
    
    forgot_response = client.post("/auth/forgot-password", json={"email": "test_auth@example.com"})
    assert forgot_response.status_code == 200
    
    sys.stdout = sys.__stdout__
    output = captured_output.getvalue()
    reset_token = output.split(token_marker)[1].split()[0]
    
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
