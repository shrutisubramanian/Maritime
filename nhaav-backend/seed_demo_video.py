"""
Seed realistic demo data for the Nhaav demo video.

Run with:
    cd nhaav-backend
    .venv/Scripts/python.exe seed_demo_video.py

Idempotent: demo accounts and their content are re-created on every run, so the
video always sees the same marketplace, dashboards and queues.

DEMO CREDENTIALS (password for every account: Demo@123)
    client    client.demo@nhaavmaritime.com
    provider  provider.demo@nhaavmaritime.com
    provider2 provider2.demo@nhaavmaritime.com
    supplier  supplier.demo@nhaavmaritime.com
    admin     shrutishiva07@gmail.com
"""
from __future__ import annotations

import os
import uuid
from datetime import datetime, timedelta

from app.database import SessionLocal
from app.models.job import Job, JobStage, JobStatus
from app.models.notification import Notification, NotificationType
from app.models.profile import AvailabilityStatus, Profile, VerificationStatus
from app.models.quote import Quote, QuoteStatus
from app.models.request import RequestStatus, RequestType, ServiceRequest, UrgencyLevel
from app.models.review import Review
from app.models.service import Service, ServiceListingStatus
from app.models.subscription import Subscription, SubscriptionStatus
from app.models.supply_listing import SupplyListing, SupplyListingStatus
from app.models.user import User, UserRole
from app.utils.password import hash_password

PASSWORD = "Demo@123"
NOW = datetime.utcnow()
WINDOW_DAYS = 52  # remaining days on the 60-day paid placement window

PORT_IMAGES = {
    "hull": "https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=1200&h=700&fit=crop",
    "rope": "https://images.unsplash.com/photo-1500930287596-c1ecaa373bb2?w=900&h=700&fit=crop",
    "oil": "https://images.unsplash.com/photo-1615906655593-ad0386982a0f?w=900&h=700&fit=crop",
    "paint": "https://images.unsplash.com/photo-1589939705384-5185137a7f0f?w=900&h=700&fit=crop",
    "safety": "https://images.unsplash.com/photo-1581092921461-eab62e97a780?w=900&h=700&fit=crop",
    "light": "https://images.unsplash.com/photo-1498623116890-37e912163d5d?w=900&h=700&fit=crop",
    "extinguisher": "https://images.unsplash.com/photo-1599490659213-e2b9527bd087?w=900&h=700&fit=crop",
}


def upsert_user(db, email, role, full_name, phone=None):
    user = db.query(User).filter(User.email == email).first()
    if user is None:
        user = User(id=uuid.uuid4(), email=email)
        db.add(user)
    user.password_hash = hash_password(PASSWORD)
    user.role = role
    user.full_name = full_name
    user.phone = phone
    user.is_verified = True
    user.access_control_enabled = False
    user.active_device_id = None
    user.active_device_label = None
    user.active_device_at = None
    db.flush()
    return user


def upsert_profile(db, user, **kwargs):
    profile = db.query(Profile).filter(Profile.user_id == user.id).first()
    if profile is None:
        profile = Profile(id=uuid.uuid4(), user_id=user.id)
        db.add(profile)
    for key, value in kwargs.items():
        setattr(profile, key, value)
    db.flush()
    return profile


def ensure_subscription(db, user):
    plan_code = "MONTHLY"
    from app.models.subscription import SubscriptionPlan

    plan = db.query(SubscriptionPlan).filter(SubscriptionPlan.code == plan_code).first()
    if plan is None:
        raise SystemExit("subscription plans are not seeded; run the plan seed first")
    sub = (
        db.query(Subscription)
        .filter(Subscription.owner_user_id == user.id)
        .first()
    )
    if sub is None:
        sub = Subscription(id=uuid.uuid4(), owner_user_id=user.id, plan_id=plan.id)
        db.add(sub)
    sub.plan_id = plan.id
    sub.status = SubscriptionStatus.ACTIVE
    sub.starts_at = NOW - timedelta(days=9)
    sub.expires_at = NOW + timedelta(days=31)
    db.flush()
    return sub


