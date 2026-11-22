from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.service_category import ServiceCategory
from app.service_catalogue import SERVICE_GROUP_ORDER

router = APIRouter(
    prefix="/service-categories",
    tags=["Service Categories"]
)


def _group_sort_key(group_name: str) -> tuple[int, str]:
    """Known catalogue groups first, in catalogue order; extras alphabetically."""
    try:
        return (SERVICE_GROUP_ORDER.index(group_name), "")
    except ValueError:
        return (len(SERVICE_GROUP_ORDER), group_name.lower())


@router.get("/")
def get_categories(
    db: Session = Depends(get_db)
):
    return db.query(ServiceCategory).all()


@router.get("/grouped")
def get_grouped_categories(
    db: Session = Depends(get_db)
):
    """The single catalogue consumed by the Services page and provider forms.

    Every group comes from the ``service_categories`` table, not from a second
    frontend list. Known groups are returned in catalogue order; any extra rows
    an administrator added are appended alphabetically rather than hidden.
    """
    categories = db.query(ServiceCategory).all()

    grouped: dict[str, list[dict]] = {}

    for category in sorted(categories, key=lambda row: row.name.lower()):
        grouped.setdefault(category.category_group, []).append(
            {
                "id": str(category.id),
                "name": category.name
            }
        )

    return {
        group: grouped[group]
        for group in sorted(grouped, key=_group_sort_key)
    }
