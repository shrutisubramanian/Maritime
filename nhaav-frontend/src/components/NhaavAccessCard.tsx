import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { formatSessionExpiry } from '../services/access';
import {
  captureBaseline,
  formatClock,
  secondsRemaining,
  type CountdownBaseline,
} from '../services/accessSession';
import {
  formatPlanTaxNote,
  formatPlanTotal,
  subscriptionService,
  type SubscriptionStatus,
} from '../services/subscription';
import { notifySessionExpired } from '../services/sessionEvents';

/**
 * Nhaav Access — the signed-in account's subscription + access-pass summary.
 *
 * Shown identically on the CLIENT, SUPPLIER and SERVICE PROVIDER dashboards so
 * every role sees the same entitlement story: the plan, how many of the
 * account's passes remain (per pack, each with its own unused-validity window),
 * the caller's current 6-hour session and when it ends, plus a link to the
 * subscription page for renewal.
 *
 * Renders nothing for accounts whose access gate is off
 * (access_control_enabled = false) — legacy/ungated dashboards are unchanged.
 *
 * The countdown is INFORMATIONAL ONLY. The backend owns expiry, the active
 * pass, consumed passes and account entitlement; this component merely
 * reflects the server-provided expiry and (once the server confirms the pass is
 * gone) asks the app to return to login. A manipulated local clock can make the
 * UI react early, never keep a session alive.
 *
 * All colors come from the design tokens exposed as CSS variables
 * (see src/constants/colors.ts + src/index.css).
 */
const C = {
  manrope: "'Manrope', sans-serif",
  inter: "'Inter', sans-serif",
  // The access-pass panel: Yale Blue field with Morning Dawn ink
  // (the client's standing rule — chiffon text on a Yale Blue ground).
  passPanel: 'var(--color-brand)',
  passInk: 'var(--color-merino)',
  passHairline: 'rgba(255, 243, 109, 0.22)',
  passChip: 'rgba(255, 243, 109, 0.14)',
  surface: 'var(--color-surface)',
  surfaceAlt: 'var(--color-surface-alt)',
  text: 'var(--color-text)',
  muted: 'var(--color-muted)',
  faint: 'var(--color-faint)',
  border: 'var(--color-border)',
  brand: 'var(--color-brand)',
  brandTint: 'var(--color-brand-tint-solid)',
  onBrand: 'var(--color-on-brand)',
  successText: 'var(--color-success-text)',
  successTint: 'var(--color-success-tint)',
  warningText: 'var(--color-warning-text)',
  warningTint: 'var(--color-warning-tint)',
  errorText: 'var(--color-error-text)',
  errorTint: 'var(--color-error-tint)',
  infoText: 'var(--color-info)',
  infoTint: 'var(--color-info-tint)',
} as const;

const STATUS_STYLE: Record<string, { label: string; color: string; tint: string }> = {
  ACTIVE: { label: 'Active', color: C.successText, tint: C.successTint },
  PENDING: { label: 'Pending activation', color: C.warningText, tint: C.warningTint },
  EXPIRED: { label: 'Expired', color: C.errorText, tint: C.errorTint },
  CANCELLED: { label: 'Cancelled', color: C.errorText, tint: C.errorTint },
};

const Stat: React.FC<{ label: string; value: string; sub?: string; valueColor?: string }> = ({
  label,
  value,
  sub,
  valueColor,
}) => (
  <div style={{ minWidth: 150, flex: '1 1 150px' }}>
    <p
      style={{
        fontSize: '0.65rem',
        color: C.muted,
        textTransform: 'uppercase',
        letterSpacing: '0.12em',
        fontWeight: 600,
        margin: 0,
      }}
    >
      {label}
    </p>
    <p
      style={{
        fontFamily: C.manrope,
        fontWeight: 700,
        fontSize: '1.05rem',
        color: valueColor ?? C.text,
        margin: '3px 0 0',
      }}
    >
      {value}
    </p>
    {sub && <p style={{ fontSize: '0.7rem', color: C.faint, margin: '2px 0 0' }}>{sub}</p>}
  </div>
);

export interface NhaavAccessCardProps {
  /** Optional layout overrides from the hosting dashboard. */
  style?: React.CSSProperties;
}

