"""
One bank reference, one claim — enforced across all three paid surfaces.

Each surface (payments, listing fees, profile visibility) already refuses to use
the same reference twice WITHIN its own table. This service adds the missing
check ACROSS them, using the shared `BankCredit` row:

    reservation   claim()    — reserve the reference, or 409 if it is taken
    linkage       attach()   — point the credit at the claim row it funds
    release       release()  — free the reference when the claim is rejected

The reservation is written in the caller's transaction, so a failed submission
leaves no credit behind and a successful one commits the credit and its claim
together. A rejected or cancelled claim releases the reference (so a corrected
reference can be re-submitted, as before), and the same is derived lazily if a
row's status was changed outside these helpers.
"""
import uuid
from datetime import datetime
from typing import Optional

from fastapi import HTTPException, status as http_status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.bank_credit import BankCredit, BankCreditClaimType, BankCreditStatus
from app.models.listing_fee import ListingFee, ListingFeeStatus
from app.models.payment import Payment, PaymentStatus
from app.models.profile_visibility import ProfileVisibility, ProfileVisibilityStatus

#: A claim in one of these states still holds its bank reference.
_LIVE_PAYMENT = (PaymentStatus.PENDING, PaymentStatus.SUBMITTED, PaymentStatus.VERIFIED)
_LIVE_LISTING_FEE = (
    ListingFeeStatus.PENDING,
    ListingFeeStatus.SUBMITTED,
    ListingFeeStatus.VERIFIED,
)
_LIVE_VISIBILITY = (
    ProfileVisibilityStatus.PENDING,
    ProfileVisibilityStatus.SUBMITTED,
    ProfileVisibilityStatus.VERIFIED,
)

#: How each surface is described to the person whose submission is refused.
_CLAIM_LABELS = {
    BankCreditClaimType.payment: "a pass payment",
    BankCreditClaimType.listing_fee: "a listing fee",
    BankCreditClaimType.profile_visibility: "a company-profile visibility payment",
}


class BankCreditService:
    """Reserve, link and release the single credit behind a UTR."""

    @staticmethod
    def normalize(utr: Optional[str]) -> str:
        return (utr or "").strip().upper()

    # ------------------------------------------------------------ reservation
    @staticmethod
    def claim(
        db: Session,
        *,
        utr: str,
        claim_type: BankCreditClaimType,
        owner_user_id: Optional[uuid.UUID] = None,
        amount_paise: Optional[int] = None,
        currency: str = "INR",
        receipt_path: Optional[str] = None,
        receipt_filename: Optional[str] = None,
    ) -> BankCredit:
        """Reserve `utr` for one claim, or refuse with a 409.

        Raises HTTPException(409) when the reference is already held by a live
        claim on ANY surface. The caller's transaction is rolled back first so it
        never continues on top of a half-reserved session.
        """
        reference = BankCreditService.normalize(utr)

        existing = (
            db.query(BankCredit)
            .filter(
                BankCredit.utr == reference,
                BankCredit.status == BankCreditStatus.CLAIMED,
            )
            .first()
        )
        if existing is not None:
            if BankCreditService._claim_is_live(db, existing):
                db.rollback()
                raise HTTPException(
                    status_code=http_status.HTTP_409_CONFLICT,
                    detail=BankCreditService._conflict_detail(existing),
                )
            # The claim was rejected/cancelled without going through release():
            # free the reference now so this submission can take it.
            existing.status = BankCreditStatus.RELEASED
            existing.released_at = datetime.utcnow()
            db.flush()

        credit = BankCredit(
            utr=reference,
            claim_type=claim_type,
            owner_user_id=owner_user_id,
            amount_paise=amount_paise,
            currency=currency,
            receipt_path=receipt_path,
            receipt_filename=receipt_filename,
            status=BankCreditStatus.CLAIMED,
        )
        db.add(credit)
        try:
            db.flush()
        except IntegrityError:
            # Two submissions of the same reference raced across different
            # surfaces: the partial unique index let exactly one of them in.
            db.rollback()
            raise HTTPException(
                status_code=http_status.HTTP_409_CONFLICT,
                detail=BankCreditService._conflict_detail(None),
            )
        return credit

    @staticmethod
    def attach(credit: BankCredit, claim_id: uuid.UUID) -> None:
        """Point the credit at the claim row it funded (same transaction)."""
        credit.claim_id = claim_id

    @staticmethod
    def release(
        db: Session, *, claim_type: BankCreditClaimType, claim_id: uuid.UUID
    ) -> None:
        """Free the reference held by this claim (call before committing)."""
        credit = (
            db.query(BankCredit)
            .filter(
                BankCredit.claim_type == claim_type,
                BankCredit.claim_id == claim_id,
                BankCredit.status == BankCreditStatus.CLAIMED,
            )
            .first()
        )
        if credit is not None:
            credit.status = BankCreditStatus.RELEASED
            credit.released_at = datetime.utcnow()

    # ---------------------------------------------------------------- helpers
    @staticmethod
    def _claim_is_live(db: Session, credit: BankCredit) -> bool:
        """Is the claim that holds this credit still in a live state?

        A credit with no claim_id yet (or an unknown claimant) is treated as
        live: the reference is spoken for until we can prove otherwise.
        """
        if credit.claim_id is None or credit.claim_type is None:
            return True

        if credit.claim_type == BankCreditClaimType.payment:
            row = db.query(Payment).filter(Payment.id == credit.claim_id).first()
            return row is not None and row.status in _LIVE_PAYMENT
        if credit.claim_type == BankCreditClaimType.listing_fee:
            row = db.query(ListingFee).filter(ListingFee.id == credit.claim_id).first()
            return row is not None and row.status in _LIVE_LISTING_FEE
        if credit.claim_type == BankCreditClaimType.profile_visibility:
            row = (
                db.query(ProfileVisibility)
                .filter(ProfileVisibility.id == credit.claim_id)
                .first()
            )
            return row is not None and row.status in _LIVE_VISIBILITY
        return True

    @staticmethod
    def _conflict_detail(credit: Optional[BankCredit]) -> str:
        """The 409 body.

        Every cross-surface refusal keeps the standard "already been submitted"
        wording the per-table checks use, so an existing client that matches on
        it keeps working; the surface is added when we know it.
        """
        label = _CLAIM_LABELS.get(credit.claim_type) if credit is not None else None
        if label:
            return (
                f"This UTR / transaction reference has already been submitted as "
                f"{label}, and is awaiting review or already processed. One bank "
                "transfer can fund only one Nhaav purchase — submit a different "
                "reference, or contact support if this is a mistake."
            )
        return (
            "This UTR / transaction reference has already been submitted for "
            "another Nhaav purchase and is awaiting review or already processed. "
            "One bank transfer can fund only one purchase — submit a different "
            "reference, or contact support if this is a mistake."
        )
