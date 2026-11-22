import uuid
from datetime import datetime

import enum
from sqlalchemy import String, Boolean, DateTime, Enum as SQLEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base

# Define the allowed roles as a Python Enum
class UserRole(str, enum.Enum):
    provider = "provider"
    client = "client"
    admin = "admin"
    supplier = "supplier"

class User(Base):
    """
    The central User model. This table handles authentication and core identity.
    Business-specific details (skills, ports, company) belong in a separate Profile model.
    """
    __tablename__ = "users"

    # PostgreSQL-compatible UUID primary key
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4, index=True)
    
    # Email: Must be unique and indexed for fast login lookups
    email: Mapped[str] = mapped_column(String, unique=True, index=True, nullable=False)

    # USERNAME: the administrative console signs in with a username + password,
    # never an email address (see app/routers/admin_auth.py). Nullable and
    # unique: ordinary accounts leave it NULL; only privileged accounts
    # provisioned by `python -m app.seed_admin` (ADMIN_USERNAME) carry a value.
    username: Mapped[str | None] = mapped_column(String, unique=True, index=True, nullable=True)
    
    # Password Hash: Required. Never store plain text passwords.
    password_hash: Mapped[str] = mapped_column(String, nullable=False)
    
    # Role: Enum restricting users to specific authorization levels (provider, client, admin)
    role: Mapped[UserRole] = mapped_column(SQLEnum(UserRole), nullable=False, default=UserRole.client)
    
    # Personal Info
    full_name: Mapped[str | None] = mapped_column(String, nullable=True)
    phone: Mapped[str | None] = mapped_column(String, nullable=True)
    
    # Status flags
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False)

    # Timestamp of the last successful password reset. A reset token carries an
    # `iat`; a token whose iat is not newer than this is refused, which is what
    # makes reset links single-use and lets a freshly issued link invalidate an
    # older one. NULL means the account has never reset its password.
    password_reset_at: Mapped[datetime | None] = mapped_column(
        DateTime, nullable=True
    )

    # ACCOUNT-LEVEL entitlement gate. Passes are owned by the individual account
    # (never shared through a company pool), so gating is per account too.
    # Default False = legacy behaviour (login not gated). Flips to True when the
    # account is granted an access pack / activates a subscription.
    # NOTE: this replaces the legacy Organization.access_control_enabled flag.
    access_control_enabled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )

    # ONE DEVICE PER LOGIN. The account is bound to a single device for as long
    # as it is signed in: a correct password from a SECOND device is refused
    # with a "switch devices?" challenge instead of silently sharing the
    # session (see app/services/device_session_service.py).
    #
    # `active_device_id` is a browser-generated identifier the client sends on
    # login and on every request (X-Device-Id). It is an ENTITLEMENT BOUNDARY,
    # not a security credential: it never replaces the JWT, it only decides
    # WHICH device may use the session that JWT belongs to. NULL means the
    # account is signed out (or has never logged in).
    active_device_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    # Human label for the bound device ("Chrome on Windows"), shown in the
    # switch-device prompt so the user knows what they are signing out.
    active_device_label: Mapped[str | None] = mapped_column(String(120), nullable=True)
    active_device_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    
    # Timestamps
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    last_login: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # One-to-One relationship to Profile
    profile: Mapped["Profile"] = relationship(back_populates="user", uselist=False, cascade="all, delete-orphan")
    
    # One-to-Many relationship to Documents
    documents: Mapped[list["Document"]] = relationship(back_populates="user", cascade="all, delete-orphan", foreign_keys="[Document.user_id]")
    
    # One-to-Many relationship to ServiceRequests (Jobs posted by this user)
    service_requests: Mapped[list["ServiceRequest"]] = relationship(back_populates="client", cascade="all, delete-orphan")
    
    # One-to-Many relationship to Quotes (Quotes submitted by this provider/supplier)
    quotes: Mapped[list["Quote"]] = relationship(back_populates="provider", cascade="all, delete-orphan")

    # One-to-Many relationship to SupplyListings (catalogue entries owned by a supplier)
    supply_listings: Mapped[list["SupplyListing"]] = relationship(
        "SupplyListing",
        foreign_keys="[SupplyListing.supplier_id]",
        cascade="all, delete-orphan"
    )
    
    # One-to-Many relationship to Jobs (Jobs assigned to this provider)
    jobs: Mapped[list["Job"]] = relationship(back_populates="provider", cascade="all, delete-orphan")
    
    # Relationships for Reviews
    reviews_given: Mapped[list["Review"]] = relationship(
        "Review",
        foreign_keys="[Review.reviewer_id]",
        back_populates="reviewer",
        cascade="all, delete-orphan"
    )

    reviews_received: Mapped[list["Review"]] = relationship(
        "Review",
        foreign_keys="[Review.reviewed_user_id]",
        back_populates="reviewed_user",
        cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        """
        Provides a clear string representation of the User instance, helpful for debugging logs.
        """
        return f"<User(id={self.id}, email='{self.email}', role='{self.role}')>"
