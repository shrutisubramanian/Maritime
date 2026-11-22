import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminSidebar from '../../components/AdminSidebar';
import { apiClient } from '../../services/apiClient';

const C = {
  bg:         'var(--color-background)',
  bgLow:      'var(--color-surface-alt)',
  bgCard:     'var(--color-surface)',
  bgHigh:     'var(--color-surface-deep)',
  bgBright:   'var(--color-surface-deep)',
  border:     'var(--color-border)',
  borderV:    'var(--color-border-strong)',
  text:       'var(--color-text)',
  muted:      'var(--color-muted)',
  dim:        'var(--color-faint)',
  cyan:       'var(--color-brand)',
  primary:    'var(--color-brand)',
  secondary:  'var(--color-muted)',
  error:      'var(--color-error)',
  success:    'var(--color-success)',
  primCont:   'var(--color-brand-tint-solid)',
  cyanCont:   'var(--color-brand-tint-solid)',
  secCont:    'var(--color-surface-alt)',
};
const M = "'Manrope', sans-serif";
const I = "'Inter', sans-serif";

const glass: React.CSSProperties = {
  background: 'var(--color-surface)',
  boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
  border: `1px solid ${C.border}`,
  transition: 'all 0.3s ease',
};

interface ServiceItem {
  id: string;
  service_name: string;
  description: string;
  category: string;
  subcategory: string;
  verified_provider_count: number;
  ports_covered: number;
  ports: { port_name: string; provider_count: number }[];
}

