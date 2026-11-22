import React, { useCallback, useEffect, useState } from 'react';
import AdminSidebar from '../../components/AdminSidebar';
import {
  adminProfileVisibilityService,
  type AdminVisibilityPayment,
} from '../../services/profileVisibility';
import { formatPaise } from '../../services/subscription';

/**
 * Admin review of paid COMPANY-PROFILE visibility.
 *
 * This is deliberately separate from "Listing Fees": a listing fee buys showcase
 * time for ONE service or supply listing, while a visibility payment buys
 * marketplace presence for the WHOLE company profile (all its approved
 * subcategories). The two queues stay apart so neither set of records is merged
 * or reinterpreted.
 *
 * Verifying a payment is the only thing that starts the paid window, and the
 * server refuses to activate it until the company profile itself is approved —
 * so approval and payment stay independent conditions.
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

type Tab = undefined | 'VERIFIED' | 'REJECTED';

const dateLabel = (iso: string | null | undefined): string =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const planLabel = (plan: string, days: number): string =>
  plan === 'annual' || days === 365 ? '12 months' : '1 month';

const apiMessage = (err: unknown, fallback: string): string => {
  const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  if (detail && typeof detail === 'object') {
    const message = (detail as { message?: unknown }).message;
    if (typeof message === 'string') return message;
  }
  return fallback;
};

export const ProfileVisibility: React.FC = () => {
  const [payments, setPayments] = useState<AdminVisibilityPayment[]>([]);
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
      const res = await adminProfileVisibilityService.list(tab);
      setPayments(res.data || []);
    } catch (err) {
      console.error('Failed to load visibility payments:', err);
      setLoadError('Could not load visibility payments. You may need to sign in as an admin.');
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    void load();
  }, [load]);

  const verify = async (payment: AdminVisibilityPayment) => {
    setBusyId(payment.id);
    setError(null);
    setNotice(null);
    try {
      const result = await adminProfileVisibilityService.verify(payment.id);
      setNotice(
        `Verified ${formatPaise(payment.total_amount_paise, payment.currency)} from ` +
          `${payment.owner_company ?? payment.owner_email ?? 'company'} — profile visible until ` +
          `${dateLabel(result.expires_at)}.`,
      );
      await load();
    } catch (err) {
      setError(apiMessage(err, 'Could not verify this payment.'));
    } finally {
      setBusyId(null);
    }
  };

  const confirmReject = async (payment: AdminVisibilityPayment) => {
    if (rejectReason.trim().length < 3) {
      setError('A rejection reason of at least 3 characters is required.');
      return;
    }
    setBusyId(payment.id);
    setError(null);
    setNotice(null);
    try {
      await adminProfileVisibilityService.reject(payment.id, rejectReason.trim());
      setNotice(
        `Rejected the ${formatPaise(payment.total_amount_paise, payment.currency)} visibility payment from ` +
          `${payment.owner_company ?? payment.owner_email ?? 'company'}.`,
      );
      setRejectingId(null);
      setRejectReason('');
      await load();
    } catch (err) {
      setError(apiMessage(err, 'Could not reject this payment.'));
    } finally {
      setBusyId(null);
    }
  };

  const openReceipt = async (payment: AdminVisibilityPayment) => {
    try {
      await adminProfileVisibilityService.openReceipt(payment.id);
    } catch {
      setError('Could not open the receipt. It may be missing from storage.');
    }
  };

  const tabs: { label: string; value: Tab }[] = [
    { label: 'Awaiting review', value: undefined },
    { label: 'Verified', value: 'VERIFIED' },
    { label: 'Rejected', value: 'REJECTED' },
  ];

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: C.bg, fontFamily: I }}>
      <AdminSidebar activePath="/admin/profile-visibility" />

      <main style={{ flex: 1, padding: '2rem 2.5rem', maxWidth: 1400, margin: '0 auto', width: '100%' }}>
        <p style={{ fontSize: '0.6rem', color: C.muted, letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 4 }}>
          Company profiles
        </p>
        <h1 style={{ fontFamily: M, fontWeight: 700, fontSize: '1.7rem', color: C.text, margin: '0 0 0.4rem' }}>
          Marketplace Visibility Review
        </h1>
        <p style={{ fontSize: '0.85rem', color: C.muted, margin: '0 0 1.5rem', maxWidth: 900, lineHeight: 1.55 }}>
          A visibility payment publishes the company's <strong style={{ color: C.text }}>entire profile</strong> — every
          approved subcategory it declares — for <strong style={{ color: C.text }}>1 month (₹1,000 + GST)</strong> or{' '}
          <strong style={{ color: C.text }}>12 months (₹10,000 + GST)</strong>. Verifying the transfer starts that
          window, and only after the profile itself has been approved. This is separate from listing fees, which buy
          showcase time for one individual listing.
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
              }}
            >
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
          ) : payments.length === 0 ? (
            <p style={{ margin: 0, padding: '1.5rem', fontSize: '0.85rem', color: C.muted }}>
              {tab === undefined
                ? 'No company visibility payments are awaiting verification.'
                : 'Nothing in this view.'}
            </p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={th}>Company</th>
                    <th style={th}>Plan</th>
                    <th style={th}>Amount</th>
                    <th style={th}>UTR</th>
                    <th style={th}>Paid on</th>
                    <th style={th}>Profile</th>
                    <th style={th}>Visibility</th>
                    <th style={th}>Receipt</th>
                    <th style={th}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map(payment => {
                    const busy = busyId === payment.id;
                    const decided = payment.status !== 'PENDING' && payment.status !== 'SUBMITTED';
                    return (
                      <React.Fragment key={payment.id}>
                        <tr>
                          <td style={{ ...td, maxWidth: 260 }}>
                            <span style={{ fontWeight: 700 }}>{payment.owner_company ?? '—'}</span>
                            <span style={{ display: 'block', fontSize: '0.72rem', color: C.muted }}>
                              {payment.owner_email ?? 'unknown owner'}
                            </span>
                          </td>
                          <td style={td}>
                            <span style={{ fontWeight: 700 }}>{planLabel(payment.plan, payment.period_days)}</span>
                            <span style={{ display: 'block', fontSize: '0.72rem', color: C.muted }}>
                              {formatPaise(payment.base_amount_paise, payment.currency)} + {payment.gst_rate_percent}% GST
                            </span>
                          </td>
                          <td style={{ ...td, fontFamily: M, fontWeight: 700 }}>
                            {formatPaise(payment.total_amount_paise, payment.currency)}
                          </td>
                          <td style={{ ...td, fontFamily: 'monospace', fontSize: '0.78rem' }}>{payment.utr}</td>
                          <td style={td}>{dateLabel(payment.payment_date)}</td>
                          <td style={td}>
                            <span
                              style={{
                                fontSize: '0.7rem',
                                fontWeight: 800,
                                padding: '3px 8px',
                                borderRadius: 999,
                                background: payment.profile_approved ? C.successTint : C.warningTint,
                                color: payment.profile_approved ? C.successText : C.warningText,
                              }}
                            >
                              {payment.profile_approved ? 'APPROVED' : 'AWAITING APPROVAL'}
                            </span>
                          </td>
                          <td style={td}>
                            {payment.status === 'VERIFIED' && payment.expires_at ? (
                              <span style={{ fontSize: '0.75rem' }}>
                                to {dateLabel(payment.expires_at)}
                              </span>
                            ) : payment.current_visibility_expires_at ? (
                              <span style={{ fontSize: '0.75rem', color: C.muted }}>
                                legacy to {dateLabel(payment.current_visibility_expires_at)}
                              </span>
                            ) : (
                              <span style={{ fontSize: '0.75rem', color: C.muted }}>not visible</span>
                            )}
                          </td>
                          <td style={td}>
                            {payment.receipt_available ? (
                              <button
                                type="button"
                                onClick={() => void openReceipt(payment)}
                                style={{ padding: '0.35rem 0.7rem', borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', color: C.brand, fontWeight: 700, fontSize: '0.75rem', cursor: 'pointer' }}
                              >
                                Open
                              </button>
                            ) : (
                              <span style={{ fontSize: '0.75rem', color: C.muted }}>missing</span>
                            )}
                          </td>
                          <td style={td}>
                            {decided ? (
                              <span style={{ fontSize: '0.75rem', color: C.muted }}>
                                {payment.status === 'REJECTED' ? payment.rejection_reason ?? 'Rejected' : 'Verified'}
                              </span>
                            ) : (
                              <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                                <button
                                  type="button"
                                  disabled={busy || !payment.profile_approved}
                                  title={
                                    payment.profile_approved
                                      ? 'Verify the transfer and start the visible period'
                                      : 'Approve the company profile first; the payment stays on file'
                                  }
                                  onClick={() => void verify(payment)}
                                  style={{
                                    padding: '0.4rem 0.75rem',
                                    borderRadius: 8,
                                    border: 'none',
                                    background: payment.profile_approved ? C.brand : C.border,
                                    color: payment.profile_approved ? 'var(--color-on-brand)' : C.muted,
                                    fontWeight: 700,
                                    fontSize: '0.75rem',
                                    cursor: busy || !payment.profile_approved ? 'not-allowed' : 'pointer',
                                  }}
                                >
                                  {busy ? 'Working…' : 'Verify'}
                                </button>
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => {
                                    setRejectingId(payment.id);
                                    setRejectReason('');
                                    setError(null);
                                    setNotice(null);
                                  }}
                                  style={{ padding: '0.4rem 0.75rem', borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', color: C.errorText, fontWeight: 700, fontSize: '0.75rem', cursor: busy ? 'not-allowed' : 'pointer' }}
                                >
                                  Reject
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                        {rejectingId === payment.id && (
                          <tr>
                            <td colSpan={9} style={{ ...td, background: C.warningTint }}>
                              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                                <input
                                  value={rejectReason}
                                  onChange={e => setRejectReason(e.target.value)}
                                  placeholder="Reason shown to the company (at least 3 characters)"
                                  style={{ flex: '1 1 320px', padding: '0.5rem 0.7rem', borderRadius: 8, border: `1px solid ${C.border}`, background: C.bgCard, color: C.text, fontFamily: I, fontSize: '0.82rem' }}
                                />
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => void confirmReject(payment)}
                                  style={{ padding: '0.45rem 0.9rem', borderRadius: 8, border: 'none', background: C.error, color: '#fff', fontWeight: 700, fontSize: '0.78rem', cursor: busy ? 'not-allowed' : 'pointer' }}
                                >
                                  Confirm rejection
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setRejectingId(null)}
                                  style={{ padding: '0.45rem 0.9rem', borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', color: C.muted, fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer' }}
                                >
                                  Cancel
                                </button>
                              </div>
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

export default ProfileVisibility;
