import React, { useCallback, useEffect, useState } from 'react';
import AdminSidebar from '../../components/AdminSidebar';
import { adminPaymentsService, type PendingPayment } from '../../services/adminPayments';
import { formatPaise } from '../../services/subscription';

/**
 * Admin payment review queue.
 *
 * Approving verifies the bank transfer and activates the organization's
 * subscription (pack + passes + access gate) in one transaction on the server.
 * Rejecting requires a reason, which the organization sees on its payment.
 * Only an admin session can reach the API behind this page.
 */
const C = {
  bg: 'var(--color-background)',
  bgLow: 'var(--color-surface-alt)',
  bgCard: 'var(--color-surface)',
  border: 'var(--color-border)',
  borderV: 'var(--color-border-strong)',
  text: 'var(--color-text)',
  muted: 'var(--color-muted)',
  dim: 'var(--color-faint)',
  brand: 'var(--color-brand)',
  success: 'var(--color-success)',
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
  background: 'var(--color-surface)',
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

export const PendingPayments: React.FC = () => {
  const [payments, setPayments] = useState<PendingPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  // Verification is irreversible (it activates the plan and issues passes), so
  // it is confirmed explicitly instead of firing on the first click.
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await adminPaymentsService.getPending();
      setPayments(res.data || []);
    } catch (err) {
      console.error('Failed to load pending payments:', err);
      setLoadError('Could not load pending payments. You may need to sign in as an admin.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const approve = async (payment: PendingPayment) => {
    setBusyId(payment.id);
    setError(null);
    setNotice(null);
    try {
      const result = await adminPaymentsService.approve(payment.id);
      setNotice(
        result.already_processed
          ? `${payment.organization_name ?? 'Organization'} was already activated — nothing changed.`
          : `Verified ${payment.organization_name ?? 'organization'}: ${result.total_passes ?? 0} passes issued` +
            (result.expires_at ? `, subscription runs to ${new Date(result.expires_at).toLocaleDateString()}.` : '.'),
      );
      await load();
    } catch (err) {
      const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
      setError(typeof detail === 'string' ? detail : 'Could not approve this payment.');
    } finally {
      setBusyId(null);
    }
  };

  const startReject = (payment: PendingPayment) => {
    setRejectingId(payment.id);
    setRejectReason('');
    setError(null);
    setNotice(null);
  };

  const confirmReject = async (payment: PendingPayment) => {
    if (rejectReason.trim().length < 3) {
      setError('A rejection reason of at least 3 characters is required.');
      return;
    }
    setBusyId(payment.id);
    try {
      await adminPaymentsService.reject(payment.id, rejectReason.trim());
      setNotice(`Rejected the payment from ${payment.organization_name ?? 'organization'}. No passes were issued.`);
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

  const openReceipt = async (payment: PendingPayment) => {
    try {
      await adminPaymentsService.openReceipt(payment.id);
    } catch {
      setError('Could not open the receipt.');
    }
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: C.bg, fontFamily: I }}>
      <AdminSidebar activePath="/admin/payments" />

      <main style={{ flex: 1, padding: '2rem 2.5rem', maxWidth: 1400, margin: '0 auto', width: '100%' }}>
        <p style={{ fontSize: '0.6rem', color: C.text, letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 4 }}>
          Payment Review
        </p>
        <h1 style={{ fontFamily: M, fontWeight: 700, fontSize: '1.7rem', color: C.text, margin: '0 0 0.4rem' }}>
          Pending Payments
        </h1>
        <p style={{ fontSize: '0.85rem', color: C.text, margin: '0 0 1.5rem', maxWidth: 780 }}>
          Bank-transfer submissions awaiting verification. Approving activates the organization's subscription and
          issues its access passes; rejecting records a reason the organization can see. A UTR alone is not proof —
          confirming the transfer against the bank account is your responsibility.
        </p>

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
            <p style={{ margin: 0, padding: '1.5rem', fontSize: '0.85rem', color: C.muted }}>Loading payments…</p>
          ) : loadError ? (
            <p style={{ margin: 0, padding: '1.5rem', fontSize: '0.85rem', color: C.errorText }}>{loadError}</p>
          ) : payments.length === 0 ? (
            <p style={{ margin: 0, padding: '1.5rem', fontSize: '0.85rem', color: C.muted }}>
              No payments are awaiting verification.
            </p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={th}>Organization</th>
                    <th style={th}>Plan</th>
                    <th style={th}>Amount</th>
                    <th style={th}>UTR</th>
                    <th style={th}>Payment date</th>
                    <th style={th}>Submitted</th>
                    <th style={th}>Receipt</th>
                    <th style={th}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map(payment => {
                    const busy = busyId === payment.id;
                    return (
                      <React.Fragment key={payment.id}>
                        <tr>
                          <td style={td}>
                            <span style={{ fontWeight: 700 }}>{payment.organization_name ?? '—'}</span>
                            <span style={{ display: 'block', fontSize: '0.72rem', color: C.muted }}>
                              {payment.submitted_by_email ?? 'unknown submitter'}
                            </span>
                          </td>
                          <td style={td}>
                            {payment.plan_name}
                            <span style={{ display: 'block', fontSize: '0.72rem', color: C.muted }}>{payment.plan_code}</span>
                            <span style={{ display: 'inline-block', marginTop: 4, padding: '1px 6px', borderRadius: 999, background: C.bgLow, color: C.muted, fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                              {payment.purpose ?? 'subscription'}
                            </span>
                          </td>
                          <td style={{ ...td, fontFamily: M, fontWeight: 700 }}>
                            {formatPaise(payment.amount_paise, payment.currency)}
                            <span style={{ display: 'block', fontSize: '0.68rem', fontWeight: 600, color: C.muted }}>
                              incl. {formatPaise(payment.gst_paise, payment.currency)} GST
                            </span>
                          </td>
                          <td style={{ ...td, fontFamily: 'monospace', fontSize: '0.78rem' }}>{payment.utr}</td>
                          <td style={td}>{new Date(payment.payment_date).toLocaleDateString()}</td>
                          <td style={td}>
                            {payment.submitted_at ? new Date(payment.submitted_at).toLocaleString() : '—'}
                          </td>
                          <td style={td}>
                            {payment.receipt_available ? (
                              <button
                                type="button"
                                onClick={() => openReceipt(payment)}
                                style={{ background: 'none', border: 'none', color: C.brand, fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', padding: 0, textAlign: 'left' }}
                              >
                                {payment.receipt_filename}
                              </button>
                            ) : (
                              <span style={{ color: C.dim }}>unavailable</span>
                            )}
                          </td>
                          <td style={td}>
                            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => {
                                  setConfirmingId(payment.id);
                                  setRejectingId(null);
                                  setError(null);
                                  setNotice(null);
                                }}
                                style={{
                                  padding: '0.4rem 0.8rem', borderRadius: 8, border: 'none',
                                  background: C.success, color: 'var(--color-text-inverse)', fontWeight: 700,
                                  fontSize: '0.75rem', cursor: busy ? 'wait' : 'pointer', fontFamily: 'inherit',
                                }}
                              >
                                Approve
                              </button>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => startReject(payment)}
                                style={{
                                  padding: '0.4rem 0.8rem', borderRadius: 8,
                                  border: `1px solid ${C.error}`, background: 'transparent',
                                  color: C.errorText, fontWeight: 700, fontSize: '0.75rem',
                                  cursor: busy ? 'wait' : 'pointer', fontFamily: 'inherit',
                                }}
                              >
                                Reject
                              </button>
                            </div>
                          </td>
                        </tr>

                        {rejectingId === payment.id && (
                          <tr>
                            <td style={{ ...td, background: C.errorTint }} colSpan={8}>
                              <label
                                htmlFor={`reject-${payment.id}`}
                                style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: C.errorText, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.1em' }}
                              >
                                Rejection reason (shown to the organization)
                              </label>
                              <textarea
                                id={`reject-${payment.id}`}
                                value={rejectReason}
                                onChange={e => setRejectReason(e.target.value)}
                                placeholder="e.g. No matching credit found in the bank statement for this UTR"
                                style={{
                                  width: '100%', minHeight: 64, padding: '0.6rem 0.75rem', borderRadius: 10,
                                  border: `1px solid ${C.borderV}`, background: C.bgCard, color: C.text,
                                  fontSize: '0.82rem', fontFamily: 'inherit', resize: 'vertical',
                                }}
                              />
                              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.6rem' }}>
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => confirmReject(payment)}
                                  style={{
                                    padding: '0.45rem 0.9rem', borderRadius: 8, border: 'none',
                                    background: C.error, color: 'var(--color-text-inverse)', fontWeight: 700,
                                    fontSize: '0.75rem', cursor: busy ? 'wait' : 'pointer', fontFamily: 'inherit',
                                  }}
                                >
                                  Confirm rejection
                                </button>
                                <button
                                  type="button"
                                  onClick={() => { setRejectingId(null); setRejectReason(''); }}
                                  style={{
                                    padding: '0.45rem 0.9rem', borderRadius: 8, border: `1px solid ${C.border}`,
                                    background: 'transparent', color: C.muted, fontWeight: 600,
                                    fontSize: '0.75rem', cursor: 'pointer', fontFamily: 'inherit',
                                  }}
                                >
                                  Cancel
                                </button>
                              </div>
                            </td>
                          </tr>
                        )}

                        {confirmingId === payment.id && (
                          <tr>
                            <td style={{ ...td, background: C.successTint }} colSpan={8}>
                              <p style={{ margin: '0 0 0.65rem', fontSize: '0.82rem', fontWeight: 600, color: C.successText }}>
                                Verify {formatPaise(payment.amount_paise, payment.currency)} from{' '}
                                {payment.organization_name ?? 'this account'}? This marks the transfer VERIFIED,
                                activates the subscription and issues its access passes. It cannot be undone.
                              </p>
                              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => { setConfirmingId(null); void approve(payment); }}
                                  style={{
                                    padding: '0.45rem 0.9rem', borderRadius: 8, border: 'none',
                                    background: C.success, color: 'var(--color-text-inverse)', fontWeight: 700,
                                    fontSize: '0.75rem', cursor: busy ? 'wait' : 'pointer', fontFamily: 'inherit',
                                  }}
                                >
                                  Confirm verification
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmingId(null)}
                                  style={{
                                    padding: '0.45rem 0.9rem', borderRadius: 8, border: `1px solid ${C.border}`,
                                    background: 'transparent', color: C.muted, fontWeight: 600,
                                    fontSize: '0.75rem', cursor: 'pointer', fontFamily: 'inherit',
                                  }}
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

        {payments.length > 0 && (
          <p style={{ fontSize: '0.75rem', color: C.warningText, marginTop: '0.85rem' }}>
            Approving is transactional and idempotent: approving the same payment twice issues no second pack and
            does not extend the subscription again.
          </p>
        )}
      </main>
    </div>
  );
};

export default PendingPayments;
