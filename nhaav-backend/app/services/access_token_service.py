"""
ACCOUNT-LEVEL access-pass entitlements: lifecycle + integration points.

Login flow  : AuthService.login_user      -> AccessTokenService.allocate_for_login
Logout flow : POST /auth/logout           -> AccessTokenService.consume_for_logout
Every request: auth_guard.get_current_user -> AccessTokenService.enforce_access_token
                              (lazy expiry detection — no background worker needed)

OWNERSHIP (Captain's final rule)
The entitlement boundary is the individual ACCOUNT, not a company:

    Account (User) -> Subscription -> AccessPack -> AccessToken (pass)

`AccessToken.owner_user_id` / `AccessPack.owner_user_id` name the account that
bought the passes. Only that account can ever allocate them. Two employees of the
same company share NOTHING: each has their own packs and passes. `Organization`
is retained as optional company/business metadata and still powers the
marketplace, but it is never consulted to decide who may consume a pass.

Admins are platform staff: never gated, never consume a pass.

The access token is an opaque server-side ENTITLEMENT row. It is NOT a JWT and is
never returned to the client. The JWT stays responsible for identity; this row
controls whether the account may start (and keep) a Nhaav session.

TWO INDEPENDENT CLOCKS
  * UNUSED validity — the plan's calendar window (6 or 12 months) from
    `available_at`. A pass that is never allocated
    inside that window becomes EXPIRED permanently. Unused passes therefore carry
    forward, but only until their own stamped window closes. Tracked PER PASS.
  * SESSION length — 6 hours from allocation. A pass that IS used is consumed by
    that session, and its unused-validity window stops mattering.

There is deliberately NO inactivity/idle timeout anywhere in this service: the
only session duration is 6 hours from a successful login.

Race safety: allocation is a compare-and-swap (UPDATE ... WHERE status =
'AVAILABLE') guarded by rowcount + retry, backed by two partial unique indexes
(one ACTIVE pass per owner_user_id and per current_user_id). Two concurrent
logins for the same account can never both commit an ACTIVE row, and no in-memory
lock is involved — this works on SQLite and PostgreSQL alike.
"""
import uuid
from datetime import datetime, timedelta

from fastapi import HTTPException, status as http_status
from sqlalchemy import false, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.access_token import (
    AccessPack,
    AccessPackStatus,
    AccessToken,
    AccessTokenStatus,
    Organization,
)
from app.models.subscription import SubscriptionStatus
from app.models.user import User, UserRole
from app.utils.timezone import as_utc
from app.services.subscription_service import SubscriptionService

SESSION_DURATION_HOURS = 6
# A pass that is never allocated inside this window expires. PER PASS, counted
# from the moment the pass becomes available. Captain's rule — do not change.
# Legacy/dev fallback ONLY. Purchased packs and admin grants stamp the plan's
# calendar-exact expiry (6 months for 10 passes, 12 for 100) via
# `unused_expires_at`; this day count is used only when no plan is involved.
PASS_UNUSED_VALIDITY_DAYS = 40
_PACK_SIZE = 10
_NO_TOKENS_MESSAGE = "No Nhaav access passes are available for your account."


