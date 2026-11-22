"""Seed the canonical supply-vendor profile categories.

Revision ID: e3f4a5b6c7d8
Revises: d2e3f4a5b6c7
Create Date: 2026-11-07
"""

import uuid
from datetime import datetime

import sqlalchemy as sa
from alembic import op

from app.supplier_catalogue import SUPPLIER_PROFILE_CATEGORIES

# revision identifiers, used by Alembic.
revision = "e3f4a5b6c7d8"
down_revision = "d2e3f4a5b6c7"
branch_labels = None
depends_on = None


def _insert_supplier_category(bind, table, name: str, sort_order: int) -> None:
    """Insert one supplier category with a UUID that works on both databases.

    SQLite stores UUID columns with NUMERIC affinity, so a raw text bind avoids
    SQLAlchemy trying to coerce the id to a float. PostgreSQL receives a real
    UUID object through the reflected table.
    """
    if bind.dialect.name == "sqlite":
        bind.execute(
            sa.text(
                "INSERT INTO vendor_categories "
                "(id, vendor_type, name, is_active, sort_order, created_at) "
                "VALUES (:id, 'supplier', :name, 1, :sort_order, :created_at)"
            ),
            {
                "id": uuid.uuid4().hex,
                "name": name,
                "sort_order": sort_order,
                "created_at": datetime.utcnow().isoformat(sep=" "),
            },
        )
        return

    bind.execute(
        table.insert().values(
            id=uuid.uuid4(),
            vendor_type="supplier",
            name=name,
            is_active=True,
            sort_order=sort_order,
            created_at=datetime.utcnow(),
        )
    )


def _set_sort_order(bind, name: str, sort_order: int) -> None:
    bind.execute(
        sa.text(
            "UPDATE vendor_categories SET sort_order=:sort_order "
            "WHERE vendor_type='supplier' AND name=:name"
        ),
        {"sort_order": sort_order, "name": name},
    )


def upgrade() -> None:
    """Add the eight profile categories while preserving existing rows.

    Existing supplier categories are kept and moved after the canonical eight.
    They may be used by live supply listings, so this migration never deletes or
    deactivates them.
    """
    bind = op.get_bind()
    table = sa.Table("vendor_categories", sa.MetaData(), autoload_with=bind)

    existing = {
        row[0]
        for row in bind.execute(
            sa.text("SELECT name FROM vendor_categories WHERE vendor_type='supplier'")
        ).fetchall()
    }

    for sort_order, name in enumerate(SUPPLIER_PROFILE_CATEGORIES):
        if name in existing:
            _set_sort_order(bind, name, sort_order)
        else:
            _insert_supplier_category(bind, table, name, sort_order)
            existing.add(name)

    canonical = set(SUPPLIER_PROFILE_CATEGORIES)
    legacy_names = sorted(name for name in existing if name not in canonical)
    for offset, name in enumerate(legacy_names, start=len(SUPPLIER_PROFILE_CATEGORIES)):
        _set_sort_order(bind, name, offset)


def downgrade() -> None:
    """Data-only migration: keep every category and all company selections."""
    pass
