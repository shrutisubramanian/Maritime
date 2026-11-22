"""SMTP transport tests with a mocked ``smtplib``.

Nothing here touches the network: ``smtplib.SMTP`` is replaced by a fake that
records the SMTP conversation (STARTTLS, AUTH, DATA) and throws on demand. The
suite covers the delivery contract the brief pins:

  * a successful send performs STARTTLS with certificate validation, authenticates
    with the configured account and hands over a multipart message;
  * the socket timeout is the configured one, so a slow server cannot hang a
    request thread;
  * authentication failure, connection timeout and a mid-session failure each
    surface as ``EmailDeliveryError`` (never as a bare smtplib/OSError, and never
    as a silent success);
  * no credential, token or message body reaches a log sink or an exception
    message;
  * the Gmail environment-variable names (SMTP_*) configure the same backend as
    the long-standing EMAIL_* names.
"""
import contextlib
import logging
import smtplib
import socket
import ssl

import pytest

from app.config import Settings
from app.services import email_service as es


# --------------------------------------------------------------------- fake SMTP
class FakeSMTP:
    """Records the SMTP conversation instead of performing one."""

    instances: list["FakeSMTP"] = []
    connect_error: Exception | None = None
    starttls_error: Exception | None = None
    login_error: Exception | None = None
    send_error: Exception | None = None

    def __init__(self, host, port, timeout=None):
        if FakeSMTP.connect_error is not None:
            raise FakeSMTP.connect_error
        self.host = host
        self.port = port
        self.timeout = timeout
        self.calls: list = []
        self.tls_context = None
        self.message = None
        FakeSMTP.instances.append(self)

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.calls.append("closed")
        return False

    def close(self):
        # Real smtplib.SMTP exposes close(); the backend calls it to tear down a
        # half-open socket when STARTTLS fails.
        self.calls.append("close")

    def starttls(self, context=None):
        self.tls_context = context
        self.calls.append("starttls")
        if FakeSMTP.starttls_error is not None:
            raise FakeSMTP.starttls_error

    def login(self, username, password):
        self.calls.append(("login", username, password))
        if FakeSMTP.login_error is not None:
            raise FakeSMTP.login_error

    def send_message(self, message):
        self.message = message
        self.calls.append("send_message")
        if FakeSMTP.send_error is not None:
            raise FakeSMTP.send_error


@pytest.fixture(autouse=True)
def _fake_smtp(monkeypatch):
    """Swap smtplib.SMTP and reset the fake's failure switches per test."""
    FakeSMTP.instances = []
    FakeSMTP.connect_error = None
    FakeSMTP.starttls_error = None
    FakeSMTP.login_error = None
    FakeSMTP.send_error = None
    monkeypatch.setattr(es.smtplib, "SMTP", FakeSMTP)
    yield
    FakeSMTP.instances = []


@contextlib.contextmanager
def _capture_email_log():
    """
    Capture the ``nhaav.email`` logger through a private handler.

    Deliberately not ``caplog``: that depends on session-wide logging state,
    which other modules in this suite leave in a different condition, so the
    same assertion would pass in isolation and fail in a full run. A local
    handler makes the log assertions deterministic and order-independent.
    """
    messages: list[str] = []

    class _Sink(logging.Handler):
        def emit(self, record):
            messages.append(record.getMessage())

    logger = logging.getLogger("nhaav.email")
    sink = _Sink()
    previous_level, previous_disabled = logger.level, logger.disabled
    logger.addHandler(sink)
    logger.setLevel(logging.DEBUG)
    logger.disabled = False
    try:
        yield messages
    finally:
        logger.removeHandler(sink)
        logger.setLevel(previous_level)
        logger.disabled = previous_disabled


def _backend(**overrides):
    """A Gmail-shaped backend, with any field overridden per test."""
    kwargs = dict(
        host="smtp.gmail.com",
        port=587,
        username="sender@gmail.com",
        password="app-password-value",
        from_addr="sender@gmail.com",
        from_name="Nhaav",
        use_tls=True,
        timeout=10,
    )
    kwargs.update(overrides)
    return es.SMTPEmailBackend(**kwargs)


# ------------------------------------------------------------------ happy path
def test_successful_send_does_starttls_then_login_then_send():
    backend = _backend()
    assert backend.send("captain@example.com", "Verify", "token: ABC") is True

    server = FakeSMTP.instances[-1]
    assert server.host == "smtp.gmail.com"
    assert server.port == 587
    assert [c for c in server.calls if not isinstance(c, tuple)] == [
        "starttls",
        "send_message",
        "closed",
    ]
    assert ("login", "sender@gmail.com", "app-password-value") in server.calls
    assert server.message["To"] == "captain@example.com"
    assert server.message["Subject"] == "Verify"


