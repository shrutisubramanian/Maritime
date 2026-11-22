import axios from 'axios';
import { authService } from './auth';
import { API_BASE_URL, getCsrfHeaders } from './apiEnv';
import { getDeviceHeaders } from './device';
import { notifySessionExpired } from './sessionEvents';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  // The session lives in httpOnly cookies, so every call must send them.
  withCredentials: true,
});

// Request interceptor: device identity + CSRF proof.
//
// There is no Authorization header any more — nothing in JS can read the token.
// The browser attaches the session cookie, and for a state-changing request we
// copy the readable CSRF cookie into a header so the server can verify the call
// came from this app and not from some hostile page riding the cookie.
//
// X-Device-Id is what makes ONE DEVICE PER LOGIN enforceable per request: once
// an account is bound to a device, any request from a different one is refused
// with a 401 that names the reason, so a displaced device is signed out the
// moment the session moves. The backend ignores the header for accounts that
// have never bound a device.
apiClient.interceptors.request.use(
  (config) => {
    // A FormData body (payment receipt, document, listing-fee proof) must be
    // sent as multipart with the boundary the browser generates. The instance
    // default says JSON, and a hand-written 'multipart/form-data' has no
    // boundary either, so both have to go: otherwise the server parses no
    // fields at all and answers 422 "Field required" for every one of them.
    if (typeof FormData !== 'undefined' && config.data instanceof FormData) {
      const headers = config.headers as unknown as {
        delete?: (name: string) => void;
        [key: string]: unknown;
      };
      if (typeof headers.delete === 'function') {
        headers.delete('Content-Type');
        headers.delete('content-type');
      } else {
        delete headers['Content-Type'];
        delete headers['content-type'];
      }
    }

    const method = (config.method || 'get').toUpperCase();
    for (const [key, value] of Object.entries(getDeviceHeaders())) {
      config.headers[key] = value;
    }
    for (const [key, value] of Object.entries(getCsrfHeaders(method))) {
      config.headers[key] = value;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor to handle 401s globally.
//
// With cookie sessions the client cannot clear the credential itself; it clears
// the cached user and lets the app react (SessionExpiryHandler returns to /login
// with an explanation). A 401 on a sign-in attempt is a normal credential error
// and must NOT be reported as an expiry.
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      const url: string = error.config?.url || '';
      const isSignInAttempt = /\/(auth\/login|auth\/register|admin\/auth\/login)/.test(url);
      const hadUser = Boolean(authService.getStoredUser());
      if (hadUser) {
        authService.removeStoredUser();
      }
      if (hadUser && !isSignInAttempt) {
        const detail = error.response?.data?.detail;
        notifySessionExpired(typeof detail === 'string' ? detail : undefined);
      }
    }
    return Promise.reject(error);
  }
);
