import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../hooks/useAuth';
import { HeaderNav } from '../../components/HeaderNav';
import { FooterNav } from '../../components/FooterNav';

const manrope: React.CSSProperties = { fontFamily: "'Manrope', sans-serif" };
const inter: React.CSSProperties = { fontFamily: "'Inter', sans-serif" };

/** Brand primitives that must not follow the in-app light/dark preference. */
const CHIFFON = '#FFF36D';
const YALE = '#0D3B66';
/**
 * Moonstone Blue #4C9DB0 at ~32% over white. Used for panels that would
 * otherwise be the neutral pale blue, so the brand accent reads in the surface
 * itself while Yale Blue text keeps its contrast (~8:1).
 */
const MOONSTONE_SURFACE = '#62A9BA';

const wrap = (max = 1120): React.CSSProperties => ({
  maxWidth: max,
  margin: '0 auto',
  padding: '0 clamp(1.25rem, 4vw, 2.5rem)',
});

const eyebrow: React.CSSProperties = {
  fontFamily: "'Inter', sans-serif",
  fontSize: '0.65rem',
  fontWeight: 700,
  letterSpacing: '0.2em',
  textTransform: 'uppercase',
  display: 'block',
  marginBottom: '0.75rem',
};

const sectionTitle: React.CSSProperties = {
  ...manrope,
  fontWeight: 900,
  fontSize: 'clamp(1.6rem, 3.2vw, 2.2rem)',
  letterSpacing: '-0.03em',
  lineHeight: 1.15,
  margin: '0 0 0.9rem',
};

const body: React.CSSProperties = {
  fontSize: '0.95rem',
  lineHeight: 1.8,
  margin: '0 0 0.9rem',
};

const card: React.CSSProperties = {
  borderRadius: 24,
  padding: 'clamp(1.5rem, 3vw, 2rem)',
};

const PROBLEMS: { icon: string; title: string; text: string }[] = [
  {
    icon: 'travel_explore',
    title: 'Fragmented Networks',
    text: 'Discovering relevant suppliers and service providers can require searching through separate directories, personal contacts, emails, and messaging channels.',
  },
  {
    icon: 'visibility_off',
    title: 'Limited Visibility',
    text: 'Inconsistent business information can make it difficult to understand a provider’s offerings and evaluate potential partners.',
  },
  {
    icon: 'forum',
    title: 'Disconnected Communication',
    text: 'Procurement discussions spread across multiple channels can create unnecessary friction when businesses are trying to establish a connection.',
  },
];

const CAPABILITIES: { icon: string; title: string; text: string }[] = [
  {
    icon: 'storefront',
    title: 'Supplier Discovery',
    text: 'Explore supplier profiles and discover businesses presenting products and offerings relevant to maritime requirements.',
  },
  {
    icon: 'handyman',
    title: 'Service Provider Discovery',
    text: 'Find businesses offering maritime-related services and identify potential partners for your requirements.',
  },
  {
    icon: 'inventory_2',
    title: 'Business Listings',
    text: 'Give suppliers and service providers a place to showcase their offerings through marketplace listings.',
  },
  {
    icon: 'request_quote',
    title: 'Procurement Enquiries',
    text: 'Initiate business enquiries through the platform’s available functionality and begin discussions with relevant businesses.',
  },
  {
    icon: 'verified_user',
    title: 'Business Verification',
    text: 'Nhaav supports the review of submitted business information and documents where applicable, helping users make more informed assessments.',
  },
];

const PRINCIPLES: { title: string; text: string }[] = [
  {
    title: 'Industry Focused',
    text: 'Built around the needs of maritime businesses rather than a generic business directory.',
  },
  {
    title: 'Clarity First',
    text: 'Present business profiles and available offerings in a structured, accessible way.',
  },
  {
    title: 'Trust Through Transparency',
    text: 'Support informed evaluation through available business information and verification status, without promising risk-free transactions.',
  },
  {
    title: 'Built for Connections',
    text: 'Help buyers, suppliers, and service providers discover relevant businesses and initiate commercial conversations.',
  },
];

