"""Migration tests against the current schema and Alembic chain.

Covers:
* a fresh SQLite database migrates base -> the single current head with the
  exact expected table set
* the head schema contains the columns/indexes the application actually uses
* the current ORM enums round-trip through the migrated schema
* representative rows written at an older revision survive the full upgrade
* an unmanaged legacy table and its rows survive an upgrade untouched
* upgrade is repeatable and idempotent at head
* one downgrade and re-upgrade preserve data and restore the head index
* application startup does not create schema

PostgreSQL-native behavior is not exercised here. The equivalent read-only
schema checks for a real PostgreSQL/Supabase project live in
``ops/supabase_read_only_inspection.sql``.
"""
import os
import subprocess
import sys
import uuid
from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker

from app.config import settings
from app.models.document import Document, DocumentType
from app.models.profile import Profile, VerificationStatus
from app.models.user import User

BACKEND_DIR = Path(__file__).resolve().parents[1]
ALEMBIC_INI = BACKEND_DIR / "alembic.ini"

# Revision chain (see alembic/versions). There is exactly one head.
OLD_HEAD = "3f3cfac91e8a"          # documents.name / extracted_text added
PRE_HEAD = "e3f4a5b6c7d8"          # immediate parent of HEAD
HEAD = "b1c9d2e3f4a5"              # shared bank credit (one claim per UTR)

# Exact schema produced by `alembic upgrade head` on SQLite.
EXPECTED_TABLES = {
    "access_packs", "access_tokens", "alembic_version", "bank_credits", "documents",
    "favorite_providers", "jobs", "listing_fees", "moderation_audit_logs",
    "notifications", "organizations", "password_reset_codes",
    "payment_audit_logs", "payments", "ports", "profile_subcategories",
    "profile_visibilities", "profiles", "quotes", "rate_limit_events",
    "refresh_sessions", "reports", "reviews", "service_categories",
    "service_requests", "services", "subscription_plans", "subscriptions",
    "supply_listings", "support_tickets", "users", "vendor_categories",
    "vendor_subcategories",
}

# Tables that a create_all-era database might have had. They are NOT part of
# the current migration chain and must not be asserted as current schema.
OBSOLETE_CREATE_ALL_TABLES = {"admin_accounts", "admin_audit_log"}


def _alembic_config(db_url: str) -> Config:
    """Alembic config for a specific DB URL.

    env.py reads settings.DATABASE_URL at migration time and overrides the
    ini value, so we pin the (mutable) settings attribute as well.
    """
    cfg = Config(str(ALEMBIC_INI))
    cfg.set_main_option("sqlalchemy.url", db_url)
    settings.DATABASE_URL = db_url  # env.py overrides the ini url with this
    return cfg


def _fresh_db(tmp_path, name="test.db") -> str:
    return f"sqlite:///{tmp_path / name}"


def _raw_conn(db_url):
    """Bare sqlite3 connection for schema-agnostic row inserts/checks."""
    import sqlite3
    path = db_url.replace("sqlite:///", "")
    return sqlite3.connect(str(path))


def _insert_old_schema_rows(db_url: str) -> None:
    """Insert representative rows at OLD_HEAD (schema as of phase_2..3f3cfac9)."""
    conn = _raw_conn(db_url)
    cur = conn.cursor()
    user_id = uuid.uuid4().hex
    now = "2026-01-01 00:00:00"

    cur.execute(
        "INSERT INTO users (id, email, password_hash, role, full_name, phone, is_verified, created_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (user_id, "legacy@example.com", "hash", "provider", "Legacy Co", None, 1, now),
    )

    profile_key = uuid.uuid4().hex
    cur.execute(
        "INSERT INTO profiles (id, user_id, position, company_name, bio, years_experience, ports_served,"
        " contacts, licenses, team, offices, social_links, availability_status, verification_status,"
        " badge_label, rating_avg, jobs_completed, created_at, updated_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (profile_key, user_id, "Director", "Legacy Co", None, 10, None, None, None, None, None, None,
         "available", "pending", None, 4.5, 12, now, now),
    )

    # Old services columns only. service_id/port_id/status and the paid-placement
    # columns are added by later migrations.
    service_id = uuid.uuid4().hex
    cur.execute(
        "INSERT INTO services (id, provider_id, name, category, subcategory, description, pricing_model,"
        " is_active, certifications_required, images, created_at, updated_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (service_id, user_id, "Hull Cleaning", "Hull Inspection", None, None, "Fixed Price", 1, None, None, now, now),
    )

    req_id = uuid.uuid4().hex
    cur.execute(
        "INSERT INTO service_requests (id, client_id, title, service_type, subcategory, vessel_name,"
        " vessel_type, port, description, budget, required_completion_date, attachments,"
        " selected_quotation_id, urgency, status, created_at, updated_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (req_id, user_id, "Clean hull", "Hull Inspection", None, "MV Legacy", "Tanker", "Singapore",
         None, 5000.0, None, None, None, "medium", "open", now, now),
    )

    quote_id = uuid.uuid4().hex
    cur.execute(
        "INSERT INTO quotes (id, request_id, provider_id, quotation_reference, pricing_model, amount,"
        " currency, travel_charges, emergency_charges, taxes_included, message, estimated_duration,"
        " estimated_start_date, estimated_completion_date, warranty_period, payment_terms, attachments,"
        " validity_date, status, created_at, updated_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (quote_id, req_id, user_id, "L-001", "Fixed Price", 4500.0, "USD", 0.0, 0.0, 1, "Quote",
         "3 days", None, None, None, None, None, None, "submitted", now, now),
    )
    conn.commit()
    conn.close()


