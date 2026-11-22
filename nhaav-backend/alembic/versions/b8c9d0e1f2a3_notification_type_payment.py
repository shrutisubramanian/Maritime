"""Notification type 'payment' for subscription activation/rejection

Revision ID: b8c9d0e1f2a3
Revises: a7b8c9d0e1f2
Create Date: 2026-10-06

Adds the `payment` member to the notifications.type enum (SQLite CHECK
constraint), so PaymentService can notify the submitter when a
bank-transfer payment is verified or rejected.

Follows the same pattern as c3d4e5f6a7b8 (the `moderation` member): the enum
gains a value and no existing row is rewritten. The downgrade refuses while
payment notifications still exist.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b8c9d0e1f2a3'
down_revision: Union[str, Sequence[str], None] = 'a7b8c9d0e1f2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_OLD_ENUM = sa.Enum(
    'quote', 'quotation', 'procurement', 'job', 'review', 'verification',
    'request', 'system', 'support', 'moderation',
    name='notificationtype',
)
_NEW_ENUM = sa.Enum(
    'quote', 'quotation', 'procurement', 'job', 'review', 'verification',
    'request', 'system', 'support', 'moderation', 'payment',
    name='notificationtype',
)


def upgrade() -> None:
    with op.batch_alter_table('notifications', schema=None) as batch_op:
        batch_op.alter_column('type', existing_type=_OLD_ENUM, type_=_NEW_ENUM, nullable=False)


def downgrade() -> None:
    # Refuse to drop the value while payment notifications still reference it.
    check = sa.text("SELECT COUNT(*) FROM notifications WHERE type = 'payment'")
    count = op.get_bind().execute(check).scalar() or 0
    if count:
        raise RuntimeError(
            "Cannot downgrade: notifications.type='payment' rows exist. "
            "Delete them first (they are regenerated when a payment decision recurs)."
        )
    with op.batch_alter_table('notifications', schema=None) as batch_op:
        batch_op.alter_column('type', existing_type=_NEW_ENUM, type_=_OLD_ENUM, nullable=False)
