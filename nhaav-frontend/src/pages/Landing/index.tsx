import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../hooks/useAuth';
import { HeroSection } from '../../components/blocks/hero-section-5';
import { BrandLogo } from '../../components/BrandLogo';
import { SupportModal } from '../../components/SupportModal';

const GRID_C = {
  light: 'radial-gradient(circle at 1px 1px, rgba(15,23,42,0.18) 1px, transparent 0)',
  dark: 'radial-gradient(circle at 1px 1px, rgba(148,163,184,0.28) 1px, transparent 0)',
};

const blur = (px = 20): React.CSSProperties => ({
  backdropFilter: `blur(${px}px)`,
  WebkitBackdropFilter: `blur(${px}px)`,
});

const manrope: React.CSSProperties = { fontFamily: "'Manrope', sans-serif" };
const inter:   React.CSSProperties = { fontFamily: "'Inter', sans-serif" };

/**
 * Moonstone Blue #4C9DB0 at ~32% over white, and the solid brand accent.
 * Card panels and icon chips use these instead of the neutral pale blue, so the
 * brand colour reads in the surfaces while Yale Blue text stays high-contrast.
 */
const MOONSTONE_SURFACE = '#62A9BA';
const MOONSTONE = '#4C9DB0';

/**
 * Footer navigation. Every entry resolves to a real surface of the app:
 * `to` is a route, and an entry without one opens a dialog instead (the
 * support popup / the demo booking modal). Nothing here is a placeholder
 * link, which is what the previous footer was full of.
 */
type FooterLink = { label: string; to?: string; action?: 'support' | 'demo' };

const FOOTER_COLUMNS: { title: string; links: FooterLink[] }[] = [
  {
    title: 'Marketplace',
    links: [
      { label: 'Find Suppliers',         to: '/marketplace/supplies' },
      { label: 'Find Service Providers', to: '/marketplace/repairs' },
      { label: 'Browse Listings',        to: '/marketplace' },
      { label: 'Submit an Enquiry',      to: '/create-request' },
    ],
  },
  {
    title: 'Account',
    links: [
      { label: 'Sign In',            to: '/login' },
      { label: 'Create an Account',  to: '/register' },
      { label: 'List Your Business', to: '/choose-role' },
      { label: 'Contact Support',    action: 'support' },
    ],
  },
  {
    title: 'Get Started',
    links: [
      { label: 'Schedule a Demo', action: 'demo' },
    ],
  },
];

/** Problem cards: the friction Nhaav removes. */
const PROBLEMS: { icon: string; title: string; body: string }[] = [
  {
    icon: 'travel_explore',
    title: 'Fragmented Business Discovery',
    body: 'Finding relevant suppliers and service providers across disconnected networks can take time and effort.',
  },
  {
    icon: 'visibility_off',
    title: 'Limited Business Visibility',
    body: 'Without consistent business information and verification processes, evaluating potential partners can be difficult.',
  },
  {
    icon: 'forum',
    title: 'Slow Communication',
    body: 'Procurement enquiries spread across emails, phone calls, and messaging platforms can make it harder to keep business discussions organized.',
  },
];

/**
 * Solution cards. Every entry maps to something the app actually does today:
 * marketplace listings, service provider profiles, request creation and the
 * verification review. Verification is described as a review of submitted
 * information — never as a guarantee of reliability or performance.
 */
const SOLUTIONS: { icon: string; title: string; body: string }[] = [
  {
    icon: 'storefront',
    title: 'Discover Suppliers',
    body: 'Explore supplier profiles and the offerings they present on the marketplace.',
  },
  {
    icon: 'handyman',
    title: 'Find Service Providers',
    body: 'Discover businesses offering relevant maritime services and connect with potential providers.',
  },
  {
    icon: 'inventory_2',
    title: 'Explore Business Listings',
    body: 'Review published listings and identify businesses that match your requirements.',
  },
  {
    icon: 'request_quote',
    title: 'Submit Procurement Enquiries',
    body: 'Use the available enquiry functionality to initiate business discussions with relevant providers.',
  },
  {
    icon: 'verified_user',
    title: 'Business Verification',
    body: 'Nhaav supports a review process for submitted business information and documents. Verification confirms that the checks we specify were completed — it does not guarantee a business’s reliability, quality or performance.',
  },
  {
    icon: 'hub',
    title: 'Centralized Discovery',
    body: 'Spend less time searching across disconnected sources by beginning your business discovery through one platform.',
  },
];

const TRUST_POINTS: string[] = [
  'Business profile and document review, where supported.',
  'Clear visibility into published business offerings.',
  'Direct procurement enquiries through available platform functionality.',
];

const STEPS: { title: string; body: string }[] = [
  { title: 'Create Your Account', body: 'Register on Nhaav using the appropriate account type.' },
  { title: 'Discover Businesses', body: 'Explore available supplier profiles, service providers, and published marketplace listings.' },
  { title: 'Evaluate Your Options', body: 'Review available business information and verification status where provided.' },
  { title: 'Initiate an Enquiry', body: 'Use the available enquiry functionality to connect with a potentially suitable business and discuss requirements directly.' },
];

