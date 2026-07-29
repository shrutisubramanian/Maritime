import React from 'react';
import { Link } from 'react-router-dom';

const S = {
  inter:   "'Inter', sans-serif"   as const,
  manrope: "'Manrope', sans-serif" as const,
  muted:   '#c4c6ce',
  primary: '#9ccaff',
  white:   '#dce3f0',
};

export const HeaderNav: React.FC = () => (
  <header style={{
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    width: '100%', padding: '1.5rem 2rem',
    position: 'fixed', top: 0, left: 0, zIndex: 50,
  }}>
    <Link to="/" style={{ textDecoration: 'none' }}>
      <div style={{ fontFamily: S.manrope, fontSize: '1.4rem', fontWeight: 700, color: S.white, letterSpacing: '-0.03em' }}>
        HORIZON
      </div>
    </Link>
    <div style={{ display: 'flex', gap: '2rem' }}>
      {['Support', 'Security'].map(label => (
        <a key={label} href="#" style={{ fontFamily: S.inter, fontSize: '0.85rem', fontWeight: 500, color: S.muted, textDecoration: 'none', letterSpacing: '0.02em', transition: 'color 0.2s' }}
          onMouseEnter={e => (e.currentTarget.style.color = S.primary)}
          onMouseLeave={e => (e.currentTarget.style.color = S.muted)}
        >{label}</a>
      ))}
    </div>
  </header>
);
