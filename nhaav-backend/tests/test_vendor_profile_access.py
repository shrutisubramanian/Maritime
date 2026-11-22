"""Provider/supplier accounts must not inspect another vendor's profile.

Clients remain the buyer audience and can read any vendor's safe public view.
Admins retain support access, and every account can read its own profile.
The same rule applies to the company-profile and brochure routes.
"""
import uuid
from datetime import datetime, timedelta

import jwt
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.config import settings
from app.database import Base, get_db
from app.main import app
from app.models.profile import Profile, VerificationStatus
from app.models.profile_visibility import (
    ProfileVisibility,
    ProfileVisibilityPlan,
    ProfileVisibilityStatus,
)
from app.models.user import User, UserRole
from app.utils.password import hash_password
from entitlement_helpers import grant_marketplace_access

SQLALCHEMY_DATABASE_URL = "sqlite:///./test_vendor_profile_access.db"
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


@pytest.fixture(scope="module", autouse=True)
def setup_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    app.dependency_overrides[get_db] = override_get_db
    yield
    Base.metadata.drop_all(bind=engine)
    app.dependency_overrides.pop(get_db, None)


def _token(user: User) -> dict:
    tok = jwt.encode(
        {"sub": str(user.id)}, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM
    )
    return {"Authorization": f"Bearer {tok}"}


def _account(db, role: UserRole, company: str):
    email = f"{uuid.uuid4().hex[:10]}@vendor-access.test"
    user = User(
        email=email,
        password_hash=hash_password("Password123!"),
        role=role,
        full_name=company,
        is_verified=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    profile = Profile(
        user_id=user.id,
        company_name=company,
        verification_status=VerificationStatus.verified,
    )
    db.add(profile)
    db.commit()
    db.refresh(profile)
    grant_marketplace_access(db, user)
    return user, profile


def _grant_visibility(db, profile: Profile) -> None:
    now = datetime.utcnow()
    db.add(
        ProfileVisibility(
            profile_id=profile.id,
            owner_user_id=profile.user_id,
            plan=ProfileVisibilityPlan.monthly,
            period_days=30,
            base_amount_paise=100_000,
            gst_rate_percent=18,
            gst_amount_paise=18_000,
            total_amount_paise=118_000,
            utr=f"UTR{uuid.uuid4().hex[:10].upper()}",
            payment_date=now,
            receipt_path="uploads/payment_receipts/test.pdf",
            receipt_filename="test.pdf",
            status=ProfileVisibilityStatus.VERIFIED,
            starts_at=now,
            expires_at=now + timedelta(days=30),
        )
    )
    db.commit()


@pytest.fixture(scope="module")
def accounts():
    db = TestingSessionLocal()
    try:
        provider_a, provider_a_profile = _account(db, UserRole.provider, "Provider Alpha")
        provider_b, provider_b_profile = _account(db, UserRole.provider, "Provider Beta")
        supplier_a, supplier_a_profile = _account(db, UserRole.supplier, "Supplier Alpha")
        supplier_b, supplier_b_profile = _account(db, UserRole.supplier, "Supplier Beta")
        client_a, client_a_profile = _account(db, UserRole.client, "Client Alpha")
        client_b, client_b_profile = _account(db, UserRole.client, "Client Beta")

        for profile in (
            provider_a_profile,
            provider_b_profile,
            supplier_a_profile,
            supplier_b_profile,
        ):
            _grant_visibility(db, profile)

        return {
            "provider_a": {"user_id": provider_a.id, "profile_id": provider_a_profile.id, "headers": _token(provider_a)},
            "provider_b": {"user_id": provider_b.id, "profile_id": provider_b_profile.id, "headers": _token(provider_b)},
            "supplier_a": {"user_id": supplier_a.id, "profile_id": supplier_a_profile.id, "headers": _token(supplier_a)},
            "supplier_b": {"user_id": supplier_b.id, "profile_id": supplier_b_profile.id, "headers": _token(supplier_b)},
            "client_a": {"user_id": client_a.id, "profile_id": client_a_profile.id, "headers": _token(client_a)},
            "client_b": {"user_id": client_b.id, "profile_id": client_b_profile.id, "headers": _token(client_b)},
        }
    finally:
        db.close()


def _public_urls(account: dict) -> tuple[str, str, str, str]:
    return (
        f"/profiles/{account['profile_id']}/public",
        f"/profiles/by-user/{account['user_id']}/public",
        f"/marketplace/companies/{account['profile_id']}",
        f"/marketplace/companies/{account['profile_id']}/brochure",
    )


def test_client_can_open_vendor_profiles(accounts):
    api = TestClient(app)
    headers = accounts["client_a"]["headers"]

    for key in ("provider_a", "supplier_a"):
        for url in _public_urls(accounts[key])[:3]:
            response = api.get(url, headers=headers)
            assert response.status_code == 200, (key, url, response.text)


def test_provider_cannot_open_another_providers_profile(accounts):
    api = TestClient(app)
    headers = accounts["provider_a"]["headers"]

    for url in _public_urls(accounts["provider_b"]):
        response = api.get(url, headers=headers)
        assert response.status_code == 403, (url, response.text)

    # The legacy detail endpoint must not become a fallback.
    response = api.get(
        f"/profiles/{accounts['provider_b']['profile_id']}", headers=headers
    )
    assert response.status_code == 403, response.text


def test_supplier_cannot_open_another_supplier_or_provider(accounts):
    api = TestClient(app)
    headers = accounts["supplier_a"]["headers"]

    for other in ("supplier_b", "provider_b"):
        for url in _public_urls(accounts[other]):
            response = api.get(url, headers=headers)
            assert response.status_code == 403, (other, url, response.text)


def test_vendor_can_open_its_own_profile(accounts):
    api = TestClient(app)

    for key in ("provider_a", "supplier_a"):
        account = accounts[key]
        for url in _public_urls(account)[:3]:
            response = api.get(url, headers=account["headers"])
            assert response.status_code == 200, (key, url, response.text)


def test_client_cannot_open_another_clients_profile(accounts):
    api = TestClient(app)
    headers = accounts["client_b"]["headers"]
    other = accounts["client_a"]

    for url in (
        f"/profiles/{other['profile_id']}/public",
        f"/profiles/by-user/{other['user_id']}/public",
    ):
        response = api.get(url, headers=headers)
        assert response.status_code == 403, (url, response.text)

    own = api.get(
        f"/profiles/{accounts['client_b']['profile_id']}/public",
        headers=headers,
    )
    # This fixture creates a profile for the client, so ownership is allowed.
    assert own.status_code == 200, own.text
