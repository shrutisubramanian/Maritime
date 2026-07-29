import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import portBg from '../../assets/images/port.jpg';

/* ── tokens ─────────────────────────────────────────────────── */
const T = {
  manrope: "'Manrope', sans-serif"   as const,
  inter:   "'Inter', sans-serif"     as const,
  bg:      '#0a0f1e',
  white:   '#ffffff',
  text:    '#dce3f0',
  muted:   '#c4c6ce',
  cyan:    '#4cd6ff',
  primary: '#9ccaff',
  // icon bg circles
  clientBg:   '#00203a',
  providerBg: '#00222c',
};

/* ── role card ───────────────────────────────────────────────── */
interface RoleCardProps {
  icon: string;
  iconColor: string;
  iconBg: string;
  title: string;
  description: string;
  btnGradient: string;
  btnTextColor: string;
  btnGlow: string;
  borderHover: string;
  onClick: () => void;
}

const RoleCard: React.FC<RoleCardProps> = ({
  icon, iconColor, iconBg, title, description,
  btnGradient, btnTextColor, btnGlow, onClick,
}) => {
  const [hovered, setHovered] = useState(false);
  const [btnDown, setBtnDown] = useState(false);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: 'rgba(46,53,63,0.4)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        borderRadius: 16,
        padding: 'clamp(2rem, 4vw, 2.5rem)',
        minHeight: 380,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        border: `1px solid ${hovered ? 'rgba(156,202,255,0.2)' : 'rgba(255,255,255,0.05)'}`,
        boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
        transition: 'border-color 0.3s',
      }}
    >
      {/* icon circle */}
      <div style={{
        marginBottom: '2rem',
        padding: '1.25rem',
        borderRadius: '50%',
        background: iconBg,
        color: iconColor,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transform: hovered ? 'scale(1.1)' : 'scale(1)',
        transition: 'transform 0.4s',
      }}>
        <span
          className="material-symbols-outlined"
          style={{ fontSize: '3rem', fontVariationSettings: "'FILL' 1", color: iconColor }}
        >{icon}</span>
      </div>

      <h3 style={{ fontFamily: T.manrope, fontWeight: 700, fontSize: '1.4rem', color: T.white, marginBottom: '1rem', lineHeight: 1.3 }}>
        {title}
      </h3>
      <p style={{ fontFamily: T.inter, fontSize: '0.95rem', color: T.muted, lineHeight: 1.7, flexGrow: 1, marginBottom: '2rem' }}>
        {description}
      </p>

      <button
        onClick={() => { setBtnDown(true); setTimeout(() => setBtnDown(false), 150); onClick(); }}
        style={{
          width: '90%',
          padding: '1rem 2rem',
          background: btnGradient,
          color: btnTextColor,
          fontFamily: T.manrope,
          fontWeight: 700,
          fontSize: '1rem',
          letterSpacing: '0.03em',
          border: 'none',
          borderRadius: 10,
          cursor: 'pointer',
          transform: btnDown ? 'scale(0.96)' : 'scale(1)',
          boxShadow: hovered ? `0 0 20px ${btnGlow}` : 'none',
          transition: 'transform 0.15s, box-shadow 0.3s',
        }}
      >
        Select
      </button>
    </div>
  );
};

