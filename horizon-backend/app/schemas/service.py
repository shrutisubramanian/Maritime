import uuid
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, ConfigDict

class ServiceBase(BaseModel):
    name: str
    category: str
    subcategory: Optional[str] = None
    description: Optional[str] = None
    pricing_model: Optional[str] = None
    is_active: bool = True
    certifications_required: Optional[List[str]] = None
    images: Optional[List[str]] = None

class ServiceCreate(ServiceBase):
    pass

class ServiceUpdate(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    subcategory: Optional[str] = None
    description: Optional[str] = None
    pricing_model: Optional[str] = None
    is_active: Optional[bool] = None
    certifications_required: Optional[List[str]] = None
    images: Optional[List[str]] = None

class ServiceResponse(ServiceBase):
    id: uuid.UUID
    provider_id: uuid.UUID
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