# --------------------------------------------------------------------------
# 1. Fresh database: base -> head
# --------------------------------------------------------------------------
def test_fresh_base_to_head_creates_exact_current_schema(tmp_path):
    db_url = _fresh_db(tmp_path)
    command.upgrade(_alembic_config(db_url), "head")

    engine = create_engine(db_url, connect_args={"check_same_thread": False})
    tables = set(inspect(engine).get_table_names())
    engine.dispose()

    assert tables == EXPECTED_TABLES, (
        f"Missing: {EXPECTED_TABLES - tables}; unexpected: {tables - EXPECTED_TABLES}"
    )
    assert not (OBSOLETE_CREATE_ALL_TABLES & tables), (
        f"Removed create_all-era tables returned: {OBSOLETE_CREATE_ALL_TABLES & tables}"
    )
    with _raw_conn(db_url) as conn:
        version = conn.execute("SELECT version_num FROM alembic_version").fetchone()[0]
    assert version == HEAD


def test_head_schema_has_reconciled_columns_and_constraints(tmp_path):
    db_url = _fresh_db(tmp_path)
    command.upgrade(_alembic_config(db_url), "head")

    engine = create_engine(db_url, connect_args={"check_same_thread": False})
    insp = inspect(engine)

    def cols(table):
        return {c["name"] for c in insp.get_columns(table)}

    # Service listing lifecycle + paid placement (subscription_id is NOT a
    # services column; subscription linkage lives on access_packs/payments).
    assert {
        "service_id", "port_id", "status", "rejection_reason", "price_paise",
        "published_at", "expires_at",
    } <= cols("services")
    assert "subscription_id" not in cols("services")

    assert {
        "provider_accepted_at", "quotation_reference", "validity_date",
    } <= cols("quotes")
    assert "scope_of_work" not in cols("quotes")

    assert {"request_type", "quantity", "specifications"} <= cols("service_requests")
    assert {"username", "password_reset_at", "access_control_enabled", "active_device_id"} <= cols("users")
    assert {"unused_expires_at", "owner_user_id", "current_user_id", "pack_id"} <= cols("access_tokens")
    assert {"owner_user_id", "subscription_id", "token_count", "status"} <= cols("access_packs")

    # Current indexes. The old uq_provider_service_port constraint no longer exists.
    service_indexes = {i["name"] for i in insp.get_indexes("services")}
    assert {"ix_services_service_id", "ix_services_port_id", "ix_services_status"} <= service_indexes
    assert "uq_provider_service_port" not in {
        c["name"] for c in insp.get_unique_constraints("services")
    }

    # The partial unique index that makes one live quote per provider/request
    # deterministic is created by HEAD.
    quote_indexes = {i["name"]: i["unique"] for i in insp.get_indexes("quotes")}
    # SQLite's inspector reports uniqueness as 1/0; PostgreSQL reports bool.
    assert bool(quote_indexes.get("uq_quotes_provider_request_live")) is True

    # Obsolete create_all-era admin tables are neither present nor expected.
    assert not (OBSOLETE_CREATE_ALL_TABLES & set(insp.get_table_names()))
    engine.dispose()


