"""One bank reference, one claim — across pass payments, listing fees and visibility

Revision ID: b1c9d2e3f4a5
Revises: e3f4a5b6c7d8
Create Date: 2026-11-16

Each paid surface already had a partial unique index on its own `utr`, so the
same surface could not be paid twice with one reference. Nothing stopped one
transfer being claimed as a pass payment AND a listing fee AND a visibility fee,
each verified separately by a different admin queue.

`bank_credits` is now the single record of "this reference has been claimed",
with a partial unique index on `utr` WHERE status = 'CLAIMED' so two submissions
racing across different tables still resolve to exactly one winner. The three
claim tables gain a nullable `bank_credit_id` pointing at the credit they
reserved.

Backfill: existing LIVE claims (PENDING/SUBMITTED/VERIFIED) are credited oldest
first. Where historical data already has one reference in more than one table,
the oldest claim keeps the credit and the later rows are left unlinked — they
are not deleted or rejected, because an operator must decide which of them the
transfer actually paid for.
"""
from datetime import datetime
from typing import Sequence, Union
import uuid

from alembic import op
import sqlalchemy as sa


revision: str = 'b1c9d2e3f4a5'
down_revision: Union[str, Sequence[str], None] = 'e3f4a5b6c7d8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_LIVE = {
    "payments": "('PENDING', 'SUBMITTED', 'VERIFIED')",
    "listing_fees": "('PENDING', 'SUBMITTED', 'VERIFIED')",
    "profile_visibilities": "('PENDING', 'SUBMITTED', 'VERIFIED')",
}

#: Which column holds the amount on each claim table.
_AMOUNT_COLUMN = {
    "payments": "amount_paise",
    "listing_fees": "amount_paise",
    "profile_visibilities": "total_amount_paise",
}

_CLAIM_TYPE = {
    "payments": "payment",
    "listing_fees": "listing_fee",
    "profile_visibilities": "profile_visibility",
}


def _claim_table(name: str) -> sa.TableClause:
    """Typed table handle so UUID binding goes through SQLAlchemy, not sqlite3."""
    return sa.table(
        name,
        sa.column("id", sa.Uuid()),
        sa.column("bank_credit_id", sa.Uuid()),
    )


