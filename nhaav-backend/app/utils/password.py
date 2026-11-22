"""
Password hashing.

Uses `bcrypt` DIRECTLY, deliberately not `passlib`.

passlib 1.7.4 (its last release) is incompatible with bcrypt >= 4.1. It reads
`bcrypt.__about__.__version__`, which newer bcrypt removed, and its backend
self-test (detect_wrap_bug) hashes a secret longer than 72 bytes, which newer
bcrypt REJECTS with ValueError instead of silently truncating. The result was
that every verify_password call raised and every login returned 500, for all
accounts, whether or not the password was correct.

Talking to bcrypt ourselves removes both failure modes and works across bcrypt
versions. Stored hashes are plain "$2b$" bcrypt strings, so hashes written by
the old passlib code still verify unchanged.
"""

import re

import bcrypt

# bcrypt only consumes the first 72 bytes of input. Older releases truncated
# silently; >= 4.1 raises ValueError. Truncate explicitly so behaviour is
# identical on every version, and identical between hash and verify.
_MAX_PASSWORD_BYTES = 72

#: Public password policy. The frontend mirrors these three rules; the API
#: enforces them again so a direct request cannot bypass the browser.
PASSWORD_MIN_LENGTH = 8
PASSWORD_REQUIREMENT_MESSAGE = (
    "Password must be at least 8 characters long and include at least one "
    "number and one special character."
)

# A real bcrypt hash is exactly 60 characters: $2a$/$2b$/$2y$, a two-digit cost,
# then 53 characters of the bcrypt base64 alphabet. Anything else is a corrupt
# row. This is checked BEFORE calling bcrypt because the Rust binding panics
# (pyo3 PanicException, which derives from BaseException and so evades an
# `except Exception`) on a hash like "$2b$12$broken" — one bad row would turn
# an authentication attempt into a 500 and could abort the worker.
_BCRYPT_HASH_RE = re.compile(r"^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$")


def _prepare(password: str) -> bytes:
    """Encode to UTF-8 and cap at bcrypt's 72-byte limit."""
    raw = password if isinstance(password, bytes) else (password or "").encode("utf-8")
    return raw[:_MAX_PASSWORD_BYTES]


def password_meets_policy(password: str) -> bool:
    """True when the password satisfies every registration/reset rule."""
    value = password or ""
    return (
        len(value) >= PASSWORD_MIN_LENGTH
        and any(char.isdigit() for char in value)
        and any((not char.isalnum() and not char.isspace()) for char in value)
    )


def validate_password_strength(password: str) -> str:
    """Raise a human-readable ValueError when the password is too weak.

    Kept separate from hashing so request schemas can reject a weak password
    before any account work or bcrypt call happens.
    """
    if not password_meets_policy(password):
        raise ValueError(PASSWORD_REQUIREMENT_MESSAGE)
    return password


def hash_password(password: str) -> str:
    """Generate a bcrypt hash for the provided plaintext password."""
    return bcrypt.hashpw(_prepare(password), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Verify a plain password against the stored hash.

    Returns False for a missing or malformed hash rather than raising, so one
    bad database row can never turn a failed login into a 500.
    """
    if not hashed_password or not isinstance(hashed_password, str):
        return False
    if not _BCRYPT_HASH_RE.match(hashed_password):
        return False
    try:
        return bcrypt.checkpw(_prepare(plain_password), hashed_password.encode("utf-8"))
    except (ValueError, TypeError):
        return False
    except BaseException:  # noqa: BLE001 - pyo3_backend.PanicException is a BaseException
        # Defensive net for a bcrypt backend panic on input that passed the shape
        # check. A malformed stored hash must never become a 500 at login.
        return False
