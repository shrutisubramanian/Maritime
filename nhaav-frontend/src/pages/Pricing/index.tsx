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
/** Moonstone Blue #4C9DB0 at ~32% over white — the switcher surface. */
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

const Check: React.FC<{ color: string }> = ({ color }) => (
  <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: '1.15rem', color, flexShrink: 0, marginTop: 2 }}>
    check_circle
  </span>
);

type PlanProps = {
  name: string;
  price: string;
  /** Rendered small beside the amount, e.g. "+ GST". */
  tax?: string;
  period: string;
  note: string;
  features: string[];
  cta: string;
  onSelect: () => void;
  featured?: boolean;
};

const PlanCard: React.FC<PlanProps> = ({ name, price, tax, period, note, features, cta, onSelect, featured }) => {
  const { tokens: C } = useTheme();
  // Strict brand pairing: Yale Blue ink on chiffon, chiffon ink on Yale.
  const inkOnPanel = featured ? CHIFFON : YALE;
  const softInk = featured ? CHIFFON : YALE;
  const hairline = featured ? 'rgba(255, 243, 109,0.22)' : C.border;

  return (
    <div
      style={{
        background: featured ? YALE : C.bgCard,
        border: `1px solid ${featured ? 'rgba(255, 243, 109,0.18)' : C.border}`,
        borderRadius: 28,
        padding: 'clamp(1.75rem, 3vw, 2.5rem)',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        boxShadow: featured ? '0 24px 48px rgba(13,59,102,0.20)' : '0 10px 30px rgba(13,59,102,0.06)',
        ...inter,
      }}
    >
      {featured && (
        <span
          style={{
            position: 'absolute',
            top: '-0.75rem',
            right: '1.75rem',
            padding: '6px 14px',
            borderRadius: 999,
            background: C.brandSoft,
            color: '#0B2430',
            fontSize: '0.62rem',
            fontWeight: 800,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
          }}
        >
          Best value
        </span>
      )}

      <h3 style={{ ...manrope, fontWeight: 800, fontSize: '1.2rem', letterSpacing: '-0.01em', color: inkOnPanel, margin: 0 }}>
        {name}
      </h3>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, margin: '1rem 0 0.25rem', flexWrap: 'wrap' }}>
        <span style={{ ...manrope, fontWeight: 900, fontSize: 'clamp(2rem, 4vw, 2.6rem)', letterSpacing: '-0.04em', color: inkOnPanel }}>
          {price}
        </span>
        {tax && (
          <span style={{ ...manrope, fontWeight: 800, fontSize: '1rem', color: inkOnPanel }}>{tax}</span>
        )}
        <span style={{ fontSize: '0.9rem', fontWeight: 600, color: softInk }}>{period}</span>
      </div>
      <p style={{ ...body, fontSize: '0.8rem', color: softInk, marginBottom: '1.5rem' }}>{note}</p>

      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '0.7rem', flex: 1 }}>
        {features.map(f => (
          <li key={f} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: '0.875rem', lineHeight: 1.6, color: inkOnPanel }}>
            <Check color={featured ? CHIFFON : YALE} />
            <span>{f}</span>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={onSelect}
        style={{
          marginTop: '2rem',
          width: '100%',
          padding: '14px 24px',
          borderRadius: 14,
          border: `1px solid ${featured ? 'transparent' : hairline}`,
          background: featured ? CHIFFON : YALE,
          color: featured ? YALE : CHIFFON,
          fontFamily: "'Inter', sans-serif",
          fontSize: '0.9rem',
          fontWeight: 700,
          cursor: 'pointer',
          transition: 'transform 0.15s ease, opacity 0.15s ease',
        }}
        onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.opacity = '0.92'; }}
        onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.opacity = '1'; }}
      >
        {cta}
      </button>
    </div>
  );
};

