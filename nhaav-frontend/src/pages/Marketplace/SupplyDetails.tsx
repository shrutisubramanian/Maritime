import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { suppliesService, SupplyListing } from '../../services/supplies';
import { BrandLogo } from '../../components/BrandLogo';
import { profilesService } from '../../services/profiles';
import { providersService, Review } from '../../services/providers';
import { ReviewsSection } from '../../components/ReviewsSection';

const M = "'Manrope', sans-serif";
const I = "'Inter', sans-serif";

const C = {
  bg: 'var(--color-background)',
  bgCard: 'var(--color-surface)',
  bgLowest: 'var(--color-surface-alt)',
  border: 'var(--color-border)',
  text: 'var(--color-text)',
  muted: 'var(--color-muted)',
  dim: 'var(--color-faint)',
  cyan: 'var(--color-brand)',
  primary: 'var(--color-brand)',
  error: 'var(--color-error)',
  green: 'var(--color-success)',
};

export const SupplyDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [listing, setListing] = useState<SupplyListing | null>(null);
  const [supplier, setSupplier] = useState<{ id: string; user_id: string; company_name: string | null; phone: string | null; verification_status: string; rating_avg: number; jobs_completed: number; position?: string | null; bio?: string | null; years_experience?: number; ports_served?: string[] | null; badge_label?: string | null } | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!id) return;
      try {
        setLoading(true);
        const data = await suppliesService.getSupply(id);
        if (active) setListing(data);
      } catch (err) {
        console.error(err);
        if (active) setError('This listing is unavailable.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [id]);

  // Reviews people left for this supplier (its USER id), so the detail page
  // shows what buyers actually said, not just a star average.
  useEffect(() => {
    let active = true;
    if (!listing?.supplier_id) return;
    setReviewsLoading(true);
    providersService.getProviderReviews(listing.supplier_id)
      .then((data) => { if (active) setReviews(data); })
      .catch(() => { if (active) setReviews([]); })
      .finally(() => { if (active) setReviewsLoading(false); });
    return () => { active = false; };
  }, [listing?.supplier_id]);

  // Public supplier profile (safe fields only) for the sidebar.
  useEffect(() => {
    let active = true;
    if (!listing?.supplier_id) return;
    profilesService.getPublicProfileByUser(listing.supplier_id)
      .then((data: typeof supplier) => { if (active) setSupplier(data); })
      .catch(() => { /* sidebar falls back to the generic supplier label */ });
    return () => { active = false; };
  }, [listing?.supplier_id]);

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: I }}>
      <main style={{ maxWidth: 960, margin: '0 auto', padding: '2.5rem 2rem 5rem' }}>
        <button onClick={() => navigate('/')} aria-label="Nhaav home" style={{ background: 'none', border: 'none', padding: 0, marginBottom: '1rem', cursor: 'pointer' }}>
          <BrandLogo height={22} />
        </button>
        <button onClick={() => navigate('/marketplace/supplies')} style={{ background: 'none', border: 'none', color: C.cyan, fontWeight: 700, cursor: 'pointer', padding: 0, marginBottom: '1.5rem' }}>← Supplies Marketplace</button>

        {loading ? (
          <p style={{ color: C.muted }}>Loading…</p>
        ) : error || !listing ? (
          <p style={{ color: C.error }}>{error || 'Not found.'}</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '2rem', alignItems: 'start' }}>
            <div>
              <span style={{ fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em', color: C.cyan }}>{listing.category}</span>
              <h1 style={{ fontFamily: M, fontWeight: 800, fontSize: '2rem', margin: '0.5rem 0' }}>{listing.name}</h1>
              {listing.description && <p style={{ color: C.muted, lineHeight: 1.7 }}>{listing.description}</p>}

              {/* THE SUPPLIER — its profile sits right under the description,
                  so the company behind the item is never a click away. */}
              {supplier && (
                <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 16, padding: '1.5rem', marginTop: '1.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
                    <div>
                      <div style={{ fontSize: '0.6rem', fontWeight: 800, letterSpacing: '0.15em', textTransform: 'uppercase', color: C.dim, marginBottom: 4 }}>
                        Supplied by
                      </div>
                      <h2 style={{ fontFamily: M, fontWeight: 800, fontSize: '1.2rem', margin: 0 }}>
                        {supplier.company_name || 'Verified supplier'}
                      </h2>
                      {supplier.position && (
                        <div style={{ fontSize: '0.8rem', color: C.muted, marginTop: 2 }}>{supplier.position}</div>
                      )}
                    </div>
                    {supplier.verification_status === 'verified' && (
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
                        {supplier.badge_label || 'Verified'}
                      </span>
                    )}
                  </div>

                  <p style={{ fontSize: '0.88rem', color: C.muted, lineHeight: 1.7, margin: '0 0 1rem' }}>
                    {supplier.bio?.trim()
                      ? supplier.bio
                      : 'This supplier has not published a profile description yet.'}
                  </p>

                  <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', rowGap: '0.75rem', marginBottom: '1rem' }}>
                    {(supplier.years_experience ?? 0) > 0 && (
                      <div>
                        <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.dim }}>Experience</div>
                        <div style={{ fontFamily: M, fontWeight: 800, fontSize: '0.95rem' }}>
                          {supplier.years_experience} {(supplier.years_experience ?? 0) === 1 ? 'year' : 'years'}
                        </div>
                      </div>
                    )}
                    {supplier.rating_avg > 0 && (
                      <div>
                        <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.dim }}>Rating</div>
                        <div style={{ fontFamily: M, fontWeight: 800, fontSize: '0.95rem' }}>{supplier.rating_avg.toFixed(1)} ★</div>
                      </div>
                    )}
                    {supplier.jobs_completed > 0 && (
                      <div>
                        <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.dim }}>Jobs completed</div>
                        <div style={{ fontFamily: M, fontWeight: 800, fontSize: '0.95rem' }}>{supplier.jobs_completed}</div>
                      </div>
                    )}
                    {supplier.ports_served && supplier.ports_served.length > 0 && (
                      <div style={{ minWidth: 160, flex: '1 1 160px' }}>
                        <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.dim }}>Ports served</div>
                        <div style={{ fontSize: '0.82rem', fontWeight: 600 }}>
                          {supplier.ports_served.slice(0, 4).join(' · ')}
                          {supplier.ports_served.length > 4 ? ` +${supplier.ports_served.length - 4} more` : ''}
                        </div>
                      </div>
                    )}
                  </div>

                  <button
                    onClick={() => navigate(`/supplier/${supplier.user_id}`)}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0.55rem 1.1rem', borderRadius: 10, border: `1px solid ${C.border}`, background: 'transparent', color: C.cyan, fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}
                  >
                    View full supplier profile
                    <span className="material-symbols-outlined" style={{ fontSize: '0.95rem' }}>arrow_forward</span>
                  </button>
                </div>
              )}

              <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 16, padding: '1.5rem', marginTop: '1.5rem' }}>
                <h2 style={{ fontFamily: M, fontWeight: 700, fontSize: '1.1rem', margin: '0 0 1rem' }}>Specifications</h2>
                <dl style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', margin: 0 }}>
                  {[
                    ['Manufacturer', listing.manufacturer],
                    ['Model', listing.model_number],
                    ['Part number', listing.part_number],
                    ['Condition', listing.condition],
                    ['Country of origin', listing.country_of_origin],
                    ['Availability', listing.availability],
                    ['Lead time', listing.lead_time],
                    ['Minimum order', listing.minimum_order_quantity?.toString()],
                  ].filter(([, v]) => v).map(([k, v]) => (
                    <div key={k as string}>
                      <dt style={{ fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: C.dim, margin: 0 }}>{k}</dt>
                      <dd style={{ margin: '2px 0 0', fontSize: '0.9rem' }}>{v}</dd>
                    </div>
                  ))}
                </dl>
                {listing.specifications && Object.keys(listing.specifications).length > 0 && (
                  <dl style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', margin: '1rem 0 0', paddingTop: '1rem', borderTop: `1px solid ${C.border}` }}>
                    {Object.entries(listing.specifications).map(([k, v]) => (
                      <div key={k}>
                        <dt style={{ fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: C.dim, margin: 0 }}>{k}</dt>
                        <dd style={{ margin: '2px 0 0', fontSize: '0.9rem' }}>{v}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </div>

              {/* Demo marketplace: the stored figure and unit stay private. */}
              <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 16, padding: '1.5rem', marginTop: '1.5rem' }}>
                <div style={{ fontSize: '0.6rem', fontWeight: 800, letterSpacing: '0.15em', textTransform: 'uppercase', color: C.dim, marginBottom: '0.5rem' }}>Price</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontFamily: M, fontWeight: 800, fontSize: '1.6rem', color: C.text }}>
                    TBC
                  </span>
                </div>
              </div>

              {/* What other buyers said after their jobs. */}
              <ReviewsSection reviews={reviews} loading={reviewsLoading} style={{ marginTop: '1.5rem' }} />
            </div>

            <aside style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 16, padding: '1.5rem', position: 'sticky', top: 24 }}>
              <h2 style={{ fontFamily: M, fontWeight: 700, fontSize: '1.05rem', margin: '0 0 0.5rem' }}>Supplier</h2>
              <p style={{ color: C.text, fontSize: '0.95rem', fontWeight: 700, margin: '0 0 0.25rem' }}>
                {supplier?.company_name || 'Verified supplier'}
              </p>
              {supplier && (
                <p style={{ color: C.muted, fontSize: '0.8rem', margin: '0 0 0.5rem' }}>
                  {supplier.verification_status === 'verified' ? 'Verified' : 'Verification pending'}
                  {supplier.rating_avg > 0 ? ` · ${supplier.rating_avg.toFixed(1)}★` : ''}
                  {supplier.jobs_completed > 0 ? ` · ${supplier.jobs_completed} jobs` : ''}
                </p>
              )}
              {supplier?.phone && (
                <a
                  href={`tel:${supplier.phone}`}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, color: C.cyan, fontWeight: 700, fontSize: '0.85rem', textDecoration: 'none', marginBottom: '0.75rem' }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>call</span>
                  {supplier.phone}
                </a>
              )}
              {supplier && (
                <button onClick={() => navigate(`/supplier/${supplier.user_id}`)}
                  style={{ background: 'none', border: 'none', color: C.cyan, fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer', padding: 0, marginBottom: '0.75rem' }}>
                  View supplier profile →
                </button>
              )}
              {listing.ports && listing.ports.length > 0 && (
                <p style={{ color: C.dim, fontSize: '0.82rem', margin: '0 0 1rem' }}>Serves: {listing.ports.join(', ')}</p>
              )}
              <button onClick={() => navigate('/create-request?type=procurement')}
                style={{ width: '100%', padding: '0.8rem 1rem', background: C.primary, color: 'var(--color-on-brand)', border: 'none', borderRadius: 10, fontWeight: 800, cursor: 'pointer' }}>
                Request Quotation
              </button>
              <p style={{ color: C.dim, fontSize: '0.72rem', margin: '0.75rem 0 0', lineHeight: 1.5 }}>
                Nhaav is a discovery &amp; procurement platform. Create a procurement request and eligible suppliers will respond.
              </p>
            </aside>
          </div>
        )}
      </main>
    </div>
  );
};

export default SupplyDetails;
