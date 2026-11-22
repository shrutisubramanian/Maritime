import React, { createContext, useState, useEffect, ReactNode } from 'react';
import { User, AuthResponse, authService } from '../services/auth';

export interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (
    email: string,
    password: string,
    options?: { forceDeviceSwitch?: boolean },
  ) => Promise<AuthResponse>;
  register: (userData: { full_name?: string; name?: string; company?: string; email: string; password: string; designation?: string; role?: string }) => Promise<void>;
  logout: () => void;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Restore the cached user on mount so the UI does not flash the logged-out
  // state. The session itself lives in httpOnly cookies — there is no token to
  // read, and no credential is stored here. If the cookie has expired, the
  // first API call answers 401 and SessionExpiryHandler returns to /login.
  useEffect(() => {
    const storedUser = authService.getStoredUser();
    if (storedUser) {
      setUser(storedUser);
    }
    setIsLoading(false);
  }, []);

  const login = async (
    email: string,
    password: string,
    options: { forceDeviceSwitch?: boolean } = {},
  ): Promise<AuthResponse> => {
    setIsLoading(true);
    try {
      const res = await authService.login(email, password, options);
      setUser(res.user);
      authService.setStoredUser(res.user);
      return res;
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (userData: { full_name?: string; name?: string; company?: string; email: string; password: string; designation?: string; role?: string }) => {
    setIsLoading(true);
    try {
      const res = await authService.register(userData);
      // The account exists. Only treat this browser as signed in when the
      // convenience sign-in actually produced a session — a session-less
      // success would make the app look authenticated with no cookie.
      if (res.access_token) {
        setUser(res.user);
        authService.setStoredUser(res.user);
      } else {
        setUser(null);
        authService.removeStoredUser();
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Logout asks the server FIRST (it revokes every refresh token for the
  // account and clears the httpOnly cookies), then clears the cached identity.
  // Best-effort: a network failure must not trap the user in the app.
  const logout = () => {
    void authService.logout();
    authService.removeStoredUser();
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        login,
        register,
        logout
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
