import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { HeaderNav } from '../../components/HeaderNav';
import { FooterNav } from '../../components/FooterNav';
import { FormInputField } from '../../components/FormInputField';

const S = {
  inter:   "'Inter', sans-serif"   as const,
  manrope: "'Manrope', sans-serif" as const,
  bg:      '#0d141d',
  text:    '#dce3f0',
  muted:   '#c4c6ce',
  cyan:    '#4cd6ff',
  primary: '#9ccaff',
};

export const Register: React.FC = () => {
  const navigate = useNavigate();
  const { register } = useAuth();

  const [fullName,        setFullName]        = useState('');
  const [email,           setEmail]           = useState('');
  const [password,        setPassword]        = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [agreedToTerms,   setAgreedToTerms]   = useState(false);
  const [isLoading,       setIsLoading]       = useState(false);
  const [errorMessage,    setErrorMessage]    = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) { setErrorMessage('Passwords do not match.'); return; }
    if (!agreedToTerms) { setErrorMessage('Please agree to the Terms of Service and Data Protection Policy.'); return; }

    setIsLoading(true);
    setErrorMessage('');
    try {
      await register({ name: fullName, company: 'Maritime Agency', email, password });
      const role = new URLSearchParams(window.location.search).get('role');
      navigate(role === 'provider' ? '/provider-dashboard' : '/ship-owner');
    } catch (err: any) {
      setErrorMessage(err?.response?.data?.detail || err?.message || 'Registration failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{
      fontFamily: S.inter,
      color: S.text,
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'space-between',
      overflowX: 'hidden',
      backgroundColor: S.bg,
      backgroundImage: `
        radial-gradient(circle at 0% 0%, rgba(0,139,225,0.05) 0%, transparent 50%),
        radial-gradient(circle at 100% 100%, rgba(76,214,255,0.05) 0%, transparent 50%)
      `,
    }}>
      <HeaderNav />

      <main style={{ flexGrow: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', padding: '6rem 1rem 3rem', position: 'relative', overflow: 'hidden' }}>

        {/* ambient glows */}
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          <div style={{ position: 'absolute', top: '20%', left: '10%', width: 400, height: 400, background: 'rgba(156,202,255,0.05)', borderRadius: '50%', filter: 'blur(120px)' }} />
          <div style={{ position: 'absolute', bottom: '20%', right: '10%', width: 500, height: 500, background: 'rgba(76,214,255,0.05)', borderRadius: '50%', filter: 'blur(120px)' }} />
        </div>

        {/* glass card */}
        <div style={{
          position: 'relative', zIndex: 10,
          width: '100%', maxWidth: 560,
          background: 'rgba(46,53,63,0.4)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderRadius: '0.75rem',
          padding: 'clamp(2rem, 5vw, 3rem)',
          boxShadow: '0 20px 40px rgba(0,209,255,0.08)',
        }}>
          {/* heading */}
          <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
            <span style={{ fontFamily: S.inter, fontSize: '0.6rem', color: S.muted, letterSpacing: '0.2em', textTransform: 'uppercase', display: 'block', marginBottom: '0.5rem' }}>
              Registration Phase II
            </span>
            <h1 style={{ fontFamily: S.manrope, fontSize: 'clamp(1.8rem, 4vw, 2.25rem)', fontWeight: 800, color: S.text, letterSpacing: '-0.03em', margin: '0 0 0.75rem' }}>
              Complete Your Profile
            </h1>
            <p style={{ fontFamily: S.inter, fontSize: '0.85rem', color: S.muted, fontWeight: 300, lineHeight: 1.7, maxWidth: 340, margin: '0 auto' }}>
              Set up your credentials to access the Horizon maritime network and digital infrastructure.
            </p>
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            {errorMessage && (
              <div style={{ padding: '0.75rem', borderRadius: 8, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171', fontSize: '0.75rem', textAlign: 'center' }}>
                {errorMessage}
              </div>
            )}

            <FormInputField id="fullName"        label="Full Name"         type="text"     placeholder="Enter your legal name" value={fullName}        onChange={e => setFullName(e.target.value)}        icon="person" />
            <FormInputField id="email"           label="Corporate Email"   type="email"    placeholder="name@company.com"      value={email}           onChange={e => setEmail(e.target.value)}           icon="alternate_email" />

            {/* password row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '2rem' }}>
              <FormInputField id="password"        label="Create Password"   type="password" placeholder="••••••••"              value={password}        onChange={e => setPassword(e.target.value)}        icon="lock" />
              <FormInputField id="confirmPassword" label="Confirm Password"  type="password" placeholder="••••••••"              value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} icon="verified_user" />
            </div>

            {/* terms */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', paddingTop: '0.5rem' }}>
              <input
                id="terms"
                type="checkbox"
                checked={agreedToTerms}
                onChange={e => setAgreedToTerms(e.target.checked)}
                style={{ marginTop: 2, width: 16, height: 16, accentColor: S.cyan, cursor: 'pointer', flexShrink: 0 }}
              />
              <label htmlFor="terms" style={{ fontFamily: S.inter, fontSize: '0.75rem', color: S.muted, lineHeight: 1.6, cursor: 'pointer' }}>
                I agree to the{' '}
                <a href="#" style={{ color: S.cyan, textDecoration: 'none' }} onMouseEnter={e => (e.currentTarget.style.textDecoration='underline')} onMouseLeave={e => (e.currentTarget.style.textDecoration='none')}>Terms of Service</a>
                {' '}and{' '}
                <a href="#" style={{ color: S.cyan, textDecoration: 'none' }} onMouseEnter={e => (e.currentTarget.style.textDecoration='underline')} onMouseLeave={e => (e.currentTarget.style.textDecoration='none')}>Data Protection Policy</a>
                {' '}for maritime infrastructure operations.
              </label>
            </div>

            {/* submit */}
            <button
              type="submit"
              disabled={isLoading}
              style={{
                width: '100%',
                padding: '1rem',
                background: 'linear-gradient(to right, #9ccaff, #4cd6ff)',
                color: '#001d35',
                fontFamily: S.manrope,
                fontWeight: 700,
                fontSize: '1rem',
                border: 'none',
                borderRadius: 12,
                cursor: isLoading ? 'not-allowed' : 'pointer',
                opacity: isLoading ? 0.6 : 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                boxShadow: '0 8px 24px rgba(76,214,255,0.2)',
                transition: 'filter 0.2s, transform 0.1s',
              }}
              onMouseEnter={e => { if (!isLoading) e.currentTarget.style.filter = 'brightness(1.1)'; }}
              onMouseLeave={e => { e.currentTarget.style.filter = 'brightness(1)'; }}
              onMouseDown={e => { e.currentTarget.style.transform = 'scale(0.98)'; }}
              onMouseUp={e => { e.currentTarget.style.transform = 'scale(1)'; }}
            >
              <span>{isLoading ? 'Creating Account…' : 'Create Account'}</span>
              <span className="material-symbols-outlined" style={{ fontSize: '1.1rem' }}>arrow_forward</span>
            </button>
          </form>

          <div style={{ marginTop: '2rem', textAlign: 'center' }}>
            <p style={{ fontFamily: S.inter, fontSize: '0.75rem', color: S.muted, margin: 0 }}>
              Already registered?{' '}
              <Link to={`/login${window.location.search}`} style={{ color: S.primary, fontWeight: 600, textDecoration: 'none' }}
                onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')}
                onMouseLeave={e => (e.currentTarget.style.textDecoration = 'none')}
              >Sign In</Link>
            </p>
          </div>
        </div>

        {/* atmospheric ship image */}
        <div style={{ position: 'absolute', bottom: 0, right: 0, width: '33%', height: '50%', opacity: 0.2, zIndex: 0, pointerEvents: 'none' }}>
          <img
            alt="Maritime vessel"
            src="https://lh3.googleusercontent.com/aida-public/AB6AXuAj5kcukXOtpfvr7mjCj4M0NqwjIA8vdU3KYyeK_DF7Gm_6-uGatIDezR3y-GO5XJLMd7FuzwSmA9wBavMxxR91fl7W-UGTT7rv1jJGio0vqiIGMgyAIgIgphzmFdXJVTBrxzdbl6OJ3VBMQ_h0NYPbmJtMvQBHqkSNuQHoYF0-ag4oh4XeFmoC-1JRNFl4WYJ9sdgfKhVUl9-R13vJA-IqtlfYGkGuyDeFtlJoxnA7CHID1f6WYzK4iMjbqS1qSXDfVGDxXFf1AsIM"
            style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'grayscale(100%)', mixBlendMode: 'screen' }}
          />
        </div>
      </main>

      <FooterNav />
    </div>
  );
};

export default Register;
