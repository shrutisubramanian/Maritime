"""Idempotently seed the service categories from the canonical catalogue.

Run from ``nhaav-backend`` with:

    python -m app.seed_services

The runtime source of truth is the ``service_categories`` table. This script only
makes the table match the catalogue defined in ``app.service_catalogue``; it
never deletes existing rows, so legacy service names survive an upgrade.
"""

from app.database import SessionLocal
from app.models.service_category import ServiceCategory
from app.service_catalogue import SERVICE_CATALOGUE

db = SessionLocal()

try:
    existing = {
        row.name: row for row in db.query(ServiceCategory).all()
    }

    for group, service_names in SERVICE_CATALOGUE:
        for name in service_names:
            row = existing.get(name)
            if row is None:
                row = ServiceCategory(name=name, category_group=group)
                db.add(row)
                existing[name] = row
            else:
                row.category_group = group

    db.commit()
    print("Services seeded.")
finally:
    db.close()
