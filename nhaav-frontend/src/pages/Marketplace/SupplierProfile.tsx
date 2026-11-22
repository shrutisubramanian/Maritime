import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { profilesService } from '../../services/profiles';
import { BrandLogo } from '../../components/BrandLogo';

const C = {
  bg: 'var(--color-background)',
  bgCard: 'var(--color-surface)',
  bgLow: 'var(--color-surface-alt)',
  border: 'var(--color-border)',
  text: 'var(--color-text)',
  muted: 'var(--color-muted)',
  dim: 'var(--color-faint)',
  cyan: 'var(--color-brand)',
  primary: 'var(--color-brand)',
  error: 'var(--color-error)',
  green: 'var(--color-success)',
};
const M = "Manrope,sans-serif", I = "Inter,sans-serif";

interface PublicListing {
  id: string;
  name: string;
  category: string;
  subcategory: string | null;
  description: string | null;
  /** Listed price in integer paise; null = the supplier published no figure. */
  price_paise: number | null;
  price_note: string | null;
  ports: string[] | null;
  availability: string | null;
}

interface PublicProfile {
  id: string;
  user_id: string;
  role: string;
  company_name: string | null;
  position: string | null;
  bio: string | null;
  years_experience: number | null;
  ports_served: string[] | null;
  verification_status: string;
  badge_label: string | null;
  rating_avg: number;
  jobs_completed: number;
  listings: PublicListing[];
  /** Public storefront links (Website, LinkedIn, Facebook, Instagram, …). */
  social_links?: Record<string, string> | null;
  /** Registered business address, as published by the company. */
  address?: string | null;
  /** Business registration number (CIN), as published by the company. */
  registration_number?: string | null;
  /** Declared marketplace classification (the sheet's category columns). */
  primary_category_name?: string | null;
  subcategory_names?: string[] | null;
  /** Other business categories the company also works in. */
  additional_categories?: string[] | null;
  country?: string | null;
  head_office?: string | null;
  /** The account's single public business number. */
  phone?: string | null;
}

const SOCIAL_LABELS: Record<string, string> = {
  website: 'Website',
  linkedin: 'LinkedIn',
  facebook: 'Facebook',
  instagram: 'Instagram',
  twitter: 'Twitter / X',
  other: 'Other',
};

const socialLabel = (key: string) =>
  SOCIAL_LABELS[key] ?? (key.startsWith('other_') ? 'Other' : key.charAt(0).toUpperCase() + key.slice(1));

type FetchState = 'loading' | 'loaded' | 'notfound' | 'forbidden' | 'error';

