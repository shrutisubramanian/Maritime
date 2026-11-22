"""
Head-office port catalogue: seeding, lookup, validation and admin creation.

A company's head office MUST resolve to a row here, because head office is what
places the company under a port filter in the marketplace (see
``MarketplaceCompanyService.discover``). Anything the vendor types is
canonicalized to the stored port name, so "nhava sheva", "JNPT" and
"Jawaharlal Nehru Port" all resolve to the same entry.

The default list is the Indian seaport map Nhaav works from: the major ports plus
the intermediate and commercial ports vendors actually operate out of. Seeding is
idempotent and never deletes or renames an existing row, so admin edits survive.
"""
import re
from typing import Iterable, Optional, Sequence

from fastapi import HTTPException, status as http_status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.port import Port
from app.models.user import User, UserRole

#: (name, state, kind, aliases) — canonical short names, major + intermediate +
#: commercial ports. Order is the display order.
DEFAULT_PORTS: list[tuple[str, str, str, list[str]]] = [
    # --- Major ports (west coast, north to south)
    ("Kandla", "Gujarat", "Major", ["Deendayal Port", "Deendayal", "Kandla Port"]),
    ("Mumbai", "Maharashtra", "Major", ["Mumbai Port", "Bombay"]),
    ("JNPT", "Maharashtra", "Major", [
        "Jawaharlal Nehru Port", "Nhava Sheva", "JNPT Port", "Jawaharlal Nehru Port Trust",
    ]),
    ("Mormugao", "Goa", "Major", ["Mormugao Port"]),
    ("New Mangalore", "Karnataka", "Major", ["Mangalore", "Mangalore Port", "NMPT"]),
    ("Cochin", "Kerala", "Major", ["Kochi", "Cochin Port"]),
    ("Tuticorin", "Tamil Nadu", "Major", [
        "Thoothukudi", "V.O. Chidambaranar Port", "VOC Port", "Tuticorin Port",
    ]),
    ("Chennai", "Tamil Nadu", "Major", ["Chennai Port", "Madras"]),
    ("Ennore", "Tamil Nadu", "Major", ["Kamarajar Port", "Ennore Port"]),
    ("Visakhapatnam", "Andhra Pradesh", "Major", ["Vizag", "Visakhapatnam Port"]),
    ("Paradip", "Odisha", "Major", ["Paradeep", "Paradip Port"]),
    ("Haldia", "West Bengal", "Major", ["Haldia Dock", "Haldia Port"]),
    ("Kolkata", "West Bengal", "Major", ["Syama Prasad Mookerjee Port", "Calcutta"]),
    # --- Intermediate / operating ports
    ("Okha", "Gujarat", "Intermediate", ["Okha Port"]),
    ("Bhavnagar", "Gujarat", "Intermediate", ["Bhavnagar Port"]),
    ("Bharuch", "Gujarat", "Intermediate", ["Bharuch Port", "Dahej River Port"]),
    ("Surat", "Gujarat", "Intermediate", ["Surat Port"]),
    ("Veraval", "Gujarat", "Intermediate", ["Veraval Port"]),
    ("Ratnagiri", "Maharashtra", "Intermediate", ["Ratnagiri Port"]),
    ("Karwar", "Karnataka", "Intermediate", ["Karwar Port"]),
    ("Kozhikode", "Kerala", "Intermediate", ["Calicut", "Kozhikode Port"]),
    ("Alappuzha", "Kerala", "Intermediate", ["Alleppey", "Alappuzha Port"]),
    ("Karaikal", "Puducherry", "Intermediate", ["Karaikal Port"]),
    ("Nagapattinam", "Tamil Nadu", "Intermediate", ["Nagapattinam Port"]),
    ("Machilipatnam", "Andhra Pradesh", "Intermediate", ["Machilipatnam Port"]),
    ("Kakinada", "Andhra Pradesh", "Intermediate", ["Kakinada Port", "Kakinada Deep Water Port"]),
    # --- Commercial / private ports already used by Nhaav vendors
    ("Mundra", "Gujarat", "Commercial", ["Mundra Port", "Adani Mundra"]),
    ("Dahej", "Gujarat", "Commercial", ["Dahej Port"]),
    ("Hazira", "Gujarat", "Commercial", ["Hazira Port"]),
    ("Pipavav", "Gujarat", "Commercial", ["Pipavav Port", "APM Terminals Pipavav"]),
    ("Jaigad", "Maharashtra", "Commercial", ["Jaigad Port", "JSW Jaigad"]),
    ("Dighi", "Maharashtra", "Commercial", ["Dighi Port"]),
    ("Krishnapatnam", "Andhra Pradesh", "Commercial", ["Krishnapatnam Port"]),
    ("Dhamra", "Odisha", "Commercial", ["Dhamra Port"]),
    ("Gopalpur", "Odisha", "Commercial", ["Gopalpur Port"]),
]


