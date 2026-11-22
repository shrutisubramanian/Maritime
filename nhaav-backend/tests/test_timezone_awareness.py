"""Regression tests for the PostgreSQL timezone defect (review finding A1).

Production stores the affected columns as `DateTime(timezone=True)` -> PostgreSQL
`timestamptz` -> the driver returns a timezone-AWARE datetime. SQLite (used by
every other test) ignores the timezone and returns a NAIVE one, so a
naive/aware mix only blows up in production:

    TypeError: can't compare offset-naive and offset-aware datetimes

These tests deliberately feed AWARE datetimes into the paths that do Python-side
comparison or arithmetic, and also assert the naive (local SQLite) behaviour is
unchanged.
"""
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import app.models  # noqa: F401 - load every table for create_all
from app.database import Base
from app.models.access_token import AccessPack, AccessToken, AccessTokenStatus
from app.models.service import Service, ServiceListingStatus
from app.models.supply_listing import SupplyListing, SupplyListingStatus
from app.models.user import User, UserRole
from app.services.access_token_service import AccessTokenService
from app.services.listing_fee_service import ListingFeeService
from app.services.subscription_service import SubscriptionService
from app.utils.timezone import as_utc

SQLALCHEMY_DATABASE_URL = "sqlite:///./test_timezone_awareness.db"
engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(scope="module", autouse=True)
def _schema():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture()
def db():
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()


def _aware(hours: float) -> datetime:
    """What psycopg2 hands back for a `timestamptz` column."""
    return datetime.now(timezone.utc) + timedelta(hours=hours)


# --------------------------------------------------------------- the helper
def test_as_utc_normalizes_naive_and_aware_values():
    naive = datetime(2026, 1, 1, 12, 0, 0)
    assert as_utc(naive) == datetime(2026, 1, 1, 12, 0, 0, tzinfo=timezone.utc)
    assert as_utc(naive).tzinfo is timezone.utc

    plus_five = datetime(2026, 1, 1, 17, 0, 0, tzinfo=timezone(timedelta(hours=5)))
    assert as_utc(plus_five) == datetime(2026, 1, 1, 12, 0, 0, tzinfo=timezone.utc)


# ------------------------------------------- paid login: session payload math
def test_session_payload_accepts_timezone_aware_expiry():
    """`/auth/login` for a gated account must not raise on a timestamptz row."""
    token = AccessToken(
        id=uuid.uuid4(),
        pack_id=uuid.uuid4(),
        status=AccessTokenStatus.active,
        activated_at=_aware(-1),
        expires_at=_aware(6),
    )

    payload = AccessTokenService._session_payload(token, datetime.utcnow(), reused=False)

    assert 5 * 3600 < payload["remaining_seconds"] <= 6 * 3600
    assert payload["reused"] is False


def test_session_payload_still_accepts_naive_expiry():
    """The local SQLite shape (naive) keeps working exactly as before."""
    token = AccessToken(
        id=uuid.uuid4(),
        pack_id=uuid.uuid4(),
        status=AccessTokenStatus.active,
        activated_at=datetime.utcnow() - timedelta(hours=1),
        expires_at=datetime.utcnow() + timedelta(hours=6),
    )

    payload = AccessTokenService._session_payload(token, datetime.utcnow(), reused=True)

    assert 5 * 3600 < payload["remaining_seconds"] <= 6 * 3600
    assert payload["reused"] is True


def test_session_payload_clamps_a_closed_aware_window_to_zero():
    token = AccessToken(
        id=uuid.uuid4(),
        pack_id=uuid.uuid4(),
        status=AccessTokenStatus.active,
        expires_at=_aware(-2),
    )

    payload = AccessTokenService._session_payload(token, datetime.utcnow(), reused=False)

    assert payload["remaining_seconds"] == 0


# ------------------------------- paid access status: subscription overview math
def _gated_user_with_active_pass(db) -> tuple[User, AccessToken]:
    user = User(
        email=f"{uuid.uuid4().hex}@example.com",
        password_hash="x",
        role=UserRole.provider,
        full_name="Timezone Vendor",
        is_verified=True,
        access_control_enabled=True,
        created_at=datetime.utcnow(),
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    pack = AccessPack(owner_user_id=user.id, token_count=1)
    db.add(pack)
    db.commit()
    db.refresh(pack)

    token = AccessToken(
        owner_user_id=user.id,
        current_user_id=user.id,
        pack_id=pack.id,
        status=AccessTokenStatus.active,
        available_at=datetime.utcnow(),
        activated_at=datetime.utcnow(),
        expires_at=datetime.utcnow() + timedelta(hours=6),
    )
    db.add(token)
    db.commit()
    return user, token


def test_subscription_status_accepts_timezone_aware_active_pass(db):
    """Paid access status must survive a tz-aware `expires_at` from PostgreSQL."""
    user, token = _gated_user_with_active_pass(db)

    # Prove the identity-mapped instance carries the PostgreSQL shape.
    loaded = db.query(AccessToken).filter(AccessToken.id == token.id).one()
    loaded.expires_at = _aware(6)
    assert loaded.expires_at.tzinfo is not None

    status = SubscriptionService.get_subscription_status(db, user)

    assert status["active_pass"] is not None
    assert status["active_pass"]["remaining_seconds"] > 0


# --------------------------------------- provider/supplier listing visibility
def test_service_is_live_with_timezone_aware_window():
    live = Service(
        provider_id=uuid.uuid4(),
        status=ServiceListingStatus.approved,
        expires_at=_aware(24),
    )
    expired = Service(
        provider_id=uuid.uuid4(),
        status=ServiceListingStatus.approved,
        expires_at=_aware(-24),
    )

    assert live.is_live is True
    assert expired.is_live is False


def test_supply_listing_is_live_with_timezone_aware_window():
    live = SupplyListing(
        supplier_id=uuid.uuid4(),
        status=SupplyListingStatus.approved,
        expires_at=_aware(24),
    )
    expired = SupplyListing(
        supplier_id=uuid.uuid4(),
        status=SupplyListingStatus.approved,
        expires_at=_aware(-24),
    )

    assert live.is_live is True
    assert expired.is_live is False


def test_is_live_unchanged_for_naive_local_values():
    naive_live = Service(
        provider_id=uuid.uuid4(),
        status=ServiceListingStatus.approved,
        expires_at=datetime.utcnow() + timedelta(hours=1),
    )
    assert naive_live.is_live is True


def test_listing_fee_visibility_accepts_timezone_aware_window():
    live = Service(
        provider_id=uuid.uuid4(),
        status=ServiceListingStatus.approved,
        expires_at=_aware(24),
    )
    expired = SupplyListing(
        supplier_id=uuid.uuid4(),
        status=SupplyListingStatus.approved,
        expires_at=_aware(-24),
    )

    assert ListingFeeService.is_live(live) is True
    assert ListingFeeService.is_live(live, now=datetime.now(timezone.utc)) is True
    assert ListingFeeService.is_live(expired) is False
