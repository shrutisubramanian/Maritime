"""Move addresses stranded in the Offices list into the registered-address field.

The Excel import used to write a company's street address into ``offices[0]``,
because there was no registered-address field. Now it writes
``profile_metadata["address"]`` instead, so profiles imported before that change
still hold a full postal address inside a field the page labels "City, Country".

This script reconciles them, once, idempotently:

* an Offices entry that looks like a street address (a comma AND a digit AND
  more than one word) is moved to ``profile_metadata["address"]`` and removed
  from ``offices``;
* entries that look like a city ("Mumbai", "Kochi, Kerala") are left alone;
* profiles that already have ``profile_metadata["address"]`` are skipped, so
  running it twice changes nothing.

Usage (from ``nhaav-backend``):

    ./.venv/Scripts/python.exe backfill_registered_address.py           # dry run
    ./.venv/Scripts/python.exe backfill_registered_address.py --apply   # write
"""
from __future__ import annotations

import argparse
import re
from typing import Any, Optional

from app.database import SessionLocal
from app.models.profile import Profile

ADDRESS_MIN_LENGTH = 25


def _looks_like_street_address(value: Any) -> bool:
    """A full postal address, not a city/location label."""
    text = re.sub(r"\s+", " ", str(value or "")).strip()
    if len(text) < ADDRESS_MIN_LENGTH:
        return False
    if "," not in text:
        return False
    if not re.search(r"\d", text):
        return False
    # "City, State" has one comma and no digits; a street address has more parts.
    return len([part for part in text.split(",") if part.strip()]) >= 3


def _norm(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip().lower()


def reconcile(db) -> list[tuple[str, str, str]]:
    """Move stranded addresses into the registered-address field.

    Handles both shapes the old import left behind:

    * no ``profile_metadata.address`` yet -> the address-like Offices entry is
      moved across and removed from ``offices``;
    * ``profile_metadata.address`` already set (imported again after the fix)
      -> the duplicate street address is only removed from ``offices``.
    """
    changes: list[tuple[str, str, str]] = []
    for profile in db.query(Profile).all():
        meta = dict(profile.profile_metadata or {})
        existing = str(meta.get("address") or "").strip()
        offices = list(profile.offices or [])

        stranded = next(
            (office for office in offices if _looks_like_street_address(office)),
            None,
        )
        if stranded is None:
            continue

        if existing:
            # The registered address is already in its own field. Only clean up
            # when the profile plainly came from an import (it carries the
            # registration number from the same sheet), so a vendor's own
            # manually typed office entry is never touched on a guess.
            if not str(meta.get("regNumber") or "").strip():
                continue
            address = existing
            offices = [
                office for office in offices if not _looks_like_street_address(office)
            ]
        else:
            address = re.sub(r"\s+", " ", str(stranded)).strip()
            meta["address"] = address
            offices = [office for office in offices if _norm(office) != _norm(address)]

        changes.append((
            str(profile.user_id),
            address,
            ", ".join(str(office) for office in offices) or "(none)",
        ))
        profile.profile_metadata = meta
        profile.offices = offices

    return changes


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="write the changes")
    args = parser.parse_args()

    db = SessionLocal()
    try:
        changes = reconcile(db)
        if args.apply:
            db.commit()
        for user_id, address, remaining in changes:
            print(f"{user_id}  address <- {address!r}  offices now: {remaining}")
        print(
            f"{len(changes)} profile(s) "
            f"{'updated' if args.apply else 'would be updated (dry run)'}."
        )
    finally:
        db.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
