"""At most one ACTIVE access pass per user

Revision ID: c9d0e1f2a3b4
Revises: b8c9d0e1f2a3
Create Date: 2026-10-07

Business rule: one user account may hold at most ONE ACTIVE 6-hour session at a
time. Multiple employees of the same organization may each hold their own
ACTIVE pass simultaneously (the index is per `current_user_id`, not per
organization).

Enforced with a PARTIAL unique index so only ACTIVE rows are constrained:

    UNIQUE (current_user_id) WHERE status = 'ACTIVE'

The AVAILABLE pool and the CONSUMED history keep many rows per user and are
unaffected. This backs the service-level reuse/retry in
AccessTokenService.allocate_for_login: two concurrent logins for the same
account can never both commit an ACTIVE row for that user.

If existing data already contains more than one ACTIVE pass for a user the
upgrade fails loudly (that state should not exist); resolve the rows before
re-running.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c9d0e1f2a3b4'
down_revision: Union[str, Sequence[str], None] = 'b8c9d0e1f2a3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_PREDICATE = sa.text("status = 'ACTIVE'")


def upgrade() -> None:
    op.create_index(
        'uq_access_tokens_active_per_user',
        'access_tokens',
        ['current_user_id'],
        unique=True,
        sqlite_where=_PREDICATE,
        postgresql_where=_PREDICATE,
    )


def downgrade() -> None:
    op.drop_index('uq_access_tokens_active_per_user', table_name='access_tokens')