const PAYMENT_STEPS: { title: string; text: string }[] = [
  { title: 'Select your plan or listing', text: 'Choose a platform access plan or the marketplace listing fee.' },
  { title: 'Transfer the amount', text: 'Use the bank-transfer payment instructions provided by Nhaav.' },
  { title: 'Submit your payment details', text: 'Send the transaction reference (UTR), payment date, amount and receipt.' },
  { title: 'We review the payment', text: 'Our team verifies the transfer and updates the status in your account.' },
  { title: 'Access is activated', text: 'Your subscription or listing goes live once the applicable approvals are met.' },
];

const LISTING_STEPS: { title: string; text: string }[] = [
  { title: 'Create and submit your listing', text: 'Describe the services or supplies your business offers.' },
  { title: 'Submit your bank-transfer details', text: 'Include the payment receipt with your transaction reference.' },
  { title: 'Wait for verification and approval', text: 'Nhaav reviews the payment and any required listing approval.' },
  { title: 'Go live for your paid period', text: 'Once activated, your listing is visible on the marketplace for the visibility period you paid for.' },
];

/**
 * The plans mean different things to the two audiences: a client buys access
 * passes for their account, a vendor buys portal listing for their company.
 * Providers see no pass, session or validity wording at all.
 */
type Audience = 'clients' | 'providers';

const AUDIENCE_TABS: { id: Audience; tab: string }[] = [
  { id: 'clients', tab: 'Clients & Buyers' },
  { id: 'providers', tab: 'Supply & Service Providers' },
];

type PlanCopy = Omit<PlanProps, 'onSelect'>;

const PLANS_BY_AUDIENCE: Record<Audience, {
  eyebrow: string;
  title: string;
  blurb: string;
  fineprint: string;
  plans: PlanCopy[];
}> = {
  clients: {
    eyebrow: 'Platform Access Plans',
    title: 'Choose monthly flexibility or annual value.',
    blurb: 'Each plan provides account-level access passes for using Nhaav.',
    fineprint:
      'Access passes are account-specific and cannot be shared between separate accounts. A session ends when you ' +
      'log out or when the 6-hour session expires. Unused passes expire after their plan validity period — 6 months on the Monthly Plan and 12 months on the Annual Plan.',
    plans: [
      {
        name: 'Monthly Plan',
        price: '₹1,000',
        tax: '+ GST',
        period: '/ month',
        note: 'Flexible, shorter-term access for your account.',
        features: [
          '10 access passes',
          'Passes issued to your individual account',
          'Each unused pass remains valid for 6 months from issuance',
          'Each successful login that uses a pass starts a 6-hour access session',
          'Suitable for businesses that need flexible, shorter-term access',
        ],
        cta: 'Choose Monthly',
      },
      {
        name: 'Annual Plan',
        price: '₹10,000',
        tax: '+ GST',
        period: '/ year',
        note: 'For businesses planning regular use throughout the year.',
        features: [
          '100 access passes',
          'Passes issued to your individual account',
          'Each unused pass remains valid for 12 months from issuance',
          'Each successful login that uses a pass starts a 6-hour access session',
          'Suitable for businesses planning regular use of Nhaav throughout the year',
        ],
        cta: 'Choose Annual',
        featured: true,
      },
    ],
  },
  providers: {
    eyebrow: 'Listing visibility plans',
    title: 'One listing. One clear price.',
    blurb:
      'Suppliers and service providers pay for the marketplace visibility of a single listing — for one month or ' +
      'for twelve months.',
    fineprint:
      'Each fee covers ONE listing, with all of that listing’s details and offerings. Your listing goes live once ' +
      'your onboarding formalities are complete and Nhaav has confirmed your payment. GST is charged on top of the ' +
      'prices shown.',
    plans: [
      {
        name: 'One-Month Listing',
        price: '₹1,000',
        tax: '+ GST',
        period: '/ listing · 1 month',
        note: 'One listing, visible in the marketplace for one month.',
        features: [
          'One marketplace listing',
          'Marketplace visibility for 1 month from activation',
          'Begins after onboarding and payment verification',
        ],
        cta: 'Choose 1 Month',
      },
      {
        name: 'Twelve-Month Listing',
        price: '₹10,000',
        tax: '+ GST',
        period: '/ listing · 12 months',
        note: 'One listing, visible in the marketplace for a full year.',
        features: [
          'One marketplace listing',
          'Marketplace visibility for 12 months from activation',
          'Works out to 10 months at the one-month rate',
          'Begins after onboarding and payment verification',
        ],
        cta: 'Choose 12 Months',
        featured: true,
      },
    ],
  },
};

