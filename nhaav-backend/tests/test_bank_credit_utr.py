"""
Regression: one bank reference funds exactly ONE Nhaav purchase.

Before the shared `BankCredit`, each surface had its own partial unique index on
`utr`, so one transfer could be claimed simultaneously as a pass payment, a
listing fee and a company-visibility payment, and all three could then be
verified by different admin queues. The credit is the single record of "this
reference has been claimed" and every submission reserves it in the same
transaction as its own row.

Covered here:
- the second surface to claim a reference is refused (both orderings), with the
  409 naming the surface that already holds it
- the refusal happens before any receipt file is stored
- rejecting a claim releases the reference, so a corrected reference can be
  re-submitted (the per-table rule, preserved)
- distinct references remain independent
- the partial unique index that protects against a cross-table race is present
"""
import io
import os
import tempfile
import uuid
from datetime import datetime

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.config import settings
from app.database import Base
from app.models.bank_credit import BankCredit, BankCreditClaimType
from app.models.listing_fee import ListingFee, ListingType
from app.models.payment import Payment
from app.models.profile import Profile
from app.models.profile_visibility import ProfileVisibility
from app.models.service import Service
from app.models.user import User, UserRole
from app.services.listing_fee_service import ListingFeeService
from app.services.payment_service import PaymentService
from app.services.profile_visibility_service import ProfileVisibilityService
from app.services.subscription_service import SubscriptionService
from app.utils.password import hash_password

DB_URL = "sqlite:///./test_bank_credit_utr.db"
engine = create_engine(DB_URL, connect_args={"check_same_thread": False, "timeout": 30})
Session = sessionmaker(autocommit=False, autoflush=False, bind=engine)

CLIENT_EMAIL = "credit.client@nhaav.com"
PROVIDER_EMAIL = "credit.provider@nhaav.com"
ADMIN_EMAIL = "credit.admin@nhaav.com"
PASSWORD = "Password123!"


class _FakeUpload:
    def __init__(self, filename="receipt.pdf"):
        self.filename = filename
        self.content_type = "application/pdf"
        self.file = io.BytesIO(b"%PDF-1.4 fake receipt")


@pytest.fixture(scope="module", autouse=True)
def setup_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)  # includes ux_bank_credits_live_utr

    original_dir = settings.PAYMENT_RECEIPTS_DIR
    receipts_dir = tempfile.mkdtemp(prefix="bank-credit-receipts-")
    settings.PAYMENT_RECEIPTS_DIR = receipts_dir

    db = Session()
    try:
        client = User(email=CLIENT_EMAIL, password_hash=hash_password(PASSWORD),
                      role=UserRole.client, is_verified=True)
        provider = User(email=PROVIDER_EMAIL, password_hash=hash_password(PASSWORD),
                        role=UserRole.provider, is_verified=True)
        admin = User(email=ADMIN_EMAIL, password_hash=hash_password(PASSWORD),
                     role=UserRole.admin, is_verified=True)
        db.add_all([client, provider, admin])
        db.commit()
        db.add_all([
            Profile(user_id=client.id, company_name="Credit Client Co"),
            Profile(user_id=provider.id, company_name="Credit Provider Co"),
        ])
        db.add(Service(provider_id=provider.id, name="Credit Listing",
                       category="Repairs", is_active=True))
        db.commit()
        SubscriptionService.seed_plans(db)
        db.commit()
    finally:
        db.close()

    yield

    settings.PAYMENT_RECEIPTS_DIR = original_dir
    import shutil
    shutil.rmtree(receipts_dir, ignore_errors=True)
    engine.dispose()
    if os.path.exists("./test_bank_credit_utr.db"):
        os.remove("./test_bank_credit_utr.db")


def _purchase(utr: str):
    """Submit one pass payment as the client. Returns (row, error)."""
    db = Session()
    try:
        user = db.query(User).filter(User.email == CLIENT_EMAIL).first()
        row = PaymentService.submit_payment(
            db, user, plan_code="MONTHLY", utr=utr,
            payment_date=datetime(2026, 11, 16, 12, 0, 0), file=_FakeUpload(),
        )
        return row, None
    except Exception as exc:  # noqa: BLE001
        db.rollback()
        return None, exc
    finally:
        db.close()


def _fresh_provider(db):
    """A provider with its own profile and listing.

    Each call needs its own company: a profile may only carry ONE open visibility
    submission, and a listing only one open fee, so sharing them across tests
    would fail on those unrelated product rules instead of on the bank credit.
    """
    suffix = uuid.uuid4().hex[:8]
    user = User(email=f"credit.{suffix}@nhaav.com", password_hash=hash_password(PASSWORD),
                role=UserRole.provider, is_verified=True)
    db.add(user)
    db.commit()
    db.add(Profile(user_id=user.id, company_name=f"Credit Co {suffix}"))
    db.commit()
    listing = Service(provider_id=user.id, name=f"Credit Listing {suffix}",
                      category="Repairs", is_active=True)
    db.add(listing)
    db.commit()
    db.refresh(listing)
    return user, listing


