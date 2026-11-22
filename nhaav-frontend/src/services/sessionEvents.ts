/**
 * Nhaav access-session events.
 *
 * The BACKEND is authoritative for the 6-hour access pass: it consumes the pass
 * on expiry, on logout, and refuses new sessions when the account's passes
 * is empty. This module only lets the UI *notice* that the session is over and
 * react (clear local auth state, return to login, explain why).
 *
 * Nothing here grants access — a client clock can at most make the UI react
 * EARLY, never extend a session.
 */
export const SESSION_EXPIRED_EVENT = 'nhaav:session-expired';

/** sessionStorage key used to carry the reason across a redirect to /login. */
const MESSAGE_KEY = 'nhaav_session_message';

export const SESSION_EXPIRED_DEFAULT_MESSAGE =
  'Your Nhaav access session has ended. Your access pass was used for that session \u2014 please log in again.';

/** Broadcast that the current access session has ended. */
export const notifySessionExpired = (message?: string): void => {
  window.dispatchEvent(
    new CustomEvent(SESSION_EXPIRED_EVENT, {
      detail: { message: message || SESSION_EXPIRED_DEFAULT_MESSAGE },
    }),
  );
};

/** Remember the reason so the login screen can explain what happened. */
export const setSessionMessage = (message: string): void => {
  try {
    sessionStorage.setItem(MESSAGE_KEY, message);
  } catch {
    /* storage unavailable — the login screen simply shows nothing */
  }
};

/** Read (and clear) the pending reason, if any. */
export const consumeSessionMessage = (): string | null => {
  try {
    const value = sessionStorage.getItem(MESSAGE_KEY);
    if (value) sessionStorage.removeItem(MESSAGE_KEY);
    return value;
  } catch {
    return null;
  }
};
