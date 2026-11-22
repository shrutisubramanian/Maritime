import uuid
import math
from typing import Optional, List, Tuple
from sqlalchemy import String, cast
from sqlalchemy.orm import Session, joinedload, selectinload
from fastapi import HTTPException, status

from app.models.profile import Profile, VerificationStatus
from app.models.user import User, UserRole
from app.schemas.profile import ProfileCreate, ProfileUpdate
from datetime import datetime

from app.services.admin_audit import (
    ACTION_APPROVED,
    ACTION_REJECTED,
    ACTION_UNDER_REVIEW,
    ENTITY_PROFILE,
    record_decision,
)
from app.services.notification_service import NotificationService
from app.models.notification import NotificationType

class ProfileService:
    """
    Service class handling business logic for Profiles.
    Keeps database operations and validation rules decoupled from the API routers.
    """

    @staticmethod
    def create_profile(db: Session, user_id: uuid.UUID, profile_data: ProfileCreate) -> Profile:
        """
        Creates a new profile for a user.
        Enforces the business rule that a user can only have exactly one profile.
        """
        # 1. Verify the user actually exists
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
            
        # 2. Prevent duplicate profiles
        existing_profile = db.query(Profile).filter(Profile.user_id == user_id).first()
        if existing_profile:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, 
                detail="A profile already exists for this user"
            )
            
        # 3. Construct the ORM model from the Pydantic schema
        # model_dump() cleanly converts the Pydantic object into a dictionary
        payload = profile_data.model_dump()

        # Marketplace location, same rules as an update: head office must be a
        # catalogue port (it is what places the company under a port filter) and
        # the other ports are canonicalized so the filter can never disagree with
        # what the profile says.
        from app.services.port_catalogue_service import PortCatalogueService

        raw_office = payload.pop("head_office", None)
        if raw_office is not None and str(raw_office).strip():
            payload["head_office"] = PortCatalogueService.resolve(
                db, str(raw_office), field="head office"
            ).name
        else:
            payload["head_office"] = None

        raw_ports = payload.pop("ports_served", None) or []
        payload["ports_served"] = PortCatalogueService.canonical_names(
            db, raw_ports, field="ports"
        )

        db_profile = Profile(
            user_id=user_id,
            **payload
        )
        
        # 4. Save to database using a transaction block
        try:
            db.add(db_profile)
            db.commit()
            db.refresh(db_profile)
            return db_profile
        except Exception:
            db.rollback()
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create profile due to an internal database error"
            )

    @staticmethod
    def get_profile_by_user_id(db: Session, user_id: uuid.UUID) -> Profile:
        """
        Retrieves a profile using the owner's user_id.
        Useful for endpoints like GET /profiles/me.
        """
        profile = db.query(Profile).filter(Profile.user_id == user_id).first()
        if not profile:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, 
                detail="Profile not found for this user"
            )
        return profile

    @staticmethod
    def assert_public_profile_access(
        profile: Profile,
        current_user: Optional[User],
    ) -> None:
        """Authorise the safe public view of a provider/supplier profile.

        Buyers may review vendor companies. Vendors may only read their own
        company profile: a competitor's profile is private. Client profiles are
        never exposed to another account, and admins keep support access.
        """
        target_user = profile.user
        if target_user is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Profile not found",
            )

        if current_user is not None and (
            current_user.id == target_user.id or current_user.role == UserRole.admin
        ):
            return

        if target_user.role not in (UserRole.provider, UserRole.supplier):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied: profile details are private",
            )

        if current_user is not None and current_user.role in (
            UserRole.provider,
            UserRole.supplier,
        ):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "code": "vendor_profile_private",
                    "message": (
                        "Company profiles are visible to clients. You can only "
                        "view your own company profile."
                    ),
                },
            )

    @staticmethod
    def get_profile_by_id(db: Session, profile_id: uuid.UUID, current_user: Optional[User] = None) -> Profile:
        """
        Retrieves a profile by its own primary key.
        Useful for public profile viewing by other users or clients.
        Clients are blocked from viewing other clients' profiles to enforce privacy.
        """
        profile = db.query(Profile).filter(Profile.id == profile_id).first()
        if not profile:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, 
                detail="Profile not found"
            )
            
        # A full profile contains private contact lists, licences, team,
        # offices, social links and internal metadata. It is owner/admin-only.
        # Everyone else must use the public profile endpoint, which returns the
        # safe PublicProfileResponse schema.
        if current_user is None or (
            current_user.id != profile.user_id
            and current_user.role != UserRole.admin
        ):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied: profile details are private",
            )

        return profile

    @staticmethod
    def update_profile(db: Session, user_id: uuid.UUID, update_data: ProfileUpdate) -> Profile:
        """
        Updates an existing profile using partial data.
        Only fields that are explicitly provided in the request will be modified.
        """
        # 1. Fetch the profile (must belong to the user requesting the update)
        profile = db.query(Profile).filter(Profile.user_id == user_id).first()
        if not profile:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, 
                detail="Profile not found for this user"
            )
            
        user = db.query(User).filter(User.id == user_id).first()
        if user is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="User not found"
            )

        # 2. Extract only the fields that were actually set in the incoming request
        # exclude_unset=True is crucial! It ensures we don't accidentally overwrite 
        # existing database values with None just because a field was omitted from the PATCH request.
        update_dict = update_data.model_dump(exclude_unset=True)

        # COMPANY-FIRST TAXONOMY. The primary category and its subcategories are
        # not plain columns: they are validated together (one category per
        # company, every capability inside it) and written through the taxonomy
        # service, so no caller can create a company with two categories or with
        # capabilities from a category it does not belong to.
        category_given = "primary_category" in update_dict
        subcategories_given = "subcategories" in update_dict
        new_category_name = update_dict.pop("primary_category", None)
        new_subcategory_names = update_dict.pop("subcategories", None)

        # ADDITIONAL BUSINESS CATEGORIES. A company can say it also works in
        # other categories (a ship chandler that also supplies paints). They are
        # descriptive only: the marketplace still files the company under its
        # single primary category, so discovery is untouched. Stored in the
        # existing metadata JSON — no schema change.
        additional_given = "additional_categories" in update_dict
        new_additional_names = update_dict.pop("additional_categories", None)
        if additional_given and new_additional_names:
            if user.role not in (UserRole.provider, UserRole.supplier):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Only suppliers and service providers have marketplace categories.",
                )
            from app.models.vendor_category import VendorType
            from app.services.vendor_taxonomy_service import VendorTaxonomyService

            vendor_type = VendorType(user.role.value)
            known = {
                category.name.strip().lower(): category.name
                for category in VendorTaxonomyService.categories(db, vendor_type)
            }
            primary_name = (profile.primary_category_name or "").strip().lower()
            cleaned: list[str] = []
            for raw_name in new_additional_names:
                name = str(raw_name or "").strip()
                if not name:
                    continue
                canonical = known.get(name.lower())
                if canonical is None:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail={
                            "code": "unknown_additional_category",
                            "message": (
                                f"'{name}' isn't one of the Nhaav business categories "
                                "for this account type."
                            ),
                        },
                    )
                # The primary is already the company's category; listing it again
                # adds nothing.
                if canonical.strip().lower() == primary_name:
                    continue
                if canonical not in cleaned:
                    cleaned.append(canonical)
                if len(cleaned) > 5:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail={
                            "code": "too_many_additional_categories",
                            "message": "List up to five other business categories.",
                        },
                    )
            new_additional_names = cleaned

        if additional_given:
            incoming_metadata = update_dict.get("profile_metadata")
            merged_metadata = dict(
                incoming_metadata
                if isinstance(incoming_metadata, dict)
                else (profile.profile_metadata or {})
            )
            if new_additional_names:
                merged_metadata["additional_categories"] = new_additional_names
            else:
                merged_metadata.pop("additional_categories", None)
            update_dict["profile_metadata"] = merged_metadata

        if category_given or subcategories_given:
            from app.models.vendor_category import VendorType
            from app.services.vendor_taxonomy_service import VendorTaxonomyService

            if user.role not in (UserRole.provider, UserRole.supplier):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Only suppliers and service providers have marketplace categories.",
                )
            vendor_type = VendorType(user.role.value)

            if category_given and new_category_name is None:
                # Explicitly clearing the category also clears the capabilities.
                profile.primary_category_id = None
                VendorTaxonomyService.set_company_selection(db, profile, vendor_type, None, [])
            else:
                category_name = (
                    new_category_name if category_given else profile.primary_category_name
                )
                if category_name is None:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail={
                            "code": "category_required",
                            "message": "Select a primary business category first.",
                        },
                    )
                # Changing category without re-sending capabilities clears the
                # old ones instead of silently keeping stale subcategories.
                if not subcategories_given:
                    category_changed = new_category_name is not None and (
                        profile.primary_category_name or ""
                    ).strip().lower() != new_category_name.strip().lower()
                    new_subcategory_names = [] if category_changed else profile.subcategory_names

                category, subcategories = VendorTaxonomyService.validate_selection(
                    db, vendor_type, category_name, new_subcategory_names
                )
                VendorTaxonomyService.set_company_selection(
                    db, profile, vendor_type, category, subcategories
                )

        # MARKETPLACE LOCATION. Head office is what puts a company under a port
        # filter, so it must resolve to a catalogue port and is stored in its
        # canonical form. The other ports a company works in are canonicalized
        # the same way, but only describe reach — they never create extra
        # discovery entries.
        if "head_office" in update_dict:
            raw_office = update_dict.pop("head_office")
            if raw_office is None or not str(raw_office).strip():
                profile.head_office = None
            else:
                from app.services.port_catalogue_service import PortCatalogueService

                profile.head_office = PortCatalogueService.resolve(
                    db, str(raw_office), field="head office"
                ).name

        if "ports_served" in update_dict:
            raw_ports = update_dict.pop("ports_served") or []
            from app.services.port_catalogue_service import PortCatalogueService

            profile.ports_served = PortCatalogueService.canonical_names(
                db, raw_ports, field="ports"
            )

        # 3. Apply the remaining plain fields dynamically
        for key, value in update_dict.items():
            setattr(profile, key, value)
            
        # 4. Save changes
        try:
            db.commit()
            db.refresh(profile)
            return profile
        except Exception:
            db.rollback()
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to update profile due to an internal database error"
            )

    @staticmethod
    def reject_profile(
        db: Session,
        profile_id: uuid.UUID,
        reason: str | None = None,
        reviewer: Optional[User] = None,
    ) -> Profile:
        """Administrative rejection: the counterpart of verify_profile."""
        profile = db.query(Profile).filter(Profile.id == profile_id).first()

        if not profile:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Profile not found",
            )

        profile.verification_status = VerificationStatus.rejected
        profile.badge_label = None

        # The decision (who/when/why) is stamped on the profile itself in the
        # existing metadata JSON — no schema change — and appended to the
        # immutable audit trail. The reason is what the account is shown.
        now = datetime.utcnow()
        meta = dict(profile.profile_metadata or {})
        meta["verification_state"] = "rejected"
        meta["verification_decided_at"] = now.isoformat()
        if reviewer is not None:
            meta["verification_decided_by"] = str(reviewer.id)
        if reason:
            meta["verification_reason"] = reason
        profile.profile_metadata = meta

        record_decision(
            db,
            entity_type=ENTITY_PROFILE,
            entity_id=profile.id,
            admin=reviewer,
            action=ACTION_REJECTED,
            reason=reason,
        )

        NotificationService.create_notification(
            db=db,
            user_id=profile.user_id,
            title="Profile Verification Rejected",
            message=reason
            or "Your profile verification was rejected. Please review your submitted documents.",
            notification_type=NotificationType.verification,
        )

        db.commit()
        db.refresh(profile)

        return profile

    @staticmethod
    def mark_under_review(
        db: Session,
        profile_id: uuid.UUID,
        reason: str | None = None,
        reviewer: Optional[User] = None,
    ) -> Profile:
        """Request clarification without changing the verification verdict.

        The VerificationStatus enum is pending|verified|rejected, so there is no
        dedicated storage for the "under review" state; the reviewer's note is
        recorded in profile_metadata and the status is left untouched.
        """
        profile = db.query(Profile).filter(Profile.id == profile_id).first()

        if not profile:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Profile not found",
            )

        now = datetime.utcnow()
        meta = dict(profile.profile_metadata or {})
        meta["verification_state"] = "under_review"
        meta["verification_decided_at"] = now.isoformat()
        if reviewer is not None:
            meta["verification_decided_by"] = str(reviewer.id)
        if reason:
            meta["verification_reason"] = reason
        profile.profile_metadata = meta

        record_decision(
            db,
            entity_type=ENTITY_PROFILE,
            entity_id=profile.id,
            admin=reviewer,
            action=ACTION_UNDER_REVIEW,
            reason=reason,
        )

        NotificationService.create_notification(
            db=db,
            user_id=profile.user_id,
            title="Verification Under Review",
            message=reason
            or "Additional information is required to complete your verification.",
            notification_type=NotificationType.verification,
        )

        db.commit()
        db.refresh(profile)

        return profile

    @staticmethod
    def search_providers(
        db: Session,
        page: int = 1,
        limit: int = 20,
        position: Optional[str] = None,
        skill: Optional[str] = None,
        port: Optional[str] = None,
        verification_status: Optional[VerificationStatus] = None,
        min_experience: Optional[int] = None
    ) -> Tuple[List[Profile], int, int, int]:
        """
        Search and filter the marketplace for providers.
        Utilizes PostgreSQL JSONB operators for efficient querying.
        """
        # Base query: Join Profile with User to filter only users with role='provider'.
        # `user` and `services` are eager-loaded in two bulk queries instead of one
        # lazy load per row while the response is serialized, so a page costs the
        # same however many providers exist (the list itself is already paged in SQL).
        query = (
            db.query(Profile)
            .options(joinedload(Profile.user), selectinload(Profile.services))
            .join(User, Profile.user_id == User.id)
            .filter(
                User.role == UserRole.provider,
                Profile.verification_status == VerificationStatus.verified,
            )
        )
        
        # Apply filters conditionally
        if position:
            query = query.filter(Profile.position.ilike(f"%{position}%"))
            
        if skill:
            # Case-insensitive substring match over the JSON list, portable
            # across SQLite and PostgreSQL. `.contains([skill])` was exact-case
            # only (and required PostgreSQL JSONB), so "UNDERWATER" missed
            # "Underwater Inspection".
            query = query.filter(
                cast(Profile.skills, String).ilike(f"%{skill}%")
            )
            
        if port:
            query = query.filter(Profile.ports_served.contains([port]))
            
        if verification_status:
            query = query.filter(Profile.verification_status == verification_status)
            
        if min_experience is not None:
            query = query.filter(Profile.years_experience >= min_experience)
            
        # Count total records for pagination metadata
        total = query.count()
        pages = math.ceil(total / limit) if limit > 0 else 1
        
        # Apply offset and limit
        offset = (page - 1) * limit
        profiles = query.offset(offset).limit(limit).all()
        
        return profiles, total, page, pages
    


    @staticmethod
    def search_suppliers(
        db: Session,
        page: int = 1,
        limit: int = 20,
        skill: Optional[str] = None,
        port: Optional[str] = None,
        verification_status: Optional[VerificationStatus] = None
    ) -> Tuple[List[Profile], int, int, int]:

        query = (
            db.query(Profile)
            .options(joinedload(Profile.user), selectinload(Profile.services))
            .join(User, Profile.user_id == User.id)
            .filter(
                User.role == UserRole.supplier,
                Profile.verification_status == VerificationStatus.verified,
            )
        )

        if skill:
            query = query.filter(
                cast(Profile.skills, String).ilike(f"%{skill}%")
            )

        if port:
            query = query.filter(
                Profile.ports_served.contains([port])
            )

        if verification_status:
            query = query.filter(
                Profile.verification_status == verification_status
            )

        total = query.count()

        pages = math.ceil(total / limit) if limit > 0 else 1

        offset = (page - 1) * limit

        profiles = query.offset(
            offset
        ).limit(
            limit
        ).all()

        return profiles, total, page, pages
    




    @staticmethod
    def verify_profile(
        db: Session,
        profile_id: uuid.UUID,
        reviewer: Optional[User] = None,
    ) -> Profile:

        profile = db.query(Profile).filter(
            Profile.id == profile_id
        ).first()

        if not profile:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Profile not found"
            )

        profile.verification_status = VerificationStatus.verified

        user = db.query(User).filter(User.id == profile.user_id).first()

        if user.role == UserRole.supplier:
            profile.badge_label = "VERIFIED SUPPLIER"
        elif user.role == UserRole.provider:
            profile.badge_label = "VERIFIED PROVIDER"
        else:
            profile.badge_label = "VERIFIED"

        # Reviewer + decision time on the profile, plus the append-only audit
        # row that is the authoritative history. Approving clears a previous
        # rejection reason so the account does not keep showing a stale one.
        now = datetime.utcnow()
        meta = dict(profile.profile_metadata or {})
        meta["verification_state"] = "approved"
        meta["verification_decided_at"] = now.isoformat()
        meta.pop("verification_reason", None)
        if reviewer is not None:
            meta["verification_decided_by"] = str(reviewer.id)
        profile.profile_metadata = meta

        record_decision(
            db,
            entity_type=ENTITY_PROFILE,
            entity_id=profile.id,
            admin=reviewer,
            action=ACTION_APPROVED,
        )

        NotificationService.create_notification(
            db=db,
            user_id=profile.user_id,
            title="Profile Verified",
            message="Congratulations! Your profile has been verified.",
            notification_type=NotificationType.verification
        )

        db.commit()
        db.refresh(profile)

        return profile