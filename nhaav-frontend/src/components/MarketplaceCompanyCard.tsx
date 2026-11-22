import React, { useState } from 'react';
import type { CompanyCard } from '../services/companies';

/**
 * Marketplace company card.
 *
 * Information only — no photography. The card shows what the company profile
 * actually declares: its primary category, verified status, name, bio, the port
 * it is based at and its availability, plus the lowest price among its live
 * listings. A listing without a price shows TBC rather than a made-up number.
 *
 * Moonstone (#4C9DB0) is the border and the CTA; the text on Moonstone is dark
 * ink because white on Moonstone is only 3.11:1.
 */
const MANROPE = "'Manrope', sans-serif";
const MOONSTONE = '#4C9DB0';
const MOONSTONE_DEEP = '#3F8A9C';
const CARD_BG = '#FFFCF2';
const INK = '#0B2430';
const NAVY = '#0D3B66';

/** Lowest live price, or "TBC" when no listing carries one. */
const formatFromPrice = (paise: number | null | undefined): string =>
  paise === null || paise === undefined
    ? 'TBC'
    : `₹${Math.round(paise / 100).toLocaleString('en-IN')}`;

const chipStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '5px 11px',
  borderRadius: 999,
  background: 'rgba(76,157,176,0.16)',
  color: INK,
  fontSize: '0.64rem',
  fontWeight: 800,
  letterSpacing: '0.07em',
  textTransform: 'uppercase',
  lineHeight: 1.15,
};

const CompanyCardView: React.FC<{ company: CompanyCard; onOpen?: () => void }> = ({
  company,
  onOpen,
}) => {
  const [hovered, setHovered] = useState(false);
  const [saved, setSaved] = useState(false);
  const isSupplier = company.vendor_type === 'supplier';
  const verified = company.verification_status === 'verified';
  const port = company.head_office || company.ports[0] || company.country;
  const description =
    (company.bio || '').trim() ||
    (isSupplier
      ? 'Marine supplies and spares delivered to port, quoted per request.'
      : 'Marine services carried out on board, in port or underwater.');
  const price = formatFromPrice(company.price_from_paise);

  return (
    <article
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onOpen}
      style={{
        background: CARD_BG,
        border: `2px solid ${hovered ? MOONSTONE_DEEP : MOONSTONE}`,
        borderRadius: 18,
        display: 'flex',
        flexDirection: 'column',
        cursor: onOpen ? 'pointer' : 'default',
        transition: 'all 0.25s ease',
        transform: hovered ? 'translateY(-3px)' : 'none',
        boxShadow: hovered
          ? '0 18px 38px rgba(13,59,102,0.16)'
          : '0 6px 18px rgba(13,59,102,0.08)',
        height: '100%',
        padding: '1.15rem 1.3rem 1.2rem',
        gap: '0.7rem',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <span style={{ ...chipStyle, minWidth: 0, maxWidth: '58%', textAlign: 'left' }} title={company.primary_category || undefined}>
          <span className="material-symbols-outlined" style={{ fontSize: '0.95rem', flexShrink: 0 }}>
            {isSupplier ? 'inventory_2' : 'handyman'}
          </span>
          <span style={{ minWidth: 0 }}>
            {company.primary_category || (isSupplier ? 'Supplier' : 'Service Provider')}
          </span>
        </span>
        {verified && (
          <span style={chipStyle}>
            <span className="material-symbols-outlined" style={{ fontSize: '0.95rem' }}>
              check_circle
            </span>
            Verified
          </span>
        )}
        <button
          type="button"
          aria-label={saved ? 'Remove from saved' : 'Save company'}
          aria-pressed={saved}
          onClick={(e) => {
            e.stopPropagation();
            setSaved((v) => !v);
          }}
          style={{
            marginLeft: 'auto',
            width: 32,
            height: 32,
            borderRadius: 9,
            border: '1px solid rgba(13,59,102,0.16)',
            background: 'transparent',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            color: INK,
            flexShrink: 0,
            padding: 0,
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '1.1rem' }}>
            {saved ? 'bookmark' : 'bookmark_border'}
          </span>
        </button>
      </div>

      <h3
        style={{
          fontFamily: MANROPE,
          fontWeight: 800,
          fontSize: '1.3rem',
          lineHeight: 1.16,
          margin: 0,
          color: NAVY,
        }}
      >
        {company.company_name || 'Unnamed company'}
      </h3>

      <p style={{ margin: 0, fontSize: '0.85rem', lineHeight: 1.55, color: INK, opacity: 0.85 }}>
        {description}
      </p>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          flexWrap: 'wrap',
          fontSize: '0.78rem',
          color: INK,
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span className="material-symbols-outlined" style={{ fontSize: '1.05rem' }}>
            location_on
          </span>
          {port || 'Port not listed'}
        </span>
        <span style={{ width: 1, height: 16, background: 'rgba(13,59,102,0.18)' }} />
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span className="material-symbols-outlined" style={{ fontSize: '1.05rem' }}>
            bolt
          </span>
          Available for Requests
        </span>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 8,
          padding: '0.55rem 0.7rem',
          borderRadius: 12,
          background: 'rgba(76,157,176,0.12)',
        }}
      >
        <span
          style={{
            fontSize: '0.62rem',
            fontWeight: 800,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: INK,
            opacity: 0.75,
          }}
        >
          Starting price
        </span>
        <span
          style={{
            marginLeft: 'auto',
            fontFamily: MANROPE,
            fontWeight: 800,
            fontSize: '1.02rem',
            color: NAVY,
          }}
        >
          {price}
        </span>
      </div>

      <div
        style={{
          marginTop: 'auto',
          paddingTop: '0.75rem',
          borderTop: '1px solid rgba(13,59,102,0.16)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
        }}
      >
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontSize: '0.78rem',
            fontWeight: 700,
            color: INK,
            minWidth: 0,
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '1.05rem' }}>
            business
          </span>
          {isSupplier ? 'Supplier' : 'Provider'}
        </span>
        {onOpen ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onOpen();
            }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '0.55rem 1rem',
              borderRadius: 12,
              border: 'none',
              background: MOONSTONE,
              color: INK,
              fontFamily: MANROPE,
              fontWeight: 800,
              fontSize: '0.82rem',
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            View Profile
            <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>
              arrow_forward
            </span>
          </button>
        ) : (
          <span style={{ fontSize: '0.72rem', color: INK, opacity: 0.7 }}>Client-only</span>
        )}
      </div>
    </article>
  );
};

export default CompanyCardView;
