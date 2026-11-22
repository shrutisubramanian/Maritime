import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { HeaderNav } from '../../components/HeaderNav';
import { FooterNav } from '../../components/FooterNav';
import { FormInputField } from '../../components/FormInputField';
import { PasswordRequirements } from '../../components/PasswordRequirements';
import { formatAuthError } from '../../hooks/useLoginForm';
import { passwordPolicyError } from '../../utils/passwordPolicy';
import shipOcean from '../../assets/images/ship-ocean.jpg';
import { brand, derived } from '../../constants/colors';

type Role = 'client' | 'provider' | 'supplier';

/* ── Registration panel skin ────────────────────────────────────────
   Fixed brand spec for this page: Morning Dawn page ground, a Yale Blue
   registration panel, and every piece of text inside that panel in Lemon
   Morning Dawn. The values come from constants/colors.ts (the single source of
   truth for the palette) and are deliberately NOT theme-derived — which is
   why the route is wrapped in BrandThemeProvider. */
const CARD_BG     = brand.venice;                // #0D3B66 Yale Blue
const CARD_TEXT   = brand.merino;                // #FFF36D Morning Dawn
const CARD_LINE   = 'rgba(255, 243, 109, 0.30)'; // yellow hairline (field underlines)
const CARD_EDGE   = 'rgba(255, 243, 109, 0.18)'; // yellow panel border
const CARD_OPTION = derived.veniceHover;         // deeper Yale behind <option> lists
const CARD_CTA    = derived.veniceGradient;      // lifted Yale for the CTA fill
const CARD_GLOW   = '0 24px 60px rgba(13, 59, 102, 0.28)';

/** Account types selectable at registration. Values must match the `role`
 *  the backend accepts (UserRole: client | provider | supplier). */
