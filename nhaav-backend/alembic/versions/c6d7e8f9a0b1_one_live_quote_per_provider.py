"""One live quote per provider per request

The quote flow checked for an existing quote in application code only, so two
concurrent submissions by the same provider could both pass the check and create
two quotes for one request. This adds the database guarantee the code relies on.

The index is PARTIAL (``status IN ('submitted','under_review','accepted')``) for
two reasons:

* a rejected/expired quote may legitimately be re-submitted, and
* legacy rows are never rewritten or deleted — historical duplicates in a
  non-live status do not block the migration.

If live duplicates already exist, the migration stops with an explicit message
instead of silently discarding business records; an operator has to decide which
quote to keep.

Revision ID: c6d7e8f9a0b1
Revises: b5a6c7d8e9f4
Create Date: 2026-11-01
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = 'c6d7e8f9a0b1'
down_revision: Union[str, Sequence[str], None] = 'b5a6c7d8e9f4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_LIVE = sa.text("status IN ('submitted', 'under_review', 'accepted')")


def upgrade() -> None:
    duplicate = op.get_bind().execute(
        sa.text(
            "SELECT COUNT(*) FROM ("
            "  SELECT provider_id, request_id FROM quotes"
            "  WHERE status IN ('submitted', 'under_review', 'accepted')"
            "  GROUP BY provider_id, request_id HAVING COUNT(*) > 1"
            ") AS dupes"
        )
    ).scalar() or 0
    if duplicate:
        raise RuntimeError(
            f"{duplicate} (provider, request) pair(s) already hold more than one "
            "live quote. Resolve those rows (keep one, set the others to "
            "'rejected') before applying this migration."
        )

    op.create_index(
        'uq_quotes_provider_request_live',
        'quotes',
        ['provider_id', 'request_id'],
        unique=True,
        sqlite_where=_LIVE,
        postgresql_where=_LIVE,
    )


def downgrade() -> None:
    op.drop_index('uq_quotes_provider_request_live', table_name='quotes')