const SHARED_FAQ: { q: string; a: string }[] = [
  {
    q: 'How long does a marketplace listing remain visible?',
    a: 'For the visibility period you paid for — one month or twelve months from activation, subject to Nhaav’s listing policies.',
  },
  {
    q: 'What happens when my listing expires?',
    a: 'An expired listing is removed from the active marketplace. You can follow the available renewal or new-listing process to publish again.',
  },
  {
    q: 'Does payment guarantee that my listing will be published?',
    a: 'No. Payment verification and any required listing review must be completed before activation.',
  },
  {
    q: 'Does paying the listing fee guarantee customers or enquiries?',
    a: 'No. The fee covers the listing’s marketplace visibility period. It does not guarantee leads, sales, contracts, or enquiries.',
  },
  {
    q: 'How are payments verified?',
    a: 'You submit your bank-transfer reference, payment date, amount, and receipt. The Nhaav team reviews the details before confirming the payment.',
  },
];

const FAQ_BY_AUDIENCE: Record<Audience, { q: string; a: string }[]> = {
  clients: [
    {
      q: 'Are platform subscriptions and listing fees the same?',
      a: 'No. Platform access subscriptions provide access passes for your account. Marketplace listing fees are charged separately for each listing published by a supplier or service provider.',
    },
    {
      q: 'Can I share my access passes with my company or team?',
      a: 'No. Access passes belong to the account that purchased them and cannot be pooled or transferred to other accounts.',
    },
    ...SHARED_FAQ,
  ],
  providers: [
    {
      q: 'What does the listing fee cover?',
      a: 'One marketplace listing and its visibility period: ₹1,000 + GST for one month, or ₹10,000 + GST for twelve months. Platform access plans are separate.',
    },
    {
      q: 'Why is the twelve-month listing better value?',
      a: 'Twelve months at the one-month rate would cost ₹12,000 + GST. The twelve-month listing is ₹10,000 + GST for the same single listing.',
    },
    {
      q: 'When does my listing go live?',
      a: 'Once your onboarding formalities are complete and the Nhaav team has confirmed your payment.',
    },
    ...SHARED_FAQ,
  ],
};

const AudienceSwitcher: React.FC<{ value: Audience; onChange: (a: Audience) => void }> = ({ value, onChange }) => {
  const { tokens: C } = useTheme();
  return (
    <div
      role="tablist"
      aria-label="Pricing audience"
      style={{
        display: 'inline-flex',
        gap: 4,
        padding: 4,
        borderRadius: 12,
        background: MOONSTONE_SURFACE,
        border: `1px solid ${C.border}`,
        margin: '0 0 2rem',
        flexWrap: 'wrap',
      }}
    >
      {AUDIENCE_TABS.map(t => {
        const active = t.id === value;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.id)}
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
            {t.tab}
          </button>
        );
      })}
    </div>
  );
};

