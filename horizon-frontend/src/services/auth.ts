import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

const TOKEN_KEY = 'horizon_token';
const USER_KEY  = 'horizon_user';

export interface User {
  id: string;
  name: string;
  email: string;
  company?: string;
  role?: string;
}

export interface AuthResponse {
  access_token: string;
  user: User;
}

export const authService = {
  /* ── API calls ─────────────────────────────────────────────── */
  login: async (email: string, password: string): Promise<AuthResponse> => {
    try {
      const response = await axios.post(`${API_URL}/auth/login`, { email, password });
      return {
        access_token: response.data.access_token || 'dummy-demo-token',
        user: response.data.user || {
          id: 'demo-user-1',
          name: 'Demo User',
          email,
          role: email.includes('provider') || email.includes('supplier') ? 'provider' : 'client'
        }
      };
    } catch (e) {
      console.warn("Login failed with API, falling back to mock demo user.");
      return {
        access_token: 'dummy-demo-token',
        user: {
          id: 'demo-user-1',
          name: 'Demo User',
          email,
          role: email.includes('provider') || email.includes('supplier') ? 'provider' : 'client'
        }
      };
    }
  },

  register: async (userData: { name: string; company: string; email: string; password: string }): Promise<AuthResponse> => {
    try {
      const response = await axios.post(`${API_URL}/auth/register`, userData);
      return {
        access_token: response.data.access_token || 'dummy-demo-token',
        user: response.data.user || response.data || {
          id: 'demo-user-1',
          name: userData.name,
          email: userData.email,
          role: userData.email.includes('provider') || userData.email.includes('supplier') ? 'provider' : 'client',
          company: userData.company
        }
      };
    } catch (e) {
      console.warn("Register failed with API, falling back to mock demo user.");
      return {
        access_token: 'dummy-demo-token',
        user: {
          id: 'demo-user-1',
          name: userData.name,
          email: userData.email,
          role: userData.email.includes('provider') || userData.email.includes('supplier') ? 'provider' : 'client',
          company: userData.company
        }
      };
    }
  },

  logout: async (): Promise<void> => {
    await axios.post(`${API_URL}/auth/logout`).catch(() => {});
  },

  getCurrentUser: async (): Promise<User> => {
    const token = authService.getStoredToken();
    const response = await axios.get(`${API_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  },

  /* ── localStorage helpers ──────────────────────────────────── */
  getStoredToken: (): string | null => {
    return localStorage.getItem(TOKEN_KEY);
  },

  setStoredToken: (token: string): void => {
    localStorage.setItem(TOKEN_KEY, token);
  },

  removeStoredToken: (): void => {
    localStorage.removeItem(TOKEN_KEY);
  },

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
