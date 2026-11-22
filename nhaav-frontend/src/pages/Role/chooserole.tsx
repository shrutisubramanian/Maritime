import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useTheme } from '../../context/ThemeContext';
import { BrandLogo } from '../../components/BrandLogo';

/* ── tokens ─────────────────────────────────────────────────── */
// This page switches between a dark maritime night (dark mode) and a
// light Morning Dawn sheet (light mode). Text colours come from the theme so
// dark text always sits on light backgrounds and light text on dark.
const T = {
  manrope: "'Manrope', sans-serif"   as const,
  inter:   "'Inter', sans-serif"     as const,
  cyan:    '#4C9DB0', // Moonstone
  primary: '#0D3B66', // Yale Blue
  // icon bg circles — Moonstone-wash tint, usable on either theme
  clientBg:   'rgba(76, 157, 176, 0.16)',
  providerBg: 'rgba(76, 157, 176, 0.16)',
};

// Resolved at runtime from the live theme, so they're always correct.
function useRoleTokens() {
  const { tokens, isDark } = useTheme();
  // Yellow paper mode keeps the same Yale fill: dark ink on yellow, white on Yale.
  const brandGradient = isDark
    ? tokens.gradient
    : 'linear-gradient(to right, #0D3B66, #4C9DB0)';
  return {
    bg:       tokens.background,
    baseBg:   tokens.background,
    white:    tokens.text,   // light text on dark, dark text on light
    text:     tokens.text,
    // Chiffon ground => solid Yale Blue ink (no washed-out navy).
    muted:    tokens.brand,
    cardBg:   isDark ? tokens.surface : 'rgba(255,255,255,0.78)',
    cardBorder: tokens.border,
    cardHoverBorder: 'rgba(13,59,102,0.45)',
    cardShadow: tokens.shadowMd,
    glassBg:  tokens.glass,
    headerText: tokens.brand,
    headline: tokens.brand,
    body:     tokens.text,
    footerText: tokens.brand,
    link:     tokens.brand,
    linkHover: tokens.brandHover,
    btnClientGradient: brandGradient,
    btnProviderGradient: brandGradient,
    btnClientText: tokens.onBrand,
    btnProviderText: tokens.onBrand,
    btnClientGlow: 'rgba(13,59,102,0.35)',
    btnProviderGlow: 'rgba(13,59,102,0.35)',
    clientIconColor: tokens.brand,
    providerIconColor: tokens.brand,
  };
}

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
  const { isDark } = useTheme();

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: isDark ? 'rgba(255,252,242,0.85)' : 'rgba(255,255,255,0.78)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        borderRadius: 16,
        padding: 'clamp(2rem, 4vw, 2.5rem)',
        minHeight: 380,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        border: `1px solid ${hovered ? 'rgba(13,59,102,0.45)' : 'rgba(13,59,102,0.20)'}`,
        boxShadow: '0 12px 28px rgba(13,59,102,0.14)',
        transition: 'border-color 0.3s, box-shadow 0.3s',
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

      <h3 style={{ fontFamily: T.manrope, fontWeight: 700, fontSize: '1.4rem', color: '#0D3B66', marginBottom: '1rem', lineHeight: 1.3 }}>
        {title}
      </h3>
      <p style={{ fontFamily: T.inter, fontSize: '0.95rem', color: 'rgba(13,59,102,0.82)', lineHeight: 1.7, flexGrow: 1, marginBottom: '2rem' }}>
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
  const rt = useRoleTokens();

  return (
    <div style={{ fontFamily: T.inter, color: rt.text, minHeight: '100vh', position: 'relative', overflowX: 'hidden', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', background: rt.bg }}>

      {/* ── content ── */}
      <div style={{ position: 'relative', zIndex: 30, minHeight: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>

        {/* header */}
        <header style={{ padding: 'clamp(2rem, 4vw, 3rem)' }}>
          <BrandLogo height={30} />
        </header>

        {/* main */}
        <main style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem 1.5rem 4rem' }}>
          <div style={{ maxWidth: 1100, width: '100%', margin: '0 auto' }}>

            {/* headline */}
            <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
              <span style={{ fontFamily: T.inter, fontSize: '0.65rem', fontWeight: 700, color: '#0D3B66', letterSpacing: '0.2em', textTransform: 'uppercase', display: 'block', marginBottom: '0.75rem' }}>
                Maritime Infrastructure
              </span>
              <h2 style={{ fontFamily: T.manrope, fontWeight: 800, fontSize: 'clamp(2rem, 5vw, 3.5rem)', color: rt.headline, letterSpacing: '-0.04em', margin: '0 0 1rem' }}>
                Create your Nhaav Account
              </h2>
            </div>

            {/* cards grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '2rem', marginTop: '2rem' }}>
              <RoleCard
                icon="anchor"
                iconColor={rt.clientIconColor}
                iconBg={T.clientBg}
                title="I'm a Client (Ship / Company)"
                description="Manage vessel services, contracts, and logistics."
                btnGradient={rt.btnClientGradient}
                btnTextColor={rt.btnClientText}
                btnGlow={rt.btnClientGlow}
                borderHover={rt.cardHoverBorder}
                onClick={() => navigate('/register?role=client')}
              />
              <RoleCard
                icon="build"
                iconColor={rt.providerIconColor}
                iconBg={T.providerBg}
                title="I'm a Service Provider (Technician / Engineer)"
                description="Offer technical services, track jobs, and manage earnings."
                btnGradient={rt.btnProviderGradient}
                btnTextColor={rt.btnProviderText}
                btnGlow={rt.btnProviderGlow}
                borderHover={rt.cardHoverBorder}
                onClick={() => navigate('/register?role=provider')}
              />
              <RoleCard
                icon="inventory_2"
                iconColor={rt.providerIconColor}
                iconBg={T.providerBg}
                title="I'm a Supplier (Parts / Equipment)"
                description="List marine supplies, reach procurement requests, and quote."
                btnGradient={rt.btnProviderGradient}
                btnTextColor={rt.btnProviderText}
                btnGlow={rt.btnProviderGlow}
                borderHover={rt.cardHoverBorder}
                onClick={() => navigate('/register?role=supplier')}
              />
            </div>

            {/* login link */}
            <div style={{ marginTop: '4rem', textAlign: 'center' }}>
              <p style={{ fontFamily: T.inter, fontSize: '0.875rem', color: rt.muted, letterSpacing: '0.02em' }}>
                Already have an account?{' '}
                <Link to="/login" style={{ color: rt.link, fontWeight: 600, textDecoration: 'underline', textDecorationColor: 'rgba(13,59,102,0.3)', textUnderlineOffset: 4 }}
                  onMouseEnter={e => (e.currentTarget.style.color = rt.linkHover)}
                  onMouseLeave={e => (e.currentTarget.style.color = rt.link)}
                >
                  Log In
                </Link>
              </p>
            </div>
          </div>
        </main>

        {/* footer */}
        <footer style={{ padding: '2rem', textAlign: 'center', fontFamily: T.inter, fontSize: '0.6rem', color: rt.footerText, letterSpacing: '0.4em', textTransform: 'uppercase' }}>
          © 2026 Nhaav. All rights reserved.
        </footer>
      </div>
    </div>
  );
};

export default RoleSelectionPage;
