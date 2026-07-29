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
    
    # Password Hash: Required. Never store plain text passwords.
    password_hash: Mapped[str] = mapped_column(String, nullable=False)
    
    # Role: Enum restricting users to specific authorization levels (provider, client, admin)
    role: Mapped[UserRole] = mapped_column(SQLEnum(UserRole), nullable=False, default=UserRole.client)
    
    # Personal Info
    full_name: Mapped[str | None] = mapped_column(String, nullable=True)
    phone: Mapped[str | None] = mapped_column(String, nullable=True)
    
    # Status flags
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    
    # Timestamps
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    last_login: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # One-to-One relationship to Profile
    profile: Mapped["Profile"] = relationship(back_populates="user", uselist=False, cascade="all, delete-orphan")
    
    # One-to-Many relationship to Documents
    documents: Mapped[list["Document"]] = relationship(back_populates="user", cascade="all, delete-orphan", foreign_keys="[Document.user_id]")
    
    # One-to-Many relationship to ServiceRequests (Jobs posted by this user)
    service_requests: Mapped[list["ServiceRequest"]] = relationship(back_populates="client", cascade="all, delete-orphan")
    
    # One-to-Many relationship to Quotes (Quotes submitted by this provider)
    quotes: Mapped[list["Quote"]] = relationship(back_populates="provider", cascade="all, delete-orphan")
    
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
