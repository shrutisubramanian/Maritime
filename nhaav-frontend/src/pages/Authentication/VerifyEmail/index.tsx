import React, { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { authService } from '../../../services/auth';
import { useTheme } from '../../../context/ThemeContext';
import { BrandLogo } from '../../../components/BrandLogo';

/**
 * Email verification landing page.
 *
 * Reachable two ways:
 *  - /verify-email?token=...   (canonical — links sent by the backend)
 *  - /login?verify_token=...   (legacy format; redirected here)
 */
export const VerifyEmail: React.FC = () => {
  const [searchParams] = useSearchParams();
  const { tokens: C } = useTheme();

  const [state, setState] = useState<'verifying' | 'success' | 'error' | 'missing'>(
    () => (searchParams.get('token') ? 'verifying' : 'missing')
  );
  const [detail, setDetail] = useState('');
  const calledRef = useRef(false);

  useEffect(() => {
    const token = searchParams.get('token');
    if (!token || calledRef.current) return;
    calledRef.current = true;

    authService
      .verifyEmail(token)
      .then(() => {
        setState('success');
        // The email's Continue button lands here; once verified we reload the
        // SPA straight into the user's profile so onboarding (details +
        // verification documents) can begin. A full reload (not an SPA
        // navigate) is deliberate: it re-boots the app with the verified
        // account state. Signed-out visitors are bounced to /login by
        // ProtectedRoute.
        window.setTimeout(() => window.location.replace('/profile'), 900);
      })
      .catch((err: any) => {
        setDetail(
          err?.response?.data?.detail ||
            'This verification link is invalid or has expired.'
        );
        setState('error');
      });
  }, [searchParams]);

  const card: React.CSSProperties = {
    position: 'relative',
    zIndex: 10,
    width: '100%',
    maxWidth: 480,
    background: C.glassCardBg,
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    borderRadius: '0.75rem',
    padding: 'clamp(2rem, 5vw, 3rem)',
    boxShadow: C.shadowGlow,
    border: `1px solid ${C.borderW}`,
    textAlign: 'center',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '1.25rem',
  };

  return (
    <div
      style={{
        fontFamily: "'Inter', sans-serif",
        color: C.text,
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
        backgroundColor: C.bg,
      }}
    >
      <div style={card}>
        <Link to="/" aria-label="Nhaav home" style={{ display: 'inline-flex', marginBottom: '1.25rem' }}>
          <BrandLogo height={22} />
        </Link>
        {state === 'verifying' && (
          <>
            <span className="material-symbols-outlined" style={{ fontSize: '3rem', color: C.cyan }}>
              progress_activity
            </span>
            <h1 style={{ fontFamily: "'Manrope', sans-serif", fontSize: '1.5rem', fontWeight: 800, margin: 0 }}>
              Verifying your email…
            </h1>
            <p style={{ color: C.muted, fontSize: '0.85rem', margin: 0 }}>This will only take a moment.</p>
          </>
        )}

        {state === 'success' && (
          <>
            <span className="material-symbols-outlined" style={{ fontSize: '3rem', color: '#34D399' }}>
              check_circle
            </span>
            <h1 style={{ fontFamily: "'Manrope', sans-serif", fontSize: '1.5rem', fontWeight: 800, margin: 0 }}>
              Email verified successfully
            </h1>
            <p style={{ color: C.muted, fontSize: '0.85rem', margin: 0, lineHeight: 1.6 }}>
              Your email is confirmed. Taking you to your profile so you can
              complete your details and verification…
            </p>
            <button
              onClick={() => window.location.replace('/profile')}
              style={{
                width: '100%',
                padding: '0.85rem',
                background: C.cyan,
                color: 'var(--color-on-brand)',
                fontFamily: "'Manrope', sans-serif",
                fontWeight: 700,
                fontSize: '0.95rem',
                border: 'none',
                borderRadius: 8,
                cursor: 'pointer',
              }}
            >
              Continue to profile
            </button>
          </>
        )}

        {state === 'error' && (
          <>
            <span className="material-symbols-outlined" style={{ fontSize: '3rem', color: '#ef4444' }}>
              error
            </span>
            <h1 style={{ fontFamily: "'Manrope', sans-serif", fontSize: '1.5rem', fontWeight: 800, margin: 0 }}>
              Verification failed
            </h1>
            <p style={{ color: C.muted, fontSize: '0.85rem', margin: 0, lineHeight: 1.6 }}>{detail}</p>
            <Link to="/resend-verification" style={{ color: C.cyan, fontWeight: 600, fontSize: '0.85rem', textDecoration: 'none' }}>
              Send a new verification link
            </Link>
            <Link to="/login" style={{ color: C.muted, fontSize: '0.8rem', textDecoration: 'none' }}>
              Back to Sign In
            </Link>
          </>
        )}

        {state === 'missing' && (
          <>
            <span className="material-symbols-outlined" style={{ fontSize: '3rem', color: C.dim }}>
              link_off
            </span>
            <h1 style={{ fontFamily: "'Manrope', sans-serif", fontSize: '1.5rem', fontWeight: 800, margin: 0 }}>
              Verification link required
            </h1>
            <p style={{ color: C.muted, fontSize: '0.85rem', margin: 0, lineHeight: 1.6 }}>
              Open the verification link from your email, or request a new one.
            </p>
            <Link to="/resend-verification" style={{ color: C.cyan, fontWeight: 600, fontSize: '0.85rem', textDecoration: 'none' }}>
              Resend verification email
            </Link>
          </>
        )}
      </div>
    </div>
  );
};

export default VerifyEmail;