export const SupplierProfile: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [state, setState] = useState<FetchState>('loading');

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setState('loading');
    profilesService
      .getPublicProfileByUser(id)
      .then((data: PublicProfile) => { if (!cancelled) { setProfile(data); setState('loaded'); } })
      .catch((err: { response?: { status?: number } }) => {
        if (!cancelled) {
          const status = err?.response?.status;
          setState(status === 403 ? 'forbidden' : status === 404 ? 'notfound' : 'error');
        }
      });
    return () => { cancelled = true; };
  }, [id]);

  if (state === 'loading') {
    return <div style={{ background: C.bg, color: C.text, fontFamily: I, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><p style={{ color: C.muted }}>Loading supplier…</p></div>;
  }
  if (state !== 'loaded' || !profile) {
    const forbidden = state === 'forbidden';
    return (
      <div style={{ background: C.bg, color: C.text, fontFamily: I, minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1rem', padding: '2rem', textAlign: 'center' }}>
        <h1 style={{ fontFamily: M, margin: 0 }}>
          {forbidden ? 'Profile access restricted' : state === 'notfound' ? 'Supplier not found' : 'Could not load supplier'}
        </h1>
        {forbidden && <p style={{ color: C.muted, margin: 0, maxWidth: 520 }}>Company profiles are visible to clients. Vendors can only view their own company profile.</p>}
        <button onClick={() => navigate(forbidden ? '/supplier-dashboard' : '/marketplace/supplies')} style={{ padding: '0.7rem 1.5rem', background: C.primary, color: 'var(--color-on-brand)', fontFamily: M, fontWeight: 700, border: 'none', borderRadius: 8, cursor: 'pointer' }}>
          {forbidden ? 'Back to dashboard' : 'Back to Supplies Marketplace'}
        </button>
      </div>
    );
  }

  const verified = profile.verification_status === 'verified';
  const listings = profile.listings ?? [];
  const ports = profile.ports_served ?? [];
  const socialLinks = Object.entries(profile.social_links ?? {}).filter(([, url]) => Boolean(url));
  const address = profile.address ?? null;
  const capabilities = profile.subcategory_names ?? [];
  // Other business categories the company also works in (never discovery).
  const otherCategories = (profile.additional_categories ?? []).filter(Boolean);

  /** The detail rows only exist when at least one of their values does. */
  const hasBusinessProfile =
    [profile.primary_category_name, profile.head_office, profile.country, profile.registration_number, profile.phone]
      .some((v) => typeof v === 'string' && v.trim().length > 0)
    || capabilities.length > 0
    || otherCategories.length > 0
    || Boolean(address)
    || socialLinks.length > 0;

  /** One label/value row; nothing renders when the value is empty. */
  const Detail: React.FC<{ label: string; value?: React.ReactNode }> = ({ label, value }) => {
    if (value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0)) return null;
    return (
      <div style={{ display: 'flex', gap: 10, fontSize: '0.87rem', marginBottom: '0.45rem' }}>
        <span style={{ color: C.muted, minWidth: 170 }}>{label}</span>
        <span style={{ color: C.text }}>{value}</span>
      </div>
    );
  };

  return (
    <div style={{ background: C.bg, color: C.text, fontFamily: I, minHeight: '100vh', paddingBottom: 80 }}>
      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '2.5rem 2rem 5rem' }}>
        <button onClick={() => navigate('/')} aria-label="Nhaav home" style={{ background: 'none', border: 'none', padding: 0, marginBottom: '1rem', cursor: 'pointer' }}>
          <BrandLogo height={22} />
        </button>
        <button onClick={() => navigate('/marketplace/supplies')} style={{ background: 'none', border: 'none', color: C.cyan, fontWeight: 700, cursor: 'pointer', padding: 0, marginBottom: '1.5rem' }}>← Supplies Marketplace</button>

        <section style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 20, padding: '2rem', marginBottom: '2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 12px', borderRadius: 999, fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', background: verified ? 'var(--color-success-tint)' : 'var(--color-brand-tint-solid)', color: verified ? 'var(--color-success-text)' : C.muted }}>
              <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>{verified ? 'verified' : 'hourglass_top'}</span>
              {profile.badge_label ?? (verified ? 'Verified Supplier' : 'Verification pending')}
            </span>
            {profile.rating_avg > 0 && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.8rem', color: C.muted }}>
                <span className="material-symbols-outlined" style={{ fontSize: '1rem', color: C.cyan, fontVariationSettings: "'FILL' 1" }}>star</span>
                {profile.rating_avg.toFixed(1)}
              </span>
            )}
            <span style={{ fontSize: '0.8rem', color: C.muted }}>{profile.jobs_completed} completed jobs</span>
          </div>
          <h1 style={{ fontFamily: M, fontWeight: 800, fontSize: 'clamp(1.8rem,4vw,2.6rem)', margin: '0 0 0.75rem' }}>{profile.company_name ?? 'Unnamed Supplier'}</h1>
          {profile.bio && <p style={{ color: C.muted, lineHeight: 1.7, maxWidth: 760, margin: 0 }}>{profile.bio}</p>}
          {hasBusinessProfile && (
          <div style={{ marginTop: '1rem', maxWidth: 760 }}>
            <Detail label="Primary category" value={profile.primary_category_name ?? undefined} />
            <Detail label="Capabilities" value={capabilities.length > 0 ? capabilities.join(', ') : undefined} />
            <Detail label="Also operates in" value={otherCategories.length > 0 ? otherCategories.join(', ') : undefined} />
            <Detail label="Head office / main port" value={profile.head_office ?? undefined} />
            <Detail label="Country" value={profile.country ?? undefined} />
            <Detail label="Company registration no." value={profile.registration_number ?? undefined} />
            <Detail
              label="Business contact"
              value={profile.phone ? <a href={`tel:${profile.phone.replace(/\s+/g, '')}`} style={{ color: C.text, fontWeight: 600, textDecoration: 'none' }}>{profile.phone}</a> : undefined}
            />
          </div>
          )}
          {(address || socialLinks.length > 0) && (
            <div style={{ marginTop: '1.25rem', paddingTop: '1.25rem', borderTop: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', gap: '0.75rem', maxWidth: 760 }}>
              {address && (
                <p style={{ margin: 0, color: C.text, lineHeight: 1.7, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '1.2rem', color: C.cyan }}>location_on</span>{address}
                </p>
              )}
              {socialLinks.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem' }}>
                  {socialLinks.map(([network, url]) => (
                    <a
                      key={network}
                      href={url}
                      target="_blank"
                      rel="noreferrer noopener"
                      style={{ padding: '6px 14px', borderRadius: 999, border: `1px solid ${C.border}`, background: C.bgLow, color: C.text, fontSize: '0.8rem', fontWeight: 600, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: '1rem', color: C.cyan }}>public</span>{socialLabel(network)}
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>

        {ports.length > 0 && (
          <section style={{ marginBottom: '2rem' }}>
            <h2 style={{ fontFamily: M, fontWeight: 800, fontSize: '1.3rem', margin: '0 0 1rem' }}>Ports Served</h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
              {ports.map(p => (
                <span key={p} style={{ padding: '8px 18px', background: C.bgLow, borderRadius: 999, fontSize: '0.875rem', fontWeight: 600, border: `1px solid ${C.border}`, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '1rem', color: C.cyan }}>anchor</span>{p}
                </span>
              ))}
            </div>
          </section>
        )}

        <section>
          <h2 style={{ fontFamily: M, fontWeight: 800, fontSize: '1.3rem', margin: '0 0 1rem' }}>Catalogue</h2>
          {listings.length === 0 ? (
            <p style={{ color: C.muted, background: C.bgLow, padding: '1.5rem', borderRadius: 12 }}>This supplier has no approved listings yet.</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
              {listings.map(l => (
                <button key={l.id} onClick={() => navigate(`/supplies/${l.id}`)}
                  style={{ textAlign: 'left', background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 14, padding: '1.25rem', cursor: 'pointer', color: C.text, fontFamily: I }}>
                  <span style={{ fontSize: '0.62rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: C.muted }}>{l.category}</span>
                  <h3 style={{ fontFamily: M, fontWeight: 800, fontSize: '1.05rem', margin: '0.35rem 0' }}>{l.name}</h3>
                  {l.subcategory && <p style={{ color: C.muted, fontSize: '0.82rem', margin: 0 }}>{l.subcategory}</p>}
                  {l.price_note && (
                    <p style={{ margin: '0.5rem 0 0', color: C.muted, fontSize: '0.8rem' }}>{l.price_note}</p>
                  )}
                  {l.ports && l.ports.length > 0 && <p style={{ color: C.dim, fontSize: '0.78rem', margin: '0.4rem 0 0' }}>Serves: {l.ports.join(', ')}</p>}
                </button>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
};

export default SupplierProfile;
