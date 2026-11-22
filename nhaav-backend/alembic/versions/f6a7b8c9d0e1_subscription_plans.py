"""Subscription / plan layer (plans, subscriptions, pack linkage)

Revision ID: f6a7b8c9d0e1
Revises: e5f6a7b8c9d0
Create Date: 2026-10-06

Adds:
- subscription_plans   MONTHLY (₹1,000 / 10 passes / 1 month) and
                       ANNUAL  (₹10,000 / 100 passes / 1 year), seeded here so a
                       migrated database carries the approved catalogue even
                       before the app seeds it again at runtime.
- subscriptions       organization-owned subscription lifecycle
                       (PENDING -> ACTIVE -> EXPIRED/CANCELLED).
- access_packs        new subscription_id (nullable, UNIQUE — multiple NULLs
                       keep legacy/dev packs valid) and status columns. The
                       existing access_packs and access_tokens tables are
                       REUSED; no second token system is introduced.

Money is stored as INTEGER PAISE (price_paise); no floating point.

Enum storage: SQLAlchemy persists enum member NAMES, and these enums' names
equal their values, so the values written below match ORM reads exactly
('MONTH'/'YEAR', 'PENDING'/'ACTIVE'/'EXPIRED'/'CANCELLED', 'ACTIVE'/'EXPIRED'/
'CANCELLED').

SQLite note: adding a column plus a constraint/index to access_packs uses batch
mode (copy-and-move), which is also safe on PostgreSQL.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'f6a7b8c9d0e1'
down_revision: Union[str, Sequence[str], None] = 'e5f6a7b8c9d0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ------------------------------------------------------- subscription_plans
    op.create_table(
        'subscription_plans',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('code', sa.String(length=20), nullable=False),
        sa.Column('name', sa.String(length=120), nullable=False),
        sa.Column('price_paise', sa.Integer(), nullable=False,
                  comment='Integer paise (INR minor units) - never floating point'),
        sa.Column('currency', sa.String(length=3), nullable=False, server_default='INR'),
        sa.Column('duration_value', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('duration_unit', sa.String(length=10), nullable=False, comment='MONTH | YEAR'),
        sa.Column('pass_count', sa.Integer(), nullable=False),
        sa.Column('active', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id', name='pk_subscription_plans'),
    )
    op.create_index('ix_subscription_plans_id', 'subscription_plans', ['id'])
    op.create_index('ix_subscription_plans_code', 'subscription_plans', ['code'], unique=True)

    # ---------------------------------------------------------- subscriptions
    op.create_table(
        'subscriptions',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('organization_id', sa.UUID(), nullable=False),
        sa.Column('plan_id', sa.UUID(), nullable=False),
        sa.Column('status', sa.String(length=20), nullable=False,
                  comment='PENDING | ACTIVE | EXPIRED | CANCELLED'),
        sa.Column('starts_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ['organization_id'], ['organizations.id'],
            name='fk_subscriptions_organization_id_organizations', ondelete='CASCADE',
        ),
        sa.ForeignKeyConstraint(
            ['plan_id'], ['subscription_plans.id'],
            name='fk_subscriptions_plan_id_subscription_plans',
        ),
        sa.PrimaryKeyConstraint('id', name='pk_subscriptions'),
    )
    op.create_index('ix_subscriptions_id', 'subscriptions', ['id'])
    op.create_index('ix_subscriptions_organization_id', 'subscriptions', ['organization_id'])
    op.create_index('ix_subscriptions_plan_id', 'subscriptions', ['plan_id'])
    op.create_index('ix_subscriptions_status', 'subscriptions', ['status'])
    op.create_index('ix_subscriptions_org_status', 'subscriptions', ['organization_id', 'status'])

    # ------------------------------------------------- access_packs additions
    with op.batch_alter_table('access_packs') as batch_op:
        batch_op.add_column(sa.Column('subscription_id', sa.UUID(), nullable=True))
        batch_op.add_column(
            sa.Column('status', sa.String(length=20), nullable=False,
                      server_default='ACTIVE', comment='ACTIVE | EXPIRED | CANCELLED')
        )
        batch_op.create_foreign_key(
            'fk_access_packs_subscription_id_subscriptions',
            'subscriptions', ['subscription_id'], ['id'], ondelete='SET NULL',
        )
        # UNIQUE: one pack per subscription. Multiple NULLs remain allowed, so
        # legacy/dev packs (subscription_id IS NULL) are unaffected.
        batch_op.create_unique_constraint(
            'uq_access_packs_subscription_id', ['subscription_id']
        )

    # ------------------------------------------------------ seed plan catalogue
    # Seeded here so a migrated database always carries the approved figures;
    # SubscriptionService.seed_plans() reconciles the same rows at runtime.
    subscription_plans = sa.table(
        'subscription_plans',
        sa.column('id', sa.UUID()),
        sa.column('code', sa.String()),
        sa.column('name', sa.String()),
        sa.column('price_paise', sa.Integer()),
        sa.column('currency', sa.String()),
        sa.column('duration_value', sa.Integer()),
        sa.column('duration_unit', sa.String()),
        sa.column('pass_count', sa.Integer()),
        sa.column('active', sa.Boolean()),
    )
    import uuid as _uuid

    op.bulk_insert(
        subscription_plans,
        [
            {
                'id': _uuid.uuid4(),
                'code': 'MONTHLY',
                'name': 'Nhaav Monthly',
                'price_paise': 100000,      # ₹1,000.00
                'currency': 'INR',
                'duration_value': 1,
                'duration_unit': 'MONTH',
                'pass_count': 10,
                'active': True,
            },
            {
                'id': _uuid.uuid4(),
                'code': 'ANNUAL',
                'name': 'Nhaav Annual',
                'price_paise': 1000000,     # ₹10,000.00
                'currency': 'INR',
                'duration_value': 1,
                'duration_unit': 'YEAR',
                'pass_count': 100,
                'active': True,
            },
        ],
    )


def downgrade() -> None:
    with op.batch_alter_table('access_packs') as batch_op:
        batch_op.drop_constraint('uq_access_packs_subscription_id', type_='unique')
        batch_op.drop_constraint(
            'fk_access_packs_subscription_id_subscriptions', type_='foreignkey'
        )
        batch_op.drop_column('status')
        batch_op.drop_column('subscription_id')

    op.drop_index('ix_subscriptions_org_status', table_name='subscriptions')
    op.drop_index('ix_subscriptions_status', table_name='subscriptions')
    op.drop_index('ix_subscriptions_plan_id', table_name='subscriptions')
    op.drop_index('ix_subscriptions_organization_id', table_name='subscriptions')
    op.drop_index('ix_subscriptions_id', table_name='subscriptions')
    op.drop_table('subscriptions')

    op.drop_index('ix_subscription_plans_code', table_name='subscription_plans')
    op.drop_index('ix_subscription_plans_id', table_name='subscription_plans')
    op.drop_table('subscription_plans')
