import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { authService } from '../../../services/auth';
import { useTheme } from '../../../context/ThemeContext';
import { BrandLogo } from '../../../components/BrandLogo';

/**
 * Resend Verification — requests a fresh verification email.
 *
 * Reached two ways:
 *  - /resend-verification                       (form entry point)
 *  - /resend-verification?registered=1&email=…  (right after registering;
 *    the registration email was already sent, so the "check your inbox"
 *    state shows immediately with the address pre-filled)
 *
 * The backend responds identically whether or not the address exists / is
 * already verified (anti-enumeration), so the UI shows the same confirmation.
 */
export const ResendVerification: React.FC = () => {
  const { tokens: C } = useTheme();
  const [searchParams] = useSearchParams();
  const cameFromRegistration = searchParams.get('registered') === '1';
  const [email, setEmail] = useState(searchParams.get('email') || '');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [sent, setSent] = useState(cameFromRegistration);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMessage('');
    try {
      await authService.resendVerification(email);
      setSent(true);
    } catch (err: any) {
      setErrorMessage(
        err?.response?.data?.detail || err?.message || 'Request failed. Please try again.'
      );
    } finally {
      setIsLoading(false);
    }
  };

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
        {sent ? (
          <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '1.25rem', alignItems: 'center' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '3rem', color: C.cyan }}>mark_email_read</span>
            <h1 style={{ fontFamily: "'Manrope', sans-serif", fontSize: '1.5rem', fontWeight: 800, margin: 0 }}>
              {cameFromRegistration ? 'One more step: verify your email' : 'Check your email'}
            </h1>
            <p style={{ color: C.muted, fontSize: '0.85rem', margin: 0, lineHeight: 1.6 }}>
              {cameFromRegistration
                ? 'Your account has been created. We sent a verification link to '
                : 'If an unverified account exists for '}
              {email ? (
                <strong style={{ color: C.text }}>{email}</strong>
              ) : (
                'your email address'
              )}
              {cameFromRegistration
                ? '. Click the link to activate your account — it expires in 24 hours.'
                : ', a new verification link has been sent. It expires in 24 hours.'}
            </p>
            {!cameFromRegistration && (
              <button
                onClick={() => setSent(false)}
                style={{
                  background: 'none',
                  border: `1px solid ${C.borderMid}`,
                  borderRadius: 8,
                  padding: '0.5rem 1.25rem',
                  color: C.text,
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Use a different email
              </button>
            )}
            <Link to="/login" style={{ color: C.cyan, fontWeight: 600, fontSize: '0.85rem', textDecoration: 'none' }}>
              Back to Sign In
            </Link>
          </div>
        ) : (
          <>
            <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '2.5rem', color: C.cyan }}>mark_email_unread</span>
              <h1 style={{ fontFamily: "'Manrope', sans-serif", fontSize: '1.5rem', fontWeight: 800, margin: '0.5rem 0 0.5rem' }}>
                Resend verification email
              </h1>
              <p style={{ color: C.muted, fontSize: '0.85rem', margin: 0, lineHeight: 1.6 }}>
                Didn't receive the verification link, or has yours expired? Enter your email and we'll send a fresh one.
              </p>
            </div>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              {errorMessage && (
                <div style={{ padding: '0.75rem', borderRadius: 8, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171', fontSize: '0.75rem', textAlign: 'center' }}>
                  {errorMessage}
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <label htmlFor="email" style={{ fontSize: '0.65rem', fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase', color: C.muted, marginLeft: 2, fontFamily: "'Inter', sans-serif" }}>
                  Corporate Email
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    id="email"
                    type="email"
                    placeholder="name@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    style={{
                      width: '100%',
                      background: C.bgInput,
                      border: 'none',
                      borderBottom: `2px solid ${C.borderMid}`,
                      padding: '0.75rem 2rem 0.75rem 0.25rem',
                      fontSize: '0.9rem',
                      color: C.text,
                      outline: 'none',
                      fontFamily: "'Inter', sans-serif",
                      transition: 'border-color 0.2s',
                      boxSizing: 'border-box',
                    }}
                    onFocus={(e) => (e.currentTarget.style.borderBottomColor = C.cyan)}
                    onBlur={(e) => (e.currentTarget.style.borderBottomColor = C.borderMid)}
                  />
                  <span className="material-symbols-outlined" style={{ position: 'absolute', right: 6, bottom: 10, fontSize: '1.1rem', color: C.dim, pointerEvents: 'none' }}>mail</span>
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                style={{
                  width: '100%',
                  padding: '1rem 0',
                  background: C.cyan,
                  color: 'var(--color-on-brand)',
                  fontFamily: "'Manrope', sans-serif",
                  fontWeight: 700,
                  fontSize: '1rem',
                  border: 'none',
                  borderRadius: 8,
                  cursor: isLoading ? 'not-allowed' : 'pointer',
                  opacity: isLoading ? 0.6 : 1,
                  boxShadow: '0 8px 20px rgba(76,157,176,0.2)',
                }}
              >
                {isLoading ? 'Sending…' : 'Resend Verification Email'}
              </button>
            </form>

            <div style={{ marginTop: '2rem', textAlign: 'center' }}>
              <Link to="/login" style={{ fontSize: '0.8rem', color: C.muted, textDecoration: 'none' }}>
                Back to Sign In
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default ResendVerification;
