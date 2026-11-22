"""Transactional email delivery.

Content is authored ONCE, as plain text, by :class:`EmailService`. A backend
owns transport and derives the HTML alternative from that text. Keeping the
text authoritative is what makes the "no token in logs" rule auditable: the
plain-text body is the only representation that ever reaches a log sink, and
:class:`ConsoleEmailBackend` deliberately logs a summary instead of the body.

Backends, selected by ``EMAIL_BACKEND`` (alias ``SMTP_BACKEND``):

* ``smtp``    — real delivery through ``smtplib`` with STARTTLS and certificate
  validation. Required outside local development.
* ``console`` — logs a one-line summary (recipient + subject) and sends nothing.
  Intended for local development only; production refuses to boot with it, so a
  deployment can never silently pretend mail was delivered.

Failure policy
--------------
A backend either succeeds or raises:

* :class:`EmailConfigurationError` — the deployment is misconfigured (missing
  host or sender). Not retryable by the user.
* :class:`EmailDeliveryError` — the transport failed (auth, timeout, DNS,
  socket). Retryable through the resend endpoint.

Callers decide what to do, because the right answer differs per flow:

* registration lets the error reach the router, which answers 503 while keeping
  the already-created account so the user can retry with "resend verification";
* the always-200 endpoints (forgot-password, resend-verification) swallow it, so
  a delivery failure cannot be used to discover whether an address exists;
* the support-ticket path ignores it, because the ticket is already persisted.

Secrets
-------
The SMTP password is never logged, never returned in an API response, never put
in an exception message and never sent to the frontend. Exception messages carry
the host, port and exception *type* only.
"""
import html as _html
import logging
import re
import smtplib
import ssl
from email.message import EmailMessage
from email.utils import formataddr, parseaddr
from typing import Optional

from app.config import settings

logger = logging.getLogger("nhaav.email")

# Any http(s) URL in a plain-text body is linked in the HTML alternative.
_URL_RE = re.compile(r"(https?://[^\s<>\"')]+)")


class EmailConfigurationError(RuntimeError):
    """The email backend is misconfigured; no delivery was attempted."""


class EmailDeliveryError(RuntimeError):
    """The transport failed after a delivery attempt was made."""


# --------------------------------------------------------------------- rendering
def _linkify(escaped_text: str) -> str:
    """Turn bare URLs inside already-escaped text into anchors."""
    return _URL_RE.sub(
        lambda m: (
            # escaped_text has HTML entities; unescape only for the URL value,
            # then re-escape it in the attribute. This prevents a URL that
            # contains a quote or angle bracket from breaking out of href.
            f'<a href="{_html.escape(_html.unescape(m.group(1)), quote=True)}" '
            f'style="color:#0D3B66;text-decoration:underline;word-break:break-all;">'
            f"{m.group(1)}</a>"
        ),
        escaped_text,
    )


def _html_document(body: str) -> str:
    """
    Build the branded HTML alternative for a plain-text body.

    Paragraphs are split on blank lines; the first paragraph that is a bare URL
    becomes the call-to-action button. The text remains the single source of
    truth, so the two representations can never drift apart.
    """
    blocks = [b.strip() for b in body.split("\n\n") if b.strip()]

    cta_url: Optional[str] = None
    rendered: list[str] = []
    for block in blocks:
        if cta_url is None and block.startswith(("http://", "https://")):
            cta_url = block
            continue
        rendered.append(
            '<p style="margin:0 0 16px;">'
            + _linkify(_html.escape(block)).replace("\n", "<br />")
            + "</p>"
        )

    button = ""
    if cta_url:
        button = (
            '<div style="margin:24px 0;">'
            f'<a href="{_html.escape(cta_url, quote=True)}" style="display:inline-block;background:#0D3B66;'
            "color:#FFF36D;text-decoration:none;padding:13px 26px;border-radius:10px;"
            'font-size:14px;font-weight:700;">Continue</a>'
            "</div>"
        )

    return f"""\
<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#F4F1E8;font-family:Helvetica,Arial,sans-serif;color:#163746;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border-radius:12px;border:1px solid #E4D9B4;">
            <tr>
              <td style="background:#0D3B66;padding:20px 28px;border-radius:12px 12px 0 0;">
                <span style="color:#FFF36D;font-size:18px;font-weight:800;letter-spacing:-0.02em;">NHAAV</span>
                <span style="color:#4C9DB0;font-size:11px;font-weight:600;margin-left:8px;">MARITIME</span>
              </td>
            </tr>
            <tr>
              <td style="padding:28px;font-size:14px;line-height:1.7;color:#4A606D;">
                {button}
                {"".join(rendered)}
              </td>
            </tr>
            <tr>
              <td style="padding:16px 28px 24px;border-top:1px solid #E4D9B4;font-size:11px;color:#8FA6B2;">
                Nhaav Maritime — you are receiving this message because someone used
                this address on nhaav.com. If that was not you, you can ignore it.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>"""


