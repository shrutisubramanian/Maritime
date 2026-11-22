import React, { useCallback, useEffect, useState } from 'react';
import AdminSidebar from '../../components/AdminSidebar';
import { adminListingFeesService, type AdminListingFee } from '../../services/adminListingFees';
import { formatPaise } from '../../services/subscription';

/**
 * Admin review queue for vendor marketplace showcase payments.
 *
 * Vendors have no usage passes and no session time limit — their money buys how
 * long a listing is SHOWN, and there are exactly two choices:
 *
 *   ₹1,000  -> 1 month   (30 days)
 *   ₹10,000 -> 1 year    (365 days)
 *
 * Both are offered on every submission and the reviewer picks one; the server
 * refuses a period that does not match the amount actually received, so the
 * choice is "according to what they paid" rather than an override.
 *
 * Approving VERIFIES the bank transfer: that is the only thing that stamps the
 * window on the listing. It is not enough on its own — the listing also has to
 * have passed content moderation to appear, and rejecting leaves the listing
 * untouched (it simply stays unpublished). A UTR alone is not proof: confirming
 * the transfer against the bank account is the reviewer's responsibility, same
 * as subscription payments.
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
  error: 'var(--color-error)',
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
const btn: React.CSSProperties = {
  padding: '0.4rem 0.8rem',
  borderRadius: 8,
  border: 'none',
  fontSize: '0.76rem',
  fontWeight: 700,
  cursor: 'pointer',
  fontFamily: I,
};

type Tab = undefined | 'VERIFIED' | 'REJECTED';

const dateLabel = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

export const ListingFees: React.FC = () => {
  const [fees, setFees] = useState<AdminListingFee[]>([]);
  const [tab, setTab] = useState<Tab>(undefined);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await adminListingFeesService.list(tab);
      setFees(res.data || []);
    } catch (err) {
      console.error('Failed to load listing fees:', err);
      setLoadError('Could not load listing-fee submissions. You may need to sign in as an admin.');
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => { load(); }, [load]);

  /** The plan a submission's amount corresponds to, so the UI can guide the pick. */
  const paidPlan = (fee: AdminListingFee): 'month' | 'year' | null => {
    if (fee.period_days === 365) return 'year';
    if (fee.period_days === 30) return 'month';
    return null;
  };

  const approve = async (fee: AdminListingFee, period: 'month' | 'year') => {
    setBusyId(fee.id);
    setError(null);
    setNotice(null);
    try {
      const result = await adminListingFeesService.approve(fee.id, period);
      const moderationBlock =
        fee.listing_status && fee.listing_status !== 'approved'
          ? ` The listing is ${fee.listing_status.replace('_', ' ')}, so it goes live once moderation approves it.`
          : '';
      setNotice(
        `Verified ${formatPaise(fee.amount_paise, fee.currency)} from ${fee.owner_company ?? fee.owner_email ?? 'owner'} — ` +
          `“${fee.listing_name}” is showcased until ${dateLabel(result.expires_at)}.${moderationBlock}`,
      );
      await load();
    } catch (err) {
      const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
      setError(typeof detail === 'string' ? detail : 'Could not verify this payment.');
    } finally {
      setBusyId(null);
    }
  };

  const startReject = (fee: AdminListingFee) => {
    setRejectingId(fee.id);
    setRejectReason('');
    setError(null);
    setNotice(null);
  };

  const confirmReject = async (fee: AdminListingFee) => {
    if (rejectReason.trim().length < 3) {
      setError('A rejection reason of at least 3 characters is required.');
      return;
    }
    setBusyId(fee.id);
    try {
      await adminListingFeesService.reject(fee.id, rejectReason.trim());
      setNotice(`Rejected the ${formatPaise(fee.amount_paise, fee.currency)} payment for “${fee.listing_name}”.`);
      setRejectingId(null);
      setRejectReason('');
      await load();
    } catch (err) {
      const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
      setError(typeof detail === 'string' ? detail : 'Could not reject this payment.');
    } finally {
      setBusyId(null);
    }
  };

  const openReceipt = async (fee: AdminListingFee) => {
    try {
      await adminListingFeesService.openReceipt(fee.id);
    } catch {
      setError('Could not open the receipt.');
    }
  };

  const tabs: { label: string; value: Tab }[] = [
    { label: 'Awaiting review', value: undefined },
    { label: 'Verified', value: 'VERIFIED' },
    { label: 'Rejected', value: 'REJECTED' },
  ];

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: C.bg, fontFamily: I }}>
      <AdminSidebar activePath="/admin/listing-fees" />

      <main style={{ flex: 1, padding: '2rem 2.5rem', maxWidth: 1400, margin: '0 auto', width: '100%' }}>
        <p style={{ fontSize: '0.6rem', color: C.muted, letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 4 }}>
          Marketplace placements
        </p>
        <h1 style={{ fontFamily: M, fontWeight: 700, fontSize: '1.7rem', color: C.text, margin: '0 0 0.4rem' }}>
          Listing Fee Review
        </h1>
        <p style={{ fontSize: '0.85rem', color: C.muted, margin: '0 0 1.5rem', maxWidth: 880, lineHeight: 1.55 }}>
          Vendors pay for how long a listing is shown: <strong style={{ color: C.text }}>₹1,000 for 1 month</strong> or{' '}
          <strong style={{ color: C.text }}>₹10,000 for 1 year</strong>. Pick the period that matches the amount
          received — a ₹1,000 transfer can never be granted a year. Verifying is what starts that window, and only for
          listings that have also passed content moderation. Rejecting with a reason leaves the listing off the
          marketplace and lets the owner resubmit.
        </p>

        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
          {tabs.map(t => (
            <button
              key={t.label}
              onClick={() => setTab(t.value)}
              style={{
                padding: '0.45rem 1rem',
                borderRadius: 999,
                border: `1px solid ${C.border}`,
                background: tab === t.value ? C.brand : 'transparent',
                color: tab === t.value ? 'var(--color-on-brand)' : C.muted,
                fontWeight: 700,
                fontSize: '0.8rem',
                cursor: 'pointer',
              }}>
              {t.label}
            </button>
          ))}
        </div>

        {notice && (
          <div style={{ ...glass, borderRadius: 12, padding: '0.85rem 1rem', background: C.successTint, marginBottom: '1rem' }}>
            <p style={{ margin: 0, fontSize: '0.83rem', fontWeight: 600, color: C.successText }}>{notice}</p>
          </div>
        )}
        {error && (
          <div style={{ ...glass, borderRadius: 12, padding: '0.85rem 1rem', background: C.errorTint, marginBottom: '1rem' }}>
            <p style={{ margin: 0, fontSize: '0.83rem', fontWeight: 600, color: C.errorText }}>{error}</p>
          </div>
        )}

        <div style={{ ...glass, borderRadius: 14, overflow: 'hidden' }}>
          {loading ? (
            <p style={{ margin: 0, padding: '1.5rem', fontSize: '0.85rem', color: C.muted }}>Loading submissions…</p>
          ) : loadError ? (
            <p style={{ margin: 0, padding: '1.5rem', fontSize: '0.85rem', color: C.errorText }}>{loadError}</p>
          ) : fees.length === 0 ? (
            <p style={{ margin: 0, padding: '1.5rem', fontSize: '0.85rem', color: C.muted }}>
              {tab === undefined ? 'No listing payments are awaiting verification.' : 'Nothing in this view.'}
            </p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={th}>Listing</th>
                    <th style={th}>Type</th>
                    <th style={th}>Owner</th>
                    <th style={th}>Amount</th>
                    <th style={th}>UTR</th>
                    <th style={th}>Paid on</th>
                    <th style={th}>Moderation</th>
                    <th style={th}>Receipt</th>
                    <th style={th}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {fees.map(fee => {
                    const busy = busyId === fee.id;
                    const decided = fee.status !== 'PENDING' && fee.status !== 'SUBMITTED';
                    return (
                      <React.Fragment key={fee.id}>
                        <tr>
                          <td style={{ ...td, maxWidth: 260 }}>
                            <span style={{ fontWeight: 700 }}>{fee.listing_name || '—'}</span>
                            <span style={{ display: 'block', fontSize: '0.72rem', color: C.muted }}>
                              {fee.period_days === 365 ? '1 year' : fee.period_days === 30 ? '1 month' : `${fee.period_days}-day`}{' '}
                              showcase
                              {fee.status === 'VERIFIED' && fee.expires_at ? ` · live to ${dateLabel(fee.expires_at)}` : ''}
                            </span>
                          </td>
                          <td style={td}>
                            <span style={{ fontWeight: 700, textTransform: 'capitalize' }}>{fee.listing_type}</span>
                          </td>
                          <td style={td}>
                            <span style={{ fontWeight: 700 }}>{fee.owner_company ?? '—'}</span>
                            <span style={{ display: 'block', fontSize: '0.72rem', color: C.muted }}>
                              {fee.owner_email ?? 'unknown owner'}
                            </span>
                          </td>
                          <td style={{ ...td, fontFamily: M, fontWeight: 700 }}>
                            {formatPaise(fee.amount_paise, fee.currency)}
                          </td>
                          <td style={{ ...td, fontFamily: 'monospace', fontSize: '0.78rem' }}>{fee.utr}</td>
                          <td style={td}>{dateLabel(fee.payment_date)}</td>
                          <td style={td}>
                            <span
                              style={{
                                fontSize: '0.7rem',
                                fontWeight: 800,
                                textTransform: 'uppercase',
                                letterSpacing: '0.06em',
                                color:
                                  fee.listing_status === 'approved'
                                    ? C.successText
                                    : fee.listing_status === 'rejected'
                                      ? C.errorText
                                      : C.warningText,
                                background:
                                  fee.listing_status === 'approved'
                                    ? C.successTint
                                    : fee.listing_status === 'rejected'
                                      ? C.errorTint
                                      : C.warningTint,
                                padding: '3px 8px',
                                borderRadius: 999,
                              }}>
                              {(fee.listing_status ?? 'unknown').replace('_', ' ')}
                            </span>
                          </td>
                          <td style={td}>
                            <button onClick={() => openReceipt(fee)} style={{ ...btn, background: 'transparent', border: `1px solid ${C.border}`, color: C.text }}>
                              View
                            </button>
                          </td>
                          <td style={td}>
                            {decided ? (
                              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: fee.status === 'VERIFIED' ? C.successText : C.errorText }}>
                                {fee.status === 'VERIFIED' ? 'Verified' : fee.status === 'REJECTED' ? 'Rejected' : fee.status}
                              </span>
                            ) : rejectingId === fee.id ? (
                              <div style={{ display: 'grid', gap: 6, minWidth: 240 }}>
                                <input
                                  autoFocus
                                  value={rejectReason}
                                  onChange={e => setRejectReason(e.target.value)}
                                  placeholder="Reason shown to the owner"
                                  style={{
                                    width: '100%',
                                    boxSizing: 'border-box',
                                    padding: '0.4rem 0.55rem',
                                    borderRadius: 8,
                                    border: `1px solid ${C.border}`,
                                    background: 'var(--color-surface-alt)',
                                    color: C.text,
                                    fontSize: '0.78rem',
                                  }}
                                />
                                <div style={{ display: 'flex', gap: 6 }}>
                                  <button
                                    onClick={() => confirmReject(fee)}
                                    disabled={busy}
                                    style={{ ...btn, background: C.error, color: 'var(--color-text-inverse)', opacity: busy ? 0.7 : 1 }}>
                                    Confirm reject
                                  </button>
                                  <button
                                    onClick={() => setRejectingId(null)}
                                    style={{ ...btn, background: 'transparent', border: `1px solid ${C.border}`, color: C.muted }}>
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div style={{ display: 'grid', gap: 6, minWidth: 200 }}>
                                {/* The two showcase choices. The one that matches
                                    what they paid is the actionable one; the other
                                    stays visible but disabled, with the reason. */}
                                {(['month', 'year'] as const).map(period => {
                                  const matches = paidPlan(fee) === period;
                                  const label = period === 'month' ? 'Grant 1 month' : 'Grant 1 year';
                                  return (
                                    <button
                                      key={period}
                                      onClick={() => approve(fee, period)}
                                      disabled={busy || !matches}
                                      title={
                                        matches
                                          ? 'Verify the transfer and start this showcase period'
                                          : `They paid ${formatPaise(fee.amount_paise, fee.currency)} for ${
                                              paidPlan(fee) === 'year' ? '1 year' : '1 month'
                                            }, so this choice does not match the amount received.`
                                      }
                                      style={{
                                        ...btn,
                                        background: matches ? C.brand : 'transparent',
                                        border: matches ? 'none' : `1px dashed ${C.border}`,
                                        color: matches ? 'var(--color-on-brand)' : C.dim,
                                        cursor: matches && !busy ? 'pointer' : 'not-allowed',
                                        opacity: busy ? 0.7 : matches ? 1 : 0.65,
                                      }}>
                                      {busy && matches ? 'Working…' : label}
                                    </button>
                                  );
                                })}
                                <button
                                  onClick={() => startReject(fee)}
                                  disabled={busy}
                                  style={{ ...btn, background: 'transparent', border: `1px solid rgba(220,38,38,0.4)`, color: C.error }}>
                                  Reject
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                        {fee.status === 'REJECTED' && fee.rejection_reason && (
                          <tr>
                            <td colSpan={9} style={{ ...td, fontSize: '0.75rem', color: C.muted, background: C.errorTint }}>
                              Reason given to owner: {fee.rejection_reason}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default ListingFees;
