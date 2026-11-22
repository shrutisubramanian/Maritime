import React, { useCallback, useEffect, useState } from 'react';
import {
  listingFeesService,
  type ListingFeeInstructions,
  type ListingFeeStatusResponse,
} from '../services/listingFees';
import { formatPaise } from '../services/subscription';

const C = {
  text: 'var(--color-text)',
  muted: 'var(--color-muted)',
  dim: 'var(--color-faint)',
  border: 'var(--color-border)',
  surface: 'var(--color-surface)',
  surfaceAlt: 'var(--color-surface-alt)',
  brand: 'var(--color-brand)',
  brandTint: 'var(--color-brand-tint)',
  onBrand: 'var(--color-on-brand)',
  error: 'var(--color-error)',
  errorText: 'var(--color-error-text)',
  errorTint: 'var(--color-error-tint)',
  success: 'var(--color-success)',
  successText: 'var(--color-success-text)',
  successTint: 'var(--color-success-tint)',
  warningText: 'var(--color-warning-text)',
  warningTint: 'var(--color-warning-tint)',
};
const M = "'Manrope', sans-serif";
const I = "'Inter', sans-serif";

const lbl: React.CSSProperties = {
  display: 'block',
  fontSize: '0.65rem',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.12em',
  color: C.muted,
  marginBottom: '0.4rem',
};
const inp: React.CSSProperties = {
  width: '100%',
  background: C.surfaceAlt,
  border: `1px solid ${C.border}`,
  borderRadius: 10,
  padding: '0.65rem 0.85rem',
  color: C.text,
  fontFamily: I,
  fontSize: '0.9rem',
  outline: 'none',
  boxSizing: 'border-box',
};

interface Props {
  listingType: 'service' | 'supply';
  listingId: string;
  listingName: string;
  /** The listing's moderation status — approved + paid is what goes live. */
  moderationStatus: string;
  /** Current placement window straight from the listing row, if it has one. */
  expiresAt?: string | null;
  onChanged: () => void;
}

/**
 * The pay-to-publish dialog for vendors.
 *
 * Vendors have no usage passes and no session time limit. What they buy is how
 * long ONE listing is shown on the marketplace, in one of two approved plans:
 *
 *   ₹1,000  -> 1 month   (30 days)
 *   ₹10,000 -> 1 year    (365 days)
 *
 * It never invents bank details or prices (both come from the API, and the
 * dialog refuses to present an unconfigured account as payable) and it blocks a
 * second submission while one is already awaiting verification.
 */
