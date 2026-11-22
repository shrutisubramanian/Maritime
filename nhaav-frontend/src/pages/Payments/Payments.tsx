import React, { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { ClientSidebar } from '../../components/ClientSidebar';
import { ProviderSidebar } from '../../components/ProviderSidebar';
import { SupplierSidebar } from '../../components/SupplierSidebar';
import { useAuth } from '../../hooks/useAuth';
import { parseServerDate } from '../../services/access';
import {
  billingPeriodLabel,
  formatPaise,
  formatPlanTaxNote,
  formatPlanTotal,
  formatPlanValidity,
  subscriptionService,
  type SubscriptionPlanInfo,
  type SubscriptionStatus,
} from '../../services/subscription';
import {
  paymentsService,
  type PaymentInstructions,
  type PaymentRecord,
} from '../../services/payments';

/**
 * Billing & Access — pay for a Nhaav subscription by EXTERNAL BANK TRANSFER.
 *
 * There is no payment gateway here: the organization transfers money to the
 * Nhaav bank account and submits the transfer details plus a receipt for
 * Nhaav to verify. Bank details come from the backend (never hardcoded in
 * this source file) and nothing is activated until an admin verifies the
 * payment.
 *
 * Colors come from the design tokens exposed as CSS variables.
 */
const C = {
  manrope: "'Manrope', sans-serif",
  bg: 'var(--color-background)',
  surface: 'var(--color-surface)',
  surfaceAlt: 'var(--color-surface-alt)',
  text: 'var(--color-text)',
  muted: 'var(--color-muted)',
  faint: 'var(--color-faint)',
  border: 'var(--color-border)',
  borderStrong: 'var(--color-border-strong)',
  brand: 'var(--color-brand)',
  brandTint: 'var(--color-brand-tint-solid)',
  successText: 'var(--color-success-text)',
  successTint: 'var(--color-success-tint)',
  warningText: 'var(--color-warning-text)',
  warningTint: 'var(--color-warning-tint)',
  errorText: 'var(--color-error-text)',
  errorTint: 'var(--color-error-tint)',
  infoText: 'var(--color-info)',
  infoTint: 'var(--color-info-tint)',
} as const;

const card: React.CSSProperties = {
  background: C.surface,
  border: `1px solid ${C.border}`,
  borderRadius: 14,
  padding: '1.5rem',
};

const PAYMENT_STATUS_STYLE: Record<string, { label: string; color: string; tint: string }> = {
  PENDING: { label: 'Pending', color: C.warningText, tint: C.warningTint },
  SUBMITTED: { label: 'Awaiting verification', color: C.infoText, tint: C.infoTint },
  VERIFIED: { label: 'Verified', color: C.successText, tint: C.successTint },
  REJECTED: { label: 'Rejected', color: C.errorText, tint: C.errorTint },
  CANCELLED: { label: 'Cancelled', color: C.muted, tint: C.surfaceAlt },
};

const formatDate = (iso: string | null | undefined): string => {
  if (!iso) return '—';
  const d = parseServerDate(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

const SUBSCRIPTION_STATUS_STYLE: Record<string, { label: string; color: string; tint: string }> = {
  ACTIVE: { label: 'Active', color: C.successText, tint: C.successTint },
  PENDING: { label: 'Pending activation', color: C.warningText, tint: C.warningTint },
  EXPIRED: { label: 'Expired', color: C.errorText, tint: C.errorTint },
  CANCELLED: { label: 'Cancelled', color: C.errorText, tint: C.errorTint },
};

const SummaryStat: React.FC<{ label: string; value: string; sub?: string; valueColor?: string }> = ({
  label: labelText,
  value,
  sub,
  valueColor,
}) => (
  <div style={{ minWidth: 140, flex: '1 1 140px' }}>
    <dt style={{ ...label, marginBottom: 4 }}>{labelText}</dt>
    <dd
      style={{
        margin: 0,
        fontFamily: C.manrope,
        fontWeight: 700,
        fontSize: '1rem',
        color: valueColor ?? C.text,
      }}
    >
      {value}
    </dd>
    {sub && <p style={{ margin: '2px 0 0', fontSize: '0.7rem', color: C.faint }}>{sub}</p>}
  </div>
);

const label: React.CSSProperties = {
  fontSize: '0.7rem',
  fontWeight: 600,
  color: C.muted,
  textTransform: 'uppercase',
  letterSpacing: '0.12em',
  marginBottom: 6,
  display: 'block',
};

const input: React.CSSProperties = {
  width: '100%',
  padding: '0.6rem 0.75rem',
  borderRadius: 10,
  border: `1px solid ${C.border}`,
  background: C.surfaceAlt,
  color: C.text,
  fontSize: '0.85rem',
  fontFamily: 'inherit',
};

export const Payments: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

  // Set when the app redirected here because the organization's subscription is
  // not active (renewal-only login). Explains WHY the user landed on billing.
  const accessBlocked =
    (location.state as { accessBlocked?: string } | null)?.accessBlocked ?? null;

  const [plans, setPlans] = useState<SubscriptionPlanInfo[]>([]);
  const [subscription, setSubscription] = useState<SubscriptionStatus | null>(null);
  const [instructions, setInstructions] = useState<PaymentInstructions | null>(null);
  const [history, setHistory] = useState<PaymentRecord[]>([]);
  const [loading, setLoading] = useState(true);

  // Deliberately EMPTY: no plan is ever pre-chosen. The organization must
  // actively confirm which plan it is paying for before submitting.
  const [selectedPlan, setSelectedPlan] = useState<string>('');
  const [utr, setUtr] = useState('');
  const [paymentDate, setPaymentDate] = useState('');
  const [notes, setNotes] = useState('');
  const [receipt, setReceipt] = useState<File | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const role = user?.role;
  const Sidebar = role === 'supplier' ? SupplierSidebar : role === 'provider' ? ProviderSidebar : ClientSidebar;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [planList, subscriptionStatus, instructionData, payments] = await Promise.all([
        subscriptionService.getPlans(),
        subscriptionService.getStatus(),
        paymentsService.getInstructions(),
        paymentsService.listMine(),
      ]);
      setPlans(planList);
      setSubscription(subscriptionStatus);
      setInstructions(instructionData);
      setHistory(payments);
    } catch (err) {
      console.error('Failed to load billing information:', err);
      setError('Could not load billing information. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // A plan picked on the profile setup box arrives as router state, so the
  // account lands on the right plan without re-choosing it. It is still the
  // account that confirms the transfer below.
  const preselectedPlan = (location.state as { selectPlan?: string } | null)?.selectPlan ?? '';
  useEffect(() => {
    if (!preselectedPlan) return;
    if (!plans.some(plan => plan.code === preselectedPlan)) return;
    setSelectedPlan(current => current || preselectedPlan);
  }, [preselectedPlan, plans]);

  const activePlan = plans.find(p => p.code === selectedPlan) ?? null;
  const canSubmit = Boolean(activePlan && receipt && utr.trim().length >= 6 && paymentDate && !submitting);

  // The packs are priced per pass, not per month/year, so there is no
  // "12 months" saving to advertise. The honest comparison is cost per pass,
  // shown only between two plans that actually contain passes.
  const perPassPaise = (plan: SubscriptionPlanInfo): number =>
    plan.pass_count > 0 ? Math.round(plan.total_paise / plan.pass_count) : 0;
  const cheapest = plans.length > 1
    ? plans.reduce((a, b) => (perPassPaise(a) <= perPassPaise(b) ? a : b))
    : null;

  const sub = subscription && subscription.access_control_enabled ? subscription : null;
  // Every pass belongs to this ACCOUNT and stays usable until its own unused
  // window closes, so the remaining balance is always shown — the server has
  // already excluded used and expired passes from it.
  const passValidityDays = sub?.pass_validity_days ?? 180;
  // The plan window is 6 or 12 calendar months; the API's day figure is nominal.
  const passValidityLabel = passValidityDays >= 300 ? '12 months' : '6 months';
  const packs = sub?.packs ?? [];
  const subStatusStyle = sub?.subscription
    ? SUBSCRIPTION_STATUS_STYLE[sub.subscription.status] ?? {
        label: sub.subscription.status,
        color: C.muted,
        tint: C.surfaceAlt,
      }
    : null;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!activePlan || !receipt) return;
    setSubmitting(true);
    setError(null);
    setNotice(null);
    try {
      const result = await paymentsService.submit({
        plan_code: activePlan.code,
        utr: utr.trim(),
        payment_date: paymentDate,
        receipt,
        notes: notes.trim() || undefined,
      });
      setNotice(
        `${result.message} Reference ${result.utr} · ${formatPaise(result.amount_paise, result.currency)} · ` +
        `${result.pass_count} passes on activation.`,
      );
      setUtr('');
      setPaymentDate('');
      setNotes('');
      setReceipt(null);
      const fileInput = document.getElementById('receipt-input') as HTMLInputElement | null;
      if (fileInput) fileInput.value = '';
      await load();
    } catch (err) {
      const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
      setError(typeof detail === 'string' ? detail : 'Could not submit the payment. Please check the details and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // Fetch with the caller's token rather than opening a bare URL: receipts are
  // private and must not be reachable without authorization.
  const openReceipt = async (paymentId: string) => {
    try {
      await paymentsService.openReceipt(paymentId);
    } catch {
      setError('Could not open the receipt.');
    }
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: C.bg }}>
      <Sidebar activePath="/payments" />
      <main style={{ flex: 1, padding: '2rem 2.5rem', maxWidth: 1200, margin: '0 auto', width: '100%' }}>
        <button
          onClick={() => navigate(-1)}
          style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', fontSize: '0.8rem', padding: 0, marginBottom: '1rem' }}
        >
          ← Back
        </button>

        <p style={{ fontSize: '0.6rem', color: C.muted, letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 4 }}>
          Nhaav Subscription
        </p>
        <h1 style={{ fontFamily: C.manrope, fontWeight: 700, fontSize: '1.8rem', color: C.text, margin: '0 0 0.5rem' }}>
          Billing &amp; Access
        </h1>
        <p style={{ fontSize: '0.85rem', color: C.muted, margin: '0 0 2rem', maxWidth: 720 }}>
          Pay by external bank transfer. Transfer the plan amount to the Nhaav account below, then submit the
          transaction reference and receipt. Your subscription activates once Nhaav verifies the payment.
        </p>

        {accessBlocked && (
          <div style={{ ...card, background: C.warningTint, marginBottom: '1.5rem' }}>
            <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: 600, color: C.warningText }}>
              {accessBlocked}
            </p>
          </div>
        )}

        {notice && (
          <div style={{ ...card, borderColor: C.borderStrong, background: C.successTint, marginBottom: '1.5rem' }}>
            <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: 600, color: C.successText }}>{notice}</p>
          </div>
        )}
        {error && (
          <div style={{ ...card, background: C.errorTint, marginBottom: '1.5rem' }}>
            <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: 600, color: C.errorText }}>{error}</p>
          </div>
        )}

        {/* ── Current subscription ── */}
        {sub && (
          <section style={{ ...card, marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
              <h2 style={{ fontFamily: C.manrope, fontSize: '1.05rem', fontWeight: 700, color: C.text, margin: 0 }}>
                Your subscription
              </h2>
              {subStatusStyle && (
                <span style={{ fontSize: '0.7rem', fontWeight: 700, color: subStatusStyle.color, background: subStatusStyle.tint, padding: '4px 10px', borderRadius: 999 }}>
                  {subStatusStyle.label}
                </span>
              )}
            </div>
            <dl style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', rowGap: '1rem', margin: 0 }}>
              <SummaryStat label="Current plan" value={sub.plan ? sub.plan.name : 'No plan'} />
              <SummaryStat
                label="Price"
                value={sub.plan ? formatPaise(sub.plan.price_paise, sub.plan.currency) : '—'}
                sub={sub.plan ? `+ ${formatPaise(sub.plan.gst_paise, sub.plan.currency)} GST` : undefined}
              />
              <SummaryStat
                label="Pass validity"
                value={sub.plan ? formatPlanValidity(sub.plan) : '—'}
                sub="from activation"
              />
              <SummaryStat label="Status" value={subStatusStyle?.label ?? '—'} valueColor={subStatusStyle?.color} />
              <SummaryStat label="Start date" value={formatDate(sub.subscription?.starts_at)} />
              <SummaryStat label="Expiry date" value={formatDate(sub.subscription?.expires_at)} />
              <SummaryStat label="Total passes" value={String(sub.passes.total)} />
              <SummaryStat label="Used" value={String(sub.passes.used)} />
              <SummaryStat
                label="Remaining"
                value={String(sub.passes.remaining)}
                sub={`each valid ${passValidityLabel} from issue`}
                valueColor={
                  sub.passes.total > 0 && sub.passes.remaining === 0 ? C.errorText : undefined
                }
              />
              <SummaryStat label="Packs owned" value={String(packs.length)} />
            </dl>

            {packs.length > 0 && (
              <div style={{ marginTop: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <p style={{ margin: 0, fontSize: '0.62rem', letterSpacing: '0.16em', textTransform: 'uppercase', fontWeight: 700, color: C.muted }}>
                  Your packs
                </p>
                {packs.map(pack => (
                  <div
                    key={pack.pack_id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '1rem',
                      flexWrap: 'wrap',
                      border: `1px solid ${C.border}`,
                      background: C.surfaceAlt,
                      borderRadius: 10,
                      padding: '0.6rem 0.85rem',
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={{ fontSize: '0.82rem', fontWeight: 700, color: C.text }}>
                        {pack.plan_name ?? 'Access pack'}
                        <span style={{ fontWeight: 500, color: C.muted }}>
                          {pack.subscription_status ? ` · ${pack.subscription_status}` : ''}
                        </span>
                      </span>
                      <span style={{ fontSize: '0.74rem', color: C.muted }}>
                        {pack.remaining} of {pack.total} passes left
                        {pack.next_pass_expiry
                          ? ` · next pass closes ${formatDate(pack.next_pass_expiry)}`
                          : ''}
                      </span>
                    </div>
                    <span style={{ fontSize: '0.74rem', fontWeight: 700, color: pack.remaining > 0 ? C.brand : C.errorText }}>
                      {pack.remaining > 0 ? `${pack.remaining} available` : 'Used up'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 1fr)', gap: '1.5rem', alignItems: 'start' }}>
          {/* ── Plan selection + submission ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <section style={card}>
              <h2 style={{ fontFamily: C.manrope, fontSize: '1.05rem', fontWeight: 700, color: C.text, margin: '0 0 0.35rem' }}>
                1. Select a plan
              </h2>
              <p style={{ fontSize: '0.78rem', color: C.muted, margin: '0 0 1rem' }}>
                Choose the plan you are paying for — nothing is selected until you confirm it.
              </p>
              {loading && <p style={{ fontSize: '0.85rem', color: C.muted, margin: 0 }}>Loading plans…</p>}
              <div style={{ display: 'grid', gap: '0.75rem' }}>
                {plans.map(plan => {
                  const isSelected = plan.code === selectedPlan;
                  return (
                    <button
                      key={plan.code}
                      type="button"
                      onClick={() => setSelectedPlan(plan.code)}
                      style={{
                        textAlign: 'left',
                        cursor: 'pointer',
                        padding: '1rem 1.1rem',
                        borderRadius: 12,
                        border: `1px solid ${isSelected ? C.brand : C.border}`,
                        background: isSelected ? C.brandTint : C.surfaceAlt,
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: '1rem',
                        fontFamily: 'inherit',
                      }}
                    >
                      <span>
                        <span style={{ display: 'block', fontSize: '0.9rem', fontWeight: 700, color: C.text }}>
                          {plan.name}
                        </span>
                        <span style={{ display: 'block', fontSize: '0.75rem', color: C.muted, marginTop: 2 }}>
                          {plan.pass_count} access passes · valid {formatPlanValidity(plan)}
                        </span>
                        <span style={{ display: 'block', fontSize: '0.7rem', color: C.faint, marginTop: 2 }}>
                          {formatPlanTaxNote(plan)}
                        </span>
                        {cheapest?.code === plan.code && plans.length > 1 && (
                          <span style={{ display: 'inline-block', fontSize: '0.7rem', fontWeight: 700, color: C.successText, background: C.successTint, padding: '2px 8px', borderRadius: 999, marginTop: 6 }}>
                            {formatPaise(perPassPaise(plan), plan.currency)} per pass
                          </span>
                        )}
                      </span>
                      <span style={{ fontFamily: C.manrope, fontWeight: 700, fontSize: '1rem', color: C.brand, whiteSpace: 'nowrap' }}>
                        {formatPlanTotal(plan)}
                        <span style={{ display: 'block', fontSize: '0.62rem', fontWeight: 600, color: C.faint, textAlign: 'right' }}>
                          incl. GST
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>

            <section style={card}>
              <h2 style={{ fontFamily: C.manrope, fontSize: '1.05rem', fontWeight: 700, color: C.text, margin: '0 0 0.35rem' }}>
                2. Submit your transfer
              </h2>
              <p style={{ fontSize: '0.78rem', color: C.muted, margin: '0 0 1rem' }}>
                {activePlan
                  ? `Transfer exactly ${formatPlanTotal(activePlan)} — ${formatPlanTaxNote(activePlan)}. ` +
                    `On activation you get ${activePlan.pass_count} passes, valid ${formatPlanValidity(activePlan)}.`
                  : 'Select a plan above to continue.'}
              </p>

              <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '1rem' }}>
                <div>
                  <label style={label} htmlFor="utr-input">UTR / transaction reference</label>
                  <input
                    id="utr-input"
                    style={input}
                    value={utr}
                    onChange={e => setUtr(e.target.value)}
                    placeholder="e.g. NEFT reference from your bank"
                    required
                  />
                </div>

                <div>
                  <label style={label} htmlFor="date-input">Payment date</label>
                  <input
                    id="date-input"
                    type="date"
                    style={input}
                    value={paymentDate}
                    onChange={e => setPaymentDate(e.target.value)}
                    required
                  />
                </div>

                <div>
                  <label style={label} htmlFor="receipt-input">Receipt (PDF, JPG or PNG)</label>
                  <input
                    id="receipt-input"
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                    style={input}
                    onChange={e => setReceipt(e.target.files?.[0] ?? null)}
                    required
                  />
                </div>

                <div>
                  <label style={label} htmlFor="notes-input">Notes (optional)</label>
                  <textarea
                    id="notes-input"
                    style={{ ...input, minHeight: 72, resize: 'vertical' }}
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="Anything Nhaav should know about this transfer"
                  />
                </div>

                <button
                  type="submit"
                  disabled={!canSubmit}
                  style={{
                    padding: '0.7rem 1.25rem',
                    borderRadius: 10,
                    border: 'none',
                    background: canSubmit ? C.brand : C.surfaceAlt,
                    color: canSubmit ? 'var(--color-text-inverse)' : C.faint,
                    fontWeight: 700,
                    fontSize: '0.85rem',
                    cursor: canSubmit ? 'pointer' : 'not-allowed',
                    fontFamily: 'inherit',
                  }}
                >
                  {submitting ? 'Submitting…' : 'Submit payment for verification'}
                </button>
              </form>
            </section>
          </div>

          {/* ── Bank details ── */}
          <section style={card}>
            <h2 style={{ fontFamily: C.manrope, fontSize: '1.05rem', fontWeight: 700, color: C.text, margin: '0 0 0.35rem' }}>
              Nhaav bank account
            </h2>
            <p style={{ fontSize: '0.78rem', color: C.muted, margin: '0 0 1rem' }}>
              Transfer the plan amount to this account, then submit the details on the left.
            </p>

            {!instructions?.configured ? (
              <div style={{ background: C.warningTint, borderRadius: 10, padding: '0.85rem 1rem' }}>
                <p style={{ margin: 0, fontSize: '0.8rem', fontWeight: 600, color: C.warningText }}>
                  Bank details are not configured yet. Contact Nhaav support before transferring.
                </p>
              </div>
            ) : (
              <dl style={{ margin: 0, display: 'grid', gap: '0.75rem' }}>
                {[
                  ['Account holder', instructions.account_holder],
                  ['Bank', instructions.bank_name],
                  ['Account number', instructions.account_number],
                  ['IFSC', instructions.ifsc],
                  ['Branch', instructions.branch],
                  ['Account type', instructions.account_type],
                ]
                  .filter(([, value]) => Boolean(value))
                  .map(([term, value]) => (
                    <div key={String(term)}>
                      <dt style={{ ...label, marginBottom: 2 }}>{term}</dt>
                      <dd style={{ margin: 0, fontSize: '0.9rem', fontWeight: 600, color: C.text, wordBreak: 'break-all' }}>
                        {value}
                      </dd>
                    </div>
                  ))}
              </dl>
            )}

            {instructions?.instructions && (
              <p style={{ marginTop: '1rem', fontSize: '0.78rem', color: C.muted, whiteSpace: 'pre-line' }}>
                {instructions.instructions}
              </p>
            )}
          </section>
        </div>

        {/* ── History ── */}
        <section style={{ ...card, marginTop: '1.5rem' }}>
          <h2 style={{ fontFamily: C.manrope, fontSize: '1.05rem', fontWeight: 700, color: C.text, margin: '0 0 1rem' }}>
            Payment history
          </h2>
          {history.length === 0 ? (
            <p style={{ fontSize: '0.85rem', color: C.muted, margin: 0 }}>No payments submitted yet.</p>
          ) : (
            <div style={{ display: 'grid', gap: '0.75rem' }}>
              {history.map(payment => {
                const style = PAYMENT_STATUS_STYLE[payment.status] ?? { label: payment.status, color: C.muted, tint: C.surfaceAlt };
                return (
                  <div
                    key={payment.id}
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: '1rem',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.9rem 1rem',
                      borderRadius: 12,
                      background: C.surfaceAlt,
                      border: `1px solid ${C.border}`,
                    }}
                  >
                    <div style={{ minWidth: 190 }}>
                      <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: 700, color: C.text }}>
                        {payment.plan_name} · {formatPaise(payment.amount_paise, payment.currency)}
                        <span style={{ fontWeight: 600, color: C.muted }}> incl. GST</span>
                      </p>
                      <p style={{ margin: '2px 0 0', fontSize: '0.72rem', color: C.muted }}>
                        {payment.pass_count} passes · UTR {payment.utr}
                      </p>
                      <p style={{ margin: '2px 0 0', fontSize: '0.72rem', color: C.faint }}>
                        Paid {parseServerDate(payment.payment_date).toLocaleDateString()} ·
                        {' '}submitted {payment.submitted_at ? parseServerDate(payment.submitted_at).toLocaleString() : '—'}
                      </p>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '0.7rem', fontWeight: 700, color: style.color, background: style.tint, padding: '4px 10px', borderRadius: 999, whiteSpace: 'nowrap' }}>
                        {style.label}
                      </span>
                      {payment.receipt_available && (
                        <button
                          type="button"
                          onClick={() => openReceipt(payment.id)}
                          style={{ background: 'none', border: 'none', color: C.brand, fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', padding: 0 }}
                        >
                          View receipt
                        </button>
                      )}
                    </div>

                    {payment.status === 'REJECTED' && payment.rejection_reason && (
                      <p style={{ margin: 0, width: '100%', fontSize: '0.78rem', color: C.errorText, fontWeight: 600 }}>
                        Reason: {payment.rejection_reason}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
};

export default Payments;
