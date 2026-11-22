"""Revocable refresh tokens

Revision ID: e9f0a1b2c3d4
Revises: c7d8e9f0a1b2
Create Date: 2026-10-26

A refresh JWT was bearer-until-expiry: nothing on the server could take it back
before its 7-day lifetime. `refresh_sessions` records every issued token by its
`jti` so refresh rotates it (single use), logout revokes the account's sessions,
a password reset revokes them all, and replaying a spent token revokes
everything the account holds.

Rows are created at login; existing sessions simply have no row, so their next
refresh is refused and the user signs in again — the intended, fail-closed
consequence of introducing revocation.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'e9f0a1b2c3d4'
down_revision: Union[str, Sequence[str], None] = 'c7d8e9f0a1b2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'refresh_sessions',
        sa.Column('id', sa.Uuid(), primary_key=True, nullable=False),
        sa.Column(
            'user_id',
            sa.Uuid(),
            sa.ForeignKey('users.id', ondelete='CASCADE'),
            nullable=False,
        ),
        sa.Column('jti', sa.String(length=64), nullable=False),
        sa.Column('issued_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('revoked_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('replaced_by_jti', sa.String(length=64), nullable=True),
        sa.Column('revoked_reason', sa.String(length=32), nullable=True),
    )
    op.create_index(
        'ix_refresh_sessions_user_id', 'refresh_sessions', ['user_id'], unique=False
    )
    op.create_index(
        'ix_refresh_sessions_jti', 'refresh_sessions', ['jti'], unique=True
    )


def downgrade() -> None:
    op.drop_index('ix_refresh_sessions_jti', table_name='refresh_sessions')
    op.drop_index('ix_refresh_sessions_user_id', table_name='refresh_sessions')
    op.drop_table('refresh_sessions')