def test_enums_accept_current_members_via_orm(tmp_path):
    db_url = _fresh_db(tmp_path)
    command.upgrade(_alembic_config(db_url), "head")

    engine = create_engine(db_url, connect_args={"check_same_thread": False})
    Session = sessionmaker(bind=engine)
    session = Session()
    user = User(
        email=f"enum-{uuid.uuid4()}@example.com", password_hash="hash",
        role="provider", full_name="Enum User", is_verified=False,
    )
    session.add(user)
    session.flush()
    profile = Profile(
        user_id=user.id, years_experience=1, company_name="Enum Co",
        availability_status="available",
        verification_status=VerificationStatus.pending,
        rating_avg=0.0, jobs_completed=0,
    )
    document = Document(
        user_id=user.id, document_type=DocumentType.quotation,
        file_url="uploads/test.pdf", verification_status="extracted",
    )
    session.add_all([profile, document])
    session.commit()

    fetched_profile = session.get(Profile, profile.id)
    fetched_doc = session.get(Document, document.id)
    assert fetched_profile.verification_status is VerificationStatus.pending
    assert fetched_doc.document_type is DocumentType.quotation
    assert fetched_doc.verification_status.value == "extracted"
    session.close()
    engine.dispose()


# --------------------------------------------------------------------------
# 2. Existing data survives
# --------------------------------------------------------------------------
def test_data_survives_upgrade_from_old_head(tmp_path):
    db_url = _fresh_db(tmp_path)
    cfg = _alembic_config(db_url)
    command.upgrade(cfg, OLD_HEAD)
    _insert_old_schema_rows(db_url)

    command.upgrade(cfg, "head")

    engine = create_engine(db_url, connect_args={"check_same_thread": False})
    with engine.connect() as conn:
        assert conn.execute(text("SELECT count(*) FROM users")).scalar() == 1
        assert conn.execute(text("SELECT count(*) FROM profiles")).scalar() == 1
        assert conn.execute(text("SELECT count(*) FROM service_requests")).scalar() == 1
        assert conn.execute(text("SELECT count(*) FROM quotes")).scalar() == 1

        svc = conn.execute(
            text(
                "SELECT service_id, port_id, status, price_paise, published_at, expires_at "
                "FROM services"
            )
        ).fetchone()
        # No matching keys or paid placement were invented by the migration;
        # is_active=1 was backfilled to status='approved'.
        assert svc == (None, None, "approved", None, None, None), (
            f"Unexpected service backfill: {svc}"
        )

        req = conn.execute(
            text("SELECT request_type, quantity, specifications FROM service_requests")
        ).fetchone()
        assert req == ("service", None, None), f"Unexpected request backfill: {req}"

        quote = conn.execute(
            text("SELECT provider_accepted_at, quotation_reference, status FROM quotes")
        ).fetchone()
        assert quote == (None, "L-001", "submitted"), f"Unexpected quote row: {quote}"

        # The HEAD partial index exists after upgrade.
        idx = {i["name"]: i["unique"] for i in inspect(engine).get_indexes("quotes")}
        assert bool(idx.get("uq_quotes_provider_request_live")) is True
    engine.dispose()


# --------------------------------------------------------------------------
# 3. Unmanaged legacy schema is not destroyed
# --------------------------------------------------------------------------
def test_unmanaged_legacy_table_and_rows_survive_upgrade(tmp_path):
    """A table outside Alembic's metadata must not be dropped or rewritten."""
    db_url = _fresh_db(tmp_path)
    cfg = _alembic_config(db_url)
    command.upgrade(cfg, OLD_HEAD)

    conn = _raw_conn(db_url)
    conn.execute(
        "CREATE TABLE legacy_archive (id CHAR(32) PRIMARY KEY, note VARCHAR NOT NULL)"
    )
    conn.execute(
        "INSERT INTO legacy_archive (id, note) VALUES (?, ?)",
        (uuid.uuid4().hex, "preserve me"),
    )
    conn.commit()
    conn.close()

    command.upgrade(cfg, "head")

    with _raw_conn(db_url) as conn2:
        assert conn2.execute("SELECT count(*) FROM legacy_archive").fetchone()[0] == 1
        assert conn2.execute("SELECT note FROM legacy_archive").fetchone()[0] == "preserve me"


def test_upgrade_is_repeatable(tmp_path):
    db_url = _fresh_db(tmp_path)
    cfg = _alembic_config(db_url)
    command.upgrade(cfg, "head")
    command.upgrade(cfg, "head")  # second run: already at head, must not fail
    with _raw_conn(db_url) as conn:
        assert conn.execute("SELECT version_num FROM alembic_version").fetchone()[0] == HEAD
        assert conn.execute("SELECT count(*) FROM users").fetchone()[0] == 0


