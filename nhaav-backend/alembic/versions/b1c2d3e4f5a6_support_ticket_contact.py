"""Support tickets from the public support popup

The support popup is reachable from public pages (landing, register, login), so
a ticket can be raised by someone who is not signed in. `support_tickets.user_id`
was NOT NULL, which made an anonymous ticket impossible. This migration:

1. makes `user_id` nullable — a signed-in reporter still links to their account,
   an anonymous reporter leaves it NULL;
2. adds `contact_name` / `contact_email` so support can reply to an anonymous
   ticket (and so the name/address shown for a signed-in ticket is the one the
   reporter actually typed).

Existing rows are untouched: every one of them keeps its user_id.

Revision ID: b1c2d3e4f5a6
Revises: a0b1c2d3e4f5
Create Date: 2026-10-09
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'b1c2d3e4f5a6'
down_revision: Union[str, Sequence[str], None] = 'a0b1c2d3e4f5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # batch_alter_table so SQLite (which cannot ALTER COLUMN / DROP COLUMN
    # directly) receives the table-rebuild its dialect needs, while PostgreSQL
    # gets plain ALTERs.
    with op.batch_alter_table('support_tickets') as batch_op:
        batch_op.add_column(sa.Column('contact_name', sa.String(length=120), nullable=True))
        batch_op.add_column(sa.Column('contact_email', sa.String(length=255), nullable=True))
        batch_op.alter_column(
            'user_id',
            existing_type=postgresql.UUID(as_uuid=True),
            nullable=True,
        )


def downgrade() -> None:
    # NOTE: reverting requires every ticket to have an owner again. Anonymous
    # tickets created after this migration have user_id = NULL, so this
    # downgrade fails loudly rather than silently discarding them.
    with op.batch_alter_table('support_tickets') as batch_op:
        batch_op.alter_column(
            'user_id',
            existing_type=postgresql.UUID(as_uuid=True),
            nullable=False,
        )
        batch_op.drop_column('contact_email')
        batch_op.drop_column('contact_name')
