"""Pass packs: 40 days for 10 passes, 250 days for 100

Revision ID: a5b6c7d8e9f0
Revises: d7e8f9a0b1c2
Create Date: 2026-10-20

The approved catalogue changed from calendar periods to explicit day windows:

    MONTHLY   ₹1,000 + GST   10 passes    40 days   (was: 1 month)
    ANNUAL    ₹10,000 + GST  100 passes   250 days  (was: 1 year)

"40 days" is not a month and "250 days" is not a year, and the two packs must
differ from each other, so the unit becomes DAY and the values 40 / 250.

Only the CATALOGUE rows are updated — price_paise and pass_count are unchanged.
Existing subscriptions keep the starts_at/expires_at they were sold with, and
existing passes keep the unused window they were issued with; this changes what
future purchases grant, never what past ones already granted.

Runtime safety net: SubscriptionService.seed_plans() reconciles the same rows on
every plans read, so a database that has not run this migration still serves the
approved figures. This migration exists so a freshly-migrated database matches
the catalogue before the first request.
"""
from typing import Sequence, Union

from alembic import op


revision: str = 'a5b6c7d8e9f0'
down_revision: Union[str, Sequence[str], None] = 'd7e8f9a0b1c2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # `duration_unit` is String(10), so 'DAY' fits the same column.
    op.execute(
        "UPDATE subscription_plans "
        "SET duration_value = 40, duration_unit = 'DAY' "
        "WHERE code = 'MONTHLY'"
    )
    op.execute(
        "UPDATE subscription_plans "
        "SET duration_value = 250, duration_unit = 'DAY' "
        "WHERE code = 'ANNUAL'"
    )


def downgrade() -> None:
    op.execute(
        "UPDATE subscription_plans "
        "SET duration_value = 1, duration_unit = 'MONTH' "
        "WHERE code = 'MONTHLY'"
    )
    op.execute(
        "UPDATE subscription_plans "
        "SET duration_value = 1, duration_unit = 'YEAR' "
        "WHERE code = 'ANNUAL'"
    )
