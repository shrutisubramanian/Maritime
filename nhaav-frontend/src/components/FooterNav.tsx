import React from 'react';
import { Link } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';
import { SupportModal } from './SupportModal';

export const FooterNav: React.FC = () => {
  const { tokens: C } = useTheme();
  const [isSupportOpen, setIsSupportOpen] = React.useState(false);

  const linkStyle: React.CSSProperties = {
    fontFamily: "'Inter', sans-serif",
    fontSize: '0.625rem',
    fontWeight: 500,
    letterSpacing: '0.18em',
    textTransform: 'uppercase',
    // Chiffon ground => solid Yale Blue ink.
    color: C.brand,
    textDecoration: 'none',
    transition: 'color 0.2s',
    background: 'none',
    border: 'none',
    padding: 0,
    cursor: 'pointer',
  };

  return (
    <footer style={{
      display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center',
      width: '100%', padding: '2.5rem 2rem', position: 'relative', zIndex: 20, gap: '1rem',
    }}>
      <div style={{ fontFamily: "'Inter', sans-serif", fontSize: '0.625rem', fontWeight: 500, letterSpacing: '0.18em', textTransform: 'uppercase', color: C.brand }}>
        © 2026 Nhaav. All rights reserved.
      </div>
      <div style={{ display: 'flex', gap: '1.5rem' }}>
        <Link to="/terms" style={linkStyle}
          onMouseEnter={e => (e.currentTarget.style.color = C.primary)}
          onMouseLeave={e => (e.currentTarget.style.color = C.brand)}
        >Terms and Conditions</Link>
        <a href="#" style={linkStyle}
          onMouseEnter={e => (e.currentTarget.style.color = C.primary)}
          onMouseLeave={e => (e.currentTarget.style.color = C.brand)}
        >Privacy Policy</a>
        {/* Opens the support popup instead of navigating away. */}
        <button
          type="button"
          style={linkStyle}
          onClick={() => setIsSupportOpen(true)}
          onMouseEnter={e => (e.currentTarget.style.color = C.primary)}
          onMouseLeave={e => (e.currentTarget.style.color = C.brand)}
        >Contact Support</button>
      </div>

      <SupportModal isOpen={isSupportOpen} onClose={() => setIsSupportOpen(false)} />
    </footer>
  );
};
