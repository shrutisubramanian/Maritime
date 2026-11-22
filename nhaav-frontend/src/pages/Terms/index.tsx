import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTheme } from '../../context/ThemeContext';
import { HeaderNav } from '../../components/HeaderNav';
import { FooterNav } from '../../components/FooterNav';
import { SupportModal } from '../../components/SupportModal';
import { CLIENT_TERMS, PROVIDER_TERMS, type TermsDocument } from '../../constants/terms';

const manrope: React.CSSProperties = { fontFamily: "'Manrope', sans-serif" };
const inter: React.CSSProperties = { fontFamily: "'Inter', sans-serif" };

const CHIFFON = '#FFF36D';
const YALE = '#0D3B66';
/** Moonstone Blue #4C9DB0 at ~32% over white — the panel surface. */
const MOONSTONE_SURFACE = '#62A9BA';

const wrap = (max = 860): React.CSSProperties => ({
  maxWidth: max,
  margin: '0 auto',
  padding: '0 clamp(1.25rem, 4vw, 2.5rem)',
});

const label: React.CSSProperties = {
  fontFamily: "'Inter', sans-serif",
  fontSize: '0.65rem',
  fontWeight: 700,
  letterSpacing: '0.2em',
  textTransform: 'uppercase',
  display: 'block',
  marginBottom: '0.75rem',
};

const body: React.CSSProperties = {
  fontSize: '0.92rem',
  lineHeight: 1.8,
  margin: '0 0 0.9rem',
};

const DOCUMENTS: TermsDocument[] = [CLIENT_TERMS, PROVIDER_TERMS];

