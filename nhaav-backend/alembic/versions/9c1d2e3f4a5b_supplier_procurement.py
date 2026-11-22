"""Supplier + procurement foundation

Revision ID: 9c1d2e3f4a5b
Revises: 3f3cfac91e8a
Create Date: 2026-10-05

Adds:
- service_requests.request_type / quantity / specifications
- services.service_id / port_id (deterministic matching keys)
- supply_listings table (supplier catalogue)
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '9c1d2e3f4a5b'
down_revision: Union[str, Sequence[str], None] = '3f3cfac91e8a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


request_type_enum = sa.Enum('service', 'supply', name='requesttype')
supply_listing_status_enum = sa.Enum(
    'draft', 'pending_review', 'approved', 'rejected', 'archived',
    name='supplylistingstatus',
)


def upgrade() -> None:
    with op.batch_alter_table('service_requests', schema=None) as batch_op:
        batch_op.add_column(sa.Column('request_type', request_type_enum, nullable=False, server_default='service'))
        batch_op.add_column(sa.Column('quantity', sa.Integer(), nullable=True, comment='Quantity required (procurement requests)'))
        batch_op.add_column(sa.Column('specifications', sa.JSON(), nullable=True, comment='Free-form specification key/value pairs for supply requests'))

    with op.batch_alter_table('services', schema=None) as batch_op:
        batch_op.add_column(sa.Column('service_id', sa.String(), nullable=True, comment='Canonical service key for matching'))
        batch_op.add_column(sa.Column('port_id', sa.String(), nullable=True, comment='Port served by this service listing'))
        batch_op.create_index('ix_services_service_id', ['service_id'])
        batch_op.create_index('ix_services_port_id', ['port_id'])

    op.create_table(
        'supply_listings',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('supplier_id', sa.UUID(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('category', sa.String(), nullable=False),
        sa.Column('subcategory', sa.String(), nullable=True),
        sa.Column('description', sa.String(), nullable=True),
        sa.Column('manufacturer', sa.String(), nullable=True),
        sa.Column('model_number', sa.String(), nullable=True),
        sa.Column('part_number', sa.String(), nullable=True),
        sa.Column('condition', sa.String(), nullable=True),
        sa.Column('country_of_origin', sa.String(), nullable=True),
        sa.Column('specifications', sa.JSON(), nullable=True),
        sa.Column('availability', sa.String(), nullable=True),
        sa.Column('lead_time', sa.String(), nullable=True),
        sa.Column('minimum_order_quantity', sa.Integer(), nullable=True),
        sa.Column('ports', sa.JSON(), nullable=True),
        sa.Column('images', sa.JSON(), nullable=True),
        sa.Column('datasheets', sa.JSON(), nullable=True),
        sa.Column('status', supply_listing_status_enum, nullable=False, server_default='draft'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['supplier_id'], ['users.id'], name='fk_supply_listings_supplier_id_users', ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id', name='pk_supply_listings'),
    )
    op.create_index('ix_supply_listings_id', 'supply_listings', ['id'])
    op.create_index('ix_supply_listings_supplier_id', 'supply_listings', ['supplier_id'])
    op.create_index('ix_supply_listings_category', 'supply_listings', ['category'])
    op.create_index('ix_supply_listings_status', 'supply_listings', ['status'])


def downgrade() -> None:
    op.drop_index('ix_supply_listings_status', table_name='supply_listings')
    op.drop_index('ix_supply_listings_category', table_name='supply_listings')
    op.drop_index('ix_supply_listings_supplier_id', table_name='supply_listings')
    op.drop_index('ix_supply_listings_id', table_name='supply_listings')
    op.drop_table('supply_listings')

    with op.batch_alter_table('services', schema=None) as batch_op:
        batch_op.drop_index('ix_services_port_id')
        batch_op.drop_index('ix_services_service_id')
        batch_op.drop_column('port_id')
        batch_op.drop_column('service_id')

    with op.batch_alter_table('service_requests', schema=None) as batch_op:
        batch_op.drop_column('specifications')
        batch_op.drop_column('quantity')
        batch_op.drop_column('request_type')