export default function AboutPage() {
  const navigate = useNavigate();
  const { tokens: C } = useTheme();
  const { isAuthenticated } = useAuth();

  const goToMarketplace = React.useCallback(() => {
    navigate(isAuthenticated ? '/marketplace' : '/login');
  }, [navigate, isAuthenticated]);

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

      <main style={{ flex: 1, padding: 'clamp(6.5rem, 12vw, 9rem) 0 3rem' }}>

        {/* ══ HERO ════════════════════════════════════════════ */}
        <section>
          <div style={wrap()}>
            <span style={{ ...eyebrow, color: C.cyan }}>About Nhaav</span>
            <h1 style={{ ...manrope, fontWeight: 900, fontSize: 'clamp(2rem, 5vw, 3.4rem)', letterSpacing: '-0.04em', lineHeight: 1.05, color: YALE, margin: '0 0 1.25rem', maxWidth: 860 }}>
              Connecting Maritime Businesses. Simplifying Discovery.
            </h1>
            <p style={{ ...body, fontSize: '1rem', color: YALE, maxWidth: 760 }}>
              The maritime industry runs on strong business relationships, dependable suppliers, and specialized
              services. Yet finding the right business partner can still mean navigating fragmented networks, scattered
              information, and lengthy communication.
            </p>
            <p style={{ ...body, fontSize: '1rem', color: YALE, maxWidth: 760, marginBottom: 0 }}>
              Nhaav is building a centralized B2B platform where maritime businesses can discover suppliers, explore
              service providers, and initiate procurement enquiries with greater clarity.
            </p>
          </div>
        </section>

        {/* ══ OUR STORY ═══════════════════════════════════════ */}
        <section style={{ marginTop: 'clamp(3rem, 7vw, 5rem)' }}>
          <div style={wrap()}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: 'clamp(1.5rem, 4vw, 3rem)', alignItems: 'start' }}>
              <div>
                <span style={{ ...eyebrow, color: C.cyan }}>Our story</span>
                <h2 style={{ ...sectionTitle, color: YALE }}>Built Around a Real Industry Challenge.</h2>
                <p style={{ ...body, color: YALE }}>
                  Maritime businesses depend on a wide network of suppliers and service providers to keep operations
                  moving. Finding the right partner, understanding what a business offers, and initiating a conversation
                  can take considerable time when information is spread across disconnected channels.
                </p>
                <p style={{ ...body, color: YALE }}>
                  Nhaav was conceived to make this process more organized.
                </p>
                <p style={{ ...body, color: YALE }}>
                  We are creating a dedicated space for maritime business discovery, bringing supplier profiles,
                  service offerings, and procurement enquiries together in one accessible platform.
                </p>
                <p style={{ ...body, color: YALE, marginBottom: 0 }}>
                  Our focus is simple: help businesses spend less time searching across fragmented sources and make it
                  easier to find relevant commercial connections.
                </p>
              </div>

              {/* Inset panel — a visual restatement, not extra claims. */}
              <div style={{ background: YALE, ...card, border: '1px solid rgba(255, 243, 109,0.15)' }}>
                <div style={{ ...manrope, fontWeight: 700, fontSize: '0.7rem', letterSpacing: '0.16em', textTransform: 'uppercase', color: CHIFFON, marginBottom: '1.25rem' }}>
                  What we are building
                </div>
                <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {['Supplier profiles', 'Service offerings', 'Procurement enquiries'].map(item => (
                    <li key={item} style={{ display: 'flex', gap: 12, alignItems: 'center', color: CHIFFON, fontSize: '0.95rem', fontWeight: 600 }}>
                      <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: '1.15rem', color: CHIFFON }}>
                        check_circle
                      </span>
                      {item}
                    </li>
                  ))}
                </ul>
                <p style={{ ...body, fontSize: '0.82rem', color: CHIFFON, margin: '1.5rem 0 0' }}>
                  One accessible platform, instead of disconnected channels.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ══ THE PROBLEM ═════════════════════════════════════ */}
        <section style={{ marginTop: 'clamp(3.5rem, 8vw, 6rem)' }}>
          <div style={wrap()}>
            <div style={{ maxWidth: 760, marginBottom: '2rem' }}>
              <span style={{ ...eyebrow, color: C.cyan }}>The problem</span>
              <h2 style={{ ...sectionTitle, color: YALE }}>A Complex Industry Deserves a Better Way to Connect.</h2>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: '1.25rem' }}>
              {PROBLEMS.map(p => (
                <div key={p.title} style={{ background: MOONSTONE_SURFACE, border: `1px solid ${C.border}`, ...card }}>
                  <div style={{ display: 'inline-flex', padding: '0.7rem', borderRadius: 14, background: C.brandSoft, marginBottom: '1.25rem' }}>
                    <span className="material-symbols-outlined" aria-hidden="true" style={{ color: YALE, fontSize: '1.5rem' }}>{p.icon}</span>
                  </div>
                  <h3 style={{ ...manrope, fontWeight: 700, fontSize: '1.1rem', color: YALE, margin: '0 0 0.55rem' }}>{p.title}</h3>
                  <p style={{ ...body, fontSize: '0.88rem', color: YALE, margin: 0 }}>{p.text}</p>
                </div>
              ))}
            </div>

            <p style={{ ...body, color: YALE, marginTop: '1.75rem', marginBottom: 0, maxWidth: 820 }}>
              Nhaav aims to bring business discovery into one organized, maritime-focused environment.
            </p>
          </div>
        </section>

        {/* ══ WHAT NHAAV DOES ═════════════════════════════════ */}
        <section style={{ marginTop: 'clamp(3.5rem, 8vw, 6rem)' }}>
          <div style={wrap()}>
            <div style={{ maxWidth: 760, marginBottom: '2rem' }}>
              <span style={{ ...eyebrow, color: C.cyan }}>What Nhaav does</span>
              <h2 style={{ ...sectionTitle, color: YALE }}>A Dedicated Space for Maritime Business Discovery.</h2>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: '1.25rem' }}>
              {CAPABILITIES.map(item => (
                <div key={item.title} style={{ background: MOONSTONE_SURFACE, border: `1px solid ${C.border}`, ...card }}>
                  <div style={{ display: 'inline-flex', padding: '0.7rem', borderRadius: 14, background: C.brandSoft, marginBottom: '1.25rem' }}>
                    <span className="material-symbols-outlined" aria-hidden="true" style={{ color: YALE, fontSize: '1.5rem' }}>{item.icon}</span>
                  </div>
                  <h3 style={{ ...manrope, fontWeight: 700, fontSize: '1.05rem', color: YALE, margin: '0 0 0.55rem' }}>{item.title}</h3>
                  <p style={{ ...body, fontSize: '0.87rem', color: YALE, margin: 0 }}>{item.text}</p>
                </div>
              ))}
            </div>

            <p style={{ ...body, fontSize: '0.8rem', color: YALE, marginTop: '1.5rem', marginBottom: 0, maxWidth: 860 }}>
              Verification reflects the checks Nhaav specifies for submitted information and documents. It does not
              guarantee a business’s quality, financial stability, or the outcome of a transaction.
            </p>
          </div>
        </section>

        {/* ══ OUR APPROACH ════════════════════════════════════ */}
        <section style={{ marginTop: 'clamp(3.5rem, 8vw, 6rem)' }}>
          <div style={wrap()}>
            <div style={{ background: YALE, borderRadius: 32, padding: 'clamp(1.75rem, 4vw, 3rem)', border: '1px solid rgba(255, 243, 109,0.15)' }}>
              <div style={{ maxWidth: 720, marginBottom: '2rem' }}>
                <span style={{ ...eyebrow, color: CHIFFON }}>Our approach</span>
                <h2 style={{ ...sectionTitle, color: CHIFFON }}>Practical Connections. Clearer Discovery.</h2>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))', gap: 'clamp(1.25rem, 3vw, 2rem)' }}>
                {PRINCIPLES.map((p, i) => (
                  <div key={p.title}>
                    <span style={{ ...manrope, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: '50%', background: 'rgba(255, 243, 109,0.16)', color: CHIFFON, fontSize: '0.8rem', fontWeight: 800, marginBottom: '0.85rem' }}>
                      {i + 1}
                    </span>
                    <h3 style={{ ...manrope, fontWeight: 700, fontSize: '1rem', color: CHIFFON, margin: '0 0 0.45rem' }}>{p.title}</h3>
                    <p style={{ ...body, fontSize: '0.86rem', color: CHIFFON, margin: 0 }}>{p.text}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ══ WHO WE SERVE ════════════════════════════════════ */}
        <section style={{ marginTop: 'clamp(3.5rem, 8vw, 6rem)' }}>
          <div style={wrap()}>
            <div style={{ maxWidth: 760, marginBottom: '2rem' }}>
              <span style={{ ...eyebrow, color: C.cyan }}>Who we serve</span>
              <h2 style={{ ...sectionTitle, color: YALE }}>One Network. Different Business Needs.</h2>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: '1.25rem' }}>
              {[
                {
                  title: 'Clients and Buyers',
                  text: 'Discover suppliers and service providers, explore available offerings, and initiate procurement enquiries.',
                  cta: 'Explore Marketplace',
                  onClick: goToMarketplace,
                },
                {
                  title: 'Suppliers',
                  text: 'Present your business, showcase your offerings, and help potential clients discover your company.',
                  cta: 'Join as a Supplier',
                  onClick: () => navigate('/choose-role'),
                },
                {
                  title: 'Service Providers',
                  text: 'Build your business presence and make your services discoverable to relevant maritime businesses.',
                  cta: 'Join as a Service Provider',
                  onClick: () => navigate('/choose-role'),
                },
              ].map(segment => (
                <div key={segment.title} style={{ background: MOONSTONE_SURFACE, border: `1px solid ${C.border}`, ...card, display: 'flex', flexDirection: 'column' }}>
                  <h3 style={{ ...manrope, fontWeight: 800, fontSize: '1.1rem', color: YALE, margin: '0 0 0.55rem' }}>{segment.title}</h3>
                  <p style={{ ...body, fontSize: '0.88rem', color: YALE, flex: 1 }}>{segment.text}</p>
                  <button
                    type="button"
                    onClick={segment.onClick}
                    style={{
                      marginTop: '1.25rem',
                      alignSelf: 'flex-start',
                      padding: '12px 24px',
                      borderRadius: 12,
                      border: 'none',
                      background: YALE,
                      color: CHIFFON,
                      fontFamily: "'Inter', sans-serif",
                      fontSize: '0.86rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      transition: 'transform 0.15s ease, opacity 0.15s ease',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.opacity = '0.92'; }}
                    onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.opacity = '1'; }}
                  >
                    {segment.cta}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ══ OUR VISION ══════════════════════════════════════ */}
        <section style={{ marginTop: 'clamp(3.5rem, 8vw, 6rem)' }}>
          <div style={wrap(860)}>
            <span style={{ ...eyebrow, color: C.cyan }}>Our vision</span>
            <h2 style={{ ...sectionTitle, color: YALE }}>Making Maritime Business Discovery More Connected.</h2>
            <p style={{ ...body, color: YALE }}>
              We envision a maritime business environment where finding the right supplier or service provider is more
              accessible, business information is easier to explore, and commercial connections can begin with greater
              clarity.
            </p>
            <p style={{ ...body, color: YALE }}>
              Nhaav is taking a practical step toward that vision by bringing maritime supplier discovery, service
              listings, and procurement enquiries into a centralized platform.
            </p>
            <p style={{ ...body, color: YALE, marginBottom: 0 }}>
              We will continue to build around the real needs of the businesses that make the maritime industry work.
            </p>
          </div>
        </section>

        {/* ══ CLOSING CTA ═════════════════════════════════════ */}
        <section style={{ marginTop: 'clamp(3.5rem, 8vw, 6rem)' }}>
          <div style={wrap()}>
            <div style={{ background: YALE, borderRadius: 36, padding: 'clamp(2rem, 5vw, 4rem)', border: '1px solid rgba(255, 243, 109,0.15)' }}>
              <div style={{ maxWidth: 640 }}>
                <h2 style={{ ...manrope, fontWeight: 900, fontSize: 'clamp(1.7rem, 4vw, 2.6rem)', letterSpacing: '-0.04em', lineHeight: 1.1, color: CHIFFON, margin: '0 0 1rem' }}>
                  Your Next Maritime Connection Starts Here.
                </h2>
                <p style={{ ...body, color: CHIFFON, marginBottom: '2rem' }}>
                  Whether you are searching for a supplier, exploring maritime services, or looking to make your
                  business more discoverable, Nhaav provides a starting point for your next business connection.
                </p>
                <div style={{ display: 'flex', gap: '0.85rem', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={goToMarketplace}
                    style={{
                      padding: '14px 32px',
                      background: CHIFFON,
                      color: YALE,
                      fontFamily: "'Inter', sans-serif",
                      fontSize: '0.9rem',
                      fontWeight: 700,
                      border: 'none',
                      borderRadius: 14,
                      cursor: 'pointer',
                      boxShadow: '0 8px 20px rgba(0,0,0,0.22)',
                    }}
                  >
                    Explore Marketplace
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate('/choose-role')}
                    style={{
                      padding: '14px 32px',
                      background: 'transparent',
                      color: CHIFFON,
                      fontFamily: "'Inter', sans-serif",
                      fontSize: '0.9rem',
                      fontWeight: 700,
                      borderRadius: 14,
                      cursor: 'pointer',
                      border: '2px solid rgba(255, 243, 109,0.42)',
                    }}
                  >
                    Join Nhaav
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <FooterNav />
    </div>
  );
}
