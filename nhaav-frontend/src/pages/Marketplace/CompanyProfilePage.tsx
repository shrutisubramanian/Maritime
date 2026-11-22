import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { BrandLogo } from '../../components/BrandLogo';
import { CircleMarker, MapContainer, Popup, TileLayer } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import {
  companiesService,
  CompanyBusinessProfile,
} from '../../services/companies';

/**
 * A company's business profile.
 *
 * Everything here is data the company declared and an admin approved, plus the
 * listings it currently has live. Nothing is inferred: missing fields are simply
 * not rendered, and a missing location shows a fallback instead of a fake pin.
 *
 * The map uses Leaflet + OpenStreetMap tiles, which are already dependencies of
 * this project and need no API key. Mapbox can replace the TileLayer later by
 * adding a token; the profile only requires valid coordinates either way.
 */

const M = "'Manrope', sans-serif";
const I = "'Inter', sans-serif";

const C = {
  bg: 'var(--color-background)',
  card: 'var(--color-surface)',
  low: 'var(--color-surface-alt)',
  border: 'var(--color-border)',
  text: 'var(--color-text)',
  muted: 'var(--color-muted)',
  dim: 'var(--color-faint)',
  brand: 'var(--color-brand)',
  success: 'var(--color-success)',
  error: 'var(--color-error)',
  onBrand: 'var(--color-on-brand)',
};

const SOCIAL_LABELS: Record<string, string> = {
  website: 'Website',
  linkedin: 'LinkedIn',
  facebook: 'Facebook',
  instagram: 'Instagram',
  twitter: 'Twitter / X',
  other: 'Other',
};

const Section: React.FC<{ title: string; children: React.ReactNode; subtitle?: string }> = ({
  title,
  subtitle,
  children,
}) => (
  <section
    style={{
      background: C.card,
      border: `1px solid ${C.border}`,
      borderRadius: 16,
      padding: '1.4rem 1.5rem',
      marginBottom: '1.1rem',
    }}
  >
    <h2 style={{ fontFamily: M, fontWeight: 800, fontSize: '1.05rem', margin: '0 0 0.2rem' }}>
      {title}
    </h2>
    {subtitle && (
      <p style={{ color: C.muted, fontSize: '0.82rem', margin: '0 0 0.9rem' }}>{subtitle}</p>
    )}
    <div style={{ marginTop: subtitle ? 0 : '0.8rem' }}>{children}</div>
  </section>
);

const Field: React.FC<{ label: string; value?: React.ReactNode }> = ({ label, value }) => {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div style={{ display: 'flex', gap: 8, fontSize: '0.87rem', marginBottom: '0.45rem' }}>
      <span style={{ color: C.muted, minWidth: 150 }}>{label}</span>
      <span style={{ color: C.text }}>{value}</span>
    </div>
  );
};

