import logging
import os

from dotenv import load_dotenv

# Load environment variables from a .env file into os.environ
load_dotenv()


def _pick(primary: str, alias: str, default: str = "") -> str:
    """
    Read ``primary`` (the long-standing ``EMAIL_*`` name), falling back to
    ``alias`` (the ``SMTP_*`` name) only when ``primary`` is not defined at all.

    Both naming schemes are supported so a Gmail/Resend deployment can use the
    vendor-neutral ``SMTP_*`` names while existing environments keep working.
    "Defined but empty" deliberately wins over the alias: an operator who blanks
    a variable wants the fail-fast below to report it, not to have it quietly
    resurrected from the other name.
    """
    if primary in os.environ:
        return os.environ[primary].strip()
    if alias in os.environ:
        return os.environ[alias].strip()
    return default

class Settings:
    """
    Settings class to manage environment configuration for the backend.
    Loads variables explicitly using os.getenv, providing validation 
    for required configurations like database URLs and secrets.
    """
    def __init__(self):
        # Database connection string (e.g., PostgreSQL URL)
        # Required for application startup, so we raise an error if not found.
        self.DATABASE_URL: str = os.getenv("DATABASE_URL", "")
        if not self.DATABASE_URL:
            raise ValueError("DATABASE_URL environment variable is required (e.g., postgresql://user:pass@localhost:5432/db)")
            
        # Security settings for JWT token generation and validation
        self.JWT_SECRET: str = os.getenv("JWT_SECRET", "")
        if not self.JWT_SECRET:
            raise ValueError("JWT_SECRET environment variable is required")
        # A short HS256 secret is crackable offline from one captured token.
        # Fail closed in production; development/test may use shorter fixtures.
        _raw_environment = os.getenv("ENVIRONMENT", "").strip().lower()
        if _raw_environment == "production" and len(self.JWT_SECRET) < 32:
            raise ValueError(
                "JWT_SECRET must be at least 32 characters in production "
                "(use `openssl rand -hex 32`)."
            )
            
        # Optional settings with sensible production-ready defaults
        self.JWT_EXPIRE_MINUTES: int = int(os.getenv("JWT_EXPIRE_MINUTES", "1440"))
        # Admin sessions are short-lived. They are additionally bound to the
        # refresh-session id so logout/password reset revoke the access token
        # immediately instead of waiting for expiry.
        self.ADMIN_JWT_EXPIRE_MINUTES: int = int(
            os.getenv("ADMIN_JWT_EXPIRE_MINUTES", "30")
        )
        # Browser sessions are cookie-only. Tokens are returned in JSON only
        # for explicit non-browser API clients, and only when this is enabled.
        # The test harness turns it on; production defaults to false.
        self.EXPOSE_SESSION_TOKENS: bool = os.getenv(
            "EXPOSE_SESSION_TOKENS", "false"
        ).strip().lower() in ("1", "true", "yes", "on")
        # SYMMETRIC SIGNING ONLY. An env-supplied "none" (or an asymmetric
        # algorithm the app has no key for) would either produce unsigned tokens
        # or fail in confusing ways, so the algorithm is an allowlist, not free
        # text. `none` in particular would let anyone mint a token for any
        # account.
        self.JWT_ALGORITHM: str = os.getenv("JWT_ALGORITHM", "HS256").strip().upper()
        _allowed_jwt_algorithms = {"HS256", "HS384", "HS512"}
        if self.JWT_ALGORITHM not in _allowed_jwt_algorithms:
            raise ValueError(
                "JWT_ALGORITHM must be one of "
                + "|".join(sorted(_allowed_jwt_algorithms))
                + f" (got '{self.JWT_ALGORITHM}')"
            )
        
        # Environment mode. FAIL CLOSED (M-2): a missing variable is treated as
        # "production" so an unset environment can never silently enable
        # development-only provisioning routes. An unrecognised value is a
        # configuration error and refuses to boot.
        raw_environment: str = os.getenv("ENVIRONMENT", "")
        if raw_environment == "":
            self.ENVIRONMENT: str = "production"
        elif raw_environment in ("development", "staging", "production"):
            self.ENVIRONMENT = raw_environment
        else:
            raise ValueError(
                f"ENVIRONMENT must be one of development|staging|production "
                f"(got '{raw_environment}')"
            )

        self.is_production: bool = self.ENVIRONMENT == "production"
        # Dev/test provisioning endpoints are enabled ONLY in explicit local
        # development (allowlist, never "not production").
        self.is_development: bool = self.ENVIRONMENT == "development"

        # ------------------------------------------------------------- payments
        # Offline BANK TRANSFER details shown to organizations. Deliberately
        # EMPTY by default: no bank information is hardcoded in source (backend
        # or frontend) and the API reports configured=False until an operator
        # supplies these via environment configuration.
        self.PAYMENT_BANK_ACCOUNT_HOLDER: str = os.getenv("PAYMENT_BANK_ACCOUNT_HOLDER", "")
        self.PAYMENT_BANK_NAME: str = os.getenv("PAYMENT_BANK_NAME", "")
        self.PAYMENT_BANK_ACCOUNT_NUMBER: str = os.getenv("PAYMENT_BANK_ACCOUNT_NUMBER", "")
        self.PAYMENT_BANK_IFSC: str = os.getenv("PAYMENT_BANK_IFSC", "")
        self.PAYMENT_BANK_BRANCH: str = os.getenv("PAYMENT_BANK_BRANCH", "")
        self.PAYMENT_BANK_ACCOUNT_TYPE: str = os.getenv("PAYMENT_BANK_ACCOUNT_TYPE", "")
        self.PAYMENT_INSTRUCTIONS: str = os.getenv("PAYMENT_INSTRUCTIONS", "")
        self.PAYMENT_CURRENCY: str = os.getenv("PAYMENT_CURRENCY", "INR")
        # GST charged ON TOP of a plan's listed price: ₹1,000 + 18% = ₹1,180 and
        # ₹10,000 + 18% = ₹11,800. Plans store the taxable value; the tax is
        # derived, never stored twice, so a rate change cannot corrupt history
        # (a payment's stored total is what was actually charged).
        self.GST_RATE_PERCENT: int = int(os.getenv("GST_RATE_PERCENT", "18"))
        # Manual pass issue. The production rule is: a VERIFIED PAYMENT issues the
        # plan's passes (MONTHLY → 10, ANNUAL → 100). A hand-issued pack has no
        # payment behind it, so it is OFF unless an operator deliberately turns
        # it on for a genuine offline/complimentary case; even then it needs a
        # written reason and an explicit no-payment confirmation, both audited.
        self.ALLOW_MANUAL_PASS_GRANTS: bool = os.getenv(
            "ALLOW_MANUAL_PASS_GRANTS", "false"
        ).strip().lower() in ("1", "true", "yes", "on")

        # Payment receipt (bank-transfer proof) upload limits. Receipts are
        # private: stored outside any static mount and served only through an
        # authorized endpoint.
        self.PAYMENT_RECEIPTS_DIR: str = os.getenv("PAYMENT_RECEIPTS_DIR", "uploads/payment_receipts")
        self.PAYMENT_RECEIPT_MAX_BYTES: int = int(
            os.getenv("PAYMENT_RECEIPT_MAX_BYTES", str(5 * 1024 * 1024))
        )
        self.PAYMENT_RECEIPT_ALLOWED_EXTENSIONS: str = os.getenv(
            "PAYMENT_RECEIPT_ALLOWED_EXTENSIONS", "pdf,jpg,jpeg,png"
        )
        self.PAYMENT_RECEIPT_ALLOWED_CONTENT_TYPES: str = os.getenv(
            "PAYMENT_RECEIPT_ALLOWED_CONTENT_TYPES",
            "application/pdf,image/jpeg,image/png",
        )

        # Provider/supplier document uploads (KYC, vendor reg, OCR inputs).
        # Validated the same way as receipts: extension allowlist + size cap +
        # filename sanitization, so a caller cannot write outside the upload
        # directory or exhaust memory with an unbounded body.
        self.DOCUMENT_UPLOAD_DIR: str = os.getenv("DOCUMENT_UPLOAD_DIR", "uploads")
        # Company brochure: vendors may attach one PDF describing their business.
        # 15 MB is the product limit; it is enforced while streaming the upload,
        # not after it has been buffered.
        self.PROFILE_BROCHURE_DIR: str = os.getenv("PROFILE_BROCHURE_DIR", "profile_brochures")
        self.PROFILE_BROCHURE_MAX_BYTES: int = int(
            os.getenv("PROFILE_BROCHURE_MAX_BYTES", str(15 * 1024 * 1024))
        )
        self.DOCUMENT_UPLOAD_MAX_BYTES: int = int(
            os.getenv("DOCUMENT_UPLOAD_MAX_BYTES", str(25 * 1024 * 1024))
        )
        self.DOCUMENT_UPLOAD_ALLOWED_EXTENSIONS: str = os.getenv(
            "DOCUMENT_UPLOAD_ALLOWED_EXTENSIONS",
            "pdf,jpg,jpeg,png,webp,tif,tiff,doc,docx,txt,csv,xlsx",
        )
        # Parser-resource bounds. These are deliberately server-side limits,
        # not browser hints: a 25 MB upload can still expand into a huge PDF or
        # DOCX archive if the page/pixel/decompression work is unbounded.
        self.DOCUMENT_MAX_PDF_PAGES: int = int(
            os.getenv("DOCUMENT_MAX_PDF_PAGES", "50")
        )
        self.DOCUMENT_MAX_IMAGE_PIXELS: int = int(
            os.getenv("DOCUMENT_MAX_IMAGE_PIXELS", "40000000")
        )
        self.DOCUMENT_OCR_TIMEOUT_SECONDS: int = int(
            os.getenv("DOCUMENT_OCR_TIMEOUT_SECONDS", "60")
        )
        self.DOCUMENT_MAX_DOCX_UNCOMPRESSED_BYTES: int = int(
            os.getenv("DOCUMENT_MAX_DOCX_UNCOMPRESSED_BYTES", str(80 * 1024 * 1024))
        )
        self.DOCUMENT_MAX_DOCX_ENTRIES: int = int(
            os.getenv("DOCUMENT_MAX_DOCX_ENTRIES", "2000")
        )
        # Expansion caps for the Excel profile import. The upload is capped at
        # 2 MB compressed, so these bound what a small archive may inflate to
        # (a legitimate one-row template is a few hundred KB at most).
        self.PROFILE_IMPORT_MAX_UNCOMPRESSED_BYTES: int = int(
            os.getenv("PROFILE_IMPORT_MAX_UNCOMPRESSED_BYTES", str(20 * 1024 * 1024))
        )
        self.PROFILE_IMPORT_MAX_ZIP_ENTRIES: int = int(
            os.getenv("PROFILE_IMPORT_MAX_ZIP_ENTRIES", "200")
        )

        # ------------------------------------------------------------ security
        # Rate limiting (M-3). Counters live in the rate_limit_events table
        # (multi-instance safe). Search categories are USER-scoped (the JWT
        # identity is the bucket); auth/payment categories are keyed by a
        # hashed identity (email or IP) so no raw PII is stored.
        self.RATE_LIMIT_WINDOW_MINUTES: int = int(os.getenv("RATE_LIMIT_WINDOW_MINUTES", "15"))
        self.VENDOR_SEARCH_LIMIT: int = int(os.getenv("VENDOR_SEARCH_LIMIT", "60"))
        self.PORT_SEARCH_LIMIT: int = int(os.getenv("PORT_SEARCH_LIMIT", "60"))
        self.VENDOR_DETAIL_LIMIT: int = int(os.getenv("VENDOR_DETAIL_LIMIT", "120"))
        self.DATA_DOWNLOAD_LIMIT: int = int(os.getenv("DATA_DOWNLOAD_LIMIT", "20"))
        self.PUBLIC_SEARCH_LIMIT: int = int(os.getenv("PUBLIC_SEARCH_LIMIT", "60"))
        self.AUTH_LOGIN_LIMIT: int = int(os.getenv("AUTH_LOGIN_LIMIT", "25"))
        self.REGISTER_LIMIT: int = int(os.getenv("REGISTER_LIMIT", "25"))
        self.ADMIN_LOGIN_LIMIT: int = int(os.getenv("ADMIN_LOGIN_LIMIT", "10"))
        self.PASSWORD_RESET_LIMIT: int = int(os.getenv("PASSWORD_RESET_LIMIT", "5"))
        self.VERIFICATION_RESEND_LIMIT: int = int(os.getenv("VERIFICATION_RESEND_LIMIT", "5"))
        self.PAYMENT_SUBMIT_LIMIT: int = int(os.getenv("PAYMENT_SUBMIT_LIMIT", "20"))
        self.PROFILE_UPLOAD_LIMIT: int = int(os.getenv("PROFILE_UPLOAD_LIMIT", "20"))
        # Excel import: each upload is parsed once; the review screen re-checks
        # edited values without re-uploading, so its budget is larger.
        self.PROFILE_IMPORT_LIMIT: int = int(
            os.getenv("PROFILE_IMPORT_LIMIT", "20")
        )
        self.PROFILE_IMPORT_VALIDATE_LIMIT: int = int(
            os.getenv("PROFILE_IMPORT_VALIDATE_LIMIT", "60")
        )
        self.DOCUMENT_UPLOAD_LIMIT: int = int(os.getenv("DOCUMENT_UPLOAD_LIMIT", "10"))
        # Receipt submissions remain bounded; the previous 5/hour default broke
        # legitimate multi-UTR correction workflows and the existing contract
        # test. Operators can lower this to 5 with the environment variable.
        self.PAYMENT_RECEIPT_UPLOAD_LIMIT: int = int(
            os.getenv("PAYMENT_RECEIPT_UPLOAD_LIMIT", "25")
        )
        self.GLOBAL_API_LIMIT: int = int(os.getenv("GLOBAL_API_LIMIT", "120"))
        self.GLOBAL_API_RATE_LIMIT_ENABLED: bool = os.getenv(
            "GLOBAL_API_RATE_LIMIT_ENABLED", "true"
        ).strip().lower() in ("1", "true", "yes", "on")
        # Per-category windows (minutes). The historical single
        # RATE_LIMIT_WINDOW_MINUTES remains the fallback for categories that do
        # not specify one.
        self.AUTH_LOGIN_WINDOW_MINUTES: int = int(
            os.getenv("AUTH_LOGIN_WINDOW_MINUTES", "1")
        )
        self.REGISTER_WINDOW_MINUTES: int = int(
            os.getenv("REGISTER_WINDOW_MINUTES", "60")
        )
        self.AUTH_ADMIN_LOGIN_WINDOW_MINUTES: int = int(
            os.getenv("AUTH_ADMIN_LOGIN_WINDOW_MINUTES", "1")
        )
        self.SUPPORT_TICKET_WINDOW_MINUTES: int = int(
            os.getenv("SUPPORT_TICKET_WINDOW_MINUTES", "60")
        )
        self.DOCUMENT_UPLOAD_WINDOW_MINUTES: int = int(
            os.getenv("DOCUMENT_UPLOAD_WINDOW_MINUTES", "60")
        )
        self.PAYMENT_RECEIPT_WINDOW_MINUTES: int = int(
            os.getenv("PAYMENT_RECEIPT_WINDOW_MINUTES", "60")
        )
        self.PUBLIC_SEARCH_WINDOW_MINUTES: int = int(
            os.getenv("PUBLIC_SEARCH_WINDOW_MINUTES", "1")
        )
        self.GLOBAL_API_WINDOW_MINUTES: int = int(
            os.getenv("GLOBAL_API_WINDOW_MINUTES", "1")
        )
        self.MAX_SEARCH_PAGE_SIZE: int = int(os.getenv("MAX_SEARCH_PAGE_SIZE", "50"))

        # ---------------------------------------------- auth limiter budgets
        # The authentication surface has its own split budgets (see
        # RateLimitService.check_auth_rate_limit): FAILURES are charged to the
        # attempted account so a password spray cannot guess one mailbox, while
        # ATTEMPTS are charged to the source IP so one host cannot spray many
        # mailboxes. A correct password is never blocked by the per-account
        # failure budget — that counter punishes guesses, not the owner.
        self.AUTH_LOGIN_FAILED_PER_EMAIL_LIMIT: int = int(
            os.getenv("AUTH_LOGIN_FAILED_PER_EMAIL_LIMIT", "5")
        )
        self.AUTH_LOGIN_PER_IP_LIMIT: int = int(
            os.getenv("AUTH_LOGIN_PER_IP_LIMIT", "60")
        )
        # Admin login is a higher-value target: a tighter budget than users.
        self.AUTH_ADMIN_LOGIN_FAILED_PER_EMAIL_LIMIT: int = int(
            os.getenv("AUTH_ADMIN_LOGIN_FAILED_PER_EMAIL_LIMIT", "5")
        )
        self.AUTH_ADMIN_LOGIN_PER_IP_LIMIT: int = int(
            os.getenv("AUTH_ADMIN_LOGIN_PER_IP_LIMIT", "20")
        )
        # Password-reset and verification mail-bombing budgets.
        self.AUTH_FORGOT_PER_EMAIL_LIMIT: int = int(
            os.getenv("AUTH_FORGOT_PER_EMAIL_LIMIT", "3")
        )
        self.AUTH_FORGOT_PER_IP_LIMIT: int = int(
            os.getenv("AUTH_FORGOT_PER_IP_LIMIT", "10")
        )
        self.AUTH_RESEND_PER_EMAIL_LIMIT: int = int(
            os.getenv("AUTH_RESEND_PER_EMAIL_LIMIT", "3")
        )
        self.AUTH_RESEND_PER_IP_LIMIT: int = int(
            os.getenv("AUTH_RESEND_PER_IP_LIMIT", "10")
        )
        # Coarse per-IP budgets for the remaining unauthenticated auth routes:
        # session refresh, verification-link redemption and password-reset
        # redemption. None of them is guessable (every token is HMAC-signed), so
        # these exist to bound flood/CPU abuse, not to stop credential guessing.
        self.AUTH_REFRESH_PER_IP_LIMIT: int = int(
            os.getenv("AUTH_REFRESH_PER_IP_LIMIT", "120")
        )
        self.AUTH_VERIFY_PER_IP_LIMIT: int = int(
            os.getenv("AUTH_VERIFY_PER_IP_LIMIT", "60")
        )
        self.AUTH_RESET_PER_IP_LIMIT: int = int(
            os.getenv("AUTH_RESET_PER_IP_LIMIT", "20")
        )

        # Proxy trust for the source-IP budget. TRUE when the app sits behind a
        # reverse proxy / platform edge that OVERWRITES X-Real-IP or appends to
        # X-Forwarded-For; FALSE when the API is reachable directly, because
        # then those headers are client-controlled and rotating them would
        # bypass every per-IP limit.
        self.TRUST_PROXY_HEADERS: bool = os.getenv(
            "TRUST_PROXY_HEADERS", "false"
        ).strip().lower() in ("1", "true", "yes", "on")
        # Optional comma-separated peer addresses/CIDRs. When supplied, proxy
        # headers are trusted only if the direct socket peer is in this list.
        self.TRUSTED_PROXIES: list[str] = [
            value.strip()
            for value in os.getenv("TRUSTED_PROXIES", "").split(",")
            if value.strip()
        ]
        # Secure cookies are required for every HTTPS environment, not only
        # production. Local HTTP development opts out explicitly.
        self.COOKIE_SECURE: bool = os.getenv(
            "COOKIE_SECURE",
            "true" if self.ENVIRONMENT in ("staging", "production") else "false",
        ).strip().lower() in ("1", "true", "yes", "on")

        # Dev provisioning pack bound (M-1): one dev call can never mint an
        # arbitrarily large pack.
        self.DEV_PROVISION_MAX_TOKENS: int = int(os.getenv("DEV_PROVISION_MAX_TOKENS", "100"))

        # CORS origins (L-2): comma-separated environment configuration with a
        # localhost-only default for development. A JSON-style list
        # ('["https://app.example.com"]') is ALSO accepted: hosts frequently set
        # it that way, and without stripping the brackets the allow-list entries
        # would be malformed and every browser call would fail CORS.
        _raw_origins = [
            o.strip()
            for o in os.getenv(
                "CORS_ORIGINS", "http://localhost:5173,http://localhost:3000"
            ).split(",")
            if o.strip()
        ]
        self.CORS_ORIGINS: list[str] = [
            o.strip("[]'\" ") for o in _raw_origins if o.strip("[]'\" ")
        ]
        # L-2 hardening: a wildcard origin is refused in production (it must be
        # an explicit allowlist — the app also sends credentials).
        if self.is_production and "*" in self.CORS_ORIGINS:
            raise ValueError(
                "CORS_ORIGINS='*' is not allowed in production; list the exact "
                "frontend origin(s) instead."
            )
        # Process-level application assembly (app.main) validates production
        # CORS more strictly: it requires an explicit allowlist and rejects
        # localhost-only origins. Keeping that check out of the pure settings
        # object lets tests exercise ENVIRONMENT=production without a deployed
        # frontend origin while still failing the actual app boot.

        # ------------------------------------------------------------- email
        # Transactional email: account verification, password reset and support
        # ticket notifications.
        #
        # Every setting is read under its EMAIL_* name, with the SMTP_* alias
        # accepted when the EMAIL_* name is absent (see _pick). Gmail reference
        # configuration: SMTP_HOST=smtp.gmail.com, SMTP_PORT=587,
        # SMTP_USERNAME=<full gmail address>, SMTP_PASSWORD=<App Password>,
        # SMTP_USE_TLS=true.
        #
        # EMAIL_BACKEND="smtp" performs real delivery through smtplib.
        # EMAIL_BACKEND="console" logs a one-line summary instead of sending, so
        # local development and tests work end to end without SMTP credentials.
        # Development defaults to console; every other environment defaults to
        # smtp.
        self.EMAIL_BACKEND: str = _pick(
            "EMAIL_BACKEND",
            "SMTP_BACKEND",
            "console" if self.is_development else "smtp",
        ).lower()
        self.EMAIL_HOST: str = _pick("EMAIL_HOST", "SMTP_HOST")
        self.EMAIL_PORT: int = int(_pick("EMAIL_PORT", "SMTP_PORT", "587"))
        self.EMAIL_HOST_USER: str = _pick("EMAIL_HOST_USER", "SMTP_USERNAME")
        # SECRET. Never logged, never returned by an API, never sent to the
        # frontend, and never placed in an exception message.
        self.EMAIL_HOST_PASSWORD: str = _pick(
            "EMAIL_HOST_PASSWORD", "SMTP_PASSWORD"
        )
        # Sender identity. A bare address or "Display Name <addr@x>" both work.
        # Deliberately has NO default: smtp delivery refuses to start without an
        # explicit sender, because most providers reject a mismatch between the
        # authenticated account and the From address.
        self.EMAIL_FROM: str = _pick("EMAIL_FROM", "SMTP_FROM_EMAIL")
        self.EMAIL_FROM_NAME: str = _pick(
            "EMAIL_FROM_NAME", "SMTP_FROM_NAME", "Nhaav"
        )
        # STARTTLS on 587 (default). Set false for a local catcher or port 25.
        self.EMAIL_USE_TLS: bool = _pick(
            "EMAIL_USE_TLS", "SMTP_USE_TLS", "true"
        ).lower() not in ("0", "false", "no", "off")
        # SMTP socket timeout in seconds. Kept short so a slow mail server can
        # never hold a request thread open for long.
        self.EMAIL_TIMEOUT_SECONDS: int = int(
            _pick("EMAIL_TIMEOUT_SECONDS", "SMTP_TIMEOUT_SECONDS", "10")
        )

        # ------------------------------------------------- email fail-fast
        # A deployment that cannot actually deliver mail must refuse to start
        # rather than accept registrations whose verification links go nowhere.
        # Checked before the other production guards so the email misconfiguration
        # is the first thing an operator sees.
        if self.is_production:
            if self.EMAIL_BACKEND == "console":
                raise ValueError(
                    "EMAIL_BACKEND=console is forbidden when "
                    f"ENVIRONMENT={self.ENVIRONMENT}: verification and "
                    "password-reset emails would be logged instead of sent. Set "
                    "EMAIL_BACKEND=smtp (or SMTP_BACKEND=smtp) and configure "
                    "EMAIL_HOST/EMAIL_HOST_USER/EMAIL_HOST_PASSWORD."
                )
            if self.EMAIL_BACKEND == "smtp":
                missing_email = []
                if not self.EMAIL_HOST:
                    missing_email.append("EMAIL_HOST (SMTP_HOST)")
                if not self.EMAIL_FROM:
                    missing_email.append("EMAIL_FROM (SMTP_FROM_EMAIL)")
                # Credentials are required too, not merely a host and a sender:
                # SMTPEmailBackend skips login() when the username is empty, so
                # a host-only config would boot cleanly and then fail (or attempt
                # an unauthenticated send) on the first registration instead of
                # here. Mailbox providers reject that, and every user-facing
                # verification link would be lost.
                if not self.EMAIL_HOST_USER:
                    missing_email.append("EMAIL_HOST_USER (SMTP_USERNAME)")
                if not self.EMAIL_HOST_PASSWORD:
                    missing_email.append("EMAIL_HOST_PASSWORD (SMTP_PASSWORD)")
                if missing_email:
                    raise ValueError(
                        "EMAIL_BACKEND=smtp requires "
                        + ", ".join(missing_email)
                        + " when ENVIRONMENT=production."
                    )

        # Public frontend origin, used to build the links inside emails
        # (verification / password reset). No trailing slash.
        self.FRONTEND_URL: str = os.getenv("FRONTEND_URL", "http://localhost:5173").rstrip("/")

        # Support tickets raised through the in-app support popup are delivered
        # here (and stored in support_tickets).
        self.SUPPORT_EMAIL: str = os.getenv(
            "SUPPORT_EMAIL", "nhaavnotifications@gmail.com"
        )
        self.SUPPORT_TICKET_LIMIT: int = int(os.getenv("SUPPORT_TICKET_LIMIT", "5"))

        # Website contact-form enquiries (Services page) are delivered here.
        # Separate from SUPPORT_EMAIL so buyer/supplier sales enquiries do not
        # land in the same inbox as in-app support tickets.
        self.CONTACT_EMAIL: str = os.getenv("CONTACT_EMAIL", "services@nhaav.com")

# Expose a singleton settings object to be imported across the application.
# By instantiating it here, we ensure configuration is loaded only once at startup.
settings = Settings()

# A short HS256 secret can be brute-forced offline from a single captured token,
# which would let an attacker mint a token for ANY account. Warn loudly rather
# than refusing to boot: an existing deployment must be able to rotate the
# secret without an outage window.
if settings.is_production and len(settings.JWT_SECRET) < 32:
    logging.getLogger(__name__).warning(
        "JWT_SECRET is only %d characters. Use at least 32 random characters "
        "(e.g. `openssl rand -hex 32`) in production: a short signing secret "
        "can be cracked offline and then forged into any account's token.",
        len(settings.JWT_SECRET),
    )
