import uuid
import enum
from datetime import datetime
from sqlalchemy import String, Float, DateTime, Enum as SQLEnum, ForeignKey
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base

class DocumentType(str, enum.Enum):
    cdc = "cdc"  # Continuous Discharge Certificate
    coc = "coc"  # Certificate of Competency
    surveyor_license = "surveyor_license"
    other = "other"

class DocumentStatus(str, enum.Enum):
    pending = "pending"
    verified = "verified"
    rejected = "rejected"

class Document(Base):
    """
    Document model for storing credentials, licenses, and maritime certificates.
    Will be used for automated OCR extraction and verification tracking.
    """
    __tablename__ = "documents"

    # Primary Key
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4, index=True)
    
    # Foreign Key to User
    # One user can have multiple documents (One-to-Many relationship)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    
    # Back-reference to the User model
    user: Mapped["User"] = relationship(back_populates="documents")
    
    # Document Details
    document_type: Mapped[DocumentType] = mapped_column(SQLEnum(DocumentType), nullable=False)
    file_url: Mapped[str] = mapped_column(String, nullable=False, comment="URL to the stored document file (e.g., S3 or Supabase Storage)")
    
    # OCR and Verification
    ocr_extracted: Mapped[dict | None] = mapped_column(JSONB, nullable=True, comment="Raw structured data extracted via OCR")
    verification_score: Mapped[float | None] = mapped_column(Float, nullable=True, comment="Confidence score from the OCR/verification pipeline")
    status: Mapped[DocumentStatus] = mapped_column(SQLEnum(DocumentStatus), nullable=False, default=DocumentStatus.pending)
    
    # Timestamps
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)

    def __repr__(self) -> str:
        """String representation for debugging."""
        return f"<Document(id={self.id}, type={self.document_type}, user_id={self.user_id}, status={self.status})>"
