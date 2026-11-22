"""
Seed extra demo companies for the marketplace walkthrough video.

Run with:
    cd nhaav-backend
    ENVIRONMENT=development .venv/Scripts/python.exe seed_marketplace_cards.py

These are FAKE companies for a screen recording, not real vendors. Each one gets
the state the marketplace actually requires to appear: an approved (verified)
company profile with a primary category, declared capabilities, a head-office
port, and live approved listings inside a paid window — which is what grants
discovery through the legacy-listing path of ProfileVisibilityService.

Every listing is priced NULL on purpose, so the cards read "Starting price TBC"
while the pricing conversation is still open. Nothing here touches pricing,
auth, matching or production; it only inserts development rows.

Idempotent: a company with the same demo e-mail is deleted and re-created, so a
re-run restores exactly these companies and no duplicates.
"""
from __future__ import annotations

import os
import uuid
from datetime import datetime, timedelta

from app.database import SessionLocal
from app.models.profile import AvailabilityStatus, Profile, VerificationStatus
from app.models.profile_visibility import ProfileVisibility
from app.models.service import Service, ServiceListingStatus
from app.models.supply_listing import SupplyListing, SupplyListingStatus
from app.models.user import User, UserRole
from app.models.vendor_category import ProfileSubcategory, VendorCategory, VendorSubcategory
from app.utils.password import hash_password

PASSWORD = "Demo@123"
DOMAIN = "demo@nhaavmaritime.com"
NOW = datetime.utcnow()
WINDOW_DAYS = 365

