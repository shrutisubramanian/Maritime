import uuid
from typing import List

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.middleware.auth_guard import get_current_user
from app.models.user import User
from app.schemas.review import (
    ReviewCreate,
    ReviewResponse
)
from app.services.review_service import ReviewService

router = APIRouter(
    prefix="/reviews",
    tags=["Reviews"]
)


@router.post("/", response_model=ReviewResponse)
def create_review(
    review_data: ReviewCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    return ReviewService.create_review(
        db=db,
        review_data=review_data,
        reviewer_id=current_user.id
    )


@router.get(
    "/provider/{provider_id}",
    response_model=List[ReviewResponse]
)
def get_provider_reviews(
    provider_id: uuid.UUID,
    db: Session = Depends(get_db)
):
    return ReviewService.get_reviews_for_user(
        db=db,
        user_id=provider_id
    )