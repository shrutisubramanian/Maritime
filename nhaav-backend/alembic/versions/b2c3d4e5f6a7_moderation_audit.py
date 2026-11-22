"""Moderation audit + rejection reasons

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-10-05

Adds:
- services.rejection_reason
- supply_listings.rejection_reason
- moderation_audit_logs table
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b2c3d4e5f6a7'
down_revision: Union[str, Sequence[str], None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('services', schema=None) as batch_op:
        batch_op.add_column(sa.Column('rejection_reason', sa.String(), nullable=True))

    with op.batch_alter_table('supply_listings', schema=None) as batch_op:
        batch_op.add_column(sa.Column('rejection_reason', sa.String(), nullable=True))

    op.create_table(
        'moderation_audit_logs',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('entity_type', sa.String(), nullable=False, comment='service | supply'),
        sa.Column('entity_id', sa.UUID(), nullable=False),
        sa.Column('admin_id', sa.UUID(), nullable=True),
        sa.Column('action', sa.String(), nullable=False, comment='approved | rejected'),
        sa.Column('reason', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['admin_id'], ['users.id'], name='fk_moderation_audit_admin_id_users', ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id', name='pk_moderation_audit_logs'),
    )
    op.create_index('ix_moderation_audit_logs_id', 'moderation_audit_logs', ['id'])
    op.create_index('ix_moderation_audit_logs_entity_type', 'moderation_audit_logs', ['entity_type'])
    op.create_index('ix_moderation_audit_logs_entity_id', 'moderation_audit_logs', ['entity_id'])
    op.create_index('ix_moderation_audit_logs_admin_id', 'moderation_audit_logs', ['admin_id'])


def downgrade() -> None:
    op.drop_index('ix_moderation_audit_logs_admin_id', table_name='moderation_audit_logs')
    op.drop_index('ix_moderation_audit_logs_entity_id', table_name='moderation_audit_logs')
    op.drop_index('ix_moderation_audit_logs_entity_type', table_name='moderation_audit_logs')
    op.drop_index('ix_moderation_audit_logs_id', table_name='moderation_audit_logs')
    op.drop_table('moderation_audit_logs')

    with op.batch_alter_table('supply_listings', schema=None) as batch_op:
        batch_op.drop_column('rejection_reason')

    with op.batch_alter_table('services', schema=None) as batch_op:
        batch_op.drop_column('rejection_reason')
