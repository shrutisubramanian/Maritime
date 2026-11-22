from pydantic import BaseModel
from datetime import datetime


class AccessSessionInfo(BaseModel):
    activated_at: datetime | None = None
    expires_at: datetime
    remaining_seconds: int


class AccessStatusResponse(BaseModel):
    """
    Pass balance for the CALLING ACCOUNT (passes are account-owned, never
    company-shared).
    """
    access_control_enabled: bool
    total_tokens: int
    available_tokens: int
    active_tokens: int
    consumed_tokens: int
    # Passes that were never used inside their stamped plan window.
    expired_tokens: int = 0
    current_session: AccessSessionInfo | None = None
    # Earliest date on which one of the account's unused passes closes.
    next_pass_expiry: datetime | None = None
    # The unused-validity window, stated by the server so clients never hardcode it.
    # Nominal days for display; the stamped expiry is calendar-exact.
    pass_validity_days: int = 180
