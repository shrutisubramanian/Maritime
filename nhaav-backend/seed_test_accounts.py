"""Seed (or remove) throwaway accounts for manual testing.

Creates three ready-to-use accounts in the local database, each in the state a
real approved account reaches after onboarding — email verified, profile
APPROVED by an admin (``profiles.verification_status == verified``), so the
marketplace / requests / jobs gate is open:

    client.test@nhaav.com      role=client     (posts procurement requests)
    provider.test@nhaav.com    role=provider   (bids on them, has live listings)
    supplier.test@nhaav.com    role=supplier   (has live catalogue listings)

Password for all three: TestPass123!

Extra data so the screens are not empty:

  * the provider has two approved, published service listings (60-day window);
  * the supplier has two approved, published supply listings;
  * the client has one open procurement request matching the provider's port
    and service, so the quote -> award -> reveal loop can be exercised.

Both listings and the request are seeded directly, which is exactly what the
paid-placement/admin-approval flows would produce.

Usage::

    python seed_test_accounts.py            # create or refresh the accounts
    python seed_test_accounts.py --delete   # remove them and everything they own

Accounts are identified by the addresses above; nothing else in the database is
touched. Listings are matched on their owner + name, so re-running is safe.
"""
import argparse
import os
from datetime import datetime, timedelta, timezone

from app.database import SessionLocal
from app.models.job import Job  # noqa: F401  (import side effect: mapper config)
from app.models.notification import Notification  # noqa: F401
from app.models.profile import AvailabilityStatus, Profile, VerificationStatus
from app.models.quote import Quote  # noqa: F401
from app.models.request import RequestStatus, RequestType, ServiceRequest, UrgencyLevel
from app.models.review import Review  # noqa: F401
from app.models.service import Service, ServiceListingStatus
from app.models.supply_listing import SupplyListing, SupplyListingStatus
from app.models.user import User, UserRole
from app.utils.password import hash_password

PASSWORD = "TestPass123!"
CLIENT_EMAIL = "client.test@nhaav.com"
PROVIDER_EMAIL = "provider.test@nhaav.com"
SUPPLIER_EMAIL = "supplier.test@nhaav.com"
TEST_EMAILS = (CLIENT_EMAIL, PROVIDER_EMAIL, SUPPLIER_EMAIL)

PORT_A = "Port of Rotterdam"
PORT_B = "Mumbai Port"
SERVICE_A = "Underwater Hull Cleaning"
SERVICE_B = "Hydraulic Repairs"

#: 60-day paid placement window, stamped from now.
WINDOW = timedelta(days=60)