def wipe_demo_content(db, users):
    """Remove everything the demo accounts own so the seed stays idempotent."""
    user_ids = [u.id for u in users]
    client_ids = [u.id for u in users if u.role == UserRole.client]

    request_ids = [
        r.id for r in db.query(ServiceRequest).filter(ServiceRequest.client_id.in_(client_ids)).all()
    ]
    if request_ids:
        db.query(Review).filter(Review.job_id.in_(
            db.query(Job.id).filter(Job.request_id.in_(request_ids))
        )).delete(synchronize_session=False)
        db.query(Job).filter(Job.request_id.in_(request_ids)).delete(synchronize_session=False)
        db.query(Quote).filter(Quote.request_id.in_(request_ids)).delete(synchronize_session=False)
        db.query(ServiceRequest).filter(ServiceRequest.id.in_(request_ids)).delete(
            synchronize_session=False
        )
    db.query(Service).filter(Service.provider_id.in_(user_ids)).delete(synchronize_session=False)
    db.query(SupplyListing).filter(SupplyListing.supplier_id.in_(user_ids)).delete(
        synchronize_session=False
    )
    db.query(Notification).filter(Notification.user_id.in_(user_ids)).delete(
        synchronize_session=False
    )
    db.flush()


def make_service(db, provider, name, category, subcategory, description, price, note, ports,
                 status=ServiceListingStatus.approved, created_days=20):
    live = status == ServiceListingStatus.approved
    svc = Service(
        id=uuid.uuid4(),
        provider_id=provider.id,
        name=name,
        service_id=name.lower().replace(" ", "-"),
        port_id=(ports[0] if ports else None),
        category=category,
        subcategory=subcategory,
        description=description,
        pricing_model="Fixed price",
        price_paise=price,
        price_note=note,
        is_active=live,
        status=status,
        created_at=NOW - timedelta(days=created_days),
        published_at=(NOW - timedelta(days=60 - WINDOW_DAYS)) if live else None,
        expires_at=(NOW + timedelta(days=WINDOW_DAYS)) if live else None,
    )
    db.add(svc)
    db.flush()
    return svc


def make_supply(db, supplier, name, category, subcategory, description, price, note, ports,
                specs, image_key, status=SupplyListingStatus.approved):
    live = status == SupplyListingStatus.approved
    listing = SupplyListing(
        id=uuid.uuid4(),
        supplier_id=supplier.id,
        name=name,
        category=category,
        subcategory=subcategory,
        description=description,
        manufacturer=specs.get("Manufacturer"),
        model_number=specs.get("Model"),
        part_number=specs.get("Part No."),
        condition="oem",
        country_of_origin=specs.get("Origin", "Singapore"),
        specifications=specs,
        availability="in_stock",
        price_paise=price,
        price_note=note,
        lead_time="3-5 days",
        minimum_order_quantity=1,
        ports=ports,
        images=[PORT_IMAGES[image_key]],
        status=status,
        created_at=NOW - timedelta(days=14),
        published_at=(NOW - timedelta(days=60 - WINDOW_DAYS)) if live else None,
        expires_at=(NOW + timedelta(days=WINDOW_DAYS)) if live else None,
    )
    db.add(listing)
    db.flush()
    return listing


