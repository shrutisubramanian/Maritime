import React from 'react';
import { Link, useLocation } from 'react-router-dom';

const MANROPE = "'Manrope', sans-serif";
const INTER = "'Inter', sans-serif";

const CHIFFON = '#FFF36D';
const YALE = '#0D3B66';
const WHITE = '#FFFFFF';
/** Moonstone Blue #4C9DB0 at ~32% over white — the muted (pre-consent) button. */
const MOONSTONE_SURFACE = '#62A9BA';
const STORAGE_KEY = 'nhaav_terms_consent';

const readStoredConsent = (): boolean => {
  try {
    return Boolean(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    // Storage blocked (private mode, embedded webview) — treat as not accepted.
    return false;
  }
};

/**
 * Site-wide consent bar.
 *
 * Sits at the bottom of the viewport on first visit and stays until the visitor
 * ticks the box and accepts; the acceptance (with a timestamp) is remembered in
 * localStorage, so it is not shown again on later visits. It does not block the
 * page — it is a bar, not a modal — so someone can read the terms first.
 */
export const ConsentBanner: React.FC = () => {
  const location = useLocation();
  const [accepted, setAccepted] = React.useState<boolean>(readStoredConsent);
  const [checked, setChecked] = React.useState(false);

  React.useEffect(() => {
    setAccepted(readStoredConsent());
  }, []);

  const accept = React.useCallback(() => {
    if (!checked) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, new Date().toISOString());
    } catch {
      // Persisting failed; still dismiss for this session so it is not modal-stuck.
    }
    setAccepted(true);
  }, [checked]);

  // Already consented, or reading the terms themselves, which must be reachable
  // without first agreeing to them.
  if (accepted || location.pathname === '/terms') return null;

  return (
    <div
      role="region"
      aria-label="Terms and conditions consent"
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 9500,
        display: 'flex',
        justifyContent: 'center',
        padding: 'clamp(0.5rem, 1.5vw, 0.85rem)',
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          pointerEvents: 'auto',
          width: '100%',
          maxWidth: 620,
          background: WHITE,
          border: '1px solid rgba(13,59,102,0.16)',
          borderRadius: 12,
          boxShadow: '0 8px 24px rgba(13,59,102,0.12)',
          padding: '0.6rem 0.85rem',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '0.5rem 0.9rem',
          fontFamily: INTER,
        }}
      >
        <div style={{ flex: '1 1 260px', minWidth: 200 }}>
          <div
            style={{
              fontFamily: MANROPE,
              fontWeight: 800,
              fontSize: '0.58rem',
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              color: YALE,
              marginBottom: '0.25rem',
            }}
          >
            Terms &amp; Conditions
          </div>

          <label
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 8,
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={checked}
              onChange={e => setChecked(e.target.checked)}
              style={{
                marginTop: 2,
                width: 14,
                height: 14,
                flexShrink: 0,
                accentColor: YALE,
                cursor: 'pointer',
              }}
            />
            <span style={{ fontSize: '0.74rem', lineHeight: 1.5, color: YALE }}>
              I have read and accept the{' '}
              <Link
                to="/terms"
                style={{
                  color: YALE,
                  fontWeight: 700,
                  textDecoration: 'underline',
                  textUnderlineOffset: 2,
                }}
              >
                Terms and Conditions
              </Link>
              , including the rules on verification, access passes and payments.
            </span>
          </label>
        </div>

        <button
          type="button"
          onClick={accept}
          disabled={!checked}
          style={{
            flexShrink: 0,
            padding: '7px 16px',
            borderRadius: 8,
            border: 'none',
            background: checked ? YALE : MOONSTONE_SURFACE,
            color: checked ? CHIFFON : YALE,
            fontFamily: INTER,
            fontSize: '0.75rem',
            fontWeight: 700,
            cursor: checked ? 'pointer' : 'not-allowed',
            transition: 'background 0.15s ease, color 0.15s ease, transform 0.15s ease',
          }}
          onMouseEnter={e => {
            if (checked) e.currentTarget.style.transform = 'translateY(-1px)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.transform = 'translateY(0)';
          }}
        >
          Accept &amp; Continue
        </button>
      </div>
    </div>
  );
};

export default ConsentBanner;
