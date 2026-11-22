"""Live concurrency probe — how does the WHOLE stack behave under load?

`scale_probe.py` measures one request in-process. This script starts the real
server (uvicorn, one process, the same command you would deploy) against a
THROWAWAY copy of the database and hammers it, so the numbers include the HTTP
stack, the threadpool and the SQLite/Postgres write path.

    .venv/Scripts/python.exe scale_live.py                 # default run
    .venv/Scripts/python.exe scale_live.py --registers 40

It never touches the real database: the copy is `loadtest_<hex>.db` and it is
deleted on exit. Nothing is left listening on a port.
"""
import argparse
import concurrent.futures as futures
import os
import statistics
import subprocess
import sys
import time
import uuid

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

DB_PATH = os.path.join(HERE, f"loadtest_{uuid.uuid4().hex[:8]}.db")
DB_URL = f"sqlite:///./{os.path.basename(DB_PATH)}"

# Rate limits are a PRODUCT decision, not a capacity measurement: raise them for
# the run so the numbers show the server's ceiling, not the per-IP budget.
CHILD_ENV = {
    **os.environ,
    "DATABASE_URL": DB_URL,
    "ENVIRONMENT": "development",
    "EMAIL_BACKEND": "console",
    "REGISTER_LIMIT": "100000",
    "AUTH_LOGIN_LIMIT": "100000",
    "PUBLIC_SEARCH_LIMIT": "100000",
    "VENDOR_SEARCH_LIMIT": "100000",
    "PAYMENT_SUBMIT_LIMIT": "100000",
    "SUPPORT_TICKET_LIMIT": "100000",
    "VERIFICATION_RESEND_LIMIT": "100000",
    "PASSWORD_RESET_LIMIT": "100000",
    "JWT_SECRET": "scale-live-secret",
}

LOAD_EMAIL = "loadtest@example.com"
LOAD_PASSWORD = "Password123!"

# Captured so a failed concurrent write shows its reason instead of a bare count.
WRITE_ERRORS: list = []


def _percentile(values, pct):
    if not values:
        return 0.0
    return values[min(len(values) - 1, int(len(values) * pct))]