// Every figure on this page comes from GET /marketplace/services (total, page,
// pages, verified provider counts, port coverage). Ratings, review counts,
// view/lead metrics, listing statuses, and featured flags are NOT displayed:
// the backend does not provide them, and per-row random values are fabrication.
export const MarketplaceServices: React.FC = () => {
  const navigate = useNavigate();
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchVal, setSearchVal] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [page, setPage] = useState(1);
  const perPage = 10;

  useEffect(() => {
    const fetchServices = async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const params: Record<string, string | number> = { page, limit: perPage };
        if (searchVal.trim()) params.search = searchVal.trim();
        if (categoryFilter) params.category_group = categoryFilter;
        const res = await apiClient.get('/marketplace/services', { params });
        setServices(res.data.data || []);
        setTotal(res.data.total ?? 0);
        setPages(res.data.pages ?? 1);
      } catch (err) {
        console.error('Failed to load marketplace services:', err);
        setLoadError('Could not load marketplace services.');
      } finally {
        setLoading(false);
      }
    };
    fetchServices();
  }, [searchVal, categoryFilter, page]);

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: C.bg, color: C.text, fontFamily: I, overflowX: 'clip' }}>
      <AdminSidebar />

      <div style={{ marginLeft: 'var(--sidebar-width, 256px)', flex: 1, display: 'flex', flexDirection: 'column', minHeight: '100vh', transition: 'margin-left 0.3s cubic-bezier(0.4, 0, 0.2, 1)' }}>

        {/* HEADER */}
        <header style={{ position: 'sticky', top: 0, zIndex: 40, height: 64, background: 'var(--bg-glass)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', borderBottom: `1px solid ${C.borderV}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '2rem', flex: 1 }}>
            <div style={{ position: 'relative', maxWidth: 420, flex: 1 }}>
              <span className="material-symbols-outlined" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: C.dim, fontSize: '1.1rem', pointerEvents: 'none' }}>search</span>
              <input type="text" placeholder="Search maritime services..." value={searchVal} onChange={e => { setSearchVal(e.target.value); setPage(1); }}
                style={{ width: '100%', background: C.bgLow, border: 'none', borderRadius: 999, padding: '8px 16px 8px 36px', fontSize: '0.875rem', color: C.text, fontFamily: I, outline: 'none', boxSizing: 'border-box' as const }} />
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px', borderRadius: 999 }}>
              <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg, var(--color-brand), var(--color-brand-grad-end))', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-on-brand)', fontWeight: 700, fontSize: '0.75rem' }}>AU</div>
              <div>
                <p style={{ fontSize: '0.75rem', fontWeight: 700, color: C.text, margin: 0, lineHeight: 1.2 }}>Admin</p>
              </div>
            </div>
          </div>
        </header>

        {/* MAIN CONTENT */}
        <main style={{ padding: '2rem', flex: 1, display: 'flex', flexDirection: 'column', gap: '2rem' }}>

          {/* Page Header */}
          <section style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <p style={{ fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.2em', color: C.cyan, margin: '0 0 4px' }}>Maritime B2B Infrastructure</p>
              <h2 style={{ fontFamily: M, fontWeight: 900, fontSize: 'clamp(2rem,4vw,2.5rem)', color: C.text, letterSpacing: '-0.04em', margin: '0 0 4px' }}>Marketplace Services</h2>
              <p style={{ color: C.dim, margin: 0, fontSize: '0.875rem' }}>All services currently listed on the Nhaav marketplace.</p>
            </div>
          </section>

          {/* KPI — the one real total this endpoint provides */}
          <section className="mobile-grid-collapse" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
            <div style={{ ...glass, padding: '1.5rem', borderRadius: 16 }}>
              <p style={{ fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em', color: C.dim, margin: '0 0 12px' }}>Listed Service Types</p>
              <h3 style={{ fontFamily: M, fontWeight: 800, fontSize: '2rem', color: C.primary, margin: 0 }}>{loading ? '…' : total.toLocaleString()}</h3>
            </div>
            <div style={{ ...glass, padding: '1.5rem', borderRadius: 16 }}>
              <p style={{ fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em', color: C.dim, margin: '0 0 12px' }}>Showing</p>
              <h3 style={{ fontFamily: M, fontWeight: 800, fontSize: '2rem', color: C.text, margin: 0 }}>{loading ? '…' : `${services.length} of ${total.toLocaleString()}`}</h3>
            </div>
            <div style={{ ...glass, padding: '1.5rem', borderRadius: 16 }}>
              <p style={{ fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em', color: C.dim, margin: '0 0 12px' }}>Pages</p>
              <h3 style={{ fontFamily: M, fontWeight: 800, fontSize: '2rem', color: C.text, margin: 0 }}>{loading ? '…' : pages}</h3>
            </div>
          </section>

          {/* Filters */}
          <section style={{ ...glass, padding: '1rem 1.5rem', borderRadius: 16, display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: C.dim }}>Category</span>
            <select value={categoryFilter} onChange={e => { setCategoryFilter(e.target.value); setPage(1); }}
              style={{ background: 'var(--color-surface)', border: 'none', borderBottom: `2px solid ${C.borderV}`, color: C.text, fontFamily: I, fontSize: '0.875rem', padding: '8px 12px', outline: 'none', cursor: 'pointer', minWidth: 160, boxSizing: 'border-box' as const }}>
              <option value="">All categories</option>
              <option value="technical">Technical</option>
              <option value="operational">Operational</option>
              <option value="logistics">Logistics</option>
              <option value="compliance">Compliance</option>
            </select>
          </section>

          {/* Table panel */}
          <section style={{ ...glass, borderRadius: 24, overflow: 'hidden' }}>
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--color-surface)' }}>
              <h4 style={{ fontFamily: M, fontWeight: 700, fontSize: '0.95rem', color: C.text, margin: 0 }}>Service Listings</h4>
              <span style={{ fontSize: '0.75rem', color: C.dim }}>{loading ? 'Loading…' : `${services.length} on this page`}</span>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--color-surface)', borderBottom: `1px solid ${C.border}` }}>
                    {['Service Details', 'Category', 'Verified Providers', 'Ports Covered'].map(h => (
                      <th key={h} style={{ padding: '1rem 1.5rem', textAlign: 'left', fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em', color: C.dim, whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={4} style={{ padding: '3rem', textAlign: 'center', color: C.dim }}>
                        <span className="material-symbols-outlined" style={{ fontSize: '2rem', color: C.primary, animation: 'spin 1s linear infinite' }}>sync</span>
                        <p style={{ margin: '8px 0 0', fontSize: '0.875rem' }}>Loading services...</p>
                      </td>
                    </tr>
                  ) : loadError ? (
                    <tr><td colSpan={4} style={{ padding: '3rem', textAlign: 'center', color: C.error }}>{loadError}</td></tr>
                  ) : services.length > 0 ? (
                    services.map(svc => (
                      <tr key={svc.id}
                        style={{ borderBottom: '1px solid rgba(0,0,0,0.06)', transition: 'background 0.2s' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-surface-alt)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                        {/* Service Details */}
                        <td style={{ padding: '1.25rem 1.5rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <div style={{ width: 44, height: 44, borderRadius: 12, background: C.primCont, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid rgba(37,99,235,0.15)`, flexShrink: 0 }}>
                              <span className="material-symbols-outlined" style={{ color: C.primary, fontSize: '1.3rem' }}>build</span>
                            </div>
                            <div>
                              <p style={{ fontSize: '0.875rem', fontWeight: 700, color: C.text, margin: '0 0 2px' }}>{svc.service_name}</p>
                              <p style={{ fontSize: '0.7rem', color: C.dim, margin: 0, maxWidth: 420 }}>{svc.description || ''}</p>
                            </div>
                          </div>
                        </td>
                        {/* Category */}
                        <td style={{ padding: '1.25rem 1.5rem' }}>
                          <span style={{ padding: '4px 10px', borderRadius: 999, fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', background: C.primCont, color: C.primary, border: `1px solid rgba(37,99,235,0.2)` }}>
                            {(svc.subcategory || svc.category || 'Other').toUpperCase()}
                          </span>
                        </td>
                        {/* Verified providers — real aggregate from the API */}
                        <td style={{ padding: '1.25rem 1.5rem', fontWeight: 700, color: C.text, fontSize: '0.875rem' }}>
                          {svc.verified_provider_count}
                        </td>
                        {/* Ports covered — real aggregate from the API */}
                        <td style={{ padding: '1.25rem 1.5rem', fontWeight: 700, color: C.text, fontSize: '0.875rem' }}>
                          {svc.ports_covered}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} style={{ padding: '3rem', textAlign: 'center', color: C.dim, fontStyle: 'italic' }}>
                        No services found matching current filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination — driven by the real page/pages values */}
            <div style={{ padding: '1.25rem 1.5rem', borderTop: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.75rem', color: C.dim }}>Items per page: <strong>{perPage}</strong></span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}
                  style={{ padding: '6px 14px', borderRadius: 8, background: 'none', border: `1px solid ${C.borderV}`, fontSize: '0.75rem', fontWeight: 600, color: page <= 1 ? C.dim : C.text, cursor: page <= 1 ? 'not-allowed' : 'pointer' }}>
                  Previous
                </button>
                <span style={{ fontSize: '0.8rem', color: C.text, fontWeight: 700 }}>Page {page} of {pages}</span>
                <button disabled={page >= pages} onClick={() => setPage(p => Math.min(pages, p + 1))}
                  style={{ padding: '6px 14px', borderRadius: 8, background: 'none', border: `1px solid ${C.borderV}`, fontSize: '0.75rem', fontWeight: 600, color: page >= pages ? C.dim : C.text, cursor: page >= pages ? 'not-allowed' : 'pointer' }}>
                  Next
                </button>
              </div>
            </div>
          </section>

          {/* Honest scope note */}
          <div style={{ ...glass, padding: '1.5rem', borderRadius: 16 }}>
            <h4 style={{ fontFamily: M, fontWeight: 700, fontSize: '0.95rem', color: C.text, margin: '0 0 0.5rem' }}>About this view</h4>
            <p style={{ fontSize: '0.85rem', color: C.muted, margin: 0, lineHeight: 1.6 }}>
              Figures show aggregated, database-backed counts per service. Per-service ratings,
              review counts, view/lead metrics, and listing statuses are not shown because the
              platform does not yet record them.
            </p>
          </div>
        </main>
      </div>
    </div>
  );
};

export default MarketplaceServices;
