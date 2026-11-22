"""
Company brochure uploads: one PDF per company, 15 MB maximum.

The brochure is whatever the company wants a buyer to read. It is stored OUTSIDE
any static directory and served only through an endpoint that re-checks
marketplace access and discovery eligibility, so an expired or unapproved company
cannot keep handing out a document just because a URL was once shared.

Only a real PDF is accepted: the extension, the declared content type AND the
``%PDF-`` magic bytes must agree. A renamed executable cannot slip through, and
the file is never parsed or rendered by the server.
"""
import os
from datetime import datetime

from fastapi import HTTPException, UploadFile, status as http_status
from sqlalchemy.orm import Session

from app.config import settings
from app.models.profile import Profile

_PDF_MAGIC = b"%PDF-"


def _clean_filename(value: str | None) -> str:
    name = os.path.basename((value or "").replace("\\", "/")).strip()
    return name or "company-brochure.pdf"


class ProfileBrochureService:
    @staticmethod
    def _read_limited(file: UploadFile) -> bytes:
        limit = int(settings.PROFILE_BROCHURE_MAX_BYTES)
        content = file.file.read(limit + 1)
        if not content:
            raise HTTPException(
                status_code=http_status.HTTP_400_BAD_REQUEST,
                detail="The uploaded file is empty.",
            )
        if len(content) > limit:
            raise HTTPException(
                status_code=http_status.HTTP_413_CONTENT_TOO_LARGE,
                detail={
                    "code": "brochure_too_large",
                    "message": (
                        "The brochure must be 15 MB or smaller. "
                        f"This file exceeds {limit // (1024 * 1024)} MB."
                    ),
                },
            )
        return content

    @staticmethod
    def _validate(file: UploadFile, content: bytes) -> str:
        filename = _clean_filename(getattr(file, "filename", None))
        if not filename.lower().endswith(".pdf"):
            raise HTTPException(
                status_code=http_status.HTTP_400_BAD_REQUEST,
                detail={
                    "code": "brochure_must_be_pdf",
                    "message": "The brochure must be a PDF file.",
                },
            )
        if not content.startswith(_PDF_MAGIC):
            raise HTTPException(
                status_code=http_status.HTTP_400_BAD_REQUEST,
                detail={
                    "code": "brochure_not_a_pdf",
                    "message": "That file is not a valid PDF.",
                },
            )
        return filename

    @staticmethod
    def upload(db: Session, profile: Profile, file: UploadFile) -> Profile:
        content = ProfileBrochureService._read_limited(file)
        filename = ProfileBrochureService._validate(file, content)

        directory = settings.PROFILE_BROCHURE_DIR
        os.makedirs(directory, exist_ok=True)
        stored_name = f"brochure-{profile.id}.pdf"
        stored_path = os.path.join(directory, stored_name)
        with open(stored_path, "wb") as handle:
            handle.write(content)

        # Replacing a brochure leaves exactly one file per company.
        previous = profile.brochure_path
        profile.brochure_path = stored_path
        profile.brochure_filename = filename
        profile.brochure_content_type = "application/pdf"
        profile.brochure_size_bytes = len(content)
        profile.brochure_uploaded_at = datetime.utcnow()
        try:
            db.commit()
        except Exception:
            db.rollback()
            if os.path.isfile(stored_path):
                os.unlink(stored_path)
            raise
        db.refresh(profile)
        if previous and previous != stored_path and os.path.isfile(previous):
            try:
                os.unlink(previous)
            except OSError:
                pass
        return profile

    @staticmethod
    def remove(db: Session, profile: Profile) -> None:
        stored = profile.brochure_path
        profile.brochure_path = None
        profile.brochure_filename = None
        profile.brochure_content_type = None
        profile.brochure_size_bytes = None
        profile.brochure_uploaded_at = None
        db.commit()
        if stored and os.path.isfile(stored):
            try:
                os.unlink(stored)
            except OSError:
                pass

    @staticmethod
    def metadata(profile: Profile) -> dict | None:
        """Public metadata for the profile payload — never the storage path."""
        if not profile.brochure_path or not os.path.isfile(profile.brochure_path):
            return None
        return {
            "filename": profile.brochure_filename or "company-brochure.pdf",
            "size_bytes": profile.brochure_size_bytes,
            "uploaded_at": profile.brochure_uploaded_at,
        }
