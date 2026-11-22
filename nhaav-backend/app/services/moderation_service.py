import uuid
from typing import List, Optional

from fastapi import HTTPException, status as http_status
from sqlalchemy.orm import Session

from app.models.user import User, UserRole
from app.models.profile import Profile
from app.models.service import Service, ServiceListingStatus
from app.models.supply_listing import SupplyListing, SupplyListingStatus
from app.models.moderation_audit import ModerationAuditLog
from app.models.notification import NotificationType
from app.services.notification_service import NotificationService
from app.schemas.moderation import ModerationListing

_ALLOWED_ACTIONS = {"approved", "rejected"}


class ModerationService:
    """
    Admin-only moderation over both marketplace ecosystems.

    A single surface (kind = "service" | "supply") keeps the moderation workflow
    identical for providers and suppliers. Every approve/reject writes an
    append-only `ModerationAuditLog` row.
    """

    @staticmethod
    def _require_admin(db: Session, user_id: uuid.UUID) -> User:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(status_code=http_status.HTTP_401_UNAUTHORIZED, detail="Could not validate credentials")
        if user.role != UserRole.admin:
            raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Admin access required")
        return user

    @staticmethod
    def _owner_info(db: Session, owner_id: uuid.UUID):
        profile = db.query(Profile).filter(Profile.user_id == owner_id).first()
        user = db.query(User).filter(User.id == owner_id).first()
        company = profile.company_name if profile else None
        email = user.email if user else None
        return company, email

    @staticmethod
    def _to_item(db: Session, kind: str, listing) -> ModerationListing:
        owner_id = listing.provider_id if kind == "service" else listing.supplier_id
        company, email = ModerationService._owner_info(db, owner_id)
        if kind == "service":
            ports = [listing.port_id] if listing.port_id else []
            service_id = listing.service_id
            port_id = listing.port_id
        else:
            ports = list(listing.ports or [])
            service_id = None
            port_id = None
        return ModerationListing(
            id=listing.id,
            kind=kind,
            name=listing.name,
            category=listing.category,
            subcategory=listing.subcategory,
            description=listing.description,
            status=listing.status.value if hasattr(listing.status, "value") else str(listing.status),
            rejection_reason=getattr(listing, "rejection_reason", None),
            owner_id=owner_id,
            owner_company=company,
            owner_email=email,
            service_id=service_id,
            port_id=port_id,
            ports=ports,
            created_at=listing.created_at,
            updated_at=listing.updated_at,
        )

    @staticmethod
    def queue(
        db: Session, admin_id: uuid.UUID, kind: str, listing_status: Optional[str] = None
    ) -> List[ModerationListing]:
        ModerationService._require_admin(db, admin_id)
        if kind not in {"service", "supply"}:
            raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail="kind must be 'service' or 'supply'")

        if kind == "service":
            query = db.query(Service)
            if listing_status:
                try:
                    query = query.filter(Service.status == ServiceListingStatus(listing_status))
                except ValueError:
                    raise HTTPException(status_code=400, detail="Invalid status filter")
            else:
                query = query.filter(Service.status == ServiceListingStatus.pending_review)
            rows = query.order_by(Service.updated_at.desc()).all()
        else:
            query = db.query(SupplyListing)
            if listing_status:
                try:
                    query = query.filter(SupplyListing.status == SupplyListingStatus(listing_status))
                except ValueError:
                    raise HTTPException(status_code=400, detail="Invalid status filter")
            else:
                query = query.filter(SupplyListing.status == SupplyListingStatus.pending_review)
            rows = query.order_by(SupplyListing.updated_at.desc()).all()

        return [ModerationService._to_item(db, kind, r) for r in rows]

    @staticmethod
    def act(
        db: Session,
        admin_id: uuid.UUID,
        kind: str,
        listing_id: uuid.UUID,
        new_status: str,
        reason: Optional[str] = None,
    ):
        admin = ModerationService._require_admin(db, admin_id)
        if kind not in {"service", "supply"}:
            raise HTTPException(status_code=400, detail="kind must be 'service' or 'supply'")
        if new_status not in _ALLOWED_ACTIONS:
            raise HTTPException(status_code=400, detail="Moderation can only approve or reject a listing")

        if kind == "service":
            listing = db.query(Service).filter(Service.id == listing_id).first()
        else:
            listing = db.query(SupplyListing).filter(SupplyListing.id == listing_id).first()
        if not listing:
            raise HTTPException(status_code=404, detail="Listing not found")

        # Lifecycle guard: only a listing awaiting review can be moderated.
        current = listing.status.value if hasattr(listing.status, "value") else str(listing.status)
        if current != "pending_review":
            raise HTTPException(
                status_code=http_status.HTTP_409_CONFLICT,
                detail=f"Only listings pending review can be moderated (current status: {current})",
            )

        owner_id = listing.provider_id if kind == "service" else listing.supplier_id

        listing.status = ServiceListingStatus(new_status) if kind == "service" else SupplyListingStatus(new_status)
        if kind == "service":
            listing.is_active = listing.status == ServiceListingStatus.approved
        listing.rejection_reason = (reason or None) if new_status == "rejected" else None

        # PAID PLACEMENT. Approval is only the content half of going live: the
        # listing also needs a verified ₹1,000 fee. If one is already verified
        # the 60-day window starts now; otherwise the listing stays approved but
        # hidden until the owner pays (see ListingFeeService).
        live_now = False
        if new_status == "approved":
            from app.models.listing_fee import ListingType
            from app.services.listing_fee_service import ListingFeeService

            kind_type = ListingType.service if kind == "service" else ListingType.supply
            live_now = ListingFeeService.publish_if_ready(db, kind_type, listing)

        db.add(ModerationAuditLog(
            entity_type=kind,
            entity_id=listing.id,
            admin_id=admin.id,
            action=new_status,
            reason=reason or None,
        ))

        # Notify the listing owner in-app. dedupe is intentionally OFF: each
        # moderation event is a distinct user-facing event (a resubmitted listing
        # that is rejected again must notify again, with the new reason), and
        # duplicate fan-out from admin retries is already impossible because the
        # lifecycle guard above 409s any second moderation of a non-pending
        # listing.
        related = "service_listing" if kind == "service" else "supply_listing"
        if new_status == "approved":
            title = "Your service listing has been approved" if kind == "service" else "Your supply listing has been approved"
            if live_now:
                message = (
                    f"Your listing \"{listing.name}\" has been approved and is live on the "
                    f"marketplace until {listing.expires_at.date().isoformat()}."
                )
            else:
                message = (
                    f"Your listing \"{listing.name}\" has been approved. Pay the "
                    "₹1,000 placement fee to put it on the marketplace for 60 days."
                )
        else:
            title = "Your service listing was rejected" if kind == "service" else "Your supply listing was rejected"
            message = f"Your listing \"{listing.name}\" was rejected."
            if reason:
                message += f" Reason: {reason}"
        NotificationService.create_notification(
            db,
            owner_id,
            title,
            message,
            NotificationType.moderation,
            related_entity=related,
            related_entity_id=listing.id,
            dedupe=False,
        )

        db.commit()
        db.refresh(listing)

        return {
            "id": listing.id,
            "kind": kind,
            "status": listing.status.value,
            "rejection_reason": listing.rejection_reason,
        }