class AccessTokenService:
    # --------------------------------------------------- company metadata only
    @staticmethod
    def _resolve_organization(db: Session, user: User) -> Organization | None:
        """
        The user's COMPANY, for record-keeping and admin display ONLY.

        This is no longer an ownership boundary: passes belong to the account.
        Users without an explicit membership simply have no company attached.
        Admins are platform staff and never part of any pool.
        """
        if user.role == UserRole.admin:
            return None
        profile = getattr(user, "profile", None)
        if profile is None:
            from app.models.profile import Profile

            profile = db.query(Profile).filter(Profile.user_id == user.id).first()
        if profile is None or profile.organization_id is None:
            return None
        return db.query(Organization).filter(Organization.id == profile.organization_id).first()

    @staticmethod
    def assign_profile_to_organization(db: Session, profile, organization: Organization):
        """
        Explicit membership assignment (the ONLY way a profile joins an
        organization). No fuzzy/string matching anywhere — callers name the
        exact organization row. This sets COMPANY METADATA only; it grants no
        entitlement and moves no passes between accounts.
        """
        profile.organization_id = organization.id
        db.commit()
        db.refresh(profile)
        return profile

    @staticmethod
    def get_or_create_organization(db: Session, name: str) -> Organization:
        org = db.query(Organization).filter(Organization.name == name.strip()).first()
        if org is None:
            org = Organization(name=name.strip())
            db.add(org)
            db.flush()
        return org

    @staticmethod
    def is_gated(user: User) -> bool:
        """
        True when this ACCOUNT's paid-access gate is on (it has been granted an
        access pack / activated a subscription). Accounts that were never
        provisioned keep the legacy ungated behaviour.
        """
        if user.role == UserRole.admin:
            return False
        return bool(getattr(user, "access_control_enabled", False))

    # ------------------------------------------------------------ provisioning
    @staticmethod
    def _new_pass(
        pack: AccessPack,
        owner_id: uuid.UUID,
        organization: Organization | None,
        now: datetime,
        validity_days: int | None = None,
        unused_expires_at: datetime | None = None,
    ) -> AccessToken:
        """
        One pass with its own unused-validity window. `available_at` and
        `unused_expires_at` are the single source of truth for "unused expiry";
        they are stamped at issuance and never modified afterwards.

        `unused_expires_at` comes from the PLAN the pack was sold under — 6
        months for the 10-pass pack, 12 for the 100-pass pack. `validity_days` is
        the legacy/dev fallback when no plan expiry is supplied. It defaults to the
        base window only for dev/test provisioning, where no plan exists.
        """
        days = PASS_UNUSED_VALIDITY_DAYS if validity_days is None else int(validity_days)
        return AccessToken(
            owner_user_id=owner_id,
            organization_id=organization.id if organization is not None else None,
            pack_id=pack.id,
            status=AccessTokenStatus.available,
            available_at=now,
            # `unused_expires_at` wins when supplied: paid packs and admin grants
            # pass the calendar-exact expiry (6 or 12 months), while legacy/dev
            # provisioning falls back to the day count.
            unused_expires_at=(
                unused_expires_at if unused_expires_at is not None
                else now + timedelta(days=days)
            ),
        )

    @staticmethod
    def provision_pack(
        db: Session,
        owner: User,
        token_count: int = _PACK_SIZE,
        source: str = "test_helper",
        validity_days: int | None = None,
        validity_months: int | None = None,
    ) -> AccessPack:
        """
        Provision an access pack OWNED BY `owner`. Dev/test/admin path (the paid
        path is payment -> admin approval -> activate_subscription). NOT exposed
        on a public production endpoint.

        Granting a pack switches the ACCOUNT's entitlement gate on. The owner's
        company (if any) is recorded as metadata only.
        """
        organization = AccessTokenService._resolve_organization(db, owner)
        now = datetime.utcnow()
        if validity_months is not None:
            from app.models.subscription import BillingPeriod
            from app.services.subscription_service import add_duration

            expiry = add_duration(now, int(validity_months), BillingPeriod.MONTH)
        else:
            expiry = None

        pack = AccessPack(
            owner_user_id=owner.id,
            organization_id=organization.id if organization is not None else None,
            token_count=token_count,
            source=source,
        )
        db.add(pack)
        db.flush()
        db.add_all(
            [
                AccessTokenService._new_pass(
                    pack,
                    owner.id,
                    organization,
                    now,
                    validity_days=validity_days,
                    unused_expires_at=expiry,
                )
                for _ in range(token_count)
            ]
        )
        owner.access_control_enabled = True
        db.commit()
        db.refresh(pack)
        return pack

    @staticmethod
    def assign_pack_owner(db: Session, pack: AccessPack, owner: User) -> AccessPack:
        """
        Explicitly map a pre-ownership (legacy) pack to an account.

        Legacy shared packs are left with `owner_user_id IS NULL` by the
        migration because they cannot be mapped without guessing. This is the
        operator hook that resolves them: the pack, its passes and the owner's
        gate are all updated in one transaction. Unused passes keep whatever
        original window they already had.
        """
        organization = AccessTokenService._resolve_organization(db, owner)
        pack.owner_user_id = owner.id
        if pack.organization_id is None and organization is not None:
            pack.organization_id = organization.id
        db.query(AccessToken).filter(AccessToken.pack_id == pack.id).update(
            {
                "owner_user_id": owner.id,
                "organization_id": organization.id if organization is not None else None,
            },
            synchronize_session=False,
        )
        owner.access_control_enabled = True
        db.commit()
        db.refresh(pack)
        return pack

    # ------------------------------------------------------------ lazy expiry
    @staticmethod
    def _consume_expired(db: Session, owner: User, now: datetime) -> int:
        """6-hour session rule: an ACTIVE pass past its expiry is CONSUMED."""
        result = db.execute(
            update(AccessToken)
            .where(
                AccessToken.owner_user_id == owner.id,
                AccessToken.status == AccessTokenStatus.active,
                AccessToken.expires_at.isnot(None),
                AccessToken.expires_at <= now,
            )
            .values(status=AccessTokenStatus.consumed, consumed_at=now)
            .execution_options(synchronize_session=False)
        )
        # COMMIT EVEN WHEN NOTHING MATCHED. The UPDATE has already taken the
        # database's write lock; leaving the transaction open until the request
        # ends would hold that lock for every other request in the meantime
        # (on SQLite that surfaces as "database is locked" / a stalled page).
        db.commit()
        return result.rowcount or 0

    @staticmethod
    def _expire_unused(db: Session, owner: User, now: datetime) -> int:
        """
        unused-validity rule: an AVAILABLE pass whose own window has closed is
        EXPIRED permanently. Per pass, never per pack.

        Only AVAILABLE rows are touched — a pass that was allocated keeps its
        (separate) session lifecycle.
        """
        result = db.execute(
            update(AccessToken)
            .where(
                AccessToken.owner_user_id == owner.id,
                AccessToken.status == AccessTokenStatus.available,
                AccessToken.unused_expires_at.isnot(None),
                AccessToken.unused_expires_at <= now,
            )
            .values(status=AccessTokenStatus.expired)
            .execution_options(synchronize_session=False)
        )
        # Same reasoning as _consume_expired: release the write lock even when
        # the sweep changed no rows.
        db.commit()
        return result.rowcount or 0

    # ------------------------------------------------------ current session
    @staticmethod
    def _session_payload(token: AccessToken, now: datetime, reused: bool) -> dict:
        """Wire shape shared by every place a login reports a session."""
        expires_at = token.expires_at
        remaining = 0
        if expires_at is not None:
            # as_utc on both sides: on PostgreSQL `expires_at` is `timestamptz`
            # and comes back AWARE, while `now` is naive; subtracting the two
            # raises TypeError. SQLite returns naive values and hides this.
            remaining = max(0, int((as_utc(expires_at) - as_utc(now)).total_seconds()))
        return {
            "activated_at": token.activated_at,
            "expires_at": expires_at,
            "remaining_seconds": remaining,
            # True when this is the account's EXISTING session (a repeat login
            # reuses it), False when a fresh pass was allocated just now.
            "reused": reused,
        }

    @staticmethod
    def _reuse_active_pass(db: Session, owner: User, now: datetime) -> dict | None:
        """
        The caller's own LIVE 6-hour session, if any.

        One ACCOUNT may hold at most ONE ACTIVE pass. `owner_user_id` names the
        pass owner, so this is per-account: two different accounts (even in the
        same company) each have their own row and are unaffected.
        """
        token = (
            db.query(AccessToken)
            .filter(
                AccessToken.owner_user_id == owner.id,
                AccessToken.status == AccessTokenStatus.active,
                AccessToken.expires_at.isnot(None),
                AccessToken.expires_at > now,
            )
            .order_by(AccessToken.activated_at.desc())
            .first()
        )
        if token is None:
            return None
        return AccessTokenService._session_payload(token, now, reused=True)

    @staticmethod
    def get_active_session(db: Session, user: User) -> dict | None:
        """
        The caller's CURRENT live session (None when they hold none). Read-only
        helper: it lazily consumes expired passes and lapsed unused passes first,
        then reports the live one.
        """
        if not AccessTokenService.is_gated(user):
            return None
        now = datetime.utcnow()
        AccessTokenService._consume_expired(db, user, now)
        AccessTokenService._expire_unused(db, user, now)
        return AccessTokenService._reuse_active_pass(db, user, now)

    @staticmethod
    def access_blocked_message(db: Session, user: User) -> str | None:
        """
        Why a gated ACCOUNT may not start a NEW session right now, or None when
        it may.

        Used by the login layer to explain a RENEWAL-ONLY login: the identity is
        established so the user can reach the payment/renewal flow, but NO pass
        is allocated. It grants nothing.
        """
        if not AccessTokenService.is_gated(user):
            return None
        now = datetime.utcnow()
        SubscriptionService.expire_due_subscriptions(db, user, now)
        AccessTokenService._expire_unused(db, user, now)
        if AccessTokenService._has_usable_pass(db, user, now):
            return None
        return SubscriptionService.subscription_block_message(db, user, now)

    # ------------------------------------------------------------------ helper
    @staticmethod
    def _usable_pack_ids(db: Session, owner: User) -> list[uuid.UUID]:
        """
        Packs whose passes this account may still allocate: its own packs that
        have not been cancelled. Nothing company-scoped is ever included.
        """
        rows = (
            db.query(AccessPack.id)
            .filter(
                AccessPack.owner_user_id == owner.id,
                AccessPack.status != AccessPackStatus.CANCELLED,
            )
            .all()
        )
        return [row[0] for row in rows]

    @staticmethod
    def _has_usable_pass(db: Session, owner: User, now: datetime) -> bool:
        pack_ids = AccessTokenService._usable_pack_ids(db, owner)
        if not pack_ids:
            return False
        return (
            db.query(AccessToken.id)
            .filter(
                AccessToken.owner_user_id == owner.id,
                AccessToken.pack_id.in_(pack_ids),
                AccessToken.status == AccessTokenStatus.available,
                AccessToken.expires_at.is_(None),
                (
                    AccessToken.unused_expires_at.is_(None)
                    | (AccessToken.unused_expires_at > now)
                ),
            )
            .first()
            is not None
        )

    # ---------------------------------------------------------------- login
    @staticmethod
    def allocate_for_login(db: Session, user: User) -> dict | None:
        """
        Bind this successful login to one of the ACCOUNT's own access passes.

        Returns the session info dict when the login holds a session (either a
        freshly allocated pass, or the account's EXISTING live pass reused), and
        None when NO pass applies — an ungated/legacy account, an admin, or a
        gated account with nothing usable right now (renewal-only login).

        Raises 403 with a clear message only when the account IS entitled to a
        new session (it holds passes) but none of them can be used.
        """
        if not AccessTokenService.is_gated(user):
            return None

        now = datetime.utcnow()
        # Sweep expired subscriptions first so messaging is current, then apply
        # the two pass rules: the 6-hour session rule and the unused-validity rule.
        SubscriptionService.expire_due_subscriptions(db, user, now)
        AccessTokenService._consume_expired(db, user, now)
        AccessTokenService._expire_unused(db, user, now)

        # ONE ACTIVE PASS PER ACCOUNT: a repeat login by an account that already
        # holds a live session REUSES it and never allocates (burns) a second
        # pass. Checked FIRST so an in-flight 6-hour session keeps running even
        # if the subscription clock has since closed.
        existing = AccessTokenService._reuse_active_pass(db, user, now)
        if existing is not None:
            return existing

        pack_ids = AccessTokenService._usable_pack_ids(db, user)
        if not pack_ids:
            # Nothing has ever been issued to this account (or everything was
            # cancelled): a renewal-only login, explained by the caller.
            return None

        has_unexpired = (
            db.query(AccessToken.id)
            .filter(
                AccessToken.owner_user_id == user.id,
                AccessToken.pack_id.in_(pack_ids),
                AccessToken.status == AccessTokenStatus.available,
                AccessToken.expires_at.is_(None),
                (
                    AccessToken.unused_expires_at.is_(None)
                    | (AccessToken.unused_expires_at > now)
                ),
            )
            .first()
            is not None
        )
        if not has_unexpired:
            # Nothing usable right now. Two different situations:
            #
            #  * the account's subscription is NOT live (pending / expired /
            #    cancelled) — this is a RENEWAL-ONLY login. It authenticates so
            #    the user can reach the payment flow, but receives NO pass, and
            #    the caller explains why.
            #  * the subscription IS live (the account simply used up every
            #    pass) or the account was provisioned a pack directly — the
            #    balance is genuinely exhausted: refuse with a clear message.
            latest = SubscriptionService.latest_subscription(db, user)
            if latest is not None and latest.status != SubscriptionStatus.ACTIVE:
                return None
            raise HTTPException(
                status_code=http_status.HTTP_403_FORBIDDEN, detail=_NO_TOKENS_MESSAGE
            )

        duration = timedelta(hours=SESSION_DURATION_HOURS)
        last_error: Exception | None = None
        for _ in range(3):  # CAS retry: concurrent logins never share a pass
            candidates = db.scalars(
                select(AccessToken.id)
                .where(
                    AccessToken.owner_user_id == user.id,
                    AccessToken.pack_id.in_(pack_ids),
                    AccessToken.status == AccessTokenStatus.available,
                    # Only passes still inside their own unused-validity window.
                    (
                        AccessToken.unused_expires_at.is_(None)
                        | (AccessToken.unused_expires_at > now)
                    ),
                )
                .order_by(AccessToken.created_at)
                .limit(25)
            ).all()
            if not candidates:
                raise HTTPException(
                    status_code=http_status.HTTP_403_FORBIDDEN, detail=_NO_TOKENS_MESSAGE
                )

            # Claim one SPECIFIC candidate row via compare-and-swap. Only the
            # transaction whose UPDATE commits while the row is still AVAILABLE
            # wins (rowcount == 1); every loser re-runs its WHERE against the
            # committed row, matches nothing, and retries on the next candidate.
            for candidate_id in candidates:
                try:
                    claimed = db.execute(
                        update(AccessToken)
                        .where(
                            AccessToken.id == candidate_id,
                            AccessToken.status == AccessTokenStatus.available,
                        )
                        .values(
                            status=AccessTokenStatus.active,
                            owner_user_id=user.id,
                            current_user_id=user.id,
                            activated_at=now,
                            expires_at=now + duration,
                        )
                        .execution_options(synchronize_session=False)
                    )
                    if claimed.rowcount != 1:
                        continue
                    db.commit()
                except IntegrityError:
                    # A concurrent login for THIS account committed its ACTIVE
                    # pass first (partial unique indexes on owner/current_user
                    # WHERE status='ACTIVE'). Reuse that session instead of
                    # burning a second pass.
                    db.rollback()
                    reused = AccessTokenService._reuse_active_pass(db, user, datetime.utcnow())
                    if reused is not None:
                        return reused
                    continue

                token = db.query(AccessToken).filter(AccessToken.id == candidate_id).first()
                if token and token.expires_at:
                    return AccessTokenService._session_payload(
                        token, datetime.utcnow(), reused=False
                    )
                last_error = RuntimeError("Allocated token row could not be read back")
                db.rollback()
                break

            db.rollback()  # lost the race for these rows — retry on fresh state
        raise last_error or HTTPException(
            status_code=http_status.HTTP_403_FORBIDDEN, detail=_NO_TOKENS_MESSAGE
        )

    # --------------------------------------------------------------- logout
    @staticmethod
    def consume_for_logout(db: Session, user: User) -> bool:
        """
        Mark the caller's ACTIVE pass CONSUMED (logout kills it forever).
        Idempotent: a second call (or a call with no active pass) is a no-op.
        """
        if not AccessTokenService.is_gated(user):
            return False

        now = datetime.utcnow()
        result = db.execute(
            update(AccessToken)
            .where(
                AccessToken.owner_user_id == user.id,
                AccessToken.status == AccessTokenStatus.active,
            )
            .values(status=AccessTokenStatus.consumed, consumed_at=now)
            .execution_options(synchronize_session=False)
        )
        if result.rowcount:
            db.commit()
            return True
        db.rollback()
        return False

    # ------------------------------------------------------------- enforcement
    @staticmethod
    def enforce_access_token(db: Session, user: User) -> None:
        """
        Session-validity gate for protected requests (runs inside
        get_current_user). Detects expiry lazily — now >= expires_at means the
        pass is CONSUMED and the session must stop working immediately.
        No-op for admins and for accounts that were never gated.
        """
        if not AccessTokenService.is_gated(user):
            return

        now = datetime.utcnow()
        AccessTokenService._consume_expired(db, user, now)
        AccessTokenService._expire_unused(db, user, now)

        active = (
            db.query(AccessToken)
            .filter(
                AccessToken.owner_user_id == user.id,
                AccessToken.status == AccessTokenStatus.active,
            )
            .first()
        )
        if active is None:
            # Covers both "expired" and "logged out": the JWT alone no longer
            # grants a Nhaav session for a gated account.
            raise HTTPException(
                status_code=http_status.HTTP_401_UNAUTHORIZED,
                detail="Nhaav access session expired or logged out. Please log in again.",
                headers={"WWW-Authenticate": "Bearer"},
            )

    # ----------------------------------------------------------------- status
    @staticmethod
    def get_status(db: Session, user: User) -> dict:
        """
        Pass balance for the calling ACCOUNT. Never counts another account's
        passes — not even one belonging to the same company.
        """
        if not AccessTokenService.is_gated(user):
            return {
                "access_control_enabled": False,
                "total_tokens": 0,
                "available_tokens": 0,
                "active_tokens": 0,
                "consumed_tokens": 0,
                "expired_tokens": 0,
                "current_session": None,
                "next_pass_expiry": None,
                "pass_validity_days": PASS_UNUSED_VALIDITY_DAYS,
            }

        now = datetime.utcnow()
        AccessTokenService._consume_expired(db, user, now)
        AccessTokenService._expire_unused(db, user, now)

        rows = (
            db.query(AccessToken).filter(AccessToken.owner_user_id == user.id).all()
        )
        active_tokens = [t for t in rows if t.status == AccessTokenStatus.active]
        current = next((t for t in active_tokens if t.current_user_id == user.id), None)

        session = None
        if current and current.expires_at:
            session = {
                "activated_at": current.activated_at,
                "expires_at": current.expires_at,
                "remaining_seconds": max(
                    0, int((as_utc(current.expires_at) - as_utc(now)).total_seconds())
                ),
            }

        # Earliest closing window among the account's still-unused passes, so the
        # UI can warn "use before <date>" without inventing the rule client-side.
        next_expiry = min(
            (
                t.unused_expires_at
                for t in rows
                if t.status == AccessTokenStatus.available and t.unused_expires_at is not None
            ),
            default=None,
        )

        return {
            "access_control_enabled": True,
            "total_tokens": len(rows),
            "available_tokens": sum(
                1 for t in rows if t.status == AccessTokenStatus.available
            ),
            "active_tokens": len(active_tokens),
            "consumed_tokens": sum(
                1 for t in rows if t.status == AccessTokenStatus.consumed
            ),
            "expired_tokens": sum(1 for t in rows if t.status == AccessTokenStatus.expired),
            "current_session": session,
            "next_pass_expiry": next_expiry,
            "pass_validity_days": PASS_UNUSED_VALIDITY_DAYS,
        }