def _from_display() -> tuple[str, str]:
    """Return ``(display_name, address)`` for the configured sender."""
    name, addr = parseaddr(settings.EMAIL_FROM)
    if not addr:  # malformed value — treat the raw string as the address
        return settings.EMAIL_FROM_NAME, settings.EMAIL_FROM
    return (name or settings.EMAIL_FROM_NAME), addr


# ---------------------------------------------------------------------- backends
class ConsoleEmailBackend:
    """
    Development backend: reports what *would* have been sent, and nothing more.

    The body is never written to a log sink — it carries verification and reset
    tokens, so logging it would leak credentials into stdout, deploy logs and
    any attached log drain.
    """

    name = "console"

    def send(self, to_email: str, subject: str, body: str) -> bool:
        logger.info(
            "[console email] to=%s subject=%r (body withheld: it contains a "
            "verification/reset token)",
            to_email,
            subject,
        )
        return True


class SMTPEmailBackend:
    """
    Real delivery over SMTP.

    Uses STARTTLS with a default SSL context (certificate chain and hostname
    are validated) and a bounded socket timeout so a slow or unreachable mail
    server can never hold a request thread open indefinitely. Gmail is the
    reference configuration: ``smtp.gmail.com:587`` plus an App Password.
    """

    name = "smtp"

    def __init__(
        self,
        host: str,
        port: int,
        username: str,
        password: str,
        from_addr: str,
        from_name: str = "",
        use_tls: bool = True,
        timeout: int = 10,
    ) -> None:
        self.host = host
        self.port = port
        self.username = username
        self._password = password
        self.from_addr = from_addr
        self.from_name = from_name
        self.use_tls = use_tls
        self.timeout = timeout

    def _message(self, to_email: str, subject: str, body: str) -> EmailMessage:
        msg = EmailMessage()
        msg["Subject"] = subject
        msg["From"] = (
            formataddr((self.from_name, self.from_addr))
            if self.from_name
            else self.from_addr
        )
        msg["To"] = to_email
        msg.set_content(body)
        msg.add_alternative(_html_document(body), subtype="html")
        return msg

    def _connect(self) -> smtplib.SMTP:
        if not self.use_tls:
            return smtplib.SMTP(self.host, self.port, timeout=self.timeout)

        context = ssl.create_default_context()
        server = smtplib.SMTP(self.host, self.port, timeout=self.timeout)
        try:
            server.starttls(context=context)
        except Exception:
            server.close()
            raise
        return server

    def send(self, to_email: str, subject: str, body: str) -> bool:
        msg = self._message(to_email, subject, body)
        try:
            with self._connect() as server:
                if self.username:
                    server.login(self.username, self._password)
                server.send_message(msg)
        except smtplib.SMTPAuthenticationError:
            # Deliberately does not echo the server's response or any credential.
            raise EmailDeliveryError(
                f"SMTP authentication was rejected by {self.host}:{self.port} "
                f"(check the SMTP username and App Password)"
            ) from None
        except (smtplib.SMTPException, OSError) as exc:
            raise EmailDeliveryError(
                f"SMTP delivery to {self.host}:{self.port} failed "
                f"({type(exc).__name__})"
            ) from None

        logger.info("Sent %r to %s", subject, to_email)
        return True


