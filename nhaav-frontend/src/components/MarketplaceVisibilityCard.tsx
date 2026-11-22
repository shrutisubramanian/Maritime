import React, { useCallback, useEffect, useState } from 'react';
import {
  profileVisibilityService,
  type MyVisibility,
  type VisibilityInstructions,
  type VisibilityPayment,
  type VisibilityPlan,
} from '../services/profileVisibility';
import { formatPaise } from '../services/subscription';

/**
 * Vendor-facing control for paid COMPANY-PROFILE visibility.
 *
 * Two conditions decide whether the company appears in the marketplace, and the
 * card keeps them visibly separate:
 *
 *   1. the profile itself must be admin-approved (handled in verification), and
 *   2. a company-profile visibility payment must be verified and unexpired.
 *
 * Submitting a bank transfer here grants nothing — an admin verifying it does.
 * ₹1,000 + GST buys one month, ₹10,000 + GST buys twelve; both figures come from
 * the API so the page can never drift from the server's price list.
 */
const C = {
  bgLow: 'var(--color-surface-alt)',
  bgCard: 'var(--color-surface)',
  border: 'var(--color-border)',
  text: 'var(--color-text)',
  muted: 'var(--color-muted)',
  dim: 'var(--color-faint)',
  brand: 'var(--color-brand)',
  success: 'var(--color-success-text)',
  successTint: 'var(--color-success-tint)',
  warning: 'var(--color-warning-text)',
  warningTint: 'var(--color-warning-tint)',
  error: 'var(--color-error-text)',
  errorTint: 'var(--color-error-tint)',
};
const M = "'Manrope', sans-serif";
const I = "'Inter', sans-serif";

const input: React.CSSProperties = {
  width: '100%',
  padding: '0.7rem 0.9rem',
  background: C.bgCard,
  border: `1px solid ${C.border}`,
  color: C.text,
  borderRadius: 8,
  outline: 'none',
  fontFamily: I,
  fontSize: '0.9rem',
  boxSizing: 'border-box',
};

const label: React.CSSProperties = {
  display: 'block',
  marginBottom: '0.4rem',
  color: C.muted,
  fontSize: '0.78rem',
  fontWeight: 600,
};

const statusChip = (
  text: string,
  tone: 'ok' | 'wait' | 'bad' | 'idle',
): React.ReactElement => (
  <span
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      padding: '3px 9px',
      borderRadius: 999,
      fontSize: '0.7rem',
      fontWeight: 700,
      background:
        tone === 'ok' ? C.successTint : tone === 'wait' ? C.warningTint : tone === 'bad' ? C.errorTint : C.bgCard,
      color: tone === 'ok' ? C.success : tone === 'wait' ? C.warning : tone === 'bad' ? C.error : C.muted,
      border: `1px solid ${C.border}`,
    }}
  >
    {text}
  </span>
);

const dateLabel = (iso: string | null | undefined): string =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const apiMessage = (err: unknown, fallback: string): string => {
  const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  if (detail && typeof detail === 'object') {
    const message = (detail as { message?: unknown }).message;
    if (typeof message === 'string') return message;
  }
  return fallback;
};

const paymentStatusChip = (payment: VisibilityPayment | null): React.ReactElement => {
  if (!payment) return statusChip('No payment yet', 'idle');
  switch (payment.status) {
    case 'SUBMITTED':
    case 'PENDING':
      return statusChip('Payment awaiting verification', 'wait');
    case 'VERIFIED':
      return statusChip('Payment verified', 'ok');
    case 'REJECTED':
      return statusChip('Payment rejected', 'bad');
    default:
      return statusChip('Payment cancelled', 'idle');
  }
};