def upgrade() -> None:
    op.create_table(
        'bank_credits',
        sa.Column('id', sa.Uuid(), primary_key=True, nullable=False),
        sa.Column('utr', sa.String(length=64), nullable=False),
        sa.Column('claim_type', sa.String(length=24), nullable=True),
        sa.Column('claim_id', sa.Uuid(), nullable=True),
        sa.Column('owner_user_id', sa.Uuid(),
                  sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('amount_paise', sa.Integer(), nullable=True),
        sa.Column('currency', sa.String(length=3), nullable=False,
                  server_default='INR'),
        sa.Column('receipt_path', sa.String(), nullable=True),
        sa.Column('receipt_filename', sa.String(), nullable=True),
        sa.Column('status', sa.String(length=10), nullable=False,
                  server_default='CLAIMED'),
        sa.Column('released_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index('ix_bank_credits_utr', 'bank_credits', ['utr'])
    op.create_index('ix_bank_credits_claim_id', 'bank_credits', ['claim_id'])
    op.create_index('ix_bank_credits_owner_user_id', 'bank_credits', ['owner_user_id'])
    op.create_index('ix_bank_credits_status', 'bank_credits', ['status'])
    op.create_index(
        'ux_bank_credits_live_utr',
        'bank_credits',
        ['utr'],
        unique=True,
        sqlite_where=sa.text("status = 'CLAIMED'"),
        postgresql_where=sa.text("status = 'CLAIMED'"),
    )

    conn = op.get_bind()
    for table in ("payments", "listing_fees", "profile_visibilities"):
        op.add_column(table, sa.Column('bank_credit_id', sa.Uuid(), nullable=True))
        op.create_index(
            f'ix_{table}_bank_credit_id', table, ['bank_credit_id'],
        )
        # SQLite cannot ALTER-ADD a constraint in place, and rebuilding the table
        # through batch mode would drop the existing partial unique indexes — the
        # very race protection this migration must not disturb. The link is still
        # enforced by the model (and by create_all in tests); Postgres, which is
        # the deployed target, gets the real foreign key.
        if conn.dialect.name != 'sqlite':
            op.create_foreign_key(
                f'fk_{table}_bank_credit_id_bank_credits',
                table,
                'bank_credits',
                ['bank_credit_id'],
                ['id'],
                ondelete='SET NULL',
            )

    # ---------------------------------------------------------------- backfill

    rows = conn.execute(
        sa.text(
            " UNION ALL ".join(
                f"SELECT '{_CLAIM_TYPE[t]}' AS claim_type, id, utr, "
                f"{_AMOUNT_COLUMN[t]} AS amount_paise, currency, receipt_path, "
                f"receipt_filename, owner_user_id, created_at "
                f"FROM {t} WHERE status IN {_LIVE[t]}"
                for t in ("payments", "listing_fees", "profile_visibilities")
            )
            + " ORDER BY created_at ASC"
        )
    ).mappings().all()

    credits = sa.table(
        "bank_credits",
        sa.column("id", sa.Uuid()),
        sa.column("utr", sa.String()),
        sa.column("claim_type", sa.String()),
        sa.column("claim_id", sa.Uuid()),
        sa.column("owner_user_id", sa.Uuid()),
        sa.column("amount_paise", sa.Integer()),
        sa.column("currency", sa.String()),
        sa.column("receipt_path", sa.String()),
        sa.column("receipt_filename", sa.String()),
        sa.column("status", sa.String()),
        sa.column("created_at", sa.DateTime()),
        sa.column("updated_at", sa.DateTime()),
    )

    def _as_uuid(value):
        # The UNION SELECT returns raw column values, so ids come back as the
        # dialect's stored string. Hand them to SQLAlchemy as real UUIDs.
        if value is None:
            return None
        return value if isinstance(value, uuid.UUID) else uuid.UUID(str(value))

    def _as_dt(value):
        # Union SELECT values arrive as the dialect's raw text.
        if value is None or isinstance(value, datetime):
            return value
        return datetime.fromisoformat(str(value))

    taken: set[str] = set()
    for row in rows:
        reference = (row["utr"] or "").strip().upper()
        # Historical duplicates keep their oldest claim credited; later rows are
        # left unlinked for an operator to resolve rather than silently dropped.
        if not reference or reference in taken:
            continue
        taken.add(reference)

        credit_id = uuid.uuid4()
        op.bulk_insert(
            credits,
            [
                {
                    "id": credit_id,
                    "utr": reference,
                    "claim_type": row["claim_type"],
                    "claim_id": _as_uuid(row["id"]),
                    "owner_user_id": _as_uuid(row["owner_user_id"]),
                    "amount_paise": row["amount_paise"],
                    "currency": row["currency"] or "INR",
                    "receipt_path": row["receipt_path"],
                    "receipt_filename": row["receipt_filename"],
                    "status": "CLAIMED",
                    "created_at": _as_dt(row["created_at"]),
                    "updated_at": _as_dt(row["created_at"]),
                }
            ],
        )
        table = next(
            t for t in _CLAIM_TYPE if _CLAIM_TYPE[t] == row["claim_type"]
        )
        handle = _claim_table(table)
        conn.execute(
            handle.update()
            .where(handle.c.id == _as_uuid(row["id"]))
            .values(bank_credit_id=credit_id)
        )


def downgrade() -> None:
    conn = op.get_bind()
    for table in ("payments", "listing_fees", "profile_visibilities"):
        if conn.dialect.name != 'sqlite':
            op.drop_constraint(
                f'fk_{table}_bank_credit_id_bank_credits', table, type_='foreignkey'
            )
        op.drop_index(f'ix_{table}_bank_credit_id', table_name=table)
        with op.batch_alter_table(table) as batch:
            batch.drop_column('bank_credit_id')

    op.drop_index('ux_bank_credits_live_utr', table_name='bank_credits')
    op.drop_index('ix_bank_credits_status', table_name='bank_credits')
    op.drop_index('ix_bank_credits_owner_user_id', table_name='bank_credits')
    op.drop_index('ix_bank_credits_claim_id', table_name='bank_credits')
    op.drop_index('ix_bank_credits_utr', table_name='bank_credits')
    op.drop_table('bank_credits')
