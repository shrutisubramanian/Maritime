"""One device per login: users.active_device_id / _label / _at

An account may use the platform from ONE device at a time. The device that
logged in last owns the session; a second device presenting the same correct
credentials is challenged with "switch devices?" and, if it confirms, takes the
session over and signs the first device out.

These columns hold that binding. All three are nullable and additive: NULL means
"this account is signed out", which is the correct state for every existing row.

Revision ID: d7e8f9a0b1c2
Revises: c1d2e3f4a5b6
Create Date: 2026-10-12
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'd7e8f9a0b1c2'
down_revision: Union[str, Sequence[str], None] = 'c1d2e3f4a5b6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # batch mode: SQLite cannot ALTER TABLE ADD COLUMN in place under Alembic
    with op.batch_alter_table('users') as batch_op:
        batch_op.add_column(sa.Column('active_device_id', sa.String(length=128), nullable=True))
        batch_op.add_column(sa.Column('active_device_label', sa.String(length=120), nullable=True))
        batch_op.add_column(sa.Column('active_device_at', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('users') as batch_op:
        batch_op.drop_column('active_device_at')
        batch_op.drop_column('active_device_label')
        batch_op.drop_column('active_device_id')