export const MarketplaceVisibilityCard: React.FC = () => {
  const [instructions, setInstructions] = useState<VisibilityInstructions | null>(null);
  const [state, setState] = useState<MyVisibility | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [plan, setPlan] = useState<'monthly' | 'annual'>('monthly');
  const [utr, setUtr] = useState('');
  const [paidOn, setPaidOn] = useState(() => new Date().toISOString().slice(0, 10));
  const [receipt, setReceipt] = useState<File | null>(null);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [planData, mine] = await Promise.all([
        profileVisibilityService.getPlans(),
        profileVisibilityService.mine(),
      ]);
      setInstructions(planData.instructions);
      setState(mine);
    } catch (err) {
      setLoadError(
        apiMessage(
          err,
          'Could not load your marketplace visibility. Complete your company profile first.',
        ),
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const plans: VisibilityPlan[] = instructions?.plans ?? [];
  const latest = state?.latest_payment ?? null;
  const openSubmission =
    latest !== null && (latest.status === 'SUBMITTED' || latest.status === 'PENDING');

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);
    setNotice(null);

    if (!receipt) {
      setFormError('Attach the bank-transfer receipt (PDF, JPG or PNG).');
      return;
    }
    if (utr.trim().length < 6) {
      setFormError('Enter the UTR / transaction reference (at least 6 characters).');
      return;
    }

    setSubmitting(true);
    try {
      const payment = await profileVisibilityService.submit({
        plan,
        utr: utr.trim(),
        payment_date: paidOn,
        receipt,
        notes: notes.trim() || undefined,
      });
      setNotice(
        `Payment of ${formatPaise(payment.total_amount_paise, payment.currency)} submitted. ` +
          'Your profile becomes visible once an administrator verifies the transfer.',
      );
      setUtr('');
      setNotes('');
      setReceipt(null);
      await load();
    } catch (err) {
      setFormError(apiMessage(err, 'Could not submit this payment. Please try again.'));
    } finally {
      setSubmitting(false);
    }
  };

  const openReceipt = async (paymentId: string) => {
    try {
      await profileVisibilityService.openReceipt(paymentId);
    } catch {
      setFormError('Could not open the receipt.');
    }
  };

  if (loading) {
    return (
      <section style={{ background: C.bgLow, padding: '2rem', borderRadius: 16, border: `1px solid ${C.border}`, marginBottom: '2rem' }}>
        <p style={{ margin: 0, color: C.muted, fontSize: '0.9rem' }}>Loading marketplace visibility…</p>
      </section>
    );
  }

  return (
    <section style={{ background: C.bgLow, padding: '2rem', borderRadius: 16, border: `1px solid ${C.border}`, marginBottom: '2rem' }}>
      <h2 style={{ fontFamily: M, fontSize: '1.25rem', fontWeight: 700, margin: '0 0 0.4rem', color: C.text, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span className="material-symbols-outlined" style={{ color: C.brand }}>workspace_premium</span>
        Marketplace Visibility
      </h2>
      <p style={{ margin: '0 0 1.25rem', color: C.muted, fontSize: '0.85rem', lineHeight: 1.6 }}>
        Your whole company profile is what gets published — not individual services or supplies. Two things are
        required: an approved profile, and a verified visibility payment.
      </p>

      {loadError && (
        <div style={{ ...glassBox(C.errorTint), marginBottom: '1rem' }}>
          <p style={{ margin: 0, fontSize: '0.83rem', fontWeight: 600, color: C.error }}>{loadError}</p>
        </div>
      )}

      {notice && (
        <div style={{ ...glassBox(C.successTint), marginBottom: '1rem' }}>
          <p style={{ margin: 0, fontSize: '0.83rem', fontWeight: 600, color: C.success }}>{notice}</p>
        </div>
      )}

      {state && (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
            {state.profile_approved
              ? statusChip('Profile approved', 'ok')
              : statusChip('Profile approval pending', 'wait')}
            {state.is_visible
              ? statusChip(`Visible until ${dateLabel(state.expires_at)}`, 'ok')
              : statusChip('Not visible in the marketplace', 'idle')}
            {paymentStatusChip(latest)}
            {state.source === 'legacy_listing' && statusChip('Legacy listing placement', 'idle')}
          </div>

          {!state.profile_approved && (
            <p style={{ margin: '0 0 1rem', color: C.warning, fontSize: '0.83rem', lineHeight: 1.6 }}>
              Your profile must be approved by an administrator before paid visibility can be activated. You can still
              submit a payment now — it stays on file and is verified after approval.
            </p>
          )}
        </>
      )}

      {plans.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
          {plans.map(option => {
            const selected = plan === option.code;
            return (
              <button
                key={option.code}
                type="button"
                onClick={() => setPlan(option.code)}
                style={{
                  textAlign: 'left',
                  padding: '0.9rem 1rem',
                  borderRadius: 12,
                  border: `1px solid ${selected ? C.brand : C.border}`,
                  background: selected ? 'var(--color-brand-tint)' : C.bgCard,
                  cursor: 'pointer',
                  fontFamily: I,
                }}
              >
                <span style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: selected ? C.text : C.muted }}>
                  {option.label}
                </span>
                <span style={{ display: 'block', fontFamily: M, fontSize: '1.25rem', fontWeight: 800, color: C.text, margin: '2px 0' }}>
                  {formatPaise(option.total_amount_paise, option.currency)}
                </span>
                <span style={{ display: 'block', fontSize: '0.72rem', color: C.muted }}>
                  {formatPaise(option.base_amount_paise, option.currency)} + {option.gst_rate_percent}% GST
                </span>
              </button>
            );
          })}
        </div>
      )}

      {openSubmission && latest ? (
        <div style={{ ...glassBox(C.warningTint), marginBottom: '1rem' }}>
          <p style={{ margin: 0, fontSize: '0.83rem', color: C.warning, fontWeight: 600 }}>
            Payment of {formatPaise(latest.total_amount_paise, latest.currency)} submitted on{' '}
            {dateLabel(latest.submitted_at)} — awaiting administrator verification.
          </p>
        </div>
      ) : state?.is_visible ? (
        <p style={{ margin: 0, color: C.muted, fontSize: '0.83rem', lineHeight: 1.6 }}>
          Your profile is discoverable until {dateLabel(state.expires_at)}. A new plan can be submitted once that period
          ends.
        </p>
      ) : (
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          {latest?.status === 'REJECTED' && (
            <div style={{ ...glassBox(C.errorTint) }}>
              <p style={{ margin: 0, fontSize: '0.83rem', color: C.error, fontWeight: 600 }}>
                Your last payment was rejected{latest.rejection_reason ? `: ${latest.rejection_reason}` : '.'} You can
                submit a corrected transfer below.
              </p>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.85rem' }}>
            <div>
              <label style={label} htmlFor="visibility-utr">UTR / transaction reference</label>
              <input
                id="visibility-utr"
                style={input}
                value={utr}
                onChange={e => setUtr(e.target.value)}
                placeholder="e.g. HDFC0000123456"
                autoComplete="off"
              />
            </div>
            <div>
              <label style={label} htmlFor="visibility-date">Transfer date</label>
              <input
                id="visibility-date"
                type="date"
                style={input}
                value={paidOn}
                onChange={e => setPaidOn(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label style={label} htmlFor="visibility-receipt">Transfer receipt (PDF, JPG or PNG)</label>
            <input
              id="visibility-receipt"
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              onChange={e => setReceipt(e.target.files?.[0] ?? null)}
              style={{ ...input, padding: '0.5rem' }}
            />
          </div>

          <div>
            <label style={label} htmlFor="visibility-notes">Notes (optional)</label>
            <textarea
              id="visibility-notes"
              style={{ ...input, minHeight: 70, resize: 'vertical' }}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Anything the reviewer should know about this transfer."
            />
          </div>

          {instructions && !instructions.configured && (
            <p style={{ margin: 0, fontSize: '0.8rem', color: C.warning }}>
              Bank details have not been configured yet. Ask Nhaav support for the transfer details before paying.
            </p>
          )}
          {instructions?.instructions && (
            <p style={{ margin: 0, fontSize: '0.78rem', color: C.dim, lineHeight: 1.6 }}>{instructions.instructions}</p>
          )}

          {formError && (
            <div style={{ ...glassBox(C.errorTint) }}>
              <p style={{ margin: 0, fontSize: '0.83rem', fontWeight: 600, color: C.error }}>{formError}</p>
            </div>
          )}

          <div>
            <button
              type="submit"
              disabled={submitting}
              style={{
                padding: '0.65rem 1.4rem',
                borderRadius: 8,
                border: 'none',
                background: C.brand,
                color: 'var(--color-on-brand)',
                fontFamily: I,
                fontWeight: 700,
                fontSize: '0.85rem',
                cursor: submitting ? 'not-allowed' : 'pointer',
                opacity: submitting ? 0.7 : 1,
              }}
            >
              {submitting ? 'Submitting…' : 'Submit payment for verification'}
            </button>
          </div>
        </form>
      )}

      {state && state.payments.length > 0 && (
        <div style={{ marginTop: '1.5rem', overflowX: 'auto' }}>
          <p style={{ ...label, marginBottom: '0.5rem' }}>Payment history</p>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
            <thead>
              <tr>
                {['Submitted', 'Plan', 'Amount', 'Status', 'Window', 'Receipt'].map(heading => (
                  <th
                    key={heading}
                    style={{
                      textAlign: 'left',
                      padding: '0.45rem 0.5rem',
                      fontSize: '0.65rem',
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                      color: C.dim,
                      borderBottom: `1px solid ${C.border}`,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {state.payments.map(payment => (
                <tr key={payment.id}>
                  <td style={cell}>{dateLabel(payment.submitted_at ?? payment.created_at)}</td>
                  <td style={cell}>{payment.plan === 'annual' ? '12 months' : '1 month'}</td>
                  <td style={cell}>{formatPaise(payment.total_amount_paise, payment.currency)}</td>
                  <td style={cell}>{payment.status}</td>
                  <td style={cell}>
                    {payment.status === 'VERIFIED'
                      ? `${dateLabel(payment.starts_at)} → ${dateLabel(payment.expires_at)}`
                      : '—'}
                  </td>
                  <td style={cell}>
                    {payment.receipt_available ? (
                      <button
                        type="button"
                        onClick={() => void openReceipt(payment.id)}
                        style={{ background: 'none', border: 'none', color: C.brand, fontWeight: 700, cursor: 'pointer', padding: 0, fontSize: '0.78rem' }}
                      >
                        View
                      </button>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};

const cell: React.CSSProperties = {
  padding: '0.5rem',
  borderBottom: '1px solid var(--color-border)',
  color: 'var(--color-text)',
  verticalAlign: 'top',
};

const glassBox = (background: string): React.CSSProperties => ({
  padding: '0.75rem 0.9rem',
  borderRadius: 10,
  border: '1px solid var(--color-border)',
  background,
});

export default MarketplaceVisibilityCard;
