"""Development seeding for the admin verification queue.

Creates five demo service-provider accounts with a published demo password and
pending profiles, so the admin verification screen has rows to work with.

SAFETY: these accounts use a committed password constant, so importing this
module in production refuses by default:

    ENVIRONMENT=production  ->  RuntimeError at import time (no DB access).

Set ``SEED_DEMO_ALLOW_PRODUCTION=1`` only for a deliberate, documented
exception. All database work happens inside ``seed_verification_data()``, so a
plain import creates nothing.

Usage (development only):

    python -m app.seed_verification
"""
from __future__ import annotations

import os

DEMO_PASSWORD = "Demo@123"

_ENVIRONMENT = os.getenv("ENVIRONMENT", "production").strip().lower()
_ALLOW_OVERRIDE = os.getenv("SEED_DEMO_ALLOW_PRODUCTION", "0").strip().lower() in (
    "1",
    "true",
    "yes",
)

if _ENVIRONMENT == "production" and not _ALLOW_OVERRIDE:
    raise RuntimeError(
        "Refusing to seed verification data: ENVIRONMENT=production. "
        "seed_verification.py creates demo provider accounts with a "
        "publicly-known password. Set SEED_DEMO_ALLOW_PRODUCTION=1 only for an "
        "explicit, deliberate exception."
    )


# Five providers awaiting verification. The first is the canary the guard
# tests look for; do not rename it.
DEMO_PROVIDERS = (
    {
        "email": "nordic.marine@nhaavmaritime.com",
        "full_name": "Nordic Marine Contact",
        "company_name": "Nordic Marine Services",
        "bio": "Underwater hull cleaning and inspection in Northern Europe.",
        "country": "Denmark",
        "head_office": "Copenhagen",
        "years_experience": 12,
    },
    {
        "email": "aegean.diving@nhaavmaritime.com",
        "full_name": "Aegean Diving Contact",
        "company_name": "Aegean Diving Works",
        "bio": "Underwater welding and propeller polishing.",
        "country": "Greece",
        "head_office": "Piraeus",
        "years_experience": 8,
    },
    {
        "email": "gulf.chandlers@nhaavmaritime.com",
        "full_name": "Gulf Chandlers Contact",
        "company_name": "Gulf Ship Chandlers",
        "bio": "Bonded stores, provisions and deck stores.",
        "country": "United Arab Emirates",
        "head_office": "Fujairah",
        "years_experience": 15,
    },
    {
        "email": "strait.supplies@nhaavmaritime.com",
        "full_name": "Strait Supplies Contact",
        "company_name": "Strait Marine Supplies",
        "bio": "Engine spares and technical stores.",
        "country": "Singapore",
        "head_office": "Singapore",
        "years_experience": 6,
    },
    {
        "email": "westcoast.engineering@nhaavmaritime.com",
        "full_name": "Westcoast Engineering Contact",
        "company_name": "Westcoast Marine Engineering",
        "bio": "Main engine overhauls and hydraulic repairs.",
        "country": "India",
        "head_office": "Mumbai",
        "years_experience": 20,
    },
)


def seed_verification_data() -> dict[str, int]:
    """Create the demo providers and their pending profiles.

    Idempotent: existing accounts are left untouched (no password reset, no
    profile overwrite). Returns how many users and profiles were created.
    """
    # Imported lazily so importing this module performs no database work.
    import app.models  # noqa: F401  (register every table on Base.metadata)
    from app.database import Base, SessionLocal, engine
    from app.models.profile import Profile, VerificationStatus
    from app.models.user import User, UserRole
    from app.utils.password import hash_password

    Base.metadata.create_all(bind=engine)

    created_users = 0
    created_profiles = 0
    db = SessionLocal()
    try:
        for spec in DEMO_PROVIDERS:
            user = db.query(User).filter(User.email == spec["email"]).first()
            if user is None:
                user = User(
                    email=spec["email"],
                    password_hash=hash_password(DEMO_PASSWORD),
                    role=UserRole.provider,
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
                        country=spec["country"],
                        head_office=spec["head_office"],
                        years_experience=spec["years_experience"],
                        verification_status=VerificationStatus.pending,
                    )
                )
                db.commit()
                created_profiles += 1
    finally:
        db.close()

    return {"users": created_users, "profiles": created_profiles}


if __name__ == "__main__":
    print(seed_verification_data())