export default function TermsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { tokens: C } = useTheme();
  const [isSupportOpen, setIsSupportOpen] = React.useState(false);

  // #provider opens the supplier document directly, so the provider side can be
  // linked to from elsewhere without landing on the client terms first.
  const [activeId, setActiveId] = React.useState<'client' | 'provider'>(
    location.hash.replace('#', '') === 'provider' ? 'provider' : 'client',
  );

  React.useEffect(() => {
    setActiveId(location.hash.replace('#', '') === 'provider' ? 'provider' : 'client');
  }, [location.hash]);

  const doc = DOCUMENTS.find(d => d.id === activeId) ?? CLIENT_TERMS;

  return (
    <div
      style={{
        background: `radial-gradient(760px 460px at 88% 120px, rgba(76,157,176,0.20), transparent 72%), ${C.bg}`,
        color: C.text,
        ...inter,
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <HeaderNav glass />

      <main style={{ flex: 1, padding: 'clamp(6.5rem, 12vw, 9rem) 0 4rem' }}>
        <div style={wrap()}>
          <span style={{ ...label, color: C.cyan }}>Legal</span>
          <h1 style={{ ...manrope, fontWeight: 900, fontSize: 'clamp(2rem, 5vw, 3rem)', letterSpacing: '-0.04em', lineHeight: 1.08, color: YALE, margin: '0 0 1rem' }}>
            Terms &amp; Conditions
          </h1>
          <p style={{ ...body, fontSize: '1rem', color: YALE, maxWidth: 680 }}>
            Nhaav publishes two sets of terms: one for clients buying or enquiring through the platform, and one for
            suppliers and service providers listing on it. Choose the one that applies to you.
          </p>

          {/* ── Document switcher ─────────────────────────────── */}
          <div
            role="tablist"
            aria-label="Terms documents"
            style={{
              display: 'inline-flex',
              gap: 4,
              padding: 4,
              borderRadius: 12,
              background: MOONSTONE_SURFACE,
              border: `1px solid ${C.border}`,
              margin: '1.75rem 0 0.5rem',
              flexWrap: 'wrap',
            }}
          >
            {DOCUMENTS.map(d => {
              const active = d.id === doc.id;
              return (
                <button
                  key={d.id}
                  role="tab"
                  aria-selected={active}
                  type="button"
                  onClick={() => {
                    // Router-aware so a reload or a back/forward keeps the tab.
                    navigate(d.id === 'provider' ? '/terms#provider' : '/terms', { replace: true });
                  }}
                  style={{
                    padding: '9px 18px',
                    borderRadius: 9,
                    border: 'none',
                    background: active ? YALE : 'transparent',
                    color: active ? CHIFFON : YALE,
                    fontFamily: inter.fontFamily,
                    fontSize: '0.82rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    transition: 'background 0.15s ease, color 0.15s ease',
                  }}
                >
                  {d.tab}
                </button>
              );
            })}
          </div>

          <p style={{ ...body, fontSize: '0.78rem', color: YALE }}>
            {doc.title} · Last updated {doc.updated}
          </p>

          <div
            key={doc.id}
            style={{
              marginTop: '1.25rem',
              background: MOONSTONE_SURFACE,
              border: `1px solid ${C.border}`,
              borderRadius: 24,
              padding: 'clamp(1.5rem, 4vw, 2.75rem)',
              boxShadow: '0 10px 30px rgba(13,59,102,0.06)',
            }}
          >
            <h2 style={{ ...manrope, fontWeight: 900, fontSize: 'clamp(1.25rem, 2.6vw, 1.6rem)', letterSpacing: '-0.02em', color: YALE, margin: '0 0 1rem' }}>
              {doc.title}
            </h2>

            {doc.sections.map((section, i) => (
              <section key={section.title} style={{ marginBottom: '1.75rem' }}>
                <h3 style={{ ...manrope, fontWeight: 800, fontSize: '1rem', letterSpacing: '-0.01em', color: YALE, margin: '0 0 0.6rem' }}>
                  {i + 1}. {section.title}
                </h3>
                {section.paragraphs.map(p => (
                  <p key={p} style={{ ...body, color: YALE }}>{p}</p>
                ))}
                {section.points && (
                  <ul style={{ margin: '0 0 0.9rem', paddingLeft: '1.15rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    {section.points.map(point => (
                      <li key={point} style={{ ...body, color: YALE, margin: 0, fontSize: '0.88rem' }}>{point}</li>
                    ))}
                  </ul>
                )}
                {section.afterPoints?.map(p => (
                  <p key={p} style={{ ...body, color: YALE }}>{p}</p>
                ))}
              </section>
            ))}
          </div>

          <div
            style={{
              marginTop: '2rem',
              background: YALE,
              borderRadius: 24,
              padding: 'clamp(1.5rem, 4vw, 2.25rem)',
              border: '1px solid rgba(255, 243, 109,0.15)',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
              gap: '1.5rem',
              alignItems: 'center',
            }}
          >
            <div>
              <h2 style={{ ...manrope, fontWeight: 800, fontSize: '1.1rem', color: CHIFFON, margin: '0 0 0.4rem' }}>
                Questions about these terms?
              </h2>
              <p style={{ ...body, fontSize: '0.88rem', color: CHIFFON, margin: 0 }}>
                Our team can explain how verification, payment review and access passes apply to your account.
              </p>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => setIsSupportOpen(true)}
                style={{
                  padding: '13px 26px',
                  borderRadius: 14,
                  border: 'none',
                  background: CHIFFON,
                  color: YALE,
                  fontFamily: inter.fontFamily,
                  fontSize: '0.88rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Contact Support
              </button>
              <button
                type="button"
                onClick={() => navigate('/')}
                style={{
                  padding: '13px 26px',
                  borderRadius: 14,
                  background: 'transparent',
                  color: CHIFFON,
                  border: '2px solid rgba(255, 243, 109,0.42)',
                  fontFamily: inter.fontFamily,
                  fontSize: '0.88rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Back to Home
              </button>
            </div>
          </div>
        </div>
      </main>

      <FooterNav />

      <SupportModal isOpen={isSupportOpen} onClose={() => setIsSupportOpen(false)} />
    </div>
  );
}
