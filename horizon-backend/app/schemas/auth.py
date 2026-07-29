from pydantic import BaseModel, EmailStr, Field
from typing import Optional
from uuid import UUID
from datetime import datetime
from app.models.user import UserRole

# ---------------------------------------------------------
# Request Schemas
# ---------------------------------------------------------

class RegisterRequest(BaseModel):
    """
    Schema for user registration payload.
    Ensures email is valid and password meets basic constraints.
    """
    email: EmailStr
    password: str = Field(..., min_length=8, description="Password must be at least 8 characters long")
    role: UserRole = Field(default=UserRole.client)
    full_name: Optional[str] = None
    phone: Optional[str] = None

class LoginRequest(BaseModel):
    """
    Schema for login payload.
    """
    email: EmailStr
    password: str

class RefreshTokenRequest(BaseModel):
    refresh_token: str

class ForgotPasswordRequest(BaseModel):
    email: EmailStr

class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str = Field(..., min_length=8, description="Password must be at least 8 characters long")

class VerifyEmailRequest(BaseModel):
    token: str

# ---------------------------------------------------------
# Response Schemas
# ---------------------------------------------------------

class TokenResponse(BaseModel):
    """
    Schema for the JWT token response.
    """
    access_token: str
    refresh_token: Optional[str] = None
    token_type: str = "bearer"

class UserResponse(BaseModel):
    """
    Schema for sending user data back to the client.
    Critically, this DOES NOT include the password_hash.
    """
    id: UUID
    email: EmailStr
    role: UserRole
    full_name: Optional[str] = None
    phone: Optional[str] = None
    is_verified: bool
    created_at: datetime
    last_login: Optional[datetime] = None

    class Config:
        # Allows Pydantic to read data directly from the SQLAlchemy ORM model
        from_attributes = True
