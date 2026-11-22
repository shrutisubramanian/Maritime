
import uuid
from sqlalchemy.orm import Session

from app.models.job import Job, JobStatus
from app.models.review import Review
from app.models.profile import Profile
from app.schemas import profile
from app.schemas.review import ReviewCreate
from app.services.notification_service import NotificationService
from app.models.notification import NotificationType


class ReviewService:

    @staticmethod
    def create_review(
        db: Session,
        review_data: ReviewCreate,
        reviewer_id: uuid.UUID
    ):

        job = db.query(Job).filter(
            Job.id == review_data.job_id
        ).first()

        if not job:
            raise ValueError("Job not found")

        if job.status != JobStatus.completed:
            raise ValueError(
                "Job must be completed before review"
            )

        if job.request.client_id != reviewer_id:
            raise ValueError(
                "Only the client can review the provider"
            )

        existing_review = db.query(Review).filter(
            Review.job_id == review_data.job_id
        ).first()

        if existing_review:
            raise ValueError(
                "Review already exists"
            )

        profile = db.query(Profile).filter(
            Profile.user_id == job.provider_id
        ).first()

        if not profile:
            raise ValueError(
                "Provider profile not found"
            )

        review = Review(
            job_id=job.id,
            reviewer_id=reviewer_id,
            reviewed_user_id=job.provider_id,
            rating=review_data.rating,
            comment=review_data.comment
        )

        db.add(review)

        total_rating = (
            profile.rating_avg *
            profile.jobs_completed
        ) + review_data.rating

        profile.jobs_completed += 1

        profile.rating_avg = (
            total_rating /
            profile.jobs_completed
        )

        db.commit()
        db.refresh(review)

        NotificationService.create_notification(
            db=db,
            user_id=job.provider_id,
            title="New Review Received",
            message=f"You received a {review_data.rating}-star review for the job.",
            notification_type=NotificationType.review
        )
        # The session runs with autoflush=False: a notification staged after the
        # commit above is never flushed, so commit it here or the provider is
        # never told about the review.
        db.commit()

        return review

    @staticmethod
    def get_reviews_for_user(
        db: Session,
        user_id: uuid.UUID
    ):
        return db.query(Review).filter(
            Review.reviewed_user_id == user_id
        ).all()
    

    @staticmethod
    def recalculate_provider_rating(
        db: Session,
        provider_id: uuid.UUID
    ):
        reviews = db.query(Review).filter(
            Review.reviewed_user_id == provider_id
        ).all()

        profile = db.query(Profile).filter(
            Profile.user_id == provider_id
        ).first()

        if not profile:
            raise ValueError("Profile not found")

        if not reviews:
            profile.rating_avg = 0
            profile.jobs_completed = 0
        else:
            profile.jobs_completed = len(reviews)

            profile.rating_avg = (
                sum(r.rating for r in reviews)
                / len(reviews)
            )
        db.commit()

        return profile