"""ONE DEVICE PER LOGIN — the single-device rule.

Correct credentials are not enough to start a session when the account is
ALREADY signed in somewhere else. The second device is challenged:

    POST /auth/login   (device B; account bound to device A)
      -> 409 {"code": "device_conflict", "active_device": {...}}

...and the client asks the human: *"You are already signed in on <device A>.
Sign in here and sign that device out?"* If they confirm, the login is retried
with ``force_device_switch`` and the binding is handed to device B. From that
moment device A's JWT still decodes, but every request it makes is refused with
a 401 (see :func:`assert_request_device`, called from the auth guard), so the
account really is on exactly one device.

What this is and is not
-----------------------
The binding is an ENTITLEMENT BOUNDARY, not a credential. It never replaces the
JWT and it is not a defence against a stolen token — the device id is
client-generated and could be spoofed by a determined attacker. What it does
guarantee is the product rule: the SAME email/password cannot be used to hold
two live sessions at once, and the human is always asked before the first
session is taken away.

Backward compatibility
----------------------
A login that carries no device id (curl, an older client, the test suite) binds
nothing and is never challenged. Devices are only locked once a client actually
identifies itself, so no existing API consumer changes behaviour.
"""
from datetime import datetime

from fastapi import HTTPException, status as http_status
from sqlalchemy.orm import Session

from app.models.user import User, UserRole

#: Machine-readable code the client keys the "switch devices?" prompt off.
DEVICE_CONFLICT_CODE = "device_conflict"

#: Shown when the account is signed in elsewhere.
DEVICE_CONFLICT_MESSAGE = (
    "This account is already signed in on another device. "
    "Continue only if you want to sign that device out and use this one instead."
)

#: Shown to the device that lost the session.
DEVICE_REPLACED_MESSAGE = (
    "This session was moved to another device. Your account can be signed in on "
    "one device at a time — please log in again here if you want to switch back."
)


def _normalize(value: str | None, limit: int) -> str | None:
    if value is None:
        return None
    cleaned = value.strip()
    return cleaned[:limit] if cleaned else None


class DeviceSessionService:
    """Bind an account to exactly one device while it is signed in."""

    # ------------------------------------------------------------------ read
    @staticmethod
    def active_device(user: User) -> dict | None:
        """The device currently holding this account's session, if any."""
        if not getattr(user, "active_device_id", None):
            return None
        return {
            "label": user.active_device_label or "another device",
            "since": user.active_device_at,
        }

    # ------------------------------------------------------------------ write
    @staticmethod
    def claim(
        db: Session,
        user: User,
        device_id: str | None,
        device_label: str | None = None,
        force: bool = False,
    ) -> dict | None:
        """Claim the account's session for ``device_id``.

        Returns ``None`` when the caller sent no device id (nothing to bind, no
        rule to apply). Otherwise returns the binding that is now in force:

        ``{"label", "switched_from"}``

        Raises **409** with ``code: device_conflict`` when a DIFFERENT device
        already holds the session and the caller did not confirm the switch.

        Admins are exempt: they are platform staff, not gated accounts.
        """
        device_id = _normalize(device_id, 128)
        # The RAW label (may be absent). A client that identifies its device but
        # sends no label must not erase a label we already know, so the two uses
        # are kept apart.
        raw_label = _normalize(device_label, 120)
        if device_id is None or user.role == UserRole.admin:
            return None

        current = getattr(user, "active_device_id", None)
        if current == device_id:
            # Same device coming back (a page reload, a second tab, or a token
            # refresh) — it already owns the session, so keep it.
            user.active_device_at = datetime.utcnow()
            if raw_label:
                user.active_device_label = raw_label
            db.commit()
            return {
                "label": raw_label or user.active_device_label or "this device",
                "switched_from": None,
            }

        if current is not None and not force:
            raise HTTPException(
                status_code=http_status.HTTP_409_CONFLICT,
                detail={
                    "code": DEVICE_CONFLICT_CODE,
                    "message": DEVICE_CONFLICT_MESSAGE,
                    "active_device": {
                        "label": user.active_device_label or "another device",
                        "since": (
                            user.active_device_at.isoformat()
                            if user.active_device_at
                            else None
                        ),
                    },
                    "requesting_device": {
                        "label": raw_label or "this device"
                    },
                },
            )

        previous_label = user.active_device_label if current is not None else None
        user.active_device_id = device_id
        # A switch relabels the binding: keeping the previous device's label
        # would tell the user their new device is the old one. An unknown label
        # is recorded as the honest "this device".
        user.active_device_label = raw_label or "this device"
        user.active_device_at = datetime.utcnow()
        db.commit()
        return {
            "label": user.active_device_label,
            # Only reported when a session was actually taken over, so the UI can
            # say "we signed that other device out" instead of guessing.
            "switched_from": previous_label,
        }

    @staticmethod
    def release(db: Session, user: User) -> bool:
        """Unbind the device on logout. Idempotent."""
        if not getattr(user, "active_device_id", None):
            return False
        user.active_device_id = None
        user.active_device_label = None
        user.active_device_at = None
        db.commit()
        return True

    # ------------------------------------------------------------ enforcement
    @staticmethod
    def assert_request_device(user: User, device_id: str | None) -> None:
        """Refuse a request that does not come from the bound device.

        No-op for admins, for accounts with no binding, and for requests that
        carry no device id at all (non-browser API clients keep working exactly
        as before). Once a device IS bound, a request from a different device —
        or one that does not identify itself — is refused, because the session
        lives on that one device.
        """
        bound = getattr(user, "active_device_id", None)
        if bound is None or user.role == UserRole.admin:
            return
        if _normalize(device_id, 128) == bound:
            return

        raise HTTPException(
            status_code=http_status.HTTP_401_UNAUTHORIZED,
            detail=DEVICE_REPLACED_MESSAGE,
            headers={"WWW-Authenticate": "Bearer"},
        )
