import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { AccountSetupBox } from '../../components/AccountSetupBox';
import { useAuth } from '../../hooks/useAuth';
import { onboardingService, OnboardingStatus } from '../../services/onboarding';
import { profilesService } from '../../services/profiles';
import { getDeviceLabel } from '../../services/device';
import {
  ArrowRight,
  Building2,
  CreditCard,
  FileText,
  Mail,
  MonitorSmartphone,
  ShieldCheck,
  User,
} from 'lucide-react';

/*
 * User profile — the account's HOME while it is still locked.
 *
 * A freshly verified account is confined here (its verification documents and
 * the payment flow are the only other reachable pages) until an admin approves
 * it and, for a client, the platform fee is verified. The page therefore opens
 * with the account-setup box, which walks the account through its profile, the
 * payment and the review in that order — driven by GET /access/onboarding, the
 * same state the backend and the route guard enforce.
 *
 * No placeholder personal data and no dead buttons: name/email come from the
 * signed-in account, company details are edited on the company-profile page,
 * and the only password action offered is the real email reset flow.
 */

const ProfilePage: React.FC = () => {
  const { user } = useAuth();
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [organization, setOrganization] = useState<string>('');
  // "VERIFIED" / "VERIFIED PROVIDER" … set by the admin when the account is
  // approved. Shown as the badge the reviewer granted.
  const [badge, setBadge] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const state = await onboardingService.getStatus();
      setStatus(state);
    } catch {
      // The rest of the page is still useful without it.
    }
  }, []);

  useEffect(() => {
    let active = true;
    load();
    profilesService
      .getMyProfile()
      .then((profile) => {
        if (!active || !profile) return;
        if (typeof profile.company_name === 'string') setOrganization(profile.company_name);
        setBadge(profile.badge_label ?? null);
      })
      .catch(() => {
        // A fresh account with an unset profile — not an error worth showing.
      });
    return () => {
      active = false;
    };
  }, [load]);

  const paysPlatformFee = status?.payment_required ?? false;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '2rem',
        maxWidth: '800px',
        margin: '0 auto',
      }}
    >
      <div>
        <h1 style={{ fontSize: '1.8rem', fontWeight: 800 }}>Your Profile</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.925rem' }}>
          {status?.marketplace_unlocked
            ? 'Your account is set up. Everything below is yours to manage.'
            : 'Complete the steps below to unlock the marketplace.'}
        </p>
      </div>

      {/* ── Account setup: profile → payment → verification ───────────────── */}
      <AccountSetupBox onUpdated={load} />

      {/* ── Identity ──────────────────────────────────────────────────────── */}
      <Card title="Your account">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
            <div
              style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                backgroundColor: 'var(--bg-surface-hover)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--accent-primary)',
                border: '2px solid var(--border-glow)',
              }}
            >
              <User size={28} />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: '1.05rem' }}>
                {user?.full_name || user?.name || 'Your account'}
              </div>
              <div
                style={{
                  fontSize: '0.85rem',
                  color: 'var(--text-muted)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                }}
              >
                <Mail size={14} /> {user?.email || '—'}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.35rem' }}>
                {user?.role && (
                  <span
                    style={{
                      fontSize: '0.7rem',
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                      color: 'var(--text-dim)',
                    }}
                  >
                    {user.role}
                  </span>
                )}
                {badge && (
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.3rem',
                      fontSize: '0.68rem',
                      fontWeight: 700,
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                      color: 'var(--accent-primary)',
                      border: '1px solid var(--accent-primary)',
                      borderRadius: 999,
                      padding: '2px 8px',
                    }}
                  >
                    <ShieldCheck size={12} /> {badge}
                  </span>
                )}
              </div>
              <div
                style={{
                  marginTop: '0.4rem',
                  fontSize: '0.75rem',
                  color: 'var(--text-dim)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                }}
              >
                <MonitorSmartphone size={13} /> Signed in on {getDeviceLabel()} — this account
                works on one device at a time.
              </div>
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '1rem',
              padding: '0.85rem 0.9rem',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-color)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <Building2 size={16} style={{ color: 'var(--text-muted)' }} />
              <div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>Organization</div>
                <div style={{ fontSize: '0.9rem' }}>{organization || 'Not set yet'}</div>
              </div>
            </div>
            <Link to="/company-profile">
              <Button variant="secondary" size="sm">
                Manage company details
              </Button>
            </Link>
          </div>
        </div>
      </Card>

      {/* ── Verification documents ────────────────────────────────────────── */}
      <Card
        title="Verification documents"
        subtitle="Upload your identity and company documents for admin review."
        action={<FileText size={18} style={{ color: 'var(--text-muted)' }} />}
      >
        <Link to="/verification">
          <Button variant="outline" icon={<ArrowRight size={16} />}>
            Open my documents
          </Button>
        </Link>
      </Card>

      {/* ── Subscription / passes ─────────────────────────────────────────── */}
      {/* Clients buy access passes with the platform fee; vendors have no
          passes and no session limit, so this card is not shown to them. */}
      {paysPlatformFee && (
        <Card
          title="Subscription"
          subtitle={
            status?.subscription_active
              ? 'Active — your access passes and billing are managed here.'
              : 'The platform fee buys your access passes. Billing is where the transfer is submitted.'
          }
          action={<CreditCard size={18} style={{ color: 'var(--text-muted)' }} />}
        >
          <Link to="/payments">
            <Button variant="outline" icon={<ArrowRight size={16} />}>
              {status?.subscription_active ? 'View my subscription' : 'Go to billing'}
            </Button>
          </Link>
        </Card>
      )}

      {/* ── Password ──────────────────────────────────────────────────────── */}
      <Card title="Password">
        <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
          We email you a single-use link to set a new password — there is no in-app
          password change.
        </p>
        <Link to="/forgot-password">
          <Button variant="secondary" icon={<ArrowRight size={16} />}>
            Send me a password reset link
          </Button>
        </Link>
      </Card>
    </div>
  );
};

export default ProfilePage;
export { ProfilePage };
