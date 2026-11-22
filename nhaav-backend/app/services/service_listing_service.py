import math
import uuid
from typing import List, Optional, Tuple

from sqlalchemy import or_, func
from sqlalchemy.orm import Session
from fastapi import HTTPException, status

from app.models.user import User, UserRole
from app.models.service import Service, ServiceListingStatus
from app.schemas.service import ServiceCreate, ServiceUpdate


class ServiceListingService:
    """
    Service-provider analogue of SupplyListingService.

    Ownership is enforced against `Service.provider_id` (which FKs
    `profiles.user_id`), so a provider can only manage rows they own. Public
    visibility / matching eligibility is expressed through the derived
    `is_active` flag, kept in sync with `status == approved`.
    """

    @staticmethod
    def _sync_active(listing: Service) -> None:
        listing.is_active = listing.status == ServiceListingStatus.approved

    # ------------------------------------------------------------------ guards
    @staticmethod
    def _require_provider(db: Session, user_id: uuid.UUID) -> User:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
        if user.role != UserRole.provider:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only service providers can manage service listings",
            )
        return user

    @staticmethod
    def _get_owned(db: Session, listing_id: uuid.UUID, user_id: uuid.UUID) -> Service:
        listing = db.query(Service).filter(Service.id == listing_id).first()
        if not listing:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Service listing not found")
        if listing.provider_id != user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to manage this listing",
            )
        return listing

    @staticmethod
    def _duplicate_exists(
        db: Session, provider_id: uuid.UUID, service_id: Optional[str], port_id: Optional[str],
        exclude_id: Optional[uuid.UUID] = None,
    ) -> bool:
        # Uniqueness is only meaningful when both matching keys are present.
        if not service_id or not port_id:
            return False
        query = db.query(Service).filter(
            Service.provider_id == provider_id,
            func.lower(Service.service_id) == service_id.strip().lower(),
            func.lower(Service.port_id) == port_id.strip().lower(),
        )
        if exclude_id is not None:
            query = query.filter(Service.id != exclude_id)
        return db.query(query.exists()).scalar()

    # ------------------------------------------------------------------- writes
    @staticmethod
    def create_listing(db: Session, user_id: uuid.UUID, data: ServiceCreate) -> Service:
        ServiceListingService._require_provider(db, user_id)

        if ServiceListingService._duplicate_exists(db, user_id, data.service_id, data.port_id):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    f"Duplicate listing: {data.service_id} → {data.port_id} already exists for this "
                    "provider. Each Service + Port combination must be unique."
                ),
            )

        payload = data.model_dump(exclude={"submit_now"})
        listing = Service(
            provider_id=user_id,
            status=ServiceListingStatus.pending_review if data.submit_now else ServiceListingStatus.draft,
            **payload,
        )
        ServiceListingService._sync_active(listing)
        try:
            db.add(listing)
            db.commit()
            db.refresh(listing)
            return listing
        except Exception:
            db.rollback()
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create service listing",
            )

    @staticmethod
    def update_listing(
        db: Session, listing_id: uuid.UUID, user_id: uuid.UUID, data: ServiceUpdate
    ) -> Service:
        listing = ServiceListingService._get_owned(db, listing_id, user_id)

        update_dict = data.model_dump(exclude_unset=True)
        new_service_id = update_dict.get("service_id", listing.service_id)
        new_port_id = update_dict.get("port_id", listing.port_id)
        if ServiceListingService._duplicate_exists(
            db, listing.provider_id, new_service_id, new_port_id, exclude_id=listing.id
        ):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    f"Duplicate listing: {new_service_id} → {new_port_id} already exists for this "
                    "provider. Each Service + Port combination must be unique."
                ),
            )

        for key, value in update_dict.items():
            setattr(listing, key, value)
        ServiceListingService._sync_active(listing)

        try:
            db.commit()
            db.refresh(listing)
            return listing
        except Exception:
            db.rollback()
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to update service listing",
            )

    @staticmethod
    def submit_for_review(db: Session, listing_id: uuid.UUID, user_id: uuid.UUID) -> Service:
        listing = ServiceListingService._get_owned(db, listing_id, user_id)
        if listing.status not in {ServiceListingStatus.draft, ServiceListingStatus.rejected}:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Only draft or rejected listings can be submitted for review",
            )
        listing.status = ServiceListingStatus.pending_review
        ServiceListingService._sync_active(listing)
        db.commit()
        db.refresh(listing)
        return listing

    @staticmethod
    def archive_listing(db: Session, listing_id: uuid.UUID, user_id: uuid.UUID) -> Service:
        listing = ServiceListingService._get_owned(db, listing_id, user_id)
        listing.status = ServiceListingStatus.archived
        ServiceListingService._sync_active(listing)
        db.commit()
        db.refresh(listing)
        return listing

    @staticmethod
    def delete_listing(db: Session, listing_id: uuid.UUID, user_id: uuid.UUID) -> None:
        listing = ServiceListingService._get_owned(db, listing_id, user_id)
        try:
            db.delete(listing)
            db.commit()
        except Exception:
            db.rollback()
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to delete service listing",
            )

    @staticmethod
    def moderate_listing(
        db: Session, listing_id: uuid.UUID, new_status: ServiceListingStatus
    ) -> Service:
        """Admin-only moderation. Approval/rejection is never provider-triggerable."""
        if new_status not in {ServiceListingStatus.approved, ServiceListingStatus.rejected}:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Moderation can only approve or reject a listing",
            )
        listing = db.query(Service).filter(Service.id == listing_id).first()
        if not listing:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Service listing not found")
        listing.status = new_status
        ServiceListingService._sync_active(listing)
        db.commit()
        db.refresh(listing)
        return listing

    # -------------------------------------------------------------------- reads
    @staticmethod
    def get_mine(
        db: Session, user_id: uuid.UUID, listing_status: Optional[ServiceListingStatus] = None
    ) -> List[Service]:
        ServiceListingService._require_provider(db, user_id)
        query = db.query(Service).filter(Service.provider_id == user_id)
        if listing_status:
            query = query.filter(Service.status == listing_status)
        return query.order_by(Service.created_at.desc()).all()

    @staticmethod
    def get_public(db: Session, listing_id: uuid.UUID) -> Service:
        listing = db.query(Service).filter(Service.id == listing_id).first()
        if not listing or not listing.is_live:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Service listing not found")
        return listing

    @staticmethod
    def get_visible_to(db: Session, listing_id: uuid.UUID, current_user: Optional[User]) -> Service:
        """Owner can see own listing in any state; admins any; everyone else approved-only."""
        listing = db.query(Service).filter(Service.id == listing_id).first()
        if not listing:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Service listing not found")

        if current_user is not None and (
            listing.provider_id == current_user.id or current_user.role == UserRole.admin
        ):
            return listing

        # Approved AND inside its paid 60-day placement window, or the buyer sees
        # nothing (the owner still sees it above).
        if not listing.is_live:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Service listing not found")
        return listing

    @staticmethod
    def search_public(
        db: Session,
        page: int = 1,
        limit: int = 20,
        category: Optional[str] = None,
        subcategory: Optional[str] = None,
        provider_id: Optional[uuid.UUID] = None,
        port: Optional[str] = None,
        service_id: Optional[str] = None,
        search: Optional[str] = None,
    ) -> Tuple[List[Service], int, int, int]:
        # PAID PLACEMENT: browsable only while the 60-day paid window runs.
        from datetime import datetime

        query = db.query(Service).filter(
            Service.is_active.is_(True),
            Service.expires_at.isnot(None),
            Service.expires_at > datetime.utcnow(),
        )

        if category:
            query = query.filter(func.lower(Service.category) == category.strip().lower())
        if subcategory:
            query = query.filter(func.lower(Service.subcategory) == subcategory.strip().lower())
        if provider_id:
            query = query.filter(Service.provider_id == provider_id)
        if service_id:
            query = query.filter(func.lower(Service.service_id) == service_id.strip().lower())
        if port:
            query = query.filter(func.lower(Service.port_id) == port.strip().lower())
        if search:
            like = f"%{search.strip().lower()}%"
            query = query.filter(
                or_(
                    func.lower(Service.name).like(like),
                    func.lower(Service.category).like(like),
                    func.lower(Service.subcategory).like(like),
                    func.lower(Service.service_id).like(like),
                    func.lower(Service.description).like(like),
                )
            )

        all_matches = query.order_by(Service.created_at.desc()).all()
        total = len(all_matches)
        pages = math.ceil(total / limit) if limit > 0 else 1
        offset = (page - 1) * limit
        return all_matches[offset:offset + limit], total, page, pages

    @staticmethod
    def dashboard_counts(db: Session, user_id: uuid.UUID) -> dict:
        """Real counts for the provider dashboard — no fabricated metrics."""
        user = ServiceListingService._require_provider(db, user_id)

        def count(st: ServiceListingStatus) -> int:
            return (
                db.query(func.count(Service.id))
                .filter(Service.provider_id == user_id, Service.status == st)
                .scalar()
                or 0
            )

        payload = {
            "active_listings": count(ServiceListingStatus.approved),
            "pending_listings": count(ServiceListingStatus.pending_review),
            "draft_listings": count(ServiceListingStatus.draft),
            "rejected_listings": count(ServiceListingStatus.rejected),
            "archived_listings": count(ServiceListingStatus.archived),
        }
        from app.services.profile_view_simulation_service import (
            SimulatedProfileViewsService,
        )

        payload.update(SimulatedProfileViewsService.snapshot(user) or {})
        return payload
