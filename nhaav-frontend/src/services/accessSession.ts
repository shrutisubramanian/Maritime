/**
 * Live countdown maths for Nhaav's account-bound 6-hour access session.
 *
 * The BACKEND owns the session: it allocates one pass per account at login,
 * stamps `expires_at` on it, and consumes it on expiry or logout. The browser
 * only ever *renders* that authoritative window — nothing here can start,
 * extend or revive a session.
 *
 * Everything in this module is pure so the arithmetic can be tested without a
 * DOM, and so both the access card and the session watcher share ONE
 * implementation instead of drifting apart.
 *
 * How the countdown stays correct:
 *
 *   * the server sends the number of seconds left on ITS clock
 *     (`remaining_seconds`) and the absolute deadline (`expires_at`);
 *   * we capture that value together with the local instant it arrived
 *     (`baseline.at`) and, on every tick, subtract only the time that has
 *     genuinely elapsed locally.
 *
 * Subtracting locally-elapsed time (instead of comparing the browser clock to
 * `expires_at`) keeps the clock immune to a client whose clock is minutes off
 * the server's: a skewed clock changes WHEN the display starts, never how fast
 * it burns down, and a tampered clock can at most make the UI react early —
 * the backend still refuses every protected request once the pass is gone.
 */
import { parseServerDate } from './access';

/** Server-reported seconds-left, captured at the local instant `at`. */
export interface CountdownBaseline {
  /** Local epoch milliseconds when `remaining` was measured. */
  at: number;
  /** Whole seconds the server said were left at that instant. */
  remaining: number;
}

/** The session shape both `/access/status` and `/subscription/status` return. */
export interface SessionWindow {
  expires_at?: string | null;
  remaining_seconds?: number | null;
}

/**
 * Capture a countdown baseline from a server session window.
 *
 * Returns null only when the payload cannot describe a window at all (no
 * deadline, no seconds left), so the caller shows no timer rather than
 * inventing one. A window the server reports as already used up yields a
 * baseline of 0 seconds — an honest zero, which the caller treats as "confirm
 * with the server, then end the session".
 *
 * `remaining_seconds` wins when present because it is already expressed on the
 * server's clock. `expires_at` is the fallback for payloads that only carry the
 * deadline; it is read as UTC when the API omits a zone.
 */
export const captureBaseline = (
  session: SessionWindow | null | undefined,
  now: number = Date.now(),
): CountdownBaseline | null => {
  if (!session) return null;

  if (typeof session.remaining_seconds === 'number' && Number.isFinite(session.remaining_seconds)) {
    return { at: now, remaining: Math.max(0, Math.floor(session.remaining_seconds)) };
  }

  if (session.expires_at) {
    const deadline = parseServerDate(session.expires_at).getTime();
    if (Number.isNaN(deadline)) return null;
    return { at: now, remaining: Math.max(0, Math.floor((deadline - now) / 1000)) };
  }

  return null;
};

/**
 * Whole seconds left at `now`, floored and never negative.
 *
 * The result only shrinks with real elapsed time; a backwards clock jump
 * (NTP correction, sleep/resume) is clamped so the display can never grow past
 * the last value the server confirmed.
 */
export const secondsRemaining = (
  baseline: CountdownBaseline | null,
  now: number = Date.now(),
): number => {
  if (!baseline) return 0;
  const elapsed = Math.floor((now - baseline.at) / 1000);
  return Math.max(0, baseline.remaining - Math.max(0, elapsed));
};

/**
 * HH:MM:SS with every field zero-padded, e.g. `04:32:18`.
 * Fixed width so the digits do not jitter as the clock ticks.
 */
export const formatClock = (seconds: number): string => {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  return [hours, minutes, secs].map((part) => String(part).padStart(2, '0')).join(':');
};