def seed(db_path: str, accounts: int) -> None:
    """Build a fresh database and one entitled account, using the app's models."""
    os.environ.update({k: v for k, v in CHILD_ENV.items()})
    os.environ["DATABASE_URL"] = f"sqlite:///{db_path}"
    from datetime import datetime, timedelta

    from app.database import Base, SessionLocal, engine
    from app.models.profile import Profile, VerificationStatus
    from app.models.subscription import (
        BillingPeriod,
        Subscription,
        SubscriptionPlan,
        SubscriptionStatus,
    )
    from app.models.user import User, UserRole
    from app.utils.password import hash_password

    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        user = User(
            email=LOAD_EMAIL,
            password_hash=hash_password(LOAD_PASSWORD),
            role=UserRole.provider,
            full_name="Load Test",
            is_verified=True,
        )
        db.add(user)
        db.flush()
        db.add(
            Profile(
                user_id=user.id,
                company_name="Load Test Co",
                position="Surveyor",
                verification_status=VerificationStatus.verified,
            )
        )
        plan = SubscriptionPlan(
            code="MONTHLY",
            name="Nhaav Monthly",
            price_paise=100_000,
            currency="INR",
            duration_value=1,
            duration_unit=BillingPeriod.MONTH,
            pass_count=50,
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
        # A realistic table: the marketplace query joins profiles to users.
        others = [
            User(
                email=f"filler{i}@example.com",
                password_hash="x",
                role=UserRole.provider,
                full_name=f"Filler {i}",
            )
            for i in range(accounts)
        ]
        db.add_all(others)
        db.flush()
        db.add_all(
            [
                Profile(
                    user_id=u.id,
                    company_name=f"Filler Co {i}",
                    position="Surveyor",
                    verification_status=VerificationStatus.pending,
                )
                for i, u in enumerate(others)
            ]
        )
        db.commit()
    finally:
        db.close()
        # Release the file handle, or this process keeps the temp DB locked on
        # Windows and the cleanup below cannot delete it.
        engine.dispose()


def wait_for(url: str, timeout: float = 45.0) -> bool:
    import httpx

    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            resp = httpx.get(f"{url}/health", timeout=2)
            if resp.status_code == 200:
                return True
        except Exception:  # noqa: BLE001 - still starting
            pass
        time.sleep(0.4)
    return False


def _run_get(http, headers, url, n, threads):
    def one(_i):
        started = time.perf_counter()
        try:
            resp = http.get(url, headers=headers)
            status = resp.status_code
        except Exception:  # noqa: BLE001
            status = 0
        return (time.perf_counter() - started) * 1000, status

    started = time.perf_counter()
    with futures.ThreadPoolExecutor(max_workers=threads) as pool:
        results = list(pool.map(one, range(n)))
    elapsed = time.perf_counter() - started
    latencies = sorted(ms for ms, _s in results)
    errors = sum(1 for _ms, s in results if s != 200)
    return {
        "rps": n / elapsed,
        "p50": statistics.median(latencies),
        "p95": _percentile(latencies, 0.95),
        "errors": errors,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Live concurrency probe.")
    parser.add_argument("--port", type=int, default=8123)
    parser.add_argument("--accounts", type=int, default=500, help="filler profiles")
    parser.add_argument("--requests", type=int, default=300)
    parser.add_argument("--registers", type=int, default=30)
    args = parser.parse_args()

    print(f"temp db  : {os.path.basename(DB_PATH)} (deleted on exit)")
    seed(DB_PATH, args.accounts)

    log_path = os.path.join(HERE, f"loadtest_{args.port}.log")
    log = open(log_path, "w", encoding="utf-8")
    server = subprocess.Popen(
        [
            sys.executable,
            "-m",
            "uvicorn",
            "app.main:app",
            "--host",
            "127.0.0.1",
            "--port",
            str(args.port),
            "--log-level",
            "warning",
        ],
        cwd=HERE,
        env=CHILD_ENV,
        stdout=log,
        stderr=subprocess.STDOUT,
    )
    base = f"http://127.0.0.1:{args.port}"
    try:
        if not wait_for(base):
            log.flush()
            print("server did not become ready; see the loadtest log")
            return 1

        import httpx

        with httpx.Client(base_url=base, timeout=60) as http:
            login = http.post(
                "/auth/login",
                json={
                    "email": LOAD_EMAIL,
                    "password": LOAD_PASSWORD,
                    "device_id": "loadtest-device",
                    "device_label": "load test",
                    "force_device_switch": True,
                },
            )
            if login.status_code != 200:
                print(f"login failed: {login.status_code} {login.text[:200]}")
                return 1
            token = login.json()["access_token"]
            headers = {
                "Authorization": f"Bearer {token}",
                "X-Device-Id": "loadtest-device",
            }

            print(f"\nserver   : 1 uvicorn process, {args.accounts} profiles in the table")
            print(
                f"\n{'endpoint':<40}{'threads':>8}{'req/s':>9}{'p50 ms':>9}"
                f"{'p95 ms':>9}{'errors':>8}"
            )
            for url in ("/auth/me", "/marketplace/category-groups"):
                for threads in (1, 4, 16, 32):
                    r = _run_get(http, headers, url, args.requests, threads)
                    print(
                        f"{url:<40}{threads:>8}{r['rps']:>9.1f}{r['p50']:>9.0f}"
                        f"{r['p95']:>9.0f}{r['errors']:>8}"
                    )

            # Writes are the real ceiling: registration hashes a password.
            def register(i):
                started = time.perf_counter()
                try:
                    resp = http.post(
                        "/auth/register",
                        json={
                            # Unique per call: a shared timestamp made every
                            # thread collide on "Email already registered".
                            "email": f"loadreg{uuid.uuid4().hex[:12]}@example.com",
                            "password": LOAD_PASSWORD,
                            "role": "client",
                            "full_name": f"Load Reg {i}",
                            "company": "Load Co",
                        },
                    )
                    status = resp.status_code
                    detail = "" if status in (200, 201) else resp.text[:160]
                except Exception as exc:  # noqa: BLE001
                    status = 0
                    detail = str(exc)[:160]
                if detail and len(WRITE_ERRORS) < 4:
                    WRITE_ERRORS.append((status, detail))
                return (time.perf_counter() - started) * 1000, status

            for threads in (1, 8, 16):
                started = time.perf_counter()
                with futures.ThreadPoolExecutor(max_workers=threads) as pool:
                    results = list(pool.map(register, range(args.registers)))
                elapsed = time.perf_counter() - started
                lat = sorted(ms for ms, _s in results)
                errors = sum(1 for _ms, s in results if s not in (200, 201))
                print(
                    f"{'POST /auth/register':<40}{threads:>8}"
                    f"{args.registers / elapsed:>9.1f}"
                    f"{statistics.median(lat):>9.0f}"
                    f"{_percentile(lat, 0.95):>9.0f}{errors:>8}"
                )
        for status, detail in WRITE_ERRORS:
            print(f"  write error {status}: {detail}")
    finally:
        server.terminate()
        try:
            server.wait(timeout=15)
        except subprocess.TimeoutExpired:
            server.kill()
        log.close()
        # Windows keeps the handle briefly after exit, so retry before giving up.
        for path in (DB_PATH, f"{DB_PATH}-wal", f"{DB_PATH}-shm", log_path):
            for _attempt in range(10):
                if not os.path.exists(path):
                    break
                try:
                    os.remove(path)
                    break
                except OSError:
                    time.sleep(0.5)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
