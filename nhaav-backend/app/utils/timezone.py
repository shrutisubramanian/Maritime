"""Normalize stored datetimes before Python-side comparison or arithmetic.

Production runs on PostgreSQL, where a ``DateTime(timezone=True)`` column is
``timestamptz`` and the driver hands back a timezone-AWARE ``datetime``. Local
development and the test suite run on SQLite, which ignores the timezone and
hands back a NAIVE one.

Mixing the two raises::

    TypeError: can't compare offset-naive and offset-aware datetimes

so any site that compares or subtracts a value read from the database uses
``as_utc`` on BOTH sides first. It is a no-op for the values this codebase
writes (every writer stores UTC), and it makes the PostgreSQL behaviour correct
without changing column types or query semantics.
"""
from datetime import datetime, timezone


def as_utc(value: datetime) -> datetime:
    """Return ``value`` as a timezone-aware UTC datetime.

    Naive values are assumed to be UTC — that is what every writer in this
    application stores (``datetime.utcnow``). Aware values are converted to UTC
    so two timestamps from different offsets compare correctly.
    """
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)
