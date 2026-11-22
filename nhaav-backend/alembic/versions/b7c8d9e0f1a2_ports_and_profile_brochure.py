"""Ports catalogue + company brochure

Additive and non-destructive:

* ``ports`` — the head-office port list. Head office places a company under a
  port filter in the marketplace, so the list is database state an admin can
  extend during verification instead of a hardcoded constant.
* ``profiles`` gains the company brochure: a vendor-supplied PDF (15 MB max)
  stored privately and served through an authorized endpoint.

Every new column is nullable and the new table starts empty, so existing
companies are untouched; the catalogue seeds itself on first read.

Revision ID: b7c8d9e0f1a2
Revises: a4b5c6d7e8f9
Create Date: 2026-11-01
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = 'b7c8d9e0f1a2'
down_revision: Union[str, Sequence[str], None] = 'a4b5c6d7e8f9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'ports',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('name', sa.String(length=120), nullable=False),
        sa.Column('state', sa.String(length=80), nullable=True),
        sa.Column('kind', sa.String(length=40), nullable=True),
        sa.Column('aliases', sa.JSON(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('sort_order', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_by', sa.Uuid(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['created_by'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('name', name='ux_ports_name'),
    )
    op.create_index('ix_ports_id', 'ports', ['id'])
    op.create_index('ix_ports_name', 'ports', ['name'])

    with op.batch_alter_table('profiles') as batch_op:
        batch_op.add_column(sa.Column('brochure_path', sa.String(), nullable=True))
        batch_op.add_column(sa.Column('brochure_filename', sa.String(), nullable=True))
        batch_op.add_column(sa.Column('brochure_content_type', sa.String(length=120), nullable=True))
        batch_op.add_column(sa.Column('brochure_size_bytes', sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column('brochure_uploaded_at', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('profiles') as batch_op:
        batch_op.drop_column('brochure_uploaded_at')
        batch_op.drop_column('brochure_size_bytes')
        batch_op.drop_column('brochure_content_type')
        batch_op.drop_column('brochure_filename')
        batch_op.drop_column('brochure_path')
    op.drop_index('ix_ports_name', table_name='ports')
    op.drop_index('ix_ports_id', table_name='ports')
    op.drop_table('ports')
