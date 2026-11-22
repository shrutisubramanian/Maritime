"""
F-1 regression: UTR uniqueness is enforced at the DATABASE level.

SECURITY_SIGNOFF_REPORT.md finding F-1: the service-level duplicate check has
a check-then-insert race — two concurrent submissions with the same reference
could both commit into PENDING. The unique partial index `ux_payments_live_utr`
(migration a0b1c2d3e4f5) closes it, and the service converts the resulting
IntegrityError into the SAME safe 409 the sequential check returns.

Business rules preserved (asserted below):
- sequential duplicate UTR -> 409 (unchanged shape)
- a REJECTED payment's reference may be re-submitted (correction flow)
- different UTRs submit independently
- exactly one payment survives a concurrent same-UTR race
"""
import io
import threading
import uuid

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.config import settings
from app.database import Base, get_db
from app.main import app
from app.models.payment import Payment, PaymentStatus
from app.models.user import User, UserRole
from app.services.payment_service import PaymentService
from app.services.subscription_service import SubscriptionService
from app.utils.password import hash_password

SQLALCHEMY_DATABASE_URL = "sqlite:///./test_f1_utr_race.db"
engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False, "timeout": 30},
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

PASSWORD = "Password123!"
OWNER_EMAIL = "f1_owner@nhaav.com"
ADMIN_EMAIL = "f1_admin@nhaav.com"


class _FakeUpload:
    """Minimal stand-in for the starlette UploadFile the service reads."""

    def __init__(self, filename="receipt.pdf", content_type="application/pdf"):
        self.filename = filename
        self.content_type = content_type
        self.file = io.BytesIO(b"%PDF-1.4 fake receipt")


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture(scope="module", autouse=True)
def setup_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)  # includes ux_payments_live_utr
    app.dependency_overrides[get_db] = override_get_db
    db = TestingSessionLocal()
    try:
        db.add_all([
            User(email=OWNER_EMAIL, password_hash=hash_password(PASSWORD),
                 role=UserRole.client, is_verified=True),
            User(email=ADMIN_EMAIL, password_hash=hash_password(PASSWORD),
                 role=UserRole.admin, is_verified=True),
        ])
        db.commit()
        # Pre-seed the plan catalogue (as production startup does): two
        # concurrent create_subscription calls would otherwise race on the
        # plan seed itself — unrelated to F-1, which tests payment inserts.
        from app.services.subscription_service import SubscriptionService
        SubscriptionService.seed_plans(db)
        db.commit()
    finally:
        db.close()
    yield
    app.dependency_overrides.pop(get_db, None)


def _owner() -> User:
    db = TestingSessionLocal()
    try:
        return db.query(User).filter(User.email == OWNER_EMAIL).first()
    finally:
        db.close()


def _admin() -> User:
    db = TestingSessionLocal()
    try:
        return db.query(User).filter(User.email == ADMIN_EMAIL).first()
    finally:
        db.close()


def _submit(utr: str):
    """One submission attempt on its OWN session. Returns (payment, None) or
    (None, HTTPException). The owner is fetched INSIDE that session so the
    service's lazy relationship loads stay bound."""
    db = TestingSessionLocal()
    try:
        user = db.query(User).filter(User.email == OWNER_EMAIL).first()
        payment = PaymentService.submit_payment(
            db, user,
            plan_code="MONTHLY",
            utr=utr,
            payment_date=__import__("datetime").datetime(2026, 10, 8, 12, 0, 0),
            file=_FakeUpload(),
        )
        return payment, None
    except HTTPException as exc:
        db.rollback()
        return None, exc
    finally:
        db.close()


def _live_count(utr: str) -> int:
    # The service normalizes references (strip + upper); match that here.
    normalized = (utr or "").strip().upper()
    db = TestingSessionLocal()
    try:
        return db.query(Payment).filter(
            Payment.utr == normalized,
            Payment.status.in_(["PENDING", "SUBMITTED", "VERIFIED"]),
        ).count()
    finally:
        db.close()


class TestF1UtrDatabaseUniqueness:
    def test_concurrent_same_utr_exactly_one_wins(self):
        """Two simultaneous same-UTR submissions: exactly one payment exists
        afterwards and the loser receives the safe 409 (never a 500)."""
        utr = f"F1RACE-{uuid.uuid4().hex[:10]}"
        barrier = threading.Barrier(2)
        results = {}

        def attempt(tag):
            barrier.wait()  # maximize interleaving
            results[tag] = _submit(utr)

        threads = [threading.Thread(target=attempt, args=(t,)) for t in ("a", "b")]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        payments = [p for p, e in results.values() if p is not None]
        rejects = [e for p, e in results.values() if e is not None]

        assert len(results) == 2
        assert len(payments) == 1, f"expected one winner, got {len(payments)}"
        assert len(rejects) == 1, f"expected one loser, got {len(rejects)}"
        assert rejects[0].status_code == 409
        assert "already been submitted" in rejects[0].detail
        assert _live_count(utr) == 1

    def test_sequential_duplicate_still_409(self):
        """Existing behavior preserved: the second sequential submission of a
        live UTR gets the unchanged 409 from the service-level check."""
        utr = f"F1SEQ-{uuid.uuid4().hex[:10]}"
        first, err1 = _submit(utr)
        assert first is not None and err1 is None
        second, err2 = _submit(utr)
        assert second is None
        assert err2 is not None and err2.status_code == 409
        assert _live_count(utr) == 1

    def test_rejected_utr_can_be_resubmitted(self):
        """A REJECTED payment leaves the index scope: its reference may be
        corrected and re-submitted (existing correction flow)."""
        utr = f"F1REJ-{uuid.uuid4().hex[:10]}"
        payment, err = _submit(utr)
        assert payment is not None and err is None

        db = TestingSessionLocal()
        try:
            admin = db.query(User).filter(User.email == ADMIN_EMAIL).first()
            PaymentService.reject_payment(db, admin, payment.id, "Unclear receipt")
            db.commit()
        finally:
            db.close()

        resubmitted, err2 = _submit(utr)
        assert resubmitted is not None, f"resubmission should succeed: {err2}"
        assert err2 is None

    def test_different_utrs_both_accepted(self):
        """Legitimate distinct references never interfere."""
        a, err_a = _submit(f"F1DIFF-A-{uuid.uuid4().hex[:8]}")
        b, err_b = _submit(f"F1DIFF-B-{uuid.uuid4().hex[:8]}")
        assert a is not None and err_a is None
        assert b is not None and err_b is None
        assert a.utr != b.utr

    def test_cancelled_utr_can_be_resubmitted(self):
        """A CANCELLED payment also leaves the index scope."""
        utr = f"F1CXL-{uuid.uuid4().hex[:10]}"
        payment, err = _submit(utr)
        assert payment is not None
        db = TestingSessionLocal()
        try:
            row = db.query(Payment).filter(Payment.utr == utr.upper()).first()
            row.status = PaymentStatus.CANCELLED
            db.commit()
        finally:
            db.close()
        again, err2 = _submit(utr)
        assert again is not None and err2 is None

    def test_index_exists_in_metadata(self):
        """The unique partial index is part of the model metadata (so every
        create_all-built test database carries it)."""
        indexes = Payment.__table__.indexes
        names = {ix.name for ix in indexes}
        assert "ux_payments_live_utr" in names
        ix = next(ix for ix in indexes if ix.name == "ux_payments_live_utr")
        assert ix.unique
