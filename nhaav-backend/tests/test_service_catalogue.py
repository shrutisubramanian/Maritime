"""The service catalogue is one shared list, not a frontend-only constant."""

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.models.service_category import ServiceCategory
from app.models.vendor_category import VendorCategory, VendorType
from app.routers.service_categories import get_grouped_categories
from app.service_catalogue import (
    ALL_SERVICE_NAMES,
    SERVICE_CATALOGUE,
    SERVICE_GROUP_ORDER,
)
from app.services.vendor_taxonomy_service import VendorTaxonomyService

REQUIRED_GROUPS = {
    "Ship Repair & Services",
    "Inspections & Surveys",
    "Cleaning / Port / Marine Support",
    "General Ship Repairs / Marine Services",
}

REQUIRED_SERVICES = {
    "Machinery Repairs",
    "Workshop Repairs",
    "A/C Repairs",
    "Hydraulic Repairs",
    "Cathodic Protection and MGS",
    "Motor Rewinding",
    "A/C / Cooler Repairs of Reefer Containers",
    "Electrical Repairs",
    "Electronic Equipment Repairs & Service",
    "Approved Service Technician",
    "Fumigation & Disinfecting Services",
    "Underwater Hull Services",
    "Magnetic Compass Adjustments",
    "BIS and IRS Surveys",
    "Cargo Survey",
    "Draft Survey",
    "Vessel Inspections",
    "3rd Party Inspections",
    "General Cleaning Services",
    "Cargo Tank Cleaning Expertise",
    "Deslopping and Desludging Services",
    "Bunker Suppliers",
    "Bunker Testing – Accredited Labs",
    "Launch Boat & Ferry Service Provider",
    "Ship Security Services",
    "STS Service Providers",
    "General Ship Repairs",
    "Steel & Pipe Line Fabrication Works",
    "Lifeboat & Rescue Boat Services",
    "Cargo Gear Services",
    "Life Saving Appliances Servicing",
    "Fire Fighting Appliances Servicing",
    "Crane Lifting Services",
    "Garbage Disposal Services",
    "Fresh Water Supply",
}


def _db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    return sessionmaker(bind=engine)()


def test_catalogue_has_unique_names_and_all_requested_services():
    assert len(ALL_SERVICE_NAMES) == len(set(ALL_SERVICE_NAMES))
    assert REQUIRED_GROUPS <= set(SERVICE_GROUP_ORDER)
    assert REQUIRED_SERVICES <= set(ALL_SERVICE_NAMES)


def test_existing_service_values_are_still_present():
    assert {
        "Hydraulic Repairs",
        "Electrical Repairs",
        "Ship Security Services",
        "Main Engine Overhaul",
        "Underwater Hull Cleaning",
        "BIS & IRS Class Surveys",
        "Lifeboat & FFA Appliance Servicing",
    } <= set(ALL_SERVICE_NAMES)


def test_grouped_endpoint_returns_the_canonical_order():
    db = _db()
    for group, names in SERVICE_CATALOGUE:
        for name in names:
            db.add(ServiceCategory(name=name, category_group=group))
    db.commit()

    grouped = get_grouped_categories(db)

    assert list(grouped) == list(SERVICE_GROUP_ORDER)
    assert grouped["Ship Repair & Services"][0]["name"] == "A/C / Cooler Repairs of Reefer Containers"
    assert {row["name"] for row in grouped["Inspections & Surveys"]} == {
        "3rd Party Inspections",
        "BIS and IRS Surveys",
        "Cargo Survey",
        "Draft Survey",
        "Vessel Inspections",
    }
    db.close()


def test_provider_dropdown_uses_the_same_groups_and_retires_unassigned_legacy():
    db = _db()
    for group, names in SERVICE_CATALOGUE:
        for name in names:
            db.add(ServiceCategory(name=name, category_group=group))
    legacy = VendorCategory(
        vendor_type=VendorType.provider,
        name="Legacy Repairs",
        sort_order=0,
    )
    db.add(legacy)
    db.commit()

    VendorTaxonomyService.ensure_seeded(db)
    categories = VendorTaxonomyService.categories(db, VendorType.provider)
    names = {category.name for category in categories}

    assert REQUIRED_GROUPS <= names
    assert "Legacy Repairs" not in names
    assert db.get(VendorCategory, legacy.id).is_active is False
    db.close()