const NhaavAccessCard: React.FC<NhaavAccessCardProps> = ({ style }) => {
  const navigate = useNavigate();
  const [status, setStatus] = useState<SubscriptionStatus | null>(null);

  // Server-provided remaining seconds captured at fetch time plus the local
  // instant it was captured. Live remaining = baseline - locally elapsed time,
  // so the countdown is immune to absolute clock skew (see accessSession.ts).
  const [baseline, setBaseline] = useState<CountdownBaseline | null>(null);
  const [tick, setTick] = useState<number>(() => Date.now());
  const zeroHandledRef = useRef(false);

  const applyStatus = useCallback((next: SubscriptionStatus) => {
    setStatus(next);
    const pass = next.active_pass;
    if (pass && pass.held_by_me) {
      setBaseline(captureBaseline(pass));
      zeroHandledRef.current = false;
    } else {
      setBaseline(null);
    }
  }, []);

  const load = useCallback(async () => {
    try {
      applyStatus(await subscriptionService.getStatus());
    } catch {
      /* endpoint unavailable / not gated — the card simply stays hidden */
    }
  }, [applyStatus]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const next = await subscriptionService.getStatus();
        if (!cancelled) applyStatus(next);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [applyStatus]);

  // Keep the balance reasonably fresh (a colleague's login/expiry changes it),
  // and RE-SYNC whenever the page comes back to the user: a returning tab,
  // a bfcache restore, or a session restored after a reload all re-read the
  // server's window instead of trusting whatever the display last showed.
  useEffect(() => {
    const id = window.setInterval(() => {
      void load();
    }, 60_000);
    const resync = () => {
      setTick(Date.now());
      if (document.visibilityState !== 'hidden') void load();
    };
    window.addEventListener('focus', resync);
    window.addEventListener('pageshow', resync);
    document.addEventListener('visibilitychange', resync);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('focus', resync);
      window.removeEventListener('pageshow', resync);
      document.removeEventListener('visibilitychange', resync);
    };
  }, [load]);

  // Local 1s tick drives the display countdown.
  useEffect(() => {
    if (!baseline) return;
    const id = window.setInterval(() => setTick(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [baseline]);

  const remainingSeconds = secondsRemaining(baseline, tick);

  // The local countdown reached zero: ask the SERVER (authoritative). If the
  // backend still shows a live session we re-sync; only when it confirms the
  // pass is gone do we return to login.
  useEffect(() => {
    if (!baseline || remainingSeconds > 0 || zeroHandledRef.current) return;
    zeroHandledRef.current = true;
    let cancelled = false;
    (async () => {
      try {
        const next = await subscriptionService.getStatus();
        if (cancelled) return;
        const pass = next.active_pass;
        if (pass && pass.held_by_me && (pass.remaining_seconds ?? 0) > 0) {
          applyStatus(next);
        } else {
          setBaseline(null);
          notifySessionExpired();
        }
      } catch {
        /* the 401 interceptor handles an already-ended session */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [baseline, remainingSeconds, applyStatus]);

  if (!status || !status.access_control_enabled) return null;

  const { plan, subscription, passes, active_pass: activePass } = status;
  const heldByMe = Boolean(activePass && activePass.held_by_me);
  const statusStyle = subscription
    ? STATUS_STYLE[subscription.status] ?? { label: subscription.status, color: C.muted, tint: C.surfaceAlt }
    : null;

  // Passes are ACCOUNT-owned and each one stays usable until its OWN unused
  // window closes (the server states it as `pass_validity_days`), so a lapsed
  // subscription does NOT make remaining passes unusable — they carry forward.
  const noPasses = passes.total > 0 && passes.remaining === 0 && !activePass;
  const blocked = noPasses;
  const passPct = passes.total > 0 ? Math.round((passes.remaining / passes.total) * 100) : 0;

  const subscriptionInactive = subscription !== null && subscription.status !== 'ACTIVE';
  // The earliest date on which one of the account's unused passes closes.
  const nextPassExpiry =
    status.packs?.map(p => p.next_pass_expiry).filter((d): d is string => Boolean(d)).sort()[0] ?? null;

  const blockedMessage =
    subscription?.status === 'PENDING'
      ? 'Your subscription is pending activation — new sessions become available once the plan is activated.'
      : subscription?.status === 'CANCELLED'
        ? 'Your subscription was cancelled — purchase another pack to start new sessions.'
        : subscription?.status === 'EXPIRED'
          ? 'Your subscription has lapsed. Any passes you still hold stay usable until their own unused-validity window closes.'
          : null;

  return (
    <section
      style={{
        background: C.surface,
        border: `1px solid ${C.border}`,
        borderRadius: 16,
        padding: '1.25rem 1.5rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '1.1rem',
        fontFamily: C.inter,
        ...style,
      }}
    >
      {/* ── ACCESS PASS — the live 6-hour session clock ──────────────────── */}
      <div
        style={{
          background: C.passPanel,
          color: C.passInk,
          borderRadius: 14,
          padding: '1.15rem 1.35rem 1.25rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.85rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '1.3rem', color: C.passInk }}>
              anchor
            </span>
            <span
              style={{
                fontFamily: C.manrope,
                fontWeight: 800,
                fontSize: '0.95rem',
                letterSpacing: '0.14em',
                color: C.passInk,
              }}
            >
              NHAAV
            </span>
          </div>

          <span
            style={{
              fontSize: '0.68rem',
              fontWeight: 700,
              color: C.passInk,
              background: C.passChip,
              padding: '3px 10px',
              borderRadius: 999,
              whiteSpace: 'nowrap',
            }}
          >
            {heldByMe ? 'Active' : 'No session'}
          </span>
        </div>

        <div style={{ height: 1, background: C.passHairline }} />

        <div>
          <h3
            style={{
              fontFamily: C.manrope,
              fontWeight: 800,
              fontSize: '1.45rem',
              letterSpacing: '0.01em',
              textTransform: 'uppercase',
              color: C.passInk,
              margin: 0,
            }}
          >
            Access pass
          </h3>
          <p style={{ fontSize: '0.85rem', color: C.passInk, opacity: 0.88, margin: '4px 0 0' }}>
            {heldByMe
              ? 'Your session is active'
              : activePass
                ? 'This session is on another device'
                : 'No session running — log in to start a new pass'}
          </p>
        </div>

        <div>
          <p
            style={{
              fontSize: '0.6rem',
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              fontWeight: 700,
              color: C.passInk,
              opacity: 0.75,
              margin: 0,
            }}
          >
            Time remaining
          </p>
          <p
            style={{
              fontFamily: C.manrope,
              fontWeight: 800,
              fontSize: '2.15rem',
              lineHeight: 1.15,
              letterSpacing: '0.01em',
              fontVariantNumeric: 'tabular-nums',
              color: C.passInk,
              margin: '2px 0 0',
            }}
          >
            {formatClock(heldByMe ? remainingSeconds : 0)}
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', color: C.passInk, opacity: 0.9 }}>
          <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>
            check_circle
          </span>
          Account-bound session · ends automatically after {status.session_hours} hours
        </div>
      </div>

      {statusStyle && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <span
            style={{
              fontSize: '0.7rem',
              fontWeight: 700,
              color: statusStyle.color,
              background: statusStyle.tint,
              padding: '4px 10px',
              borderRadius: 999,
              whiteSpace: 'nowrap',
            }}
          >
            Plan {statusStyle.label.toLowerCase()}
          </span>
          <span style={{ fontSize: '0.8rem', color: C.muted }}>
            {status.organization ?? status.account ?? 'Your account'}
          </span>
        </div>
      )}

      {subscriptionInactive && blockedMessage && !noPasses && (
        <p
          style={{
            fontSize: '0.8rem',
            fontWeight: 600,
            color: C.warningText,
            background: C.warningTint,
            borderRadius: 10,
            padding: '0.65rem 0.85rem',
            margin: 0,
          }}
        >
          {blockedMessage}
        </p>
      )}

      <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', rowGap: '1rem' }}>
        <Stat
          label="Plan"
          value={plan ? formatPlanTotal(plan) : 'No plan'}
          sub={plan ? `${plan.name} · ${plan.pass_count} passes · ${formatPlanTaxNote(plan)}` : undefined}
        />

        <div style={{ minWidth: 170, flex: '1 1 170px' }}>
          <Stat
            label="Passes"
            value={`${passes.remaining} / ${passes.total} remaining`}
            sub={
              passes.used > 0
                ? `${passes.used} used${nextPassExpiry ? ' · next expires ' + formatSessionExpiry(nextPassExpiry) : ''}`
                : nextPassExpiry
                  ? `Next expires ${formatSessionExpiry(nextPassExpiry)}`
                  : undefined
            }
            valueColor={noPasses ? C.errorText : undefined}
          />
          {(
            <div
              style={{
                marginTop: 6,
                height: 5,
                width: '100%',
                background: C.surfaceAlt,
                borderRadius: 999,
                overflow: 'hidden',
              }}
            >
              <div style={{ height: '100%', width: `${passPct}%`, background: C.brand, borderRadius: 999 }} />
            </div>
          )}
        </div>

        {/* The live clock lives in the pass panel above — not repeated here. */}
        <Stat
          label="Expires"
          value={
            activePass
              ? formatSessionExpiry(activePass.expires_at)
              : subscription?.expires_at
                ? formatSessionExpiry(subscription.expires_at)
                : '—'
          }
          sub={
            activePass
              ? 'session ends (6h from login)'
              : nextPassExpiry
                ? 'unused pass closes'
                : subscription?.expires_at
                  ? 'plan ends'
                  : undefined
          }
        />
      </div>

      {noPasses && (
        <div
          style={{
            background: C.errorTint,
            borderRadius: 10,
            padding: '0.75rem 0.9rem',
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
          }}
        >
          <p style={{ margin: 0, fontSize: '0.82rem', fontWeight: 700, color: C.errorText }}>
            No access passes remaining.
          </p>
          <p style={{ margin: 0, fontSize: '0.78rem', color: C.errorText }}>
            Purchase another access pack to continue using Nhaav. Passes you had
            already bought stay usable for the validity window stamped on them at
            the day they were issued.
          </p>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          type="button"
          onClick={() => navigate('/payments')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '0.55rem 1.1rem',
            borderRadius: 10,
            border: `1px solid ${C.border}`,
            background: C.brandTint,
            color: C.brand,
            fontWeight: 700,
            fontSize: '0.8rem',
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          {noPasses || blocked ? 'Purchase access pack' : 'View Subscription'}
          <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>
            arrow_forward
          </span>
        </button>
      </div>
    </section>
  );
};

export default NhaavAccessCard;