def _listing_fee(utr: str):
    db = Session()
    try:
        user, listing = _fresh_provider(db)
        row = ListingFeeService.submit(
            db, user, ListingType.service, listing.id, utr=utr,
            payment_date=datetime(2026, 11, 16, 12, 0, 0), file=_FakeUpload(),
            plan="month",
        )
        return row, None
    except Exception as exc:  # noqa: BLE001
        db.rollback()
        return None, exc
    finally:
        db.close()


def _visibility(utr: str):
    db = Session()
    try:
        user, _ = _fresh_provider(db)
        row = ProfileVisibilityService.submit(
            db, user, plan_code="monthly", utr=utr,
            payment_date=datetime(2026, 11, 16, 12, 0, 0), file=_FakeUpload(),
        )
        return row, None
    except Exception as exc:  # noqa: BLE001
        db.rollback()
        return None, exc
    finally:
        db.close()


def _ref() -> str:
    return f"BC-{uuid.uuid4().hex[:12]}".upper()


class TestOneReferenceOnePurchase:
    def test_pass_payment_then_other_surfaces_are_refused(self):
        utr = _ref()

        payment, err = _purchase(utr)
        assert payment is not None, f"first claim should succeed: {err}"

        fee, fee_err = _listing_fee(utr)
        assert fee is None
        assert fee_err is not None and fee_err.status_code == 409
        assert "already been submitted as a pass payment" in str(fee_err.detail)

        vis, vis_err = _visibility(utr)
        assert vis is None
        assert vis_err is not None and vis_err.status_code == 409
        assert "already been submitted as a pass payment" in str(vis_err.detail)

        db = Session()
        try:
            assert db.query(Payment).filter(Payment.utr == utr).count() == 1
            assert db.query(ListingFee).filter(ListingFee.utr == utr).count() == 0
            assert db.query(ProfileVisibility).filter(ProfileVisibility.utr == utr).count() == 0
            assert db.query(BankCredit).filter(BankCredit.utr == utr).count() == 1
        finally:
            db.close()

    def test_listing_fee_then_pass_payment_is_refused(self):
        utr = _ref()

        fee, err = _listing_fee(utr)
        assert fee is not None, f"first claim should succeed: {err}"

        payment, pay_err = _purchase(utr)
        assert payment is None
        assert pay_err is not None and pay_err.status_code == 409
        assert "already been submitted as a listing fee" in str(pay_err.detail)

        vis, vis_err = _visibility(utr)
        assert vis is None and vis_err is not None and vis_err.status_code == 409

    def test_visibility_then_pass_payment_is_refused(self):
        utr = _ref()

        vis, err = _visibility(utr)
        assert vis is not None, f"first claim should succeed: {err}"

        payment, pay_err = _purchase(utr)
        assert payment is None
        assert pay_err is not None and pay_err.status_code == 409
        assert "already been submitted as a company-profile visibility payment" in str(
            pay_err.detail
        )

    def test_refusal_leaves_no_receipt_file_behind(self):
        utr = _ref()
        payment, err = _purchase(utr)
        assert payment is not None, err

        before = set(os.listdir(settings.PAYMENT_RECEIPTS_DIR))
        _, fee_err = _listing_fee(utr)
        assert fee_err is not None and fee_err.status_code == 409
        after = set(os.listdir(settings.PAYMENT_RECEIPTS_DIR))
        assert after == before, "a refused submission must not store a receipt"

    def test_rejected_claim_frees_the_reference(self):
        """A rejected transfer may be corrected and re-submitted — the per-table
        rule, now shared across surfaces."""
        utr = _ref()

        payment, err = _purchase(utr)
        assert payment is not None, err

        db = Session()
        try:
            admin = db.query(User).filter(User.email == ADMIN_EMAIL).first()
            PaymentService.reject_payment(db, admin, payment.id, "Unclear receipt")
        finally:
            db.close()

        vis, vis_err = _visibility(utr)
        assert vis is not None, f"the released reference should be usable: {vis_err}"

    def test_credit_is_linked_to_its_claim(self):
        utr = _ref()
        payment, err = _purchase(utr)
        assert payment is not None, err

        db = Session()
        try:
            credit = db.query(BankCredit).filter(BankCredit.utr == utr).one()
            assert payment.bank_credit_id == credit.id
            assert credit.claim_type == BankCreditClaimType.payment
            assert credit.claim_id == payment.id
        finally:
            db.close()

    def test_distinct_references_do_not_interfere(self):
        payment, pay_err = _purchase(_ref())
        fee, fee_err = _listing_fee(_ref())
        vis, vis_err = _visibility(_ref())
        assert payment is not None, pay_err
        assert fee is not None, fee_err
        assert vis is not None, vis_err

    def test_cross_table_unique_index_exists(self):
        names = {ix.name for ix in BankCredit.__table__.indexes}
        assert "ux_bank_credits_live_utr" in names
        index = next(ix for ix in BankCredit.__table__.indexes
                     if ix.name == "ux_bank_credits_live_utr")
        assert index.unique
