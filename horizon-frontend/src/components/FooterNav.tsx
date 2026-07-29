import React from 'react';

const S = {
  inter:   "'Inter', sans-serif" as const,
  muted:   '#c4c6ce',
  primary: '#9ccaff',
};

export const FooterNav: React.FC = () => (
  <footer style={{
    display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center',
    width: '100%', padding: '2.5rem 2rem', position: 'relative', zIndex: 20, gap: '1rem',
  }}>
    <div style={{ fontFamily: S.inter, fontSize: '0.625rem', fontWeight: 500, letterSpacing: '0.18em', textTransform: 'uppercase', color: S.muted }}>
      © 2024 HORIZON MARITIME INFRASTRUCTURE. ALL RIGHTS RESERVED.
    </div>
    <div style={{ display: 'flex', gap: '1.5rem' }}>
      {['Terms of Service', 'Privacy Policy', 'Contact Support'].map(label => (
        <a key={label} href="#" style={{ fontFamily: S.inter, fontSize: '0.625rem', fontWeight: 500, letterSpacing: '0.18em', textTransform: 'uppercase', color: S.muted, textDecoration: 'none', transition: 'color 0.2s' }}
          onMouseEnter={e => (e.currentTarget.style.color = S.primary)}
          onMouseLeave={e => (e.currentTarget.style.color = S.muted)}
        >{label}</a>
      ))}
    </div>
  </footer>
);
