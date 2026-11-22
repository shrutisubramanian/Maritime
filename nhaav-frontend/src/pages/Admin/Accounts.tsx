import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import AdminSidebar from '../../components/AdminSidebar';
import {
  ACCOUNT_STAGES,
  AccountStage,
  STAGE_LABELS,
  adminOverviewService,
  stageQueuePath,
  AdminAccountsResponse,
} from '../../services/adminOverview';

const C = {
  bg:        'var(--color-background)',
  border:    'var(--color-border)',
  text:      'var(--color-text)',
  muted:     'var(--color-muted)',
  dim:       'var(--color-faint)',
  primary:   'var(--color-brand)',
  error:     'var(--color-error)',
  errorCont: 'var(--color-error-tint)',
  success:   'var(--color-success)',
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

const fmtDate = (iso?: string | null): string => {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const roleLabel = (role: string | null): string => {
  if (role === 'client') return 'Client';
  if (role === 'provider') return 'Service provider';
  if (role === 'supplier') return 'Supplier';
  return role || '—';
};

const stageColor = (stage: AccountStage): string => {
  if (stage === 'complete') return C.success;
  if (stage === 'awaiting_payment' || stage === 'no_visibility') return C.primary;
  if (stage === 'unverified_email') return C.error;
  return C.muted;
};

/**
 * Account follow-up.
 *
 * Each account is classified into exactly ONE onboarding stage by the backend,
 * from stored facts only. There is no "last login" or follow-up history here
 * because the platform does not record either.
 */
export const Accounts: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [stage, setStage] = useState<string>(searchParams.get('stage') ?? '');
  const [role, setRole] = useState<string>(searchParams.get('role') ?? '');
  const [query, setQuery] = useState<string>(searchParams.get('q') ?? '');
  const [searchDraft, setSearchDraft] = useState<string>(searchParams.get('q') ?? '');
  const [createdFrom, setCreatedFrom] = useState('');
  const [createdTo, setCreatedTo] = useState('');
  const [page, setPage] = useState(1);

  const [data, setData] = useState<AdminAccountsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const limit = 20;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string | number> = { page, limit };
      if (stage) params.stage = stage;
      if (role) params.role = role;
      if (query.trim()) params.q = query.trim();
      if (createdFrom) params.created_from = createdFrom;
      if (createdTo) params.created_to = createdTo;
      setData(await adminOverviewService.getAccounts(params));
    } catch {
      setError('Could not load accounts. Check the filters and try again.');
    } finally {
      setLoading(false);
    }
  }, [page, stage, role, query, createdFrom, createdTo]);

  useEffect(() => { void load(); }, [load]);

  // Keep the URL shareable: a follow-up link can point at one exact stage.
  useEffect(() => {
    const next = new URLSearchParams();
    if (stage) next.set('stage', stage);
    if (role) next.set('role', role);
    if (query.trim()) next.set('q', query.trim());
    setSearchParams(next, { replace: true });
  }, [stage, role, query, setSearchParams]);

  const rows = data?.data ?? [];
  const stageCounts = data?.stage_counts;

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: C.bg, color: C.text, fontFamily: I, overflowX: 'clip' }}>
      <AdminSidebar />

      <main style={{ marginLeft: 'var(--sidebar-width, 256px)', flex: 1, minHeight: '100vh', transition: 'margin-left 0.3s cubic-bezier(0.4, 0, 0.2, 1)' }}>
        <header style={{ position: 'sticky', top: 0, zIndex: 40, height: 64, background: 'var(--bg-glass)', backdropFilter: 'blur(20px)', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', padding: '0 2rem' }}>
          <span className="material-symbols-outlined" style={{ color: C.primary, fontSize: '1.3rem', marginRight: '0.75rem' }}>person_search</span>
          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.15em' }}>Accounts &amp; Follow-up</span>
        </header>

        <div style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <section>
            <h2 style={{ fontFamily: M, fontWeight: 900, fontSize: 'clamp(1.8rem,3.5vw,2.3rem)', color: C.text, letterSpacing: '-0.04em', margin: '0 0 6px' }}>Account Follow-up</h2>
            <p style={{ color: C.muted, margin: 0, fontSize: '0.875rem', maxWidth: 760 }}>
              Every registered client and vendor, classified by the onboarding step it has actually reached.
              A verified account is not automatically paid, and a paid account is not automatically visible.
            </p>
          </section>

          {/* Stage tabs — counts cover the whole account table. */}
          <section style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            <button type="button" onClick={() => { setStage(''); setPage(1); }}
              style={{
                padding: '0.45rem 0.85rem', borderRadius: 999, cursor: 'pointer', fontFamily: M, fontWeight: 700, fontSize: '0.75rem',
                border: `1px solid ${stage === '' ? C.primary : C.border}`,
                background: stage === '' ? C.primCont : 'transparent', color: stage === '' ? C.primary : C.muted,
              }}>
              All accounts {data ? `(${data.total.toLocaleString('en-IN')})` : ''}
            </button>
            {ACCOUNT_STAGES.map(name => (
              <button key={name} type="button" onClick={() => { setStage(name); setPage(1); }}
                style={{
                  padding: '0.45rem 0.85rem', borderRadius: 999, cursor: 'pointer', fontFamily: M, fontWeight: 700, fontSize: '0.75rem',
                  border: `1px solid ${stage === name ? C.primary : C.border}`,
                  background: stage === name ? C.primCont : 'transparent',
                  color: stage === name ? C.primary : stageColor(name),
                }}>
                {STAGE_LABELS[name]} {stageCounts ? `(${stageCounts[name]})` : ''}
              </button>
            ))}
          </section>

          {/* Filters */}
          <section style={{ ...glass, borderRadius: 16, padding: '1rem', display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-end' }}>
            <form
              onSubmit={e => { e.preventDefault(); setQuery(searchDraft); setPage(1); }}
              style={{ display: 'flex', gap: '0.5rem', flex: '1 1 280px' }}>
              <input
                value={searchDraft}
                onChange={e => setSearchDraft(e.target.value)}
                placeholder="Company, contact name or e-mail"
                style={{ flex: 1, minWidth: 0, padding: '0.55rem 0.75rem', borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontFamily: I, fontSize: '0.8rem' }}
              />
              <button type="submit" style={{ padding: '0.55rem 0.9rem', borderRadius: 8, border: 'none', background: C.primary, color: 'var(--color-on-brand)', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer', fontFamily: M }}>
                Search
              </button>
            </form>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.65rem', color: C.dim, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              Account type
              <select value={role} onChange={e => { setRole(e.target.value); setPage(1); }}
                style={{ padding: '0.5rem 0.6rem', borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: '0.78rem', fontFamily: I }}>
                <option value="">All</option>
                <option value="client">Clients</option>
                <option value="vendor">All vendors</option>
                <option value="provider">Service providers</option>
                <option value="supplier">Suppliers</option>
              </select>
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.65rem', color: C.dim, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              Registered from
              <input type="date" value={createdFrom} onChange={e => { setCreatedFrom(e.target.value); setPage(1); }}
                style={{ padding: '0.45rem 0.6rem', borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: '0.78rem', fontFamily: I }} />
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.65rem', color: C.dim, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              to
              <input type="date" value={createdTo} onChange={e => { setCreatedTo(e.target.value); setPage(1); }}
                style={{ padding: '0.45rem 0.6rem', borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: '0.78rem', fontFamily: I }} />
            </label>

            <button type="button"
              onClick={() => { setStage(''); setRole(''); setQuery(''); setSearchDraft(''); setCreatedFrom(''); setCreatedTo(''); setPage(1); }}
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
              <div style={{ padding: '1.25rem' }}><div style={{ height: 160, borderRadius: 12, background: C.surface }} /></div>
            ) : rows.length === 0 ? (
              <div style={{ padding: '3rem 1.5rem', textAlign: 'center' }}>
                <p style={{ margin: '0 0 4px', fontWeight: 700, color: C.text, fontSize: '0.9rem' }}>No accounts match these filters</p>
                <p style={{ margin: 0, color: C.muted, fontSize: '0.8rem' }}>
                  {data && data.stage_counts && Object.values(data.stage_counts).some(v => v > 0)
                    ? 'Try another stage, account type or date range.'
                    : 'No client or vendor accounts have registered yet.'}
                </p>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 860 }}>
                  <thead>
                    <tr style={{ background: C.surface }}>
                      {['Company / Account', 'Type', 'Onboarding stage', 'Verified', 'Registered', ''].map(head => (
                        <th key={head} style={{ textAlign: 'left', padding: '0.7rem 1.1rem', fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.12em', color: C.dim, fontWeight: 700 }}>{head}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(row => (
                      <tr key={row.user_id} style={{ borderTop: `1px solid ${C.border}` }}>
                        <td style={{ padding: '0.8rem 1.1rem' }}>
                          <p style={{ margin: 0, fontSize: '0.8rem', fontWeight: 700, color: C.text }}>{row.company_name || row.full_name || 'Unnamed account'}</p>
                          <p style={{ margin: 0, fontSize: '0.68rem', color: C.dim }}>{row.email}{row.country ? ` · ${row.country}` : ''}</p>
                        </td>
                        <td style={{ padding: '0.8rem 1.1rem', fontSize: '0.74rem', color: C.muted }}>{roleLabel(row.role)}</td>
                        <td style={{ padding: '0.8rem 1.1rem' }}>
                          <span style={{
                            fontSize: '0.65rem', fontWeight: 700, padding: '3px 8px', borderRadius: 999,
                            background: row.stage === 'complete' ? 'rgba(22,163,74,0.1)' : C.surface,
                            color: stageColor(row.stage),
                          }}>
                            {STAGE_LABELS[row.stage] ?? row.stage}
                          </span>
                        </td>
                        <td style={{ padding: '0.8rem 1.1rem', fontSize: '0.7rem', color: row.verification_status === 'verified' ? C.success : C.muted, textTransform: 'capitalize' }}>
                          {row.verification_status.replace('_', ' ')}
                          {!row.email_verified && <span style={{ display: 'block', color: C.error, fontSize: '0.62rem', fontWeight: 700 }}>e-mail unverified</span>}
                        </td>
                        <td style={{ padding: '0.8rem 1.1rem', fontSize: '0.7rem', color: C.dim }}>{fmtDate(row.created_at)}</td>
                        <td style={{ padding: '0.8rem 1.1rem', textAlign: 'right' }}>
                          <button type="button"
                            onClick={() => navigate(stageQueuePath(row.stage, row.role))}
                            style={{ border: `1px solid ${C.border}`, background: 'transparent', color: C.primary, borderRadius: 8, padding: '0.35rem 0.65rem', fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                            {row.stage === 'complete' ? 'Open profile' : row.stage === 'awaiting_payment' ? 'Payment queue' : row.stage === 'no_visibility' ? 'Visibility queue' : 'Review'}
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
                {data ? `${data.total.toLocaleString('en-IN')} account${data.total === 1 ? '' : 's'} · page ${data.page} of ${Math.max(1, data.pages)}` : '—'}
              </span>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button type="button" disabled={page <= 1 || loading} onClick={() => setPage(p => Math.max(1, p - 1))}
                  style={{ padding: '0.35rem 0.7rem', borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', color: page <= 1 ? C.dim : C.text, cursor: page <= 1 ? 'not-allowed' : 'pointer', fontSize: '0.72rem', fontWeight: 700 }}>Previous</button>
                <button type="button" disabled={loading || (data ? page >= data.pages : true)} onClick={() => setPage(p => p + 1)}
                  style={{ padding: '0.35rem 0.7rem', borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', color: data && page < data.pages ? C.text : C.dim, cursor: data && page < data.pages ? 'pointer' : 'not-allowed', fontSize: '0.72rem', fontWeight: 700 }}>Next</button>
              </div>
            </div>
          </section>

          <p style={{ margin: 0, fontSize: '0.72rem', color: C.dim, lineHeight: 1.6 }}>
            Stages are derived from stored facts: e-mail verification, company profile existence,
            uploaded documents, profile approval, an unexpired subscription (clients) and unexpired paid
            visibility or a running legacy listing window (vendors). Last sign-in and follow-up notes are
            not recorded by the platform, so they are not displayed.
          </p>
        </div>
      </main>
    </div>
  );
};

export default Accounts;
