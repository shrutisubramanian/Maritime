"""
H9 §D — no demo credentials in the production UI.

The login page shipped a "Demo Accounts" panel with click-to-fill credentials
(provider.demo@nhaavmaritime.com / client.demo@nhaavmaritime.com, password
Demo@123). Those accounts are created by app/seed_demo.py — a dev/demo seeding
script with publicly-known passwords — so the panel advertised working
credentials to anyone opening the production login page.

Removed in H9 Phase 4 (presentation-only UI; nothing depended on it).

These tests pin the removal. They deliberately cover ONLY the frontend: the
backend seed scripts (seed_demo.py, seed_verification.py) still contain
Demo@123 and are a SEPARATE H9 item (production-seeding investigation) —
this test would give false confidence if it tried to ban them repo-wide.
"""
import os
from pathlib import Path

FRONTEND_SRC = Path(__file__).resolve().parents[2] / "nhaav-frontend" / "src"

BANNED_CREDENTIALS = (
    "Demo@123",                                # the shared demo password
    "provider.demo@nhaavmaritime.com",       # seeded provider account
    "client.demo@nhaavmaritime.com",         # seeded client account
)
BANNED_UI_STRINGS = ("Demo Accounts",)


def _frontend_source_files():
    for root, dirs, files in os.walk(FRONTEND_SRC):
        dirs[:] = [d for d in dirs if d not in ("node_modules", "dist", "__pycache__")]
        for name in files:
            if name.endswith((".ts", ".tsx", ".js", ".jsx", ".html", ".css")):
                yield Path(root) / name


def test_login_form_has_no_demo_accounts_panel():
    src = (FRONTEND_SRC / "components" / "LoginForm.tsx").read_text(encoding="utf-8")
    for banned in BANNED_CREDENTIALS + BANNED_UI_STRINGS:
        assert banned not in src, (
            f"LoginForm.tsx must not ship '{banned}' — demo credentials in the "
            "production UI advertise working accounts to every visitor"
        )


def test_no_demo_credentials_anywhere_in_frontend_source():
    """Repo-wide frontend guard: the panel must not simply migrate elsewhere."""
    offenders = []
    for path in _frontend_source_files():
        content = path.read_text(encoding="utf-8", errors="replace")
        for banned in BANNED_CREDENTIALS:
            if banned in content:
                offenders.append(f"{path.name}: {banned}")
    assert not offenders, f"Demo credentials found in frontend source: {offenders}"


def test_frontend_source_exists_for_this_guard():
    """Guard against silently vacuous tests if the path ever moves."""
    assert FRONTEND_SRC.is_dir(), f"frontend src not found at {FRONTEND_SRC}"
    assert any(_frontend_source_files()), "no frontend source files found"
