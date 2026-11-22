"""Scale probe — how much work does ONE request cost, and how fast can this
shrink-wrapped process handle account churn?

Not a test: a measurement tool for capacity planning. It runs against a
throwaway SQLite database (never your real one) and prints:

  * SQL statements executed per representative request
  * wall-clock per request, and per registration / login
  * the cost of the admin verification queue as the number of accounts grows
    (it loads every matching profile and then runs a per-profile query)

Usage (from nhaav-backend/, with the project venv):

    .venv/Scripts/python.exe scale_probe.py            # default sizes
    .venv/Scripts/python.exe scale_probe.py --accounts 1000
"""
import argparse
import os
import statistics
import tempfile
import time
import uuid

# Configure the environment BEFORE app.config is imported. Console email keeps
# registration from trying to talk to a real SMTP server.
_tmp_db = os.path.join(tempfile.gettempdir(), f"scale_probe_{uuid.uuid4().hex}.db")
os.environ["DATABASE_URL"] = f"sqlite:///{_tmp_db}"
os.environ["EMAIL_BACKEND"] = "console"
os.environ.setdefault("ENVIRONMENT", "development")
os.environ.setdefault("JWT_SECRET", "scale-probe-secret")

from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine, event  # noqa: E402
from sqlalchemy.orm import Session, sessionmaker  # noqa: E402

from app.database import Base, get_db  # noqa: E402
from app.main import app  # noqa: E402
from app.models.profile import Profile, VerificationStatus  # noqa: E402
from app.models.user import User, UserRole  # noqa: E402
from app.services.access_token_service import AccessTokenService  # noqa: E402
from app.services.rate_limit_service import RateLimitService  # noqa: E402
from app.utils.password import hash_password  # noqa: E402

