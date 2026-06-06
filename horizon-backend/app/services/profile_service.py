import uuid
import math
from typing import Optional, List, Tuple
from sqlalchemy.orm import Session
from fastapi import HTTPException, status

from app.models.profile import Profile, VerificationStatus
from app.models.user import User, UserRole
from app.schemas.profile import ProfileCreate, ProfileUpdate

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
        db_profile = Profile(
            user_id=user_id,
            **profile_data.model_dump()
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
    def get_profile_by_id(db: Session, profile_id: uuid.UUID) -> Profile:
        """
        Retrieves a profile by its own primary key.
        Useful for public profile viewing by other users or clients.
        """
        profile = db.query(Profile).filter(Profile.id == profile_id).first()
        if not profile:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, 
                detail="Profile not found"
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
            
        # 2. Extract only the fields that were actually set in the incoming request
        # exclude_unset=True is crucial! It ensures we don't accidentally overwrite 
        # existing database values with None just because a field was omitted from the PATCH request.
        update_dict = update_data.model_dump(exclude_unset=True)
        
        # 3. Apply the updates dynamically
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
        # Base query: Join Profile with User to filter only users with role='provider'
        query = db.query(Profile).join(User, Profile.user_id == User.id).filter(User.role == UserRole.provider)
        
        # Apply filters conditionally
        if position:
            query = query.filter(Profile.position.ilike(f"%{position}%"))
            
        if skill:
            # SQLAlchemy's .contains() on a JSONB column translates to the @> operator in Postgres
            # We wrap the skill string in a list so it generates JSONB '["skill_name"]'
            query = query.filter(Profile.skills.contains([skill]))
            
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