def _utcnow() -> datetime:
    """Naive UTC now — matches the naive-UTC timestamps the models store."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _user(db, email: str) -> User:
    return db.query(User).filter(User.email == email).first()


def _ensure_user(db, email: str, role: UserRole, full_name: str, company: str, bio: str) -> User:
    """Create the account (verified) or repair the flags on an existing one."""
    user = _user(db, email)
    if user is None:
        user = User(
            email=email,
            password_hash=hash_password(PASSWORD),
            role=role,
            full_name=full_name,
            phone="+91 90000 00000",
            is_verified=True,
        )
        db.add(user)
        db.flush()
    else:
        user.role = role
        user.is_verified = True
        user.password_hash = hash_password(PASSWORD)
        # Never leave a stale device binding behind — otherwise the first real
        # login is answered with the "switch devices?" challenge.
        user.active_device_id = None
        user.active_device_label = None
        user.active_device_at = None

    profile = db.query(Profile).filter(Profile.user_id == user.id).first()
    if profile is None:
        profile = Profile(user_id=user.id)
        db.add(profile)

    profile.company_name = company
    profile.position = "Operations"
    profile.bio = bio
    profile.verification_status = VerificationStatus.verified
    profile.availability_status = AvailabilityStatus.available
    profile.ports_served = [PORT_A, PORT_B]
    profile.years_experience = 8
    profile.contacts = [{"name": full_name, "email": email, "phone": "+91 90000 00000"}]
    profile.offices = [PORT_A]
    db.flush()
    return user


def _ensure_service(db, provider: User, name: str, category: str, port: str, price_paise: int) -> None:
    row = (
        db.query(Service)
        .filter(Service.provider_id == provider.id, Service.service_id == name)
        .first()
    )
    if row is None:
        row = Service(provider_id=provider.id, service_id=name)
        db.add(row)
    row.name = name
    row.category = category
    row.port_id = port
    row.description = f"{name} delivered at {port} by a verified test provider."
    row.pricing_model = "Per job"
    row.price_paise = price_paise
    row.price_note = "per job"
    row.status = ServiceListingStatus.approved
    row.is_active = True
    row.published_at = _utcnow()
    row.expires_at = _utcnow() + WINDOW
    row.certifications_required = []


def _ensure_supply(db, supplier: User, name: str, category: str, price_paise: int) -> None:
    row = (
        db.query(SupplyListing)
        .filter(SupplyListing.supplier_id == supplier.id, SupplyListing.name == name)
        .first()
    )
    if row is None:
        row = SupplyListing(supplier_id=supplier.id, name=name)
        db.add(row)
    row.category = category
    row.description = f"{name} — stocked and shipped by a verified test supplier."
    row.availability = "in_stock"
    row.price_paise = price_paise
    row.price_note = "per unit"
    row.lead_time = "7 days"
    row.minimum_order_quantity = 1
    row.ports = [PORT_A, PORT_B]
    row.status = SupplyListingStatus.approved
    row.published_at = _utcnow()
    row.expires_at = _utcnow() + WINDOW


def _ensure_request(db, client: User) -> ServiceRequest:
    title = "Hull cleaning — MV Nhaav Test"
    row = (
        db.query(ServiceRequest)
        .filter(ServiceRequest.client_id == client.id, ServiceRequest.title == title)
        .first()
    )
    if row is None:
        row = ServiceRequest(client_id=client.id, title=title)
        db.add(row)
    row.request_type = RequestType.service
    row.service_type = SERVICE_A
    row.vessel_name = "MV Nhaav Test"
    row.vessel_type = "Container"
    row.port = PORT_A
    row.description = "Underwater hull cleaning before the next dry-dock window."
    row.budget = 45000.0
    row.urgency = UrgencyLevel.medium
    row.status = RequestStatus.open
    return row


def seed() -> None:
    db = SessionLocal()
    try:
        client = _ensure_user(
            db, CLIENT_EMAIL, UserRole.client,
            "Test Client", "Shruti Marine Co",
            "Buyer account used for manual testing of the client journey.",
        )
        provider = _ensure_user(
            db, PROVIDER_EMAIL, UserRole.provider,
            "Test Provider", "Harbour Works Marine",
            "Service provider account used for manual testing of quotations.",
        )
        supplier = _ensure_user(
            db, SUPPLIER_EMAIL, UserRole.supplier,
            "Test Supplier", "Marine Spares Depot",
            "Supplier account used for manual testing of the supplies marketplace.",
        )

        _ensure_service(db, provider, SERVICE_A, "Hull & Underwater", PORT_A, 4200000)
        _ensure_service(db, provider, SERVICE_B, "Repairs & Maintenance", PORT_B, 1550000)
        _ensure_supply(db, supplier, "Marine Lubricant Oil 20L Drum", "Lubricants", 890000)
        _ensure_supply(db, supplier, "Nylon Mooring Rope 40mm", "Deck Stores", 1250000)
        _ensure_request(db, client)

        db.commit()
    finally:
        db.close()

    print("[seed_test_accounts] ready\n")
    print(f"  CLIENT    {CLIENT_EMAIL}    {PASSWORD}")
    print(f"  PROVIDER  {PROVIDER_EMAIL}  {PASSWORD}")
    print(f"  SUPPLIER  {SUPPLIER_EMAIL}  {PASSWORD}")
    print("\n  All three are email-verified and admin-approved, so the marketplace,")
    print("  requests and jobs are already unlocked.")
    print("  Remove them later with:  python seed_test_accounts.py --delete")


def delete() -> None:
    """Remove the test accounts and every row they own (cascades handle the rest)."""
    db = SessionLocal()
    try:
        users = db.query(User).filter(User.email.in_(TEST_EMAILS)).all()
        if not users:
            print("[seed_test_accounts] nothing to delete.")
            return
        # Explicit deletes first: some FKs are SET NULL rather than CASCADE, and
        # a request whose quotes are gone must not linger in the marketplace.
        ids = [u.id for u in users]
        db.query(ServiceRequest).filter(ServiceRequest.client_id.in_(ids)).delete(synchronize_session=False)
        db.query(Service).filter(Service.provider_id.in_(ids)).delete(synchronize_session=False)
        db.query(SupplyListing).filter(SupplyListing.supplier_id.in_(ids)).delete(synchronize_session=False)
        for user in users:
            db.delete(user)
        db.commit()
        print(f"[seed_test_accounts] deleted {len(users)} test account(s).")
    finally:
        db.close()


def main() -> int:
    # Allowlist, fails closed: these are throwaway accounts with a published
    # password, so the script must never run against anything but a local
    # development DB. Same guard as seed_marketplace_cards.py.
    env = (os.getenv("ENVIRONMENT") or "production").strip().lower()
    if env != "development":
        raise SystemExit(
            "seed_test_accounts.py is a development-only test seeder and refuses "
            f"to run when ENVIRONMENT={env!r}. Set ENVIRONMENT=development to use it."
        )

    parser = argparse.ArgumentParser(description="Seed or remove Nhaav test accounts.")
    parser.add_argument("--delete", action="store_true", help="Remove the test accounts.")
    args = parser.parse_args()
    delete() if args.delete else seed()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
