"""Profile organization membership (stable FK, no string backfill)

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-10-06

Adds `profiles.organization_id` — the STABLE membership link between a user
profile and the Organization that owns its access-token pool. `company_name`
stays as display data. There is intentionally NO string-based backfill:
existing rows keep organization_id NULL (ungated legacy behavior preserved by
access_control_enabled=False on all organizations).

Production backfill requirement: mapping existing profiles to organizations
deterministically is NOT possible from company_name alone ("ABC Marine" vs
"ABC Marine Pvt. Ltd." are the same company). Membership must be assigned
explicitly by an admin / payment-onboarding flow in the payment phase.

SQLite note: ALTER TABLE ... ADD CONSTRAINT is unsupported there, so the
column + FK are added via batch mode (copy-and-move) — safe on both SQLite
and PostgreSQL.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'e5f6a7b8c9d0'
down_revision: Union[str, Sequence[str], None] = 'd4e5f6a7b8c9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('profiles') as batch_op:
        batch_op.add_column(
            sa.Column('organization_id', sa.UUID(), nullable=True)
        )
        batch_op.create_foreign_key(
            'fk_profiles_organization_id_organizations',
            'organizations',
            ['organization_id'], ['id'],
        )
    op.create_index('ix_profiles_organization_id', 'profiles', ['organization_id'])


def downgrade() -> None:
    op.drop_index('ix_profiles_organization_id', 'profiles')
    with op.batch_alter_table('profiles') as batch_op:
        batch_op.drop_column('organization_id')
