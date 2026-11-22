"""Project-wide pytest configuration for the Nhaav backend.

The test suite must never send real email. `.env` may legitimately point
``EMAIL_BACKEND`` at real SMTP (e.g. Gmail) for local manual verification, but a
test run that registers a user would then email a real inbox. Force the console
backend *before* ``app.config`` is imported — ``python-dotenv`` (used by
app.config) does not override an already-set environment variable, so this wins
over whatever `.env` contains.

Individual tests that intentionally exercise another backend (e.g. the SMTP
unit tests, or the production fail-fast checks) set the variable explicitly with
``monkeypatch`` and are unaffected.

The suite also acts as a non-browser API client: it consumes the access token
from the JSON response. Production browser deployments keep
``EXPOSE_SESSION_TOKENS`` false and rely on httpOnly cookies.
"""
import os

os.environ["EMAIL_BACKEND"] = "console"
# Pin the support-mailbox assertion to the monitored Nhaav inbox rather than a
# developer's local .env.
os.environ["SUPPORT_EMAIL"] = "nhaavnotifications@gmail.com"
os.environ["EXPOSE_SESSION_TOKENS"] = "true"
# The global per-user backstop is a production traffic control. Tests exercise
# the endpoint-specific limits directly and share a database across modules;
# letting the backstop run would make unrelated tests fail by request count.
os.environ["GLOBAL_API_RATE_LIMIT_ENABLED"] = "false"
# The suite sends X-Forwarded-For/X-Real-IP to isolate per-IP budgets, so it
# explicitly emulates a deployment behind a trusted proxy. Production defaults
# to false (see Settings.TRUST_PROXY_HEADERS); the direct-exposure test flips it
# back to false for its own assertion.
os.environ["TRUST_PROXY_HEADERS"] = "true"
