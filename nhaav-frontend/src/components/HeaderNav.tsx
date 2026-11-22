import React from 'react';
import { Link } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';
import { SupportModal } from './SupportModal';
import { BrandLogo } from './BrandLogo';

const M = "'Manrope', sans-serif";

/**
 * Public top bar (logo + support/security).
 *
 * `glass` paints a translucent brand bar behind it. Pages whose content
 * scrolls under the fixed header (pricing, long public pages) pass it so the
 * logo and links stay legible; the auth screens leave it off because their
 * content is centred and never reaches the bar.
 */
export const HeaderNav: React.FC<{ glass?: boolean }> = ({ glass = false }) => {
  const { tokens: C } = useTheme();
  const [isSupportOpen, setIsSupportOpen] = React.useState(false);

  const linkStyle: React.CSSProperties = {
    fontFamily: "'Inter', sans-serif",
    fontSize: '0.85rem',
    fontWeight: 500,
    // Chiffon ground => solid Yale Blue ink.
    color: C.brand,
    textDecoration: 'none',
    letterSpacing: '0.02em',
    transition: 'color 0.2s',
    background: 'none',
    border: 'none',
    padding: 0,
    cursor: 'pointer',
  };

  return (
    <header style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      // border-box: with content-box the fixed width became 100% + padding,
      // pushing the right-hand links off the viewport.
      boxSizing: 'border-box',
      width: '100%', padding: glass ? '1rem 2rem' : '1.5rem 2rem',
      position: 'fixed', top: 0, left: 0, zIndex: 50,
      ...(glass
        ? {
            // Chiffon-tinted bar so the page ground and the bar agree.
            background: 'rgba(255, 243, 109, 0.92)',
            backdropFilter: 'blur(18px)',
            WebkitBackdropFilter: 'blur(18px)',
            borderBottom: `1px solid ${C.border}`,
          }
        : {}),
    }}>
      <Link to="/" style={{ textDecoration: 'none' }}>
        <BrandLogo height={32} />
      </Link>
      <div style={{ display: 'flex', gap: '2rem', alignItems: 'center' }}>
        {/* Opens the support popup rather than navigating away. */}
        <button
          type="button"
          style={linkStyle}
          onClick={() => setIsSupportOpen(true)}
          onMouseEnter={e => (e.currentTarget.style.color = C.primary)}
          onMouseLeave={e => (e.currentTarget.style.color = C.brand)}
        >
          Support
        </button>
        <Link
          to="/contact"
          style={linkStyle}
          onMouseEnter={e => (e.currentTarget.style.color = C.primary)}
          onMouseLeave={e => (e.currentTarget.style.color = C.brand)}
        >
          Contact Us
        </Link>
        <a
          href="#"
          style={linkStyle}
          onMouseEnter={e => (e.currentTarget.style.color = C.primary)}
          onMouseLeave={e => (e.currentTarget.style.color = C.brand)}
        >
          Security
        </a>
      </div>

      <SupportModal isOpen={isSupportOpen} onClose={() => setIsSupportOpen(false)} />
    </header>
  );
};