const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: 'client',   label: 'Client' },
  { value: 'provider', label: 'Service Provider' },
  { value: 'supplier', label: 'Supplier' },
];

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
  const [designation,     setDesignation]     = useState('');
  const [otherDesignation,setOtherDesignation]= useState('');
  const [designationFocused, setDesignationFocused] = useState(false);
  const otherInputRef = React.useRef<HTMLInputElement>(null);
  const [role, setRole] = useState<Role>(() => {
    const fromUrl = new URLSearchParams(window.location.search).get('role');
    return fromUrl === 'provider' || fromUrl === 'supplier' ? fromUrl : 'client';
  });
  const [roleFocused, setRoleFocused] = useState(false);

  React.useEffect(() => {
    if (designation === 'other') {
      setTimeout(() => {
        otherInputRef.current?.focus();
      }, 50);
    }
  }, [designation]);

  const isClient = role === 'client';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Mirrors the API's own policy so the user gets immediate feedback rather
    // than waiting for the request to return the same rejection.
    const passwordError = passwordPolicyError(password);
    if (passwordError) { setErrorMessage(passwordError); return; }
    if (password !== confirmPassword) { setErrorMessage('Passwords do not match.'); return; }
    if (!agreedToTerms) { setErrorMessage('Please agree to the Terms of Service and Data Protection Policy.'); return; }

    let finalDesignation = designation;
    if (isClient) {
      if (!designation) {
        setErrorMessage('Please select your designation.');
        return;
      }
      if (designation === 'other') {
        if (!otherDesignation.trim()) {
          setErrorMessage('Please mention your designation.');
          return;
        }
        finalDesignation = otherDesignation.trim();
      }
    }

    setIsLoading(true);
    setErrorMessage('');
    try {
      await register({
        full_name: fullName,
        email,
        password,
        designation: isClient ? finalDesignation : undefined,
        role,
      });
      // Registration succeeds but the account is UNVERIFIED until the user
      // clicks the emailed link. Send them to the resend/verify flow instead
      // of straight into the app.
      navigate(
        `/resend-verification?registered=1&email=${encodeURIComponent(email)}`
      );
    } catch (err: any) {
      setErrorMessage(formatAuthError(err, 'Registration failed. Please try again.'));
    } finally {
      setIsLoading(false);
    }
  };

  // Inside the Yale Blue panel every ink is Morning Dawn; the only variation
  // is the underline hairline, which is yellow at low alpha.
  const labelColor = CARD_TEXT;
  const selectBg = CARD_OPTION;
  const selectColor = CARD_TEXT;
  const selectTextColor = CARD_TEXT;
  const border = CARD_LINE;

  return (
    <div style={{
      fontFamily: "'Inter', sans-serif",
      color: derived.ink,
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'space-between',
      overflowX: 'hidden',
      // Morning Dawn ground, fixed: this page does not follow the app theme.
      backgroundColor: brand.merino,
      backgroundImage:
        `radial-gradient(circle at 0% 0%, rgba(13,59,102,0.05) 0%, transparent 50%),
         radial-gradient(circle at 100% 100%, rgba(76,157,176,0.08) 0%, transparent 50%)`,
    }}>
      <HeaderNav />

      <main style={{ flexGrow: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', padding: '6rem 1rem 3rem', position: 'relative', overflow: 'hidden' }}>

        {/* ambient glows */}
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          <div style={{ position: 'absolute', top: '20%', left: '10%', width: 400, height: 400, background: 'rgba(13,59,102,0.05)', borderRadius: '50%', filter: 'blur(120px)' }} />
          <div style={{ position: 'absolute', bottom: '20%', right: '10%', width: 500, height: 500, background: 'rgba(76,157,176,0.09)', borderRadius: '50%', filter: 'blur(120px)' }} />
        </div>

        {/* Yale Blue panel — every piece of copy inside it is Morning Dawn */}
        <div style={{
          position: 'relative', zIndex: 10,
          width: '100%', maxWidth: 560,
          background: CARD_BG,
          borderRadius: '0.75rem',
          padding: 'clamp(2rem, 5vw, 3rem)',
          boxShadow: CARD_GLOW,
          border: `1px solid ${CARD_EDGE}`,
        }}>
          {/* heading */}
          <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
            <span style={{ fontFamily: "'Inter', sans-serif", fontSize: '0.6rem', color: CARD_TEXT, letterSpacing: '0.2em', textTransform: 'uppercase', display: 'block', marginBottom: '0.5rem' }}>
              {isClient
                ? 'Client Registration'
                : role === 'supplier'
                  ? 'Supplier Registration'
                  : 'Service Provider Registration'}
            </span>
            <h1 style={{ fontFamily: "'Manrope', sans-serif", fontSize: 'clamp(1.8rem, 4vw, 2.25rem)', fontWeight: 800, color: CARD_TEXT, letterSpacing: '-0.03em', margin: '0 0 0.75rem' }}>
              Complete Your Profile
            </h1>
            <p style={{ fontFamily: "'Inter', sans-serif", fontSize: '0.85rem', color: CARD_TEXT, fontWeight: 300, lineHeight: 1.7, maxWidth: 340, margin: '0 auto' }}>
              Set up your credentials to access the Nhaav maritime network and digital infrastructure.
            </p>
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            {errorMessage && (
              <div style={{ padding: '0.75rem', borderRadius: 8, background: 'rgba(220,38,38,0.22)', border: '1px solid rgba(255, 243, 109,0.35)', color: CARD_TEXT, fontSize: '0.75rem', fontWeight: 600, textAlign: 'center' }}>
                {errorMessage}
              </div>
            )}

            <FormInputField id="fullName"        label="Full Name"         type="text"     placeholder="Enter your legal name" value={fullName}        onChange={e => setFullName(e.target.value)}        icon="person"          variant="onBrand" />
            <FormInputField id="email"           label="Corporate Email"   type="email"    placeholder="name@company.com"      value={email}           onChange={e => setEmail(e.target.value)}           icon="alternate_email" variant="onBrand" />

            {/* Role — account type. Sent to the backend as `role` and decides
                which extra fields are collected below. */}
            <div>
              <label htmlFor="role" style={{ display: 'block', fontFamily: "'Inter', sans-serif", fontSize: '0.65rem', fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase', color: labelColor, marginBottom: '0.5rem' }}>
                Role
              </label>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <span
                  className="material-symbols-outlined"
                  style={{
                    fontSize: '1.25rem',
                    marginRight: '0.75rem',
                    color: CARD_TEXT,
                    fontVariationSettings: roleFocused ? "'FILL' 1" : "'FILL' 0",
                    transition: 'color 0.2s',
                    flexShrink: 0,
                  }}
                >work</span>
                <select
                  id="role"
                  value={role}
                  onChange={e => setRole(e.target.value as Role)}
                  onFocus={() => setRoleFocused(true)}
                  onBlur={() => setRoleFocused(false)}
                  required
                  style={{
                    width: '100%',
                    background: selectBg,
                    border: 'none',
                    borderBottom: `2px solid ${roleFocused ? CARD_TEXT : border}`,
                    padding: '0.6rem 0.5rem 0.6rem 0',
                    fontFamily: "'Inter', sans-serif",
                    fontSize: '0.9rem',
                    fontWeight: 500,
                    color: CARD_TEXT,
                    outline: 'none',
                    cursor: 'pointer',
                    transition: 'border-color 0.3s',
                  }}
                >
                  {ROLE_OPTIONS.map(o => (
                    <option key={o.value} value={o.value} style={{ background: selectBg, color: selectTextColor }}>{o.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Designation field for Client section */}
            {isClient && (
              <>
                <div>
                  <label htmlFor="designation" style={{ display: 'block', fontFamily: "'Inter', sans-serif", fontSize: '0.65rem', fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase', color: labelColor, marginBottom: '0.5rem' }}>
                    Designation
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <span
                      className="material-symbols-outlined"
                      style={{
                        fontSize: '1.25rem',
                        marginRight: '0.75rem',
                        color: CARD_TEXT,
                        fontVariationSettings: designationFocused ? "'FILL' 1" : "'FILL' 0",
                        transition: 'color 0.2s',
                        flexShrink: 0,
                      }}
                    >badge</span>
                    <select
                      id="designation"
                      value={designation}
                      onChange={e => setDesignation(e.target.value)}
                      onFocus={() => setDesignationFocused(true)}
                      onBlur={() => setDesignationFocused(false)}
                      required
                      style={{
                        width: '100%',
                        background: selectBg,
                        border: 'none',
                        borderBottom: `2px solid ${designationFocused ? CARD_TEXT : border}`,
                        padding: '0.6rem 0.5rem 0.6rem 0',
                        fontFamily: "'Inter', sans-serif",
                        fontSize: '0.9rem',
                        fontWeight: 500,
                        color: designation ? CARD_TEXT : selectColor,
                        outline: 'none',
                        cursor: 'pointer',
                        transition: 'border-color 0.3s',
                      }}
                    >
                      <option value="" disabled style={{ background: selectBg, color: selectColor }}>Select Designation</option>
                      <option value="Ship Owner" style={{ background: selectBg, color: selectTextColor }}>Ship Owner</option>
                      <option value="Ship Manager" style={{ background: selectBg, color: selectTextColor }}>Ship Manager</option>
                      <option value="Ship Operator" style={{ background: selectBg, color: selectTextColor }}>Ship Operator</option>
                      <option value="other" style={{ background: selectBg, color: selectTextColor }}>Other (Mention)</option>
                    </select>
                  </div>
                </div>

                {designation === 'other' && (
                  <FormInputField
                    id="otherDesignation"
                    label="Mention Designation"
                    type="text"
                    placeholder="Click here and type your specific designation..."
                    value={otherDesignation}
                    onChange={e => setOtherDesignation(e.target.value)}
                    icon="edit_note"
                    autoFocus={true}
                    inputRef={otherInputRef}
                    variant="onBrand"
                  />
                )}
              </>
            )}

            {/* password row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '2rem' }}>
              <FormInputField id="password"        label="Create Password"   type="password" placeholder="••••••••"              value={password}        onChange={e => setPassword(e.target.value)}        icon="lock"          variant="onBrand" />
              <FormInputField id="confirmPassword" label="Confirm Password"  type="password" placeholder="••••••••"              value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} icon="verified_user" variant="onBrand" />
            </div>

            <PasswordRequirements password={password} onBrand />

            {/* terms */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', paddingTop: '0.5rem' }}>
              <input
                id="terms"
                type="checkbox"
                required
                checked={agreedToTerms}
                onChange={e => setAgreedToTerms(e.target.checked)}
                style={{ marginTop: 2, width: 16, height: 16, accentColor: CARD_TEXT, cursor: 'pointer', flexShrink: 0 }}
              />
              <label htmlFor="terms" style={{ fontFamily: "'Inter', sans-serif", fontSize: '0.75rem', color: CARD_TEXT, lineHeight: 1.6, cursor: 'pointer' }}>
                I agree to the{' '}
                <a href="#" style={{ color: CARD_TEXT, textDecoration: 'underline' }} onMouseEnter={e => (e.currentTarget.style.textDecoration='underline')} onMouseLeave={e => (e.currentTarget.style.textDecoration='underline')}>Terms of Service</a>
                {' '}and{' '}
                <a href="#" style={{ color: CARD_TEXT, textDecoration: 'underline' }} onMouseEnter={e => (e.currentTarget.style.textDecoration='underline')} onMouseLeave={e => (e.currentTarget.style.textDecoration='underline')}>Data Protection Policy</a>
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
                background: CARD_CTA,
                color: CARD_TEXT,
                fontFamily: "'Manrope', sans-serif",
                fontWeight: 700,
                fontSize: '1rem',
                border: '1px solid rgba(255, 243, 109, 0.45)',
                borderRadius: 12,
                cursor: isLoading ? 'not-allowed' : 'pointer',
                opacity: isLoading ? 0.6 : 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                boxShadow: '0 10px 26px rgba(10, 47, 82, 0.45)',
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
            <p style={{ fontFamily: "'Inter', sans-serif", fontSize: '0.75rem', color: CARD_TEXT, margin: 0 }}>
              Already registered?{' '}
              <Link to={`/login${window.location.search}`} style={{ color: CARD_TEXT, fontWeight: 600, textDecoration: 'underline' }}
                onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')}
                onMouseLeave={e => (e.currentTarget.style.textDecoration = 'underline')}
              >Sign In</Link>
            </p>
          </div>
        </div>

        {/* atmospheric ship image — multiply keeps it a watermark on yellow */}
        <div style={{ position: 'absolute', bottom: 0, right: 0, width: '33%', height: '50%', opacity: 0.1, zIndex: 0, pointerEvents: 'none' }}>
          <img
            alt="Maritime vessel"
            src={shipOcean}
            style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'grayscale(100%)', mixBlendMode: 'multiply' }}
          />
        </div>
      </main>

      <FooterNav />
    </div>
  );
};

export default Register;