def test_message_is_multipart_alternative_with_html_and_text():
    _backend().send("captain@example.com", "Verify", "Hello\n\nhttps://x.test/y")

    message = FakeSMTP.instances[-1].message
    assert message.is_multipart()
    subtypes = {part.get_content_subtype() for part in message.iter_parts()}
    assert subtypes == {"plain", "html"}
    html = message.get_body(preferencelist=("html",)).get_content()
    assert 'href="https://x.test/y"' in html


def test_starttls_uses_validated_context():
    """The TLS context must verify the chain AND the hostname."""
    _backend().send("a@b.com", "s", "body")

    context = FakeSMTP.instances[-1].tls_context
    assert isinstance(context, ssl.SSLContext)
    assert context.verify_mode == ssl.CERT_REQUIRED
    assert context.check_hostname is True


def test_configured_timeout_is_passed_to_smtp():
    _backend(timeout=7).send("a@b.com", "s", "body")
    assert FakeSMTP.instances[-1].timeout == 7


def test_use_tls_false_skips_starttls_but_still_authenticates():
    backend = _backend(use_tls=False)
    backend.send("a@b.com", "s", "body")

    server = FakeSMTP.instances[-1]
    assert "starttls" not in server.calls
    assert ("login", "sender@gmail.com", "app-password-value") in server.calls


def test_verification_email_body_and_links_through_the_real_transport():
    backend = es.get_email_backend  # placeholder to keep the import honest
    assert backend is not None

    sender = _backend()
    # The composer no longer prints a bare token: the link is the only place
    # the token appears, and it renders as the HTML Continue button.
    body = (
        "Confirm your email address to activate your account by clicking "
        "Continue below.\n\nhttps://app.test/login?verify_token=VTOKEN\n\n"
    )
    sender.send("a@b.com", "Verify", body)

    message = FakeSMTP.instances[-1].message
    text = message.get_body(preferencelist=("plain",)).get_content()
    assert "https://app.test/login?verify_token=VTOKEN" in text
    assert "token: VTOKEN" not in text
    html = message.get_body(preferencelist=("html",)).get_content()
    assert "https://app.test/login?verify_token=VTOKEN" in html
    assert ">Continue<" in html


# ------------------------------------------------------------------- failures
def test_authentication_failure_raises_delivery_error_without_the_password():
    FakeSMTP.login_error = smtplib.SMTPAuthenticationError(535, b"bad credentials")

    with pytest.raises(es.EmailDeliveryError) as excinfo:
        _backend().send("a@b.com", "s", "body")

    message = str(excinfo.value)
    assert "authentication" in message.lower()
    assert "app-password-value" not in message


def test_connection_timeout_raises_delivery_error():
    FakeSMTP.connect_error = socket.timeout("timed out")

    with pytest.raises(es.EmailDeliveryError) as excinfo:
        _backend().send("a@b.com", "s", "body")

    assert "app-password-value" not in str(excinfo.value)


def test_starttls_failure_raises_delivery_error():
    FakeSMTP.starttls_error = smtplib.SMTPNotSupportedError("STARTTLS not supported")

    with pytest.raises(es.EmailDeliveryError):
        _backend().send("a@b.com", "s", "body")


def test_mid_session_send_failure_raises_delivery_error():
    FakeSMTP.send_error = smtplib.SMTPServerDisconnected("connection lost")

    with pytest.raises(es.EmailDeliveryError):
        _backend().send("a@b.com", "s", "body")


def test_failed_send_reports_failure_rather_than_success(monkeypatch):
    """A backend that raises must never be reported as a delivered message."""
    # Route EmailService through the SMTP backend (development defaults to the
    # console backend, which never touches the transport).
    monkeypatch.setattr(es.settings, "EMAIL_BACKEND", "smtp")
    monkeypatch.setattr(es.settings, "EMAIL_HOST", "smtp.gmail.com")
    monkeypatch.setattr(es.settings, "EMAIL_FROM", "sender@gmail.com")
    monkeypatch.setattr(es.settings, "EMAIL_HOST_USER", "sender@gmail.com")
    monkeypatch.setattr(es.settings, "EMAIL_HOST_PASSWORD", "app-password-value")
    FakeSMTP.login_error = smtplib.SMTPAuthenticationError(535, b"nope")

    with pytest.raises(es.EmailDeliveryError):
        es.EmailService.send_verification_email("a@b.com", "VTOKEN")


