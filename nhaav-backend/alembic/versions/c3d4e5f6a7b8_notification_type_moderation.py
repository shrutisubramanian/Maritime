"""Notification type 'moderation' for listing approve/reject fan-out

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-10-05

Adds the `moderation` member to the notifications.type enum (SQLite CHECK
constraint), so ModerationService can notify listing owners on approve/reject.
Existing rows are unaffected: the enum gains a value, no data is rewritten.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c3d4e5f6a7b8'
down_revision: Union[str, Sequence[str], None] = 'b2c3d4e5f6a7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_OLD_ENUM = sa.Enum(
    'quote', 'quotation', 'procurement', 'job', 'review', 'verification',
    'request', 'system', 'support',
    name='notificationtype',
)
_NEW_ENUM = sa.Enum(
    'quote', 'quotation', 'procurement', 'job', 'review', 'verification',
    'request', 'system', 'support', 'moderation',
    name='notificationtype',
)


def upgrade() -> None:
    with op.batch_alter_table('notifications', schema=None) as batch_op:
        batch_op.alter_column('type', existing_type=_OLD_ENUM, type_=_NEW_ENUM, nullable=False)


def downgrade() -> None:
    # Refuse to drop the value while moderation notifications still reference it.
    check = sa.text(
        "SELECT COUNT(*) FROM notifications WHERE type = 'moderation'"
    )
    count = op.get_bind().execute(check).scalar() or 0
    if count:
        raise RuntimeError(
            "Cannot downgrade: notifications.type='moderation' rows exist. "
            "Delete them first (they are regenerated automatically when moderation recurs)."
        )
    with op.batch_alter_table('notifications', schema=None) as batch_op:
        batch_op.alter_column('type', existing_type=_NEW_ENUM, type_=_OLD_ENUM, nullable=False)
