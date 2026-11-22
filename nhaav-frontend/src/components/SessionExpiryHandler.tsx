import React, { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

import { useAuth } from '../hooks/useAuth';
import {
  SESSION_EXPIRED_DEFAULT_MESSAGE,
  SESSION_EXPIRED_EVENT,
  setSessionMessage,
} from '../services/sessionEvents';

/**
 * Reacts to a Nhaav access-session ending.
 *
 * Mounted inside the router tree (via ProtectedRoute) so it can clear the
 * local auth state and return the user to /login with an explanation. It
 * listens for SESSION_EXPIRED_EVENT, which is raised by the API 401
 * interceptor and by the access-session watcher once the BACKEND confirms the
 * pass is gone — the frontend never decides that on its own.
 */
export const SessionExpiryHandler: React.FC = () => {
  const navigate = useNavigate();
  const { isAuthenticated, logout } = useAuth();
  const handlingRef = useRef(false);

  useEffect(() => {
    const handleExpired = (event: Event) => {
      // One reaction per expiry; a stray second signal (e.g. a 401 from the
      // best-effort logout call) must not re-trigger navigation.
      if (handlingRef.current) return;
      handlingRef.current = true;

      const detail = (event as CustomEvent<{ message?: string }>).detail;
      const message = detail?.message || SESSION_EXPIRED_DEFAULT_MESSAGE;

      setSessionMessage(message);
      logout();
      navigate('/login', { replace: true });
    };

    window.addEventListener(SESSION_EXPIRED_EVENT, handleExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, handleExpired);
  }, [logout, navigate]);

  // A fresh authenticated session should be able to react again.
  useEffect(() => {
    if (isAuthenticated) handlingRef.current = false;
  }, [isAuthenticated]);

  return null;
};

export default SessionExpiryHandler;
