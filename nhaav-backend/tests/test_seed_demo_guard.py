"""
Seed-script production guard regression tests.

seed_demo.py creates demo accounts with a publicly-known password
("Demo@123") and fake verified profiles with artificial ratings. These tests
pin the guard that makes production execution impossible by default.
"""
import importlib
import subprocess
import sys
from pathlib import Path

import pytest

BACKEND_DIR = Path(__file__).resolve().parents[1]
SEED_DEMO = BACKEND_DIR / "app" / "seed_demo.py"


def _run_with_env(env_overrides, venv_python):
    """Run `python -c "import app.seed_demo"` with the given env overrides."""
    import os

    env = os.environ.copy()  # inherit a working runtime env (PATH etc.)
    env.setdefault("DATABASE_URL", "sqlite:///./test_seed_guard.db")
    env.setdefault("JWT_SECRET", "test-secret-for-seed-guard")
    env.update(env_overrides)
    return subprocess.run(
        [venv_python, "-c", "import app.seed_demo"],
        cwd=str(BACKEND_DIR),
        env=env,
        capture_output=True,
        text=True,
        timeout=60,
    )


# Full, valid production config: the ONLY thing under test here is the
# seed-demo guard, so every other production fail-fast must pass first.
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
    "EMAIL_HOST_USER": "no-reply@test.local",
    "EMAIL_HOST_PASSWORD": "test-smtp-password",
    "EMAIL_FROM": "no-reply@test.local",
}


@pytest.mark.skipif(not (BACKEND_DIR / ".venv").exists(), reason="venv not found")
class TestSeedDemoProductionGuard:
    """The guard raises at import time when ENVIRONMENT=production."""

    def test_production_import_refused(self):
        result = _run_with_env(dict(PRODUCTION_ENV), sys.executable)
        assert result.returncode != 0
        assert "Refusing to seed demo data" in (result.stderr or "")
        assert "ENVIRONMENT=production" in (result.stderr or "")

    def test_production_import_refused_even_with_existing_db(self):
        # Simulate a fully-configured production environment (S3 etc.):
        # the demo-seed guard must still fire.
        result = _run_with_env(dict(PRODUCTION_ENV), sys.executable)
        assert result.returncode != 0
        assert "Refusing to seed demo data" in (result.stderr or "")

    def test_development_import_allowed(self):
        result = _run_with_env({"ENVIRONMENT": "development"}, sys.executable)
        assert result.returncode == 0, result.stderr

    def test_explicit_override_is_respected(self):
        # The documented escape hatch: explicit, deliberate, and rare.
        result = _run_with_env(
            {**PRODUCTION_ENV, "SEED_DEMO_ALLOW_PRODUCTION": "1"},
            sys.executable,
        )
        assert result.returncode == 0, result.stderr

    def test_module_exports_seed_demo_function(self, monkeypatch):
        # Dev usage contract: the function is still importable/callable.
        monkeypatch.setenv("ENVIRONMENT", "development")
        import app.seed_demo as sd

        assert callable(sd.seed_demo)