/* ── page ────────────────────────────────────────────────────── */
const RoleSelectionPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div style={{ fontFamily: T.inter, color: T.text, minHeight: '100vh', position: 'relative', overflowX: 'hidden', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', background: T.bg }}>

      {/* ── background ── */}
      <div style={{ position: 'fixed', inset: 0, zIndex: 0, overflow: 'hidden', pointerEvents: 'none' }}>
        <div style={{ position: 'absolute', inset: 0, background: '#0a0f1e', opacity: 0.8, zIndex: 1 }} />
        <img
          src={portBg}
          alt="Maritime port terminal"
          style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'grayscale(100%)', mixBlendMode: 'overlay' }}
        />
        {/* ocean gradient overlay */}
        <div style={{
          position: 'absolute', inset: 0, zIndex: 2,
          background: `
            radial-gradient(circle at top right, rgba(0,209,255,0.05), transparent),
            radial-gradient(circle at bottom left, rgba(0,139,225,0.05), transparent)
          `,
        }} />
      </div>

      {/* ── content ── */}
      <div style={{ position: 'relative', zIndex: 30, minHeight: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>

        {/* header */}
        <header style={{ padding: 'clamp(2rem, 4vw, 3rem)' }}>
          <h1 style={{ fontFamily: T.manrope, fontSize: '1.4rem', fontWeight: 900, color: T.white, letterSpacing: '-0.04em', margin: 0 }}>
            HORIZON
          </h1>
        </header>

        {/* main */}
        <main style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem 1.5rem 4rem' }}>
          <div style={{ maxWidth: 1100, width: '100%', margin: '0 auto' }}>

            {/* headline */}
            <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
              <span style={{ fontFamily: T.inter, fontSize: '0.65rem', fontWeight: 700, color: T.cyan, letterSpacing: '0.2em', textTransform: 'uppercase', display: 'block', marginBottom: '0.75rem' }}>
                Maritime Infrastructure
              </span>
              <h2 style={{ fontFamily: T.manrope, fontWeight: 800, fontSize: 'clamp(2rem, 5vw, 3.5rem)', color: T.white, letterSpacing: '-0.04em', margin: '0 0 1rem' }}>
                Create your Horizon Account
              </h2>
              <p style={{ fontFamily: T.inter, fontSize: '1.05rem', color: T.muted, maxWidth: 560, margin: '0 auto', lineHeight: 1.7 }}>
                Select your role to get started with the world's most advanced maritime marketplace.
              </p>
            </div>

            {/* cards grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '2rem', marginTop: '2rem' }}>
              <RoleCard
                icon="anchor"
                iconColor={T.primary}
                iconBg={T.clientBg}
                title="I'm a Client (Ship / Company)"
                description="Manage vessel services, contracts, and logistics."
                btnGradient="linear-gradient(to right, #9ccaff, #a6c9fa)"
                btnTextColor="#001d35"
                btnGlow="rgba(156,202,255,0.3)"
                borderHover="rgba(156,202,255,0.2)"
                onClick={() => navigate('/register?role=client')}
              />
              <RoleCard
                icon="build"
                iconColor={T.cyan}
                iconBg={T.providerBg}
                title="I'm a Service Provider (Technician / Engineer)"
                description="Offer technical services, track jobs, and manage earnings."
                btnGradient="linear-gradient(to right, #4cd6ff, #a6c9fa)"
                btnTextColor="#003543"
                btnGlow="rgba(76,214,255,0.3)"
                borderHover="rgba(76,214,255,0.2)"
                onClick={() => navigate('/register?role=provider')}
              />
            </div>

            {/* login link */}
            <div style={{ marginTop: '4rem', textAlign: 'center' }}>
              <p style={{ fontFamily: T.inter, fontSize: '0.875rem', color: T.muted, letterSpacing: '0.02em' }}>
                Already have an account?{' '}
                <Link to="/login" style={{ color: T.primary, fontWeight: 600, textDecoration: 'underline', textDecorationColor: 'rgba(156,202,255,0.3)', textUnderlineOffset: 4 }}
                  onMouseEnter={e => (e.currentTarget.style.color = T.white)}
                  onMouseLeave={e => (e.currentTarget.style.color = T.primary)}
                >
                  Log In
                </Link>
              </p>
            </div>
          </div>
        </main>

        {/* footer */}
        <footer style={{ padding: '2rem', textAlign: 'center', fontFamily: T.inter, fontSize: '0.6rem', color: 'rgba(255,255,255,0.1)', letterSpacing: '0.4em', textTransform: 'uppercase' }}>
          © 2024 Horizon Maritime Global Infrastructure
        </footer>
      </div>
    </div>
  );
};

export default RoleSelectionPage;