const StepList: React.FC<{ steps: { title: string; text: string }[]; ink: string; soft: string; accent: string }> = ({ steps, ink, soft, accent }) => (
  <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
    {steps.map((s, i) => (
      <li key={s.title} style={{ display: 'flex', gap: '0.9rem', alignItems: 'flex-start' }}>
        <span
          style={{
            width: 28,
            height: 28,
            borderRadius: '50%',
            background: 'rgba(13,59,102,0.10)',
            color: accent,
            ...manrope,
            fontSize: '0.8rem',
            fontWeight: 800,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            marginTop: 1,
          }}
        >
          {i + 1}
        </span>
        <div>
          <div style={{ ...manrope, fontWeight: 700, fontSize: '0.95rem', color: ink, marginBottom: 2 }}>{s.title}</div>
          <div style={{ ...body, fontSize: '0.86rem', color: soft }}>{s.text}</div>
        </div>
      </li>
    ))}
  </ol>
);

export default function PricingPage() {
  const navigate = useNavigate();
  const { tokens: C } = useTheme();
  const { isAuthenticated, user } = useAuth();

  // A vendor account is shown the listing plans; everyone else — including a
  // visitor who has not signed in yet — starts on the access-pass plans and can
  // switch. `chosen` stays null until a tab is actually clicked, so the restored
  // session still decides the default.
  const roleAudience: Audience =
    user?.role === 'provider' || user?.role === 'supplier' ? 'providers' : 'clients';
  const [chosen, setChosen] = React.useState<Audience | null>(null);
  const audience = chosen ?? roleAudience;
  const copy = PLANS_BY_AUDIENCE[audience];

  const goToCheckout = React.useCallback(() => {
    navigate(isAuthenticated ? '/payments' : '/register');
  }, [navigate, isAuthenticated]);

  return (
    <div
      style={{
        // The wash is layered on the page ground itself: a glow box inside a
        // shorter section gets clipped at its edges and leaves a hard line.
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
        <section style={{ position: 'relative' }}>
          <div style={wrap()}>
            <span style={{ ...label, color: C.cyan }}>Pricing</span>
            <h1 style={{ ...manrope, fontWeight: 900, fontSize: 'clamp(2rem, 5vw, 3.4rem)', letterSpacing: '-0.04em', lineHeight: 1.05, color: YALE, margin: '0 0 1.25rem', maxWidth: 820 }}>
              Straightforward pricing. Built for maritime businesses.
            </h1>
            <p style={{ ...body, fontSize: '1rem', color: YALE, maxWidth: 720 }}>
              Discover maritime suppliers, connect with service providers, and manage procurement enquiries through
              Nhaav. Choose an access plan that suits your business, with transparent pricing and no hidden platform
              fees.
            </p>
          </div>
        </section>

        {/* ══ PLANS ═══════════════════════════════════════════ */}
        <section style={{ marginTop: 'clamp(3rem, 7vw, 5rem)' }}>
          <div style={wrap()}>
            <div style={{ marginBottom: '2rem', maxWidth: 720 }}>
              <span style={{ ...label, color: C.cyan }}>{copy.eyebrow}</span>
              <h2 style={{ ...sectionTitle, color: YALE }}>{copy.title}</h2>
              <p style={{ ...body, color: YALE }}>{copy.blurb}</p>
            </div>

            <AudienceSwitcher value={audience} onChange={a => setChosen(a)} />

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 'clamp(1.25rem, 3vw, 2rem)', alignItems: 'stretch' }}>
              {copy.plans.map(plan => (
                <PlanCard key={plan.name} {...plan} onSelect={goToCheckout} />
              ))}
            </div>

            <p style={{ ...body, fontSize: '0.8rem', color: YALE, marginTop: '1.5rem', maxWidth: 820 }}>
              {copy.fineprint}
            </p>
          </div>
        </section>

        {/* ══ LISTING FEE ═════════════════════════════════════ */}
        <section style={{ marginTop: 'clamp(3.5rem, 8vw, 6rem)' }}>
          <div style={wrap()}>
            <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 32, padding: 'clamp(1.75rem, 4vw, 3rem)', boxShadow: '0 10px 30px rgba(13,59,102,0.06)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 'clamp(1.5rem, 4vw, 3rem)' }}>

                <div>
                  <span style={{ ...label, color: C.cyan }}>Marketplace Listing Fee</span>
                  <h2 style={{ ...sectionTitle, fontSize: 'clamp(1.4rem, 2.6vw, 1.9rem)', color: YALE }}>
                    Make your business discoverable.
                  </h2>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, margin: '1rem 0 0.25rem', flexWrap: 'wrap' }}>
                    <span style={{ ...manrope, fontWeight: 900, fontSize: 'clamp(1.7rem, 3.4vw, 2.2rem)', letterSpacing: '-0.04em', color: YALE }}>
                      ₹1,000
                    </span>
                    <span style={{ ...manrope, fontWeight: 800, fontSize: '1rem', color: YALE }}>+ GST</span>
                    <span style={{ fontSize: '0.85rem', fontWeight: 600, color: YALE }}>per listing</span>
                  </div>
                  <p style={{ ...body, fontSize: '0.85rem', color: YALE, marginBottom: '0.5rem' }}>
                    One month of marketplace visibility.
                  </p>
                  <p style={{ ...body, fontSize: '0.85rem', color: YALE, marginBottom: '1.5rem' }}>
                    Need longer? ₹10,000 + GST keeps the same single listing visible for twelve months.
                  </p>
                  <p style={{ ...body, fontSize: '0.9rem', color: YALE, marginBottom: '1.5rem' }}>
                    Suppliers and service providers can publish marketplace listings to showcase their offerings to
                    relevant maritime businesses.
                  </p>

                  <div style={{ ...manrope, fontWeight: 700, fontSize: '0.75rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: YALE, marginBottom: '0.75rem' }}>
                    Each paid listing includes
                  </div>
                  <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                    {[
                      'One marketplace listing',
                      'One month of visibility after activation',
                      'An opportunity to present your business offerings to potential customers',
                      'Listing status and expiry management through your account',
                    ].map(f => (
                      <li key={f} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: '0.875rem', lineHeight: 1.6, color: C.text }}>
                        <Check color={YALE} />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>

                  <button
                    type="button"
                    onClick={() => navigate('/choose-role')}
                    style={{
                      marginTop: '2rem',
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
                    Create a Listing
                  </button>
                </div>

                {/* Inset panel rather than a divider: it reads correctly both
                    beside the description and stacked under it on mobile. */}
                <div style={{ background: 'rgba(13,59,102,0.05)', border: `1px solid ${C.border}`, borderRadius: 20, padding: 'clamp(1.25rem, 3vw, 1.75rem)' }}>
                  <div style={{ ...manrope, fontWeight: 700, fontSize: '0.75rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: YALE, marginBottom: '1.1rem' }}>
                    How it works
                  </div>
                  <StepList steps={LISTING_STEPS} ink={YALE} soft={YALE} accent={C.cyan} />
                  <p style={{ ...body, fontSize: '0.78rem', color: YALE, marginTop: '1.5rem' }}>
                    The marketplace listing fee is separate from platform access plans. Paying for a listing does
                    not guarantee enquiries, leads, or business.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ══ PAYMENT PROCESS ═════════════════════════════════ */}
        <section style={{ marginTop: 'clamp(3.5rem, 8vw, 6rem)' }}>
          <div style={wrap()}>
            <div style={{ maxWidth: 760, marginBottom: '2rem' }}>
              <span style={{ ...label, color: C.cyan }}>Payment Process</span>
              <h2 style={{ ...sectionTitle, color: YALE }}>Bank transfer, reviewed by our team.</h2>
              <p style={{ ...body, color: YALE }}>
                Nhaav currently accepts payments through bank transfer. To request activation of a subscription or
                marketplace listing:
              </p>
            </div>
            <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 28, padding: 'clamp(1.5rem, 3.5vw, 2.5rem)' }}>
              <StepList steps={PAYMENT_STEPS} ink={YALE} soft={YALE} accent={C.cyan} />
              <p style={{ ...body, fontSize: '0.82rem', color: YALE, marginTop: '1.5rem' }}>
                Please wait for confirmation before assuming your payment or listing has been approved.
              </p>
            </div>
          </div>
        </section>

        {/* ══ FAQ ═════════════════════════════════════════════ */}
        <section style={{ marginTop: 'clamp(3.5rem, 8vw, 6rem)' }}>
          <div style={wrap(860)}>
            <div style={{ marginBottom: '1.75rem' }}>
              <span style={{ ...label, color: C.cyan }}>FAQ</span>
              <h2 style={{ ...sectionTitle, color: YALE }}>Frequently asked questions</h2>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {FAQ_BY_AUDIENCE[audience].map(({ q, a }) => (
                <details
                  key={q}
                  style={{
                    background: C.bgCard,
                    border: `1px solid ${C.border}`,
                    borderRadius: 16,
                    padding: '1.1rem 1.25rem',
                  }}
                >
                  <summary
                    style={{
                      ...manrope,
                      fontWeight: 700,
                      fontSize: '0.95rem',
                      color: YALE,
                      cursor: 'pointer',
                      listStyle: 'none',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: '1rem',
                    }}
                  >
                    <span>{q}</span>
                    <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: '1.1rem', color: C.cyan, flexShrink: 0 }}>
                      expand_more
                    </span>
                  </summary>
                  <p style={{ ...body, fontSize: '0.875rem', color: YALE, marginTop: '0.75rem' }}>{a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ══ CLOSING CTA ═════════════════════════════════════ */}
        <section style={{ marginTop: 'clamp(3.5rem, 8vw, 6rem)' }}>
          <div style={wrap()}>
            <div
              style={{
                background: YALE,
                borderRadius: 36,
                padding: 'clamp(2rem, 5vw, 4rem)',
                border: '1px solid rgba(255, 243, 109,0.15)',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              <div style={{ position: 'relative', zIndex: 2, maxWidth: 620 }}>
                <h2 style={{ ...manrope, fontWeight: 900, fontSize: 'clamp(1.7rem, 4vw, 2.6rem)', letterSpacing: '-0.04em', lineHeight: 1.1, color: CHIFFON, margin: '0 0 1rem' }}>
                  Ready to connect with the maritime business network?
                </h2>
                <p style={{ ...body, color: CHIFFON, marginBottom: '2rem' }}>
                  Find suppliers, discover service providers, and bring your procurement requirements to Nhaav.
                </p>
                <div style={{ display: 'flex', gap: '0.85rem', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => navigate('/choose-role')}
                    style={{
                      padding: '14px 32px',
                      background: CHIFFON,
                      color: YALE,
                      fontWeight: 700,
                      fontSize: '0.9rem',
                      border: 'none',
                      borderRadius: 14,
                      cursor: 'pointer',
                      boxShadow: '0 8px 20px rgba(0,0,0,0.22)',
                    }}
                  >
                    Get Started
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate(isAuthenticated ? '/payments' : '/login')}
                    style={{
                      padding: '14px 32px',
                      background: 'transparent',
                      color: CHIFFON,
                      fontWeight: 700,
                      fontSize: '0.9rem',
                      borderRadius: 14,
                      cursor: 'pointer',
                      border: '2px solid rgba(255, 243, 109,0.42)',
                    }}
                  >
                    {isAuthenticated ? 'View Payments' : 'Sign In'}
                  </button>
                </div>
              </div>
            </div>

            <p style={{ ...body, fontSize: '0.78rem', color: YALE, marginTop: '1.5rem', maxWidth: 820 }}>
              All prices are in Indian rupees (INR). GST (18%) is charged on top of the prices shown.
            </p>
          </div>
        </section>
      </main>

      <FooterNav />
    </div>
  );
}
