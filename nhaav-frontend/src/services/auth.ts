import { apiClient } from './apiClient';
import { getDeviceId, getDeviceLabel } from './device';



// The session token is NOT kept in JS: the server sets httpOnly cookies on
// login. Only the (non-sensitive) cached user is stored, so the UI can restore
// its state before the first request completes.
const USER_KEY  = 'nhaav_user';

export interface User {
  id: string;
  name: string;
  full_name?: string;
  email: string;
  company?: string;
  role?: string;
  is_verified?: boolean;
}

export interface AccessSessionInfo {
  activated_at?: string | null;
  expires_at?: string | null;
  remaining_seconds?: number;
  /** True when a repeat login reused the account's existing pass. */
  reused?: boolean;
}

/**
 * Raised when the account is already signed in on ANOTHER device.
 *
 * The backend answers 409 with a `device_conflict` code plus the label of the
 * device holding the session. The caller must ask the human whether they want
 * to switch; confirming means retrying the login with `forceDeviceSwitch`.
 */
export class DeviceConflictError extends Error {
  readonly activeDeviceLabel: string;
  readonly activeDeviceSince: string | null;
  readonly currentDeviceLabel: string;

  constructor(detail: {
    active_device?: { label?: string; since?: string | null };
    requesting_device?: { label?: string };
    message?: string;
  }) {
    super(detail?.message || 'This account is already signed in on another device.');
    this.name = 'DeviceConflictError';
    this.activeDeviceLabel = detail?.active_device?.label || 'another device';
    this.activeDeviceSince = detail?.active_device?.since ?? null;
    this.currentDeviceLabel = detail?.requesting_device?.label || getDeviceLabel();
  }
}

export interface AuthResponse {
  access_token: string;
  user: User;
  /** Which device now owns the session, and what it took over from (if any). */
  device_session?: { label: string; switched_from: string | null } | null;
  /**
   * Present when the login holds a 6-hour access pass. `null`/absent means no
   * pass was issued (legacy/ungated organization, or a renewal-only login).
   */
  access_session?: AccessSessionInfo | null;
  /**
   * Set when a gated organization may not start a new session (pending /
   * expired / cancelled subscription). The login still succeeds so the user can
   * reach the renewal flow.
   */
  access_blocked?: string | null;
}

export const authService = {
  /* ── API calls ─────────────────────────────────────────────── */
  /**
   * Authenticate. `forceDeviceSwitch` is only set on the RETRY that follows the
   * user confirming the "switch devices?" prompt — see DeviceConflictError.
   */
  login: async (
    email: string,
    password: string,
    options: { forceDeviceSwitch?: boolean } = {}
  ): Promise<AuthResponse> => {
    // 1. Authenticate and get tokens. The device identity travels with the
    // login so the backend can bind (or challenge) this browser.
    let response;
    try {
      response = await apiClient.post(`/auth/login`, {
        email,
        password,
        device_id: getDeviceId(),
        device_label: getDeviceLabel(),
        force_device_switch: options.forceDeviceSwitch === true,
      });
    } catch (error: any) {
      const detail = error?.response?.data?.detail;
      if (error?.response?.status === 409 && detail?.code === 'device_conflict') {
        throw new DeviceConflictError(detail);
      }
      throw error;
    }
    const { access_token, access_session, access_blocked, device_session } = response.data;

    // 2. Nothing to persist: the login response set the httpOnly session
    // cookies, and the browser sends them on every subsequent request.
    
    // 3. Resolve the actual user profile. The login endpoint returns it, so a
    // renewal-only login (an organization whose subscription has expired, with
    // no access pass) never calls the access-gated /auth/me and get bounced.
    const user: User = response.data.user ?? (await authService.getCurrentUser());
    
    return {
      access_token,
      user,
      access_session: access_session ?? null,
      access_blocked: access_blocked ?? null,
      device_session: device_session ?? null,
    };
  },

  register: async (userData: { full_name?: string; name?: string; company?: string; email: string; password: string; designation?: string; role?: string }): Promise<AuthResponse> => {
    // 1. Register with canonical full_name. No company is invented here: the
    //    backend seeds the profile from what the person actually typed.
    const payload = {
      ...userData,
      full_name: userData.full_name || userData.name,
    };
    const response = await apiClient.post(`/auth/register`, payload);

    // /auth/register answers with the created account (UserResponse), not a
    // token. The session cookies are set by the sign-in below.
    if (response.data?.access_token) {
      const user = await authService.getCurrentUser();
      return { access_token: response.data.access_token, user };
    }

    // 2. Signing in straight away is a convenience: the account is already
    //    created, so a failed sign-in (a rate limit, a device challenge) must
    //    NOT be reported as a failed registration. Answer with an empty token
    //    and the registered account; the caller then skips the signed-in state.
    try {
      return await authService.login(userData.email, userData.password);
    } catch {
      const account = response.data ?? {};
      return {
        access_token: '',
        user: {
          id: String(account.id ?? ''),
          name: account.full_name || userData.full_name || userData.name || '',
          full_name: account.full_name ?? userData.full_name,
          email: account.email ?? userData.email,
          role: account.role,
          is_verified: account.is_verified,
        },
      };
    }
  },

  // Ends the Nhaav access session on the server: the organization's active
  // access token is marked CONSUMED (it can never be reused). Identity remains
  // the stateless JWT's job — this call is about the access-entitlement pool.
  // Best-effort/idempotent: the backend succeeds even when already logged out.
  logout: async (): Promise<void> => {
    try {
      await apiClient.post(`/auth/logout`);
    } catch {
      // Network down / session already ended — local logout proceeds regardless.
    }
  },

  /* ── email verification / password reset ──────────────────── */

  verifyEmail: async (token: string): Promise<{ message: string }> => {
    const response = await apiClient.post(`/auth/verify-email`, { token });
    return response.data;
  },

  resendVerification: async (email: string): Promise<{ message: string }> => {
    const response = await apiClient.post(`/auth/resend-verification`, { email });
    return response.data;
  },

  forgotPassword: async (email: string): Promise<{ message: string }> => {
    const response = await apiClient.post(`/auth/forgot-password`, { email });
    return response.data;
  },

  resetPassword: async (token: string, newPassword: string): Promise<{ message: string }> => {
    const response = await apiClient.post(`/auth/reset-password`, {
      token,
      new_password: newPassword,
    });
    return response.data;
  },

  /**
   * Code-based reset: the account's address receives a 6-digit code, which the
   * user types in together with the new password. The reply is deliberately the
   * same whether or not the address exists.
   */
  forgotPasswordCode: async (
    email: string
  ): Promise<{ message: string; code_ttl_minutes?: number }> => {
    const response = await apiClient.post(`/auth/forgot-password/code`, { email });
    return response.data;
  },

  resetPasswordWithCode: async (
    email: string,
    code: string,
    newPassword: string
  ): Promise<{ message: string }> => {
    const response = await apiClient.post(`/auth/reset-password/code`, {
      email,
      code,
      new_password: newPassword,
    });
    return response.data;
  },

  getCurrentUser: async (): Promise<User> => {
    const response = await apiClient.get(`/auth/me`);
    return response.data;
  },

  /* ── cached user (never a credential) ──────────────────────── */

  getStoredUser: (): User | null => {
    try {
      const raw = localStorage.getItem(USER_KEY);
      return raw ? (JSON.parse(raw) as User) : null;
    } catch {
      return null;
    }
  },

  setStoredUser: (user: User): void => {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  },

  removeStoredUser: (): void => {
    localStorage.removeItem(USER_KEY);
  },
};
