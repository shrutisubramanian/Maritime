import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminSidebar from '../../components/AdminSidebar';
import { adminOverviewService, AdminOverview } from '../../services/adminOverview';

const C = {
  bg:         'var(--color-background)',
  border:     'var(--color-border)',
  borderV:    'var(--color-border-strong)',
  text:       'var(--color-text)',
  muted:      'var(--color-muted)',
  dim:        'var(--color-faint)',
  primary:    'var(--color-brand)',
  error:      'var(--color-error)',
  errorCont:  'var(--color-error-tint)',
  success:    'var(--color-success)',
  primCont:   'var(--color-brand-tint-solid)',
  surface:    'var(--color-surface-alt)',
};
const M = "'Manrope', sans-serif";
const I = "'Inter', sans-serif";

const glass: React.CSSProperties = {
  background: 'var(--color-surface)',
  boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
  border: `1px solid ${C.border}`,
  transition: 'all 0.3s ease',
};

const fmtDate = (iso?: string | null): string => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const fmtCount = (value: number | null | undefined): string =>
  value === null || value === undefined ? '—' : value.toLocaleString('en-IN');

const roleLabel = (role: string | null): string => {
  if (role === 'client') return 'Client';
  if (role === 'provider') return 'Service provider';
  if (role === 'supplier') return 'Supplier';
  return role || '—';
};

/**
 * Operational dashboard.
 *
 * ONE request (`GET /admin/overview`) feeds every number here, and each figure
 * is a SQL aggregate over the live tables. Metrics the schema cannot support
 * (last login, revenue trend, follow-up history) are deliberately absent.
 */
