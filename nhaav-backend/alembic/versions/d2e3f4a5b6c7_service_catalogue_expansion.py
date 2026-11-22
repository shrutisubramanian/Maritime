"""Expand the shared service catalogue.

Revision ID: d2e3f4a5b6c7
Revises: c6d7e8f9a0b1
Create Date: 2026-11-06
"""

import uuid

import sqlalchemy as sa
from alembic import op

from app.service_catalogue import SERVICE_CATALOGUE

# revision identifiers, used by Alembic.
revision = "d2e3f4a5b6c7"
down_revision = "c6d7e8f9a0b1"
branch_labels = None
depends_on = None


def _insert_category(bind, table, name: str, group: str) -> None:
    """Insert one row with a UUID that works on SQLite and PostgreSQL.

    SQLite stores this UUID column with NUMERIC affinity, so reflecting it as a
    table type and binding a hex string makes SQLAlchemy attempt a float
    conversion. A raw text bind skips that coercion; PostgreSQL takes the UUID
    object through the reflected type.
    """
    if bind.dialect.name == "sqlite":
        bind.execute(
            sa.text(
                "INSERT INTO service_categories (id, name, category_group) "
                "VALUES (:id, :name, :category_group)"
            ),
            {
                "id": uuid.uuid4().hex,
                "name": name,
                "category_group": group,
            },
        )
        return

    bind.execute(
        table.insert().values(
            id=uuid.uuid4(),
            name=name,
            category_group=group,
        )
    )


def upgrade() -> None:
    """Upsert the canonical catalogue while preserving every existing row."""
    bind = op.get_bind()
    table = sa.Table("service_categories", sa.MetaData(), autoload_with=bind)

    existing = {
        row.name
        for row in bind.execute(sa.select(table.c.name)).all()
    }

    for group, service_names in SERVICE_CATALOGUE:
        for name in service_names:
            if name in existing:
                bind.execute(
                    table.update()
                    .where(table.c.name == name)
                    .values(category_group=group)
                )
            else:
                _insert_category(bind, table, name, group)
                existing.add(name)


def downgrade() -> None:
    """Data-only migration: leave the catalogue and all existing rows intact."""
    pass
