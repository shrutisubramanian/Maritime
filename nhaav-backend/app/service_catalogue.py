"""Canonical Nhaav service catalogue.

This is the seed input for the ``service_categories`` table. The database is the
runtime source of truth: the Services page and every provider selector read the
catalogue from ``/service-categories/grouped``. Keeping the seed data here lets a
fresh install, the data migration, and the admin seeding script agree without a
second hand-maintained dropdown list.

Service names must be globally unique because ``ServiceCategory.name`` is unique.
Where an old value and a new value are exact duplicates, the value lives once
under the new canonical group. Different spellings are intentionally kept as
separate values until the business asks for a rename.
"""

from typing import Final

#: (group name, service names) in display order.
SERVICE_CATALOGUE: Final[tuple[tuple[str, tuple[str, ...]], ...]] = (
    (
        "Ship Repair & Services",
        (
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
        ),
    ),
    (
        "Inspections & Surveys",
        (
            "BIS and IRS Surveys",
            "Cargo Survey",
            "Draft Survey",
            "Vessel Inspections",
            "3rd Party Inspections",
        ),
    ),
    (
        "Cleaning / Port / Marine Support",
        (
            "General Cleaning Services",
            "Cargo Tank Cleaning Expertise",
            "Deslopping and Desludging Services",
            "Bunker Suppliers",
            "Bunker Testing – Accredited Labs",
            "Launch Boat & Ferry Service Provider",
            "Ship Security Services",
            "STS Service Providers",
            # Preserved legacy values that have no other canonical home.
            "General Cleaning",
            "Cargo Tank Cleaning",
        ),
    ),
    (
        "General Ship Repairs / Marine Services",
        (
            "General Ship Repairs",
            "Steel & Pipe Line Fabrication Works",
            "Lifeboat & Rescue Boat Services",
            "Cargo Gear Services",
            "Life Saving Appliances Servicing",
            "Fire Fighting Appliances Servicing",
            # Preserved legacy singular spelling; the requested plural value is
            # above and is not a silent rename of this stored row.
            "Fire Fighting Appliance Servicing",
            "Crane Lifting Services",
            "Garbage Disposal Services",
            "Fresh Water Supply",
        ),
    ),
    # Existing service categories preserved below.
    (
        "Repairs & Maintenance",
        (
            "Main Engine Overhaul",
            "Machinery & Deck Repair",
            "Propeller & Shaft Alignment",
            "Steel & Pipeline Fabrication",
            "Electronic Equipment Repairs",
            "A/C Reefer Container Repairs",
        ),
    ),
    (
        "Hull & Underwater",
        (
            "Underwater Hull Cleaning",
            "Underwater Inspection (UWILD)",
            "Propeller Polishing",
            "Cathodic Protection Servicing",
        ),
    ),
    (
        "Inspection & Survey",
        (
            "BIS & IRS Class Surveys",
            "Dry Cargo & Bulk Survey",
            "Draft & Cargo Survey",
            "Chemical & Gas Tanker Inspection",
            "BIS Survey",
            "IRS Survey",
            "Vessel Inspection",
        ),
    ),
    (
        "Marine Safety & Appliances",
        (
            "Lifeboat & FFA Appliance Servicing",
            "Fire Safety Inspection",
            "Rescue Boat Maintenance",
            "Lifeboat Services",
        ),
    ),
    (
        "HVAC & Refrigeration",
        (
            "Reefer Container Maintenance",
            "Shipboard HVAC & Chiller Servicing",
        ),
    ),
    (
        "Fuel and Bunkering",
        (
            "Bunker Fuel Quality Survey",
            "Bunker Delivery & Tank Calibration",
            "Bunker Testing",
        ),
    ),
    (
        "Security & Logistics",
        (
            "Launch Boat & Ferry Service",
            "STS (Ship-to-Ship) Transfer Logistics",
            "STS Service",
        ),
    ),
)

#: Values kept only so records that already stored them stay valid. They are
#: not offered in pickers or the Excel template, which use the canonical names.
LEGACY_SERVICE_NAMES: Final[tuple[str, ...]] = (
    "Decking & Desludging Services",
    "General Cleaning",
    "Cargo Tank Cleaning",
    "Fire Fighting Appliance Servicing",
)

#: Group names in catalogue display order.
SERVICE_GROUP_ORDER: Final[tuple[str, ...]] = tuple(
    group for group, _services in SERVICE_CATALOGUE
)

#: Every canonical service name, flattened.
ALL_SERVICE_NAMES: Final[tuple[str, ...]] = tuple(
    name for _group, services in SERVICE_CATALOGUE for name in services
)
