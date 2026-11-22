import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../hooks/useAuth';
import { HeaderNav } from '../../components/HeaderNav';
import { FooterNav } from '../../components/FooterNav';
import { useServiceCatalogue } from '../../hooks/useServiceCatalogue';
import { ContactSection } from '../../components/ContactSection';

const manrope: React.CSSProperties = { fontFamily: "'Manrope', sans-serif" };
const inter: React.CSSProperties = { fontFamily: "'Inter', sans-serif" };

/** Brand primitives that must not follow the in-app light/dark preference. */
const CHIFFON = '#FFF36D';
const YALE = '#0D3B66';
/**
 * Moonstone Blue #4C9DB0 at ~32% over white: the panel surface where a neutral
 * pale blue used to sit. Yale Blue text keeps ~8:1 contrast on it.
 */
const MOONSTONE_SURFACE = '#62A9BA';

const wrap = (max = 1120): React.CSSProperties => ({
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

const sectionTitle: React.CSSProperties = {
  ...manrope,
  fontWeight: 900,
  fontSize: 'clamp(1.5rem, 3vw, 2.1rem)',
  letterSpacing: '-0.03em',
  lineHeight: 1.15,
  margin: '0 0 0.75rem',
};

const body: React.CSSProperties = {
  fontSize: '0.95rem',
  lineHeight: 1.75,
  margin: 0,
};

/** One icon per catalogue category, keyed by the category name. */
const CATEGORY_ICONS: Record<string, string> = {
  'Ship Repair & Services': 'handyman',
  'Inspections & Surveys': 'fact_check',
  'Cleaning / Port / Marine Support': 'cleaning_services',
  'General Ship Repairs / Marine Services': 'construction',
  'Repairs & Maintenance': 'handyman',
  'Hull & Underwater': 'water',
  'Inspection & Survey': 'fact_check',
  'Marine Safety & Appliances': 'health_and_safety',
  'HVAC & Refrigeration': 'ac_unit',
  'Fuel and Bunkering': 'local_gas_station',
  'Security & Logistics': 'local_shipping',
};

/** Supply-side categories, shown as headings only. */
const SUPPLY_CATEGORIES = [
  'Ship Chandlers',
  'Engine Stores',
  'Paints',
  'Safety Equipment',
  'Spare Parts Suppliers',
  'Marine Equipment',
  'Chemicals',
  'Lubricating Oils/Greases',
] as const;

const STEPS: { title: string; text: string }[] = [
  {
    title: 'Describe your requirement',
    text: 'Name the service, the port and the vessel. Add any survey, class or safety requirements that apply.',
  },
  {
    title: 'Verified providers quote',
    text: 'Matching service providers on the network respond with a price and an estimated completion time.',
  },
  {
    title: 'Compare offers on price alone',
    text: 'Offers arrive anonymously. Until both sides accept, only the job and the price are shown — no contact details.',
  },
  {
    title: 'Award and connect',
    text: 'Accept the offer you want. Once the provider accepts too, you are notified and their name and phone number are shared.',
  },
];

export default function ServicesPage() {
  const navigate = useNavigate();
  const { tokens: C } = useTheme();
  const { isAuthenticated } = useAuth();

  const goToMarketplace = React.useCallback(() => {
    navigate(isAuthenticated ? '/marketplace' : '/login');
  }, [navigate, isAuthenticated]);

  const { groups, loading, error, reload, totalServices } = useServiceCatalogue();

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

        {/* ══ INTRO ═══════════════════════════════════════════ */}
        <section>
          <div style={wrap()}>
            <span style={{ ...label, color: C.cyan }}>Services</span>
            <h1 style={{ ...manrope, fontWeight: 900, fontSize: 'clamp(2rem, 5vw, 3.4rem)', letterSpacing: '-0.04em', lineHeight: 1.05, color: YALE, margin: '0 0 1.25rem', maxWidth: 820 }}>
              Maritime services, sourced from one network.
            </h1>
            <p style={{ ...body, fontSize: '1rem', color: YALE, maxWidth: 720 }}>
              Nhaav connects shipowners and managers with verified providers{' '}
              {groups.length > 0
                ? `across ${groups.length} service categories and ${totalServices} individual services.`
                : 'across a growing catalogue of service categories and individual services.'}{' '}
              Request a scope once and receive competitive quotations from providers operating at your port.
            </p>

            <div style={{ display: 'flex', gap: '0.85rem', flexWrap: 'wrap', marginTop: '2rem' }}>
              <button
                type="button"
                onClick={goToMarketplace}
                style={{
                  padding: '14px 30px',
                  borderRadius: 14,
                  border: 'none',
                  background: YALE,
                  color: CHIFFON,
                  fontFamily: "'Inter', sans-serif",
                  fontSize: '0.9rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'transform 0.15s ease, opacity 0.15s ease',
                }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.opacity = '0.92'; }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.opacity = '1'; }}
              >
                Browse the Marketplace
              </button>
              <button
                type="button"
                onClick={() => navigate(isAuthenticated ? '/create-request' : '/register')}
                style={{
                  padding: '14px 30px',
                  borderRadius: 14,
                  background: 'transparent',
                  color: YALE,
                  border: `1px solid ${C.border}`,
                  fontFamily: "'Inter', sans-serif",
                  fontSize: '0.9rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Submit an Enquiry
              </button>
            </div>
          </div>
        </section>

        {/* ══ SERVICE CATALOGUE ═══════════════════════════════ */}
        <section style={{ marginTop: 'clamp(3rem, 7vw, 5rem)' }}>
          <div style={wrap()}>
            <div style={{ marginBottom: '2rem', maxWidth: 720 }}>
              <span style={{ ...label, color: C.cyan }}>Catalogue</span>
              <h2 style={{ ...sectionTitle, color: YALE }}>What you can request on Nhaav.</h2>
              <p style={{ ...body, color: YALE }}>
                Every listed service is delivered by providers whose businesses have been reviewed before they appear
                in the catalogue.
              </p>
            </div>

            {loading && (
              <div style={{ ...body, color: YALE, padding: '1.5rem 0' }}>Loading service catalogue…</div>
            )}

            {!loading && error && (
              <div
                style={{
                  background: MOONSTONE_SURFACE,
                  border: `1px solid ${C.border}`,
                  borderRadius: 18,
                  padding: '1.25rem 1.5rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '1rem',
                  flexWrap: 'wrap',
                }}
              >
                <p style={{ ...body, color: YALE }}>{error}</p>
                <button
                  type="button"
                  onClick={() => void reload()}
                  style={{
                    padding: '10px 18px',
                    borderRadius: 10,
                    border: 'none',
                    background: YALE,
                    color: CHIFFON,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Retry
                </button>
              </div>
            )}

            {!loading && !error && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 'clamp(1.25rem, 3vw, 2rem)' }}>
                {groups.map(group => (
                  <article
                    key={group.category}
                    style={{
                      background: MOONSTONE_SURFACE,
                      border: `1px solid ${C.border}`,
                      borderRadius: 24,
                      padding: 'clamp(1.5rem, 3vw, 2rem)',
                      display: 'flex',
                      flexDirection: 'column',
                      boxShadow: '0 10px 30px rgba(13,59,102,0.06)',
                    }}
                  >
                    <div
                      style={{
                        display: 'inline-flex',
                        width: 44,
                        height: 44,
                        borderRadius: 14,
                        background: C.brandSoft,
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginBottom: '1.1rem',
                      }}
                    >
                      <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: '1.35rem', color: YALE }}>
                        {CATEGORY_ICONS[group.category] ?? 'build'}
                      </span>
                    </div>

                    <h3 style={{ ...manrope, fontWeight: 800, fontSize: '1.1rem', letterSpacing: '-0.01em', color: YALE, margin: '0 0 0.35rem' }}>
                      {group.category}
                    </h3>
                    <div style={{ ...inter, fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.cyan, marginBottom: '1rem' }}>
                      {group.subServices.length} services
                    </div>

                    <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                      {group.subServices.map(s => (
                        <li key={s} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: '0.86rem', lineHeight: 1.6, color: YALE }}>
                          <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: '1rem', color: YALE, flexShrink: 0, marginTop: 2 }}>
                            check_circle
                          </span>
                          <span>{s}</span>
                        </li>
                      ))}
                    </ul>
                  </article>
                ))}
              </div>
            )}

            <p style={{ ...body, fontSize: '0.8rem', color: YALE, marginTop: '1.5rem', maxWidth: 820 }}>
              Need a service that is not listed? Submit a procurement enquiry describing the scope and our team will
              match it against providers in the network.
            </p>
          </div>
        </section>

        {/* ══ SERVICE PROVIDER CATEGORIES ═════════════════════
            The main categories verified providers are listed under. Driven by
            the live catalogue so the names match the provider taxonomy. */}
        <section style={{ marginTop: 'clamp(3rem, 7vw, 5rem)' }}>
          <div style={wrap()}>
            <div style={{ marginBottom: '2rem', maxWidth: 720 }}>
              <h2 style={{ ...sectionTitle, color: YALE }}>Service Provider Categories</h2>
              <p style={{ ...body, color: YALE }}>
                The main business categories verified service providers are listed under. Open a category in the
                catalogue above to see the individual services it covers.
              </p>
            </div>

            {groups.length === 0 ? (
              <div style={{ ...body, color: YALE, padding: '1.5rem 0' }}>
                {loading
                  ? 'Loading service provider categories…'
                  : 'Service provider categories are temporarily unavailable.'}
              </div>
            ) : (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                  gap: 'clamp(0.85rem, 2vw, 1.25rem)',
                }}
              >
                {groups.map(group => (
                  <div
                    key={group.category}
                    style={{
                      background: MOONSTONE_SURFACE,
                      border: `1px solid ${C.border}`,
                      borderRadius: 18,
                      padding: 'clamp(1.1rem, 2.5vw, 1.5rem)',
                      boxShadow: '0 8px 24px rgba(13,59,102,0.05)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                    }}
                  >
                    <span
                      style={{
                        width: 38,
                        height: 38,
                        borderRadius: 12,
                        background: C.brandSoft,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: '1.15rem', color: YALE }}>
                        {CATEGORY_ICONS[group.category] ?? 'build'}
                      </span>
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <h3
                        style={{
                          ...manrope,
                          fontWeight: 800,
                          fontSize: 'clamp(0.98rem, 1.7vw, 1.05rem)',
                          letterSpacing: '-0.01em',
                          color: YALE,
                          margin: '0 0 0.2rem',
                        }}
                      >
                        {group.category}
                      </h3>
                      <span
                        style={{
                          ...inter,
                          fontSize: '0.68rem',
                          fontWeight: 700,
                          letterSpacing: '0.1em',
                          textTransform: 'uppercase',
                          color: C.cyan,
                        }}
                      >
                        {group.subServices.length} services
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* ══ SUPPLY CATEGORIES ═══════════════════════════════ */}
        <section style={{ marginTop: 'clamp(3rem, 7vw, 5rem)' }}>
          <div style={wrap()}>
            <div style={{ marginBottom: '2rem', maxWidth: 720 }}>
              <h2 style={{ ...sectionTitle, color: YALE }}>Supply Categories</h2>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: 'clamp(0.85rem, 2vw, 1.25rem)',
              }}
            >
              {SUPPLY_CATEGORIES.map(name => (
                <div
                  key={name}
                  style={{
                    background: MOONSTONE_SURFACE,
                    border: `1px solid ${C.border}`,
                    borderRadius: 18,
                    padding: 'clamp(1.1rem, 2.5vw, 1.5rem)',
                    boxShadow: '0 8px 24px rgba(13,59,102,0.05)',
                  }}
                >
                  <h3
                    style={{
                      ...manrope,
                      fontWeight: 800,
                      fontSize: 'clamp(1rem, 1.7vw, 1.08rem)',
                      letterSpacing: '-0.01em',
                      color: YALE,
                      margin: 0,
                    }}
                  >
                    {name}
                  </h3>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ══ HOW IT WORKS ════════════════════════════════════ */}
        <section style={{ marginTop: 'clamp(3.5rem, 8vw, 6rem)' }}>
          <div style={wrap()}>
            <div style={{ background: YALE, borderRadius: 32, padding: 'clamp(1.75rem, 4vw, 3rem)', border: '1px solid rgba(255, 243, 109,0.15)' }}>
              <div style={{ maxWidth: 620, marginBottom: '2rem' }}>
                <span style={{ ...label, color: CHIFFON }}>How it works</span>
                <h2 style={{ ...sectionTitle, color: CHIFFON }}>From requirement to accepted offer.</h2>
              </div>

              <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 'clamp(1.25rem, 3vw, 2rem)' }}>
                {STEPS.map((s, i) => (
                  <li key={s.title}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '0.6rem' }}>
                      <span
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: '50%',
                          background: 'rgba(255, 243, 109,0.16)',
                          color: CHIFFON,
                          ...manrope,
                          fontSize: '0.8rem',
                          fontWeight: 800,
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}
                      >
                        {i + 1}
                      </span>
                      <span style={{ ...manrope, fontWeight: 700, fontSize: '0.95rem', color: CHIFFON }}>{s.title}</span>
                    </div>
                    <p style={{ ...body, fontSize: '0.86rem', color: CHIFFON }}>{s.text}</p>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>

        {/* ══ CLOSING CTA ═════════════════════════════════════ */}
        <section style={{ marginTop: 'clamp(3.5rem, 8vw, 6rem)' }}>
          <div style={wrap()}>
            <div
              style={{
                background: MOONSTONE_SURFACE,
                border: `1px solid ${C.border}`,
                borderRadius: 28,
                padding: 'clamp(1.75rem, 4vw, 3rem)',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                gap: 'clamp(1.5rem, 4vw, 3rem)',
                alignItems: 'center',
                boxShadow: '0 10px 30px rgba(13,59,102,0.06)',
              }}
            >
              <div>
                <span style={{ ...label, color: C.cyan }}>For service providers</span>
                <h2 style={{ ...sectionTitle, fontSize: 'clamp(1.4rem, 2.6vw, 1.9rem)', color: YALE }}>
                  List your services on Nhaav.
                </h2>
                <p style={{ ...body, fontSize: '0.9rem', color: YALE }}>
                  Publish the services you offer, the ports you cover, and receive procurement enquiries from
                  shipowners and managers directly.
                </p>
              </div>
              <div style={{ display: 'flex', gap: '0.85rem', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => navigate('/choose-role')}
                  style={{
                    padding: '14px 28px',
                    borderRadius: 14,
                    border: 'none',
                    background: YALE,
                    color: CHIFFON,
                    fontFamily: "'Inter', sans-serif",
                    fontSize: '0.9rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    transition: 'transform 0.15s ease, opacity 0.15s ease',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.opacity = '0.92'; }}
                  onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.opacity = '1'; }}
                >
                  List Your Business
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/pricing')}
                  style={{
                    padding: '14px 28px',
                    borderRadius: 14,
                    background: 'transparent',
                    color: YALE,
                    border: `1px solid ${C.border}`,
                    fontFamily: "'Inter', sans-serif",
                    fontSize: '0.9rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  View Pricing
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* ══ CONTACT ═════════════════════════════════════════ */}
        <ContactSection />
      </main>

      <FooterNav />
    </div>
  );
}