export const CompanyProfilePage: React.FC = () => {
  const { profileId } = useParams<{ profileId: string }>();
  const navigate = useNavigate();

  const [company, setCompany] = useState<CompanyBusinessProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [brochureError, setBrochureError] = useState('');
  const [downloadingBrochure, setDownloadingBrochure] = useState(false);

  const openBrochure = async () => {
    if (!profileId) return;
    setBrochureError('');
    setDownloadingBrochure(true);
    try {
      const url = await companiesService.downloadBrochure(profileId);
      window.open(url, '_blank', 'noopener');
    } catch {
      setBrochureError('The brochure could not be opened. Please try again.');
    } finally {
      setDownloadingBrochure(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    if (!profileId) return;
    setLoading(true);
    setError('');
    companiesService
      .getCompany(profileId)
      .then((res) => {
        if (!cancelled) setCompany(res);
      })
      .catch((err) => {
        if (cancelled) return;
        const status = (err as { response?: { status?: number } })?.response?.status;
        setCompany(null);
        setError(
          status === 403
            ? 'Company profiles are visible to clients. Vendors can only view their own company profile from their dashboard.'
            : status === 404
              ? 'This company is not currently listed in the marketplace.'
              : 'Could not load this company profile. Please retry.'
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [profileId]);

  const isSupplier = company?.vendor_type === 'supplier';
  const listUntil = useMemo(() => {
    const iso = company?.visibility?.expires_at;
    if (!iso) return null;
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString();
  }, [company]);

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: C.bg, padding: '4rem 2rem', color: C.muted }}>
        Loading company profile…
      </div>
    );
  }

  if (!company) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: C.bg,
          color: C.text,
          fontFamily: I,
          padding: '4rem 2rem',
        }}
      >
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          <button
            onClick={() => navigate('/marketplace')}
            style={{
              background: 'none',
              border: 'none',
              color: C.brand,
              fontWeight: 700,
              cursor: 'pointer',
              padding: 0,
              marginBottom: '1.5rem',
            }}
          >
            ← Marketplace
          </button>
          <div
            style={{
              background: C.card,
              border: `1px dashed ${C.border}`,
              borderRadius: 16,
              padding: '3rem 2rem',
              textAlign: 'center',
            }}
          >
            <p style={{ fontFamily: M, fontWeight: 800, margin: '0 0 0.4rem' }}>
              Company unavailable
            </p>
            <p style={{ color: C.muted, margin: 0, fontSize: '0.9rem' }}>{error}</p>
          </div>
        </div>
      </div>
    );
  }

  const capabilities = company.capabilities;

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: I }}>
      <div style={{ maxWidth: 1060, margin: '0 auto', padding: '2.5rem 2rem 5rem' }}>
        <button
          onClick={() => navigate('/')}
          aria-label="Nhaav home"
          style={{ background: 'none', border: 'none', padding: 0, marginBottom: '1rem', cursor: 'pointer' }}
        >
          <BrandLogo height={22} />
        </button>
        <button
          onClick={() => navigate('/marketplace')}
          style={{
            background: 'none',
            border: 'none',
            color: C.brand,
            fontWeight: 700,
            cursor: 'pointer',
            padding: 0,
            marginBottom: '1.25rem',
          }}
        >
          ← Marketplace
        </button>

        {/* Header */}
        <header
          style={{
            background: C.card,
            border: `1px solid ${C.border}`,
            borderRadius: 18,
            padding: '1.75rem',
            marginBottom: '1.25rem',
          }}
        >
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: 16,
                background: isSupplier ? 'rgba(16,185,129,0.12)' : 'var(--color-brand-tint)',
                color: isSupplier ? C.success : C.brand,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: M,
                fontWeight: 800,
                fontSize: '1.3rem',
                flexShrink: 0,
              }}
            >
              {(company.company_name || '?')
                .split(/\s+/)
                .slice(0, 2)
                .map((w) => w.charAt(0).toUpperCase())
                .join('')}
            </div>
            <div style={{ flex: 1, minWidth: 220 }}>
              <h1
                style={{
                  fontFamily: M,
                  fontWeight: 800,
                  fontSize: 'clamp(1.5rem, 3vw, 2.1rem)',
                  margin: '0 0 0.35rem',
                  letterSpacing: '-0.02em',
                }}
              >
                {company.company_name || 'Unnamed company'}
              </h1>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                <span
                  style={{
                    fontSize: '0.62rem',
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    padding: '2px 9px',
                    borderRadius: 999,
                    background: isSupplier ? 'rgba(16,185,129,0.12)' : 'var(--color-brand-tint)',
                    color: isSupplier ? C.success : C.brand,
                  }}
                >
                  {isSupplier ? 'Supplier' : 'Service Provider'}
                </span>
                {company.verification_status === 'verified' && (
                  <span
                    style={{
                      fontSize: '0.62rem',
                      fontWeight: 800,
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                      padding: '2px 9px',
                      borderRadius: 999,
                      background: 'rgba(16,185,129,0.12)',
                      color: C.success,
                    }}
                  >
                    Verified
                  </span>
                )}
                {company.primary_category && (
                  <span style={{ fontSize: '0.78rem', fontWeight: 700, color: C.brand }}>
                    {company.primary_category}
                  </span>
                )}
              </div>
            </div>
            {company.phone && (
              <div
                style={{
                  padding: '0.7rem 1rem',
                  borderRadius: 12,
                  border: `1px solid ${C.border}`,
                  background: C.low,
                  minWidth: 190,
                }}
              >
                <div
                  style={{
                    fontSize: '0.62rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.1em',
                    color: C.dim,
                    marginBottom: 4,
                  }}
                >
                  Business contact
                </div>
                <a
                  href={`tel:${company.phone.replace(/\s+/g, '')}`}
                  style={{ fontWeight: 700, color: C.text, textDecoration: 'none' }}
                >
                  {company.phone}
                </a>
              </div>
            )}
          </div>
          {company.bio && (
            <p style={{ color: C.muted, margin: '1rem 0 0', lineHeight: 1.6, fontSize: '0.92rem' }}>
              {company.bio}
            </p>
          )}
        </header>

        {/* Category & capabilities — only when the company filled them in */}
        {(company.primary_category || company.subcategories.length > 0 || (company.additional_categories ?? []).length > 0) && (
        <Section
          title="Business category & capabilities"
          subtitle="Declared by the company and approved by Nhaav."
        >
          <Field label="Primary category" value={company.primary_category} />
          {(company.additional_categories ?? []).length > 0 && (
            <Field label="Also operates in" value={(company.additional_categories ?? []).join(', ')} />
          )}
          {company.categories.length > 1 && (
            <Field
              label="Also listed under"
              value={company.categories.filter((c) => c !== company.primary_category).join(', ')}
            />
          )}
          {company.subcategories.length > 0 ? (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: '0.5rem' }}>
              {company.subcategories.map((sub) => (
                <span
                  key={sub}
                  style={{
                    fontSize: '0.78rem',
                    padding: '4px 10px',
                    borderRadius: 8,
                    background: C.low,
                    border: `1px solid ${C.border}`,
                    color: C.text,
                  }}
                >
                  {sub}
                </span>
              ))}
            </div>
          ) : null}
        </Section>
        )}

        {/* Coverage */}
        <Section title="Coverage">
          <Field label="Country" value={company.country} />
          <Field label="Head office / main port" value={company.head_office} />
          <Field
            label="Service ports"
            value={company.ports.length > 0 ? company.ports.join(', ') : undefined}
          />
          <Field
            label={isSupplier ? 'Supply areas' : 'Service areas'}
            value={company.service_areas.length > 0 ? company.service_areas.join(', ') : undefined}
          />
        </Section>

        {/* Registered address & published links — only the ones filled in */}
        {(company.address || company.registration_number || Object.values(company.social_links || {}).length > 0) && (
          <Section title="Company details">
            <Field label="Registered address" value={company.address || undefined} />
            <Field label="Company registration no." value={company.registration_number || undefined} />
            {Object.entries(company.social_links || {})
              .filter(([, url]) => Boolean(url))
              .map(([network, url]) => (
                <Field
                  key={network}
                  label={SOCIAL_LABELS[network] ?? network.charAt(0).toUpperCase() + network.slice(1)}
                  value={
                    <a
                      href={url}
                      target="_blank"
                      rel="noreferrer noopener"
                      style={{ color: C.brand, fontWeight: 600, textDecoration: 'none' }}
                    >
                      {url}
                    </a>
                  }
                />
              ))}
          </Section>
        )}

        {/* Location — only when the company published coordinates */}
        {company.location && (
        <Section title="Business location" subtitle="Location supplied by the company.">
          <div style={{ height: 300, borderRadius: 12, overflow: 'hidden' }}>
              <MapContainer
                center={[company.location.lat, company.location.lng]}
                zoom={9}
                scrollWheelZoom={false}
                style={{ height: '100%', width: '100%' }}
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <CircleMarker
                  center={[company.location.lat, company.location.lng]}
                  radius={10}
                  pathOptions={{ color: '#2563eb', fillColor: '#2563eb', fillOpacity: 0.6 }}
                >
                  <Popup>{company.company_name}</Popup>
                </CircleMarker>
              </MapContainer>
          </div>
        </Section>
        )}

        {/* Company brochure — vendor-supplied, shown to signed-in marketplace users */}
        {company.brochure && (
          <Section
            title="Company brochure"
            subtitle="Provided by the company."
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '1rem',
                flexWrap: 'wrap',
                padding: '0.85rem 1rem',
                borderRadius: 10,
                background: C.low,
                border: `1px solid ${C.border}`,
              }}
            >
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>
                  {company.brochure.filename}
                </div>
                <div style={{ color: C.dim, fontSize: '0.76rem' }}>
                  PDF
                  {company.brochure.size_bytes
                    ? ` · ${(company.brochure.size_bytes / (1024 * 1024)).toFixed(1)} MB`
                    : ''}
                </div>
              </div>
              <button
                onClick={openBrochure}
                disabled={downloadingBrochure}
                style={{
                  padding: '0.55rem 1.1rem',
                  borderRadius: 10,
                  border: `1px solid ${C.brand}`,
                  background: 'var(--color-brand-tint)',
                  color: C.brand,
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  cursor: downloadingBrochure ? 'not-allowed' : 'pointer',
                }}
              >
                {downloadingBrochure ? 'Opening…' : 'Open brochure'}
              </button>
            </div>
            {brochureError && (
              <p style={{ color: C.error, fontSize: '0.8rem', margin: '0.6rem 0 0' }}>
                {brochureError}
              </p>
            )}
          </Section>
        )}

        {/* Live listings (supporting content, not the browse unit) */}
        {capabilities.length > 0 && (
        <Section
          title="Current offering"
          subtitle="Approved listings this company has live right now."
        >
          {
            <div style={{ display: 'grid', gap: '0.6rem' }}>
              {capabilities.map((item) => (
                <div
                  key={item.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: '1rem',
                    padding: '0.75rem 0.9rem',
                    borderRadius: 10,
                    background: C.low,
                    border: `1px solid ${C.border}`,
                    flexWrap: 'wrap',
                  }}
                >
                  <div style={{ minWidth: 200 }}>
                    <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{item.name}</div>
                    <div style={{ color: C.dim, fontSize: '0.76rem' }}>
                      {item.category}
                      {item.subcategory ? ` · ${item.subcategory}` : ''}
                    </div>
                  </div>
                  {item.price_note && (
                    <div style={{ color: C.muted, fontSize: '0.78rem' }}>{item.price_note}</div>
                  )}
                </div>
              ))}
            </div>
          }
        </Section>
        )}
      </div>
    </div>
  );
};

export default CompanyProfilePage;
