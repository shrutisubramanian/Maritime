"""Service listing lifecycle (parity with supply listings)

Revision ID: a1b2c3d4e5f6
Revises: 9c1d2e3f4a5b
Create Date: 2026-10-05

Adds:
- services.status  (draft | pending_review | approved | rejected | archived)

Existing rows are backfilled: rows that were already publicly active
(is_active = true) become `approved`; everything else stays `draft`. The derived
`is_active` flag continues to mean "status == approved".
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, Sequence[str], None] = '9c1d2e3f4a5b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


service_listing_status_enum = sa.Enum(
    'draft', 'pending_review', 'approved', 'rejected', 'archived',
    name='servicelistingstatus',
)


def upgrade() -> None:
    with op.batch_alter_table('services', schema=None) as batch_op:
        batch_op.add_column(
            sa.Column(
                'status',
                service_listing_status_enum,
                nullable=False,
                server_default='draft',
            )
        )
        batch_op.create_index('ix_services_status', ['status'])

    # Backfill: anything already public becomes approved.
    op.execute("UPDATE services SET status = 'approved' WHERE is_active = 1")


def downgrade() -> None:
    with op.batch_alter_table('services', schema=None) as batch_op:
        batch_op.drop_index('ix_services_status')
        batch_op.drop_column('status')
