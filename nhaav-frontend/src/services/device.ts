/**
 * This browser's identity for the ONE-DEVICE-PER-LOGIN rule.
 *
 * The backend binds an account to a single device while it is signed in: a
 * correct password from a second device is challenged with "switch devices?"
 * instead of silently sharing the session. For that it needs a stable id per
 * browser, which is what this module provides.
 *
 * The id is NOT a credential and is not a security boundary — it is generated
 * locally and could be spoofed. It exists so the backend (and the human) can
 * tell one browser from another; identity and entitlement stay with the JWT and
 * the access pass. Clearing site data simply looks like a new device, which the
 * user resolves through the switch-device prompt.
 */
const DEVICE_ID_KEY = 'nhaav_device_id';

/** A v4 UUID, with a fallback for browsers without crypto.randomUUID. */
const newDeviceId = (): string => {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
      const bytes = crypto.getRandomValues(new Uint8Array(16));
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;
      const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    }
  } catch {
    /* storage/crypto unavailable — fall through to a random-ish id */
  }
  return `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

/**
 * The stable id for this browser, created on first use.
 *
 * Kept in localStorage (not sessionStorage): a new tab must be recognized as
 * the SAME device, otherwise every tab would look like a separate device and
 * challenge the user constantly.
 */
export const getDeviceId = (): string => {
  try {
    const existing = localStorage.getItem(DEVICE_ID_KEY);
    if (existing) return existing;
    const created = newDeviceId();
    localStorage.setItem(DEVICE_ID_KEY, created);
    return created;
  } catch {
    // No storage (private mode / blocked): fall back to a per-page id. The
    // account will be challenged as if it were a new device, never silently
    // granted a second session.
    return newDeviceId();
  }
};

const browserName = (ua: string): string => {
  const checks: Array<[RegExp, string]> = [
    [/Edg\//, 'Edge'],
    [/OPR\/|Opera/, 'Opera'],
    [/Chrome\//, 'Chrome'],
    [/Firefox\//, 'Firefox'],
    [/Safari\//, 'Safari'],
  ];
  for (const [pattern, name] of checks) {
    if (pattern.test(ua)) return name;
  }
  return 'Browser';
};

const platformName = (ua: string): string => {
  if (/iPhone|iPad|iPod/.test(ua)) return 'iOS';
  if (/Android/.test(ua)) return 'Android';
  if (/Mac OS X/.test(ua)) return 'macOS';
  if (/Windows/.test(ua)) return 'Windows';
  if (/Linux/.test(ua)) return 'Linux';
  return 'this device';
};

/** Human name for this device, e.g. "Chrome on Windows" — shown in prompts. */
export const getDeviceLabel = (): string => {
  if (typeof navigator === 'undefined') return 'This device';
  const ua = navigator.userAgent || '';
  return `${browserName(ua)} on ${platformName(ua)}`;
};

/** Headers every API request carries so the backend can enforce one device. */
export const getDeviceHeaders = (): Record<string, string> => ({
  'X-Device-Id': getDeviceId(),
  'X-Device-Label': getDeviceLabel(),
});
