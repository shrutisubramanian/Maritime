import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { authService } from '../../../services/auth';
import { useTheme } from '../../../context/ThemeContext';
import { BrandLogo } from '../../../components/BrandLogo';
import { PasswordRequirements } from '../../../components/PasswordRequirements';
import { passwordPolicyError } from '../../../utils/passwordPolicy';

/**
 * Forgot Password — email → code → new password.
 *
 * Step 1 asks for the account's address and has the backend mail a randomly
 * generated 6-digit code. Step 2 takes that code plus the password the user
 * wants. The backend answers identically whether or not the address exists, so
 * nothing here reveals whether an account is registered.
 */
export const ForgotPassword: React.FC = () => {
  const { tokens: C } = useTheme();
  const navigate = useNavigate();

  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [notice, setNotice] = useState('');
  const [done, setDone] = useState(false);

  const handleRequestCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMessage('');
    setNotice('');
    try {
      const res = await authService.forgotPasswordCode(email.trim());
      setStep('code');
      setNotice(
        `If an account exists for ${email.trim()}, a 6-digit code is on its way. ` +
          `It expires in ${res?.code_ttl_minutes ?? 10} minutes.`
      );
    } catch (err: any) {
      setErrorMessage(
        err?.response?.data?.detail || err?.message || 'Request failed. Please try again.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendCode = async () => {
    setIsLoading(true);
    setErrorMessage('');
    try {
      const res = await authService.forgotPasswordCode(email.trim());
      setNotice(
        `A new code has been sent. It expires in ${res?.code_ttl_minutes ?? 10} minutes. ` +
          'Any earlier code no longer works.'
      );
    } catch (err: any) {
      setErrorMessage(
        err?.response?.data?.detail || err?.message || 'Could not send a new code.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    const passwordError = passwordPolicyError(newPassword);
    if (passwordError) { setErrorMessage(passwordError); return; }
    if (newPassword !== confirmPassword) {
      setErrorMessage('The two passwords do not match.');
      return;
    }
    setIsLoading(true);
    try {
      await authService.resetPasswordWithCode(email.trim(), code.trim(), newPassword);
      setDone(true);
      setTimeout(() => navigate('/login'), 4000);
    } catch (err: any) {
      setErrorMessage(
        err?.response?.data?.detail ||
          err?.message ||
          'That code could not be confirmed. Please try again.'
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

  const label: React.CSSProperties = {
    fontSize: '0.65rem',
    fontWeight: 600,
    letterSpacing: '0.18em',
    textTransform: 'uppercase',
    color: C.muted,
    marginLeft: 2,
    fontFamily: "'Inter', sans-serif",
  };

  const fieldWrap: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: '0.4rem' };

  const input: React.CSSProperties = {
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

  const icon: React.CSSProperties = {
    position: 'absolute',
    right: 6,
    bottom: 10,
    fontSize: '1.1rem',
    color: C.dim,
    pointerEvents: 'none',
  };

  const submitButton = (text: string, busyText: string) => (
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
      {isLoading ? busyText : text}
    </button>
  );

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
        {done ? (
          <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '1.25rem', alignItems: 'center' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '3rem', color: C.cyan }}>lock_reset</span>
            <h1 style={{ fontFamily: "'Manrope', sans-serif", fontSize: '1.5rem', fontWeight: 800, margin: 0 }}>
              Password changed
            </h1>
            <p style={{ color: C.muted, fontSize: '0.85rem', margin: 0, lineHeight: 1.6 }}>
              Your password has been updated and every previous session was signed out. You can
              sign in with the new password now.
            </p>
            <Link to="/login" style={{ color: C.cyan, fontWeight: 600, fontSize: '0.85rem', textDecoration: 'none' }}>
              Go to Sign In
            </Link>
          </div>
        ) : (
          <>
            <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '2.5rem', color: C.cyan }}>lock_reset</span>
              <h1 style={{ fontFamily: "'Manrope', sans-serif", fontSize: '1.5rem', fontWeight: 800, margin: '0.5rem 0 0.5rem' }}>
                Reset your password
              </h1>
              <p style={{ color: C.muted, fontSize: '0.85rem', margin: 0, lineHeight: 1.6 }}>
                {step === 'email'
                  ? "Enter the email on your Nhaav account and we'll send you a code."
                  : 'Enter the code from your email, then choose the password you want.'}
              </p>
            </div>

            {step === 'email' ? (
              <form onSubmit={handleRequestCode} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                {errorMessage && (
                  <div style={{ padding: '0.75rem', borderRadius: 8, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171', fontSize: '0.75rem', textAlign: 'center' }}>
                    {errorMessage}
                  </div>
                )}

                <div style={fieldWrap}>
                  <label htmlFor="email" style={label}>Corporate Email</label>
                  <div style={{ position: 'relative' }}>
                    <input
                      id="email"
                      type="email"
                      placeholder="name@company.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      autoComplete="email"
                      style={input}
                      onFocus={(e) => (e.currentTarget.style.borderBottomColor = C.cyan)}
                      onBlur={(e) => (e.currentTarget.style.borderBottomColor = C.borderMid)}
                    />
                    <span className="material-symbols-outlined" style={icon}>mail</span>
                  </div>
                </div>

                {submitButton('Send Code', 'Sending…')}
              </form>
            ) : (
              <form onSubmit={handleReset} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                {notice && (
                  <div style={{ padding: '0.75rem', borderRadius: 8, background: 'rgba(76,157,176,0.12)', border: '1px solid rgba(76,157,176,0.3)', color: C.text, fontSize: '0.75rem', lineHeight: 1.6 }}>
                    {notice}
                  </div>
                )}
                {errorMessage && (
                  <div style={{ padding: '0.75rem', borderRadius: 8, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171', fontSize: '0.75rem', textAlign: 'center' }}>
                    {errorMessage}
                  </div>
                )}

                <div style={fieldWrap}>
                  <label htmlFor="code" style={label}>6-Digit Code</label>
                  <div style={{ position: 'relative' }}>
                    <input
                      id="code"
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      placeholder="000000"
                      value={code}
                      onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
                      required
                      maxLength={6}
                      style={{ ...input, letterSpacing: '0.4em', fontFamily: "'Manrope', sans-serif", fontWeight: 700 }}
                      onFocus={(e) => (e.currentTarget.style.borderBottomColor = C.cyan)}
                      onBlur={(e) => (e.currentTarget.style.borderBottomColor = C.borderMid)}
                    />
                    <span className="material-symbols-outlined" style={icon}>pin</span>
                  </div>
                </div>

                <div style={fieldWrap}>
                  <label htmlFor="newPassword" style={label}>New Password</label>
                  <div style={{ position: 'relative' }}>
                    <input
                      id="newPassword"
                      type="password"
                      placeholder="At least 8 characters"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                      minLength={8}
                      autoComplete="new-password"
                      style={input}
                      onFocus={(e) => (e.currentTarget.style.borderBottomColor = C.cyan)}
                      onBlur={(e) => (e.currentTarget.style.borderBottomColor = C.borderMid)}
                    />
                    <span className="material-symbols-outlined" style={icon}>lock</span>
                  </div>
                </div>

                <PasswordRequirements password={newPassword} />

                <div style={fieldWrap}>
                  <label htmlFor="confirmPassword" style={label}>Confirm New Password</label>
                  <div style={{ position: 'relative' }}>
                    <input
                      id="confirmPassword"
                      type="password"
                      placeholder="Re-enter the new password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      minLength={8}
                      autoComplete="new-password"
                      style={input}
                      onFocus={(e) => (e.currentTarget.style.borderBottomColor = C.cyan)}
                      onBlur={(e) => (e.currentTarget.style.borderBottomColor = C.borderMid)}
                    />
                    <span className="material-symbols-outlined" style={icon}>lock_reset</span>
                  </div>
                </div>

                {submitButton('Reset Password', 'Resetting…')}

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => {
                      setStep('email');
                      setCode('');
                      setNotice('');
                      setErrorMessage('');
                    }}
                    style={{ background: 'none', border: 'none', color: C.muted, fontSize: '0.75rem', cursor: 'pointer', padding: 0 }}
                  >
                    Use a different email
                  </button>
                  <button
                    type="button"
                    onClick={handleResendCode}
                    disabled={isLoading}
                    style={{ background: 'none', border: 'none', color: C.cyan, fontSize: '0.75rem', fontWeight: 600, cursor: isLoading ? 'not-allowed' : 'pointer', padding: 0 }}
                  >
                    Resend code
                  </button>
                </div>
              </form>
            )}

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

export default ForgotPassword;
