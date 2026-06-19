from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.service_category import ServiceCategory

router = APIRouter(
    prefix="/service-categories",
    tags=["Service Categories"]
)


@router.get("/")
def get_categories(
    db: Session = Depends(get_db)
):
    return db.query(ServiceCategory).all()


@router.get("/grouped")
def get_grouped_categories(
    db: Session = Depends(get_db)
):
    categories = db.query(ServiceCategory).all()

    grouped = {}

    for category in categories:

        if category.category_group not in grouped:
            grouped[category.category_group] = []

        grouped[category.category_group].append(
            {
                "id": str(category.id),
                "name": category.name
            }
        )

    return grouped