"""One writer for administrative decisions outside marketplace moderation.

Nhaav already has two append-only trails:

* ``payment_audit_logs`` — tied to a subscription payment row (submit/approve/
  reject), written by :class:`PaymentService`.
* ``moderation_audit_logs`` — a generic ``entity_type + entity_id + admin_id +
  action + reason`` table used for listing moderation.

Verification decisions (account approval / rejection / clarification, document
review) and the two other money queues (company visibility, listing fees) had no
trail at all. Rather than invent a third table, this module writes those
decisions into the existing generic log, which is what it is shaped for. Every
row is created server-side, is append-only and is never editable by a user.

Entity types written here:

    profile            account verification decision (provider/client)
    document           one verification document reviewed
    profile_visibility company-profile visibility payment verified/rejected
    listing_fee        marketplace showcase payment verified/rejected

No document content, password, token or receipt payload is ever written: only
the decision, the actor and the stated reason.
"""
import uuid
from typing import Optional

from sqlalchemy.orm import Session

from app.models.moderation_audit import ModerationAuditLog
from app.models.user import User

ENTITY_PROFILE = "profile"
ENTITY_DOCUMENT = "document"
ENTITY_VISIBILITY = "profile_visibility"
ENTITY_LISTING_FEE = "listing_fee"

#: Decisions the verification workflow can record.
ACTION_APPROVED = "approved"
ACTION_REJECTED = "rejected"
ACTION_UNDER_REVIEW = "under_review"


def record_decision(
    db: Session,
    *,
    entity_type: str,
    entity_id: uuid.UUID,
    admin: Optional[User],
    action: str,
    reason: Optional[str] = None,
) -> ModerationAuditLog:
    """Append one administrative decision. The caller owns the transaction."""
    row = ModerationAuditLog(
        entity_type=entity_type,
        entity_id=entity_id,
        admin_id=admin.id if admin is not None else None,
        action=action,
        reason=(reason or "").strip()[:2000] or None,
    )
    db.add(row)
    return row