engine = create_engine(f"sqlite:///{_tmp_db}", connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

STATEMENTS = {"count": 0, "commits": 0}


@event.listens_for(engine, "before_cursor_execute")
def _count_statement(*_args, **_kwargs):
    STATEMENTS["count"] += 1


@event.listens_for(Session, "after_commit")
def _count_commit(*_args, **_kwargs):
    STATEMENTS["commits"] += 1


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = override_get_db
Base.metadata.create_all(bind=engine)

client = TestClient(app)
PASSWORD = "Password123!"


def _timed(fn, repeats: int = 10):
    """Return (median ms, median statements, median commits) for `fn`."""
    times = []
    counts = []
    commits = []
    for _ in range(repeats):
        STATEMENTS["count"] = 0
        STATEMENTS["commits"] = 0
        started = time.perf_counter()
        result = fn()
        times.append((time.perf_counter() - started) * 1000)
        counts.append(STATEMENTS["count"])
        commits.append(STATEMENTS["commits"])
        assert result is not None
    return (
        round(statistics.median(times), 1),
        round(statistics.median(counts), 1),
        round(statistics.median(commits), 1),
    )


def _clear_rate_limit(category: str) -> None:
    """Reset this client's bucket so a throughput run is not a rate-limit test."""
    db = TestingSessionLocal()
    try:
        RateLimitService.reset_identity(db, "testclient", category)
    finally:
        db.close()


def _register(email: str):
    return client.post(
        "/auth/register",
        json={
            "email": email,
            "password": PASSWORD,
            "role": "client",
            "full_name": "Scale Probe",
            "company": "Probe Co",
        },
    )


def _login(email: str):
    return client.post("/auth/login", json={"email": email, "password": PASSWORD})


def _entitle(email: str, with_pack: bool):
    """Verify + subscribe (and optionally gate) one account, directly in the DB."""
    from datetime import datetime, timedelta

    from app.models.subscription import (
        BillingPeriod,
        Subscription,
        SubscriptionPlan,
        SubscriptionStatus,
    )

    db = TestingSessionLocal()
    try:
        user = db.query(User).filter(User.email == email).first()
        user.is_verified = True
        profile = db.query(Profile).filter(Profile.user_id == user.id).first()
        profile.verification_status = VerificationStatus.verified
        profile.badge_label = "VERIFIED"
        plan = db.query(SubscriptionPlan).filter(SubscriptionPlan.code == "MONTHLY").first()
        if plan is None:
            plan = SubscriptionPlan(
                code="MONTHLY",
                name="Nhaav Monthly",
                price_paise=100_000,
                currency="INR",
                duration_value=1,
                duration_unit=BillingPeriod.MONTH,
                pass_count=10,
            )
            db.add(plan)
            db.flush()
        now = datetime.utcnow()
        db.add(
            Subscription(
                owner_user_id=user.id,
                plan_id=plan.id,
                status=SubscriptionStatus.ACTIVE,
                starts_at=now,
                expires_at=now + timedelta(days=30),
            )
        )
        db.commit()
        if with_pack:
            AccessTokenService.provision_pack(db, user, token_count=50, source="scale_probe")
    finally:
        db.close()


def _seed_accounts(count: int, start: int = 0):
    """Bulk-insert accounts + profiles the way the product would accumulate them."""
    if count <= 0:
        return 0
    db = TestingSessionLocal()
    try:
        emails = [f"bulk{start + i}@example.com" for i in range(count)]
        db.add_all(
            [
                User(
                    email=email,
                    password_hash="x",
                    role=UserRole.provider,
                    full_name=f"Bulk Provider {start + i}",
                )
                for i, email in enumerate(emails)
            ]
        )
        db.commit()
        users = db.query(User).filter(User.email.in_(emails)).all()
        db.add_all(
            [
                Profile(
                    user_id=u.id,
                    company_name=f"Bulk Co {u.email[4:8]}",
                    position="Surveyor",
                    verification_status=VerificationStatus.pending,
                )
                for u in users
            ]
        )
        db.commit()
        return len(users)
    finally:
        db.close()


def main() -> int:
    parser = argparse.ArgumentParser(description="Measure Nhaav request cost.")
    parser.add_argument("--accounts", type=int, default=500, help="bulk accounts to seed")
    parser.add_argument("--registrations", type=int, default=100)
    parser.add_argument("--repeats", type=int, default=10)
    parser.add_argument(
        "--load-url",
        default="",
        help="Also load-test a RUNNING server (e.g. http://127.0.0.1:8000). "
        "Needs LOAD_EMAIL/LOAD_PASSWORD for an entitled account.",
    )
    parser.add_argument("--threads", type=int, default=16)
    parser.add_argument("--load-requests", type=int, default=200)
    args = parser.parse_args()

    print(f"probe db: {_tmp_db}")
    print(f"python  : single process, sync handlers (Starlette threadpool)\n")

    email = "probe_main@example.com"
    _register(email)
    token = _login(email).json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    print("-- request cost (latency / statements / commits) -------------")
    print(f"{'endpoint':<44}{'ms':>8}{'sql':>6}{'commit':>8}")

    def row(label: str, fn) -> None:
        ms, sql, commits = _timed(fn, args.repeats)
        print(f"{label:<44}{ms:>8}{sql:>6}{commits:>8}")

    row("GET /auth/me (identity only)", lambda: client.get("/auth/me", headers=headers))
    row(
        "GET /access/onboarding (gate state)",
        lambda: client.get("/access/onboarding", headers=headers),
    )

    # Entitled (verified + subscribed) but NOT gated: no access pass held.
    _entitle(email, with_pack=False)
    headers["Authorization"] = f"Bearer {_login(email).json()['access_token']}"
    row(
        "GET /marketplace/category-groups",
        lambda: client.get("/marketplace/category-groups", headers=headers),
    )
    row("GET /access/status", lambda: client.get("/access/status", headers=headers))

    # Gated: every authenticated request now also runs the pass enforcement.
    _entitle(email, with_pack=True)
    login = _login(email)
    headers["Authorization"] = f"Bearer {login.json()['access_token']}"
    assert login.json()["access_session"] is not None
    row(
        "GET /auth/me (GATED, pass enforced)",
        lambda: client.get("/auth/me", headers=headers),
    )
    row(
        "GET /marketplace/category-groups (GATED)",
        lambda: client.get("/marketplace/category-groups", headers=headers),
    )

    print("\n-- cost of the two heaviest writes (hashing is ~200 ms of it) --")
    ms, sql, commits = _timed(lambda: _register(f"churncost{uuid.uuid4().hex[:8]}@example.com"), 3)
    print(f"{'POST /auth/register':<44}{ms:>8}{sql:>6}{commits:>8}")
    _clear_rate_limit("auth_login")
    ms, sql, commits = _timed(lambda: _login(email), 3)
    print(f"{'POST /auth/login':<44}{ms:>8}{sql:>6}{commits:>8}")

    print("\n-- account churn ---------------------------------------------")
    # The per-IP register budget (25 / 15 min) is a PRODUCT limit, not a
    # throughput measurement, so clear it between calls and report the raw cost.
    started = time.perf_counter()
    for i in range(args.registrations):
        _clear_rate_limit("register")
        resp = _register(f"churn{i}@example.com")
        assert resp.status_code == 201, resp.text
    elapsed = time.perf_counter() - started
    print(
        f"register: {args.registrations} accounts in {elapsed:.1f}s "
        f"({elapsed / args.registrations * 1000:.0f} ms each, "
        f"{args.registrations / elapsed:.1f}/s)"
    )

    started = time.perf_counter()
    for _ in range(args.registrations):
        _clear_rate_limit("auth_login")
        _login(email)
    elapsed = time.perf_counter() - started
    print(
        f"login   : {args.registrations} logins in {elapsed:.1f}s "
        f"({elapsed / args.registrations * 1000:.0f} ms each, "
        f"{args.registrations / elapsed:.1f}/s)"
    )

    print(f"\n-- admin review queue on a growing table ({args.accounts} extra accounts) --")
    db = TestingSessionLocal()
    try:
        db.add(
            User(
                email="probe_admin@nhaavmaritime.com",
                password_hash=hash_password("Admin@123"),
                role=UserRole.admin,
                full_name="Probe Admin",
                is_verified=True,
            )
        )
        db.commit()
    finally:
        db.close()
    admin_token = client.post(
        "/admin/auth/login",
        json={"email": "probe_admin@nhaavmaritime.com", "password": "Admin@123"},
    ).json()["access_token"]
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    for total in (10, args.accounts):
        # Top the table up to `total` bulk accounts.
        existing = 0
        db = TestingSessionLocal()
        try:
            existing = db.query(User).filter(User.email.like("bulk%@example.com")).count()
        finally:
            db.close()
        if existing < total:
            _seed_accounts(total - existing, start=existing)

        single, count, _c = _timed(
            lambda: client.get(
                "/admin/verification/providers?limit=20", headers=admin_headers
            ),
            3,
        )
        stats_ms, stats_sql, _c = _timed(
            lambda: client.get("/admin/verification/stats", headers=admin_headers), 3
        )
        search_ms, search_sql, _c = _timed(
            lambda: client.get("/profiles/providers?limit=20", headers=headers), 3
        )
        print(
            f"queue list  ({total + 3:>5} accounts, page of 20): {single:>7} ms {count:>5} sql"
        )
        print(
            f"queue stats ({total + 3:>5} accounts)             : {stats_ms:>7} ms {stats_sql:>5} sql"
        )
        print(
            f"public search ({total + 3:>5} accounts, page of 20): {search_ms:>7} ms {search_sql:>5} sql"
        )

    if args.load_url:
        _live_load_test(
            args.load_url.rstrip("/"), args.threads, args.load_requests
        )

    print("\nInterpretation: 'sql' is statements per request; anything in the tens")
    print("per page means the work grows with the table, not with the page size.")
    print("The live load test measures the WHOLE stack under concurrency, which is")
    print("where the single-process + per-request-write design shows its ceiling.")
    return 0


def _live_load_test(base_url: str, threads: int, requests_: int) -> None:
    """Concurrent authenticated GETs against a running server.

    Uses a real (entitled) account so the request path includes the access-pass
    enforcement, which is what a subscribed user's traffic actually costs.
    """
    import concurrent.futures as futures

    import httpx

    email = os.getenv("LOAD_EMAIL", "")
    password = os.getenv("LOAD_PASSWORD", "")
    print(f"\n-- live load test against {base_url} ({threads} threads) --------------")
    if not email or not password:
        print("skipped: set LOAD_EMAIL / LOAD_PASSWORD to load-test a live server")
        return

    device_id = f"loadtest-{uuid.uuid4().hex[:8]}"
    with httpx.Client(base_url=base_url, timeout=30) as http:
        login = http.post(
            "/auth/login",
            json={
                "email": email,
                "password": password,
                "device_id": device_id,
                "device_label": "load test",
                "force_device_switch": True,
            },
        )
        if login.status_code != 200:
            print(f"skipped: login failed ({login.status_code}) {login.text[:200]}")
            return
        token = login.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}", "X-Device-Id": device_id}

        def one(_i: int):
            started = time.perf_counter()
            resp = http.get("/marketplace/category-groups", headers=headers)
            return (time.perf_counter() - started) * 1000, resp.status_code

        started = time.perf_counter()
        with futures.ThreadPoolExecutor(max_workers=threads) as pool:
            results = list(pool.map(one, range(requests_)))
        elapsed = time.perf_counter() - started

        latencies = sorted(ms for ms, _status in results)
        errors = sum(1 for _ms, status in results if status != 200)
        p50 = latencies[len(latencies) // 2]
        p95 = latencies[int(len(latencies) * 0.95) - 1]
        print(
            f"GET /marketplace/category-groups: {requests_} requests, "
            f"{requests_ / elapsed:.1f} req/s, p50 {p50:.0f} ms, p95 {p95:.0f} ms, "
            f"{errors} non-200"
        )


if __name__ == "__main__":
    raise SystemExit(main())