def main() -> None:
    # SAFETY: every account this script creates shares one PUBLIC password
    # (PASSWORD below, documented at the top of this file) and its content is
    # rewritten on each run. It must never be pointed at a real deployment, so
    # the environment is an allowlist that fails closed: only an explicit
    # ENVIRONMENT=development may run it.
    env = (os.getenv("ENVIRONMENT") or "production").strip().lower()
    if env != "development":
        raise SystemExit(
            "seed_demo_video.py is a development-only demo seeder and refuses to "
            f"run when ENVIRONMENT={env!r}. Set ENVIRONMENT=development to use it."
        )

    db = SessionLocal()
    try:
        # ---------------------------------------------------------------- users
        client = upsert_user(
            db, "client.demo@nhaavmaritime.com", UserRole.client, "Aditi Rao", "+91 98200 44112"
        )
        provider = upsert_user(
            db, "provider.demo@nhaavmaritime.com", UserRole.provider,
            "Rohan Mehta", "+91 98191 77340",
        )
        provider2 = upsert_user(
            db, "provider2.demo@nhaavmaritime.com", UserRole.provider,
            "Lars van Dijk", "+31 6 2244 8890",
        )
        supplier = upsert_user(
            db, "supplier.demo@nhaavmaritime.com", UserRole.supplier,
            "Wei Lin Tan", "+65 9123 4478",
        )
        pending_provider = upsert_user(
            db, "pending.provider@nhaavmaritime.com", UserRole.provider,
            "Sana Qureshi", "+91 90045 22119",
        )
        admin = db.query(User).filter(User.email == "shrutishiva07@gmail.com").first()
        if admin is None:
            admin = upsert_user(
                db, "shrutishiva07@gmail.com", UserRole.admin, "NHAAV Admin"
            )
        # An EXISTING admin is left completely untouched: this script previously
        # rewrote the operator's password to the published demo password, which
        # handed the admin account to anyone who read this file.

        demo_users = [client, provider, provider2, supplier, pending_provider]
        wipe_demo_content(db, demo_users)

        # ------------------------------------------------------------- profiles
        upsert_profile(
            db, client,
            position="Fleet Manager",
            company_name="Meridian Ship Management Pvt Ltd",
            bio=(
                "Technical ship management for a fleet of 14 bulk carriers, container ships "
                "and product tankers trading across the Indian Ocean, Singapore and North West Europe."
            ),
            years_experience=16,
            ports_served=["Mumbai", "Singapore", "Rotterdam", "Jebel Ali"],
            contacts=[{"name": "Aditi Rao", "email": client.email, "phone": "+91 98200 44112"}],
            offices=["Mumbai, India", "Singapore"],
            licenses=["RPSL-2021-0194", "ISO 9001:2015"],
            verification_status=VerificationStatus.verified,
            availability_status=AvailabilityStatus.available,
            badge_label="VERIFIED",
            rating_avg=4.8,
            jobs_completed=12,
            profile_metadata={
                "vessels": [
                    {"name": "MV Meridian Star", "type": "Bulk Carrier", "imo": "9412287"},
                    {"name": "MV Coral Voyager", "type": "Container Ship", "imo": "9633114"},
                    {"name": "MT Pacific Dawn", "type": "Product Tanker", "imo": "9487223"},
                ]
            },
        )
        upsert_profile(
            db, provider,
            position="Operations Director",
            company_name="OceanTech Marine Services",
            bio=(
                "Certified underwater and mechanical services across Indian and South East Asian "
                "ports. Class-approved UWILD inspections, in-water hull cleaning and engine overhauls, "
                "delivered by 42 full-time engineers and divers."
            ),
            years_experience=18,
            ports_served=["Mumbai", "Singapore", "Rotterdam", "Jebel Ali"],
            contacts=[{"name": "Rohan Mehta", "email": provider.email, "phone": "+91 98191 77340"}],
            offices=["Mumbai, India", "Singapore"],
            licenses=["ABS Approved UWILD", "Class NK Service Supplier", "ISO 9001:2015"],
            verification_status=VerificationStatus.verified,
            availability_status=AvailabilityStatus.available,
            badge_label="VERIFIED",
            rating_avg=4.9,
            jobs_completed=148,
            social_links={"website": "https://oceantech-marine.example.com"},
        )
        upsert_profile(
            db, provider2,
            position="Managing Partner",
            company_name="Atlas Marine Engineering GmbH",
            bio=(
                "Rotterdam-based survey and engineering house serving North West Europe and the "
                "Gulf. Bunker surveys, cargo surveys and machinery overhauls with EU-class engineers."
            ),
            years_experience=21,
            ports_served=["Rotterdam", "Jebel Ali", "Singapore"],
            contacts=[{"name": "Lars van Dijk", "email": provider2.email, "phone": "+31 6 2244 8890"}],
            offices=["Rotterdam, Netherlands"],
            licenses=["ISO 9001:2015", "SGS Approved Surveyor"],
            verification_status=VerificationStatus.verified,
            availability_status=AvailabilityStatus.available,
            badge_label="VERIFIED",
            rating_avg=4.6,
            jobs_completed=92,
        )
        upsert_profile(
            db, supplier,
            position="Head of Sales",
            company_name="Northstar Marine Supplies",
            bio=(
                "IMO-approved ship chandler supplying mooring, deck, safety and engine stores from "
                "Singapore and Mumbai with a 48-hour delivery promise inside the Malacca Strait."
            ),
            years_experience=13,
            ports_served=["Singapore", "Mumbai", "Jebel Ali"],
            contacts=[{"name": "Wei Lin Tan", "email": supplier.email, "phone": "+65 9123 4478"}],
            offices=["Singapore"],
            licenses=["ISO 9001:2015", "IMO Supplier Code"],
            verification_status=VerificationStatus.verified,
            availability_status=AvailabilityStatus.available,
            badge_label="VERIFIED",
            rating_avg=4.7,
            jobs_completed=64,
        )
        upsert_profile(
            db, pending_provider,
            position="Technical Manager",
            company_name="Azure Marine Coatings",
            bio="Hull coating applicators awaiting document verification.",
            years_experience=6,
            ports_served=["Kochi", "Mumbai"],
            verification_status=VerificationStatus.pending,
            badge_label=None,
        )

        for user in demo_users:
            ensure_subscription(db, user)

        # ------------------------------------------------------------- services
        oceantech_services = [
            ("Underwater Hull Cleaning", "Hull & Underwater", "Hull & Underwater Cleaning",
             "In-water hull cleaning using diver-held rotary brushes and cavitation units. "
             "Removes fouling without disturbing the antifouling system and includes a video report "
             "of the waterline and full hull.",
             185_000_00, "per vessel", ["Mumbai", "Singapore", "Rotterdam", "Jebel Ali"]),
            ("Underwater Inspection (UWILD)", "Hull & Underwater", "UWILD Inspection",
             "Class-approved underwater inspection in lieu of drydocking. ABS and Class NK accredited "
             "surveyors, thrusters, rudders, sea chests and a signed photographic report within 48 hours.",
             95_000_00, "per inspection", ["Mumbai", "Singapore"]),
            ("Propeller Polishing", "Hull & Underwater", "Propeller & Shaft",
             "Propeller blade polishing and edge conditioning to reduce cavitation and recover propulsive "
             "efficiency. Includes pre- and post-polish roughness readings.",
             65_000_00, "per propeller", ["Mumbai", "Rotterdam"]),
            ("Hydraulic Repairs", "Repairs & Maintenance", "Hydraulic & Marine Systems",
             "24/7 hydraulic repair crew for hatch covers, windlasses, mooring winches and steering gear. "
             "On-board diagnostics, seal kits and pressure testing included.",
             125_000_00, "per job", ["Mumbai", "Jebel Ali"]),
            ("Main Engine Overhaul", "Repairs & Maintenance", "Mechanical & Machinery",
             "Top-end and major main engine overhauls by MAN and Wartsila certified engineers. Spares "
             "sourcing, laser alignment and sea-trial support included.",
             850_000_00, "per engine", ["Singapore", "Rotterdam"]),
            ("Lifeboat & FFA Appliance Servicing", "Marine Safety & Appliances", "Safety / LSA / FFA",
             "Annual lifeboat, davit and fire-fighting appliance servicing with class-recognised certificates "
             "issued on board.",
             58_000_00, "per vessel", ["Mumbai", "Jebel Ali"]),
        ]
        for name, cat, sub, desc, price, note, ports in oceantech_services:
            make_service(db, provider, name, cat, sub, desc, price, note, ports)

        atlas_services = [
            ("Underwater Hull Cleaning", "Hull & Underwater", "Hull & Underwater Cleaning",
             "EU-class in-water hull cleaning with fuel-saving performance report before and after cleaning.",
             168_000_00, "per vessel", ["Rotterdam", "Jebel Ali"]),
            ("Bunker Fuel Quality Survey", "Fuel and Bunkering", "Fuel & Utilities",
             "Full bunker quantity and quality survey to ISO 8754 / ISO 8217 with laboratory analysis and "
             "BQS report inside 24 hours.",
             42_000_00, "per sample", ["Rotterdam", "Singapore"]),
            ("Dry Cargo & Bulk Survey", "Inspection & Survey", "Inspection & Survey",
             "Hold cleanliness, hatch cover ultrasonic testing and draft survey with photo evidence.",
             55_000_00, "per survey", ["Rotterdam"]),
            ("Main Engine Overhaul", "Repairs & Maintenance", "Mechanical & Machinery",
             "Major overhaul of two-stroke and four-stroke engines with OEM parts and class attendance.",
             910_000_00, "per engine", ["Rotterdam"]),
        ]
        for name, cat, sub, desc, price, note, ports in atlas_services:
            make_service(db, provider2, name, cat, sub, desc, price, note, ports)

        # A listing waiting in the admin moderation queue.
        make_service(
            db, provider, "Shipboard HVAC & Chiller Servicing", "HVAC & Refrigeration",
            "HVAC & Refrigeration",
            "Chiller and air-handling servicing with F-gas certified technicians.",
            78_000_00, "per system", ["Mumbai"],
            status=ServiceListingStatus.pending_review, created_days=1,
        )

        # ------------------------------------------------------------- supplies
        supplies = [
            ("Mooring Rope — 8-Strand Polypropylene 64mm", "Ship Chandlery", "Mooring & Towing",
             "High-tenacity 8-strand polypropylene mooring line, 200 m coil with spliced eye. "
             "Certified minimum breaking load 96 t, UV stabilised for tropical service.",
             24_500_00, "per 200 m coil", ["Singapore", "Mumbai"],
             {"Manufacturer": "Kiswire Marine", "Model": "PP-8S-64", "Part No.": "KR-8S64-200",
              "Origin": "Korea", "MBL": "96 t", "Length": "200 m", "Certification": "OCIMF MEG4"},
             "rope"),
            ("Marine Lubricant — Cylinder Oil 20L", "Engine Stores", "Lubricants",
             "Shell Alexia 40 cylinder oil for slow-speed two-stroke engines. Sealed 20 L pails, "
             "batch-certified and IMO compliant.",
             8_900_00, "per 20 L pail", ["Singapore"],
             {"Manufacturer": "Shell", "Model": "Alexia 40", "Origin": "Netherlands",
              "Pack": "20 L pail", "BN": "SH-ALX-40-2026"},
             "oil"),
            ("Deck Paint System — Epoxy Primer Kit", "Deck Stores", "Coatings",
             "Two-component epoxy primer and topcoat kit for deck and hull repair, 20 L with hardener. "
             "IMO PSPC compliant.",
             12_400_00, "per 20 L kit", ["Mumbai"],
             {"Manufacturer": "International", "Model": "Intergard 475HS", "Origin": "UK",
              "Kit": "20 L", "Finish": "Gloss"},
             "paint"),
            ("Lifeboat Release Hook Spares Set", "Safety Equipment", "LSA Spares",
             "OEM release hook overhaul kit for 25-person totally enclosed lifeboats with springs, "
             "pins and certification pack.",
             46_000_00, "per set", ["Singapore", "Rotterdam"],
             {"Manufacturer": "Vestdavit", "Model": "RHS-25", "Origin": "Norway",
              "Suitable for": "TEL 25 persons"},
             "safety"),
            ("Navigation Light Assembly — LED Port", "Electrical Equipment", "Navigation",
             "MED-approved LED port sidelight with housing, cabling and mounting bracket. "
             "IP66 rated, 12-24 V.",
             18_700_00, "per unit", ["Singapore"],
             {"Manufacturer": "Den Haan", "Model": "NL-LED-P", "Origin": "Netherlands",
              "Approval": "MED 96/98/EC", "Voltage": "12-24 V"},
             "light"),
            ("CO2 Fire Extinguisher 9 kg", "Safety Equipment", "FFA",
             "Refillable 9 kg CO2 extinguisher with marine bracket, hose and class certificate.",
             9_600_00, "per unit", ["Mumbai", "Jebel Ali"],
             {"Manufacturer": "NAFFCO", "Model": "CO2-9", "Origin": "UAE", "Capacity": "9 kg"},
             "extinguisher"),
        ]
        for name, cat, sub, desc, price, note, ports, specs, image_key in supplies:
            make_supply(db, supplier, name, cat, sub, desc, price, note, ports, specs, image_key)

        # A supply listing waiting in the admin moderation queue.
        make_supply(
            db, supplier, "Emergency Towing Gear Set", "Marine Equipment", "Towing",
            "Complete emergency towing arrangement for vessels above 20,000 DWT.",
            312_000_00, "per set", ["Singapore"],
            {"Manufacturer": "Mampaey", "Model": "ETS-20", "Origin": "Netherlands"},
            "rope", status=SupplyListingStatus.pending_review,
        )

        # ------------------------------------------------------------- requests
        def make_request(title, request_type, service_type, port, status, urgency, created_days,
                         description, vessel, budget=None, quantity=None, service_sub=None):
            req = ServiceRequest(
                id=uuid.uuid4(),
                client_id=client.id,
                title=title,
                request_type=request_type,
                service_type=service_type,
                subcategory=service_sub,
                vessel_name=vessel,
                vessel_type=None,
                port=port,
                description=description,
                budget=budget,
                quantity=quantity,
                urgency=urgency,
                status=status,
                created_at=NOW - timedelta(days=created_days),
                updated_at=NOW - timedelta(days=created_days),
            )
            db.add(req)
            db.flush()
            return req

        req_open = make_request(
            "Underwater hull cleaning — MV Meridian Star", RequestType.service,
            "Underwater Hull Cleaning", "Mumbai", RequestStatus.open, UrgencyLevel.high, 2,
            "Full in-water hull cleaning required before the vessel sails to Singapore. Heavy "
            "biofouling reported on the flat bottom and waterline. Class report required after cleaning.",
            "MV Meridian Star", budget=200_000, service_sub="Hull & Underwater",
        )
        req_awarded = make_request(
            "Main engine overhaul — MV Coral Voyager", RequestType.service,
            "Main Engine Overhaul", "Singapore", RequestStatus.awarded, UrgencyLevel.high, 9,
            "6S60MC main engine due for major overhaul at 24,000 running hours. Owner-supplied spares "
            "available on board, class attendance required.",
            "MV Coral Voyager", budget=900_000, service_sub="Repairs & Maintenance",
        )
        req_supply = make_request(
            "Mooring ropes and deck stores — MT Pacific Dawn", RequestType.supply,
            "Ship Chandlery", "Mumbai", RequestStatus.open, UrgencyLevel.medium, 1,
            "Requirement for 12 coils of 64 mm polypropylene mooring rope and 8 kits of epoxy deck "
            "paint for the next drydock preparation.",
            "MT Pacific Dawn", budget=350_000, quantity=12, service_sub="Deck Stores",
        )
        req_incoming = make_request(
            "Hydraulic hatch cover repairs — MT Pacific Dawn", RequestType.service,
            "Hydraulic Repairs", "Jebel Ali", RequestStatus.open, UrgencyLevel.high, 1,
            "No. 3 and No. 5 hatch cover hydraulic cylinders leaking on the Pacific Dawn. "
            "Vessel alongside Jebel Ali for 4 days — repair crew and seal kits required on board.",
            "MT Pacific Dawn", budget=140_000, service_sub="Repairs & Maintenance",
        )
        req_completed = make_request(
            "UWILD inspection — MV Meridian Star", RequestType.service,
            "Underwater Inspection (UWILD)", "Mumbai", RequestStatus.completed,
            UrgencyLevel.medium, 34,
            "Class-required underwater inspection in lieu of drydocking, including sea chest and rudder "
            "checks with a signed report.",
            "MV Meridian Star", budget=100_000, service_sub="Hull & Underwater",
        )
        req_completed_2 = make_request(
            "Bunker fuel quality survey — MT Pacific Dawn", RequestType.service,
            "Bunker Fuel Quality Survey", "Rotterdam", RequestStatus.completed,
            UrgencyLevel.low, 21,
            "Independent bunker quantity and quality survey during VLSFO delivery, samples to be "
            "retained for 90 days.",
            "MT Pacific Dawn", budget=45_000, service_sub="Fuel and Bunkering",
        )

        def make_quote(req, provider_user, amount, days=1, message="", status=QuoteStatus.submitted,
                       duration="4 days"):
            quote = Quote(
                id=uuid.uuid4(),
                request_id=req.id,
                provider_id=provider_user.id,
                quotation_reference=f"QT-{uuid.uuid4().hex[:8].upper()}",
                pricing_model="Fixed Price",
                amount=float(amount) / 100.0,
                currency="INR",
                travel_charges=0.0,
                emergency_charges=0.0,
                taxes_included=True,
                message=message,
                estimated_duration=duration,
                estimated_start_date=NOW + timedelta(days=2),
                estimated_completion_date=NOW + timedelta(days=2 + 4),
                warranty_period="30 days",
                payment_terms="50% advance, balance on completion",
                status=status,
                created_at=NOW - timedelta(days=days),
                updated_at=NOW - timedelta(days=days),
            )
            db.add(quote)
            db.flush()
            return quote

        q1 = make_quote(
            req_open, provider, 185_000_00, days=1,
            message="Dive team on standby at Mumbai anchorage. Cleaning with class-approved report "
                    "within 24 hours of completion.",
        )
        q2 = make_quote(
            req_open, provider2, 176_000_00, days=1,
            message="Rotterdam crew mobilised to Mumbai. Includes full video report and fuel-saving "
                    "analysis.",
        )

        q_award = make_quote(
            req_awarded, provider, 850_000_00, days=8, duration="18 days",
            message="OEM MAN spare kit included, two engineers on board for the full overhaul.",
        )
        req_awarded.selected_quotation_id = q_award.id
        q_award.status = QuoteStatus.accepted
        db.flush()

        q_done = make_quote(
            req_completed, provider, 95_000_00, days=33, duration="2 days",
            message="UWILD completed ahead of schedule with class attendance.",
        )
        req_completed.selected_quotation_id = q_done.id
        q_done.status = QuoteStatus.accepted

        q_done2 = make_quote(
            req_completed_2, provider2, 42_000_00, days=20, duration="1 day",
            message="Samples drawn at Rotterdam and sent to the lab the same day.",
        )
        req_completed_2.selected_quotation_id = q_done2.id
        q_done2.status = QuoteStatus.accepted
        db.flush()

        # ----------------------------------------------------------------- jobs
        job_active = Job(
            id=uuid.uuid4(),
            request_id=req_awarded.id,
            provider_id=provider.id,
            quote_id=q_award.id,
            status=JobStatus.active,
            current_stage=JobStage.in_progress,
            completion_percentage=65,
            progress=[
                {"stage": "Accepted", "note": "Quote accepted by Meridian Ship Management",
                 "date": (NOW - timedelta(days=8)).isoformat()},
                {"stage": "Scheduled", "note": "Engineers booked on the Singapore berth window",
                 "date": (NOW - timedelta(days=6)).isoformat()},
                {"stage": "In Progress", "note": "Unit 3 cylinder head removed, pistons inspected",
                 "date": (NOW - timedelta(days=2)).isoformat()},
            ],
            started_at=NOW - timedelta(days=4),
            created_at=NOW - timedelta(days=8),
        )
        db.add(job_active)

        job_done = Job(
            id=uuid.uuid4(),
            request_id=req_completed.id,
            provider_id=provider.id,
            quote_id=q_done.id,
            status=JobStatus.completed,
            current_stage=JobStage.completed,
            completion_percentage=100,
            progress=[
                {"stage": "Accepted", "note": "Work order raised", "date": (NOW - timedelta(days=33)).isoformat()},
                {"stage": "Completed", "note": "Class report issued", "date": (NOW - timedelta(days=31)).isoformat()},
            ],
            started_at=NOW - timedelta(days=33),
            completed_at=NOW - timedelta(days=31),
            created_at=NOW - timedelta(days=33),
        )
        db.add(job_done)

        job_done2 = Job(
            id=uuid.uuid4(),
            request_id=req_completed_2.id,
            provider_id=provider2.id,
            quote_id=q_done2.id,
            status=JobStatus.completed,
            current_stage=JobStage.completed,
            completion_percentage=100,
            progress=[
                {"stage": "Accepted", "note": "Surveyor assigned", "date": (NOW - timedelta(days=20)).isoformat()},
                {"stage": "Completed", "note": "BQS report delivered", "date": (NOW - timedelta(days=19)).isoformat()},
            ],
            started_at=NOW - timedelta(days=20),
            completed_at=NOW - timedelta(days=19),
            created_at=NOW - timedelta(days=20),
        )
        db.add(job_done2)
        db.flush()

        # -------------------------------------------------------------- reviews
        db.add_all([
            Review(
                id=uuid.uuid4(), job_id=job_done.id, reviewer_id=client.id,
                reviewed_user_id=provider.id, rating=5, communication=5, quality=5,
                timeliness=5, professionalism=5,
                comment="Dive team was on the berth within hours, report accepted by class first time.",
                created_at=NOW - timedelta(days=30),
            ),
            Review(
                id=uuid.uuid4(), job_id=job_done2.id, reviewer_id=client.id,
                reviewed_user_id=provider2.id, rating=4, communication=5, quality=4,
                timeliness=4, professionalism=4,
                comment="Survey was thorough and the report arrived the next morning.",
                created_at=NOW - timedelta(days=18),
            ),
        ])

        # -------------------------------------------------------- notifications
        notes = [
            (client, "Two quotations received",
             f"OceanTech Marine Services and Atlas Marine Engineering quoted on "
             f"'{req_open.title}'. Compare them now.",
             NotificationType.quotation, req_open.id, False),
            (client, "Job update: engine overhaul 65% complete",
             "OceanTech Marine Services progressed the overhaul on MV Coral Voyager to In Progress.",
             NotificationType.job, job_active.id, False),
            (client, "Bunker survey report delivered",
             "Atlas Marine Engineering uploaded the final BQS report for MT Pacific Dawn.",
             NotificationType.job, job_done2.id, True),
            (provider, "New procurement request in Mumbai",
             f"'Underwater hull cleaning — MV Meridian Star' matches your approved listing.",
             NotificationType.procurement, req_open.id, False),
            (provider, "Quotation accepted",
             "Meridian Ship Management accepted your quotation for the MV Coral Voyager overhaul.",
             NotificationType.quote, q_award.id, True),
            (provider, "New review received",
             "Aditi Rao rated your UWILD inspection 5 stars.",
             NotificationType.review, job_done.id, True),
            (provider, "New request in Jebel Ali",
             "'Hydraulic hatch cover repairs — MT Pacific Dawn' is open and matches your hydraulic "
             "repair listing.",
             NotificationType.request, req_incoming.id, False),
            (supplier, "New supply request matching your catalogue",
             "'Mooring ropes and deck stores — MT Pacific Dawn' is open in Mumbai.",
             NotificationType.procurement, req_supply.id, False),
            (pending_provider, "Documents under review",
             "Your company documents are with the Nhaav verification team.",
             NotificationType.verification, None, False),
        ]
        for user, title, message, ntype, entity_id, is_read in notes:
            db.add(Notification(
                id=uuid.uuid4(), user_id=user.id, title=title, message=message, type=ntype,
                priority="normal", related_entity_id=str(entity_id) if entity_id else None,
                is_read=is_read,
                created_at=NOW - timedelta(hours=6),
            ))

        db.commit()
        print("Demo data seeded.")
        print("password:", PASSWORD)
        for email in ("client.demo@nhaavmaritime.com", "provider.demo@nhaavmaritime.com",
                      "provider2.demo@nhaavmaritime.com", "supplier.demo@nhaavmaritime.com",
                      "shrutishiva07@gmail.com"):
            print(" ", email)
    finally:
        db.close()


if __name__ == "__main__":
    main()
