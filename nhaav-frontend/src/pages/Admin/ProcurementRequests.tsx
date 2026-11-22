import React, { useCallback, useEffect, useState } from 'react';
import AdminSidebar from '../../components/AdminSidebar';
import {
  adminOverviewService,
  AdminProcurementDetail,
  AdminProcurementResponse,
  AdminProcurementRow,
} from '../../services/adminOverview';

const C = {
  bg:        'var(--color-background)',
  border:    'var(--color-border)',
  borderV:   'var(--color-border-strong)',
  text:      'var(--color-text)',
  muted:     'var(--color-muted)',
  dim:       'var(--color-faint)',
  primary:   'var(--color-brand)',
  error:     'var(--color-error)',
  errorCont: 'var(--color-error-tint)',
  success:   'var(--color-success)',
  info:      'var(--color-info)',
  surface:   'var(--color-surface-alt)',
  primCont:  'var(--color-brand-tint-solid)',
};
const M = "'Manrope', sans-serif";
const I = "'Inter', sans-serif";

const glass: React.CSSProperties = {
  background: 'var(--color-surface)',
  boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
  border: `1px solid ${C.border}`,
};

const STATUS_OPTIONS = ['open', 'quoted', 'assigned', 'awarded', 'completed', 'cancelled'];

const fmtDate = (iso?: string | null): string => {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const fmtMoney = (amount: number, currency: string): string => {
  try {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: currency || 'INR', maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${currency || ''} ${amount.toLocaleString('en-IN')}`;
  }
};

const statusStyle = (status: string): React.CSSProperties => {
  if (status === 'open') return { background: 'rgba(37,99,235,0.08)', color: C.primary };
  if (status === 'awarded' || status === 'assigned' || status === 'completed') return { background: 'rgba(22,163,74,0.1)', color: C.success };
  if (status === 'cancelled') return { background: C.errorCont, color: C.error };
  return { background: C.surface, color: C.muted };
};

/**
 * Procurement oversight.
 *
 * Read-only by construction: it calls the admin oversight endpoints, which have
 * no write route. Opening a request never quotes, edits or acts for a customer.
 */
export const ProcurementRequests: React.FC = () => {
  const [data, setData] = useState<AdminProcurementResponse | null>(null);
  const [summary, setSummary] = useState<{ requests_total: number; quotes_total: number; requests_by_status: Record<string, number>; quotes_by_status: Record<string, number> } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchDraft, setSearchDraft] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [requestType, setRequestType] = useState('');
  const [createdFrom, setCreatedFrom] = useState('');
  const [createdTo, setCreatedTo] = useState('');
  const [sort, setSort] = useState<'newest' | 'oldest'>('newest');
  const [page, setPage] = useState(1);

  const [selected, setSelected] = useState<AdminProcurementRow | null>(null);
  const [detail, setDetail] = useState<AdminProcurementDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const limit = 15;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string | number> = { page, limit, sort };
      if (query.trim()) params.q = query.trim();
      if (status) params.status = status;
      if (requestType) params.request_type = requestType;
      if (createdFrom) params.created_from = createdFrom;
      if (createdTo) params.created_to = createdTo;
      const [list, totals] = await Promise.all([
        adminOverviewService.getProcurementRequests(params),
        adminOverviewService.getProcurementSummary(),
      ]);
      setData(list);
      setSummary(totals);
    } catch {
      setError('Could not load procurement requests.');
    } finally {
      setLoading(false);
    }
  }, [page, query, status, requestType, createdFrom, createdTo, sort]);

  useEffect(() => { void load(); }, [load]);

  const openDetail = async (row: AdminProcurementRow) => {
    setSelected(row);
    setDetail(null);
    setDetailError(null);
    setDetailLoading(true);
    try {
      setDetail(await adminOverviewService.getProcurementRequest(row.request_id));
    } catch {
      setDetailError('Could not load this request. It may have been removed.');
    } finally {
      setDetailLoading(false);
    }
  };

  const closeDetail = () => {
    setSelected(null);
    setDetail(null);
    setDetailError(null);
  };

  const resetFilters = () => {
    setSearchDraft('');
    setQuery('');
    setStatus('');
    setRequestType('');
    setCreatedFrom('');
    setCreatedTo('');
    setSort('newest');
    setPage(1);
  };

  const rows = data?.data ?? [];

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: C.bg, color: C.text, fontFamily: I, overflowX: 'clip' }}>
      <AdminSidebar />

      <main style={{ marginLeft: 'var(--sidebar-width, 256px)', flex: 1, minHeight: '100vh', transition: 'margin-left 0.3s cubic-bezier(0.4, 0, 0.2, 1)' }}>
        <header style={{ position: 'sticky', top: 0, zIndex: 40, height: 64, background: 'var(--bg-glass)', backdropFilter: 'blur(20px)', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', padding: '0 2rem' }}>
          <span className="material-symbols-outlined" style={{ color: C.primary, fontSize: '1.3rem', marginRight: '0.75rem' }}>assignment</span>
          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.15em' }}>Procurement Oversight</span>
        </header>

        <div style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <section>
            <h2 style={{ fontFamily: M, fontWeight: 900, fontSize: 'clamp(1.8rem,3.5vw,2.3rem)', color: C.text, letterSpacing: '-0.04em', margin: '0 0 6px' }}>Procurement Requests</h2>
            <p style={{ color: C.muted, margin: 0, fontSize: '0.875rem', maxWidth: 760 }}>
              Every customer request on the platform, with its quote activity. This view is strictly
              read-only: administrators cannot submit quotes, edit requests or act on a customer&apos;s behalf.
            </p>
          </section>

          {/* Real counts from the summary endpoint */}
          <section className="mobile-grid-collapse" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
            {[
              { label: 'Requests All Time', value: summary?.requests_total ?? 0 },
              { label: 'Open', value: summary?.requests_by_status?.open ?? 0 },
              { label: 'Awarded / Assigned', value: (summary?.requests_by_status?.awarded ?? 0) + (summary?.requests_by_status?.assigned ?? 0) },
              { label: 'Quotes All Time', value: summary?.quotes_total ?? 0 },
            ].map(card => (
              <div key={card.label} style={{ ...glass, padding: '1.1rem 1.25rem', borderRadius: 16 }}>
                <p style={{ fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.13em', color: C.dim, margin: '0 0 8px' }}>{card.label}</p>
                <h3 style={{ fontFamily: M, fontWeight: 800, fontSize: '1.6rem', color: C.text, margin: 0, letterSpacing: '-0.03em' }}>{card.value.toLocaleString('en-IN')}</h3>
              </div>
            ))}
          </section>

          {/* Filters */}
          <section style={{ ...glass, borderRadius: 16, padding: '1rem', display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-end' }}>
            <form onSubmit={e => { e.preventDefault(); setQuery(searchDraft); setPage(1); }} style={{ display: 'flex', gap: '0.5rem', flex: '1 1 280px' }}>
              <input
                value={searchDraft}
                onChange={e => setSearchDraft(e.target.value)}
                placeholder="Request ID, title, category, port, company or e-mail"
                style={{ flex: 1, minWidth: 0, padding: '0.55rem 0.75rem', borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: '0.8rem', fontFamily: I }}
              />
              <button type="submit" style={{ padding: '0.55rem 0.9rem', borderRadius: 8, border: 'none', background: C.primary, color: 'var(--color-on-brand)', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer', fontFamily: M }}>Search</button>
            </form>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.65rem', color: C.dim, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              Status
              <select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}
                style={{ padding: '0.5rem 0.6rem', borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: '0.78rem', fontFamily: I }}>
                <option value="">All</option>
                {STATUS_OPTIONS.map(option => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.65rem', color: C.dim, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              Type
              <select value={requestType} onChange={e => { setRequestType(e.target.value); setPage(1); }}
                style={{ padding: '0.5rem 0.6rem', borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: '0.78rem', fontFamily: I }}>
                <option value="">All</option>
                <option value="service">Service</option>
                <option value="supply">Supply</option>
              </select>
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.65rem', color: C.dim, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              Created from
              <input type="date" value={createdFrom} onChange={e => { setCreatedFrom(e.target.value); setPage(1); }}
                style={{ padding: '0.45rem 0.6rem', borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: '0.78rem', fontFamily: I }} />
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.65rem', color: C.dim, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              to
              <input type="date" value={createdTo} onChange={e => { setCreatedTo(e.target.value); setPage(1); }}
                style={{ padding: '0.45rem 0.6rem', borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: '0.78rem', fontFamily: I }} />
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.65rem', color: C.dim, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              Sort
              <select value={sort} onChange={e => { setSort(e.target.value as 'newest' | 'oldest'); setPage(1); }}
                style={{ padding: '0.5rem 0.6rem', borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: '0.78rem', fontFamily: I }}>
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
              </select>
            </label>

            <button type="button" onClick={resetFilters}
              style={{ padding: '0.55rem 0.8rem', borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', color: C.muted, fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}>
              Reset
            </button>
          </section>

          {error && (
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center', padding: '0.9rem 1.1rem', borderRadius: 12, background: C.errorCont, color: C.error, fontSize: '0.82rem', fontWeight: 600 }}>
              <span>{error}</span>
              <button type="button" onClick={() => void load()} style={{ border: '1px solid rgba(220,38,38,0.4)', background: 'transparent', color: C.error, borderRadius: 8, padding: '0.35rem 0.7rem', fontWeight: 700, cursor: 'pointer' }}>Retry</button>
            </div>
          )}

          {/* Table */}
          <section style={{ ...glass, borderRadius: 18, overflow: 'hidden' }}>
            {loading && !data ? (
              <div style={{ padding: '1.25rem' }}><div style={{ height: 180, borderRadius: 12, background: C.surface }} /></div>
            ) : rows.length === 0 ? (
              <div style={{ padding: '3rem 1.5rem', textAlign: 'center' }}>
                <p style={{ margin: '0 0 4px', fontWeight: 700, color: C.text, fontSize: '0.9rem' }}>No requests match these filters</p>
                <p style={{ margin: 0, color: C.muted, fontSize: '0.8rem' }}>
                  {(summary?.requests_total ?? 0) === 0
                    ? 'No procurement requests have been created yet.'
                    : 'Try a different status, type or date range.'}
                </p>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 940 }}>
                  <thead>
                    <tr style={{ background: C.surface }}>
                      {['Request', 'Requesting company', 'Category / port', 'Status', 'Quotes', 'Created', ''].map(head => (
                        <th key={head} style={{ textAlign: 'left', padding: '0.7rem 1.1rem', fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.12em', color: C.dim, fontWeight: 700 }}>{head}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(row => (
                      <tr key={row.request_id} style={{ borderTop: `1px solid ${C.border}` }}>
                        <td style={{ padding: '0.8rem 1.1rem' }}>
                          <p style={{ margin: 0, fontSize: '0.8rem', fontWeight: 700, color: C.text }}>{row.title}</p>
                          <p style={{ margin: 0, fontSize: '0.64rem', color: C.dim, fontFamily: 'monospace' }}>{row.request_id.slice(0, 8)} · {row.request_type}</p>
                        </td>
                        <td style={{ padding: '0.8rem 1.1rem' }}>
                          <p style={{ margin: 0, fontSize: '0.75rem', color: C.text }}>{row.client.company_name || 'Unnamed company'}</p>
                          <p style={{ margin: 0, fontSize: '0.66rem', color: C.dim }}>{row.client.email}</p>
                        </td>
                        <td style={{ padding: '0.8rem 1.1rem' }}>
                          <p style={{ margin: 0, fontSize: '0.75rem', color: C.text }}>{row.category}{row.subcategory ? ` · ${row.subcategory}` : ''}</p>
                          <p style={{ margin: 0, fontSize: '0.66rem', color: C.dim }}>{row.port}{row.vessel_name ? ` · ${row.vessel_name}` : ''}</p>
                        </td>
                        <td style={{ padding: '0.8rem 1.1rem' }}>
                          <span style={{ ...statusStyle(row.status), fontSize: '0.65rem', fontWeight: 700, padding: '3px 8px', borderRadius: 999, textTransform: 'capitalize' }}>{row.status}</span>
                        </td>
                        <td style={{ padding: '0.8rem 1.1rem', fontSize: '0.75rem', color: row.quote_count > 0 ? C.text : C.dim, fontWeight: row.quote_count > 0 ? 700 : 400 }}>{row.quote_count}</td>
                        <td style={{ padding: '0.8rem 1.1rem', fontSize: '0.7rem', color: C.dim }}>{fmtDate(row.created_at)}</td>
                        <td style={{ padding: '0.8rem 1.1rem', textAlign: 'right' }}>
                          <button type="button" onClick={() => void openDetail(row)}
                            style={{ border: `1px solid ${C.border}`, background: 'transparent', color: C.primary, borderRadius: 8, padding: '0.35rem 0.65rem', fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                            Inspect
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.85rem 1.1rem', borderTop: `1px solid ${C.border}` }}>
              <span style={{ fontSize: '0.72rem', color: C.dim }}>
                {data ? `${data.total.toLocaleString('en-IN')} request${data.total === 1 ? '' : 's'} · page ${data.page} of ${Math.max(1, data.pages)}` : '—'}
              </span>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button type="button" disabled={page <= 1 || loading} onClick={() => setPage(p => Math.max(1, p - 1))}
                  style={{ padding: '0.35rem 0.7rem', borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', color: page <= 1 ? C.dim : C.text, cursor: page <= 1 ? 'not-allowed' : 'pointer', fontSize: '0.72rem', fontWeight: 700 }}>Previous</button>
                <button type="button" disabled={loading || (data ? page >= data.pages : true)} onClick={() => setPage(p => p + 1)}
                  style={{ padding: '0.35rem 0.7rem', borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', color: data && page < data.pages ? C.text : C.dim, cursor: data && page < data.pages ? 'pointer' : 'not-allowed', fontSize: '0.72rem', fontWeight: 700 }}>Next</button>
              </div>
            </div>
          </section>
        </div>
      </main>

      {/* Read-only detail panel */}
      {selected && (
        <>
          <div onClick={closeDetail} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.35)', zIndex: 90 }} />
          <aside style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(560px, 100vw)', background: C.bg, borderLeft: `1px solid ${C.border}`, zIndex: 91, overflowY: 'auto', padding: '1.5rem', boxSizing: 'border-box' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', marginBottom: '1rem' }}>
              <div>
                <p style={{ margin: 0, fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.14em', color: C.dim, fontWeight: 700 }}>Request detail · read-only</p>
                <h3 style={{ fontFamily: M, fontWeight: 800, fontSize: '1.15rem', color: C.text, margin: '4px 0 0' }}>{selected.title}</h3>
              </div>
              <button type="button" onClick={closeDetail} aria-label="Close detail"
                style={{ border: `1px solid ${C.border}`, background: 'transparent', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', color: C.muted }}>
                <span className="material-symbols-outlined" style={{ fontSize: '1.1rem' }}>close</span>
              </button>
            </div>

            {detailLoading && <div style={{ height: 120, borderRadius: 12, background: C.surface }} />}

            {detailError && (
              <div style={{ padding: '0.8rem 1rem', borderRadius: 10, background: C.errorCont, color: C.error, fontSize: '0.8rem', fontWeight: 600 }}>{detailError}</div>
            )}

            {detail && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  {[
                    ['Status', detail.status],
                    ['Type', detail.request_type],
                    ['Category', detail.category + (detail.subcategory ? ` · ${detail.subcategory}` : '')],
                    ['Port', detail.port],
                    ['Vessel', detail.vessel_name || '—'],
                    ['Quantity', detail.quantity === null ? '—' : String(detail.quantity)],
                    ['Urgency', detail.urgency],
                    ['Created', fmtDate(detail.created_at)],
                  ].map(([label, value]) => (
                    <div key={label} style={{ ...glass, borderRadius: 10, padding: '0.6rem 0.75rem' }}>
                      <p style={{ margin: '0 0 2px', fontSize: '0.58rem', textTransform: 'uppercase', letterSpacing: '0.12em', color: C.dim, fontWeight: 700 }}>{label}</p>
                      <p style={{ margin: 0, fontSize: '0.78rem', color: C.text, textTransform: label === 'Status' || label === 'Urgency' || label === 'Type' ? 'capitalize' : 'none' }}>{value}</p>
                    </div>
                  ))}
                </div>

                {detail.description && (
                  <div>
                    <p style={{ margin: '0 0 4px', fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.12em', color: C.dim, fontWeight: 700 }}>Description</p>
                    <p style={{ margin: 0, fontSize: '0.8rem', color: C.text, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{detail.description}</p>
                  </div>
                )}

                <div style={{ ...glass, borderRadius: 12, padding: '0.85rem 1rem' }}>
                  <p style={{ margin: '0 0 4px', fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.12em', color: C.dim, fontWeight: 700 }}>Requesting company</p>
                  <p style={{ margin: 0, fontSize: '0.82rem', fontWeight: 700, color: C.text }}>{detail.client.company_name || 'Unnamed company'}</p>
                  <p style={{ margin: 0, fontSize: '0.72rem', color: C.muted }}>{detail.client.email || '—'}{detail.client.country ? ` · ${detail.client.country}` : ''}</p>
                </div>

                <div>
                  <p style={{ margin: '0 0 0.5rem', fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.12em', color: C.dim, fontWeight: 700 }}>
                    Quotes ({detail.quote_count})
                  </p>
                  {detail.quotes.length === 0 ? (
                    <p style={{ margin: 0, fontSize: '0.8rem', color: C.muted }}>No quotes submitted for this request.</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {detail.quotes.map(quote => (
                        <div key={quote.quote_id} style={{ ...glass, borderRadius: 10, padding: '0.65rem 0.8rem', display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'center' }}>
                          <div>
                            <p style={{ margin: 0, fontSize: '0.78rem', fontWeight: 700, color: C.text }}>{quote.provider.company_name || 'Provider'}</p>
                            <p style={{ margin: 0, fontSize: '0.66rem', color: C.dim }}>
                              {quote.status.replace('_', ' ')} · {fmtDate(quote.created_at)}
                              {quote.estimated_duration ? ` · ${quote.estimated_duration}` : ''}
                            </p>
                          </div>
                          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: C.text, whiteSpace: 'nowrap' }}>{fmtMoney(quote.amount, quote.currency)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <p style={{ margin: 0, fontSize: '0.7rem', color: C.dim, lineHeight: 1.55 }}>
                  Oversight view only. Customer documents, payment receipts and quote attachments are not
                  exposed here, and no action on this panel modifies the request or its quotes.
                </p>
              </div>
            )}
          </aside>
        </>
      )}
    </div>
  );
};

export default ProcurementRequests;
