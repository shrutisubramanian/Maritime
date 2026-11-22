import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  CheckCircle2,
  CreditCard,
  FileText,
  Loader2,
  Lock,
  Mail,
  RefreshCw,
  ShieldCheck,
  UploadCloud,
} from 'lucide-react';

import { Button } from './Button';
import { useAuth } from '../hooks/useAuth';
import { onboardingService, type OnboardingStatus } from '../services/onboarding';
import { profilesService } from '../services/profiles';
import {
  formatPlanTotal,
  formatPlanValidity,
  subscriptionService,
  type SubscriptionPlanInfo,
} from '../services/subscription';

/**
 * The account-setup box.
 *
 * A locked account is confined to this page, so this is the one surface that
 * has to walk it through the whole flow, in order:
 *
 *   1. the profile — company name, one reachable contact and a description
 *      (saved through PUT /profiles/me, the same endpoint the profile page uses)
 *   2. payment, for a client — the platform fee, submitted on the billing page
 *      and verified by an admin; a vendor has documents + review here instead
 *   3. the admin review that actually verifies the account
 *
 * Every stage is driven by GET /access/onboarding, never by local guesses, so
 * the box cannot show "complete profile" to an account that already has one, nor
 * a payment box to a vendor who never pays one. A server it cannot reach shows
 * an error, never a fabricated timer or a fabricated "done".
 */

const STAGE_LABELS = {
  profile: 'Step 1 of 3',
  payment: 'Step 2 of 3',
  documents: 'Step 2 of 3',
  review: 'Step 3 of 3',
} as const;

const FIELD_LABELS: Record<string, string> = {
  company_name: 'company name',
  contact_name: 'contact name',
  contact_phone: 'contact phone',
  bio: 'company description',
};

const C = {
  panel: 'var(--bg-surface)',
  panelAlt: 'var(--bg-surface-hover)',
  border: 'var(--border-color)',
  text: 'var(--text-main)',
  muted: 'var(--text-muted)',
  dim: 'var(--text-dim)',
  brand: 'var(--accent-primary)',
  brandHover: 'var(--accent-primary-hover)',
  glow: 'var(--accent-glow)',
  onBrand: 'var(--color-on-brand)',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.65rem 0.85rem',
  borderRadius: 'var(--radius-sm)',
  border: `1px solid ${C.border}`,
  background: C.panelAlt,
  color: C.text,
  fontSize: '0.9rem',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
  outline: 'none',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '0.7rem',
  fontWeight: 700,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: C.dim,
  marginBottom: '0.35rem',
};

interface PanelProps {
  stage?: string;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  tone?: 'brand' | 'success';
  children: React.ReactNode;
}

const Panel: React.FC<PanelProps> = ({ stage, title, subtitle, icon, tone = 'brand', children }) => {
  const headerBackground =
    tone === 'success'
      ? 'linear-gradient(135deg, var(--accent-emerald), #15803d)'
      : `linear-gradient(135deg, ${C.brand}, ${C.brandHover})`;

  return (
    <section
      style={{
        border: `2px solid ${tone === 'success' ? 'var(--accent-emerald)' : C.brand}`,
        borderRadius: 'var(--radius-lg)',
        background: C.panel,
        boxShadow: `0 18px 40px ${C.glow}`,
        overflow: 'hidden',
      }}
    >
      <header
        style={{
          background: headerBackground,
          color: C.onBrand,
          padding: '1.5rem 1.75rem',
          display: 'flex',
          alignItems: 'flex-start',
          gap: '1rem',
        }}
      >
        <span
          style={{
            flexShrink: 0,
            width: 42,
            height: 42,
            borderRadius: 12,
            background: 'rgba(255,255,255,0.18)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {icon}
        </span>
        <div style={{ minWidth: 0 }}>
          {stage && (
            <div
              style={{
                fontSize: '0.68rem',
                fontWeight: 800,
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
                opacity: 0.85,
                marginBottom: '0.3rem',
              }}
            >
              {stage}
            </div>
          )}
          <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800, lineHeight: 1.25 }}>{title}</h2>
          <p style={{ margin: '0.35rem 0 0', fontSize: '0.875rem', opacity: 0.9, lineHeight: 1.55 }}>
            {subtitle}
          </p>
        </div>
      </header>
      <div style={{ padding: '1.5rem 1.75rem' }}>{children}</div>
    </section>
  );
};