export const ListingFeeDialog: React.FC<Props> = ({
  listingType,
  listingId,
  listingName,
  moderationStatus,
  expiresAt,
  onChanged,
}) => {
  const [open, setOpen] = useState(false);
  const [instructions, setInstructions] = useState<ListingFeeInstructions | null>(null);
  const [status, setStatus] = useState<ListingFeeStatusResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [planCode, setPlanCode] = useState<'month' | 'year'>('month');
  const [utr, setUtr] = useState('');
  const [paymentDate, setPaymentDate] = useState('');
  const [notes, setNotes] = useState('');
  const [receipt, setReceipt] = useState<File | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [info, state] = await Promise.all([
        listingFeesService.getInstructions(),
        listingFeesService.getStatus(listingType, listingId),
      ]);
      setInstructions(info);
      setStatus(state);
    } catch (err) {
      console.error(err);
      setError('Could not load the placement details.');
    } finally {
      setLoading(false);
    }
  }, [listingType, listingId]);

  useEffect(() => {
    if (open) {
      setError(null);
      setNotice(null);
      load();
    }
  }, [open, load]);

  const plans = instructions?.plans ?? [
    { code: 'month' as const, label: '1 month', amount_paise: 100_000, period_days: 30 },
    { code: 'year' as const, label: '1 year', amount_paise: 1_000_000, period_days: 365 },
  ];
  const chosenPlan = plans.find(p => p.code === planCode) ?? plans[0];
  const amount = chosenPlan.amount_paise;
  const periodDays = chosenPlan.period_days;
  const liveExpires = expiresAt ?? status?.expires_at ?? null;
  const isLive = Boolean(status?.is_live) || Boolean(liveExpires && new Date(liveExpires) > new Date());
  const awaiting = Boolean(status?.awaiting_verification);
  const expired = Boolean(liveExpires && new Date(liveExpires) <= new Date());

  const submit = async () => {
    if (!utr.trim()) return setError('Enter the bank UTR / transaction reference.');
    if (!paymentDate) return setError('Enter the date the transfer was made.');
    if (!receipt) return setError('Attach the transfer receipt (PDF, JPG or PNG).');

    try {
      setSubmitting(true);
      setError(null);
      await listingFeesService.submit({
        listing_type: listingType,
        listing_id: listingId,
        plan: chosenPlan.code,
        utr: utr.trim(),
        payment_date: new Date(`${paymentDate}T12:00:00`).toISOString(),
        receipt,
        notes: notes.trim() || undefined,
      });
      setNotice(
        `Payment submitted — an admin will verify it, then this listing goes live for ${chosenPlan.label}.`,
      );
      setUtr('');
      setPaymentDate('');
      setNotes('');
      setReceipt(null);
      await load();
      onChanged();
    } catch (err) {
      const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
      setError(typeof detail === 'string' ? detail : 'Could not submit the payment.');
    } finally {
      setSubmitting(false);
    }
  };

  const dateLabel = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        style={{
          padding: '0.5rem 0.9rem',
          borderRadius: 8,
          border: 'none',
          background: isLive ? C.successTint : C.brand,
          color: isLive ? C.successText : C.onBrand,
          fontWeight: 700,
          fontSize: '0.78rem',
          cursor: 'pointer',
        }}>
        <span className="material-symbols-outlined" style={{ fontSize: '0.95rem', verticalAlign: '-2px' }}>
          {isLive ? 'schedule' : 'payments'}
        </span>{' '}
        {isLive ? 'Live' : awaiting ? 'Payment pending' : 'Publish · ₹1,000'}
      </button>

      {open && (
        <div
          onClick={() => !submitting && setOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.55)',
            zIndex: 120,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1.5rem',
          }}>
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: C.surface,
              border: `1px solid ${C.border}`,
              borderRadius: 16,
              width: '100%',
              maxWidth: 560,
              maxHeight: '88vh',
              overflowY: 'auto',
              padding: '1.75rem',
            }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
              <div>
                <p
                  style={{
                    margin: '0 0 4px',
                    fontSize: '0.6rem',
                    letterSpacing: '0.18em',
                    textTransform: 'uppercase',
                    color: C.brand,
                    fontWeight: 700,
                  }}>
                  Paid placement
                </p>
                <h2 style={{ fontFamily: M, fontWeight: 800, fontSize: '1.35rem', margin: '0 0 0.35rem' }}>
                  {formatPaise(amount)} to publish for {periodDays} days
                </h2>
                <p style={{ margin: 0, fontSize: '0.85rem', color: C.muted, lineHeight: 1.5 }}>
                  “{listingName}” — {listingType === 'service' ? 'service' : 'supply'} listing. Choose how long
                  it should be shown, transfer that amount, then submit the UTR and receipt. Once an admin
                  verifies it the listing stays on the marketplace for {periodDays} days ({chosenPlan.label}).
                </p>
              </div>
              <button
                onClick={() => setOpen(false)}
                disabled={submitting}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: C.muted,
                  cursor: 'pointer',
                  fontSize: '1.3rem',
                  lineHeight: 1,
                  padding: 4,
                }}
                aria-label="Close">
                ✕
              </button>
            </div>

            {/* Placement state */}
            <div
              style={{
                marginTop: '1rem',
                borderRadius: 12,
                padding: '0.85rem 1rem',
                background: isLive ? C.successTint : awaiting ? C.warningTint : C.surfaceAlt,
                border: `1px solid ${C.border}`,
              }}>
              {isLive ? (
                <p style={{ margin: 0, fontSize: '0.85rem', color: C.successText, fontWeight: 600 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '1rem', verticalAlign: '-2px' }}>
                    check_circle
                  </span>{' '}
                  Live on the marketplace until {dateLabel(liveExpires)}.
                </p>
              ) : awaiting ? (
                <p style={{ margin: 0, fontSize: '0.85rem', color: C.warningText, fontWeight: 600 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '1rem', verticalAlign: '-2px' }}>
                    hourglass_top
                  </span>{' '}
                  A payment for this listing is awaiting admin verification. Nothing further to submit.
                </p>
              ) : (
                <p style={{ margin: 0, fontSize: '0.85rem', color: C.muted, fontWeight: 600 }}>
                  Not paid for yet
                  {moderationStatus !== 'approved'
                    ? ' — this listing must also pass content moderation before it goes live'
                    : ''}
                  {expired
                    ? ' · the previous placement window has expired'
                    : ''}
                  . An approved listing without a verified payment stays off the marketplace.
                </p>
              )}
            </div>

            {notice && (
              <p
                style={{
                  margin: '0.85rem 0 0',
                  fontSize: '0.83rem',
                  fontWeight: 600,
                  color: C.successText,
                  background: C.successTint,
                  borderRadius: 10,
                  padding: '0.7rem 0.9rem',
                }}>
                {notice}
              </p>
            )}
            {error && (
              <p
                style={{
                  margin: '0.85rem 0 0',
                  fontSize: '0.83rem',
                  fontWeight: 600,
                  color: C.errorText,
                  background: C.errorTint,
                  borderRadius: 10,
                  padding: '0.7rem 0.9rem',
                }}>
                {error}
              </p>
            )}

            {loading ? (
              <p style={{ marginTop: '1rem', fontSize: '0.85rem', color: C.muted }}>Loading…</p>
            ) : awaiting ? null : !instructions?.configured ? (
              <p style={{ marginTop: '1rem', fontSize: '0.85rem', color: C.muted }}>
                Bank transfer details are not configured yet, so this fee cannot be paid right now. Contact
                support to complete the setup.
              </p>
            ) : (
              <>
                {/* The two approved showcase plans — prices come from the API */}
                <div style={{ marginTop: '1.1rem' }}>
                  <p style={{ ...lbl, marginBottom: '0.5rem' }}>How long should this listing be shown?</p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
                    {plans.map(plan => {
                      const selected = plan.code === chosenPlan.code;
                      return (
                        <button
                          key={plan.code}
                          type="button"
                          onClick={() => setPlanCode(plan.code)}
                          disabled={submitting}
                          style={{
                            textAlign: 'left',
                            padding: '0.75rem 0.9rem',
                            borderRadius: 10,
                            border: `1px solid ${selected ? C.brand : C.border}`,
                            background: selected ? C.brandTint : C.surface,
                            cursor: submitting ? 'wait' : 'pointer',
                            fontFamily: 'inherit',
                          }}>
                          <span style={{ display: 'block', fontSize: '0.8rem', fontWeight: 800, color: C.text }}>
                            {formatPaise(plan.amount_paise, instructions.currency)}
                          </span>
                          <span style={{ display: 'block', fontSize: '0.72rem', color: C.muted }}>
                            {plan.label} on the marketplace
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Bank details — from backend configuration, never hardcoded */}
                <div
                  style={{
                    marginTop: '1.1rem',
                    border: `1px solid ${C.border}`,
                    borderRadius: 12,
                    padding: '0.9rem 1rem',
                    background: C.surfaceAlt,
                  }}>
                  <p style={{ ...lbl, marginBottom: '0.6rem' }}>Transfer to</p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem 1rem' }}>
                    {[
                      ['Account holder', instructions.account_holder],
                      ['Bank', instructions.bank_name],
                      ['Account number', instructions.account_number],
                      ['IFSC', instructions.ifsc],
                      ['Branch', instructions.branch],
                      ['Account type', instructions.account_type],
                    ]
                      .filter(([, v]) => v)
                      .map(([k, v]) => (
                        <div key={k as string}>
                          <p style={{ margin: 0, fontSize: '0.68rem', color: C.dim, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                            {k}
                          </p>
                          <p style={{ margin: '2px 0 0', fontSize: '0.86rem', fontWeight: 600, wordBreak: 'break-all' }}>
                            {v}
                          </p>
                        </div>
                      ))}
                  </div>
                  {instructions.instructions && (
                    <p style={{ margin: '0.7rem 0 0', fontSize: '0.78rem', color: C.muted, lineHeight: 1.5 }}>
                      {instructions.instructions}
                    </p>
                  )}
                  <p style={{ margin: '0.7rem 0 0', fontSize: '0.85rem', fontWeight: 700, color: C.brand }}>
                    Amount to transfer: {formatPaise(amount, instructions.currency)} ({chosenPlan.label} showcase)
                  </p>
                </div>

                {/* The submission form */}
                <div style={{ marginTop: '1.1rem', display: 'grid', gap: '0.9rem' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.9rem' }}>
                    <div>
                      <label style={lbl}>UTR / transaction reference</label>
                      <input
                        style={inp}
                        value={utr}
                        onChange={e => setUtr(e.target.value)}
                        placeholder="e.g. HDFC261026123456"
                      />
                    </div>
                    <div>
                      <label style={lbl}>Transfer date</label>
                      <input
                        type="date"
                        style={inp}
                        value={paymentDate}
                        onChange={e => setPaymentDate(e.target.value)}
                      />
                    </div>
                  </div>
                  <div>
                    <label style={lbl}>Notes (optional)</label>
                    <input
                      style={inp}
                      value={notes}
                      onChange={e => setNotes(e.target.value)}
                      placeholder="Anything the reviewer should know"
                    />
                  </div>
                  <div>
                    <label style={lbl}>Transfer receipt</label>
                    <input
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png,image/jpeg,image/png,application/pdf"
                      onChange={e => setReceipt(e.target.files?.[0] ?? null)}
                      style={{
                        ...inp,
                        padding: '0.55rem 0.7rem',
                        fontSize: '0.82rem',
                        color: receipt ? C.text : C.muted,
                      }}
                    />
                    <p style={{ margin: '0.35rem 0 0', fontSize: '0.72rem', color: C.dim }}>
                      PDF, JPG or PNG. Stored privately and shown only to you and the reviewing admin.
                    </p>
                  </div>

                  <button
                    onClick={submit}
                    disabled={submitting}
                    style={{
                      padding: '0.8rem 1.25rem',
                      background: C.brand,
                      color: C.onBrand,
                      border: 'none',
                      borderRadius: 10,
                      fontWeight: 800,
                      fontFamily: M,
                      fontSize: '0.9rem',
                      cursor: submitting ? 'wait' : 'pointer',
                      opacity: submitting ? 0.7 : 1,
                    }}>
                    {submitting ? 'Submitting…' : `Submit ${formatPaise(amount, instructions.currency)} payment for review`}
                  </button>
                  <p style={{ margin: 0, fontSize: '0.75rem', color: C.dim, textAlign: 'center' }}>
                    The listing goes live only after an admin verifies the transfer, and then for{' '}
                    {periodDays} days from verification.
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default ListingFeeDialog;
