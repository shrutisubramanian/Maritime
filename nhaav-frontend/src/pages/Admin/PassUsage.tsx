import React, { useCallback, useEffect, useState } from 'react';
import AdminSidebar from '../../components/AdminSidebar';
import {
  adminPassUsageService,
  type PassAccount,
  type PassRow,
  type PassUsageTotals,
} from '../../services/adminPassUsage';

/**
 * Admin pass usage console.
 *
 * Answers three questions for every client account: who is using passes, when
 * they used them, and how many are left. The numbers are the backend's own
 * entitlement rows (a pass IS one 6-hour session), so nothing here is estimated.
 */
const C = {
  bg: 'var(--color-background)',
  bgCard: 'var(--color-surface)',
  border: 'var(--color-border)',
  text: 'var(--color-text)',
  muted: 'var(--color-muted)',
  dim: 'var(--color-faint)',
  brand: 'var(--color-brand)',
  successText: 'var(--color-success-text)',
  successTint: 'var(--color-success-tint)',
  errorText: 'var(--color-error-text)',
  errorTint: 'var(--color-error-tint)',
  warningText: 'var(--color-warning-text)',
  warningTint: 'var(--color-warning-tint)',
};
const M = "'Manrope', sans-serif";
const I = "'Inter', sans-serif";

const glass: React.CSSProperties = {
  background: C.bgCard,
  boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
  border: `1px solid ${C.border}`,
};
const th: React.CSSProperties = {
  textAlign: 'left',
  fontSize: '0.68rem',
  fontWeight: 700,
  color: C.muted,
  textTransform: 'uppercase',
  letterSpacing: '0.1em',
  padding: '0.6rem 0.75rem',
  borderBottom: `1px solid ${C.border}`,
  whiteSpace: 'nowrap',
};
const td: React.CSSProperties = {
  fontSize: '0.82rem',
  color: C.text,
  padding: '0.75rem',
  borderBottom: `1px solid ${C.border}`,
  verticalAlign: 'top',
};

const fmt = (iso: string | null | undefined): string =>
  iso
    ? new Date(iso).toLocaleString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';