def get_email_backend():
    """
    Build the backend named by ``EMAIL_BACKEND`` / ``SMTP_BACKEND``.

    Raises :class:`EmailConfigurationError` rather than degrading quietly, so a
    misconfigured deployment is loud instead of pretending to send.
    """
    backend = (settings.EMAIL_BACKEND or "").strip().lower()

    if backend == "console":
        return ConsoleEmailBackend()

    if backend == "smtp":
        missing = []
        if not settings.EMAIL_HOST:
            missing.append("EMAIL_HOST (SMTP_HOST)")
        if not settings.EMAIL_FROM:
            missing.append("EMAIL_FROM (SMTP_FROM_EMAIL)")
        if missing:
            raise EmailConfigurationError(
                "EMAIL_BACKEND=smtp requires: " + ", ".join(missing)
            )
        return SMTPEmailBackend(
            host=settings.EMAIL_HOST,
            port=settings.EMAIL_PORT,
            username=settings.EMAIL_HOST_USER,
            password=settings.EMAIL_HOST_PASSWORD,
            from_addr=settings.EMAIL_FROM,
            from_name=settings.EMAIL_FROM_NAME,
            use_tls=settings.EMAIL_USE_TLS,
            timeout=settings.EMAIL_TIMEOUT_SECONDS,
        )

    raise EmailConfigurationError(
        f"Unknown EMAIL_BACKEND {backend!r}; expected 'smtp' or 'console'."
    )


