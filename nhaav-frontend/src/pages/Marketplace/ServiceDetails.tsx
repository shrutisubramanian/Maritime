import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useTheme } from '../../context/ThemeContext';
import { marketplaceService, searchErrorMessage, ServiceDetail, PortAvailability } from '../../services/marketplace';
import { BrandLogo } from '../../components/BrandLogo';
import { profilesService } from '../../services/profiles';
import { providersService, Review } from '../../services/providers';
import { ReviewsSection } from '../../components/ReviewsSection';
import { useIsMobile } from '../../hooks/useIsMobile';

const M = "'Manrope', sans-serif";
const I = "'Inter', sans-serif";

/** Safe public fields of the company behind a card (no PII beyond the phone). */
interface CompanyProfile {
  id: string;
  user_id: string;
  company_name: string | null;
  phone: string | null;
  verification_status: string;
  badge_label: string | null;
  rating_avg: number;
  jobs_completed: number;
  position: string | null;
  bio: string | null;
  years_experience: number;
  ports_served: string[] | null;
  services: {
    id: string;
    name: string;
    description: string | null;
    price_paise?: number | null;
    price_note?: string | null;
  }[];
}

/* ── Derive content from detail (API-backed only) ──────────────── */
export const ServiceDetails: React.FC = () => {
  const { category, listingId, providerId, skill } = useParams<{ category?: string; listingId?: string; providerId?: string; skill?: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const fromSource = searchParams.get('from'); // 'stores' or 'services'
  const requestedTitle = searchParams.get('service') || ''; // optional title prefill for the request form
  // The card this page was opened from is ONE company's offer, so it tells us
  // whose contact number and whose reviews belong on this page.
  const providerUserId = searchParams.get('provider') || '';
  const { tokens: C, isDark } = useTheme();
  const isMobile = useIsMobile();

  const [detail, setDetail] = useState<ServiceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedFaq, setExpandedFaq] = useState<number | null>(0);
  const [selectedPort, setSelectedPort] = useState('');
  const [availability, setAvailability] = useState<PortAvailability | null>(null);
  const [availLoading, setAvailLoading] = useState(false);
  const [detailNotice, setDetailNotice] = useState('');
  const [availNotice, setAvailNotice] = useState('');
  const [company, setCompany] = useState<CompanyProfile | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);

  // Public profile of the company behind the card: name, business number,
  // rating and their own listed price for this service.
  useEffect(() => {
    let active = true;
    if (!providerUserId) { setCompany(null); return; }
    profilesService.getPublicProfileByUser(providerUserId)
      .then((data: CompanyProfile) => { if (active) setCompany(data); })
      .catch(() => { if (active) setCompany(null); });
    return () => { active = false; };
  }, [providerUserId]);

  // Reviews people left for that company on completed jobs.
  useEffect(() => {
    let active = true;
    if (!providerUserId) { setReviews([]); return; }
    setReviewsLoading(true);
    providersService.getProviderReviews(providerUserId)
      .then((data) => { if (active) setReviews(data); })
      .catch(() => { if (active) setReviews([]); })
    .finally(() => { if (active) setReviewsLoading(false); });
    return () => { active = false; };
  }, [providerUserId]);

  const isAggregated = !!category;

  useEffect(() => {
    if (!isAggregated) { setLoading(false); return; }
    setLoading(true);
    marketplaceService.getServiceDetail(decodeURIComponent(category))
      .then(data => { setDetail(data); setDetailNotice(''); })
      .catch(err => { setDetail(null); setDetailNotice(searchErrorMessage(err)); })
      .finally(() => setLoading(false));
  }, [category, isAggregated]);

  useEffect(() => {
    if (!isAggregated || !selectedPort || !detail) { setAvailability(null); return; }
    setAvailLoading(true);
    marketplaceService.getPortAvailability(detail.service_name, selectedPort)
      .then(data => { setAvailability(data); setAvailNotice(''); })
      .catch(err => { setAvailability(null); setAvailNotice(searchErrorMessage(err)); })
      .finally(() => setAvailLoading(false));
  }, [selectedPort, detail, isAggregated]);

  const serviceName = detail?.service_name || (skill ? decodeURIComponent(skill) : 'Service Details');
  const serviceCategory = detail?.category || detail?.subcategory || 'Unknown';
  const serviceSubcategory = detail?.subcategory || serviceCategory;
  const requestType = fromSource === 'stores' ? 'procurement' : 'service';

  // Everything shown below comes from the aggregated service API. When the
  // backend has no data for a metric, the UI renders an honest "—" or an
  // empty state instead of a fabricated value.
  const totalProviders = detail?.verified_provider_count || 0;
  const portCoverage = detail?.port_coverage || [];

  // This company's own offering: their wording of the description and their
  // listed price (cheapest if they list the service for several ports).
  const companyOffer = (company?.services || []).filter(
    s => s.name.trim().toLowerCase() === serviceName.trim().toLowerCase()
  );
  const description = companyOffer.find(s => s.description)?.description || detail?.description || '';

  const availablePorts = portCoverage.map(p => p.port_name);

  // Shared navigation target for every request action on this page.
  const requestQuote = () => {
    const params = new URLSearchParams({ type: requestType });
    if (serviceName && serviceName !== 'Service Details') params.set('service', serviceName);
    navigate(`/create-request?${params.toString()}`);
  };

  if (loading) {
    return (
      <div style={{ background: C.bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.muted, fontFamily: I }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>⏳</div>
          <p>Loading service details...</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: C.bg, color: C.text, fontFamily: I, minHeight: '100vh', transition: 'background 0.3s, color 0.3s' }}>

      {/* HEADER */}
      <header style={{ position: 'fixed', top: 0, left: 0, right: 0, height: 64, zIndex: 50, background: isDark ? 'rgba(255,252,242,0.85)' : 'rgba(255,255,255,0.85)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: isMobile ? '0 1rem' : '0 2rem', borderBottom: `1px solid ${C.border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button onClick={() => navigate('/marketplace')} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: C.cyan, fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '1.1rem' }}>arrow_back</span> Back to Marketplace
          </button>
          <span style={{ color: C.dim }}>|</span>
          <BrandLogo height={24} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ position: 'relative', display: isMobile ? 'none' : 'block' }}>
            <span className="material-symbols-outlined" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: '1.1rem', color: C.muted, pointerEvents: 'none' }}>search</span>
            <input type="text" placeholder="Search services, vessels, or ports..." style={{ background: C.bgLow, border: 'none', borderRadius: 999, padding: '6px 14px 6px 34px', fontSize: '0.875rem', color: C.text, fontFamily: I, outline: 'none', width: 280 }} />
          </div>
          <div style={{ width: 36, height: 36, borderRadius: '50%', background: C.bgLow, border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '1.2rem', color: C.muted }}>person</span>
          </div>
        </div>
      </header>

      {/* MAIN */}
      <main style={{ maxWidth: 1400, margin: '0 auto', padding: isMobile ? 'calc(64px + 1.5rem) 1rem 4rem' : 'calc(64px + 2rem) 2.5rem 5rem' }}>

        {/* HERO */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 400px', gap: '2rem', marginBottom: '2.5rem', alignItems: 'start' }}>
          <div>
            {/* Breadcrumb */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.7rem', color: C.dim, marginBottom: '0.5rem', letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 600 }}>
              <span>MARKETPLACE</span>
              <span className="material-symbols-outlined" style={{ fontSize: '0.9rem' }}>chevron_right</span>
              <span>{fromSource === 'stores' ? 'STORES & SUPPLIES' : 'REPAIRS & SERVICES'}</span>
              <span className="material-symbols-outlined" style={{ fontSize: '0.9rem' }}>chevron_right</span>
              <span style={{ color: C.cyan }}>{serviceName.toUpperCase()}</span>
            </div>

            {/* Title */}
            <h1 style={{ fontFamily: M, fontWeight: 900, fontSize: 'clamp(2rem, 4vw, 3rem)', color: C.title, margin: '0 0 0.5rem', letterSpacing: '-0.03em', lineHeight: 1.1 }}>
              {serviceName}
            </h1>

            {/* Meta — API-backed only */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', fontSize: '0.8rem', color: C.muted, marginBottom: '1.25rem', flexWrap: 'wrap' }}>
              {company?.company_name && (
                <>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>domain</span>
                    <span style={{ color: C.title, fontWeight: 700 }}>{company.company_name}</span>
                  </span>
                  <span style={{ color: C.dim }}>•</span>
                </>
              )}
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>category</span>
                Category: {serviceSubcategory}
              </span>
              {serviceCategory !== serviceSubcategory && (
                <>
                  <span style={{ color: C.dim }}>•</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>group</span>
                    Group: {serviceCategory}
                  </span>
                </>
              )}
              {totalProviders > 0 && (
                <>
                  <span style={{ color: C.dim }}>•</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>business</span>
                    {totalProviders} Verified {totalProviders === 1 ? 'Provider' : 'Providers'}
                  </span>
                </>
              )}
            </div>

            {/* Request flow */}
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <button onClick={requestQuote} style={{ padding: '0.75rem 2rem', borderRadius: 10, background: C.cyan, color: 'var(--color-on-brand)', fontWeight: 700, fontSize: '0.9rem', border: 'none', cursor: 'pointer', boxShadow: `0 6px 20px ${C.cyanDim}` }}>
                Request Quote
              </button>
            </div>
          </div>

          {/* Hero panel — neutral identity, no stock photography */}
          <div style={{ borderRadius: 20, border: `1px solid ${C.border}`, background: C.bgLow, height: 320, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '2rem', gap: '0.75rem' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '4rem', color: C.cyan }}>
              {fromSource === 'stores' ? 'inventory_2' : 'handyman'}
            </span>
            <div style={{ fontFamily: M, fontWeight: 800, fontSize: '1.1rem', color: C.title }}>{serviceName}</div>
            <div style={{ fontSize: '0.8rem', color: C.muted }}>{serviceSubcategory}</div>
          </div>
        </div>

        {/* Rate-limit notice for the detail fetch (server-driven) */}
        {detailNotice && !loading && (
          <div style={{
            padding: '0.85rem 1.25rem',
            borderRadius: 12,
            border: `1px solid ${C.border}`,
            background: 'rgba(76,157,176,0.08)',
            color: C.title,
            fontSize: '0.875rem',
            marginBottom: '1.5rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.6rem',
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: '1.1rem', color: C.cyan }}>hourglass_top</span>
            {detailNotice}
          </div>
        )}

        {/* CONTENT GRID */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 340px', gap: '2rem', alignItems: 'start' }}>

          {/* LEFT COLUMN */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>

            {/* SERVICE OVERVIEW */}
            <div style={{ background: C.bgCard, borderRadius: 20, border: `1px solid ${C.border}`, padding: '2rem' }}>
              <h2 style={{ fontFamily: M, fontWeight: 800, fontSize: '1.3rem', color: C.title, margin: '0 0 1rem' }}>Service Overview</h2>
              {description ? (
                <p style={{ fontSize: '0.9rem', color: C.muted, lineHeight: 1.7, margin: 0 }}>{description}</p>
              ) : (
                <p style={{ fontSize: '0.9rem', color: C.muted, lineHeight: 1.7, margin: 0, fontStyle: 'italic' }}>
                  No description has been added for this service yet.
                </p>
              )}
            </div>

            {/* THE COMPANY BEHIND THIS CARD — profile, straight after the
                description, so a buyer never has to hunt for who is offering. */}
            {company && (
              <div style={{ background: C.bgCard, borderRadius: 20, border: `1px solid ${C.border}`, padding: '2rem' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
                  <div>
                    <div style={{ fontSize: '0.6rem', fontWeight: 800, letterSpacing: '0.15em', textTransform: 'uppercase', color: C.dim, marginBottom: 4 }}>
                      The company behind this listing
                    </div>
                    <h2 style={{ fontFamily: M, fontWeight: 800, fontSize: '1.35rem', color: C.title, margin: 0 }}>
                      {company.company_name || 'Verified provider'}
                    </h2>
                    {company.position && (
                      <div style={{ fontSize: '0.82rem', color: C.muted, marginTop: 2 }}>{company.position}</div>
                    )}
                  </div>
                  {company.verification_status === 'verified' && (
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 5,
                        padding: '5px 12px',
                        borderRadius: 999,
                        background: 'var(--color-success-tint)',
                        color: 'var(--color-success-text)',
                        fontSize: '0.65rem',
                        fontWeight: 800,
                        letterSpacing: '0.1em',
                        textTransform: 'uppercase',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: '0.9rem', fontVariationSettings: "'FILL' 1" }}>verified</span>
                      {company.badge_label || 'Verified'}
                    </span>
                  )}
                </div>

                <p style={{ fontSize: '0.9rem', color: C.muted, lineHeight: 1.7, margin: '0 0 1.25rem' }}>
                  {company.bio?.trim()
                    ? company.bio
                    : 'This company has not published a profile description yet.'}
                </p>

                {/* Only figures the company actually has. No invented metrics. */}
                <div style={{ display: 'flex', gap: '1.75rem', flexWrap: 'wrap', rowGap: '1rem', marginBottom: '1.25rem' }}>
                  {company.years_experience > 0 && (
                    <div>
                      <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.dim }}>Experience</div>
                      <div style={{ fontFamily: M, fontWeight: 800, fontSize: '1rem', color: C.title }}>
                        {company.years_experience} {company.years_experience === 1 ? 'year' : 'years'}
                      </div>
                    </div>
                  )}
                  {company.rating_avg > 0 && (
                    <div>
                      <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.dim }}>Rating</div>
                      <div style={{ fontFamily: M, fontWeight: 800, fontSize: '1rem', color: C.title }}>
                        {company.rating_avg.toFixed(1)} ★
                      </div>
                    </div>
                  )}
                  {company.jobs_completed > 0 && (
                    <div>
                      <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.dim }}>Jobs completed</div>
                      <div style={{ fontFamily: M, fontWeight: 800, fontSize: '1rem', color: C.title }}>{company.jobs_completed}</div>
                    </div>
                  )}
                  {company.ports_served && company.ports_served.length > 0 && (
                    <div style={{ minWidth: 160, flex: '1 1 160px' }}>
                      <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.dim }}>Ports served</div>
                      <div style={{ fontSize: '0.85rem', color: C.title, fontWeight: 600 }}>
                        {company.ports_served.slice(0, 4).join(' · ')}
                        {company.ports_served.length > 4 ? ` +${company.ports_served.length - 4} more` : ''}
                      </div>
                    </div>
                  )}
                </div>

                <button
                  onClick={() => navigate(`/provider/${company.user_id}`)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '0.65rem 1.25rem',
                    borderRadius: 10,
                    border: `1px solid ${C.border}`,
                    background: 'transparent',
                    color: C.cyan,
                    fontWeight: 700,
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                  }}
                >
                  View full company profile
                  <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>arrow_forward</span>
                </button>
              </div>
            )}

            {/* REVIEWS — what buyers said after their jobs */}
            <ReviewsSection reviews={reviews} loading={reviewsLoading} />

            {/* LIVE PORT AVAILABILITY — dynamic from API port_coverage */}
            <div style={{ background: C.bgCard, borderRadius: 20, border: `1px solid ${C.border}`, padding: '2rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
                <h2 style={{ fontFamily: M, fontWeight: 800, fontSize: '1.3rem', color: C.title, margin: 0 }}>Port Availability</h2>
                <div style={{ display: 'flex', gap: '1rem' }}>
                  {[{ label: 'Available', color: C.green }, { label: 'Limited', color: '#f59e0b' }, { label: 'Fully Booked', color: C.danger }].map(s => (
                    <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', color: C.muted }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: s.color }} />
                      {s.label}
                    </div>
                  ))}
                </div>
              </div>

              {portCoverage.length > 0 ? (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem' }}>
                    {portCoverage.map(port => (
                      <div
                        key={port.port_name}
                        onClick={() => setSelectedPort(port.port_name)}
                        style={{
                          background: selectedPort === port.port_name ? C.cyanDim : C.surfaceAlt,
                          borderRadius: 12,
                          border: `1px solid ${selectedPort === port.port_name ? C.cyan : C.border}`,
                          padding: '1rem',
                          cursor: 'pointer',
                          transition: 'all 0.2s',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: '0.5rem' }}>
                          <span className="material-symbols-outlined" style={{ fontSize: '1rem', color: C.cyan }}>location_on</span>
                          <span style={{ fontFamily: M, fontWeight: 700, fontSize: '0.9rem', color: C.title }}>{port.port_name}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span className="material-symbols-outlined" style={{ fontSize: '0.9rem', color: port.provider_count > 2 ? C.green : port.provider_count > 0 ? '#f59e0b' : C.danger }}>
                            {port.provider_count > 2 ? 'check_circle' : port.provider_count > 0 ? 'warning' : 'cancel'}
                          </span>
                          <span style={{ fontSize: '0.8rem', color: C.muted }}>
                            {port.provider_count} {port.provider_count === 1 ? 'provider' : 'providers'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                  {availablePorts.length > 6 && (
                    <p style={{ fontSize: '0.75rem', color: C.dim, marginTop: '0.75rem' }}>
                      Showing {Math.min(availablePorts.length, 12)} of {availablePorts.length} covered ports.
                    </p>
                  )}
                </>
              ) : (
                <div style={{ background: C.surfaceAlt, borderRadius: 16, border: `1px solid ${C.border}`, padding: '2rem', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200, position: 'relative', overflow: 'hidden' }}>
                  <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(135deg, ${C.cyanDim}, transparent)`, opacity: 0.3 }} />
                  <div style={{ position: 'relative', textAlign: 'center' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: '3rem', color: C.cyan, marginBottom: '0.5rem', display: 'block' }}>map</span>
                    <p style={{ fontFamily: M, fontWeight: 700, fontSize: '1rem', color: C.title, margin: '0 0 0.25rem' }}>No Port Coverage Data</p>
                    <p style={{ fontSize: '0.8rem', color: C.muted, margin: 0 }}>Port availability information is not yet available for this service</p>
                  </div>
                </div>
              )}

              {/* Port availability detail when a port is selected */}
              {selectedPort && (
                <div style={{ marginTop: '1.5rem', padding: '1.25rem', background: C.bgLow, borderRadius: 12, border: `1px solid ${C.border}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '0.75rem' }}>
                    <span className="material-symbols-outlined" style={{ color: C.cyan }}>business</span>
                    <span style={{ fontFamily: M, fontWeight: 700, fontSize: '0.95rem', color: C.title }}>Providers at {selectedPort}</span>
                    {availLoading && <span style={{ fontSize: '0.8rem', color: C.muted }}>Loading...</span>}
                  </div>
                  {availability && availability.providers.length > 0 ? (
                    availability.providers.map(provider => (
                      <button
                        key={provider.id}
                        type="button"
                        onClick={() => navigate(`/provider/${provider.id}`)}
                        title={`View ${provider.company_name} profile`}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '0.75rem 0', border: 'none', borderBottom: `1px solid ${C.border}`, borderRadius: 0, background: 'transparent', cursor: 'pointer', font: 'inherit', color: 'inherit', textAlign: 'left' }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ width: 36, height: 36, borderRadius: 8, background: C.cyanDim, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <span className="material-symbols-outlined" style={{ color: C.cyan, fontSize: '1.1rem' }}>domain</span>
                          </div>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ fontFamily: M, fontWeight: 700, fontSize: '0.85rem', color: C.title }}>{provider.company_name}</span>
                              {provider.badge_label && provider.badge_label !== 'Unverified' && (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 8px', background: 'rgba(16,185,129,0.1)', borderRadius: 999, fontSize: '0.55rem', fontWeight: 800, color: '#34D399', letterSpacing: '0.08em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                                  <span className="material-symbols-outlined" style={{ fontSize: '0.7rem', fontVariationSettings: "'FILL' 1" }}>verified</span>
                                  Verified
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: C.muted }}>{provider.years_experience}+ years • {provider.jobs_completed} jobs</div>
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span className="material-symbols-outlined" style={{ fontSize: '0.9rem', color: '#f59e0b', fontVariationSettings: "'FILL' 1" }}>star</span>
                          <span style={{ fontFamily: M, fontWeight: 700, fontSize: '0.85rem', color: C.title }}>{provider.rating_avg?.toFixed(1) || '—'}</span>
                          <span className="material-symbols-outlined" style={{ fontSize: '1rem', color: C.cyan }} aria-hidden="true">chevron_right</span>
                        </div>
                      </button>
                    ))
                  ) : availability && !availability.available ? (
                    <p style={{ fontSize: '0.85rem', color: C.muted, margin: '0.5rem 0' }}>No verified providers currently available at {selectedPort} for this service.</p>
                  ) : availNotice ? (
                    <p style={{ fontSize: '0.85rem', color: C.muted, margin: '0.5rem 0' }}>{availNotice}</p>
                  ) : !availLoading ? (
                    <p style={{ fontSize: '0.85rem', color: C.muted, margin: '0.5rem 0' }}>Select a port to view provider availability.</p>
                  ) : null}
                </div>
              )}
            </div>

            {/* HOW REQUESTING WORKS — honest, platform-voice explanation */}
            <div style={{ background: C.bgCard, borderRadius: 20, border: `1px solid ${C.border}`, padding: '2rem' }}>
              <h2 style={{ fontFamily: M, fontWeight: 800, fontSize: '1.3rem', color: C.title, margin: '0 0 1rem' }}>How Requesting Works</h2>
              {[
                { icon: 'edit_note', title: 'Submit your request', text: 'Describe the service or supplies you need, including the port and schedule.' },
                { icon: 'schedule', title: 'Providers respond', text: 'Verified providers covering your port send quotations for your request.' },
                { icon: 'request_quote', title: 'Compare and accept', text: 'Review the received quotations side by side and accept the one that fits.' },
              ].map((step, i, arr) => (
                <div key={step.title} style={{ display: 'flex', gap: '1rem', paddingBottom: i < arr.length - 1 ? '1.25rem' : 0 }}>
                  <div style={{ width: 36, height: 36, borderRadius: '50%', background: C.cyanDim, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: '1.1rem', color: C.cyan }}>{step.icon}</span>
                  </div>
                  <div>
                    <div style={{ fontFamily: M, fontWeight: 700, fontSize: '0.9rem', color: C.title }}>{step.title}</div>
                    <div style={{ fontSize: '0.85rem', color: C.muted, lineHeight: 1.5 }}>{step.text}</div>
                  </div>
                </div>
              ))}
              <button onClick={requestQuote} style={{ marginTop: '1.25rem', width: '100%', padding: '0.75rem', borderRadius: 10, background: C.primary, color: 'var(--color-on-brand)', fontWeight: 700, fontSize: '0.85rem', border: 'none', cursor: 'pointer' }}>
                Start a Request
              </button>
            </div>
          </div>

          {/* RIGHT COLUMN */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', position: isMobile ? 'static' : 'sticky', top: isMobile ? undefined : 80 }}>

            {/* COMPANY CARD — who is offering this, and how to reach them */}
            {(company || providerUserId) && (
              <div style={{ background: C.bgCard, borderRadius: 20, border: `1px solid ${C.border}`, padding: '1.5rem' }}>
                <div style={{ fontSize: '0.6rem', fontWeight: 800, letterSpacing: '0.15em', textTransform: 'uppercase', color: C.cyan, marginBottom: '1rem' }}>THIS OFFER IS FROM</div>
                <div style={{ fontFamily: M, fontWeight: 800, fontSize: '1.05rem', color: C.title, marginBottom: '0.35rem' }}>
                  {company?.company_name || 'Verified provider'}
                </div>
                {company && (
                  <div style={{ fontSize: '0.8rem', color: C.muted, marginBottom: '0.75rem' }}>
                    {company.verification_status === 'verified' ? 'Verified' : 'Verification pending'}
                    {company.rating_avg > 0 ? ` · ${company.rating_avg.toFixed(1)}★` : ''}
                    {company.jobs_completed > 0 ? ` · ${company.jobs_completed} jobs` : ''}
                  </div>
                )}
                {company?.phone ? (
                  <a
                    href={`tel:${company.phone}`}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0.6rem 0.8rem', borderRadius: 10, background: C.cyanDim, color: C.cyan, fontWeight: 800, fontSize: '0.95rem', textDecoration: 'none', marginBottom: '0.75rem' }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '1.1rem' }}>call</span>
                    {company.phone}
                  </a>
                ) : (
                  <p style={{ fontSize: '0.8rem', color: C.muted, margin: '0 0 0.75rem', fontStyle: 'italic' }}>
                    Contact number not published yet — send a request to reach this company.
                  </p>
                )}
                {company && (
                  <button onClick={() => navigate(`/provider/${company.id}`)} style={{ width: '100%', padding: '0.6rem', borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', color: C.cyan, fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' }}>
                    View company profile
                  </button>
                )}
              </div>
            )}

            {/* SERVICE INFO CARD — counts from the API only */}
            <div style={{ background: C.bgCard, borderRadius: 20, border: `1px solid ${C.border}`, padding: '1.5rem' }}>
              <div style={{ fontSize: '0.6rem', fontWeight: 800, letterSpacing: '0.15em', textTransform: 'uppercase', color: C.cyan, marginBottom: '1rem' }}>SERVICE DETAILS</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: '1rem' }}>
                <div style={{ width: 48, height: 48, borderRadius: 12, background: C.bgLow, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${C.border}` }}>
                  <span className="material-symbols-outlined" style={{ color: C.cyan, fontSize: '1.5rem' }}>{fromSource === 'stores' ? 'inventory_2' : 'handyman'}</span>
                </div>
                <div>
                  <div style={{ fontFamily: M, fontWeight: 800, fontSize: '1rem', color: C.title }}>{serviceName}</div>
                  <div style={{ fontSize: '0.8rem', color: C.muted }}>{serviceSubcategory}</div>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: '1rem' }}>
                <div style={{ background: C.bgLow, borderRadius: 10, padding: '0.75rem', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.muted, marginBottom: 4 }}>PROVIDERS</div>
                  <div style={{ fontFamily: M, fontWeight: 800, color: C.title }}>{totalProviders}</div>
                </div>
                <div style={{ background: C.bgLow, borderRadius: 10, padding: '0.75rem', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.muted, marginBottom: 4 }}>PORTS</div>
                  <div style={{ fontFamily: M, fontWeight: 800, color: C.title }}>{detail?.ports_covered || 0}</div>
                </div>
              </div>
              <button onClick={() => navigate('/marketplace')} style={{ width: '100%', padding: '0.6rem', borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', color: C.cyan, fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' }}>
                View All Services
              </button>
            </div>

            {/* REQUEST SUMMARY CARD */}
            <div style={{ background: C.bgCard, borderRadius: 20, border: `1px solid ${C.border}`, padding: '1.5rem' }}>
              <h3 style={{ fontFamily: M, fontWeight: 700, fontSize: '0.95rem', color: C.title, margin: '0 0 0.75rem' }}>Request Summary</h3>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${C.border}`, fontSize: '0.85rem' }}>
                <span style={{ color: C.muted }}>Service</span>
                <span style={{ fontWeight: 700, color: C.title, textAlign: 'right' }}>{serviceName}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${C.border}`, fontSize: '0.85rem' }}>
                <span style={{ color: C.muted }}>Type</span>
                <span style={{ fontWeight: 700, color: C.title }}>{requestType === 'procurement' ? 'Procurement' : 'Service'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', fontSize: '0.85rem' }}>
                <span style={{ color: C.muted }}>Pricing</span>
                <span style={{ fontFamily: M, fontWeight: 800, color: C.cyan, textAlign: 'right' }}>
                  TBC
                </span>
              </div>
              <button onClick={requestQuote} style={{ width: '100%', padding: '0.75rem', borderRadius: 10, background: C.primary, color: 'var(--color-on-brand)', fontWeight: 700, fontSize: '0.85rem', border: 'none', cursor: 'pointer', marginBottom: 8 }}>
                Request Custom Quote
              </button>
              <button onClick={() => navigate('/marketplace')} style={{ width: '100%', padding: '0.6rem', borderRadius: 8, border: 'none', background: 'transparent', color: C.muted, fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer' }}>
                View Similar Services
              </button>
            </div>
          </div>
        </div>

        {/* SERVICE FAQ — honest platform-voice answers */}
        <div style={{ marginTop: '2.5rem' }}>
          <h2 style={{ fontFamily: M, fontWeight: 800, fontSize: '1.3rem', color: C.title, margin: '0 0 1.25rem' }}>Frequently Asked Questions</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxWidth: 800 }}>
            {[
              { q: 'Who provides this service?', a: 'The providers listed for this service are companies registered on Nhaav. Each provider card shows their verified status, experience, and completed jobs as recorded on the platform.' },
              { q: 'How is pricing determined?', a: 'Pricing is confirmed by quotation: submit a request and providers covering your port respond with offers for you to compare. Marketplace prices are shown as TBC for this demo.' },
              { q: 'What if no providers are shown for my port?', a: 'If a port shows no providers, coverage has not been established there yet. You can still submit a request, and providers covering nearby ports may respond.' },
            ].map((faq, i) => (
              <div key={i} style={{ background: C.bgCard, borderRadius: 16, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
                <button onClick={() => setExpandedFaq(expandedFaq === i ? null : i)} style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.25rem 1.5rem', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                  <span style={{ fontFamily: M, fontWeight: 700, fontSize: '0.95rem', color: C.title }}>{faq.q}</span>
                  <span className="material-symbols-outlined" style={{ color: C.muted, transition: 'transform 0.2s', transform: expandedFaq === i ? 'rotate(180deg)' : 'none' }}>expand_more</span>
                </button>
                {expandedFaq === i && (
                  <div style={{ padding: '0 1.5rem 1.25rem' }}>
                    <p style={{ fontSize: '0.85rem', color: C.muted, margin: 0, lineHeight: 1.6 }}>{faq.a}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
};
