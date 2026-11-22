import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { useAuth } from '../hooks/useAuth';
import { formatRemaining } from '../services/access';
import {
  captureBaseline,
  secondsRemaining,
  type CountdownBaseline,
} from '../services/accessSession';
import { subscriptionService } from '../services/subscription';
import { notifySessionExpired } from '../services/sessionEvents';
import { ConfirmationModal } from './ConfirmationModal';

/**
 * Nhaav access-session watcher.
 *
 * The BACKEND, not the browser, owns the 6-hour access pass: it starts a pass
 * at login and consumes it on expiry or logout. There is NO inactivity timeout:
 * runs dry. There is no "inactivity" rule on the server, so this provider no
 * longer logs anyone out after a fixed idle period — doing so would burn an
 * a pass is never burned for a user who simply stepped away.
 *
 * Instead it mirrors the real session: it reads the server's remaining time,
 * shows an informational warning as the pass nears its end, and once the SERVER
 * confirms the pass is gone it asks the app to return to login. The countdown
 * here is display only — a manipulated local clock can make the UI react early,
 * never extend the session.
 */
const WARNING_WINDOW_SECONDS = 5 * 60; // show the notice in the final 5 minutes
const POLL_INTERVAL_MS = 60 * 1000;    // keep the balance/session reasonably fresh

interface InactivityContextType {
  isWarning: boolean;
  remainingSeconds: number;
  /** Dismiss the informational notice (the session itself is unchanged). */
  dismissWarning: () => void;
  /** End the session now — consumes the caller's access pass (confirmed by UI). */
  endSessionNow: () => void;
}

const InactivityContext = createContext<InactivityContextType | undefined>(undefined);

export const useInactivity = () => {
  const ctx = useContext(InactivityContext);
  if (!ctx) throw new Error('useInactivity must be used within InactivityProvider');
  return ctx;
};

const C = {
  manrope: "'Manrope', sans-serif",
  inter: "'Inter', sans-serif",
  surface: 'var(--color-surface)',
  surfaceAlt: 'var(--color-surface-alt)',
  text: 'var(--color-text)',
  muted: 'var(--color-muted)',
  border: 'var(--color-border)',
  brand: 'var(--color-brand)',
  onBrand: 'var(--color-on-brand)',
  warning: 'var(--color-warning)',
  warningText: 'var(--color-warning-text)',
  warningTint: 'var(--color-warning-tint)',
} as const;