# name, category, head_office, ports, bio, years, rating, jobs, [(service, subcategory)]
PROVIDERS = [
    (
        "Mumbai Marine Docks", "Ship Repair & Services", "Mumbai",
        ["Mumbai", "JNPT"], "Afloat repair yard working the Mumbai and JNPT berths. "
        "Hydraulic, electrical and workshop repairs with a 12-hour mobilisation window.",
        19, 4.7, 186,
        [("Hydraulic Hatch Cover Repairs", "Hydraulic Repairs"),
         ("Motor Rewinding & Electrical Rewiring", "Motor Rewinding")],
    ),
    (
        "Seaward Underwater Solutions", "Hull & Underwater", "Cochin",
        ["Cochin", "New Mangalore"], "Class-approved dive contractor for in-water hull "
        "cleaning, propeller polishing and UWILD inspections along the west coast.",
        14, 4.8, 132,
        [("Underwater Hull Cleaning", "Underwater Hull Cleaning"),
         ("Propeller Polishing", "Propeller Polishing"),
         ("Underwater Inspection (UWILD)", "Underwater Inspection (UWILD)")],
    ),
    (
        "Kleanhold Tank Services", "Cleaning / Port / Marine Support", "Kandla",
        ["Kandla", "Mundra"], "Cargo tank cleaning, desludging and hold preparation for "
        "tankers and bulk carriers at the Gulf of Kutch terminals.",
        11, 4.5, 98,
        [("Cargo Tank Cleaning", "Cargo Tank Cleaning"),
         ("Hold & Deck General Cleaning", "General Cleaning")],
    ),
    (
        "Meridian Inspection Bureau", "Inspections & Surveys", "Chennai",
        ["Chennai", "Ennore"], "Draft, cargo and vessel inspections with photo-backed "
        "reports, working the Chennai and Ennore anchorages.",
        16, 4.6, 210,
        [("Draft & Cargo Survey", "Cargo Survey"),
         ("Vessel Condition Inspection", "Vessel Inspections")],
    ),
    (
        "Accurate Classification Services", "Inspection & Survey", "Visakhapatnam",
        ["Visakhapatnam", "Kakinada"], "BIS and IRS class survey attendance, tanker "
        "inspection and condition assessment on the east coast.",
        13, 4.4, 76,
        [("BIS & IRS Class Surveys", "BIS & IRS Class Surveys"),
         ("Vessel Inspection", "Vessel Inspection")],
    ),
    (
        "Bunkersure Testing Labs", "Fuel and Bunkering", "Paradip",
        ["Paradip", "Dhamra"], "Independent bunker quantity and quality surveys with "
        "accredited laboratory analysis and a 24-hour BQS report.",
        9, 4.7, 141,
        [("Bunker Fuel Quality Survey", "Bunker Fuel Quality Survey"),
         ("Bunker Testing", "Bunker Testing")],
    ),
    (
        "Anchor Marine Logistics", "Security & Logistics", "JNPT",
        ["JNPT", "Mumbai"], "Launch boat, ferry and ship-to-ship transfer logistics for "
        "crews and stores inside Mumbai harbour.",
        12, 4.3, 88,
        [("Launch Boat & Ferry Service", "Launch Boat & Ferry Service"),
         ("STS Transfer Logistics", "STS (Ship-to-Ship) Transfer Logistics")],
    ),
    (
        "Titan Safety Systems", "Marine Safety & Appliances", "Kolkata",
        ["Kolkata", "Haldia"], "Lifeboat, davit and fire-fighting appliance servicing "
        "with certificates issued on board at the Hooghly terminals.",
        17, 4.6, 164,
        [("Lifeboat & Davit Servicing", "Lifeboat Services"),
         ("Fire Safety Inspection", "Fire Safety Inspection")],
    ),
    (
        "Coolflow Reefer Engineering", "HVAC & Refrigeration", "Mundra",
        ["Mundra", "Kandla"], "Reefer container machinery and shipboard chiller servicing "
        "by F-gas certified engineers, 24/7 at Mundra.",
        10, 4.5, 112,
        [("Reefer Container Maintenance", "Reefer Container Maintenance"),
         ("Shipboard HVAC & Chiller Servicing", "Shipboard HVAC & Chiller Servicing")],
    ),
    (
        "Deccan Marine Works", "Repairs & Maintenance", "Mumbai",
        ["Mumbai", "Mormugao"], "Machinery and deck repair crew for main engine overhauls, "
        "pump and winch work, with OEM spares sourcing.",
        21, 4.8, 243,
        [("Machinery & Deck Repair", "Machinery & Deck Repair"),
         ("Main Engine Overhaul", "Main Engine Overhaul")],
    ),
    (
        "Coastal Gear & Fabrication", "General Ship Repairs / Marine Services", "Mormugao",
        ["Mormugao", "Karwar"], "Cargo gear surveys, steel fabrication and pipeline work "
        "from a workshop at Mormugao.",
        15, 4.4, 97,
        [("Cargo Gear Services", "Cargo Gear Services"),
         ("Steel & Pipe Line Fabrication", "Steel & Pipe Line Fabrication Works")],
    ),
]

