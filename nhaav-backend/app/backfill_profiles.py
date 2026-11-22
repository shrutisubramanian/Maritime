"""Backfill the missing Profile rows that older accounts were created without.

``AuthService.register_user`` now provisions a profile for every account, but
accounts created BEFORE that change have no profile row. Those accounts are
stuck: the marketplace gate (``app/services/onboarding_service.py``) needs an
admin-approved profile, and the admin review queue is fed by profiles, so an
account with no profile can never be approved — it sits at "awaiting review"
forever with nothing for the admin to click.

This script is idempotent: it gives every non-admin account that lacks a profile
one, leaving accounts that already have theirs untouched. Existing profile data
is never modified.

Usage::

    python -m app.backfill_profiles            # apply
    python -m app.backfill_profiles --dry-run  # report only
"""
import argparse

from app.database import SessionLocal
from app.models.profile import Profile
from app.models.user import User, UserRole


def backfill_profiles(db=None, dry_run: bool = False) -> dict:
    """Create a pending profile for every non-admin account missing one.

    Returns a summary dict: ``{"created": [...emails], "already_present": n,
    "admins_skipped": n}``. Admins are skipped — they operate the review queue
    and are exempt from the marketplace gate.
    """
    owns_session = db is None
    session = db if db is not None else SessionLocal()
    try:
        users = session.query(User).all()
        profiled_ids = {row[0] for row in session.query(Profile.user_id).all()}

        created: list[str] = []
        admins_skipped = 0
        for user in users:
            if user.role == UserRole.admin:
                admins_skipped += 1
                continue
            if user.id in profiled_ids:
                continue
            created.append(user.email)
            if not dry_run:
                session.add(Profile(user_id=user.id))
        if not dry_run and created:
            session.commit()

        return {
            "created": created,
            "already_present": len(profiled_ids),
            "admins_skipped": admins_skipped,
        }
    finally:
        if owns_session:
            session.close()


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Give every account missing one a pending profile row."
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Report what would be created without writing anything.",
    )
    args = parser.parse_args()

    summary = backfill_profiles(dry_run=args.dry_run)
    verb = "would create" if args.dry_run else "created"
    print(
        f"[backfill_profiles] {verb} {len(summary['created'])} profile(s); "
        f"already present: {summary['already_present']}; "
        f"admins skipped: {summary['admins_skipped']}."
    )
    for email in summary["created"]:
        print(f"  - {email}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