export const InactivityProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { isAuthenticated, logout } = useAuth();

  const [baseline, setBaseline] = useState<CountdownBaseline | null>(null);
  const [tick, setTick] = useState<number>(() => Date.now());
  const [warningDismissed, setWarningDismissed] = useState(false);
  const [confirmingLogout, setConfirmingLogout] = useState(false);

  const expiresKeyRef = useRef<string | null>(null);
  const zeroHandledRef = useRef(false);
  const authRef = useRef(isAuthenticated);
  // Whether THIS account held a live pass in this browser session. A
  // renewal-only login (gated account with nothing usable -> no pass allocated,
  // issued) must NOT be mistaken for a session that just ended, or the user
  // would be logged straight back out of the very page they need to renew on.
  const hadLivePassRef = useRef(false);

  useEffect(() => {
    authRef.current = isAuthenticated;
  }, [isAuthenticated]);

  const sync = useCallback(async () => {
    try {
      const status = await subscriptionService.getStatus();
      if (!authRef.current) return;

      if (!status.access_control_enabled) {
        // Ungated account: no pass model applies.
        setBaseline(null);
        return;
      }

      const pass = status.active_pass;
      if (pass && pass.held_by_me && pass.remaining_seconds > 0) {
        setBaseline(captureBaseline(pass));
        if (expiresKeyRef.current !== pass.expires_at) {
          expiresKeyRef.current = pass.expires_at;
          setWarningDismissed(false);
        }
        zeroHandledRef.current = false;
        hadLivePassRef.current = true;
        return;
      }

      // Gated account with no live pass for this user. Only treat this as
      // the session ENDING when this account actually held a live pass in this
      // browser session; the backend is authoritative for expiry, but a login
      // that never received a pass (renewal-only) must stay signed in.
      setBaseline(null);
      if (hadLivePassRef.current) {
        notifySessionExpired();
      }
    } catch {
      /* network/401 — the 401 interceptor handles an already-ended session */
    }
  }, []);

  // Poll the server while signed in, and RE-SYNC whenever the page comes back
  // to the user (focus, bfcache restore, tab shown again, reload). A background
  // tab throttles its interval, so the display is also recomputed on the spot.
  useEffect(() => {
    if (!isAuthenticated) {
      setBaseline(null);
      expiresKeyRef.current = null;
      hadLivePassRef.current = false;
      return;
    }
    void sync();
    const id = window.setInterval(() => void sync(), POLL_INTERVAL_MS);
    const resync = () => {
      setTick(Date.now());
      if (document.visibilityState !== 'hidden') void sync();
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
  }, [isAuthenticated, sync]);

  // Local 1s tick for the countdown display.
  useEffect(() => {
    if (!baseline) return;
    const id = window.setInterval(() => setTick(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [baseline]);

  const remainingSeconds = secondsRemaining(baseline, tick);

  // The local countdown reached zero: ask the SERVER (authoritative). If it
  // still reports a live session we re-sync; only when the pass is confirmed
  // gone do we trigger the return-to-login flow.
  useEffect(() => {
    if (!baseline || remainingSeconds > 0 || zeroHandledRef.current) return;
    zeroHandledRef.current = true;
    let cancelled = false;
    (async () => {
      try {
        const status = await subscriptionService.getStatus();
        if (cancelled) return;
        const pass = status.active_pass;
        if (pass && pass.held_by_me && pass.remaining_seconds > 0) {
          setBaseline(captureBaseline(pass));
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
  }, [baseline, remainingSeconds]);

  const isWarning = Boolean(
    baseline && remainingSeconds > 0 && remainingSeconds <= WARNING_WINDOW_SECONDS && !warningDismissed,
  );

  const dismissWarning = useCallback(() => setWarningDismissed(true), []);
  const endSessionNow = useCallback(() => logout(), [logout]);

  return (
    <InactivityContext.Provider value={{ isWarning, remainingSeconds, dismissWarning, endSessionNow }}>
      {children}

      {isWarning && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(11, 34, 57, 0.5)',
            backdropFilter: 'blur(4px)',
            WebkitBackdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '1rem',
          }}
        >
          <div
            style={{
              background: C.surface,
              border: `1px solid ${C.border}`,
              borderRadius: 16,
              padding: '2rem',
              maxWidth: 420,
              width: '100%',
              boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
            }}
          >
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: '50%',
                background: C.warningTint,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 1.5rem',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '1.75rem', color: C.warningText }}>
                timer
              </span>
            </div>

            <h3
              style={{
                fontFamily: C.manrope,
                fontWeight: 700,
                fontSize: '1.25rem',
                color: C.text,
                margin: '0 0 0.5rem',
                textAlign: 'center',
              }}
            >
              Nhaav access session ending
            </h3>

            <p
              style={{
                fontSize: '0.875rem',
                color: C.muted,
                margin: '0 0 1.5rem',
                textAlign: 'center',
                lineHeight: 1.5,
              }}
            >
              Your access-pass session ends in{' '}
              <strong style={{ color: C.warningText }}>{formatRemaining(remainingSeconds)}</strong>. When it ends
              you will be returned to the login screen — starting a new session uses another pass from your
              account&rsquo;s own passes.
            </p>

            <div style={{ height: 4, background: C.surfaceAlt, borderRadius: 2, marginBottom: '1.5rem', overflow: 'hidden' }}>
              <div
                style={{
                  height: '100%',
                  background: C.warning,
                  borderRadius: 2,
                  width: `${Math.min(100, (remainingSeconds / WARNING_WINDOW_SECONDS) * 100)}%`,
                  transition: 'width 1s linear',
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button
                type="button"
                onClick={() => setConfirmingLogout(true)}
                style={{
                  flex: 1,
                  padding: '0.75rem 1rem',
                  borderRadius: 8,
                  border: `1px solid ${C.border}`,
                  background: 'transparent',
                  color: C.muted,
                  fontWeight: 600,
                  fontSize: '0.875rem',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                Log out now
              </button>
              <button
                type="button"
                onClick={dismissWarning}
                style={{
                  flex: 1,
                  padding: '0.75rem 1rem',
                  borderRadius: 8,
                  border: 'none',
                  background: C.brand,
                  color: C.onBrand,
                  fontWeight: 700,
                  fontSize: '0.875rem',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                Continue working
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Same confirmation the sidebar logout uses: logging out consumes the
          current access pass, so it is never done silently from here either. */}
      <ConfirmationModal
        isOpen={confirmingLogout}
        title="Log out of Nhaav?"
        message="Your current access pass will be consumed when you log out. Signing back in will use another pass from your account's balance."
        confirmText="Log out"
        cancelText="Stay signed in"
        isDestructive
        onConfirm={() => {
          setConfirmingLogout(false);
          endSessionNow();
        }}
        onCancel={() => setConfirmingLogout(false)}
      />
    </InactivityContext.Provider>
  );
};

export default InactivityProvider;
