"""Offline bank-transfer payment submissions + audit trail

Revision ID: a7b8c9d0e1f2
Revises: f6a7b8c9d0e1
Create Date: 2026-10-06

Adds:
- payments             an organization's bank-transfer submission (amount in
                       INTEGER PAISE, server-derived from the plan; UTR
                       reference; private receipt reference; review fields).
- payment_audit_logs   append-only trail of submissions and admin decisions.

No payment gateway is involved: this records an offline transfer for admin
verification. Money is never floating point.

Enum storage: SQLAlchemy persists enum member NAMES and these members' names
equal their values, so the stored strings are 'PENDING' / 'SUBMITTED' /
'VERIFIED' / 'REJECTED' / 'CANCELLED' exactly as the API reports them.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a7b8c9d0e1f2'
down_revision: Union[str, Sequence[str], None] = 'f6a7b8c9d0e1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'payments',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('organization_id', sa.UUID(), nullable=False),
        sa.Column('subscription_id', sa.UUID(), nullable=True),
        sa.Column('plan_id', sa.UUID(), nullable=False),
        sa.Column('submitted_by', sa.UUID(), nullable=True),
        sa.Column('amount_paise', sa.Integer(), nullable=False,
                  comment='Integer paise (INR minor units) - never floating point'),
        sa.Column('currency', sa.String(length=3), nullable=False, server_default='INR'),
        sa.Column('utr', sa.String(length=64), nullable=False,
                  comment='Bank transaction reference (a claim, not proof)'),
        sa.Column('payment_date', sa.DateTime(timezone=True), nullable=False),
        sa.Column('receipt_path', sa.String(), nullable=False,
                  comment='Private server-side path; never publicly served'),
        sa.Column('receipt_filename', sa.String(), nullable=False),
        sa.Column('receipt_content_type', sa.String(length=120), nullable=True),
        sa.Column('receipt_size_bytes', sa.Integer(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('status', sa.String(length=20), nullable=False, server_default='PENDING',
                  comment='PENDING | SUBMITTED | VERIFIED | REJECTED | CANCELLED'),
        sa.Column('submitted_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('verified_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('verified_by', sa.UUID(), nullable=True),
        sa.Column('rejection_reason', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'],
                                name='fk_payments_organization_id_organizations', ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['subscription_id'], ['subscriptions.id'],
                                name='fk_payments_subscription_id_subscriptions', ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['plan_id'], ['subscription_plans.id'],
                                name='fk_payments_plan_id_subscription_plans'),
        sa.ForeignKeyConstraint(['submitted_by'], ['users.id'],
                                name='fk_payments_submitted_by_users', ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['verified_by'], ['users.id'],
                                name='fk_payments_verified_by_users', ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id', name='pk_payments'),
    )
    op.create_index('ix_payments_id', 'payments', ['id'])
    op.create_index('ix_payments_organization_id', 'payments', ['organization_id'])
    op.create_index('ix_payments_subscription_id', 'payments', ['subscription_id'])
    op.create_index('ix_payments_plan_id', 'payments', ['plan_id'])
    op.create_index('ix_payments_submitted_by', 'payments', ['submitted_by'])
    op.create_index('ix_payments_verified_by', 'payments', ['verified_by'])
    op.create_index('ix_payments_status', 'payments', ['status'])
    op.create_index('ix_payments_org_status', 'payments', ['organization_id', 'status'])
    op.create_index('ix_payments_utr', 'payments', ['utr'])

    op.create_table(
        'payment_audit_logs',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('payment_id', sa.UUID(), nullable=False),
        sa.Column('organization_id', sa.UUID(), nullable=True),
        sa.Column('actor_id', sa.UUID(), nullable=True),
        sa.Column('actor_role', sa.String(length=20), nullable=False,
                  comment='admin | organization'),
        sa.Column('action', sa.String(length=20), nullable=False,
                  comment='submitted | approved | rejected | cancelled'),
        sa.Column('reason', sa.Text(), nullable=True),
        sa.Column('detail', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['payment_id'], ['payments.id'],
                                name='fk_payment_audit_logs_payment_id_payments', ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'],
                                name='fk_payment_audit_logs_organization_id_organizations', ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['actor_id'], ['users.id'],
                                name='fk_payment_audit_logs_actor_id_users', ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id', name='pk_payment_audit_logs'),
    )
    op.create_index('ix_payment_audit_logs_id', 'payment_audit_logs', ['id'])
    op.create_index('ix_payment_audit_logs_payment_id', 'payment_audit_logs', ['payment_id'])
    op.create_index('ix_payment_audit_logs_organization_id', 'payment_audit_logs', ['organization_id'])
    op.create_index('ix_payment_audit_logs_actor_id', 'payment_audit_logs', ['actor_id'])


def downgrade() -> None:
    op.drop_index('ix_payment_audit_logs_actor_id', table_name='payment_audit_logs')
    op.drop_index('ix_payment_audit_logs_organization_id', table_name='payment_audit_logs')
    op.drop_index('ix_payment_audit_logs_payment_id', table_name='payment_audit_logs')
    op.drop_index('ix_payment_audit_logs_id', table_name='payment_audit_logs')
    op.drop_table('payment_audit_logs')

    op.drop_index('ix_payments_utr', table_name='payments')
    op.drop_index('ix_payments_org_status', table_name='payments')
    op.drop_index('ix_payments_status', table_name='payments')
    op.drop_index('ix_payments_verified_by', table_name='payments')
    op.drop_index('ix_payments_submitted_by', table_name='payments')
    op.drop_index('ix_payments_plan_id', table_name='payments')
    op.drop_index('ix_payments_subscription_id', table_name='payments')
    op.drop_index('ix_payments_organization_id', table_name='payments')
    op.drop_index('ix_payments_id', table_name='payments')
    op.drop_table('payments')
