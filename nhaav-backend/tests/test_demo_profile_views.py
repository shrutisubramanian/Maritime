"""The demo profile-view metric is deterministic and writes one notification per
three-day interval through the existing notifications table."""
import uuid
from datetime import datetime, timedelta

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import app.models  # noqa: F401 - load every table for create_all
from app.database import Base
from app.models.notification import Notification
from app.models.user import User, UserRole
from app.services.profile_view_simulation_service import SimulatedProfileViewsService

SQLALCHEMY_DATABASE_URL = "sqlite:///./test_demo_profile_views.db"
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


def _make_user(db, role=UserRole.provider, days_old=0, email=None):
    user = User(
        email=email or f"{uuid.uuid4().hex}@example.com",
        password_hash="x",
        role=role,
        full_name="Demo Vendor",
        is_verified=True,
        created_at=datetime.utcnow() - timedelta(days=days_old),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def test_snapshot_is_stable_and_moves_every_three_days(db):
    user = _make_user(db, days_old=0)
    day_zero = SimulatedProfileViewsService.snapshot(user)
    assert day_zero["profile_views_is_demo"] is True
    assert 10 <= day_zero["profile_views"] <= 99
    assert SimulatedProfileViewsService.snapshot(user) == day_zero

    user.created_at = datetime.utcnow() - timedelta(days=3)
    db.commit()
    day_three = SimulatedProfileViewsService.snapshot(user)
    assert day_three["profile_views"] == day_zero["profile_views"] + 3

    user.created_at = datetime.utcnow() - timedelta(days=6)
    db.commit()
    day_six = SimulatedProfileViewsService.snapshot(user)
    assert day_six["profile_views"] == day_zero["profile_views"] + 6


def test_different_vendors_get_different_baselines(db):
    values = {
        SimulatedProfileViewsService.snapshot(_make_user(db))["profile_views"]
        for _ in range(8)
    }
    assert len(values) > 1


def test_clients_have_no_demo_metric_or_notification(db):
    client = _make_user(db, role=UserRole.client, days_old=30)
    assert SimulatedProfileViewsService.snapshot(client) is None
    assert SimulatedProfileViewsService.ensure_due_notification(db, client) is None
    assert db.query(Notification).filter(Notification.user_id == client.id).count() == 0


def test_notification_is_created_once_per_three_day_interval(db):
    user = _make_user(db, days_old=0)
    assert SimulatedProfileViewsService.ensure_due_notification(db, user) is None

    user.created_at = datetime.utcnow() - timedelta(days=3)
    db.commit()
    first = SimulatedProfileViewsService.ensure_due_notification(db, user)
    assert first is not None
    assert "received" in first.message.lower()
    assert "demo" in first.message.lower()

    again = SimulatedProfileViewsService.ensure_due_notification(db, user)
    assert again.id == first.id
    assert db.query(Notification).filter(Notification.user_id == user.id).count() == 1

    user.created_at = datetime.utcnow() - timedelta(days=6)
    db.commit()
    second = SimulatedProfileViewsService.ensure_due_notification(db, user)
    assert second is not None and second.id != first.id
    assert db.query(Notification).filter(Notification.user_id == user.id).count() == 2


def test_supplier_is_eligible(db):
    supplier = _make_user(db, role=UserRole.supplier, days_old=3)
    assert SimulatedProfileViewsService.snapshot(supplier)["profile_views"] >= 10
    assert SimulatedProfileViewsService.ensure_due_notification(db, supplier) is not None