def _norm(value: str) -> str:
    """Lowercase, collapse whitespace, and drop punctuation that varies by typist."""
    cleaned = re.sub(r"[^a-z0-9 ]+", " ", (value or "").lower())
    return re.sub(r"\s+", " ", cleaned).strip()


class PortCatalogueService:
    # --------------------------------------------------------------- seeding
    @staticmethod
    def ensure_seeded(db: Session) -> None:
        """Insert any missing default ports. Existing rows are never modified."""
        try:
            PortCatalogueService._seed(db)
        except IntegrityError:
            # Two first requests can seed concurrently; the unique constraint
            # keeps one copy, so the loser adopts the stored rows.
            db.rollback()

    @staticmethod
    def _seed(db: Session) -> None:
        existing = {_norm(p.name) for p in db.query(Port.name).all()}
        added = False
        for order, (name, state, kind, aliases) in enumerate(DEFAULT_PORTS):
            if _norm(name) in existing:
                continue
            db.add(
                Port(name=name, state=state, kind=kind, aliases=aliases, sort_order=order)
            )
            existing.add(_norm(name))
            added = True
        if added:
            db.commit()

    # ---------------------------------------------------------------- reads
    @staticmethod
    def list_ports(db: Session, include_inactive: bool = False) -> list[Port]:
        PortCatalogueService.ensure_seeded(db)
        query = db.query(Port)
        if not include_inactive:
            query = query.filter(Port.is_active.is_(True))
        return query.order_by(Port.sort_order, Port.name).all()

    @staticmethod
    def find(db: Session, value: str) -> Optional[Port]:
        """Resolve a typed/selected value to a port row (name or alias)."""
        wanted = _norm(value)
        if not wanted:
            return None
        for port in PortCatalogueService.list_ports(db, include_inactive=True):
            candidates = [port.name, *(port.aliases or [])]
            if any(_norm(candidate) == wanted for candidate in candidates):
                return port
        return None

    @staticmethod
    def resolve(db: Session, value: str, *, field: str = "head office") -> Port:
        port = PortCatalogueService.find(db, value)
        if port is None:
            raise HTTPException(
                status_code=http_status.HTTP_400_BAD_REQUEST,
                detail={
                    "code": "unknown_port",
                    "message": (
                        f"'{value}' is not a port in the Nhaav list. Choose a port "
                        f"for your {field}, or ask an admin to add it."
                    ),
                    "field": field,
                },
            )
        if not port.is_active:
            raise HTTPException(
                status_code=http_status.HTTP_400_BAD_REQUEST,
                detail={
                    "code": "inactive_port",
                    "message": (
                        f"'{port.name}' is no longer open for new listings. Choose "
                        "another port or ask an admin to re-open it."
                    ),
                    "field": field,
                },
            )
        return port

    @staticmethod
    def canonical_names(db: Session, values: Iterable[str], *, field: str = "port") -> list[str]:
        """Validate a list of ports and return their canonical names.

        Duplicates collapse (a vendor cannot list the same port twice), order is
        preserved, and an unknown value fails the whole request rather than being
        silently dropped.
        """
        resolved: list[str] = []
        for raw in values or []:
            name = (raw or "").strip()
            if not name:
                continue
            port = PortCatalogueService.resolve(db, name, field=field)
            if port.name not in resolved:
                resolved.append(port.name)
        return resolved

    # --------------------------------------------------------------- writes
    @staticmethod
    def create(
        db: Session,
        admin: User,
        name: str,
        state: Optional[str] = None,
        kind: Optional[str] = None,
        aliases: Optional[Sequence[str]] = None,
    ) -> Port:
        """Admin-only: add a port a vendor's head office needs."""
        if admin.role != UserRole.admin:
            raise HTTPException(
                status_code=http_status.HTTP_403_FORBIDDEN,
                detail="Only an administrator can add ports to the catalogue.",
            )
        cleaned = re.sub(r"\s+", " ", (name or "").strip())
        if len(cleaned) < 2:
            raise HTTPException(status_code=400, detail="Port name is too short.")
        if PortCatalogueService.find(db, cleaned) is not None:
            raise HTTPException(
                status_code=http_status.HTTP_409_CONFLICT,
                detail={
                    "code": "duplicate_port",
                    "message": f"'{cleaned}' is already in the port list.",
                },
            )
        port = Port(
            name=cleaned,
            state=(state or "").strip() or None,
            kind=(kind or "").strip() or None,
            aliases=[a.strip() for a in (aliases or []) if (a or "").strip()],
            created_by=admin.id,
            sort_order=len(PortCatalogueService.list_ports(db, include_inactive=True)),
        )
        db.add(port)
        db.commit()
        db.refresh(port)
        return port
