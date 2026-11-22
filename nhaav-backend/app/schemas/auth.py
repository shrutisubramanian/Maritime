from pydantic import (
    BaseModel,
    EmailStr,
    Field,
    computed_field,
    field_validator,
    model_validator,
)
from typing import Optional
from uuid import UUID
from datetime import datetime
from app.models.user import UserRole
from app.utils.password import validate_password_strength

# H-1: the ONLY roles public registration may create. Kept at module level so
# pydantic cannot treat it as a private model attribute.
_PUBLIC_REGISTRATION_ROLES = frozenset(
    {UserRole.client, UserRole.supplier, UserRole.provider}
)

# ---------------------------------------------------------
# Request Schemas
# ---------------------------------------------------------

class RegisterRequest(BaseModel):
    """
    Schema for user registration payload.
    Ensures email is valid and password meets basic constraints.

    SECURITY (H-1): the client may only choose among the PUBLIC roles
    (client / supplier / provider). A client-supplied privileged role such as
    "admin" is REJECTED outright — privileged accounts are created exclusively
    through the controlled admin bootstrap, never through public registration.
    """
    email: EmailStr
    password: str = Field(..., min_length=8, description="Password must be at least 8 characters long")
    role: UserRole = Field(default=UserRole.client)
    full_name: Optional[str] = None
    # Compatibility alias. Older clients (and the mobile form) post `name`;
    # `full_name` is the canonical stored field. Both are accepted, and sending
    # two DIFFERENT values is rejected rather than silently picking one.
    name: Optional[str] = None
    phone: Optional[str] = None
    # Company / job title captured at sign-up. They seed the account's profile
    # (see AuthService.register_user), so the admin review queue has real
    # company details from the very first login instead of an empty row.
    company: Optional[str] = None
    designation: Optional[str] = None

    _PUBLIC_REGISTRATION_ROLES = None  # replaced by module-level constant

    @model_validator(mode="after")
    def reconcile_name_fields(self):
        """Collapse `full_name` / `name` into one canonical value."""
        full_name = (self.full_name or "").strip() or None
        alias = (self.name or "").strip() or None

        if full_name and alias and full_name != alias:
            raise ValueError(
                "Conflicting name values: send either full_name or name, "
                "or the same value in both"
            )

        canonical = full_name or alias
        if canonical:
            self.full_name = canonical
            self.name = canonical
        else:
            self.full_name = None
            self.name = None
        return self

    @field_validator("role")
    @classmethod
    def role_must_be_public(cls, v: UserRole) -> UserRole:
        if v not in _PUBLIC_REGISTRATION_ROLES:
            raise ValueError(
                "Registration cannot create a privileged account. "
                "Choose client, supplier or provider."
            )
        return v

    @field_validator("password")
    @classmethod
    def password_must_meet_policy(cls, v: str) -> str:
        return validate_password_strength(v)

class LoginRequest(BaseModel):
    """
    Schema for login payload.

    ONE DEVICE PER LOGIN: `device_id` is an identifier the client generates and
    keeps locally; `device_label` is the human name for it ("Chrome on
    Windows"). Both may also arrive as the `X-Device-Id` / `X-Device-Label`
    headers — the body wins when both are present.

    `force_device_switch` is set on the RETRY that follows the 409
    `device_conflict` challenge: it means the human confirmed that the other
    device should be signed out. It is meaningless on a first attempt.
    """
    email: EmailStr
    password: str
    device_id: Optional[str] = None
    device_label: Optional[str] = None
    force_device_switch: bool = False


class AdminLoginRequest(BaseModel):
    """
    Schema for ADMIN console sign-in: username + password.

    The back-office terminal has no email field — `username` identifies the
    account (``users.username``, provisioned by ``python -m app.seed_admin``
    from ``ADMIN_USERNAME``).

    `email` stays accepted so existing API clients and seed tooling keep
    working; at least one of the two identifiers is required.
    """
    username: Optional[str] = Field(default=None, max_length=150)
    email: Optional[EmailStr] = None
    password: str
    device_id: Optional[str] = None
    device_label: Optional[str] = None
    force_device_switch: bool = False

    @field_validator("username")
    @classmethod
    def normalize_username(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        v = v.strip()
        return v or None

    @model_validator(mode="after")
    def identifier_required(self):
        if not self.username and not self.email:
            raise ValueError("An admin username is required.")
        return self


class RefreshTokenRequest(BaseModel):
    # Optional: a browser sends its refresh token as the httpOnly
    # `nhaav_refresh` cookie and has no copy to put in the body. API clients
    # may still send it explicitly, and an explicit value wins.
    refresh_token: Optional[str] = None

class ForgotPasswordRequest(BaseModel):
    email: EmailStr

class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str = Field(..., min_length=8, description="Password must be at least 8 characters long")

    @field_validator("new_password")
    @classmethod
    def new_password_must_meet_policy(cls, v: str) -> str:
        return validate_password_strength(v)

class ResetPasswordWithCodeRequest(BaseModel):
    """Email + the 6-digit code from the inbox + the password to set."""
    email: EmailStr
    code: str = Field(..., min_length=4, max_length=12, description="The code from the reset email")
    new_password: str = Field(..., min_length=8, description="Password must be at least 8 characters long")

    @field_validator("new_password")
    @classmethod
    def new_password_must_meet_policy(cls, v: str) -> str:
        return validate_password_strength(v)

class VerifyEmailRequest(BaseModel):
    token: str

# ---------------------------------------------------------
# Response Schemas
# ---------------------------------------------------------

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

    @computed_field  # type: ignore[prop-decorator]
    @property
    def name(self) -> Optional[str]:
        """Alias of `full_name` for clients that expect `name`.

        Always derived, never stored separately, so the two can never disagree.
        """
        return self.full_name

    class Config:
        # Allows Pydantic to read data directly from the SQLAlchemy ORM model
        from_attributes = True

class TokenResponse(BaseModel):
    """
    Schema for the JWT token response.

    `access_session` carries the organization access-token session info when
    the login holds one (a freshly allocated pass, or the account's existing
    live pass reused by a repeat login). It is informational only — the opaque
    entitlement itself never leaves the server.

    `user` lets the client bootstrap the signed-in profile from the login
    response alone, which matters for a renewal-only login: such an account has
    no access pass, so the access-gated `/auth/me` endpoint would (correctly)
    reject it. Identity is carried by the JWT, never by the access pass.

    `access_blocked` is set (with a human-readable reason) when a gated
    organization may not start a NEW session right now — pending, expired or
    cancelled subscription. The login still succeeds so the user can reach the
    renewal/payment flow; nothing is activated here.
    """
    access_token: Optional[str] = None
    refresh_token: Optional[str] = None
    token_type: str = "bearer"
    access_session: Optional[dict] = None
    access_blocked: Optional[str] = None
    user: Optional[UserResponse] = None
    # Which device now owns the session (`label`) and, when this login took the
    # session over from another device, the label of the one just signed out.
    device_session: Optional[dict] = None