# name, category, head_office, ports, bio, years, rating, jobs, [(listing, subcategory)]
SUPPLIERS = [
    (
        "Malabar Ship Chandlers", "Ship Chandlers", "Cochin",
        ["Cochin", "Kozhikode"], "Deck, engine and cabin stores delivered to the berth "
        "within 24 hours across Kerala ports.",
        12, 4.6, 143,
        [("Mooring Rope 64mm 8-Strand Coil", "Mooring & Towing"),
         ("Galley & Cabin Stores Set", "Cabin Stores")],
    ),
    (
        "Enginepart Marine Trading", "Engine Stores", "Mumbai",
        ["Mumbai", "JNPT"], "OEM engine spares for two-stroke and four-stroke propulsion, "
        "stocked in Mumbai.",
        18, 4.7, 205,
        [("Piston Ring Set 6S50MC", "Engine Spares"),
         ("Fuel Injection Nozzle Assembly", "Fuel System")],
    ),
    (
        "Coastal Coatings Supply", "Paints", "Mumbai",
        ["Mumbai", "Kandla"], "IMO PSPC compliant deck and hull coating systems with "
        "batch certificates.",
        10, 4.5, 121,
        [("Epoxy Primer Kit 20L", "Coatings"),
         ("Antifouling Paint 20L", "Antifouling")],
    ),
    (
        "Safeguard Marine Equipment", "Safety Equipment", "Kandla",
        ["Kandla", "Mundra"], "SOLAS life-saving and fire-fighting equipment with "
        "class certificates.",
        14, 4.4, 89,
        [("Immersion Suit Adult", "LSA"),
         ("Lifebuoy with Self-Igniting Light", "LSA")],
    ),
    (
        "Spareline Marine Parts", "Spare Parts Suppliers", "Chennai",
        ["Chennai", "Ennore"], "Pump, compressor and purifier spares for the east coast "
        "fleet, ex-stock Chennai.",
        9, 4.3, 74,
        [("Sea Water Pump Impeller", "Pump Spares"),
         ("Air Compressor Valve Kit", "Compressor Spares")],
    ),
    (
        "Seaweed Provisions Supply", "Provisions", "Kolkata",
        ["Kolkata", "Haldia"], "Dry, frozen and fresh provisions for crew changes at "
        "the Hooghly terminals.",
        8, 4.5, 96,
        [("Dry Provisions Pack — 30 Crew", "Dry Provisions"),
         ("Frozen Meat Consignment", "Frozen Provisions")],
    ),
    (
        "Voltmarine Electricals", "Electrical Equipment", "Visakhapatnam",
        ["Visakhapatnam", "Kakinada"], "Marine cable, navigation lights and switchgear "
        "with MED-approved documentation.",
        11, 4.6, 108,
        [("Navigation Light Assembly LED", "Navigation"),
         ("Marine Cable 2.5 sq mm", "Cabling")],
    ),
    (
        "Harbour Tools & Consumables", "Tools & Consumables", "Paradip",
        ["Paradip", "Dhamra"], "Chain blocks, rigging and welding consumables delivered "
        "to the Paradip anchorage.",
        7, 4.2, 63,
        [("Chain Block 5 Tonne", "Rigging"),
         ("Welding Electrodes E7018", "Welding Consumables")],
    ),
]


def _email(company: str) -> str:
    slug = "".join(ch for ch in company.lower() if ch.isalnum())
    return f"{slug}.{DOMAIN}"


def _purge_existing(db, email: str) -> None:
    """Delete a previous run of the same demo company, children first."""
    user = db.query(User).filter(User.email == email).first()
    if user is None:
        return
    profile = db.query(Profile).filter(Profile.user_id == user.id).first()
    if profile is not None:
        db.query(ProfileVisibility).filter(ProfileVisibility.profile_id == profile.id).delete(
            synchronize_session=False
        )
        db.query(ProfileSubcategory).filter(
            ProfileSubcategory.profile_id == profile.id
        ).delete(synchronize_session=False)
    db.query(Service).filter(Service.provider_id == user.id).delete(synchronize_session=False)
    db.query(SupplyListing).filter(SupplyListing.supplier_id == user.id).delete(
        synchronize_session=False
    )
    if profile is not None:
        db.delete(profile)
    db.flush()
    db.delete(user)
    db.flush()


def _category(db, vendor_type: str, name: str) -> VendorCategory:
    row = (
        db.query(VendorCategory)
        .filter(VendorCategory.name == name, VendorCategory.vendor_type == vendor_type)
        .first()
    )
    if row is None:
        raise SystemExit(f"category not found for {vendor_type}: {name!r}")
    return row


def _subcategory(db, category: VendorCategory, name: str) -> VendorSubcategory | None:
    return (
        db.query(VendorSubcategory)
        .filter(VendorSubcategory.category_id == category.id, VendorSubcategory.name == name)
        .first()
    )


