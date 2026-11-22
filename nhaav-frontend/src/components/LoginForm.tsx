import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLoginForm } from '../hooks/useLoginForm';
import { useTheme } from '../context/ThemeContext';
import { consumeSessionMessage } from '../services/sessionEvents';
import { AuthResponse } from '../services/auth';

export interface LoginFormProps {
  readonly onSuccess?: () => void;
}

export const LoginForm: React.FC<LoginFormProps> = ({ onSuccess }) => {
  const navigate = useNavigate();
  const { tokens: C, isDark } = useTheme();

  // Set when the app returns here because a Nhaav access session ended
  // (expired pass / 401 / logged out elsewhere). Read once and clear it.
  const [sessionNotice, setSessionNotice] = useState<string | null>(null);
  useEffect(() => {
    const message = consumeSessionMessage();
    if (message) setSessionNotice(message);
  }, []);
  const handleSuccess = (result?: AuthResponse) => {
    if (onSuccess) return onSuccess();
    // Renewal-only login: a gated account with no usable pass whose subscription
    // receives NO access pass, so protected dashboards would reject the user.
    // Send them to the renewal/payment flow instead.
    if (result?.access_blocked) {
      // Carry the backend's explanation through so the billing page can say why
      // the user is there (consistent with the dashboard card's blocked notice).
      navigate('/payments', { state: { accessBlocked: result.access_blocked } });
      return;
    }
    // The signed-in account, not a URL hint, decides where it lands. An
    // unverified account goes straight to the profile/verification state; the
    // onboarding guard then holds both it and an incomplete verified profile
    // on the right setup step instead of showing a dashboard prematurely.
    const role = result?.user?.role;
    if (!result?.user?.is_verified) {
      navigate('/profile');
      return;
    }
    navigate(
      role === 'provider'
        ? '/provider-dashboard'
        : role === 'supplier'
          ? '/supplier-dashboard'
          : '/ship-owner'
    );
  };

  const {
    email, setEmail,
    password, setPassword,
    showPassword, togglePassword,
    isLoading, errorMessage,
    deviceConflict,
    deviceNotice,
    confirmDeviceSwitch,
    cancelDeviceSwitch,
    handleSubmit,
  } = useLoginForm(handleSuccess);

  /* shared input style */
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

  return (
    <>
      <form
        onSubmit={handleSubmit}
        style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}
      >
        {/* session ended / informational notice */}
        {sessionNotice && (
          <div style={{
            borderRadius: 8,
            border: '1px solid var(--color-border)',
            background: 'var(--color-warning-tint)',
            padding: '0.75rem',
            textAlign: 'center',
            fontSize: '0.75rem',
            color: 'var(--color-warning-text)',
            lineHeight: 1.5,
          }}>
            {sessionNotice}
          </div>
        )}

        {/* error */}
        {errorMessage && (
          <div style={{
            borderRadius: 8,
            border: '1px solid var(--color-border)',
            background: 'var(--color-error-tint)',
            padding: '0.75rem',
            textAlign: 'center',
            fontSize: '0.75rem',
            color: 'var(--color-error-text)',
            lineHeight: 1.5,
          }}>
            {errorMessage}
          </div>
        )}

        {/* ── already signed in on another device: pick ONE device ── */}
        {deviceConflict && (
          <div style={{
            borderRadius: 12,
            border: `1px solid ${C.cyan}`,
            background: C.bgHigh,
            padding: '1rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="material-symbols-outlined" style={{ fontSize: '1.2rem', color: C.cyan }}>
                devices
              </span>
              <strong style={{ fontFamily: "'Manrope', sans-serif", fontSize: '0.9rem', color: C.title }}>
                Already signed in on another device
              </strong>
            </div>
            <p style={{ margin: 0, fontSize: '0.775rem', lineHeight: 1.55, color: C.muted }}>
              This account is signed in on{' '}
              <strong style={{ color: C.title }}>{deviceConflict.activeDeviceLabel}</strong>
              {deviceConflict.activeDeviceSince ? ` (since ${new Date(deviceConflict.activeDeviceSince).toLocaleString()})` : ''}.
              {' '}Nhaav allows one device at a time, so choose which device keeps the session.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <button
                type="button"
                onClick={confirmDeviceSwitch}
                disabled={isLoading}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  gap: 2,
                  padding: '0.7rem 0.85rem',
                  background: C.cyan,
                  color: 'var(--color-on-brand)',
                  fontFamily: "'Manrope', sans-serif",
                  fontSize: '0.85rem',
                  border: 'none',
                  borderRadius: 8,
                  textAlign: 'left',
                  cursor: isLoading ? 'not-allowed' : 'pointer',
                  opacity: isLoading ? 0.6 : 1,
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '1.05rem' }}>
                    smartphone
                  </span>
                  {isLoading ? 'Switching…' : 'Stay in this device'}
                </span>
                <span style={{ fontSize: '0.72rem', fontWeight: 500, opacity: 0.9 }}>
                  Signs {deviceConflict.activeDeviceLabel} out and uses {deviceConflict.currentDeviceLabel}.
                </span>
              </button>
              <button
                type="button"
                onClick={cancelDeviceSwitch}
                disabled={isLoading}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  gap: 2,
                  padding: '0.7rem 0.85rem',
                  background: 'transparent',
                  color: C.text,
                  fontFamily: "'Manrope', sans-serif",
                  fontSize: '0.85rem',
                  border: `1px solid ${C.borderMid}`,
                  borderRadius: 8,
                  textAlign: 'left',
                  cursor: isLoading ? 'not-allowed' : 'pointer',
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '1.05rem' }}>
                    swap_horiz
                  </span>
                  Switch to another device
                </span>
                <span style={{ fontSize: '0.72rem', fontWeight: 500, color: C.muted }}>
                  Keeps {deviceConflict.activeDeviceLabel} signed in — you will not be signed in here.
                </span>
              </button>
            </div>
          </div>
        )}

        {/* ── they chose to stay on the other device ── */}
        {!deviceConflict && deviceNotice && (
          <div style={{
            borderRadius: 8,
            border: `1px solid ${C.borderMid}`,
            background: C.bgHigh,
            padding: '0.75rem',
            textAlign: 'center',
            fontSize: '0.75rem',
            color: C.muted,
            lineHeight: 1.5,
          }}>
            {deviceNotice}
          </div>
        )}

        {/* ── email ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          <label htmlFor="email" style={{ fontSize: '0.65rem', fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase', color: C.muted, marginLeft: 2, fontFamily: "'Inter', sans-serif" }}>
            Corporate Email
          </label>
          <div style={{ position: 'relative' }}>
            <input
              id="email"
              type="email"
              placeholder="name@nhaav.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              style={inputStyle}
              onFocus={e => (e.currentTarget.style.borderBottomColor = C.cyan)}
              onBlur={e => (e.currentTarget.style.borderBottomColor = C.borderMid)}
            />
            <span className="material-symbols-outlined" style={{ position: 'absolute', right: 6, bottom: 10, fontSize: '1.1rem', color: C.dim, pointerEvents: 'none' }}>mail</span>
          </div>
        </div>

        {/* ── password ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingLeft: 2, paddingRight: 2 }}>
            <label htmlFor="password" style={{ fontSize: '0.65rem', fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase', color: C.muted, fontFamily: "'Inter', sans-serif" }}>
              Security Key
            </label>
            <Link to="/forgot-password" style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '-0.01em', textTransform: 'uppercase', color: C.muted, textDecoration: 'none' }}
              onMouseEnter={e => (e.currentTarget.style.color = C.title)}
              onMouseLeave={e => (e.currentTarget.style.color = C.muted)}
            >
              Forgot password?
            </Link>
          </div>
          <div style={{ position: 'relative' }}>
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              style={inputStyle}
              onFocus={e => (e.currentTarget.style.borderBottomColor = C.cyan)}
              onBlur={e => (e.currentTarget.style.borderBottomColor = C.borderMid)}
            />
            <button
              type="button"
              onClick={togglePassword}
              style={{ position: 'absolute', right: 6, bottom: 10, background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: C.dim }}
              onMouseEnter={e => (e.currentTarget.style.color = C.cyan)}
              onMouseLeave={e => (e.currentTarget.style.color = C.dim)}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '1.1rem' }}>
                {showPassword ? 'visibility_off' : 'visibility'}
              </span>
            </button>
          </div>
        </div>

        {/* ── submit ── */}
        <div style={{ paddingTop: '1rem' }}>
          <button
            type="submit"
            disabled={isLoading || deviceConflict !== null}
            style={{
              width: '100%',
              padding: '1rem 0',
              background: C.cyan,
              // Yale fill => solid Morning Dawn ink.
              color: '#FFF36D',
              fontFamily: "'Manrope', sans-serif",
              fontWeight: 700,
              fontSize: '1rem',
              border: 'none',
              borderRadius: 8,
              cursor: isLoading ? 'not-allowed' : 'pointer',
              opacity: isLoading ? 0.6 : 1,
              boxShadow: '0 8px 20px var(--color-brand-tint-strong)',
              transition: 'filter 0.2s, transform 0.1s',
            }}
            onMouseEnter={e => { if (!isLoading) e.currentTarget.style.filter = 'brightness(1.1)'; }}
            onMouseLeave={e => { e.currentTarget.style.filter = 'brightness(1)'; }}
            onMouseDown={e => { e.currentTarget.style.transform = 'scale(0.98)'; }}
            onMouseUp={e => { e.currentTarget.style.transform = 'scale(1)'; }}
          >
            {isLoading ? 'Signing In…' : 'Sign In'}
          </button>
        </div>
      </form>

      {/* register link */}
      <footer style={{ marginTop: '2rem', textAlign: 'center' }}>
        <p style={{ fontSize: '0.875rem', color: C.muted, margin: 0 }}>
          Don't have an account?
          <Link to={`/register${window.location.search}`} style={{ color: C.cyan, fontWeight: 600, marginLeft: 4, textDecoration: 'none' }}
            onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')}
            onMouseLeave={e => (e.currentTarget.style.textDecoration = 'none')}
          >
            Register
          </Link>
        </p>
      </footer>
    </>
  );
};
