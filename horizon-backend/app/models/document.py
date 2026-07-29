import uuid
import enum
from datetime import datetime
from sqlalchemy import String, Float, DateTime, Enum as SQLEnum, ForeignKey, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base

class DocumentType(str, enum.Enum):
    cdc = "cdc"  # Continuous Discharge Certificate
    coc = "coc"  # Certificate of Competency
    surveyor_license = "surveyor_license"
    vendor_registration = "vendor_registration"
    kyc_due_diligence = "kyc_due_diligence"
    form_10f = "form_10f"
    no_pe_declaration = "no_pe_declaration"
    tax_invoice = "tax_invoice"
    other = "other"

class DocumentStatus(str, enum.Enum):
    pending = "pending"
    verified = "verified"
    rejected = "rejected"
    extracted = "extracted"

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
    user: Mapped["User"] = relationship(back_populates="documents", foreign_keys="[Document.user_id]")
    
    # Document Details
    document_type: Mapped[DocumentType] = mapped_column(SQLEnum(DocumentType), nullable=False)
    file_url: Mapped[str] = mapped_column(String, nullable=False, comment="URL to the stored document file (e.g., S3 or Supabase Storage)")
    
    # OCR and Verification
    ocr_extracted_data: Mapped[dict | None] = mapped_column(JSON, nullable=True, comment="Raw structured data extracted via OCR")
    verification_score: Mapped[float | None] = mapped_column(Float, nullable=True, comment="Confidence score from the OCR/verification pipeline")
    verification_status: Mapped[DocumentStatus] = mapped_column(SQLEnum(DocumentStatus), nullable=False, default=DocumentStatus.pending)

    # Added columns for classification and modular extraction pipeline
    name: Mapped[str | None] = mapped_column(String, nullable=True)
    extracted_text: Mapped[str | None] = mapped_column(String, nullable=True)
    doc_category: Mapped[str | None] = mapped_column(String, nullable=True)
    source: Mapped[str | None] = mapped_column(String, nullable=True)
    expiry_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    verified_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    
    # Timestamps
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)

    def __repr__(self) -> str:
        """String representation for debugging."""
        return f"<Document(id={self.id}, type={self.document_type}, user_id={self.user_id}, status={self.verification_status})>"
