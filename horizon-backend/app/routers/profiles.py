import uuid
from typing import Optional
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.middleware.auth_guard import get_current_user
from app.models.user import User
from app.models.profile import VerificationStatus
from app.schemas.profile import ProfileCreate, ProfileUpdate, ProfileResponse, ProfilePaginatedResponse
from app.services.profile_service import ProfileService

router = APIRouter(
    prefix="/profiles",
    tags=["Profiles"]
)

# -----------------------------------------------------------------------------
# Routes
# -----------------------------------------------------------------------------

@router.post("/", response_model=ProfileResponse, status_code=status.HTTP_201_CREATED,
             summary="Create a new profile", response_description="The newly created profile.")
def create_profile(
    profile_data: ProfileCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Create a profile for the currently authenticated user.
    
    **Dependency Injection Flow**:
    1. `get_current_user` extracts the JWT token, validates it, and injects the `User` object.
    2. `get_db` injects a database session.
    3. The request body is validated against `ProfileCreate`.
    4. Passes the validated data, DB session, and the user's ID to `ProfileService`.
    """
    return ProfileService.create_profile(db=db, user_id=current_user.id, profile_data=profile_data)


@router.get("/me", response_model=ProfileResponse, summary="Get your own profile")
def get_my_profile(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Retrieve the profile of the currently authenticated user.
    
    **Request Flow**:
    1. Authenticates the user via the `get_current_user` dependency.
    2. Calls `ProfileService.get_profile_by_user_id` using the injected user's ID.
    3. Automatically serializes the ORM object into a `ProfileResponse` JSON.
    """
    return ProfileService.get_profile_by_user_id(db=db, user_id=current_user.id)


@router.put("/me", response_model=ProfileResponse, summary="Update your own profile")
def update_my_profile(
    update_data: ProfileUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Update the profile of the currently authenticated user.
    Supports partial updates (only fields provided in the payload will be modified).
    
    **Security Note**: 
    Users can ONLY update their own profile because the `user_id` passed to the service 
    is strictly extracted from the authenticated `current_user.id` from the JWT token.
    """
    return ProfileService.update_profile(db=db, user_id=current_user.id, update_data=update_data)


@router.get("/providers", response_model=ProfilePaginatedResponse, summary="Search Provider Marketplace")
def search_providers(
    page: int = Query(1, ge=1, description="Page number"),
    limit: int = Query(20, ge=1, le=100, description="Items per page"),
    position: Optional[str] = Query(None, description="Filter by job title or position"),
    skill: Optional[str] = Query(None, description="Filter by specific skill"),
    port: Optional[str] = Query(None, description="Filter by port served"),
    verification_status: Optional[VerificationStatus] = Query(None, description="Filter by verification status"),
    min_experience: Optional[int] = Query(None, ge=0, description="Minimum years of experience"),
    db: Session = Depends(get_db)
):
    """
    Search and filter public provider profiles.
    
    **Features**:
    - Returns paginated results wrapping the profile data array.
    - Efficiently filters JSONB fields (skills, ports_served) using PostgreSQL operators.
    - Joins with the User model to ensure only users with role='provider' appear in results.
    """
    profiles, total, page, pages = ProfileService.search_providers(
        db=db, page=page, limit=limit, position=position, skill=skill, 
        port=port, verification_status=verification_status, min_experience=min_experience
    )
    
    return {
        "data": profiles,
        "total": total,
        "page": page,
        "pages": pages
    }





@router.get(
    "/suppliers",
    response_model=ProfilePaginatedResponse,
    summary="Search Supplier Marketplace"
)
def search_suppliers(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    skill: Optional[str] = None,
    port: Optional[str] = None,
    verification_status: Optional[VerificationStatus] = None,
    db: Session = Depends(get_db)
):

    profiles, total, page, pages = (
        ProfileService.search_suppliers(
            db=db,
            page=page,
            limit=limit,
            skill=skill,
            port=port,
            verification_status=verification_status
        )
    )

    return {
        "data": profiles,
        "total": total,
        "page": page,
        "pages": pages
    }


@router.put(
    "/{profile_id}/verify",
    response_model=ProfileResponse,
    summary="Verify a profile"
)
def verify_profile(
    profile_id: uuid.UUID,
    db: Session = Depends(get_db)
):
    return ProfileService.verify_profile(
        db=db,
        profile_id=profile_id
    )




@router.get("/{profile_id}", response_model=ProfileResponse, summary="Get a profile by ID")
def get_profile_by_id(
    profile_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Retrieve a profile by its UUID.
    Must be authenticated to view other users' profiles.
    
    **Request Flow**:
    1. Validates the `profile_id` path parameter as a valid UUID.
    2. Uses `ProfileService` to query the database.
    3. If the profile doesn't exist, the service throws a 404.
    """
    return ProfileService.get_profile_by_id(db=db, profile_id=profile_id)