export default function LandingPage() {
  const navigate = useNavigate();
  const { tokens: C, isDark } = useTheme();
  const { isAuthenticated } = useAuth();

  const [isDesktop, setIsDesktop] = React.useState(window.innerWidth >= 1024);
  const [viewportWidth, setViewportWidth] = React.useState(window.innerWidth);
  const [supportsBackdropFilter, setSupportsBackdropFilter] = React.useState(true);
  const [isDemoOpen, setIsDemoOpen] = React.useState(false);
  const [isSupportOpen, setIsSupportOpen] = React.useState(false);
  const [selectedDate, setSelectedDate] = React.useState<number>(18);
  const [selectedTime, setSelectedTime] = React.useState<string>('10:30 AM');
  const [name, setName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [company, setCompany] = React.useState('');
  const [isBooked, setIsBooked] = React.useState(false);

  // Handle responsive layout
  React.useEffect(() => {
    const handleResize = () => {
      setIsDesktop(window.innerWidth >= 1024);
      setViewportWidth(window.innerWidth);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Detect backdrop-filter support for glass-morphism fallback
  React.useEffect(() => {
    setSupportsBackdropFilter(CSS.supports?.('backdrop-filter', 'blur(1px)') ?? true);
  }, []);

  const glassCardStyle = React.useMemo<React.CSSProperties>(() => ({
    background: supportsBackdropFilter ? C.glassCardBg : C.bgCard,
    ...(supportsBackdropFilter ? blur(20) : {}),
    boxShadow: isDark ? '0 20px 40px rgba(76,157,176,0.07)' : '0 10px 30px rgba(0,0,0,0.05)',
    border: `1px solid ${C.border}`,
  }), [C.glassCardBg, C.bgCard, C.border, isDark, supportsBackdropFilter]);

  const timeSlots = ['09:00 AM', '10:30 AM', '01:00 PM', '02:30 PM', '04:00 PM', '05:30 PM'];

  // Responsive padding calculations
  const getHorizontalPadding = (): string => {
    if (viewportWidth < 640) return '1.5rem';
    if (viewportWidth < 768) return '2rem';
    return '2.5rem';
  };

  const getCardPadding = (): string => {
    return viewportWidth < 640 ? '1.5rem' : '2.5rem';
  };

  const handleNavigateDashboard = React.useCallback(() => navigate('/dashboard'), [navigate]);
  const handleNavigateChooseRole = React.useCallback(() => navigate('/choose-role'), [navigate]);

  const handleBookDemo = React.useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setIsBooked(true);
  }, [email]);

  const resetBooking = React.useCallback(() => {
    setIsBooked(false);
    setIsDemoOpen(false);
  }, []);

  // ── Landing demo video ────────────────────────────────────────────────
  // Deliberately not autoplaying: the file is a full product walkthrough and
  // starting it on scroll would both surprise the visitor and download it for
  // everyone. It loads metadata only until the visitor presses play.
  const demoVideoRef = React.useRef<HTMLVideoElement | null>(null);
  const [demoPlaying, setDemoPlaying] = React.useState(false);
  const [demoTime, setDemoTime] = React.useState(0);
  const [demoDuration, setDemoDuration] = React.useState(0);
  const [demoUnavailable, setDemoUnavailable] = React.useState(false);

  const toggleDemoPlayback = React.useCallback(() => {
    const video = demoVideoRef.current;
    if (!video) return;
    if (video.paused) {
      // play() rejects if the browser blocks it or the file cannot be decoded;
      // the fallback message below covers that instead of a silent no-op.
      void video.play().catch(() => setDemoUnavailable(true));
    } else {
      video.pause();
    }
  }, []);

  const stopDemoPlayback = React.useCallback(() => {
    const video = demoVideoRef.current;
    if (!video) return;
    video.pause();
    video.currentTime = 0;
    setDemoTime(0);
  }, []);

  const seekDemo = React.useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const video = demoVideoRef.current;
    if (!video) return;
    const next = Number(event.target.value);
    video.currentTime = next;
    setDemoTime(next);
  }, []);

  const formatDemoTime = (seconds: number): string => {
    if (!Number.isFinite(seconds) || seconds <= 0) return '0:00';
    const total = Math.floor(seconds);
    const mins = Math.floor(total / 60);
    const secs = total % 60;
    return `${mins}:${String(secs).padStart(2, '0')}`;
  };

  const demoControlStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    padding: '10px 18px',
    borderRadius: 12,
    border: '1px solid rgba(255, 243, 109,0.35)',
    background: '#FFF36D',
    color: '#0B2430',
    fontFamily: "'Inter', sans-serif",
    fontSize: '0.85rem',
    fontWeight: 700,
    cursor: 'pointer',
  };

  return (
    <div style={{ background: C.bg, color: C.text, ...inter, minHeight: '100vh', transition: 'background-color 0.3s ease, color 0.3s ease', position: 'relative' }}>

      {/* No theme toggle here: the public landing page is palette-fixed
          (Morning Dawn ground + Yale Blue panels) through BrandThemeProvider,
          so a light/dark switch would have nothing to act on. */}

      {/* ══ HERO (new HeroSection) ═══════════════════════════════ */}
      <HeroSection />

      <main style={{ paddingTop: 0 }}>

        {/* ══ PROBLEM ═════════════════════════════════════════════ */}
        <section id="problems" style={{ background: C.bg, padding: '6rem 0', position: 'relative', overflow: 'hidden', transition: 'background 0.3s ease' }}>
          <div style={{ maxWidth: 1200, margin: '0 auto', padding: `0 ${getHorizontalPadding()}`, position: 'relative' }}>
            <div style={{ maxWidth: 720, marginBottom: '3rem' }}>
              <span style={{ ...inter, display: 'block', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: C.cyan, marginBottom: '0.75rem' }}>
                The problem
              </span>
              <h2 style={{ ...manrope, fontWeight: 900, fontSize: 'clamp(1.8rem, 3.5vw, 2.8rem)', color: C.title, letterSpacing: '-0.03em', lineHeight: 1.12, marginBottom: '1rem' }}>
                Maritime Procurement Shouldn't Be This Fragmented.
              </h2>
              {/* Chiffon surface => solid Yale Blue ink. */}
              <p style={{ color: '#0B2430', fontSize: '0.95rem', lineHeight: 1.7 }}>
                Finding the right maritime business partner can involve scattered contacts, lengthy email chains, repeated phone calls, and inconsistent information. Nhaav brings business discovery into one organized marketplace.
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem' }}>
              {PROBLEMS.map(item => (
                <div key={item.title} style={{ background: MOONSTONE_SURFACE, border: `1px solid ${C.border}`, borderRadius: 24, padding: getCardPadding() }}>
                  <div style={{ display: 'inline-flex', padding: '0.7rem', borderRadius: 14, background: MOONSTONE, marginBottom: '1.25rem' }}>
                    <span className="material-symbols-outlined" aria-hidden="true" style={{ color: '#0B2430', fontSize: '1.6rem' }}>{item.icon}</span>
                  </div>
                  <h3 style={{ ...manrope, fontWeight: 700, fontSize: 'clamp(1.1rem, 2.2vw, 1.3rem)', color: C.title, marginBottom: '0.6rem' }}>{item.title}</h3>
                  <p style={{ color: '#0B2430', fontSize: '0.9rem', lineHeight: 1.7, margin: 0 }}>{item.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ══ SOLUTION (keeps #features so the nav anchor still resolves) ═ */}
        <section id="features" style={{ background: C.bg, padding: '6rem 0', position: 'relative', overflow: 'hidden', transition: 'background 0.3s ease' }}>
          <div style={{ maxWidth: 1200, margin: '0 auto', padding: `0 ${getHorizontalPadding()}`, position: 'relative' }}>
            <div style={{ maxWidth: 720, marginBottom: '3rem' }}>
              <span style={{ ...inter, display: 'block', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: C.cyan, marginBottom: '0.75rem' }}>
                The marketplace
              </span>
              <h2 style={{ ...manrope, fontWeight: 900, fontSize: 'clamp(1.8rem, 3.5vw, 2.8rem)', color: C.title, letterSpacing: '-0.03em', lineHeight: 1.12, marginBottom: '1rem' }}>
                One Marketplace. Better Business Connections.
              </h2>
              {/* Chiffon surface => solid Yale Blue ink. */}
              <p style={{ color: '#0B2430', fontSize: '0.95rem', lineHeight: 1.7 }}>
                Nhaav provides a centralized starting point for maritime businesses to discover suppliers, explore service offerings, and connect with potential partners.
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem' }}>
              {SOLUTIONS.map(item => (
                <div key={item.title} style={{ background: MOONSTONE_SURFACE, border: `1px solid ${C.border}`, borderRadius: 24, padding: getCardPadding(), display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'inline-flex', alignSelf: 'flex-start', padding: '0.7rem', borderRadius: 14, background: MOONSTONE, marginBottom: '1.25rem' }}>
                    <span className="material-symbols-outlined" aria-hidden="true" style={{ color: '#0B2430', fontSize: '1.6rem' }}>{item.icon}</span>
                  </div>
                  <h3 style={{ ...manrope, fontWeight: 700, fontSize: 'clamp(1.1rem, 2.2vw, 1.3rem)', color: C.title, marginBottom: '0.6rem' }}>{item.title}</h3>
                  <p style={{ color: '#0B2430', fontSize: '0.9rem', lineHeight: 1.7, margin: 0 }}>{item.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ══ DEMO VIDEO (sits directly above the trust story) ══════ */}
        <section id="demo-video" style={{ background: C.bg, padding: '0 0 6rem', transition: 'background 0.3s ease' }}>
          <div style={{ maxWidth: 1200, margin: '0 auto', padding: `0 ${getHorizontalPadding()}` }}>
            <div style={{ background: '#0D3B66', borderRadius: 32, padding: viewportWidth < 640 ? '1.25rem' : 'clamp(1.5rem, 3vw, 2.5rem)', border: '1px solid rgba(255, 243, 109,0.15)' }}>
              <div style={{ marginBottom: '1.5rem' }}>
                <BrandLogo
                  height={viewportWidth < 640 ? 26 : 32}
                  variant="light"
                  style={{ marginBottom: '1.25rem' }}
                />
                <span style={{ ...inter, display: 'block', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#FFF36D', marginBottom: '0.75rem' }}>
                  Product demo
                </span>
                <h2 style={{ ...manrope, fontWeight: 900, fontSize: 'clamp(1.6rem, 3.2vw, 2.2rem)', letterSpacing: '-0.03em', lineHeight: 1.15, color: '#FFF36D', margin: '0 0 0.75rem' }}>
                  Watch demo video
                </h2>
                <p style={{ color: '#FFF36D', fontSize: '0.95rem', lineHeight: 1.75, margin: 0, maxWidth: 680 }}>
                  A short walkthrough of the marketplace: how buyers find suppliers and service providers, and how vendors present their business.
                </p>
              </div>

              <div style={{ position: 'relative', borderRadius: 20, overflow: 'hidden', background: '#08294A', border: '1px solid rgba(255, 243, 109,0.18)' }}>
                {/* The recording carries its own letterbox: a black band at the top and
                    another at the bottom holding a source watermark. The frame is
                    848x476 with the screen occupying 848x360 of it, so the box uses
                    that ratio and `cover` crops both bands away. */}
                <video
                  ref={demoVideoRef}
                  src="/demo/nhaav-product-demo.mp4"
                  preload="metadata"
                  playsInline
                  onClick={toggleDemoPlayback}
                  onPlay={() => setDemoPlaying(true)}
                  onPause={() => setDemoPlaying(false)}
                  onEnded={() => setDemoPlaying(false)}
                  onTimeUpdate={event => setDemoTime(event.currentTarget.currentTime)}
                  onLoadedMetadata={event => setDemoDuration(event.currentTarget.duration)}
                  onError={() => setDemoUnavailable(true)}
                  aria-label="Nhaav product demo video"
                  style={{ width: '100%', display: 'block', aspectRatio: '848 / 360', objectFit: 'cover', objectPosition: 'center', background: '#08294A', cursor: 'pointer' }}
                >
                  Your browser does not support embedded video.
                </video>
              </div>

              {demoUnavailable ? (
                <p role="status" style={{ color: '#FFF36D', fontSize: '0.85rem', margin: '0.9rem 0 0' }}>
                  The demo video could not be loaded in this browser.
                </p>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.75rem', marginTop: '1rem' }}>
                  <button
                    type="button"
                    onClick={toggleDemoPlayback}
                    aria-label={demoPlaying ? 'Pause demo video' : 'Play demo video'}
                    style={demoControlStyle}
                  >
                    <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: '1.15rem' }}>
                      {demoPlaying ? 'pause' : 'play_arrow'}
                    </span>
                    {demoPlaying ? 'Pause' : 'Play'}
                  </button>

                  <button
                    type="button"
                    onClick={stopDemoPlayback}
                    aria-label="Stop demo video and rewind to the start"
                    style={demoControlStyle}
                  >
                    <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: '1.15rem' }}>stop</span>
                    Stop
                  </button>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: '1 1 220px', minWidth: 200 }}>
                    <input
                      type="range"
                      min={0}
                      max={demoDuration > 0 ? demoDuration : 0}
                      step={0.1}
                      value={Math.min(demoTime, demoDuration > 0 ? demoDuration : 0)}
                      onChange={seekDemo}
                      disabled={demoDuration <= 0}
                      aria-label="Demo video position"
                      style={{ width: '100%', accentColor: '#FFF36D', cursor: demoDuration > 0 ? 'pointer' : 'default' }}
                    />
                    <span style={{ ...inter, color: '#FFF36D', fontSize: '0.8rem', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                      {formatDemoTime(demoTime)} / {formatDemoTime(demoDuration)}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* ══ TRUST (the full About story lives at /about) ═══════════ */}
        <section id="about" style={{ background: C.bg, padding: '4rem 0 6rem', transition: 'background 0.3s ease' }}>
          <div style={{ maxWidth: 1200, margin: '0 auto', padding: `0 ${getHorizontalPadding()}` }}>
            <div style={{ background: '#0D3B66', borderRadius: 36, padding: 'clamp(2rem, 5vw, 4rem)', border: '1px solid rgba(255, 243, 109,0.15)' }}>
              {/* min(100%, 300px): the 300px floor alone overflowed the panel's
                  inner width on phones. */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: 'clamp(1.75rem, 4vw, 3rem)', alignItems: 'start' }}>
                <div>
                  <span style={{ ...inter, display: 'block', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#FFF36D', marginBottom: '0.75rem' }}>
                    Trust and transparency
                  </span>
                  {/* Yale panel => solid Morning Dawn ink. */}
                  <h2 style={{ ...manrope, fontWeight: 900, fontSize: 'clamp(1.7rem, 3.6vw, 2.5rem)', letterSpacing: '-0.03em', lineHeight: 1.12, color: '#FFF36D', marginBottom: '1rem' }}>
                    Build Business Connections with Greater Confidence.
                  </h2>
                  <p style={{ color: '#FFF36D', fontSize: '0.95rem', lineHeight: 1.75, margin: 0 }}>
                    Nhaav is designed to make maritime business discovery more organized and transparent. Business profiles, submitted verification information, and marketplace listings help users evaluate potential partners before beginning a commercial relationship.
                  </p>
                </div>

                <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {TRUST_POINTS.map(point => (
                    <li key={point} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', color: '#FFF36D', fontSize: '0.92rem', lineHeight: 1.65 }}>
                      <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: '1.15rem', color: '#FFF36D', flexShrink: 0, marginTop: 2 }}>check_circle</span>
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* ══ HOW IT WORKS ════════════════════════════════════════ */}
        <section style={{ background: C.bg, padding: '0 0 6rem', transition: 'background 0.3s ease' }}>
          <div style={{ maxWidth: 1200, margin: '0 auto', padding: `0 ${getHorizontalPadding()}` }}>
            <div style={{ maxWidth: 720, marginBottom: '3rem' }}>
              <span style={{ ...inter, display: 'block', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: C.cyan, marginBottom: '0.75rem' }}>
                How it works
              </span>
              <h2 style={{ ...manrope, fontWeight: 900, fontSize: 'clamp(1.8rem, 3.5vw, 2.8rem)', color: C.title, letterSpacing: '-0.03em', lineHeight: 1.12, margin: 0 }}>
                From Discovery to Business Enquiry.
              </h2>
            </div>

            <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.25rem' }}>
              {STEPS.map((step, i) => (
                <li key={step.title} style={{ background: MOONSTONE_SURFACE, border: `1px solid ${C.border}`, borderRadius: 24, padding: getCardPadding() }}>
                  {/* Solid moonstone badge; the digit is sized to large-bold text so
                      Yale Blue ink on moonstone clears the large-text contrast bar. */}
                  <span style={{ ...manrope, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, borderRadius: '50%', background: MOONSTONE, color: '#0B2430', fontSize: '1.2rem', fontWeight: 800, lineHeight: 1, marginBottom: '1.1rem' }}>
                    {i + 1}
                  </span>
                  <h3 style={{ ...manrope, fontWeight: 700, fontSize: '1.05rem', color: C.title, marginBottom: '0.5rem' }}>{step.title}</h3>
                  <p style={{ color: '#0B2430', fontSize: '0.88rem', lineHeight: 1.7, margin: 0 }}>{step.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ══ FOR SUPPLIERS ═══════════════════════════════════════ */}
        <section style={{ background: C.bg, padding: '0 0 6rem', transition: 'background 0.3s ease' }}>
          <div style={{ maxWidth: 1200, margin: '0 auto', padding: `0 ${getHorizontalPadding()}` }}>
            <div style={{ background: MOONSTONE_SURFACE, border: `1px solid ${C.border}`, borderRadius: 32, padding: 'clamp(1.75rem, 4vw, 3rem)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 'clamp(1.5rem, 4vw, 3rem)', alignItems: 'center', boxShadow: '0 10px 30px rgba(13,59,102,0.06)' }}>
              <div>
                <span style={{ ...inter, display: 'block', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: C.cyan, marginBottom: '0.75rem' }}>
                  For suppliers and service providers
                </span>
                <h2 style={{ ...manrope, fontWeight: 900, fontSize: 'clamp(1.6rem, 3.2vw, 2.2rem)', letterSpacing: '-0.03em', lineHeight: 1.15, color: C.title, marginBottom: '1rem' }}>
                  Put Your Business in Front of the Right Audience.
                </h2>
                <p style={{ color: '#0B2430', fontSize: '0.95rem', lineHeight: 1.75, margin: 0 }}>
                  Are you a maritime supplier or service provider? Create your business presence on Nhaav, showcase your offerings through marketplace listings, and help potential clients discover your business.
                </p>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <button
                  type="button"
                  onClick={handleNavigateChooseRole}
                  style={{ padding: '14px 30px', borderRadius: 14, border: 'none', background: '#0D3B66', color: '#FFF36D', fontFamily: "'Inter', sans-serif", fontSize: '0.9rem', fontWeight: 700, cursor: 'pointer', transition: 'transform 0.15s ease, opacity 0.15s ease' }}
                  onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.opacity = '0.92'; }}
                  onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.opacity = '1'; }}
                >
                  Join as a Supplier or Service Provider
                </button>
              </div>
            </div>
          </div>
        </section>
        {/* ══ CTA ═════════════════════════════════════════════════ */}
        {/* Band ground is the page ground (Morning Dawn under the brand theme)
            so the Yale Blue CTA panel floats on chiffon rather than on a wash. */}
        <section style={{ background: C.bg, padding: '5rem 0', overflow: 'hidden', transition: 'background 0.3s ease' }}>
          <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 2.5rem' }}>
            <div style={{
              background: "#0D3B66",
              borderRadius: 40,
              padding: "clamp(2.5rem, 5vw, 5rem)",
              position: "relative",
              overflow: "hidden",
              border: "1px solid rgba(255, 243, 109,0.15)",
            }}>
              <div style={{ position: "relative", zIndex: 2, maxWidth: 640 }}>
                <h2 style={{ ...manrope, fontWeight: 900, fontSize: "clamp(2.4rem, 5.5vw, 4rem)", color: "#FFF36D", letterSpacing: "-0.04em", lineHeight: 1.05, marginBottom: "1.25rem" }}>
                  Your Next Maritime Business Connection{" "}
                  <span style={{ color: "#FFF36D" }}>Starts Here.</span>
                </h2>
                {/* Yale panel => solid Morning Dawn ink, never a wash. */}
                <p style={{ color: "#FFF36D", fontSize: "1rem", lineHeight: 1.75, marginBottom: "2.5rem" }}>
                  Discover suppliers, explore maritime services, and bring your procurement requirements to Nhaav.
                </p>
                <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
                  <button onClick={() => navigate('/marketplace')} style={{ padding: "14px 32px", background: "#FFF36D", color: "#0D3B66", fontWeight: 700, fontSize: "0.9rem", border: "none", borderRadius: 14, cursor: "pointer", boxShadow: "0 8px 20px rgba(0,0,0,0.25)" }}>
                    Explore Marketplace
                  </button>
                  <button onClick={() => navigate('/register')} style={{ padding: "14px 32px", background: "transparent", color: "#FFF36D", fontWeight: 700, fontSize: "0.9rem", borderRadius: 14, cursor: "pointer", border: "2px solid rgba(255, 243, 109,0.45)" }}>
                    Create an Account
                  </button>
                  {/* Opens the existing demo-booking modal below, rather than a
                      third destination. */}
                  <button onClick={() => setIsDemoOpen(true)} style={{ padding: "14px 32px", background: "transparent", color: "#FFF36D", fontWeight: 700, fontSize: "0.9rem", borderRadius: 14, cursor: "pointer", border: "2px solid rgba(255, 243, 109,0.45)" }}>
                    Schedule a Demo
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

      </main>

      {/* ══ DEMO BOOKING MODAL ═════════════════════════════════ */}
      {isDemoOpen && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: isDark ? 'rgba(13, 59, 102, 0.55)' : 'rgba(15, 23, 42, 0.55)',
          ...blur(12),
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '1.5rem',
        }}>
          <div style={{
            background: C.modalBg,
            color: C.modalText,
            borderRadius: 24,
            width: '100%',
            maxWidth: 780,
            maxHeight: '90vh',
            overflowY: 'auto',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
            position: 'relative',
            padding: '2.5rem',
            border: `1px solid ${C.border}`,
            ...inter,
          }}>
            <button
              onClick={resetBooking}
              style={{
                position: 'absolute', top: 20, right: 20,
                background: isDark ? '#F2E5B8' : '#f5f6f8', border: 'none', borderRadius: '50%',
                width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', color: C.modalSubtext, transition: 'all 0.2s ease',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = isDark ? '#EDDCA6' : '#ebedf0'; e.currentTarget.style.color = C.modalText; }}
              onMouseLeave={e => { e.currentTarget.style.background = isDark ? '#F2E5B8' : '#f5f6f8'; e.currentTarget.style.color = C.modalSubtext; }}
            >
              <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: '1.25rem' }}>close</span>
            </button>

            {isBooked ? (
              <div style={{ textAlign: 'center', padding: '2rem 1rem' }}>
                <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--color-success-tint)', color: 'var(--color-success-text)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1.25rem' }}>
                  <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: '2.5rem' }}>check_circle</span>
                </div>
                <h3 style={{ ...manrope, fontWeight: 800, fontSize: '1.75rem', color: C.modalText, marginBottom: '0.5rem' }}>Demo Scheduled!</h3>
                <p style={{ color: C.modalSubtext, fontSize: '0.95rem', lineHeight: 1.6, maxWidth: 460, margin: '0 auto 1.75rem' }}>
                  Your live platform walk-through is confirmed for <strong>August {selectedDate}, 2026 at {selectedTime}</strong>. We've sent a calendar invite and video link to <strong>{email}</strong>.
                </p>
                <button onClick={resetBooking} style={{ padding: '12px 32px', background: C.cyan, color: C.onBrand, fontWeight: 700, borderRadius: 12, border: 'none', cursor: 'pointer' }}>Done</button>
              </div>
            ) : (
              <div>
                <div style={{ marginBottom: '1.75rem' }}>
                  <span style={{ display: 'inline-block', padding: '4px 12px', borderRadius: 999, background: C.cyanDim, color: C.cyan, fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>Live Product Walkthrough</span>
                  <h3 style={{ ...manrope, fontWeight: 800, fontSize: '1.75rem', color: C.modalText, margin: 0 }}>Schedule a Demo</h3>
                  <p style={{ color: C.modalSubtext, fontSize: '0.9rem', marginTop: 4 }}>Select an available date and time slot for a personalized session with a Nhaav logistics specialist.</p>
                </div>

                <form onSubmit={handleBookDemo}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '2rem' }}>
                    <div style={{ background: '#F2E5B8', borderRadius: 16, padding: '1.25rem', border: `1px solid ${C.border}` }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                        <span style={{ ...manrope, fontWeight: 700, fontSize: '0.95rem', color: C.modalText }}>August 2026</span>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button type="button" style={{ background: isDark ? '#FFFCF2' : '#ffffff', border: `1px solid ${C.border}`, borderRadius: 6, width: 28, height: 28, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: '1rem', color: C.modalSubtext }}>chevron_left</span>
                          </button>
                          <button type="button" style={{ background: isDark ? '#FFFCF2' : '#ffffff', border: `1px solid ${C.border}`, borderRadius: 6, width: 28, height: 28, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: '1rem', color: C.modalSubtext }}>chevron_right</span>
                          </button>
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, textAlign: 'center', marginBottom: 8 }}>
                        {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => (
                          <span key={d} style={{ fontSize: '0.7rem', fontWeight: 700, color: C.faint }}>{d}</span>
                        ))}
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: '1.5rem' }}>
                        {Array.from({ length: 6 }).map((_, i) => (<div key={`empty-${i}`} />))}
                        {Array.from({ length: 31 }).map((_, i) => {
                          const dayNum = i + 1;
                          const isSelected = selectedDate === dayNum;
                          const isPast = dayNum < 5;
                          return (
                            <button key={dayNum} type="button" disabled={isPast} onClick={() => setSelectedDate(dayNum)}
                              style={{
                                width: '100%', aspectRatio: '1', borderRadius: 10,
                                border: 'none',
                                background: isSelected ? C.cyan : isPast ? 'transparent' : (isDark ? '#FFFCF2' : '#ffffff'),
                                color: isSelected ? '#ffffff' : isPast ? C.faint : C.modalText,
                                fontWeight: isSelected ? 700 : 500, fontSize: '0.8rem',
                                cursor: isPast ? 'not-allowed' : 'pointer',
                                boxShadow: isSelected ? `0 4px 12px ${C.cyanDim}` : isPast ? 'none' : '0 1px 2px rgba(0,0,0,0.05)',
                                transition: 'all 0.15s ease',
                              }}
                            >{dayNum}</button>
                          );
                        })}
                      </div>

                      <div>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', fontWeight: 700, color: C.modalSubtext, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: '0.9rem', color: C.cyan }}>schedule</span>
                          Select Timing
                        </label>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
                          {timeSlots.map(slot => {
                            const isTimeSelected = selectedTime === slot;
                            return (
                              <button key={slot} type="button" onClick={() => setSelectedTime(slot)}
                                style={{
                                  padding: '8px 10px', borderRadius: 8,
                                  border: isTimeSelected ? `1.5px solid ${C.cyan}` : `1px solid ${C.border}`,
                                  background: isTimeSelected ? C.cyanDim : (isDark ? '#FFFCF2' : '#ffffff'),
                                  color: isTimeSelected ? C.cyan : C.modalText,
                                  fontWeight: isTimeSelected ? 700 : 500, fontSize: '0.75rem',
                                  cursor: 'pointer', transition: 'all 0.15s ease',
                                }}
                              >{slot}</button>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                      <div>
                        <div style={{ background: isDark ? '#F2E5B8' : '#f5f6f8', borderRadius: 12, padding: '1rem', marginBottom: '1.25rem', borderLeft: `4px solid ${C.cyan}` }}>
                          <div style={{ fontSize: '0.75rem', color: C.modalSubtext, fontWeight: 600 }}>Selected Appointment</div>
                          <div style={{ ...manrope, fontWeight: 800, fontSize: '0.95rem', color: C.modalText, marginTop: 2 }}>August {selectedDate}, 2026 at {selectedTime}</div>
                          <div style={{ fontSize: '0.75rem', color: C.cyan, fontWeight: 600, marginTop: 4 }}>30 Min Screen Share & Q&A</div>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                          <div>
                            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: C.modalText, marginBottom: 4 }}>Full Name *</label>
                            <input type="text" required placeholder="e.g. Captain James Vance" value={name} onChange={e => setName(e.target.value)}
                              style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: `1px solid ${C.modalInputBorder}`, background: C.modalInputBg, color: C.modalText, fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box' }} />
                          </div>
                          <div>
                            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: C.modalText, marginBottom: 4 }}>Work Email *</label>
                            <input type="email" required placeholder="james@maritimefleet.com" value={email} onChange={e => setEmail(e.target.value)}
                              style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: `1px solid ${C.modalInputBorder}`, background: C.modalInputBg, color: C.modalText, fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box' }} />
                          </div>
                          <div>
                            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: C.modalText, marginBottom: 4 }}>Company / Organization</label>
                            <input type="text" placeholder="e.g. Pacific Lines Ltd." value={company} onChange={e => setCompany(e.target.value)}
                              style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: `1px solid ${C.modalInputBorder}`, background: C.modalInputBg, color: C.modalText, fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box' }} />
                          </div>
                        </div>
                      </div>

                      <div style={{ marginTop: '1.5rem' }}>                          <button type="submit"
                          style={{ width: '100%', padding: '14px', borderRadius: 12, background: C.cyan, color: C.onBrand, fontWeight: 700, fontSize: '0.9rem', border: 'none', cursor: 'pointer', boxShadow: `0 8px 20px ${C.cyanDim}`, transition: 'opacity 0.2s ease' }}
                          onMouseEnter={e => (e.currentTarget.style.opacity = '0.9')}
                          onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
                        >Confirm & Schedule Demo</button>
                      </div>
                    </div>
                  </div>
                </form>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══ FOOTER ══════════════════════════════════════════════ */}
      <footer style={{ background: "#0D3B66", borderTop: "1px solid rgba(255, 243, 109,0.15)", padding: "4.5rem 0" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 2.5rem" }}>
          {/* Four columns only where there is room: at phone width the fixed
              track widths overflowed the page and made it scroll sideways. */}
          <div style={{ display: "grid", gridTemplateColumns: viewportWidth < 900 ? "1fr" : "1.4fr 1fr 1fr 1fr", gap: viewportWidth < 900 ? "2.25rem" : "3rem" }}>
            <div>
              {/* The footer is permanently navy, so the reversed artwork is used. */}
              <BrandLogo height={32} variant="light" />
              {/* Brand promise, immediately under the mark: one bold line that
                  says what Nhaav is, then a quieter line that says what you do
                  with it. */}
              <p style={{ ...manrope, marginTop: "1.35rem", maxWidth: 290, color: "#FFF36D", fontSize: "0.95rem", fontWeight: 700, lineHeight: 1.45, letterSpacing: "-0.01em" }}>
                Your maritime procurement and services network.
              </p>
              <p style={{ ...inter, marginTop: "0.6rem", maxWidth: 290, color: "#FFF36D", fontSize: "0.85rem", lineHeight: 1.7 }}>
                Discover suppliers, connect with maritime service providers, and simplify procurement enquiries.
              </p>
            </div>
            {FOOTER_COLUMNS.map(col => (
              <div key={col.title}>
                <div style={{ ...manrope, fontWeight: 700, fontSize: "0.8rem", letterSpacing: "0.12em", textTransform: "uppercase", color: "#FFF36D", marginBottom: "1.5rem" }}>{col.title}</div>
                <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "0.85rem" }}>
                  {col.links.map(link => {
                    const style: React.CSSProperties = {
                      color: "#FFF36D", fontSize: "0.85rem", textDecoration: "none",
                      transition: "color 0.15s ease", background: "none", border: "none", padding: 0,
                      fontFamily: "inherit", textAlign: "left", cursor: "pointer",
                    };
                    const hoverOn  = (e: React.MouseEvent<HTMLElement>) => (e.currentTarget.style.color = "#FFF36D");
                    const hoverOff = (e: React.MouseEvent<HTMLElement>) => (e.currentTarget.style.color = "#FFF36D");
                    return (
                      <li key={link.label}>
                        {link.to ? (
                          <Link to={link.to} style={style} onMouseEnter={hoverOn} onMouseLeave={hoverOff}>{link.label}</Link>
                        ) : (
                          <button type="button" style={style} onMouseEnter={hoverOn} onMouseLeave={hoverOff}
                            onClick={() => (link.action === 'support' ? setIsSupportOpen(true) : setIsDemoOpen(true))}
                          >{link.label}</button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </footer>

      {/* "Contact Support" opens the same popup the app-wide footer uses. */}
      <SupportModal isOpen={isSupportOpen} onClose={() => setIsSupportOpen(false)} />

    </div>
  );
}