const Check: React.FC<{ done: boolean; label: string; detail?: string }> = ({ done, label, detail }) => (
  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem' }}>
    {done ? (
      <CheckCircle2 size={17} style={{ color: 'var(--accent-emerald)', marginTop: 1, flexShrink: 0 }} />
    ) : (
      <span
        style={{
          width: 17,
          height: 17,
          borderRadius: '50%',
          border: `2px solid ${C.dim}`,
          marginTop: 1,
          flexShrink: 0,
          display: 'inline-block',
        }}
      />
    )}
    <div>
      <div style={{ fontSize: '0.875rem', fontWeight: 600, color: C.text }}>{label}</div>
      {detail && <div style={{ fontSize: '0.78rem', color: C.muted }}>{detail}</div>}
    </div>
  </div>
);

export interface AccountSetupBoxProps {
  /** Called after any state change the surrounding page may want to reflect. */
  onUpdated?: () => void;
}

export const AccountSetupBox: React.FC<AccountSetupBoxProps> = ({ onUpdated }) => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [contacts, setContacts] = useState<any[]>([]);
  const [form, setForm] = useState({
    company_name: '',
    contact_name: '',
    contact_phone: '',
    contact_email: '',
    bio: '',
  });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [plans, setPlans] = useState<SubscriptionPlanInfo[] | null>(null);

  const load = useCallback(async () => {
    try {
      const state = await onboardingService.getStatus();
      setStatus(state);
      setLoadError(null);
    } catch {
      setLoadError('We could not load your account status. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Prefill the form from the account's own profile row, falling back to what
  // registration already collected. Registration always provisions a profile,
  // so this is normally a partial record rather than a 404. Never overwrite
  // something already typed.
  useEffect(() => {
    let active = true;
    profilesService
      .getMyProfile()
      .then((profile) => {
        if (!active || !profile) return;
        const existing = Array.isArray(profile.contacts) ? profile.contacts : [];
        const contact = existing[0] ?? {};
        setContacts(existing);
        setForm((current) => ({
          ...current,
          company_name: current.company_name || profile.company_name || user?.company || '',
          bio: current.bio || profile.bio || '',
          contact_name:
            current.contact_name || contact.name || user?.full_name || user?.name || '',
          contact_phone: current.contact_phone || contact.phone || '',
          contact_email: current.contact_email || contact.email || user?.email || '',
        }));
      })
      .catch(() => {
        // No profile row (or a transient failure): the empty form is still the
        // right thing to show, and saving works either way.
      });
    return () => {
      active = false;
    };
  }, [user]);

  // Only a client pays, and only until the fee is submitted — so the plans are
  // requested for exactly the stage that shows them.
  useEffect(() => {
    if (!status || status.is_admin) return;
    if (!status.payment_required || status.subscription_active) return;
    if (!status.profile_completed || status.payment_submitted) return;
    let active = true;
    subscriptionService
      .getPlans()
      .then((list) => {
        if (active) setPlans(list);
      })
      .catch(() => {
        if (active) setPlans([]);
      });
    return () => {
      active = false;
    };
  }, [status]);

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const canSave =
    form.company_name.trim().length > 0 &&
    form.contact_name.trim().length > 0 &&
    form.contact_phone.trim().length > 0 &&
    form.bio.trim().length > 0;

  const saveProfile = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    setFormError(null);
    setNotice(null);
    try {
      const nextContacts = [...contacts];
      const merged: Record<string, string> = { ...(nextContacts[0] ?? {}) };
      merged.name = form.contact_name.trim();
      merged.phone = form.contact_phone.trim();
      const email = form.contact_email.trim();
      if (email) merged.email = email;
      nextContacts[0] = merged;

      await profilesService.updateMyProfile({
        company_name: form.company_name.trim(),
        bio: form.bio.trim(),
        contacts: nextContacts,
      });

      setContacts(nextContacts);
      const state = await onboardingService.getStatus();
      setStatus(state);
      setNotice('Profile saved. Your account is verified by Nhaav once the next step is cleared.');
      onUpdated?.();
    } catch {
      setFormError('Could not save your profile. Please check the details and try again.');
    } finally {
      setSaving(false);
    }
  };

  if (status?.is_admin) return null;

  if (loading) {
    return (
      <section
        style={{
          border: `1px solid ${C.border}`,
          borderRadius: 'var(--radius-lg)',
          background: C.panel,
          padding: '2rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.6rem',
          color: C.muted,
          fontSize: '0.9rem',
        }}
      >
        <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
        Checking your account…
      </section>
    );
  }

  if (!status || loadError) {
    return (
      <section
        style={{
          border: `1px solid ${C.border}`,
          borderRadius: 'var(--radius-lg)',
          background: C.panel,
          padding: '1.5rem',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem',
        }}
      >
        <span style={{ fontSize: '0.875rem', color: 'var(--accent-rose)' }}>
          {loadError ?? 'Your account status is unavailable right now.'}
        </span>
        <Button variant="secondary" size="sm" onClick={refresh} icon={<RefreshCw size={15} />}>
          Try again
        </Button>
      </section>
    );
  }

  // ── Approved and paid: nothing left to ask for ────────────────────────────
  if (status.marketplace_unlocked) {
    return (
      <Panel
        tone="success"
        title="Your account is verified"
        subtitle="Nhaav has approved your account. The marketplace, requests and jobs are open."
        icon={<ShieldCheck size={22} />}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
          <Link to="/marketplace">
            <Button variant="primary" icon={<ArrowRight size={16} />}>
              Go to the marketplace
            </Button>
          </Link>
          <Link to="/verification">
            <Button variant="secondary" icon={<FileText size={16} />}>
              View my documents
            </Button>
          </Link>
        </div>
      </Panel>
    );
  }

  // ── Email still unverified: nothing else can be reviewed yet ──────────────
  if (!status.email_verified) {
    return (
      <Panel
        title="Verify your email address"
        subtitle="Open the link we emailed you. Every other step — review, payment and access — waits on a confirmed address."
        icon={<Mail size={22} />}
      >
        <Link to="/resend-verification">
          <Button variant="primary" icon={<ArrowRight size={16} />}>
            Resend the verification email
          </Button>
        </Link>
      </Panel>
    );
  }

  // ── 1. The profile ────────────────────────────────────────────────────────
  if (!status.profile_completed) {
    const missing = status.profile_missing
      .map((field) => FIELD_LABELS[field] ?? field)
      .filter(Boolean);

    return (
      <Panel
        stage={STAGE_LABELS.profile}
        title="Complete your profile to continue"
        subtitle="Nhaav reviews this information before the account can be verified. It takes a minute — then the payment step opens."
        icon={<FileText size={22} />}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {missing.length > 0 && (
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '0.6rem',
                padding: '0.75rem 0.9rem',
                borderRadius: 'var(--radius-sm)',
                border: `1px solid ${C.border}`,
                background: C.panelAlt,
                fontSize: '0.83rem',
                color: C.muted,
                lineHeight: 1.55,
              }}
            >
              <Lock size={15} style={{ color: 'var(--accent-amber)', marginTop: '0.15rem', flexShrink: 0 }} />
              <span>
                Still needed: <strong style={{ color: C.text }}>{missing.join(', ')}</strong>. The
                marketplace stays locked until the profile is complete and an admin has verified the
                account.
              </span>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle} htmlFor="setup-company">Company name</label>
              <input
                id="setup-company"
                style={inputStyle}
                value={form.company_name}
                onChange={(e) => setForm({ ...form, company_name: e.target.value })}
                placeholder="e.g. Meridian Ship Management"
                autoComplete="organization"
              />
            </div>
            <div>
              <label style={labelStyle} htmlFor="setup-contact">Primary contact name</label>
              <input
                id="setup-contact"
                style={inputStyle}
                value={form.contact_name}
                onChange={(e) => setForm({ ...form, contact_name: e.target.value })}
                placeholder="e.g. Capt. A. Menon"
                autoComplete="name"
              />
            </div>
            <div>
              <label style={labelStyle} htmlFor="setup-phone">Contact phone</label>
              <input
                id="setup-phone"
                style={inputStyle}
                value={form.contact_phone}
                onChange={(e) => setForm({ ...form, contact_phone: e.target.value })}
                placeholder="+91 98765 43210"
                autoComplete="tel"
              />
            </div>
            <div>
              <label style={labelStyle} htmlFor="setup-email">Contact email (optional)</label>
              <input
                id="setup-email"
                type="email"
                style={inputStyle}
                value={form.contact_email}
                onChange={(e) => setForm({ ...form, contact_email: e.target.value })}
                placeholder="ops@company.com"
                autoComplete="email"
              />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle} htmlFor="setup-bio">Company description</label>
              <textarea
                id="setup-bio"
                style={{ ...inputStyle, minHeight: 96, resize: 'vertical' as const }}
                value={form.bio}
                onChange={(e) => setForm({ ...form, bio: e.target.value })}
                placeholder="What the company does, the ports it works, the services or supplies it provides."
              />
            </div>
          </div>

          {formError && (
            <p style={{ margin: 0, fontSize: '0.83rem', fontWeight: 600, color: 'var(--accent-rose)' }}>
              {formError}
            </p>
          )}
          {notice && (
            <p style={{ margin: 0, fontSize: '0.83rem', fontWeight: 600, color: 'var(--accent-emerald)' }}>
              {notice}
            </p>
          )}

          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.75rem' }}>
            <Button
              variant="primary"
              onClick={saveProfile}
              disabled={!canSave}
              isLoading={saving}
              icon={<ArrowRight size={16} />}
            >
              Save profile and continue
            </Button>
            <span style={{ fontSize: '0.78rem', color: C.dim }}>
              You can add offices, licences and team members later on the company profile page.
            </span>
          </div>
        </div>
      </Panel>
    );
  }

  // ── 2a. A client pays the platform fee ────────────────────────────────────
  const paymentStage =
    status.payment_required && !status.subscription_active && !status.payment_submitted;

  if (paymentStage) {
    return (
      <Panel
        stage={STAGE_LABELS.payment}
        title="Pay the platform fee"
        subtitle="Your profile is complete. Transfer the fee to the Nhaav account and submit the reference with your receipt — an admin then verifies it and your account."
        icon={<CreditCard size={22} />}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {notice && (
            <p style={{ margin: 0, fontSize: '0.83rem', fontWeight: 600, color: 'var(--accent-emerald)' }}>
              {notice}
            </p>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            <Check done label="Profile details" detail="Company, contact and description on file" />
            <Check
              done={status.documents_count > 0}
              label="Verification documents"
              detail={
                status.documents_count > 0
                  ? `${status.documents_count} document${status.documents_count === 1 ? '' : 's'} on file`
                  : 'Upload your identity and company documents — the reviewer needs them'
              }
            />
            <Check done={false} label="Platform fee" detail="Choose a plan below and submit the transfer" />
          </div>

          {plans === null && (
            <p style={{ margin: 0, fontSize: '0.85rem', color: C.muted, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> Loading plans…
            </p>
          )}

          {plans !== null && plans.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.85rem' }}>
              {plans.map((plan) => (
                <button
                  key={plan.code}
                  type="button"
                  onClick={() => navigate('/payments', { state: { selectPlan: plan.code } })}
                  style={{
                    textAlign: 'left',
                    cursor: 'pointer',
                    padding: '1rem',
                    borderRadius: 'var(--radius-md)',
                    border: `1px solid ${C.border}`,
                    background: C.panelAlt,
                    fontFamily: 'inherit',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.25rem',
                  }}
                >
                  <span style={{ fontSize: '0.92rem', fontWeight: 700, color: C.text }}>{plan.name}</span>
                  <span style={{ fontSize: '0.78rem', color: C.muted }}>
                    {plan.pass_count} access passes · valid {formatPlanValidity(plan)}
                  </span>
                  <span style={{ fontSize: '1.05rem', fontWeight: 800, color: C.brand, marginTop: '0.35rem' }}>
                    {formatPlanTotal(plan)}
                    <span style={{ fontSize: '0.68rem', fontWeight: 600, color: C.dim }}> incl. GST</span>
                  </span>
                </button>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.75rem' }}>
            <Link to="/payments">
              <Button variant="primary" icon={<ArrowRight size={16} />}>
                Go to billing to pay
              </Button>
            </Link>
            {status.documents_count === 0 && (
              <Link to="/verification">
                <Button variant="secondary" icon={<UploadCloud size={16} />}>
                  Upload documents first
                </Button>
              </Link>
            )}
            <span style={{ fontSize: '0.78rem', color: C.dim }}>
              Account verification completes once an admin confirms the transfer.
            </span>
          </div>
        </div>
      </Panel>
    );
  }

  // ── 2b. Nothing for the reviewer to look at yet ───────────────────────────
  if (status.documents_count === 0) {
    return (
      <Panel
        stage={STAGE_LABELS.documents}
        title="Upload your verification documents"
        subtitle="Your profile is complete. Nhaav needs at least one identity or company document before the account can be verified."
        icon={<UploadCloud size={22} />}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            <Check done label="Profile details" />
            {status.payment_required && (
              <Check
                done={status.payment_submitted || status.subscription_active}
                label="Platform fee"
                detail={status.payment_submitted ? 'Transfer submitted — awaiting verification' : undefined}
              />
            )}
            <Check done={false} label="Verification documents" detail="None uploaded yet" />
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
            <Link to="/verification">
              <Button variant="primary" icon={<UploadCloud size={16} />}>
                Upload documents
              </Button>
            </Link>
            <Button variant="ghost" onClick={refresh} isLoading={refreshing} icon={<RefreshCw size={15} />}>
              Refresh status
            </Button>
          </div>
        </div>
      </Panel>
    );
  }

  // ── 3. With Nhaav for review ──────────────────────────────────────────────
  return (
    <Panel
      stage={STAGE_LABELS.review}
      title="Your account is with our verification team"
      subtitle="Everything Nhaav needs is in. Once an admin approves the account you will be notified and the marketplace opens."
      icon={<ShieldCheck size={22} />}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          <Check done label="Profile details" />
          <Check
            done
            label="Verification documents"
            detail={`${status.documents_count} document${status.documents_count === 1 ? '' : 's'} on file`}
          />
          {status.payment_required && (
            <Check
              done={status.subscription_active || status.payment_submitted}
              label="Platform fee"
              detail={
                status.subscription_active
                  ? 'Paid and verified'
                  : status.payment_submitted
                    ? 'Transfer submitted — awaiting verification'
                    : 'Not submitted'
              }
            />
          )}
          <Check done={false} label="Nhaav approval" detail="In review" />
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
          <Button
            variant="secondary"
            onClick={refresh}
            isLoading={refreshing}
            icon={<RefreshCw size={15} />}
          >
            Refresh status
          </Button>
          <Link to="/verification">
            <Button variant="ghost" icon={<FileText size={15} />}>
              View my documents
            </Button>
          </Link>
          {status.payment_required && (
            <Link to="/payments">
              <Button variant="ghost" icon={<CreditCard size={15} />}>
                View billing
              </Button>
            </Link>
          )}
        </div>
      </div>
    </Panel>
  );
};

export default AccountSetupBox;
