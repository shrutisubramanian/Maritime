"""Two-sided job acceptance: quotes.provider_accepted_at

A client accepting a quote awards the job (status -> accepted, Job created).
The provider then confirms it can actually take the work. Until BOTH are true
the client sees an anonymous offer — job title and price only — and the
provider's name and phone stay hidden.

Nullable and additive: every existing accepted quote keeps its current
behaviour (provider_accepted_at NULL), which is exactly the "not yet confirmed"
state.

Revision ID: b3c4d5e6f7a8
Revises: a1b2c3d4e5f7
Create Date: 2026-10-28
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'b3c4d5e6f7a8'
down_revision: Union[str, Sequence[str], None] = 'a1b2c3d4e5f7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # batch mode: SQLite cannot ALTER TABLE ADD COLUMN in place under Alembic
    with op.batch_alter_table('quotes') as batch_op:
        batch_op.add_column(
            sa.Column('provider_accepted_at', sa.DateTime(timezone=True), nullable=True)
        )


def downgrade() -> None:
    with op.batch_alter_table('quotes') as batch_op:
        batch_op.drop_column('provider_accepted_at')
