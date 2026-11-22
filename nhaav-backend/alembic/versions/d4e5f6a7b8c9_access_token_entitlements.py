"""Company access-token entitlements (org, pack, token)

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-10-06

Adds:
- organizations           (shared token-pool owner; maps onto Profile.company_name)
- access_packs            (a provisioned pack of tokens)
- access_tokens           (one consumable login session: AVAILABLE -> ACTIVE -> CONSUMED)
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd4e5f6a7b8c9'
down_revision: Union[str, Sequence[str], None] = 'c3d4e5f6a7b8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'organizations',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('access_control_enabled', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id', name='pk_organizations'),
    )
    op.create_index('ix_organizations_id', 'organizations', ['id'])
    op.create_index('ix_organizations_name', 'organizations', ['name'], unique=True)

    op.create_table(
        'access_packs',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('organization_id', sa.UUID(), nullable=False),
        sa.Column('token_count', sa.Integer(), nullable=False),
        sa.Column('source', sa.String(), nullable=False, comment="test_helper/dev_endpoint for now; 'payment' reserved"),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], name='fk_access_packs_organization_id_organizations', ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id', name='pk_access_packs'),
    )
    op.create_index('ix_access_packs_id', 'access_packs', ['id'])
    op.create_index('ix_access_packs_organization_id', 'access_packs', ['organization_id'])

    op.create_table(
        'access_tokens',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('organization_id', sa.UUID(), nullable=False),
        sa.Column('pack_id', sa.UUID(), nullable=False),
        sa.Column('status', sa.String(length=20), nullable=False, comment='AVAILABLE | ACTIVE | CONSUMED'),
        sa.Column('current_user_id', sa.UUID(), nullable=True),
        sa.Column('activated_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('consumed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], name='fk_access_tokens_organization_id_organizations', ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['pack_id'], ['access_packs.id'], name='fk_access_tokens_pack_id_access_packs', ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['current_user_id'], ['users.id'], name='fk_access_tokens_current_user_id_users', ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id', name='pk_access_tokens'),
    )
    op.create_index('ix_access_tokens_id', 'access_tokens', ['id'])
    op.create_index('ix_access_tokens_organization_id', 'access_tokens', ['organization_id'])
    op.create_index('ix_access_tokens_pack_id', 'access_tokens', ['pack_id'])
    op.create_index('ix_access_tokens_current_user_id', 'access_tokens', ['current_user_id'])
    op.create_index('ix_access_tokens_org_status', 'access_tokens', ['organization_id', 'status'])


def downgrade() -> None:
    op.drop_index('ix_access_tokens_org_status', table_name='access_tokens')
    op.drop_index('ix_access_tokens_current_user_id', table_name='access_tokens')
    op.drop_index('ix_access_tokens_pack_id', table_name='access_tokens')
    op.drop_index('ix_access_tokens_organization_id', table_name='access_tokens')
    op.drop_index('ix_access_tokens_id', table_name='access_tokens')
    op.drop_table('access_tokens')

    op.drop_index('ix_access_packs_organization_id', table_name='access_packs')
    op.drop_index('ix_access_packs_id', table_name='access_packs')
    op.drop_table('access_packs')

    op.drop_index('ix_organizations_name', table_name='organizations')
    op.drop_index('ix_organizations_id', table_name='organizations')
    op.drop_table('organizations')
