import React, { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { onboardingService, OnboardingStatus } from '../services/onboarding';

/**
 * Onboarding guard.
 *
 * A fresh account is confined to its PROFILE, its VERIFICATION documents and
 * the SUBSCRIPTION/payment screens until an admin approves its verification
 * (the backend enforces the same rule on the marketplace, requests, quotation
 * and job APIs with a 403). Every commercial role — client, supplier and
 * service provider alike — must also have paid the platform fee and had it
 * verified. Everything else redirects to /profile.
 *
 * Admins are exempt — they operate the review surfaces.
 */
const ALLOWED_WHEN_LOCKED = ['/profile', '/company-profile', '/verification', '/payments'];

const isAllowed = (pathname: string): boolean =>
  ALLOWED_WHEN_LOCKED.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  );

export const OnboardingGate: React.FC = () => {
  const location = useLocation();
  const { isAuthenticated } = useAuth();
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      setChecked(true);
      return;
    }
    let active = true;
    // Re-check on navigation so unlocking (approval + payment) takes effect
    // without a manual reload.
    onboardingService
      .getStatus()
      .then((s) => {
        if (active) {
          setStatus(s);
          setChecked(true);
        }
      })
      .catch(() => {
        // Fail OPEN on a transient network error: never trap a legitimate user
        // on the profile page because a status call failed. The backend still
        // enforces the real rule on every gated API.
        if (active) setChecked(true);
      });
    return () => {
      active = false;
    };
  }, [isAuthenticated, location.pathname]);

  if (!checked) {
    return (
      <div
        style={{
          minHeight: '60vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'var(--bg-primary)',
          color: 'var(--accent-primary)',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
          <div
            style={{
              width: 40,
              height: 40,
              border: '3px solid var(--accent-primary)',
              borderTopColor: 'transparent',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
            }}
          />
          <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>Checking your account…</span>
        </div>
      </div>
    );
  }

  const locked = status ? !status.marketplace_unlocked : false;
  if (locked && !isAllowed(location.pathname)) {
    return <Navigate to={status?.locked_home || '/profile'} replace />;
  }

  return <Outlet />;
};
