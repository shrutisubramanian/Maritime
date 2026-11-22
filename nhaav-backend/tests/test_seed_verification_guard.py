"""
Seed-script production guard regression tests — seed_verification.py.

seed_verification.py creates five demo provider accounts with a publicly-known
password ("Demo@123") and artificial verification documents. These tests pin
the guard (added alongside the deployment security gate, see
DEPLOY_SECURITY_GATE.md Finding A) that makes production execution impossible
by default, mirroring the guard already present in seed_demo.py and
seed_demo_e2e.py.

    ENVIRONMENT=production → import refused → no demo accounts created.

Development behavior must remain unchanged: the module imports and the seed
function still runs and creates its accounts when pointed at a scratch DB.
"""
import os
import sqlite3
import subprocess
import sys
from pathlib import Path

import pytest

BACKEND_DIR = Path(__file__).resolve().parents[1]
SCRATCH_DB = "test_seed_verification_guard.db"
SCRATCH_DB_PATH = BACKEND_DIR / SCRATCH_DB
# A provider only this script creates — its presence/absence in the scratch
# DB is the observable "demo accounts created or not" signal.
CANARY_EMAIL = "nordic.marine@nhaavmaritime.com"


def _run_with_env(env_overrides, code):
    """Run a snippet with the given env overrides against the scratch DB."""
    for p in (SCRATCH_DB_PATH,):
        if p.exists():
            p.unlink()
    env = os.environ.copy()  # inherit a working runtime env (PATH etc.)
    env["DATABASE_URL"] = f"sqlite:///./{SCRATCH_DB}"
    env.setdefault("JWT_SECRET", "test-secret-for-seed-guard")
    env.update(env_overrides)
    return subprocess.run(
        [sys.executable, "-c", code],
        cwd=str(BACKEND_DIR),
        env=env,
        capture_output=True,
        text=True,
        timeout=120,
    )


def _canary_exists() -> bool:
    if not SCRATCH_DB_PATH.exists():
        return False
    conn = sqlite3.connect(str(SCRATCH_DB_PATH))
    try:
        row = conn.execute(
            "SELECT 1 FROM users WHERE email = ?", (CANARY_EMAIL,)
        ).fetchone()
    finally:
        conn.close()
    return row is not None


# Full, valid production config: the ONLY thing under test here is the
# seed-verification guard, so every other production fail-fast must pass
# first (mirrors PRODUCTION_ENV in test_seed_demo_guard.py).
PRODUCTION_ENV = {
    "ENVIRONMENT": "production",
    "STORAGE_BACKEND": "s3",
    "S3_BUCKET": "b",
    "S3_ACCESS_KEY_ID": "k",
    "S3_SECRET_ACCESS_KEY": "s",
    "GEMINI_API_KEY": "g",
    "CORS_ORIGINS": "https://app.example.com",
    "EMAIL_BACKEND": "smtp",
    "EMAIL_HOST": "smtp.test.local",
    "EMAIL_FROM": "no-reply@test.local",
}


@pytest.mark.skipif(not (BACKEND_DIR / ".venv").exists(), reason="venv not found")
class TestSeedVerificationProductionGuard:
    """The guard raises at import time when ENVIRONMENT=production."""

    def test_production_import_refused(self):
        result = _run_with_env(
            dict(PRODUCTION_ENV), "import app.seed_verification"
        )
        assert result.returncode != 0
        assert "Refusing to seed verification data" in (result.stderr or "")
        assert "ENVIRONMENT=production" in (result.stderr or "")

    def test_production_refusal_creates_no_demo_accounts(self):
        # The core deployment-gate requirement: a refused run must leave the
        # database untouched — no schema creation, no canary provider.
        result = _run_with_env(
            dict(PRODUCTION_ENV), "import app.seed_verification"
        )
        assert result.returncode != 0
        assert not _canary_exists()

    def test_development_import_allowed(self):
        result = _run_with_env(
            {"ENVIRONMENT": "development"}, "import app.seed_verification"
        )
        assert result.returncode == 0, result.stderr

    def test_development_seeding_behavior_unchanged(self):
        # Dev contract: the seed function still runs end-to-end and creates
        # its five demo providers (spot-checked via the canary account).
        result = _run_with_env(
            {"ENVIRONMENT": "development"},
            "from app.seed_verification import seed_verification_data; "
            "seed_verification_data()",
        )
        assert result.returncode == 0, result.stderr
        assert _canary_exists()

    def test_explicit_override_is_respected(self):
        # The documented escape hatch: explicit, deliberate, and rare.
        result = _run_with_env(
            {**PRODUCTION_ENV, "SEED_DEMO_ALLOW_PRODUCTION": "1"},
            "import app.seed_verification",
        )
        assert result.returncode == 0, result.stderr

    def test_module_exports_seed_function(self, monkeypatch):
        # Dev usage contract: the function is still importable/callable.
        monkeypatch.setenv("ENVIRONMENT", "development")
        import app.seed_verification as sv

        assert callable(sv.seed_verification_data)
