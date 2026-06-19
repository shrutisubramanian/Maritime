from app.database import SessionLocal
from app.models.service_category import ServiceCategory

db = SessionLocal()

services = [

    ("Motor Rewinding", "Repairs"),
    ("Electrical Repairs", "Repairs"),
    ("Electronic Equipment Repairs", "Repairs"),
    ("A/C Reefer Container Repairs", "Repairs"),
    ("Hydraulic Repairs", "Repairs"),

    ("Cargo Survey", "Inspections"),
    ("Draft Survey", "Inspections"),
    ("Vessel Inspection", "Inspections"),
    ("BIS Survey", "Inspections"),
    ("IRS Survey", "Inspections"),

    ("General Cleaning", "Cleaning"),
    ("Cargo Tank Cleaning", "Cleaning"),

    ("Bunker Testing", "Marine Operations"),
    ("Fresh Water Supply", "Marine Operations"),
    ("Ship Security Services", "Marine Operations"),
    ("STS Service", "Marine Operations"),

    ("Cargo Gear Services", "Marine Operations"),
    ("Lifeboat Services", "Marine Operations"),
    ("Fire Fighting Appliance Servicing", "Marine Operations"),
]

for name, group in services:

    exists = db.query(ServiceCategory).filter(
        ServiceCategory.name == name
    ).first()

    if not exists:
        db.add(
            ServiceCategory(
                name=name,
                category_group=group
            )
        )

db.commit()

print("Services seeded.")