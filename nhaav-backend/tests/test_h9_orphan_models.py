"""H9 orphan-model regression tests.

Proves the orphan cleanup (reports / support_tickets / favorite_providers):

* the models and schemas are gone from the codebase and from Base.metadata
  (so create_all-era tooling and Alembic autogenerate can never resurrect
  them from the app side)
* migrating a fresh database to head drops the three tables
* the drop migration REFUSES to run if a table still contains rows — the
  guard is data-preserving, and the surviving row is left intact
* the guard is re-runnable: once the table is emptied the migration proceeds
* the six PostgreSQL-only enum types used exclusively by the orphan tables
  are tracked by the migration (their DROP TYPE step is PostgreSQL-gated and
  therefore asserted by inspection of the migration module, not execution)
"""
import sqlite3
import uuid
from pathlib import Path

import pytest
from alembic import command
from sqlalchemy import create_engine, inspect, text

from test_migrations import (
    ALEMBIC_INI,
    BACKEND_DIR,
    H9_ORPHAN_TABLES,
    PRE_H9_HEAD,
    _alembic_config,
    _fresh_db,
)

MODELS_DIR = BACKEND_DIR / "app" / "models"
SCHEMAS_DIR = BACKEND_DIR / "app" / "schemas"


# --------------------------------------------------------------------------
# 1. Code removal: models/schemas gone, ORM metadata clean
# --------------------------------------------------------------------------
def test_orphan_model_and_schema_files_are_gone():
    for rel in (
        "app/models/report.py",
        "app/models/support_ticket.py",
        "app/models/favorite_provider.py",
        "app/schemas/report.py",
        "app/schemas/support_ticket.py",
    ):
        assert not (BACKEND_DIR / rel).exists(), f"{rel} should have been deleted"


def test_orphan_models_absent_from_base_metadata():
    """Nothing that imports app.models may resurrect the orphan tables."""
    import app.models  # noqa: F401  (imports every surviving model)
    from app.database import Base

    table_names = set(Base.metadata.tables)
    assert not (H9_ORPHAN_TABLES & table_names), (
        f"Orphan tables back in metadata: {H9_ORPHAN_TABLES & table_names}"
    )


def test_models_init_does_not_import_orphans():
    init_src = (MODELS_DIR / "__init__.py").read_text(encoding="utf-8")
    for banned in ("SupportTicket", "FavoriteProvider"):
        assert f"import {banned}" not in init_src
        assert f"from .{banned.lower()}" not in init_src
    # "Report" only appears in the explanatory H9 comment — assert no import.
    assert "from app.models.report import" not in init_src
    assert "from .report import" not in init_src


# --------------------------------------------------------------------------
# 2. Migration behaviour
# --------------------------------------------------------------------------
def test_upgrade_to_head_drops_orphan_tables(tmp_path):
    db_url = _fresh_db(tmp_path)
    cfg = _alembic_config(db_url)
    command.upgrade(cfg, PRE_H9_HEAD)  # tables still exist at the pre-H9 head

    engine = create_engine(db_url, connect_args={"check_same_thread": False})
    present = set(inspect(engine).get_table_names())
    assert H9_ORPHAN_TABLES <= present, "tables should exist before the drop"
    engine.dispose()

    command.upgrade(cfg, "head")

    engine = create_engine(db_url, connect_args={"check_same_thread": False})
    tables = set(inspect(engine).get_table_names())
    engine.dispose()
    assert not (H9_ORPHAN_TABLES & tables), f"still present: {H9_ORPHAN_TABLES & tables}"


def test_drop_guard_refuses_when_rows_exist(tmp_path):
    db_url = _fresh_db(tmp_path)
    cfg = _alembic_config(db_url)
    command.upgrade(cfg, PRE_H9_HEAD)

    # Out-of-band data appears in an orphan table (the exact scenario the
    # guard exists for: someone, somewhere, wrote rows the app never did).
    conn = sqlite3.connect(db_url.replace("sqlite:///", ""))
    # support_tickets.user_id is NOT NULL — even an out-of-band row must carry
    # one. SQLite does not enforce the FK by default, so a bare hex id suffices
    # (which is exactly what unmanaged writes would look like).
    conn.execute(
        "INSERT INTO support_tickets (id, ticket_number, user_id, subject, description,"
        " category, priority, status, created_at, updated_at)"
        " VALUES (?, ?, ?, ?, ?, ?, ?, ?, '2026-01-01 00:00:00', '2026-01-01 00:00:00')",
        (uuid.uuid4().hex, "T-0001", uuid.uuid4().hex, "mystery ticket",
         "orphan row", "general", "low", "open"),
    )
    conn.commit()
    conn.close()

    with pytest.raises(Exception) as excinfo:
        command.upgrade(cfg, "head")

    assert "Refusing to drop orphan table 'support_tickets'" in str(excinfo.value)
    # The migration is transactional (engine.begin): nothing may have been
    # dropped or modified — version stays at PRE_H9_HEAD and the row survives.
    with sqlite3.connect(db_url.replace("sqlite:///", "")) as check:
        version = check.execute("SELECT version_num FROM alembic_version").fetchone()[0]
        assert version == PRE_H9_HEAD
        count = check.execute("SELECT COUNT(*) FROM support_tickets").fetchone()[0]
        assert count == 1, "guard must preserve the out-of-band row"