# --------------------------------------------------------------------------
# 4. Downgrade one revision and return
# --------------------------------------------------------------------------
def test_downgrade_one_revision_and_back_preserves_data(tmp_path):
    db_url = _fresh_db(tmp_path)
    cfg = _alembic_config(db_url)
    command.upgrade(cfg, "head")

    engine = create_engine(db_url, connect_args={"check_same_thread": False})
    Session = sessionmaker(bind=engine)
    session = Session()
    user = User(
        email="downgrade@example.com", password_hash="h", role="client",
        is_verified=False,
    )
    session.add(user)
    session.flush()
    session.add(Document(
        user_id=user.id, document_type=DocumentType.quotation,
        file_url="uploads/x.pdf", verification_status="pending",
    ))
    session.commit()
    session.close()
    engine.dispose()

    # HEAD's parent (e3f4a5b6c7d8) has all columns used above; the catalogue seed
    # is data-only and the bank-credit tables are additive, so one downgrade
    # preserves every document.
    command.downgrade(cfg, PRE_HEAD)

    engine = create_engine(db_url, connect_args={"check_same_thread": False})
    insp = inspect(engine)
    with engine.connect() as conn:
        assert conn.execute(text("SELECT version_num FROM alembic_version")).scalar() == PRE_HEAD
        assert conn.execute(text("SELECT count(*) FROM documents")).scalar() == 1
    # The partial quote index belongs to HEAD's parent, so a data-only catalogue
    # downgrade must leave it in place.
    assert "uq_quotes_provider_request_live" in {
        i["name"] for i in insp.get_indexes("quotes")
    }
    assert {
        "service_id", "port_id", "status", "price_paise", "published_at", "expires_at",
    } <= {c["name"] for c in insp.get_columns("services")}
    engine.dispose()

    # Round-trip: data survives and HEAD's index is restored exactly once.
    command.upgrade(cfg, "head")
    with _raw_conn(db_url) as conn2:
        assert conn2.execute("SELECT version_num FROM alembic_version").fetchone()[0] == HEAD
        assert conn2.execute("SELECT count(*) FROM documents").fetchone()[0] == 1
    engine2 = create_engine(db_url, connect_args={"check_same_thread": False})
    idx = {i["name"]: i["unique"] for i in inspect(engine2).get_indexes("quotes")}
    engine2.dispose()
    assert bool(idx.get("uq_quotes_provider_request_live")) is True


# --------------------------------------------------------------------------
# 5. Application startup must NOT create schema
# --------------------------------------------------------------------------
def test_head_seeds_the_canonical_service_catalogue(tmp_path):
    from app.service_catalogue import SERVICE_CATALOGUE, SERVICE_GROUP_ORDER

    db_url = _fresh_db(tmp_path)
    command.upgrade(_alembic_config(db_url), "head")

    with _raw_conn(db_url) as conn:
        rows = conn.execute(
            "SELECT name, category_group FROM service_categories ORDER BY name"
        ).fetchall()

    expected = {
        (name, group)
        for group, names in SERVICE_CATALOGUE
        for name in names
    }
    assert set(rows) == expected
    assert len(rows) == len(expected)
    assert {group for _name, group in rows} == set(SERVICE_GROUP_ORDER)


def test_head_seeds_supplier_profile_categories(tmp_path):
    from app.supplier_catalogue import SUPPLIER_PROFILE_CATEGORIES

    db_url = _fresh_db(tmp_path)
    command.upgrade(_alembic_config(db_url), "head")

    with _raw_conn(db_url) as conn:
        rows = conn.execute(
            "SELECT name FROM vendor_categories "
            "WHERE vendor_type='supplier' ORDER BY sort_order, name"
        ).fetchall()

    assert [name for (name,) in rows] == list(SUPPLIER_PROFILE_CATEGORIES)


def test_production_startup_does_not_create_schema(tmp_path):
    db = tmp_path / "startup.db"
    env = os.environ.copy()
    env["DATABASE_URL"] = f"sqlite:///{db}"
    env["JWT_SECRET"] = "startup-test-secret"
    env["ENVIRONMENT"] = "development"
    code = (
        "import sqlalchemy as sa\n"
        "import app.main  # noqa: F401  (app startup path)\n"
        "from app.database import engine\n"
        "tables = set(sa.inspect(engine).get_table_names())\n"
        "assert tables == set(), f'Tables created at startup: {tables}'\n"
        "print('NO_TABLES_CREATED')\n"
    )
    result = subprocess.run(
        [sys.executable, "-c", code],
        cwd=str(BACKEND_DIR), env=env, capture_output=True, text=True, timeout=120,
    )
    assert "NO_TABLES_CREATED" in result.stdout, f"stdout={result.stdout!r} stderr={result.stderr!r}"
    assert result.returncode == 0, result.stderr
    # NOTE: sqlite creates the empty file on connection, so only the table-list
    # assertion above is meaningful for "startup must not mutate schema".
