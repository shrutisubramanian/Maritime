"""
H4 regression tests — provider/supplier search crashes on `skill` filter.

Finding (Enterprise Readiness Report): ProfileService.search_providers /
search_suppliers filtered on `Profile.skills`, which did not exist on the
model. Any GET /profiles/providers?skill=... raised AttributeError -> 500.
The frontend (providers.ts / marketplace pages) exposes this filter.

Fix under test:
  * Profile.skills JSON column added (model + schema + migration
    b5a6c7d8e9f4)
  * skill filter now cast(Profile.skills, String).ilike(...) — same
    convention as the `port` filter, case-insensitive, portable
  * skills persist via the normal profile create/update API path
"""
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.database import Base, get_db
from app.models.user import User, UserRole
from app.models.profile import Profile, VerificationStatus
from app.utils.password import hash_password

SQLALCHEMY_DATABASE_URL = "sqlite:///./test_h4_skills.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture(scope="module", autouse=True)
def setup_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    app.dependency_overrides[get_db] = override_get_db
    yield
    app.dependency_overrides.pop(get_db, None)


client = TestClient(app)

PASSWORD = "Password123!"


def _make_user(email: str, role: UserRole, skills=None) -> tuple[User, Profile]:
    db = TestingSessionLocal()
    try:
        # Public marketplace search is verified-only; these fixtures exercise
        # the skill filter, so they must be eligible for public discovery.
        user = User(
            email=email,
            password_hash=hash_password(PASSWORD),
            role=role,
            full_name=f"User {email}",
            is_verified=True,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        profile = Profile(
            user_id=user.id,
            company_name=f"Co {email}",
            skills=skills or [],
            verification_status=VerificationStatus.verified,
        )
        db.add(profile)
        db.commit()
        db.refresh(profile)
        return user, profile
    finally:
        db.close()


def _token(email: str) -> str:
    res = client.post("/auth/login", json={"email": email, "password": PASSWORD})
    assert res.status_code == 200, res.text
    return res.json()["access_token"]


@pytest.fixture(scope="module")
def seeded():
    _make_user("h4_a@example.com", UserRole.provider, skills=["welding", "Underwater Inspection"])
    _make_user("h4_b@example.com", UserRole.provider, skills=["Cathodic Protection"])
    _make_user("h4_c@example.com", UserRole.provider, skills=[])
    _make_user("h4_s@example.com", UserRole.supplier, skills=["welding Supply"])
    _make_user("h4_client@example.com", UserRole.client)
    return {
        "a": _token("h4_a@example.com"),
        "client": _token("h4_client@example.com"),
    }


# ---------------------------------------------------------------------------
# The original crash
# ---------------------------------------------------------------------------

def test_h4_skill_filter_no_longer_500s(seeded):
    """GET /profiles/providers?skill=... returned 500 (AttributeError) before."""
    res = client.get("/profiles/providers", params={"skill": "welding"})
    assert res.status_code == 200, f"skill filter must not crash: {res.status_code} {res.text}"
    body = res.json()
    assert body["total"] >= 1
    assert all("welding" in str(p.get("skills", [])).lower() for p in body["data"])


def test_h4_skill_filter_case_insensitive_match(seeded):
    res = client.get("/profiles/providers", params={"skill": "UNDERWATER"})
    assert res.status_code == 200
    assert res.json()["total"] == 1, res.json()


def test_h4_skill_filter_no_match_returns_empty_not_error(seeded):
    res = client.get("/profiles/providers", params={"skill": "quantum-teleportation"})
    assert res.status_code == 200
    assert res.json()["total"] == 0 and res.json()["data"] == []


def test_h4_suppliers_skill_filter_no_longer_500s(seeded):
    res = client.get("/profiles/suppliers", params={"skill": "welding"})
    assert res.status_code == 200, f"supplier skill filter must not crash: {res.status_code} {res.text}"
    body = res.json()
    assert body["total"] >= 1
    assert all("welding" in str(p.get("skills", [])).lower() for p in body["data"])


def test_h4_providers_search_without_skill_still_works(seeded):
    res = client.get("/profiles/providers")
    assert res.status_code == 200
    assert res.json()["total"] == 3


# ---------------------------------------------------------------------------
# skills persist through the API (create/update path)
# ---------------------------------------------------------------------------

def test_h4_skills_round_trip_via_profile_update(seeded):
    """The frontend AddService flow sends `skills` in the profile update."""
    headers = {"Authorization": f"Bearer {seeded['a']}"}
    res = client.put("/profiles/me", headers=headers, json={"skills": ["Hull Cleaning", "NDT"]})
    assert res.status_code == 200, res.text
    assert set(res.json().get("skills", [])) == {"Hull Cleaning", "NDT"}

    # The filter immediately reflects the update
    res2 = client.get("/profiles/providers", params={"skill": "hull cleaning"})
    assert res2.status_code == 200
    assert res2.json()["total"] == 1


def test_h4_skills_rejected_payload_still_valid(seeded):
    """Empty skills list is accepted (frontend default)."""
    headers = {"Authorization": f"Bearer {seeded['a']}"}
    res = client.put("/profiles/me", headers=headers, json={"skills": []})
    assert res.status_code == 200
    assert res.json()["skills"] == []


# ---------------------------------------------------------------------------
# Migration b5a6c7d8e9f4
# ---------------------------------------------------------------------------

def _alembic_config(db_url):
    from alembic.config import Config
    from app.config import settings
    cfg = Config(str(__import__("pathlib").Path(__file__).resolve().parents[1] / "alembic.ini"))
    cfg.set_main_option("sqlalchemy.url", db_url)
    settings.DATABASE_URL = db_url
    return cfg


def test_h4_migration_adds_and_reverses_skills_column(tmp_path):
    from alembic import command
    from sqlalchemy import inspect, text as sql_text

    db_url = f"sqlite:///{tmp_path / 'h4_mig.db'}"
    cfg = _alembic_config(db_url)

    # Old head (the revision immediately before skills) -> head. The original
    # test pinned "e4f5a6b7c8d9", which is not part of this chain; the real
    # pre-skills head is b7c8d9e0f1a2 (skills lands in b5a6c7d8e9f4).
    OLD_HEAD = "b7c8d9e0f1a2"
    command.upgrade(cfg, OLD_HEAD)
    insp = inspect(__import__("sqlalchemy").create_engine(db_url))
    assert "skills" not in {c["name"] for c in insp.get_columns("profiles")}

    command.upgrade(cfg, "head")
    insp2 = inspect(__import__("sqlalchemy").create_engine(db_url))
    cols = {c["name"]: c for c in insp2.get_columns("profiles")}
    assert "skills" in cols and cols["skills"]["nullable"] is True

    # Existing rows keep working (skills is NULL) and the ORM accepts values
    # NOTE: SQLAlchemy's Uuid type stores as 32-char hex on SQLite — raw SQL
    # inserts must use .hex, not the dashed form, or ORM updates won't match.
    user_hex = uuid.UUID("11111111-1111-1111-1111-111111111111").hex
    profile_hex = uuid.UUID("22222222-2222-2222-2222-222222222222").hex
    engine2 = __import__("sqlalchemy").create_engine(db_url)
    with engine2.connect() as conn:
        conn.execute(sql_text(
            "INSERT INTO users (id, email, password_hash, role, is_verified, created_at) "
            "VALUES (:i, 'mig@example.com', 'x', 'provider', 0, '2026-01-01')"
        ), {"i": user_hex})
        conn.execute(sql_text(
            "INSERT INTO profiles (id, user_id, years_experience, availability_status, verification_status, "
            "rating_avg, jobs_completed, created_at, updated_at) VALUES "
            "(:p, :u, 3, 'available', 'pending', 0.0, 0, '2026-01-01', '2026-01-01')"
        ), {"p": profile_hex, "u": user_hex})
        conn.commit()

    from app.models.profile import Profile
    from sqlalchemy.orm import Session
    with Session(engine2) as s:
        p = s.query(Profile).filter(Profile.company_name.is_(None)).first()
        p.skills = ["post-migration skill"]
        s.commit()
        s.refresh(p)
        assert p.skills == ["post-migration skill"]

    # Downgrade removes the column again
    command.downgrade(cfg, OLD_HEAD)
    insp3 = inspect(engine2)
    assert "skills" not in {c["name"] for c in insp3.get_columns("profiles")}