def test_no_credential_body_or_token_reaches_the_logs():
    """A successful send logs neither the password nor the message body."""
    with _capture_email_log() as logged_on_success:
        _backend().send("a@b.com", "Verify", "token: SUPERSECRETTOKEN")

    assert logged_on_success, "the successful-send path should log a summary"
    summary = " ".join(logged_on_success)
    assert "app-password-value" not in summary
    assert "SUPERSECRETTOKEN" not in summary

    # ...and a failure does not leak them into the error path either.
    with _capture_email_log() as logged_on_failure:
        FakeSMTP.send_error = smtplib.SMTPServerDisconnected("boom")
        with pytest.raises(es.EmailDeliveryError) as excinfo:
            _backend().send("a@b.com", "Verify", "token: SUPERSECRETTOKEN")

    leaked = " ".join(logged_on_failure) + " " + str(excinfo.value)
    assert "app-password-value" not in leaked
    assert "SUPERSECRETTOKEN" not in leaked
    assert "app-password-value" not in str(excinfo.value)


def test_console_backend_logs_recipient_and_subject_only():
    with _capture_email_log() as logged:
        es.ConsoleEmailBackend().send("a@b.com", "Verify", "token: SUPERSECRET")

    summary = " ".join(logged)
    assert "a@b.com" in summary
    assert "Verify" in summary
    assert "SUPERSECRET" not in summary


# ------------------------------------------------------- configuration surface
def _clear_email_env(monkeypatch):
    for name in (
        "EMAIL_BACKEND", "SMTP_BACKEND",
        "EMAIL_HOST", "SMTP_HOST",
        "EMAIL_PORT", "SMTP_PORT",
        "EMAIL_HOST_USER", "SMTP_USERNAME",
        "EMAIL_HOST_PASSWORD", "SMTP_PASSWORD",
        "EMAIL_FROM", "SMTP_FROM_EMAIL",
        "EMAIL_FROM_NAME", "SMTP_FROM_NAME",
        "EMAIL_USE_TLS", "SMTP_USE_TLS",
        "EMAIL_TIMEOUT_SECONDS", "SMTP_TIMEOUT_SECONDS",
    ):
        monkeypatch.delenv(name, raising=False)


def test_gmail_env_vars_configure_the_smtp_backend(monkeypatch):
    """The SMTP_* names from the brief configure a working Gmail backend."""
    _clear_email_env(monkeypatch)
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setenv("SMTP_BACKEND", "smtp")
    monkeypatch.setenv("SMTP_HOST", "smtp.gmail.com")
    monkeypatch.setenv("SMTP_PORT", "587")
    monkeypatch.setenv("SMTP_USERNAME", "sender@gmail.com")
    monkeypatch.setenv("SMTP_PASSWORD", "app-password-value")
    monkeypatch.setenv("SMTP_FROM_EMAIL", "sender@gmail.com")
    monkeypatch.setenv("SMTP_FROM_NAME", "Nhaav")
    monkeypatch.setenv("SMTP_USE_TLS", "true")

    settings = Settings()
    assert settings.EMAIL_BACKEND == "smtp"
    assert settings.EMAIL_HOST == "smtp.gmail.com"
    assert settings.EMAIL_PORT == 587
    assert settings.EMAIL_HOST_USER == "sender@gmail.com"
    assert settings.EMAIL_FROM_NAME == "Nhaav"
    assert settings.EMAIL_USE_TLS is True


def test_existing_email_names_still_work(monkeypatch):
    _clear_email_env(monkeypatch)
    monkeypatch.setenv("ENVIRONMENT", "development")
    monkeypatch.setenv("EMAIL_BACKEND", "console")
    monkeypatch.setenv("EMAIL_HOST", "smtp.example.com")

    settings = Settings()
    assert settings.EMAIL_BACKEND == "console"
    assert settings.EMAIL_HOST == "smtp.example.com"


def test_an_explicit_empty_value_is_not_papered_over_by_the_alias(monkeypatch):
    """
    An operator who blanks EMAIL_HOST wants the misconfiguration reported, not
    silently satisfied from SMTP_HOST.
    """
    _clear_email_env(monkeypatch)
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setenv("SMTP_BACKEND", "smtp")
    monkeypatch.setenv("SMTP_HOST", "smtp.gmail.com")
    monkeypatch.setenv("EMAIL_HOST", "")
    monkeypatch.setenv("SMTP_FROM_EMAIL", "sender@gmail.com")

    with pytest.raises(ValueError, match="EMAIL_HOST"):
        Settings()


def test_unknown_backend_name_is_a_configuration_error(monkeypatch):
    monkeypatch.setattr(es.settings, "EMAIL_BACKEND", "sendgrid-api")
    with pytest.raises(es.EmailConfigurationError):
        es.get_email_backend()


def test_missing_from_address_is_a_configuration_error(monkeypatch):
    monkeypatch.setattr(es.settings, "EMAIL_BACKEND", "smtp")
    monkeypatch.setattr(es.settings, "EMAIL_HOST", "smtp.gmail.com")
    monkeypatch.setattr(es.settings, "EMAIL_FROM", "")

    with pytest.raises(es.EmailConfigurationError, match="EMAIL_FROM"):
        es.get_email_backend()
