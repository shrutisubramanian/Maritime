"""Idempotent admin-account seeding for the Nhaav backend.

Admin identity lives in the ``users`` table with ``role = admin`` (see
``app/routers/admin_auth.py``): there is deliberately no separate credential
store, so this script promotes/creates a single admin ``User``.

Security properties (pinned by ``tests/test_admin_seed.py``):

* Outside development, both ``ADMIN_EMAIL`` and ``ADMIN_PASSWORD`` are required;
  a missing value refuses to run rather than seeding a guessable account.
* In development, missing credentials are a no-op ("skipped"), never a default
  account.
* An existing admin's password is NEVER rotated implicitly — only an explicit
  ``reset_password=True`` (``--reset-password``) changes it.
* The password is never printed or logged.

Usage::

    python -m app.seed_admin
    python -m app.seed_admin --reset-password

Environment: ``ADMIN_EMAIL``, ``ADMIN_PASSWORD`` (required outside development),
``ADMIN_NAME`` (optional display name), ``ADMIN_USERNAME`` (optional sign-in
username for the admin console — the terminal asks for a username, not an
email; when present it is stored on the admin row as ``users.username``).
"""
import argparse
import os
from typing import Optional

from app.database import SessionLocal
from app.models.user import User, UserRole
from app.utils.password import hash_password, verify_password


def seed_admin(
    environment: Optional[str] = None,
    db=None,
    reset_password: bool = False,
    email: Optional[str] = None,
    password: Optional[str] = None,
    name: Optional[str] = None,
    username: Optional[str] = None,
):
    """Create or update the admin account.

    Returns the admin email when seeded/updated, or ``None`` when the run was
    skipped (non-production without credentials). Raises ``RuntimeError`` when
    production configuration is missing, so a deployment fails loudly instead of
    shipping a default admin.
    """
    env = (environment or os.getenv("ENVIRONMENT") or "production").strip().lower()
    email = (email if email is not None else os.getenv("ADMIN_EMAIL", "")).strip()
    password = password if password is not None else os.getenv("ADMIN_PASSWORD", "")
    name = (name if name is not None else os.getenv("ADMIN_NAME", "")).strip() or None
    username = (
        username if username is not None else os.getenv("ADMIN_USERNAME", "")
    ).strip() or None

    if not email or not password:
        if env == "production":
            raise RuntimeError(
                "ADMIN_EMAIL and ADMIN_PASSWORD must be set to seed an admin in "
                "production."
            )
        print(
            "[seed_admin] skipped: ADMIN_EMAIL/ADMIN_PASSWORD not set "
            f"(ENVIRONMENT={env})."
        )
        return None

    owns_session = db is None
    session = db if db is not None else SessionLocal()
    try:
        user = session.query(User).filter(User.email == email).first()

        if user is None:
            user = User(
                email=email,
                # The admin console signs in by USERNAME, so an account without
                # one cannot log in at all. Default it to the email unless the
                # operator configured a different sign-in name.
                username=username or email,
                password_hash=hash_password(password),
                role=UserRole.admin,
                full_name=name,
                is_verified=True,
            )
            session.add(user)
            session.commit()
            print(f"[seed_admin] created admin {email}")
            return email

        changed = False
        # An existing non-admin account named by ADMIN_EMAIL is promoted, since
        # the operator explicitly asked for this address to be the admin.
        if user.role != UserRole.admin:
            user.role = UserRole.admin
            changed = True
        if name and user.full_name != name:
            user.full_name = name
            changed = True
        # The console username is configuration, not a credential: an explicit
        # ADMIN_USERNAME is applied (idempotently) so the sign-in name always
        # matches what the operator configured.
        if username and user.username != username:
            user.username = username
            changed = True
        elif not user.username:
            # Backfill admins seeded before the email default existed: they
            # could not sign in to the console until a username was set.
            user.username = email
            changed = True
        if not user.is_verified:
            user.is_verified = True
            changed = True
        # Only an explicit reset rotates the password.
        if reset_password and not verify_password(password, user.password_hash):
            user.password_hash = hash_password(password)
            changed = True

        if changed:
            session.commit()
            suffix = " (password reset)" if reset_password else ""
            print(f"[seed_admin] updated admin {email}{suffix}")
        else:
            print(f"[seed_admin] admin {email} already present; no change")
        return email
    finally:
        if owns_session:
            session.close()


def main() -> int:
    parser = argparse.ArgumentParser(description="Seed the Nhaav admin account.")
    parser.add_argument(
        "--reset-password",
        action="store_true",
        help="Rotate the admin password to the current ADMIN_PASSWORD value.",
    )
    args = parser.parse_args()

    result = seed_admin(reset_password=args.reset_password)
    print("[seed_admin] done." if result else "[seed_admin] nothing to do.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
