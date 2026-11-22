import math
import uuid
from typing import List, Optional, Tuple

from sqlalchemy import or_, func
from sqlalchemy.orm import Session
from fastapi import HTTPException, status

from app.models.user import User, UserRole
from app.models.supply_listing import SupplyListing, SupplyListingStatus
from app.schemas.supply_listing import (
    SupplyListingCreate,
    SupplyListingUpdate,
)

# Statuses a supplier is allowed to hold a listing in.
_SUPPLIER_EDITABLE_STATUSES = {
    SupplyListingStatus.draft,
    SupplyListingStatus.pending_review,
    SupplyListingStatus.rejected,
}


class SupplyListingService:

    # ------------------------------------------------------------------ guards
    @staticmethod
    def _require_supplier(db: Session, user_id: uuid.UUID) -> User:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
        if user.role != UserRole.supplier:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only suppliers can manage supply listings",
            )
        return user

    @staticmethod
    def _get_owned(db: Session, listing_id: uuid.UUID, user_id: uuid.UUID) -> SupplyListing:
        listing = db.query(SupplyListing).filter(SupplyListing.id == listing_id).first()
        if not listing:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Listing not found")
        if listing.supplier_id != user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to manage this listing",
            )
        return listing

    # ------------------------------------------------------------------- writes
    @staticmethod
    def create_listing(db: Session, user_id: uuid.UUID, data: SupplyListingCreate) -> SupplyListing:
        SupplyListingService._require_supplier(db, user_id)

        payload = data.model_dump(exclude={"submit_now"})
        listing = SupplyListing(
            supplier_id=user_id,
            status=SupplyListingStatus.pending_review if data.submit_now else SupplyListingStatus.draft,
            **payload,
        )
        try:
            db.add(listing)
            db.commit()
            db.refresh(listing)
            return listing
        except Exception:
            db.rollback()
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create listing",
            )

    @staticmethod
    def update_listing(
        db: Session, listing_id: uuid.UUID, user_id: uuid.UUID, data: SupplyListingUpdate
    ) -> SupplyListing:
        listing = SupplyListingService._get_owned(db, listing_id, user_id)

        # NOTE: status is not settable through this path — a supplier cannot
        # self-approve. Use submit/archive/moderate endpoints instead.
        update_dict = data.model_dump(exclude_unset=True)
        for key, value in update_dict.items():
            setattr(listing, key, value)

        try:
            db.commit()
            db.refresh(listing)
            return listing
        except Exception:
            db.rollback()
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to update listing",
            )

    @staticmethod
    def submit_for_review(db: Session, listing_id: uuid.UUID, user_id: uuid.UUID) -> SupplyListing:
        listing = SupplyListingService._get_owned(db, listing_id, user_id)
        if listing.status not in {SupplyListingStatus.draft, SupplyListingStatus.rejected}:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Only draft or rejected listings can be submitted for review",
            )
        listing.status = SupplyListingStatus.pending_review
        db.commit()
        db.refresh(listing)
        return listing

    @staticmethod
    def archive_listing(db: Session, listing_id: uuid.UUID, user_id: uuid.UUID) -> SupplyListing:
        listing = SupplyListingService._get_owned(db, listing_id, user_id)
        listing.status = SupplyListingStatus.archived
        db.commit()
        db.refresh(listing)
        return listing

    @staticmethod
    def delete_listing(db: Session, listing_id: uuid.UUID, user_id: uuid.UUID) -> None:
        listing = SupplyListingService._get_owned(db, listing_id, user_id)
        try:
            db.delete(listing)
            db.commit()
        except Exception:
            db.rollback()
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to delete listing",
            )

    @staticmethod
    def moderate_listing(
        db: Session, listing_id: uuid.UUID, new_status: SupplyListingStatus
    ) -> SupplyListing:
        """Admin-only moderation. Approval/rejection is never supplier-triggerable."""
        if new_status not in {SupplyListingStatus.approved, SupplyListingStatus.rejected}:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Moderation can only approve or reject a listing",
            )
        listing = db.query(SupplyListing).filter(SupplyListing.id == listing_id).first()
        if not listing:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Listing not found")
        listing.status = new_status
        db.commit()
        db.refresh(listing)
        return listing

    # -------------------------------------------------------------------- reads
    @staticmethod
    def get_mine(
        db: Session, user_id: uuid.UUID, listing_status: Optional[SupplyListingStatus] = None
    ) -> List[SupplyListing]:
        SupplyListingService._require_supplier(db, user_id)
        query = db.query(SupplyListing).filter(SupplyListing.supplier_id == user_id)
        if listing_status:
            query = query.filter(SupplyListing.status == listing_status)
        return query.order_by(SupplyListing.created_at.desc()).all()

    @staticmethod
    def get_public(db: Session, listing_id: uuid.UUID) -> SupplyListing:
        listing = db.query(SupplyListing).filter(SupplyListing.id == listing_id).first()
        if not listing:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Listing not found")
        # Approved AND inside its paid 60-day window; anything else is off the
        # marketplace (404 to the buyer, still visible to the owner).
        if not listing.is_live:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Listing not found")
        return listing

    @staticmethod
    def get_visible_to(
        db: Session, listing_id: uuid.UUID, current_user: Optional[User]
    ) -> SupplyListing:
        """Owner can see own listing in any state; admins any; everyone else approved-only."""
        listing = db.query(SupplyListing).filter(SupplyListing.id == listing_id).first()
        if not listing:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Listing not found")

        if current_user is not None and (
            listing.supplier_id == current_user.id or current_user.role == UserRole.admin
        ):
            return listing

        if not listing.is_live:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Listing not found")
        return listing

    @staticmethod
    def search_public(
        db: Session,
        page: int = 1,
        limit: int = 20,
        category: Optional[str] = None,
        subcategory: Optional[str] = None,
        supplier_id: Optional[uuid.UUID] = None,
        port: Optional[str] = None,
        availability: Optional[str] = None,
        search: Optional[str] = None,
    ) -> Tuple[List[SupplyListing], int, int, int]:
        # PAID PLACEMENT: only approved listings whose 60-day paid window is
        # still running are browsable.
        from datetime import datetime

        query = db.query(SupplyListing).filter(
            SupplyListing.status == SupplyListingStatus.approved,
            SupplyListing.expires_at.isnot(None),
            SupplyListing.expires_at > datetime.utcnow(),
        )

        if category:
            query = query.filter(func.lower(SupplyListing.category) == category.strip().lower())
        if subcategory:
            query = query.filter(func.lower(SupplyListing.subcategory) == subcategory.strip().lower())
        if supplier_id:
            query = query.filter(SupplyListing.supplier_id == supplier_id)
        if availability:
            query = query.filter(func.lower(SupplyListing.availability) == availability.strip().lower())
        if search:
            like = f"%{search.strip().lower()}%"
            query = query.filter(
                or_(
                    func.lower(SupplyListing.name).like(like),
                    func.lower(SupplyListing.category).like(like),
                    func.lower(SupplyListing.subcategory).like(like),
                    func.lower(SupplyListing.manufacturer).like(like),
                    func.lower(SupplyListing.part_number).like(like),
                )
            )

        # Port filtering is done in Python because `ports` is a JSON list.
        all_matches = query.order_by(SupplyListing.created_at.desc()).all()
        if port:
            target = port.strip().lower()
            all_matches = [
                l for l in all_matches
                if not l.ports or any((p or "").strip().lower() == target for p in l.ports)
            ]

        total = len(all_matches)
        pages = math.ceil(total / limit) if limit > 0 else 1
        offset = (page - 1) * limit
        return all_matches[offset:offset + limit], total, page, pages

    @staticmethod
    def dashboard_counts(db: Session, user_id: uuid.UUID) -> dict:
        """Real counts for the supplier dashboard — no fabricated metrics."""
        user = SupplyListingService._require_supplier(db, user_id)

        def count(st: SupplyListingStatus) -> int:
            return (
                db.query(func.count(SupplyListing.id))
                .filter(SupplyListing.supplier_id == user_id, SupplyListing.status == st)
                .scalar()
                or 0
            )

        payload = {
            "active_listings": count(SupplyListingStatus.approved),
            "pending_listings": count(SupplyListingStatus.pending_review),
            "draft_listings": count(SupplyListingStatus.draft),
            "rejected_listings": count(SupplyListingStatus.rejected),
            "archived_listings": count(SupplyListingStatus.archived),
        }
        from app.services.profile_view_simulation_service import (
            SimulatedProfileViewsService,
        )

        payload.update(SimulatedProfileViewsService.snapshot(user) or {})
        return payload