def test_guard_is_re_runnable_once_table_emptied(tmp_path):
    db_url = _fresh_db(tmp_path)
    cfg = _alembic_config(db_url)
    command.upgrade(cfg, PRE_H9_HEAD)

    conn = sqlite3.connect(db_url.replace("sqlite:///", ""))
    # reporter_id/reported_user_id are NOT NULL in the phase-2 shape.
    conn.execute(
        "INSERT INTO reports (id, reporter_id, reported_user_id, report_type, reason,"
        " status, created_at) VALUES (?, ?, ?, 'user', 'spam', 'pending',"
        " '2026-01-01 00:00:00')",
        (uuid.uuid4().hex, uuid.uuid4().hex, uuid.uuid4().hex),
    )
    conn.commit()
    conn.close()

    with pytest.raises(Exception, match="Refusing to drop"):
        command.upgrade(cfg, "head")

    # Operator decision: the out-of-band row is inspected and removed — the
    # migration must then succeed without recreating the database.
    conn = sqlite3.connect(db_url.replace("sqlite:///", ""))
    conn.execute("DELETE FROM reports")
    conn.commit()
    conn.close()

    command.upgrade(cfg, "head")  # must not fail
    engine = create_engine(db_url, connect_args={"check_same_thread": False})
    tables = set(inspect(engine).get_table_names())
    engine.dispose()
    assert not (H9_ORPHAN_TABLES & tables)


def test_drop_migration_is_idempotent_on_second_head_upgrade(tmp_path):
    db_url = _fresh_db(tmp_path)
    cfg = _alembic_config(db_url)
    command.upgrade(cfg, "head")
    command.upgrade(cfg, "head")  # already at head: no failure, no re-drop


def test_migration_tracks_postgres_enum_cleanup():
    """The six orphan-only enum types must be dropped on PostgreSQL only."""
    src = (
        BACKEND_DIR / "alembic" / "versions" / "e7a8b9c0d1e2_drop_orphan_tables_h9.py"
    ).read_text(encoding="utf-8")
    for enum_name in (
        "reporttype", "reportreason", "reportstatus",
        "ticketcategory", "ticketpriority", "ticketstatus",
    ):
        assert enum_name in src, f"migration must track pg enum {enum_name}"
    assert 'dialect.name == "postgresql"' in src


def test_migration_upgrade_is_guarded_against_pre_existing_absence():
    """Upgrade path must tolerate tables already absent (adoption scenario)."""
    src = (
        BACKEND_DIR / "alembic" / "versions" / "e7a8b9c0d1e2_drop_orphan_tables_h9.py"
    ).read_text(encoding="utf-8")
    assert "get_table_names" in src  # inspector-guarded, not blind DDL
    assert "already absent" in src


def test_dev_database_has_no_orphan_rows_before_any_drop():
    """Read-only sanity: the real dev DB must be row-free in orphan tables.

    This is the standing evidence behind the Option-3 decision. If this test
    ever fails, the drop migration would refuse to run in this environment —
    which is the designed fail-safe.
    """
    dev_db = BACKEND_DIR / "nhaav.db"
    if not dev_db.exists():
        pytest.skip("no dev database in this checkout")
    conn = sqlite3.connect(str(dev_db))
    try:
        tables = {
            r[0]
            for r in conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table'"
            ).fetchall()
        }
        for table in H9_ORPHAN_TABLES & tables:
            count = conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
            assert count == 0, (
                f"dev database has {count} row(s) in orphan table '{table}'; "
                "the H9 drop migration would refuse to run here"
            )
    finally:
        conn.close()
