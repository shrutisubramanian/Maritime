import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLoginForm } from '../hooks/useLoginForm';

export interface LoginFormProps {
  readonly onSuccess?: () => void;
}

const C = {
  bgInput:    '#080f18',
  border:     'rgba(68,71,77,0.6)',
  borderFocus:'#4cd6ff',
  textMain:   '#dce3f0',
  textMuted:  '#c4c6ce',
  textDim:    '#8e9098',
  cyan:       '#4cd6ff',
  inter:      "'Inter', sans-serif" as const,
  manrope:    "'Manrope', sans-serif" as const,
};

export const LoginForm: React.FC<LoginFormProps> = ({ onSuccess }) => {
  const navigate = useNavigate();
  const handleSuccess = () => {
    if (onSuccess) return onSuccess();
    const role = new URLSearchParams(window.location.search).get('role');
    navigate(role === 'provider' ? '/provider-dashboard' : '/ship-owner');
  };

  const {
    email, setEmail,
    password, setPassword,
    showPassword, togglePassword,
    isLoading, errorMessage,
    handleSubmit,
  } = useLoginForm(handleSuccess);

  /* shared input style */
  const inputStyle: React.CSSProperties = {
    width: '100%',
    background: C.bgInput,
    border: 'none',
    borderBottom: `2px solid ${C.border}`,
    padding: '0.75rem 2rem 0.75rem 0.25rem',
    fontSize: '0.9rem',
    color: C.textMain,
    outline: 'none',
    fontFamily: C.inter,
    transition: 'border-color 0.2s',
    boxSizing: 'border-box',
  };

  return (
    <>
      <form
        onSubmit={handleSubmit}
        style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}
      >
        {/* error */}
        {errorMessage && (
          <div style={{
            borderRadius: 8,
            border: '1px solid rgba(239,68,68,0.3)',
            background: 'rgba(239,68,68,0.1)',
            padding: '0.75rem',
            textAlign: 'center',
            fontSize: '0.75rem',
            color: '#f87171',
          }}>
            {errorMessage}
          </div>
        )}

        {/* ── email ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          <label htmlFor="email" style={{ fontSize: '0.65rem', fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(196,198,206,0.8)', marginLeft: 2, fontFamily: C.inter }}>
            Corporate Email
          </label>
          <div style={{ position: 'relative' }}>
            <input
              id="email"
              type="email"
              placeholder="name@horizon.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              style={inputStyle}
              onFocus={e => (e.currentTarget.style.borderBottomColor = C.borderFocus)}
              onBlur={e => (e.currentTarget.style.borderBottomColor = C.border)}
            />
            <span className="material-symbols-outlined" style={{ position: 'absolute', right: 6, bottom: 10, fontSize: '1.1rem', color: 'rgba(142,144,152,0.35)', pointerEvents: 'none' }}>mail</span>
          </div>
        </div>

        {/* ── password ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingLeft: 2, paddingRight: 2 }}>
            <label htmlFor="password" style={{ fontSize: '0.65rem', fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(196,198,206,0.8)', fontFamily: C.inter }}>
              Security Key
            </label>
            <a href="#" style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '-0.01em', textTransform: 'uppercase', color: C.textDim, textDecoration: 'none' }}
              onMouseEnter={e => (e.currentTarget.style.color = '#fff')}
              onMouseLeave={e => (e.currentTarget.style.color = C.textDim)}
            >
              Forgot password?
            </a>
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
              onFocus={e => (e.currentTarget.style.borderBottomColor = C.borderFocus)}
              onBlur={e => (e.currentTarget.style.borderBottomColor = C.border)}
            />
            <button
              type="button"
              onClick={togglePassword}
              style={{ position: 'absolute', right: 6, bottom: 10, background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'rgba(142,144,152,0.35)' }}
              onMouseEnter={e => (e.currentTarget.style.color = C.cyan)}
              onMouseLeave={e => (e.currentTarget.style.color = 'rgba(142,144,152,0.35)')}
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
            disabled={isLoading}
            style={{
              width: '100%',
              padding: '1rem 0',
              background: C.cyan,
              color: '#003543',
              fontFamily: C.manrope,
              fontWeight: 700,
              fontSize: '1rem',
              border: 'none',
              borderRadius: 8,
              cursor: isLoading ? 'not-allowed' : 'pointer',
              opacity: isLoading ? 0.6 : 1,
              boxShadow: '0 8px 20px rgba(76,214,255,0.2)',
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
        <p style={{ fontSize: '0.875rem', color: C.textMuted, margin: 0 }}>
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
