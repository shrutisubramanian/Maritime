// Single source of truth for the Nhaav backend URL.
//
// SECURITY NOTE: no credential is stored in JavaScript any more. The session is
// carried by httpOnly cookies (`nhaav_access` / `nhaav_refresh`) that the
// browser sends automatically; the only thing JS reads is the CSRF cookie, which
// is not a credential but the double-submit half of the CSRF defence.
//
// Production config: set VITE_API_URL (no trailing slash) and make sure the API
// and the app share a registrable domain, or the cookies will not be sent.

/** Normalized (no trailing slash) backend URL. Never throws at import time. */
export const API_BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/+$/, '');

/** Read one cookie value (used for the CSRF token only). */
export function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/([.*+?^${}()|[\]\\])/g, '\\$1') + '=([^;]*)'));
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Headers that prove a cookie-authenticated request came from the app.
 * Empty for safe methods: a GET changes nothing, so it needs no proof.
 */
export function getCsrfHeaders(method: string = 'GET'): Record<string, string> {
  if (['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase())) return {};
  const token = readCookie('nhaav_csrf');
  return token ? { 'X-CSRF-Token': token } : {};
}
