"""Single-use password-reset links: users.password_reset_at

A reset token carries an ``iat``; the reset handler refuses any token issued at
or before the account's ``password_reset_at``. Without this column there is
nothing to compare against, so a reset link stayed replayable for its whole
one-hour lifetime and issuing a fresh link did not invalidate an older one.

Additive and nullable: NULL means "this account has never reset its password",
which is the correct state for every existing row (no history is invented).

Revision ID: c1d2e3f4a5b6
Revises: b1c2d3e4f5a6
Create Date: 2026-10-10
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'c1d2e3f4a5b6'
down_revision: Union[str, Sequence[str], None] = 'b1c2d3e4f5a6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # batch mode: SQLite cannot ALTER TABLE ADD COLUMN in place under Alembic
    with op.batch_alter_table('users') as batch_op:
        batch_op.add_column(sa.Column('password_reset_at', sa.DateTime(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('users') as batch_op:
        batch_op.drop_column('password_reset_at')
