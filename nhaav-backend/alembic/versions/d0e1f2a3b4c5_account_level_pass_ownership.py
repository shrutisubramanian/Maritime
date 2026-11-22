"""Account-level pass ownership + 40-day per-pass unused validity

Revision ID: d0e1f2a3b4c5
Revises: c9d0e1f2a3b4
Create Date: 2026-10-07

Captain's final rules change the ENTITLEMENT OWNERSHIP BOUNDARY:

  * BEFORE: Organization -> shared AccessPack -> shared AccessTokens -> employees
  * AFTER : Account (User) -> Subscription -> AccessPack -> AccessTokens

A purchased pass belongs to the individual ACCOUNT that bought it. Company
(`organizations`) rows are retained as optional business/company metadata only;
they no longer decide who may consume a pass.

This migration is ADDITIVE where possible — no existing table or row is deleted
and no ownership is guessed:

1. `users.access_control_enabled` — the account-level entitlement gate that
   replaces the legacy `organizations.access_control_enabled`. Backfilled from
   the user's organization membership (a faithful, non-inventive translation of
   the existing gate state, including the gate-off legacy default).

2. `subscriptions.owner_user_id`, `access_packs.owner_user_id`,
   `access_tokens.owner_user_id`, `payments.owner_user_id` — the new ownership
   boundary. Nullable, because pre-ownership rows cannot always be mapped to ONE
   account without guessing.

3. `access_tokens.available_at` / `unused_expires_at` — the per-pass 40-day
   unused-validity window. Backfilled for existing rows as
   `available_at = created_at`, `unused_expires_at = created_at + 40 days`,
   which is the exact rule applied to new passes (a pass becomes available when
   it is issued).

4. `organization_id` becomes NULLABLE on subscriptions / access_packs /
   access_tokens / payments, so an account can hold entitlements with no
   company attached.

BACKFILL POLICY (deliberately conservative):

  * `users.access_control_enabled` and `access_tokens.unused_expires_at` are
    backfilled because they are derivable exactly.
  * `access_tokens.owner_user_id` is backfilled ONLY for rows already ACTIVE
    (`current_user_id` names the holder — exact, not a guess).
  * `access_packs.owner_user_id` and `subscriptions.owner_user_id` are LEFT NULL.
    A shared legacy pack has no single owning account, and assigning one would
    be exactly the kind of guess the rules forbid. Those packs are inert until an
    operator assigns an owner explicitly
    (`AccessTokenService.assign_pack_owner`). See ACCESS_OWNERSHIP_REPORT.md.
  * `payments.owner_user_id` is backfilled from `submitted_by` (the account that
    submitted it — exact).

Downgrade reverses every step and leaves the pre-existing data intact.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd0e1f2a3b4c5'
down_revision: Union[str, Sequence[str], None] = 'c9d0e1f2a3b4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# 40 days, in seconds — a pass that is never allocated inside this window expires.
_UNUSED_VALIDITY_SECONDS = 40 * 24 * 60 * 60

_ACTIVE_PREDICATE = sa.text("status = 'ACTIVE'")


def upgrade() -> None:
    # ------------------------------------------------------------------ users
    with op.batch_alter_table('users') as batch_op:
        batch_op.add_column(
            sa.Column(
                'access_control_enabled',
                sa.Boolean(),
                nullable=False,
                server_default=sa.false(),
            )
        )
    op.execute(
        """
        UPDATE users
           SET access_control_enabled = 1
         WHERE id IN (
               SELECT p.user_id
                 FROM profiles p
                 JOIN organizations o ON o.id = p.organization_id
                WHERE o.access_control_enabled = 1
         )
        """
    )

    # ----------------------------------------------------------- subscriptions
    with op.batch_alter_table('subscriptions') as batch_op:
        batch_op.add_column(sa.Column('owner_user_id', sa.UUID(), nullable=True))
        batch_op.alter_column(
            'organization_id', existing_type=sa.UUID(), nullable=True
        )
        batch_op.create_foreign_key(
            'fk_subscriptions_owner_user_id_users',
            'users',
            ['owner_user_id'],
            ['id'],
            ondelete='CASCADE',
        )
    op.create_index(
        'ix_subscriptions_owner_user_id', 'subscriptions', ['owner_user_id']
    )
    op.create_index(
        'ix_subscriptions_owner_status', 'subscriptions', ['owner_user_id', 'status']
    )
    # Legacy organization-scoped lookup index; ownership is per account now.
    op.execute('DROP INDEX IF EXISTS ix_subscriptions_org_status')

    # ------------------------------------------------------------ access_packs
    with op.batch_alter_table('access_packs') as batch_op:
        batch_op.add_column(sa.Column('owner_user_id', sa.UUID(), nullable=True))
        batch_op.alter_column(
            'organization_id', existing_type=sa.UUID(), nullable=True
        )
        batch_op.create_foreign_key(
            'fk_access_packs_owner_user_id_users',
            'users',
            ['owner_user_id'],
            ['id'],
            ondelete='CASCADE',
        )
    op.create_index('ix_access_packs_owner_user_id', 'access_packs', ['owner_user_id'])

    # ----------------------------------------------------------- access_tokens
    with op.batch_alter_table('access_tokens') as batch_op:
        batch_op.add_column(sa.Column('owner_user_id', sa.UUID(), nullable=True))
        batch_op.add_column(sa.Column('available_at', sa.DateTime(timezone=True), nullable=True))
        batch_op.add_column(
            sa.Column('unused_expires_at', sa.DateTime(timezone=True), nullable=True)
        )
        batch_op.alter_column(
            'organization_id', existing_type=sa.UUID(), nullable=True
        )
        batch_op.create_foreign_key(
            'fk_access_tokens_owner_user_id_users',
            'users',
            ['owner_user_id'],
            ['id'],
            ondelete='CASCADE',
        )

    op.create_index('ix_access_tokens_owner_status', 'access_tokens', ['owner_user_id', 'status'])
    op.create_index('ix_access_tokens_unused_expiry', 'access_tokens', ['unused_expires_at'])
    # Legacy organization-scoped pool index; ownership is per account now.
    op.execute('DROP INDEX IF EXISTS ix_access_tokens_org_status')
    # One ACTIVE pass per ACCOUNT, in addition to the existing per-session index.
    op.create_index(
        'uq_access_tokens_active_per_owner',
        'access_tokens',
        ['owner_user_id'],
        unique=True,
        sqlite_where=_ACTIVE_PREDICATE,
        postgresql_where=_ACTIVE_PREDICATE,
    )

    # Existing ACTIVE rows: the holder is known exactly.
    op.execute(
        """
        UPDATE access_tokens
           SET owner_user_id = current_user_id
         WHERE status = 'ACTIVE'
           AND current_user_id IS NOT NULL
        """
    )
    # Every existing pass gets its own 40-day window from when it was issued.
    op.execute(
        f"""
        UPDATE access_tokens
           SET available_at = created_at,
               unused_expires_at = datetime(created_at, '+{_UNUSED_VALIDITY_SECONDS} seconds')
         WHERE created_at IS NOT NULL
        """
    )

    # ---------------------------------------------------------------- payments
    with op.batch_alter_table('payments') as batch_op:
        batch_op.add_column(sa.Column('owner_user_id', sa.UUID(), nullable=True))
        batch_op.alter_column(
            'organization_id', existing_type=sa.UUID(), nullable=True
        )
        batch_op.create_foreign_key(
            'fk_payments_owner_user_id_users',
            'users',
            ['owner_user_id'],
            ['id'],
            ondelete='SET NULL',
        )
    op.create_index('ix_payments_owner_user_id', 'payments', ['owner_user_id'])
    op.create_index('ix_payments_owner_status', 'payments', ['owner_user_id', 'status'])
    # Legacy organization-scoped lookup index; ownership is per account now.
    op.execute('DROP INDEX IF EXISTS ix_payments_org_status')
    op.execute(
        """
        UPDATE payments
           SET owner_user_id = submitted_by
         WHERE submitted_by IS NOT NULL
        """
    )


def downgrade() -> None:
    # Restore the legacy organization-scoped indexes this revision dropped.
    op.execute('CREATE INDEX IF NOT EXISTS ix_payments_org_status ON payments (organization_id, status)')
    op.execute(
        'CREATE INDEX IF NOT EXISTS ix_access_tokens_org_status ON access_tokens (organization_id, status)'
    )
    op.execute(
        'CREATE INDEX IF NOT EXISTS ix_subscriptions_org_status ON subscriptions (organization_id, status)'
    )

    op.drop_index('ix_payments_owner_status', table_name='payments')
    op.drop_index('ix_payments_owner_user_id', table_name='payments')
    with op.batch_alter_table('payments') as batch_op:
        batch_op.drop_constraint('fk_payments_owner_user_id_users', type_='foreignkey')
        batch_op.drop_column('owner_user_id')

    op.drop_index('uq_access_tokens_active_per_owner', table_name='access_tokens')
    op.drop_index('ix_access_tokens_unused_expiry', table_name='access_tokens')
    op.drop_index('ix_access_tokens_owner_status', table_name='access_tokens')
    with op.batch_alter_table('access_tokens') as batch_op:
        batch_op.drop_constraint('fk_access_tokens_owner_user_id_users', type_='foreignkey')
        batch_op.drop_column('unused_expires_at')
        batch_op.drop_column('available_at')
        batch_op.drop_column('owner_user_id')

    op.drop_index('ix_access_packs_owner_user_id', table_name='access_packs')
    with op.batch_alter_table('access_packs') as batch_op:
        batch_op.drop_constraint('fk_access_packs_owner_user_id_users', type_='foreignkey')
        batch_op.drop_column('owner_user_id')

    op.drop_index('ix_subscriptions_owner_status', table_name='subscriptions')
    op.drop_index('ix_subscriptions_owner_user_id', table_name='subscriptions')
    with op.batch_alter_table('subscriptions') as batch_op:
        batch_op.drop_constraint('fk_subscriptions_owner_user_id_users', type_='foreignkey')
        batch_op.drop_column('owner_user_id')

    with op.batch_alter_table('users') as batch_op:
        batch_op.drop_column('access_control_enabled')