export const AdminPage: React.FC = () => {
  const navigate = useNavigate();
  const [data, setData] = useState<AdminOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await adminOverviewService.getOverview());
    } catch {
      setError('Could not load the operational overview.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const kpis = data ? [
    { label: 'Registered Accounts', value: data.accounts.total,           sub: `${data.accounts.registered_last_7_days} in the last 7 days`, path: '/admin/accounts', color: C.primary },
    { label: 'Client Accounts',     value: data.accounts.clients,         sub: 'Buyers',                    path: '/admin/accounts?role=client', color: C.text },
    { label: 'Vendor Accounts',     value: data.accounts.vendors,         sub: `${data.accounts.providers} providers · ${data.accounts.suppliers} suppliers`, path: '/admin/accounts?role=vendor', color: C.text },
    { label: 'Awaiting Verification', value: data.verification.pending,   sub: `${data.verification.verified} verified · ${data.verification.rejected} rejected`, path: '/admin/profiles', color: C.primary },
    { label: 'Payments To Review', value: data.payments.awaiting_review,  sub: `${data.payments.verified_last_30_days} approved in 30 days`, path: '/admin/payments', color: data.payments.awaiting_review > 0 ? C.error : C.text },
    { label: 'Active Visibility',  value: data.visibility.active,         sub: `${data.visibility.expired} expired · ${data.visibility.awaiting_review} awaiting review`, path: '/admin/profile-visibility', color: C.success },
    { label: 'Open Requests',      value: data.procurement.requests_open, sub: `${data.procurement.requests_total} requests all time`, path: '/admin/procurement', color: C.text },
    { label: 'Live Quotes',        value: data.procurement.quotes_live,   sub: 'Submitted or under review', path: '/admin/procurement', color: C.text },
  ] : [];

  const series = data?.accounts.registrations_series ?? [];
  const maxSeries = Math.max(1, ...series.map(point => point.count));

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: C.bg, color: C.text, fontFamily: I, overflowX: 'clip' }}>
      <AdminSidebar />

      <main style={{ marginLeft: 'var(--sidebar-width, 256px)', flex: 1, minWidth: 0, minHeight: '100vh', transition: 'margin-left 0.3s cubic-bezier(0.4, 0, 0.2, 1)' }}>
        <header style={{ position: 'sticky', top: 0, zIndex: 40, height: 64, background: 'var(--bg-glass)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <span className="material-symbols-outlined" style={{ color: C.primary, fontSize: '1.3rem' }}>shield_person</span>
            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.15em' }}>Administrative Terminal</span>
          </div>
          {data && (
            <span style={{ fontSize: '0.7rem', color: C.dim }}>
              Live data · generated {fmtDate(data.generated_at)}
            </span>
          )}
        </header>

        <div style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          <section>
            <h2 style={{ fontFamily: M, fontWeight: 900, fontSize: 'clamp(2rem,4vw,2.5rem)', color: C.text, letterSpacing: '-0.04em', margin: '0 0 4px' }}>Admin Dashboard</h2>
            <p style={{ color: C.muted, margin: 0, fontSize: '0.875rem' }}>
              Platform activity, onboarding follow-up and procurement oversight — measured from the live database.
            </p>
          </section>

          {error && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', padding: '1rem 1.25rem', borderRadius: 16, border: '1px solid rgba(220,38,38,0.3)', background: C.errorCont, color: C.error, fontSize: '0.875rem', fontWeight: 600 }}>
              <span>{error}</span>
              <button type="button" onClick={() => void load()} style={{ border: '1px solid rgba(220,38,38,0.4)', background: 'transparent', color: C.error, borderRadius: 8, padding: '0.4rem 0.8rem', fontWeight: 700, cursor: 'pointer', fontFamily: M }}>
                Retry
              </button>
            </div>
          )}

          {/* KPIs */}
          <section className="mobile-grid-collapse" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
            {loading && !data
              ? Array.from({ length: 8 }).map((_, index) => (
                  <div key={index} style={{ ...glass, padding: '1.35rem', borderRadius: 16, height: 118 }} />
                ))
              : kpis.map(card => (
                  <button
                    key={card.label}
                    type="button"
                    onClick={() => navigate(card.path)}
                    style={{ ...glass, padding: '1.35rem', borderRadius: 16, textAlign: 'left', cursor: 'pointer', fontFamily: I }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = C.primary)}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = C.border)}>
                    <p style={{ fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.14em', color: C.dim, margin: '0 0 10px' }}>{card.label}</p>
                    <h3 style={{ fontFamily: M, fontWeight: 800, fontSize: '1.9rem', color: card.color, letterSpacing: '-0.04em', margin: '0 0 6px' }}>{fmtCount(card.value)}</h3>
                    <p style={{ fontSize: '0.68rem', color: C.dim, margin: 0 }}>{card.sub}</p>
                  </button>
                ))}
          </section>

          {/* Registrations trend + recent actions */}
          <section className="mobile-grid-collapse" style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '1rem', alignItems: 'stretch' }}>
            <div style={{ ...glass, padding: '1.5rem', borderRadius: 20 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
                <h4 style={{ fontFamily: M, fontWeight: 800, fontSize: '1rem', color: C.text, margin: 0 }}>New registrations · last 14 days</h4>
                <span style={{ fontSize: '0.7rem', color: C.dim }}>
                  {data ? `${data.accounts.registered_last_30_days} in the last 30 days` : '—'}
                </span>
              </div>

              {loading && !data ? (
                <div style={{ height: 140, borderRadius: 12, background: C.surface }} />
              ) : series.every(point => point.count === 0) ? (
                <p style={{ fontSize: '0.82rem', color: C.muted, margin: 0, padding: '2rem 0', textAlign: 'center' }}>
                  No accounts registered in the last 14 days.
                </p>
              ) : (
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 140 }}>
                  {series.map(point => (
                    <div key={point.date} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }} title={`${point.date}: ${point.count}`}>
                      <div style={{ width: '100%', height: `${(point.count / maxSeries) * 108}px`, minHeight: point.count > 0 ? 4 : 2, borderRadius: 4, background: point.count > 0 ? C.primary : C.borderV }} />
                      <span style={{ fontSize: '0.55rem', color: C.dim }}>{point.date.slice(8)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ ...glass, padding: '1.5rem', borderRadius: 20 }}>
              <h4 style={{ fontFamily: M, fontWeight: 800, fontSize: '1rem', color: C.text, margin: '0 0 1rem' }}>Recent administrative actions</h4>
              {loading && !data ? (
                <div style={{ height: 120, borderRadius: 12, background: C.surface }} />
              ) : (data?.recent_admin_actions.length ?? 0) === 0 ? (
                <p style={{ fontSize: '0.82rem', color: C.muted, margin: 0 }}>
                  No payment or moderation decisions have been recorded yet.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
                  {data?.recent_admin_actions.slice(0, 6).map((action, index) => (
                    <div key={`${action.created_at}-${index}`} style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', paddingBottom: '0.6rem', borderBottom: index < 5 ? `1px solid ${C.border}` : 'none' }}>
                      <div>
                        <p style={{ margin: 0, fontSize: '0.78rem', fontWeight: 700, color: C.text, textTransform: 'capitalize' }}>
                          {action.source === 'payment'
                            ? 'Payment'
                            : action.source === 'verification'
                              ? 'Verification'
                              : action.source === 'visibility'
                                ? 'Visibility'
                                : action.source === 'listing_fee'
                                  ? 'Listing fee'
                                  : 'Listing'}{' '}
                          {action.action.replace('_', ' ')}
                        </p>
                        <p style={{ margin: 0, fontSize: '0.68rem', color: C.dim }}>
                          {action.actor_role === 'admin' ? 'Administrator' : action.actor_role}
                          {action.reason ? ` · ${action.reason.slice(0, 40)}` : ''}
                        </p>
                      </div>
                      <span style={{ fontSize: '0.65rem', color: C.dim, whiteSpace: 'nowrap' }}>{fmtDate(action.created_at)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* Recent registrations */}
          <section style={{ ...glass, borderRadius: 20, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.25rem 1.5rem', borderBottom: `1px solid ${C.border}` }}>
              <h4 style={{ fontFamily: M, fontWeight: 800, fontSize: '1rem', color: C.text, margin: 0 }}>Recent account registrations</h4>
              <button type="button" onClick={() => navigate('/admin/accounts')} style={{ border: 'none', background: 'transparent', color: C.primary, fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                Follow-up view <span className="material-symbols-outlined" style={{ fontSize: '0.95rem' }}>arrow_forward</span>
              </button>
            </div>

            {loading && !data ? (
              <div style={{ padding: '1.5rem' }}>
                <div style={{ height: 80, borderRadius: 12, background: C.surface }} />
              </div>
            ) : (data?.recent_registrations.length ?? 0) === 0 ? (
              <p style={{ padding: '2rem 1.5rem', margin: 0, fontSize: '0.85rem', color: C.muted, textAlign: 'center' }}>
                No client or vendor accounts have registered yet.
              </p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
                  <thead>
                    <tr style={{ background: C.surface }}>
                      {['Company / Account', 'Role', 'Verification', 'Registered'].map(head => (
                        <th key={head} style={{ textAlign: 'left', padding: '0.7rem 1.5rem', fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.12em', color: C.dim, fontWeight: 700 }}>{head}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data?.recent_registrations.map(row => (
                      <tr key={row.user_id} style={{ borderTop: `1px solid ${C.border}` }}>
                        <td style={{ padding: '0.85rem 1.5rem' }}>
                          <p style={{ margin: 0, fontSize: '0.8rem', fontWeight: 700, color: C.text }}>{row.company_name || row.full_name || 'Unnamed account'}</p>
                          <p style={{ margin: 0, fontSize: '0.68rem', color: C.dim }}>{row.email}</p>
                        </td>
                        <td style={{ padding: '0.85rem 1.5rem', fontSize: '0.75rem', color: C.muted }}>{roleLabel(row.role)}</td>
                        <td style={{ padding: '0.85rem 1.5rem' }}>
                          <span style={{
                            fontSize: '0.65rem', fontWeight: 700, padding: '3px 8px', borderRadius: 999, textTransform: 'capitalize',
                            background: row.verification_status === 'verified' ? 'rgba(22,163,74,0.1)' : row.verification_status === 'rejected' ? C.errorCont : C.surface,
                            color: row.verification_status === 'verified' ? C.success : row.verification_status === 'rejected' ? C.error : C.muted,
                          }}>
                            {row.verification_status.replace('_', ' ')}
                          </span>
                          {!row.email_verified && (
                            <span style={{ marginLeft: 6, fontSize: '0.6rem', color: C.error, fontWeight: 700 }}>e-mail unverified</span>
                          )}
                        </td>
                        <td style={{ padding: '0.85rem 1.5rem', fontSize: '0.72rem', color: C.dim }}>{fmtDate(row.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Operational surfaces */}
          <section className="mobile-grid-collapse" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
            {[
              { icon: 'person_search', label: 'Accounts & Follow-up', desc: 'Who registered, and exactly which onboarding step each account stopped at.', path: '/admin/accounts' },
              { icon: 'person_check',  label: 'Client Approvals',     desc: 'Buyers: documents, platform-fee payment and account approvals.',          path: '/admin/verification' },
              { icon: 'storefront',    label: 'Vendor Approvals',     desc: 'Suppliers and service providers awaiting verification.',                  path: '/admin/vendors' },
              { icon: 'assignment',    label: 'Procurement Requests', desc: 'Inspect every customer request and its quote activity, read-only.',       path: '/admin/procurement' },
              { icon: 'account_balance', label: 'Pending Payments',   desc: 'Bank transfers awaiting an administrative decision.',                    path: '/admin/payments' },
              { icon: 'workspace_premium', label: 'Company Visibility', desc: 'Paid profile visibility: verify transfers and watch expiries.',         path: '/admin/profile-visibility' },
            ].map(s => (
              <button key={s.label} type="button" onClick={() => navigate(s.path)}
                style={{ ...glass, textAlign: 'left', padding: '1.4rem', borderRadius: 18, cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '0.6rem', alignItems: 'flex-start', fontFamily: I }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = C.primary)}
                onMouseLeave={e => (e.currentTarget.style.borderColor = C.border)}>
                <div style={{ width: 40, height: 40, borderRadius: 12, background: C.primCont, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span className="material-symbols-outlined" style={{ color: C.primary, fontSize: '1.3rem' }}>{s.icon}</span>
                </div>
                <h4 style={{ fontFamily: M, fontWeight: 800, fontSize: '0.95rem', color: C.text, margin: 0 }}>{s.label}</h4>
                <p style={{ fontSize: '0.75rem', color: C.muted, margin: 0, lineHeight: 1.55 }}>{s.desc}</p>
              </button>
            ))}
          </section>

          <div style={{ fontSize: '0.75rem', color: C.dim, lineHeight: 1.6 }}>
            <strong style={{ color: C.muted }}>Data scope.</strong> All figures are aggregates over accounts,
            profiles, bank-transfer payments, company-profile visibility, procurement requests and quotes.
            Last sign-in, revenue trends and follow-up notes are not stored by the platform, so they are not shown.
          </div>
        </div>
      </main>
    </div>
  );
};

export default AdminPage;
