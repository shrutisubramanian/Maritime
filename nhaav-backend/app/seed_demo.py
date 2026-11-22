"""Development/demo seeding for Nhaav.

Creates a small set of demo accounts (client, supplier, service provider) with a
published demo password so a developer can exercise the three-sided flow
immediately after `alembic upgrade head`.

SAFETY: this module creates accounts whose password is a committed constant.
Importing it in production therefore refuses by default:

    ENVIRONMENT=production  ->  RuntimeError at import time (no DB access).

Set ``SEED_DEMO_ALLOW_PRODUCTION=1`` only for a deliberate, documented
exception. Everything happens inside ``seed_demo()``, so a plain import has no
side effects.

Usage (development only):

    python -m app.seed_demo
"""
from __future__ import annotations

import os

from app.models.user import UserRole

DEMO_PASSWORD = "Demo@123"

_ENVIRONMENT = os.getenv("ENVIRONMENT", "production").strip().lower()
_ALLOW_OVERRIDE = os.getenv("SEED_DEMO_ALLOW_PRODUCTION", "0").strip().lower() in (
    "1",
    "true",
    "yes",
)

if _ENVIRONMENT == "production" and not _ALLOW_OVERRIDE:
    raise RuntimeError(
        "Refusing to seed demo data: ENVIRONMENT=production. seed_demo.py "
        "creates accounts with a publicly-known password. Set "
        "SEED_DEMO_ALLOW_PRODUCTION=1 only for an explicit, deliberate exception."
    )


DEMO_ACCOUNTS = (
    {
        "email": "demo.client@nhaavmaritime.com",
        "full_name": "Demo Client",
        "role": UserRole.client,
        "company_name": "Demo Shipping Co",
        "bio": "Demo ship-owner account for local development.",
    },
    {
        "email": "demo.supplier@nhaavmaritime.com",
        "full_name": "Demo Supplier",
        "role": UserRole.supplier,
        "company_name": "Demo Chandlers",
        "bio": "Demo supplier account for local development.",
    },
    {
        "email": "demo.provider@nhaavmaritime.com",
        "full_name": "Demo Provider",
        "role": UserRole.provider,
        "company_name": "Demo Marine Services",
        "bio": "Demo service-provider account for local development.",
    },
)


def seed_demo() -> dict[str, int]:
    """Create the demo accounts that do not exist yet.

    Idempotent: re-running only fills in missing accounts. Returns a count of
    created users and profiles.
    """
    # Imported lazily so importing this module has no side effects.
    import app.models  # noqa: F401  (register every table on Base.metadata)
    from app.database import Base, SessionLocal, engine
    from app.models.profile import Profile
    from app.models.user import User
    from app.utils.password import hash_password

    Base.metadata.create_all(bind=engine)

    created_users = 0
    created_profiles = 0
    db = SessionLocal()
    try:
        for spec in DEMO_ACCOUNTS:
            user = db.query(User).filter(User.email == spec["email"]).first()
            if user is None:
                user = User(
                    email=spec["email"],
                    password_hash=hash_password(DEMO_PASSWORD),
                    role=spec["role"],
                    full_name=spec["full_name"],
                    is_verified=True,
                )
                db.add(user)
                db.commit()
                db.refresh(user)
                created_users += 1

            profile = db.query(Profile).filter(Profile.user_id == user.id).first()
            if profile is None:
                db.add(
                    Profile(
                        user_id=user.id,
                        company_name=spec["company_name"],
                        bio=spec["bio"],
                    )
                )
                db.commit()
                created_profiles += 1
    finally:
        db.close()

    return {"users": created_users, "profiles": created_profiles}


if __name__ == "__main__":
    print(seed_demo())
