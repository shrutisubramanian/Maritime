"""Byte-signature checks for uploaded documents.

Extension and browser-supplied Content-Type are both attacker-controlled. A
file named ``certificate.pdf`` can be an HTML page, a PHP script or a zip bomb.
This module checks the first bytes actually written to disk and refuses an
extension/signature mismatch before the upload becomes a visible Document row.

Legacy plain-text formats (txt, csv) have no magic number and are accepted as
text only after a UTF-8/control-character sanity check.
"""
from __future__ import annotations

import io
import os
import zipfile

# A DOCX/XLSX is an OOXML zip. A plain ``PK`` header is not enough to prove the
# archive is safe; the caller additionally performs bounded zip inspection.
_ZIP_EXTS = {"docx", "xlsx"}
_OLE_EXTS = {"doc"}
_IMAGE_SIGNATURES = {
    "jpg": (b"\xff\xd8\xff",),
    "jpeg": (b"\xff\xd8\xff",),
    "png": (b"\x89PNG\r\n\x1a\n",),
    "webp": (b"RIFF",),
    "tif": (b"II*\x00", b"MM\x00*"),
    "tiff": (b"II*\x00", b"MM\x00*"),
}
_TEXT_EXTS = {"txt", "csv"}


def _read_head(path: str, size: int = 4096) -> bytes:
    with open(path, "rb") as handle:
        return handle.read(size)


def _is_plain_text(path: str) -> bool:
    try:
        data = _read_head(path, 64 * 1024)
        if b"\x00" in data:
            return False
        data.decode("utf-8")
        return True
    except (OSError, UnicodeDecodeError):
        return False


def validate_upload_signature(path: str, extension: str) -> tuple[bool, str]:
    """Return (ok, reason). ``extension`` is lower-case and has no dot."""
    extension = (extension or "").lower().lstrip(".")
    try:
        head = _read_head(path)
    except OSError:
        return False, "The uploaded file could not be read."

    if not head:
        return False, "The uploaded file is empty."

    if extension == "pdf":
        # PDF readers tolerate leading whitespace/JUNK before %PDF-, so search
        # the first 1 KiB but require the header to be present.
        if b"%PDF-" not in head[:1024]:
            return False, "The file content is not a valid PDF."
        return True, ""

    if extension in _IMAGE_SIGNATURES:
        if not any(head.startswith(sig) for sig in _IMAGE_SIGNATURES[extension]):
            return False, "The file content does not match its image type."
        # A RIFF container must also be a WebP, not a WAV/AVI.
        if extension == "webp" and head[8:12] != b"WEBP":
            return False, "The file content is not a valid WebP image."
        return True, ""

    if extension in _ZIP_EXTS:
        if not head.startswith(b"PK\x03\x04"):
            return False, "The file content is not a valid Office document."
        try:
            with zipfile.ZipFile(path) as archive:
                names = archive.namelist()
                if not names:
                    return False, "The Office document archive is empty."
                # Bound metadata work; the OCR path performs the full
                # decompression-bomb check against configured limits.
                if len(names) > 5000:
                    return False, "The Office document contains too many parts."
        except (zipfile.BadZipFile, OSError):
            return False, "The Office document archive is corrupt."
        return True, ""

    if extension in _OLE_EXTS:
        if not head.startswith(b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"):
            return False, "The file content is not a valid Word document."
        return True, ""

    if extension in _TEXT_EXTS:
        if not _is_plain_text(path):
            return False, "The uploaded text file is not valid UTF-8 text."
        return True, ""

    # Anything added to the allowlist later must add an explicit signature rule
    # here rather than silently bypassing content validation.
    return False, "No content-signature rule is configured for this file type."


def validate_upload_bytes(content: bytes, extension: str) -> tuple[bool, str]:
    """Byte-signature check for callers that already hold the payload in memory.

    Used by payment receipts, which are capped at a few MB. Document uploads use
    the path-based function so the payload never has to be held in memory.
    """
    extension = (extension or "").lower().lstrip(".")
    if not content:
        return False, "The uploaded file is empty."
    head = content[:4096]
    if extension == "pdf":
        if b"%PDF-" not in head[:1024]:
            return False, "The file content is not a valid PDF."
        return True, ""
    if extension in _IMAGE_SIGNATURES:
        if not any(head.startswith(sig) for sig in _IMAGE_SIGNATURES[extension]):
            return False, "The file content does not match its image type."
        if extension == "webp" and head[8:12] != b"WEBP":
            return False, "The file content is not a valid WebP image."
        return True, ""
    return False, "No content-signature rule is configured for this file type."


def _check_zip_safety(
    archive: zipfile.ZipFile, *, max_entries: int, max_uncompressed: int
) -> tuple[bool, str]:
    """Shared zip-bomb/entry checks for both the path and in-memory helpers."""
    infos = archive.infolist()
    if len(infos) > max_entries:
        return False, "The Office document contains too many parts."
    total = 0
    for info in infos:
        total += max(0, info.file_size)
        if total > max_uncompressed:
            return False, "The Office document expands beyond the allowed size."
        # Refuse path traversal inside the archive as well; a parser may
        # extract parts to disk on some platforms.
        normalized = os.path.normpath(info.filename)
        if normalized.startswith("..") or os.path.isabs(normalized):
            return False, "The Office document contains an unsafe path."
    return True, ""


def is_safe_zip(path: str, *, max_entries: int, max_uncompressed: int) -> tuple[bool, str]:
    """Reject zip bombs before python-docx/openpyxl inflate anything."""
    try:
        with zipfile.ZipFile(path) as archive:
            return _check_zip_safety(
                archive, max_entries=max_entries, max_uncompressed=max_uncompressed
            )
    except (zipfile.BadZipFile, OSError):
        return False, "The Office document archive is corrupt."


def is_safe_zip_bytes(
    content: bytes, *, max_entries: int, max_uncompressed: int
) -> tuple[bool, str]:
    """Same zip-bomb guard for callers holding the archive in memory.

    Used by the Excel profile import, which parses the upload without ever
    writing it to disk.
    """
    try:
        with zipfile.ZipFile(io.BytesIO(content)) as archive:
            return _check_zip_safety(
                archive, max_entries=max_entries, max_uncompressed=max_uncompressed
            )
    except (zipfile.BadZipFile, OSError, ValueError):
        return False, "The Office document archive is corrupt."