# ----------------------------------------------------------------------- sending
class EmailService:
    """Composes the platform's transactional email and hands it to a backend."""

    # Link shapes are consumed by the frontend: /login redirects ?verify_token
    # to /verify-email and ?reset_token to /reset-password. Both are defined
    # here so the composer is the only place that knows them.
    @staticmethod
    def verification_link(token: str) -> str:
        return f"{settings.FRONTEND_URL}/login?verify_token={token}"

    @staticmethod
    def password_reset_link(token: str) -> str:
        return f"{settings.FRONTEND_URL}/login?reset_token={token}"

    @staticmethod
    def _resolve(token_or_url: str, link_builder) -> tuple[str, str]:
        """Accept either a bare token or an already-built URL."""
        if isinstance(token_or_url, str) and token_or_url.startswith(
            ("http://", "https://")
        ):
            url = token_or_url
            token = url.split("token=", 1)[1].split("&", 1)[0] if "token=" in url else ""
        else:
            token = token_or_url
            url = link_builder(token)
        return url, token

    @staticmethod
    def _send(to_email: str, subject: str, body: str) -> bool:
        """Hand the message to the configured backend.

        The backend is resolved per call (never cached) so a caller — or a test
        — can swap it without restarting the process. A backend that returns
        without raising has delivered, so the result is reported as True rather
        than echoing whatever the backend happened to return.
        """
        get_email_backend().send(to_email, subject, body)
        return True

    @staticmethod
    def send_verification_email(to_email: str, token_or_url: str) -> bool:
        url, token = EmailService._resolve(
            token_or_url, EmailService.verification_link
        )
        # The token lives ONLY inside the link. It is never printed as a bare
        # code, so the email carries no credential a reader could copy out of
        # context — verification happens by clicking Continue.
        body = (
            "Welcome to Nhaav Maritime.\n\n"
            "Confirm your email address to activate your account by clicking "
            "Continue below.\n\n"
            f"{url}\n\n"
            "This link expires in 24 hours.\n\n"
            "If you did not create an account, you can ignore this message.\n"
        )
        return EmailService._send(
            to_email, "Verify your email address — Nhaav Maritime", body
        )

    @staticmethod
    def send_password_reset_email(to_email: str, token_or_url: str) -> bool:
        url, token = EmailService._resolve(
            token_or_url, EmailService.password_reset_link
        )
        # As with verification, the token travels only inside the link — the
        # body carries no bare code.
        body = (
            "We received a request to reset your Nhaav Maritime password.\n\n"
            "Choose a new password by clicking Continue below.\n\n"
            f"{url}\n\n"
            "This link expires in 1 hour and can only be used once.\n\n"
            "If you did not request this, no action is needed.\n"
        )
        return EmailService._send(
            to_email, "Reset your password — Nhaav Maritime", body
        )

    @staticmethod
    def send_password_reset_code(to_email: str, code: str) -> bool:
        """Mail the 6-digit reset code.

        Unlike the reset LINK, the secret here IS the code printed in the body —
        that is the whole point of a code flow. It is therefore never logged:
        the console backend withholds every body, and this method never passes
        the code to a logger.
        """
        body = (
            "We received a request to reset your Nhaav Maritime password.\n\n"
            "Your reset code is\n\n"
            f"{code}\n\n"
            "Enter it in the app together with the new password you want. "
            "The code expires in 10 minutes and works once.\n\n"
            "If you did not request this, no action is needed — your password "
            "stays unchanged.\n"
        )
        return EmailService._send(
            to_email, "Your password reset code — Nhaav Maritime", body
        )

    @staticmethod
    def send_support_ticket_email(
        ticket_number: str,
        subject_line: str,
        message: str,
        contact_name: Optional[str],
        contact_email: Optional[str],
        category: str,
        contact_verified: bool = True,
    ) -> bool:
        """Notify the support inbox that a ticket was raised.

        ``contact_verified`` is False when the reply address was merely TYPED by
        an unauthenticated visitor (or differs from the signed-in account). The
        notification then says so explicitly, so support never treats an
        attacker-supplied address as the reporter's own.
        """
        who = (
            f"{contact_name or 'Anonymous'} "
            f"<{contact_email or 'no reply address given'}>"
        )
        if not contact_verified:
            who += "  [UNVERIFIED — address typed by the submitter]"
        body = (
            "A new support ticket was raised in the app.\n\n"
            f"Ticket: {ticket_number}\n"
            f"Category: {category}\n"
            f"From: {who}\n"
            f"Subject: {subject_line}\n\n"
            "Message\n\n"
            f"{message}\n"
        )
        prefix = "" if contact_verified else "[UNVERIFIED SENDER] "
        return EmailService._send(
            settings.SUPPORT_EMAIL,
            f"{prefix}[{ticket_number}] {subject_line}",
            body,
        )

    @staticmethod
    def send_contact_enquiry_email(
        ticket_number: str,
        subject_line: str,
        message: str,
        contact_name: Optional[str],
        contact_email: Optional[str],
        company: Optional[str] = None,
        phone: Optional[str] = None,
        inquiry_type: str = "other",
        contact_verified: bool = False,
    ) -> bool:
        """Notify the CONTACT inbox about a website contact-form enquiry.

        Website enquiries are sales/procurement conversations, not support
        tickets, so they go to ``CONTACT_EMAIL`` (services@nhaav.com) while
        in-app support keeps using ``SUPPORT_EMAIL``.
        """
        who = (
            f"{contact_name or 'Anonymous'} "
            f"<{contact_email or 'no reply address given'}>"
        )
        if not contact_verified:
            who += "  [UNVERIFIED — address typed by the submitter]"
        body = (
            "A new enquiry was submitted from the website contact form.\n\n"
            f"Reference: {ticket_number}\n"
            f"Enquiry type: {inquiry_type}\n"
            f"From: {who}\n"
            f"Company: {company or 'not given'}\n"
            f"Phone: {phone or 'not given'}\n"
            f"Subject: {subject_line}\n\n"
            "Message\n\n"
            f"{message}\n"
        )
        prefix = "" if contact_verified else "[UNVERIFIED SENDER] "
        return EmailService._send(
            settings.CONTACT_EMAIL,
            f"{prefix}[{ticket_number}] {subject_line}",
            body,
        )
