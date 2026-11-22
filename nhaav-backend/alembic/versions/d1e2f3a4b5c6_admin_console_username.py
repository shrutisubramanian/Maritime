"""Admin console sign-in: users.username

The back-office terminal authenticates with a USERNAME + password instead of an
email address (see app/routers/admin_auth.py). The account keeps its `email`
row because the rest of the auth stack still identifies accounts that way; this
column holds the sign-in name, set by `python -m app.seed_admin` (ADMIN_USERNAME).

Nullable and unique: every existing row is NULL (ordinary accounts have no
username), so the migration is purely additive and cannot collide.

Revision ID: d1e2f3a4b5c6
Revises: e9f0a1b2c3d4
Create Date: 2026-10-27
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'd1e2f3a4b5c6'
down_revision: Union[str, Sequence[str], None] = 'e9f0a1b2c3d4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # batch mode: SQLite cannot ALTER TABLE ADD COLUMN in place under Alembic
    with op.batch_alter_table('users') as batch_op:
        batch_op.add_column(sa.Column('username', sa.String(), nullable=True))
        batch_op.create_unique_constraint('uq_users_username', ['username'])
        batch_op.create_index(batch_op.f('ix_users_username'), ['username'], unique=False)


def downgrade() -> None:
    with op.batch_alter_table('users') as batch_op:
        batch_op.drop_index(batch_op.f('ix_users_username'))
        batch_op.drop_constraint('uq_users_username', type_='unique')
        batch_op.drop_column('username')