def _create_company(db, name, role, category_name, head_office, ports, bio, years, rating, jobs,
                    declared) -> Profile:
    email = _email(name)
    _purge_existing(db, email)
    category = _category(db, role.value, category_name)

    user = User(
        id=uuid.uuid4(),
        email=email,
        password_hash=hash_password(PASSWORD),
        role=role,
        full_name=name,
        phone="+91 90000 00000",
        is_verified=True,
        access_control_enabled=False,
    )
    db.add(user)
    db.flush()

    profile = Profile(
        id=uuid.uuid4(),
        user_id=user.id,
        position="Operations Head",
        company_name=name,
        bio=bio,
        years_experience=years,
        primary_category_id=category.id,
        country="India",
        head_office=head_office,
        ports_served=ports,
        service_areas=ports,
        verification_status=VerificationStatus.verified,
        availability_status=AvailabilityStatus.available,
        rating_avg=rating,
        jobs_completed=jobs,
        social_links=None,
    )
    db.add(profile)
    db.flush()

    for sub_name in declared:
        sub = _subcategory(db, category, sub_name)
        if sub is None:
            print(f"  ! subcategory missing, skipped: {category_name} / {sub_name}")
            continue
        db.add(ProfileSubcategory(profile_id=profile.id, subcategory_id=sub.id))
    db.flush()
    return profile


def _live_service(db, provider: Profile, category: VendorCategory, service_name, sub_name, ports):
    db.add(
        Service(
            id=uuid.uuid4(),
            provider_id=provider.user_id,
            name=service_name,
            service_id=service_name.lower().replace(" & ", "-").replace(" ", "-"),
            port_id=ports[0] if ports else None,
            category=category.name,
            subcategory=sub_name,
            description=f"{service_name} delivered at {ports[0]} and nearby ports, "
                        "quoted per request.",
            pricing_model="Fixed price",
            price_paise=None,
            price_note="per job",
            is_active=True,
            status=ServiceListingStatus.approved,
            published_at=NOW,
            expires_at=NOW + timedelta(days=WINDOW_DAYS),
            created_at=NOW - timedelta(days=30),
        )
    )


def _live_supply(db, supplier: Profile, category: VendorCategory, listing_name, sub_name, ports):
    db.add(
        SupplyListing(
            id=uuid.uuid4(),
            supplier_id=supplier.user_id,
            name=listing_name,
            category=category.name,
            subcategory=sub_name,
            description=f"{listing_name} supplied from {ports[0]}, quoted per request.",
            condition="oem",
            country_of_origin="India",
            availability="in_stock",
            price_paise=None,
            price_note="per unit",
            lead_time="3-5 days",
            minimum_order_quantity=1,
            ports=ports,
            status=SupplyListingStatus.approved,
            published_at=NOW,
            expires_at=NOW + timedelta(days=WINDOW_DAYS),
            created_at=NOW - timedelta(days=30),
        )
    )


def main() -> None:
    # Allowlist, fails closed: this script writes demo accounts with a published
    # password, so it must never run against anything but a local development DB.
    env = (os.getenv("ENVIRONMENT") or "production").strip().lower()
    if env != "development":
        raise SystemExit(
            "seed_marketplace_cards.py is a development-only demo seeder and refuses "
            f"to run when ENVIRONMENT={env!r}. Set ENVIRONMENT=development to use it."
        )

    db = SessionLocal()
    try:
        for (name, category_name, head_office, ports, bio, years, rating, jobs,
             listings) in PROVIDERS:
            profile = _create_company(
                db, name, UserRole.provider, category_name, head_office, ports, bio,
                years, rating, jobs, [sub for _, sub in listings],
            )
            category = _category(db, "provider", category_name)
            for service_name, sub_name in listings:
                _live_service(db, profile, category, service_name, sub_name, ports)
            print(f"provider  {name:34s} {category_name} ({len(listings)} live services)")

        for (name, category_name, head_office, ports, bio, years, rating, jobs,
             listings) in SUPPLIERS:
            profile = _create_company(
                db, name, UserRole.supplier, category_name, head_office, ports, bio,
                years, rating, jobs, [],
            )
            category = _category(db, "supplier", category_name)
            for listing_name, sub_name in listings:
                _live_supply(db, profile, category, listing_name, sub_name, ports)
            print(f"supplier  {name:34s} {category_name} ({len(listings)} live supplies)")

        db.commit()
        print(f"\nseeded {len(PROVIDERS)} providers + {len(SUPPLIERS)} suppliers; "
              f"password for each: {PASSWORD}")
        print("every listing price is NULL, so the cards show 'Starting price TBC'")
    finally:
        db.close()


if __name__ == "__main__":
    main()
