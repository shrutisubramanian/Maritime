"""
The port catalogue.

GET   /ports            active ports — the list vendors pick their head office
                        and other ports from, and the marketplace filter list
POST  /ports            admin-only: add a port during verification
PATCH /ports/{id}       admin-only: retire or re-open a port

Head office drives discovery: a company appears under the port filter its HEAD
OFFICE belongs to, never under the other ports it merely works in. Ports are
retired rather than deleted so existing head offices stay valid.
"""
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.middleware.auth_guard import get_current_user
from app.models.port import Port
from app.models.user import User, UserRole
from app.schemas.port import PortCreate, PortPatch, PortView
from app.services.port_catalogue_service import PortCatalogueService

router = APIRouter(prefix="/ports", tags=["Ports"])


def _require_admin(user: User) -> None:
    if user.role != UserRole.admin:
        raise HTTPException(status_code=403, detail="Admin access required")


@router.get("", summary="Ports available for head offices and filters")
def list_ports(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Any signed-in account may read this: vendors need it before approval to
    set a head office, and buyers need the same names for the port filter."""
    ports = PortCatalogueService.list_ports(db)
    return {"data": [PortView.from_model(p).model_dump() for p in ports], "total": len(ports)}


@router.get("/admin", summary="Every port, including retired ones (admin)")
def list_ports_admin(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_admin(current_user)
    ports = PortCatalogueService.list_ports(db, include_inactive=True)
    return {"data": [PortView.from_model(p).model_dump() for p in ports], "total": len(ports)}


@router.post("", status_code=201, summary="Add a port (admin)")
def create_port(
    data: PortCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    port = PortCatalogueService.create(
        db, current_user, data.name, data.state, data.kind, data.aliases
    )
    return PortView.from_model(port).model_dump()


@router.patch("/{port_id}", summary="Retire or re-open a port (admin)")
def patch_port(
    port_id: uuid.UUID,
    data: PortPatch,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_admin(current_user)
    port = db.query(Port).filter(Port.id == port_id).first()
    if port is None:
        raise HTTPException(status_code=404, detail="Port not found")
    if data.is_active is not None:
        port.is_active = data.is_active
    db.commit()
    db.refresh(port)
    return PortView.from_model(port).model_dump()
