"""Paid 60-day marketplace placements (listing fee)

Revision ID: c7d8e9f0a1b2
Revises: b6c7d8e9f0a1
Create Date: 2026-10-22

Putting a listing on the marketplace is now a paid placement: ₹1,000 per
listing, visible for 60 days. Three schema changes:

  * `listing_fees` — one bank-transfer submission per placement, admin-verified,
    with the window it bought (`starts_at` / `expires_at`) and INTEGER paise.
  * `services.published_at` / `services.expires_at`
  * `supply_listings.published_at` / `supply_listings.expires_at`

The two listing columns stay NULLABLE and default to NULL: every listing that
already exists has NOT paid, so it stops being visible until a fee is verified.
That is the intended consequence of the product rule — this migration does not
silently grant anyone a free two-month placement.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c7d8e9f0a1b2'
down_revision: Union[str, Sequence[str], None] = 'b6c7d8e9f0a1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'listing_fees',
        sa.Column('id', sa.Uuid(), primary_key=True, nullable=False),
        sa.Column('owner_user_id', sa.Uuid(),
                  sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('listing_type', sa.String(length=10), nullable=False),
        sa.Column('listing_id', sa.Uuid(), nullable=False),
        sa.Column('listing_name', sa.String(length=200), nullable=False,
                  server_default=''),
        sa.Column('amount_paise', sa.Integer(), nullable=False),
        sa.Column('currency', sa.String(length=3), nullable=False,
                  server_default='INR'),
        sa.Column('period_days', sa.Integer(), nullable=False, server_default='60'),
        sa.Column('utr', sa.String(length=64), nullable=False),
        sa.Column('payment_date', sa.DateTime(timezone=True), nullable=False),
        sa.Column('receipt_path', sa.String(), nullable=False),
        sa.Column('receipt_filename', sa.String(), nullable=False),
        sa.Column('receipt_content_type', sa.String(length=120), nullable=True),
        sa.Column('receipt_size_bytes', sa.Integer(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('status', sa.String(length=20), nullable=False,
                  server_default='PENDING'),
        sa.Column('submitted_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('decided_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('decided_by', sa.Uuid(),
                  sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('rejection_reason', sa.Text(), nullable=True),
        sa.Column('starts_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index('ix_listing_fees_owner_user_id', 'listing_fees', ['owner_user_id'])
    op.create_index('ix_listing_fees_listing_id', 'listing_fees', ['listing_id'])
    op.create_index('ix_listing_fees_status', 'listing_fees', ['status'])
    op.create_index('ix_listing_fees_owner_status', 'listing_fees',
                    ['owner_user_id', 'status'])
    op.create_index('ix_listing_fees_listing', 'listing_fees',
                    ['listing_type', 'listing_id'])
    op.create_index(
        'ux_listing_fees_live_utr',
        'listing_fees',
        ['utr'],
        unique=True,
        sqlite_where=sa.text("status IN ('PENDING', 'SUBMITTED', 'VERIFIED')"),
        postgresql_where=sa.text("status IN ('PENDING', 'SUBMITTED', 'VERIFIED')"),
    )

    for table in ('services', 'supply_listings'):
        op.add_column(
            table,
            sa.Column('published_at', sa.DateTime(timezone=True), nullable=True,
                      comment='When the paid placement went live'),
        )
        op.add_column(
            table,
            sa.Column('expires_at', sa.DateTime(timezone=True), nullable=True,
                      comment='When the paid placement ends (60 days after payment '
                              'verification)'),
        )


def downgrade() -> None:
    for table in ('services', 'supply_listings'):
        op.drop_column(table, 'expires_at')
        op.drop_column(table, 'published_at')

    op.drop_index('ux_listing_fees_live_utr', table_name='listing_fees')
    op.drop_index('ix_listing_fees_listing', table_name='listing_fees')
    op.drop_index('ix_listing_fees_owner_status', table_name='listing_fees')
    op.drop_index('ix_listing_fees_status', table_name='listing_fees')
    op.drop_index('ix_listing_fees_listing_id', table_name='listing_fees')
    op.drop_index('ix_listing_fees_owner_user_id', table_name='listing_fees')
    op.drop_table('listing_fees')
