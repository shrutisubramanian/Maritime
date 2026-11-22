"""Company-first marketplace: vendor taxonomy, company capabilities, paid profile visibility

Additive and non-destructive:

* ``vendor_categories`` / ``vendor_subcategories`` — the admin-maintained
  taxonomy a company's single primary category is chosen from.
* ``profile_subcategories`` — a company's declared capabilities (one row per
  approved subcategory; the primary category is ``profiles.primary_category_id``,
  a single nullable column so a company can never hold two).
* ``profile_visibilities`` — paid visibility purchased for a COMPANY PROFILE
  (₹1,000 + GST / month, ₹10,000 + GST / year), with the bank-transfer evidence
  and the verified window.
* ``profiles`` gains country / head_office / service_areas / map coordinates.

Every new column is nullable: existing companies are untouched and keep working.
A company with no primary category is still discoverable through the categories
of its own approved, paid listings (derived at read time), so no vendor loses
visibility because of this migration.

Revision ID: a4b5c6d7e8f9
Revises: b3c4d5e6f7a8
Create Date: 2026-10-31
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = 'a4b5c6d7e8f9'
down_revision: Union[str, Sequence[str], None] = 'b3c4d5e6f7a8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'vendor_categories',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('vendor_type', sa.String(length=20), nullable=False),
        sa.Column('name', sa.String(length=120), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('sort_order', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_by', sa.Uuid(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['created_by'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('vendor_type', 'name', name='ux_vendor_categories_type_name'),
    )
    op.create_index('ix_vendor_categories_id', 'vendor_categories', ['id'])
    op.create_index('ix_vendor_categories_vendor_type', 'vendor_categories', ['vendor_type'])

    op.create_table(
        'vendor_subcategories',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('category_id', sa.Uuid(), nullable=False),
        sa.Column('name', sa.String(length=160), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['category_id'], ['vendor_categories.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('category_id', 'name', name='ux_vendor_subcategories_cat_name'),
    )
    op.create_index('ix_vendor_subcategories_id', 'vendor_subcategories', ['id'])
    op.create_index('ix_vendor_subcategories_category_id', 'vendor_subcategories', ['category_id'])

    with op.batch_alter_table('profiles') as batch_op:
        batch_op.add_column(sa.Column('primary_category_id', sa.Uuid(), nullable=True))
        batch_op.add_column(sa.Column('country', sa.String(length=80), nullable=True))
        batch_op.add_column(sa.Column('head_office', sa.String(length=160), nullable=True))
        batch_op.add_column(sa.Column('service_areas', sa.JSON(), nullable=True))
        batch_op.add_column(sa.Column('location_lat', sa.Float(), nullable=True))
        batch_op.add_column(sa.Column('location_lng', sa.Float(), nullable=True))
        batch_op.create_foreign_key(
            'fk_profiles_primary_category',
            'vendor_categories',
            ['primary_category_id'],
            ['id'],
            ondelete='SET NULL',
        )
        batch_op.create_index('ix_profiles_primary_category_id', ['primary_category_id'])

    op.create_table(
        'profile_subcategories',
        sa.Column('profile_id', sa.Uuid(), nullable=False),
        sa.Column('subcategory_id', sa.Uuid(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['profile_id'], ['profiles.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['subcategory_id'], ['vendor_subcategories.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('profile_id', 'subcategory_id'),
        sa.UniqueConstraint('profile_id', 'subcategory_id', name='ux_profile_subcategories'),
    )

    op.create_table(
        'profile_visibilities',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('profile_id', sa.Uuid(), nullable=False),
        sa.Column('owner_user_id', sa.Uuid(), nullable=True),
        sa.Column('plan', sa.String(length=12), nullable=False),
        sa.Column('period_days', sa.Integer(), nullable=False, server_default='30'),
        sa.Column('base_amount_paise', sa.Integer(), nullable=False),
        sa.Column('gst_rate_percent', sa.Integer(), nullable=False, server_default='18'),
        sa.Column('gst_amount_paise', sa.Integer(), nullable=False),
        sa.Column('total_amount_paise', sa.Integer(), nullable=False),
        sa.Column('currency', sa.String(length=3), nullable=False, server_default='INR'),
        sa.Column('utr', sa.String(length=64), nullable=False),
        sa.Column('payment_date', sa.DateTime(timezone=True), nullable=False),
        sa.Column('receipt_path', sa.String(), nullable=False),
        sa.Column('receipt_filename', sa.String(), nullable=False),
        sa.Column('receipt_content_type', sa.String(length=120), nullable=True),
        sa.Column('receipt_size_bytes', sa.Integer(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('status', sa.String(length=20), nullable=False, server_default='PENDING'),
        sa.Column('submitted_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('decided_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('decided_by', sa.Uuid(), nullable=True),
        sa.Column('rejection_reason', sa.Text(), nullable=True),
        sa.Column('starts_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['profile_id'], ['profiles.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['owner_user_id'], ['users.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['decided_by'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_profile_visibilities_id', 'profile_visibilities', ['id'])
    op.create_index('ix_profile_visibilities_profile_id', 'profile_visibilities', ['profile_id'])
    op.create_index('ix_profile_visibilities_owner_user_id', 'profile_visibilities', ['owner_user_id'])
    op.create_index('ix_profile_visibilities_status', 'profile_visibilities', ['status'])
    op.create_index(
        'ix_profile_visibilities_profile_status', 'profile_visibilities', ['profile_id', 'status']
    )
    op.create_index(
        'ix_profile_visibilities_owner_status', 'profile_visibilities', ['owner_user_id', 'status']
    )
    op.create_index(
        'ux_profile_visibilities_live_utr',
        'profile_visibilities',
        ['utr'],
        unique=True,
        sqlite_where=sa.text("status IN ('PENDING', 'SUBMITTED', 'VERIFIED')"),
        postgresql_where=sa.text("status IN ('PENDING', 'SUBMITTED', 'VERIFIED')"),
    )


def downgrade() -> None:
    op.drop_table('profile_visibilities')
    op.drop_table('profile_subcategories')
    with op.batch_alter_table('profiles') as batch_op:
        batch_op.drop_index('ix_profiles_primary_category_id')
        batch_op.drop_constraint('fk_profiles_primary_category', type_='foreignkey')
        batch_op.drop_column('location_lng')
        batch_op.drop_column('location_lat')
        batch_op.drop_column('service_areas')
        batch_op.drop_column('head_office')
        batch_op.drop_column('country')
        batch_op.drop_column('primary_category_id')
    op.drop_table('vendor_subcategories')
    op.drop_table('vendor_categories')
