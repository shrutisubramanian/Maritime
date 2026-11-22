"""Support ticket intake.

Backs the in-app support popup. Anyone — signed in or not — can raise an issue;
the popup is reachable from public pages (landing, register, login), so the
endpoint is intentionally unauthenticated:

* a signed-in reporter has their ticket linked to their account;
* an anonymous reporter's ticket stores the name/email they typed so support
  can reply.

Every ticket is persisted in `support_tickets` (with a human-readable ticket
number) and a notification email is sent to `SUPPORT_EMAIL`. The endpoint is
rate limited per IP so it cannot be used to flood the support inbox.
"""
import logging
import secrets
from datetime import datetime

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.middleware.auth_guard import get_optional_user
from app.models.support_ticket import (
    SupportTicket,
    TicketCategory,
    TicketPriority,
    TicketStatus,
)
from app.models.user import User
from app.schemas.support_ticket import (
    ContactEnquiryRequest,
    SupportTicketContactRequest,
    SupportTicketContactResponse,
)
from app.services.email_service import (
    EmailConfigurationError,
    EmailDeliveryError,
    EmailService,
)
from app.services.rate_limit_service import RateLimitService, client_ip

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/support", tags=["Support"])

# Unambiguous alphabet for ticket numbers (no O/0/I/1 confusion when a user
# reads one back over the phone).
_TICKET_ALPHABET = "ACDEFGHJKLMNPQRTUVWXY346789"


def _generate_ticket_number() -> str:
    return "TKT-" + "".join(secrets.choice(_TICKET_ALPHABET) for _ in range(8))


def _unique_ticket_number(db: Session) -> str:
    for _ in range(10):
        candidate = _generate_ticket_number()
        exists = (
            db.query(SupportTicket.id)
            .filter(SupportTicket.ticket_number == candidate)
            .first()
        )
        if not exists:
            return candidate
    # 22^8 ≈ 5.5e10 combinations; reaching here means something is very wrong.
    raise RuntimeError("Could not generate a unique support ticket number")


def _derive_subject(payload: SupportTicketContactRequest) -> str:
    """Use the supplied subject, else a readable excerpt of the message."""
    if payload.subject and payload.subject.strip():
        return payload.subject.strip()[:200]
    first_line = payload.message.strip().splitlines()[0] if payload.message.strip() else "Support request"
    return first_line[:200]


@router.post(
    "/tickets",
    response_model=SupportTicketContactResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Raise a support ticket",
)
def create_support_ticket(
    payload: SupportTicketContactRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
):
    """Store the ticket and notify the support inbox."""
    RateLimitService.check(db, "support_ticket", client_ip(request))

    # Prefer what the reporter typed; fall back to the signed-in account so the
    # inbox always has a way to reply.
    contact_name = (payload.name or "").strip() or (
        (current_user.full_name or current_user.email) if current_user else None
    )
    contact_email = (
        str(payload.email).strip() if payload.email else (current_user.email if current_user else None)
    )
    # Is the reply address trustworthy? Only when it is the address of the
    # SIGNED-IN, email-verified account. An anonymous visitor — or a signed-in
    # user typing someone else's address — can claim any mailbox, so the
    # notification must say the address is unverified instead of presenting it
    # as the reporter's own.
    contact_verified = bool(
        current_user
        and current_user.is_verified
        and contact_email
        and contact_email.lower() == current_user.email.lower()
    )

    ticket_number = _unique_ticket_number(db)
    subject = _derive_subject(payload)

    ticket = SupportTicket(
        ticket_number=ticket_number,
        user_id=current_user.id if current_user else None,
        contact_name=contact_name,
        contact_email=contact_email,
        subject=subject,
        description=payload.message.strip(),
        category=payload.category,
        priority=TicketPriority.medium,
        status=TicketStatus.open,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(ticket)
    db.commit()

    # Notification is best-effort: the ticket is already persisted, so a mail
    # failure must not lose it or fail the request — the ticket is visible in the
    # support queue either way.
    try:
        EmailService.send_support_ticket_email(
            ticket_number=ticket_number,
            subject_line=subject,
            message=payload.message.strip(),
            contact_name=contact_name,
            contact_email=contact_email,
            category=payload.category.value,
            contact_verified=contact_verified,
        )
    except (EmailDeliveryError, EmailConfigurationError) as exc:
        logger.error(
            "Support ticket %s was stored but its notification email was not "
            "delivered (%s).",
            ticket_number,
            type(exc).__name__,
        )

    # The confirmation deliberately does NOT claim the notification was sent:
    # telling a user "we emailed the team" when delivery failed would be a false
    # statement about the system's state.
    return SupportTicketContactResponse(
        ticket_number=ticket_number,
        message=(
            f"Thanks — we have logged your issue as {ticket_number}. "
            f"Our team will get back to you by email."
        ),
    )


@router.post(
    "/contact",
    response_model=SupportTicketContactResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Send a website contact-form enquiry",
)
def create_contact_enquiry(
    payload: ContactEnquiryRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
):
    """Store a website contact-form enquiry and email the services inbox.

    Backs the contact form at the end of the Services page. Enquiries are
    sales/procurement conversations, so the notification goes to
    ``CONTACT_EMAIL`` (services@nhaav.com) instead of the support inbox. They
    share the support-ticket abuse budget: same public exposure, same limit.
    """
    RateLimitService.check(db, "support_ticket", client_ip(request))

    contact_name = payload.name.strip()
    contact_email = str(payload.email).strip()
    # Only a signed-in, email-verified account can vouch for the reply address
    # it typed; anything else is flagged as unverified in the notification.
    contact_verified = bool(
        current_user
        and current_user.is_verified
        and contact_email.lower() == current_user.email.lower()
    )

    ticket_number = _unique_ticket_number(db)
    subject = (payload.subject or "").strip()[:200] or (
        f"{payload.inquiry_type.title()} enquiry"
    )
    company = (payload.company or "").strip() or None
    phone = (payload.phone or "").strip() or None

    description = "\n".join(
        [
            f"Enquiry type: {payload.inquiry_type}",
            f"Company: {company or 'not given'}",
            f"Phone: {phone or 'not given'}",
            "",
            payload.message.strip(),
        ]
    )

    ticket = SupportTicket(
        ticket_number=ticket_number,
        user_id=current_user.id if current_user else None,
        contact_name=contact_name,
        contact_email=contact_email,
        subject=subject,
        description=description,
        category=TicketCategory.general,
        priority=TicketPriority.medium,
        status=TicketStatus.open,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(ticket)
    db.commit()

    # Best-effort, exactly like support tickets: the enquiry is persisted, so a
    # mail outage must not lose it or fail the request.
    try:
        EmailService.send_contact_enquiry_email(
            ticket_number=ticket_number,
            subject_line=subject,
            message=payload.message.strip(),
            contact_name=contact_name,
            contact_email=contact_email,
            company=company,
            phone=phone,
            inquiry_type=payload.inquiry_type,
            contact_verified=contact_verified,
        )
    except (EmailDeliveryError, EmailConfigurationError) as exc:
        logger.error(
            "Contact enquiry %s was stored but its notification email was not "
            "delivered (%s).",
            ticket_number,
            type(exc).__name__,
        )

    return SupportTicketContactResponse(
        ticket_number=ticket_number,
        message=(
            f"Thanks — your enquiry is logged as {ticket_number}. "
            f"Our services team will get back to you within 24 hours."
        ),
    )
