import axios from 'axios';
import { API_BASE_URL, getCsrfHeaders } from './apiEnv';

const ADMIN_USER_KEY = 'nhaav_admin_user';

// Separate axios instance for admin calls. The session is an httpOnly cookie
// set by /admin/auth/login, so no token is stored in JS; the CSRF header is
// attached by the interceptor for state-changing requests.
export const adminClient = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
});

adminClient.interceptors.request.use((config) => {
  const method = (config.method || 'get').toUpperCase();
  for (const [key, value] of Object.entries(getCsrfHeaders(method))) {
    config.headers[key] = value;
  }
  return config;
});

export interface AdminUser {
  id: string;
  email: string;
  /** Sign-in name used by the console; null for accounts seeded without one. */
  username?: string | null;
  name: string;
}

export interface AdminAuthResponse {
  user: AdminUser;
}

export const adminAuthService = {
  /** Admin console sign-in: username + password (never an email address). */
  login: async (username: string, password: string): Promise<AdminAuthResponse> => {
    await adminClient.post(`/admin/auth/login`, { username, password });

    // Fetch the admin profile using the cookie the login just set.
    const user = await adminAuthService.getCurrentAdmin();
    adminAuthService.setStoredUser(user);

    return { user };
  },

  getCurrentAdmin: async (): Promise<AdminUser> => {
    const response = await adminClient.get(`/admin/auth/me`);
    return response.data;
  },

  getStoredUser: (): AdminUser | null => {
    try {
      const raw = localStorage.getItem(ADMIN_USER_KEY);
      return raw ? (JSON.parse(raw) as AdminUser) : null;
    } catch {
      return null;
    }
  },
  setStoredUser: (user: AdminUser): void => localStorage.setItem(ADMIN_USER_KEY, JSON.stringify(user)),
  removeStoredUser: (): void => localStorage.removeItem(ADMIN_USER_KEY),

  /** Revoke the server session, then drop the cached admin identity. */
  logout: async (): Promise<void> => {
    try {
      await adminClient.post(`/admin/auth/logout`);
    } catch {
      // Network down / already ended: local sign-out proceeds regardless.
    }
    adminAuthService.removeStoredUser();
  },

  isAuthenticated: (): boolean => !!adminAuthService.getStoredUser(),
};
