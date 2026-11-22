import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { adminAuthService } from '../../services/adminAuth';
import { BrandLogo } from '../../components/BrandLogo';

const M = "'Manrope', sans-serif";
const I = "'Inter', sans-serif";

export const AdminLogin: React.FC = () => {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMessage('');
    try {
      await adminAuthService.login(username, password);
      navigate('/admin');
    } catch (err: any) {
      setErrorMessage(
        err?.response?.data?.detail || err?.message || 'Invalid admin credentials.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    background: 'transparent',
    border: 'none',
    borderBottom: '2px solid rgba(13,59,102,0.25)',
    padding: '0.75rem 2rem 0.75rem 0.25rem',
    fontSize: '0.9rem',
    color: '#0D3B66',
    outline: 'none',
    fontFamily: I,
    transition: 'border-color 0.2s',
    boxSizing: 'border-box' as const,
  };

  return (
    <div
      style={{
        fontFamily: I,
        color: '#0D3B66',
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#FFF36D',
        backgroundImage:
          'radial-gradient(circle at 0% 0%, rgba(13,59,102,0.08) 0%, transparent 50%), radial-gradient(circle at 100% 100%, rgba(76,157,176,0.12) 0%, transparent 50%)',
        padding: '2rem 1rem',
      }}
    >
      {/* Glass card */}
      <div
        style={{
          width: '100%',
          maxWidth: 440,
          background: 'rgba(255,252,242,0.92)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          borderRadius: 16,
          padding: 'clamp(2rem, 5vw, 3rem)',
          boxShadow: '0 24px 64px rgba(13,59,102,0.16)',
          border: '1px solid rgba(13,59,102,0.16)',
        }}
      >
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
          <Link to="/" aria-label="Nhaav home" style={{ display: 'inline-flex', marginBottom: '1.25rem' }}>
            <BrandLogo height={22} />
          </Link>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 12,
              background: 'linear-gradient(135deg, var(--color-brand), var(--color-brand-grad-end))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 1rem',
              boxShadow: '0 4px 16px rgba(13,59,102,0.28)',
            }}
          >
            <span
              className="material-symbols-outlined"
              style={{ color: 'var(--color-on-brand)', fontSize: '1.5rem', fontVariationSettings: "'FILL' 1" }}
            >
              shield_person
            </span>
          </div>
          <span
            style={{
              fontFamily: I,
              fontSize: '0.6rem',
              fontWeight: 700,
              color: '#0D3B66',
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              display: 'block',
              marginBottom: '0.5rem',
            }}
          >
            Administrative Terminal
          </span>
          <h1
            style={{
              fontFamily: M,
              fontSize: '1.8rem',
              fontWeight: 800,
              color: '#0D3B66',
              letterSpacing: '-0.03em',
              margin: '0 0 0.5rem',
            }}
          >
            Admin Login
          </h1>
          <p
            style={{
              fontFamily: I,
              fontSize: '0.85rem',
              color: '#2E5C8A',
              fontWeight: 300,
              lineHeight: 1.6,
              maxWidth: 300,
              margin: '0 auto',
            }}
          >
            Secure access to the Nhaav back-office platform.
          </p>
        </div>

        {/* Error */}
        {errorMessage && (
          <div
            style={{
              padding: '0.75rem',
              borderRadius: 8,
              background: 'rgba(220,38,38,0.10)',
              border: '1px solid rgba(220,38,38,0.28)',
              color: '#B91C1C',
              fontSize: '0.75rem',
              textAlign: 'center',
              marginBottom: '1.5rem',
            }}
          >
            {errorMessage}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Username */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <label
              htmlFor="admin-username"
              style={{
                fontSize: '0.65rem',
                fontWeight: 600,
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                color: '#2E5C8A',
                fontFamily: I,
              }}
            >
              Admin Username
            </label>
            <div style={{ position: 'relative' }}>
              <input
                id="admin-username"
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                required
                style={inputStyle}
                onFocus={e => (e.currentTarget.style.borderBottomColor = '#0D3B66')}
                onBlur={e => (e.currentTarget.style.borderBottomColor = 'rgba(13,59,102,0.25)')}
              />
              <span
                className="material-symbols-outlined"
                style={{
                  position: 'absolute',
                  right: 6,
                  bottom: 10,
                  fontSize: '1.1rem',
                  color: 'rgba(13,59,102,0.35)',
                  pointerEvents: 'none',
                }}
              >
                badge
              </span>
            </div>
          </div>

          {/* Password */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <label
              htmlFor="admin-password"
              style={{
                fontSize: '0.65rem',
                fontWeight: 600,
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                color: '#2E5C8A',
                fontFamily: I,
              }}
            >
              Password
            </label>
            <div style={{ position: 'relative' }}>
              <input
                id="admin-password"
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                style={inputStyle}
                onFocus={e => (e.currentTarget.style.borderBottomColor = '#0D3B66')}
                onBlur={e => (e.currentTarget.style.borderBottomColor = 'rgba(13,59,102,0.25)')}
              />
              <button
                type="button"
                onClick={() => setShowPassword(prev => !prev)}
                style={{
                  position: 'absolute',
                  right: 6,
                  bottom: 10,
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 0,
                  color: 'rgba(13,59,102,0.45)',
                }}
                onMouseEnter={e => (e.currentTarget.style.color = '#0D3B66')}
                onMouseLeave={e => (e.currentTarget.style.color = 'rgba(13,59,102,0.45)')}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '1.1rem' }}>
                  {showPassword ? 'visibility_off' : 'visibility'}
                </span>
              </button>
            </div>
          </div>

          {/* Submit */}
          <div style={{ paddingTop: '0.5rem' }}>
            <button
              type="submit"
              disabled={isLoading}
              style={{
                width: '100%',
                padding: '1rem',
                background: 'linear-gradient(to right, var(--color-brand), var(--color-brand-grad-end))',
                color: 'var(--color-on-brand)',
                fontFamily: M,
                fontWeight: 700,
                fontSize: '1rem',
                border: 'none',
                borderRadius: 10,
                cursor: isLoading ? 'not-allowed' : 'pointer',
                opacity: isLoading ? 0.6 : 1,
                boxShadow: '0 8px 24px rgba(13,59,102,0.22)',
                transition: 'filter 0.2s, transform 0.1s',
              }}
              onMouseEnter={e => {
                if (!isLoading) e.currentTarget.style.filter = 'brightness(1.1)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.filter = 'brightness(1)';
              }}
              onMouseDown={e => (e.currentTarget.style.transform = 'scale(0.98)')}
              onMouseUp={e => (e.currentTarget.style.transform = 'scale(1)')}
            >
              {isLoading ? 'Authenticating…' : 'Access Admin Panel'}
            </button>
          </div>
        </form>

        {/* Footer */}
        <div style={{ marginTop: '2rem', textAlign: 'center' }}>
          <Link
            to="/login"
            style={{
              fontSize: '0.8rem',
              color: '#2E5C8A',
              textDecoration: 'none',
            }}
            onMouseEnter={e => (e.currentTarget.style.color = '#0D3B66')}
            onMouseLeave={e => (e.currentTarget.style.color = '#2E5C8A')}
          >
            ← Back to public login
          </Link>
        </div>
      </div>
    </div>
  );
};

export default AdminLogin;