const fmtDuration = (seconds: number): string => {
  if (!seconds || seconds <= 0) return 'expired';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m left` : `${m}m left`;
};

const statusStyle = (status: string): React.CSSProperties => {
  if (status === 'ACTIVE') return { background: C.successTint, color: C.successText };
  if (status === 'CONSUMED') return { background: C.warningTint, color: C.warningText };
  if (status === 'EXPIRED') return { background: C.errorTint, color: C.errorText };
  return { background: 'var(--color-surface-alt)', color: C.muted };
};

export const PassUsage: React.FC = () => {
  const [accounts, setAccounts] = useState<PassAccount[]>([]);
  const [totals, setTotals] = useState<PassUsageTotals | null>(null);
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [history, setHistory] = useState<PassRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await adminPassUsageService.list({
        search: appliedSearch || undefined,
        limit: 100,
      });
      setAccounts(res.data || []);
      setTotals(res.totals || null);
    } catch (err) {
      console.error('Failed to load pass usage:', err);
      setLoadError('Could not load pass usage. You may need to sign in as an admin.');
    } finally {
      setLoading(false);
    }
  }, [appliedSearch]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleHistory = async (account: PassAccount) => {
    if (expanded === account.user_id) {
      setExpanded(null);
      return;
    }
    setExpanded(account.user_id);
    setHistory([]);
    setHistoryError(null);
    setHistoryLoading(true);
    try {
      const res = await adminPassUsageService.detail(account.user_id);
      setHistory(res.passes || []);
    } catch (err) {
      console.error('Failed to load pass history:', err);
      setHistoryError('Could not load this account’s pass history.');
    } finally {
      setHistoryLoading(false);
    }
  };

  const tiles = [
    { label: 'Accounts with passes', value: totals?.accounts ?? 0, sub: `${totals?.passes_total ?? 0} passes issued` },
    { label: 'Passes left', value: totals?.available ?? 0, sub: 'available to start a session' },
    { label: 'In use now', value: totals?.active ?? 0, sub: 'live 6-hour sessions' },
    { label: 'Used', value: totals?.consumed ?? 0, sub: `${totals?.expired ?? 0} lapsed unused` },
  ];

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: C.bg, fontFamily: I }}>
      <AdminSidebar activePath="/admin/pass-usage" />

      <main style={{ flex: 1, padding: '2rem 2.5rem', maxWidth: 1500, margin: '0 auto', width: '100%' }}>
        <p style={{ fontSize: '0.6rem', color: C.muted, letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 4 }}>
          Access passes
        </p>
        <h1 style={{ fontFamily: M, fontWeight: 700, fontSize: '1.7rem', color: C.text, margin: '0 0 0.4rem' }}>
          Pass Usage by Account
        </h1>
        <p style={{ fontSize: '0.85rem', color: C.muted, margin: '0 0 1.5rem', maxWidth: 940, lineHeight: 1.55 }}>
          Each pass is one <strong style={{ color: C.text }}>6-hour session</strong> and belongs to a single account.
          This page shows who is spending them, when each was activated, and how many remain — read directly from the
          entitlement records, including passes that ended by logout or by expiry.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
          {tiles.map(tile => (
            <div key={tile.label} style={{ ...glass, borderRadius: 12, padding: '0.9rem 1rem' }}>
              <p style={{ margin: 0, fontSize: '0.62rem', letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 700, color: C.muted }}>
                {tile.label}
              </p>
              <p style={{ margin: '0.25rem 0 0', fontFamily: M, fontWeight: 800, fontSize: '1.5rem', color: C.text }}>
                {tile.value}
              </p>
              <p style={{ margin: 0, fontSize: '0.7rem', color: C.dim }}>{tile.sub}</p>
            </div>
          ))}
        </div>

        <form
          onSubmit={e => {
            e.preventDefault();
            setAppliedSearch(search.trim());
          }}
          style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}
        >
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search account, company or e-mail"
            style={{
              flex: '1 1 320px',
              padding: '0.55rem 0.75rem',
              borderRadius: 8,
              border: `1px solid ${C.border}`,
              background: C.bgCard,
              color: C.text,
              fontFamily: I,
              fontSize: '0.85rem',
            }}
          />
          <button
            type="submit"
            style={{ padding: '0.55rem 1rem', borderRadius: 8, border: 'none', background: C.brand, color: 'var(--color-on-brand)', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' }}
          >
            Search
          </button>
          {appliedSearch && (
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setAppliedSearch('');
              }}
              style={{ padding: '0.55rem 1rem', borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', color: C.muted, fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' }}
            >
              Clear
            </button>
          )}
        </form>

        {loadError && (
          <div style={{ ...glass, borderRadius: 12, padding: '0.85rem 1rem', background: C.errorTint, marginBottom: '1rem' }}>
            <p style={{ margin: 0, fontSize: '0.83rem', fontWeight: 600, color: C.errorText }}>{loadError}</p>
          </div>
        )}

        <div style={{ ...glass, borderRadius: 14, overflow: 'hidden' }}>
          {loading ? (
            <p style={{ margin: 0, padding: '1.5rem', fontSize: '0.85rem', color: C.muted }}>Loading pass usage…</p>
          ) : accounts.length === 0 ? (
            <p style={{ margin: 0, padding: '1.5rem', fontSize: '0.85rem', color: C.muted }}>
              No account holds access passes yet. Passes are issued when a client’s platform fee is approved.
            </p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={th}>Account</th>
                    <th style={th}>Plan</th>
                    <th style={th}>Left</th>
                    <th style={th}>Used</th>
                    <th style={th}>Pass in use</th>
                    <th style={th}>Last used</th>
                    <th style={th}>Next lapse</th>
                    <th style={th}>History</th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.map(account => (
                    <React.Fragment key={account.user_id}>
                      <tr>
                        <td style={{ ...td, minWidth: 220 }}>
                          <span style={{ fontWeight: 700 }}>{account.company_name || account.full_name || '—'}</span>
                          <span style={{ display: 'block', fontSize: '0.72rem', color: C.muted }}>{account.email}</span>
                          <span style={{ display: 'block', fontSize: '0.65rem', color: C.dim }}>
                            {(account.plan?.name || account.plan?.code || 'no active plan')}
                            {account.plan?.expires_at ? ` · to ${fmt(account.plan.expires_at).split(',')[0]}` : ''}
                          </span>
                        </td>
                        <td style={td}>
                          <span style={{ fontFamily: M, fontWeight: 800, color: C.brand }}>{account.available_passes}</span>
                          <span style={{ fontSize: '0.72rem', color: C.muted }}> / {account.total_passes}</span>
                        </td>
                        <td style={td}>
                          <span style={{ fontWeight: 700 }}>{account.consumed_passes}</span>
                          <span style={{ display: 'block', fontSize: '0.7rem', color: C.muted }}>
                            {account.expired_passes} expired
                          </span>
                        </td>
                        <td style={td}>
                          {account.current_session ? (
                            <>
                              <span style={{ fontSize: '0.72rem', fontWeight: 700, color: C.successText }}>
                                {fmtDuration(account.current_session.remaining_seconds)}
                              </span>
                              <span style={{ display: 'block', fontSize: '0.7rem', color: C.muted }}>
                                since {fmt(account.current_session.activated_at)}
                              </span>
                            </>
                          ) : (
                            <span style={{ fontSize: '0.75rem', color: C.dim }}>not in a session</span>
                          )}
                        </td>
                        <td style={{ ...td, whiteSpace: 'nowrap' }}>{fmt(account.last_used_at)}</td>
                        <td style={{ ...td, whiteSpace: 'nowrap' }}>{fmt(account.next_unused_expiry)}</td>
                        <td style={td}>
                          <button
                            type="button"
                            onClick={() => void toggleHistory(account)}
                            style={{ padding: '0.35rem 0.7rem', borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', color: C.brand, fontWeight: 700, fontSize: '0.75rem', cursor: 'pointer' }}
                          >
                            {expanded === account.user_id ? 'Hide' : 'View'}
                          </button>
                        </td>
                      </tr>
                      {expanded === account.user_id && (
                        <tr>
                          <td colSpan={8} style={{ ...td, background: 'var(--color-surface-alt)' }}>
                            {historyLoading ? (
                              <p style={{ margin: 0, fontSize: '0.8rem', color: C.muted }}>Loading passes…</p>
                            ) : historyError ? (
                              <p style={{ margin: 0, fontSize: '0.8rem', color: C.errorText }}>{historyError}</p>
                            ) : (
                              <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                  <thead>
                                    <tr>
                                      <th style={th}>Pass</th>
                                      <th style={th}>Status</th>
                                      <th style={th}>Activated (used)</th>
                                      <th style={th}>Session ends</th>
                                      <th style={th}>Ended / consumed</th>
                                      <th style={th}>Valid until (unused)</th>
                                      <th style={th}>Issued by</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {history.map(pass => (
                                      <tr key={pass.pass_id}>
                                        <td style={{ ...td, fontFamily: 'monospace', fontSize: '0.72rem' }}>{pass.pass_id.slice(0, 8)}</td>
                                        <td style={td}>
                                          <span style={{ fontSize: '0.65rem', fontWeight: 800, padding: '2px 8px', borderRadius: 999, ...statusStyle(pass.status) }}>
                                            {pass.status}
                                          </span>
                                        </td>
                                        <td style={{ ...td, whiteSpace: 'nowrap' }}>{fmt(pass.activated_at)}</td>
                                        <td style={{ ...td, whiteSpace: 'nowrap' }}>{fmt(pass.expires_at)}</td>
                                        <td style={{ ...td, whiteSpace: 'nowrap' }}>{fmt(pass.consumed_at)}</td>
                                        <td style={{ ...td, whiteSpace: 'nowrap' }}>{fmt(pass.unused_expires_at)}</td>
                                        <td style={{ ...td, fontSize: '0.72rem', color: C.muted }}>{pass.pack_source ?? '—'}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default PassUsage;
