import { apiClient } from './apiClient';

/**
 * Company access-token entitlement API.
 *
 * An Organization shares a pool of 10 tokens; one token = one login session
 * (6h max, consumed on logout). These endpoints are identity-only — they keep
 * working even when the caller's access session has ended, so the dashboard
 * can always display the true balance.
 */
export interface AccessSessionInfo {
  activated_at: string;
  expires_at: string;
  remaining_seconds: number;
}

export interface AccessStatus {
  access_control_enabled: boolean;
  total_tokens: number;
  available_tokens: number;
  active_tokens: number;
  consumed_tokens: number;
  current_session: AccessSessionInfo | null;
}

/** Format remaining seconds as H:MM:SS for the dashboard display. */
export const formatRemaining = (seconds: number): string => {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
};

/**
 * Parse a timestamp coming from the API.
 *
 * The backend emits naive UTC datetimes (e.g. "2026-10-06T14:30:00", no zone
 * designator). JavaScript would read that as LOCAL time, shifting the displayed
 * value by the viewer's UTC offset, so a missing zone is treated as UTC.
 * Date-only values ("2026-10-06") are left alone.
 */
export const parseServerDate = (value: string): Date => {
  if (/(?:Z|[+-]\d{2}:?\d{2})$/.test(value)) return new Date(value);
  if (value.includes('T')) return new Date(`${value}Z`);
  return new Date(value);
};

/**
 * Format a session/plan expiry as a friendly day + time, e.g.
 * "Today, 8:15 PM" / "Tomorrow, 8:15 PM" / "12 Oct, 8:15 PM".
 * Day is judged against the caller's local clock; this is display only.
 */
export const formatSessionExpiry = (iso: string, now: Date = new Date()): string => {
  const target = parseServerDate(iso);
  if (Number.isNaN(target.getTime())) return '\u2014';

  const sameDay = (a: Date, b: Date): boolean =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);

  const time = target.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
  if (sameDay(target, now)) return `Today, ${time}`;
  if (sameDay(target, tomorrow)) return `Tomorrow, ${time}`;
  if (sameDay(target, yesterday)) return `Yesterday, ${time}`;
  return `${target.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}, ${time}`;
};

export const accessService = {
  getStatus: async (): Promise<AccessStatus> => {
    const response = await apiClient.get('/access/status');
    return response.data;
  },
};
