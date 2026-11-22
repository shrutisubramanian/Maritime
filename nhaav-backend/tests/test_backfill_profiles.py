"""Backfill for accounts created before profiles were auto-provisioned."""
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.backfill_profiles import backfill_profiles
from app.database import Base
from app.models.profile import Profile, VerificationStatus
from app.models.user import User, UserRole


def _session():
    engine = create_engine(
        "sqlite:///./test_backfill_profiles.db", connect_args={"check_same_thread": False}
    )
    # Each test starts from an empty schema: the file is shared across this
    # module, so leftover rows would collide on the unique email index.
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    return sessionmaker(autocommit=False, autoflush=False, bind=engine)()


def test_backfill_creates_only_missing_profiles():
    db = _session()
    try:
        profiled = User(email="has@example.com", password_hash="x", role=UserRole.client)
        orphan_client = User(email="orphan@example.com", password_hash="x", role=UserRole.client)
        orphan_provider = User(email="orphanp@example.com", password_hash="x", role=UserRole.provider)
        admin = User(email="admin@example.com", password_hash="x", role=UserRole.admin)
        db.add_all([profiled, orphan_client, orphan_provider, admin])
        db.commit()
        db.add(Profile(user_id=profiled.id))
        db.commit()

        summary = backfill_profiles(db=db)

        assert sorted(summary["created"]) == ["orphan@example.com", "orphanp@example.com"]
        assert summary["admins_skipped"] == 1  # admins are exempt from the gate

        # Every non-admin account now has exactly one pending profile.
        for user in (profiled, orphan_client, orphan_provider):
            profiles = db.query(Profile).filter(Profile.user_id == user.id).all()
            assert len(profiles) == 1
            assert profiles[0].verification_status == VerificationStatus.pending
        assert db.query(Profile).filter(Profile.user_id == admin.id).first() is None

        # Idempotent: a second run creates nothing and duplicates nothing.
        again = backfill_profiles(db=db)
        assert again["created"] == []
        assert db.query(Profile).count() == 3
    finally:
        db.close()


def test_backfill_dry_run_writes_nothing():
    db = _session()
    try:
        db.add(User(email="dry@example.com", password_hash="x", role=UserRole.client))
        db.commit()

        summary = backfill_profiles(db=db, dry_run=True)

        assert summary["created"] == ["dry@example.com"]
        assert db.query(Profile).count() == 0
    finally:
        db.close()
