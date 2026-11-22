"""Restore rate limiting: recreate rate_limit_events (security remediation M-3)

The H10 rate-limit table was removed in a previous cleanup; this migration
recreates it in its current, minimal form so the restored rate limiter has its
counter store. Identity keys are hashed (sha256) — no raw emails or IPs.

Revision ID: f9a0b1c2d3e4
Revises: d0e1f2a3b4c5
Create Date: 2026-10-08
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'f9a0b1c2d3e4'
down_revision: Union[str, Sequence[str], None] = 'd0e1f2a3b4c5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'rate_limit_events',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('identity_hash', sa.String(length=64), nullable=False),
        sa.Column('category', sa.String(length=64), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
    )
    op.create_index(
        'ix_rate_limit_events_identity_category_created',
        'rate_limit_events',
        ['identity_hash', 'category', 'created_at'],
    )


def downgrade() -> None:
    op.drop_index(
        'ix_rate_limit_events_identity_category_created',
        table_name='rate_limit_events',
    )
    op.drop_table('rate_limit_events')
