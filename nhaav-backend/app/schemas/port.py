"""Port catalogue request/response models."""
from typing import List, Optional

from pydantic import BaseModel, Field


class PortView(BaseModel):
    id: str
    name: str
    state: Optional[str] = None
    kind: Optional[str] = None
    aliases: List[str] = Field(default_factory=list)
    is_active: bool = True

    @classmethod
    def from_model(cls, port) -> "PortView":
        return cls(
            id=str(port.id),
            name=port.name,
            state=port.state,
            kind=port.kind,
            aliases=list(port.aliases or []),
            is_active=bool(port.is_active),
        )


class PortCreate(BaseModel):
    """Admin creation of a port a vendor's head office needs."""

    name: str = Field(..., min_length=2, max_length=120)
    state: Optional[str] = Field(None, max_length=80)
    kind: Optional[str] = Field(None, max_length=40)
    aliases: List[str] = Field(default_factory=list)


class PortPatch(BaseModel):
    is_active: Optional[bool] = None
