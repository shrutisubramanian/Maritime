"""URL-shape validation for user-supplied attachment values.

Attachments on quotations and procurement requests are stored as opaque strings
and rendered as links by the client. The client already refuses dangerous
schemes (``safeAttachmentHref``), but the API is reachable directly: a value
like ``javascript:alert(document.cookie)`` stored here would be rendered as a
link by any consumer that forgets to re-check, and would also be handed to
integrators through the public JSON API. Validation therefore belongs at the
schema boundary, not only in one rendering path.

Rule: an attachment is either
  * an absolute http(s) URL,
  * a site-relative path (``/uploads/…``), or
  * a bare file name / relative path (``specification.pdf``, ``docs/a.pdf``).

Everything else — other schemes, protocol-relative URLs (which silently become
a foreign origin), and any obfuscation of those — is rejected.

Normalization is deliberately aggressive before the scheme test, because
browsers strip whitespace/control characters from URLs and percent-decode
them: ``jav\\tascript:``, ``java%0dscript:``, ``JAVASCRIPT:`` and
``%6a%61vascript:`` are all interpreted as ``javascript:`` by a browser.
"""
import re
from urllib.parse import unquote

# Characters browsers ignore inside a scheme (whitespace + C0/C1 controls).
_IGNORABLE = re.compile(r"[\s\x00-\x1f\x7f-\x9f]+")

# A leading scheme: ALPHA *( ALPHA / DIGIT / "+" / "-" / "." ) ":"
_SCHEME = re.compile(r"^([a-z][a-z0-9+.\-]*):")

# Only these may be used as an absolute link in an attachment slot.
_ALLOWED_SCHEMES = frozenset({"http", "https"})


def _normalize(value: str) -> str:
    """Fold a value into the form a browser would actually navigate to."""
    # Decode twice: percent-encoding can be layered (%256a → %6a → j).
    decoded = unquote(unquote(value))
    return _IGNORABLE.sub("", decoded).lower()


def is_safe_attachment(value: str) -> bool:
    """True when ``value`` is safe to store and later render as a link."""
    if not isinstance(value, str):
        return False

    stripped = value.strip()
    if not stripped:
        return False

    normalized = _normalize(stripped)
    if not normalized:
        return False

    # Protocol-relative URL: rendered as https://<attacker host>.
    if normalized.startswith("//"):
        return False

    match = _SCHEME.match(normalized)
    if match is None:
        # No scheme at all: a relative path or a bare file name.
        return True
    return match.group(1) in _ALLOWED_SCHEMES


def validate_attachment_list(values: list[str] | None) -> list[str] | None:
    """Validate a list of attachment values, returning it unchanged.

    Raises ValueError (which pydantic turns into a 422) naming the offending
    entry's position, so the caller learns which value was refused without the
    error echoing a potentially hostile URL back verbatim.
    """
    if values is None:
        return None
    for index, value in enumerate(values):
        if not is_safe_attachment(value):
            raise ValueError(
                f"attachment {index} is not an allowed URL. Use an https:// link, "
                "a /relative/path, or a plain file name."
            )
    return values
