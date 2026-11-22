"""Listed price on service and supply listings

Revision ID: b6c7d8e9f0a1
Revises: a5b6c7d8e9f0
Create Date: 2026-10-20

The marketplace shows the price a company is asking on its own card. Neither
table had one: pricing was quote-only, so a card could say what a service was
but never what it cost.

Adds two nullable columns to BOTH tables:

    price_paise   INTEGER PAISE (₹1,000 -> 100000), never a float
    price_note    the unit, e.g. "per survey", "per metre"

Nullable on purpose: a provider or supplier that has not published a figure
keeps NULL and the marketplace shows "Price on request" — it never invents a
number. Nothing existing changes, because nothing existing had a price.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b6c7d8e9f0a1'
down_revision: Union[str, Sequence[str], None] = 'a5b6c7d8e9f0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'services',
        sa.Column('price_paise', sa.Integer(), nullable=True,
                  comment='Listed price in integer paise (INR minor units)'),
    )
    op.add_column(
        'services',
        sa.Column('price_note', sa.String(length=60), nullable=True,
                  comment='Unit qualifier, e.g. per survey, per day'),
    )
    op.add_column(
        'supply_listings',
        sa.Column('price_paise', sa.Integer(), nullable=True,
                  comment='Listed price in integer paise (INR minor units)'),
    )
    op.add_column(
        'supply_listings',
        sa.Column('price_note', sa.String(length=60), nullable=True,
                  comment='Unit qualifier, e.g. per metre, per drum'),
    )


def downgrade() -> None:
    # The columns are additive and hold no irreversible data of their own —
    # dropping them discards whatever prices were published after the upgrade.
    with op.batch_alter_table('supply_listings') as batch_op:
        batch_op.drop_column('price_note')
        batch_op.drop_column('price_paise')
    with op.batch_alter_table('services') as batch_op:
        batch_op.drop_column('price_note')
        batch_op.drop_column('price_paise')
