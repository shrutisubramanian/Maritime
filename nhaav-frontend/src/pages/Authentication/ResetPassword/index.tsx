import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { authService } from '../../../services/auth';
import { useTheme } from '../../../context/ThemeContext';
import { BrandLogo } from '../../../components/BrandLogo';
import { PasswordRequirements } from '../../../components/PasswordRequirements';
import { passwordPolicyError } from '../../../utils/passwordPolicy';

/**
 * Reset Password — consumes POST /auth/reset-password with the token from the
 * email link (?token=...). Reset tokens are single-use server-side; a reused
 * token yields a clean 400 which is surfaced to the user.
 */
export const ResetPassword: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { tokens: C } = useTheme();

  const token = searchParams.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [success, setSuccess] = useState(false);
  const missingToken = !token;
  const warnedRef = useRef(false);

  // Surface the missing-token case once on mount (not during render).
  useEffect(() => {
    if (missingToken && !warnedRef.current) {
      warnedRef.current = true;
      setErrorMessage(
        'This reset link is missing its security token. Please request a new reset email.'
      );
    }
  }, [missingToken]);

  const inputStyle: React.CSSProperties = {
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
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setErrorMessage('Passwords do not match.');
      return;
    }
    const passwordError = passwordPolicyError(password);
    if (passwordError) { setErrorMessage(passwordError); return; }
    setIsLoading(true);
    setErrorMessage('');
    try {
      await authService.resetPassword(token, password);
      setSuccess(true);
    } catch (err: any) {
      setErrorMessage(
        err?.response?.data?.detail ||
          'This reset link is invalid, expired, or has already been used.'
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
        {success ? (
          <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '1.25rem', alignItems: 'center' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '3rem', color: '#34D399' }}>check_circle</span>
            <h1 style={{ fontFamily: "'Manrope', sans-serif", fontSize: '1.5rem', fontWeight: 800, margin: 0 }}>
              Password updated
            </h1>
            <p style={{ color: C.muted, fontSize: '0.85rem', margin: 0, lineHeight: 1.6 }}>
              Your password has been changed. All previous reset links are now invalid.
            </p>
            <button
              onClick={() => navigate('/login')}
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
              Sign In
            </button>
          </div>
        ) : (
          <>
            <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '2.5rem', color: C.cyan }}>lock_reset</span>
              <h1 style={{ fontFamily: "'Manrope', sans-serif", fontSize: '1.5rem', fontWeight: 800, margin: '0.5rem 0 0.5rem' }}>
                Choose a new password
              </h1>
              <p style={{ color: C.muted, fontSize: '0.85rem', margin: 0, lineHeight: 1.6 }}>
                Pick a strong password you haven't used before.
              </p>
            </div>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              {errorMessage && (
                <div style={{ padding: '0.75rem', borderRadius: 8, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171', fontSize: '0.75rem', textAlign: 'center' }}>
                  {errorMessage}
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <label htmlFor="password" style={{ fontSize: '0.65rem', fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase', color: C.muted, marginLeft: 2, fontFamily: "'Inter', sans-serif" }}>
                  New Password
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={8}
                    style={inputStyle}
                    onFocus={(e) => (e.currentTarget.style.borderBottomColor = C.cyan)}
                    onBlur={(e) => (e.currentTarget.style.borderBottomColor = C.borderMid)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((p) => !p)}
                    style={{ position: 'absolute', right: 6, bottom: 10, background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: C.dim }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '1.1rem' }}>
                      {showPassword ? 'visibility_off' : 'visibility'}
                    </span>
                  </button>
                </div>
              </div>

              <PasswordRequirements password={password} />

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <label htmlFor="confirmPassword" style={{ fontSize: '0.65rem', fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase', color: C.muted, marginLeft: 2, fontFamily: "'Inter', sans-serif" }}>
                  Confirm Password
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    id="confirmPassword"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    style={inputStyle}
                    onFocus={(e) => (e.currentTarget.style.borderBottomColor = C.cyan)}
                    onBlur={(e) => (e.currentTarget.style.borderBottomColor = C.borderMid)}
                  />
                  <span className="material-symbols-outlined" style={{ position: 'absolute', right: 6, bottom: 10, fontSize: '1.1rem', color: C.dim, pointerEvents: 'none' }}>verified_user</span>
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading || missingToken}
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
                  cursor: isLoading || missingToken ? 'not-allowed' : 'pointer',
                  opacity: isLoading || missingToken ? 0.6 : 1,
                  boxShadow: '0 8px 20px rgba(76,157,176,0.2)',
                }}
              >
                {isLoading ? 'Updating…' : 'Update Password'}
              </button>
            </form>

            <div style={{ marginTop: '2rem', textAlign: 'center' }}>
              <Link to="/forgot-password" style={{ fontSize: '0.8rem', color: C.muted, textDecoration: 'none' }}>
                Request a new reset link
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default ResetPassword;
