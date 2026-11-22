"""F-1: enforce one LIVE payment per UTR at the database level

Security remediation follow-up from SECURITY_SIGNOFF_REPORT.md. The service
already refuses a duplicate UTR (409) with a pre-insert lookup, but that check
has a check-then-insert race: two concurrent submissions with the same
reference could both commit into PENDING. This migration adds a unique partial
index over LIVE payment statuses, closing the race at the database.

REJECTED/CANCELLED rows fall outside the index predicate, so the existing
business behavior — a rejected reference may be corrected and re-submitted —
is preserved.

Revision ID: a0b1c2d3e4f5
Revises: f9a0b1c2d3e4
Create Date: 2026-10-08
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'a0b1c2d3e4f5'
down_revision: Union[str, Sequence[str], None] = 'f9a0b1c2d3e4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_LIVE_PREDICATE = sa.text("status IN ('PENDING', 'SUBMITTED', 'VERIFIED')")


def upgrade() -> None:
    # Defensive dedup so the unique index can always be created: if a legacy
    # database somehow holds two LIVE payments with the same reference, keep
    # the newest and CANCEL the older strays (they never activated anything
    # that the newest didn't). No-op on any clean database.
    op.execute(
        """
        UPDATE payments
        SET status = 'CANCELLED',
            rejection_reason = COALESCE(
                rejection_reason,
                'Superseded: a newer submission with the same reference exists.')
        WHERE id IN (
            SELECT p.id FROM payments p
            JOIN payments newer
              ON newer.utr = p.utr
             AND newer.status IN ('PENDING', 'SUBMITTED', 'VERIFIED')
             AND p.status IN ('PENDING', 'SUBMITTED', 'VERIFIED')
             AND newer.created_at > p.created_at
        )
        """
    )
    op.create_index(
        'ux_payments_live_utr',
        'payments',
        ['utr'],
        unique=True,
        sqlite_where=_LIVE_PREDICATE,
        postgresql_where=_LIVE_PREDICATE,
    )


def downgrade() -> None:
    op.drop_index('ux_payments_live_utr', table_name='payments')
