import React, { useEffect, useState } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { adminAuthService } from '../services/adminAuth';

/**
 * Route guard for admin-only pages.
 *
 * A cached admin identity in localStorage is not proof of an admin session: it
 * can be stale or fabricated. Verify the httpOnly admin session with the server
 * before rendering any console page, and clear the cached identity if it is no
 * longer valid.
 */
export const AdminProtectedRoute: React.FC = () => {
  const [state, setState] = useState<'checking' | 'allowed' | 'denied'>('checking');

  useEffect(() => {
    let active = true;

    adminAuthService
      .getCurrentAdmin()
      .then((user) => {
        if (!active) return;
        adminAuthService.setStoredUser(user);
        setState('allowed');
      })
      .catch(() => {
        if (!active) return;
        adminAuthService.removeStoredUser();
        setState('denied');
      });

    return () => {
      active = false;
    };
  }, []);

  if (state === 'checking') {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--color-background)',
          color: 'var(--color-muted)',
          fontFamily: "'Inter', sans-serif",
          fontSize: '0.875rem',
        }}
      >
        Checking secure session…
      </div>
    );
  }

  if (state === 'denied') {
    return <Navigate to="/admin/login" replace />;
  }

  return <Outlet />;
};
