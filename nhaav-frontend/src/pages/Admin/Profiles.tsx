import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminSidebar from '../../components/AdminSidebar';
import {
  adminProfilesService,
  AdminProfileDetail,
  AdminProfileListItem,
  ProfileRoleFilter,
} from '../../services/adminProfiles';

/**
 * Every profile, read-only.
 *
 * Clients and vendors each create a profile; this page lets an admin READ any of
 * them — the same oversight as the verification panel, without a write path.
 * There is deliberately no edit, approve or delete control here: approval stays
 * in the verification queues, and the API behind this page is GET-only.
 */

const C = {
  bg: 'var(--color-background)',
  card: 'var(--color-surface)',
  low: 'var(--color-surface-alt)',
  border: 'var(--color-border)',
  borderStrong: 'var(--color-border-strong)',
  text: 'var(--color-text)',
  muted: 'var(--color-muted)',
  dim: 'var(--color-faint)',
  brand: 'var(--color-brand)',
  brandTint: 'var(--color-brand-tint)',
  success: 'var(--color-success)',
  successTint: 'var(--color-success-tint)',
  warning: 'var(--color-warning)',
  error: 'var(--color-error)',
  errorTint: 'var(--color-error-tint)',
};

const M = "'Manrope', sans-serif";

const TABS: { key: ProfileRoleFilter; label: string }[] = [
  { key: 'all', label: 'All profiles' },
  { key: 'client', label: 'Clients' },
  { key: 'vendor', label: 'Vendors' },
];

const statusColor = (status: string) =>
  status === 'verified' ? C.success : status === 'rejected' ? C.error : C.warning;

const roleLabel = (role: string) =>
  role === 'client' ? 'Client' : role === 'supplier' ? 'Supplier' : 'Service Provider';

const Field: React.FC<{ label: string; value?: React.ReactNode }> = ({ label, value }) => {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div style={{ display: 'flex', gap: 10, fontSize: '0.84rem', marginBottom: '0.45rem' }}>
      <span style={{ color: C.dim, minWidth: 150 }}>{label}</span>
      <span style={{ color: C.text, wordBreak: 'break-word' }}>{value}</span>
    </div>
  );
};

const Chips: React.FC<{ items: string[]; empty?: string }> = ({ items, empty }) => {
  if (!items || items.length === 0) {
    return <span style={{ color: C.dim, fontSize: '0.82rem' }}>{empty || 'None recorded'}</span>;
  }
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {items.map((item) => (
        <span
          key={item}
          style={{
            padding: '3px 9px',
            borderRadius: 8,
            background: C.low,
            border: `1px solid ${C.border}`,
            fontSize: '0.76rem',
          }}
        >
          {item}
        </span>
      ))}
    </div>
  );
};

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section
    style={{
      background: C.card,
      border: `1px solid ${C.border}`,
      borderRadius: 14,
      padding: '1.1rem 1.2rem',
      marginBottom: '0.9rem',
    }}
  >
    <h3
      style={{
        fontFamily: M,
        fontSize: '0.72rem',
        fontWeight: 800,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        color: C.brand,
        margin: '0 0 0.8rem',
      }}
    >
      {title}
    </h3>
    {children}
  </section>
);

export const AdminProfiles: React.FC = () => {
  const navigate = useNavigate();

  const [role, setRole] = useState<ProfileRoleFilter>('all');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [limit] = useState(20);

  const [rows, setRows] = useState<AdminProfileListItem[]>([]);
  const [counts, setCounts] = useState({ all: 0, client: 0, vendor: 0 });
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [detail, setDetail] = useState<AdminProfileDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await adminProfilesService.list({
        role,
        verification_status: status || undefined,
        q: search.trim() || undefined,
        page,
        limit,
      });
      setRows(res.data);
      setCounts(res.counts);
      setTotal(res.total);
      setPages(res.pages);
    } catch {
      setRows([]);
      setError('Could not load profiles. Please retry.');
    } finally {
      setLoading(false);
    }
  }, [role, status, search, page, limit]);

  useEffect(() => {
    load();
  }, [load]);

  /* Any filter change starts again from page 1. */
  useEffect(() => {
    setPage(1);
  }, [role, status, search]);

  const openProfile = async (profileId: string) => {
    setDetailLoading(true);
    setDetail(null);
    try {
      setDetail(await adminProfilesService.get(profileId));
    } catch {
      setError('Could not load that profile. Please retry.');
    } finally {
      setDetailLoading(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    padding: '0.6rem 0.8rem',
    borderRadius: 9,
    border: `1px solid ${C.border}`,
    background: C.low,
    color: C.text,
    fontSize: '0.85rem',
    outline: 'none',
  };

  return (
    <div style={{ background: C.bg, minHeight: '100vh', color: C.text }}>
      <AdminSidebar />

      <main
        style={{
          marginLeft: 'var(--sidebar-width, 256px)',
          padding: '2.25rem 2rem 5rem',
          maxWidth: 1280,
          transition: 'margin-left 0.25s',
        }}
      >
        <div style={{ marginBottom: '1.5rem' }}>
          <h1 style={{ fontFamily: M, fontWeight: 800, fontSize: '1.9rem', margin: '0 0 0.35rem' }}>
            All Profiles
          </h1>
          <p style={{ color: C.muted, margin: 0, fontSize: '0.9rem' }}>
            Every profile clients and vendors have created. Read-only — approvals happen in the
            verification queues.
          </p>
        </div>

        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '5px 11px',
            borderRadius: 999,
            background: C.brandTint,
            color: C.brand,
            fontSize: '0.72rem',
            fontWeight: 800,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            marginBottom: '1.25rem',
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>
            visibility
          </span>
          Read-only access
        </div>

        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
          {TABS.map((tab) => {
            const active = role === tab.key;
            const count =
              tab.key === 'all' ? counts.all : tab.key === 'client' ? counts.client : counts.vendor;
            return (
              <button
                key={tab.key}
                onClick={() => setRole(tab.key)}
                style={{
                  padding: '0.5rem 0.95rem',
                  borderRadius: 9,
                  border: `1px solid ${active ? C.brand : C.border}`,
                  background: active ? C.brandTint : 'transparent',
                  color: active ? C.brand : C.muted,
                  fontWeight: active ? 700 : 500,
                  fontSize: '0.83rem',
                  cursor: 'pointer',
                }}
              >
                {tab.label} ({count})
              </button>
            );
          })}
        </div>

        <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search company, contact name or email"
            style={{ ...inputStyle, flex: '1 1 280px' }}
          />
          <select value={status} onChange={(e) => setStatus(e.target.value)} style={inputStyle}>
            <option value="">All statuses</option>
            <option value="pending">Pending</option>
            <option value="verified">Verified</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>

        {error && <p style={{ color: C.error, marginBottom: '1rem' }}>{error}</p>}

        <div style={{ display: 'grid', gridTemplateColumns: detail ? '1fr 420px' : '1fr', gap: '1.25rem' }}>
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1.6fr 0.9fr 0.9fr 0.8fr 0.9fr',
                gap: '0.75rem',
                padding: '0.75rem 1rem',
                borderBottom: `1px solid ${C.border}`,
                fontSize: '0.68rem',
                fontWeight: 800,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: C.dim,
              }}
            >
              <span>Company</span>
              <span>Role</span>
              <span>Port / head office</span>
              <span>Status</span>
              <span>Created</span>
            </div>

            {loading ? (
              <div style={{ padding: '2rem 1rem', color: C.muted, fontSize: '0.88rem' }}>Loading profiles…</div>
            ) : rows.length === 0 ? (
              <div style={{ padding: '2rem 1rem', color: C.muted, fontSize: '0.88rem' }}>
                No profiles match this filter.
              </div>
            ) : (
              rows.map((row) => (
                <button
                  key={row.profile_id}
                  onClick={() => openProfile(row.profile_id)}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1.6fr 0.9fr 0.9fr 0.8fr 0.9fr',
                    gap: '0.75rem',
                    width: '100%',
                    textAlign: 'left',
                    alignItems: 'center',
                    padding: '0.8rem 1rem',
                    background: detail?.profile_id === row.profile_id ? C.low : 'transparent',
                    border: 'none',
                    borderBottom: `1px solid ${C.border}`,
                    cursor: 'pointer',
                    color: C.text,
                    fontSize: '0.84rem',
                  }}
                >
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {row.company_name || row.full_name || 'Unnamed'}
                    </span>
                    <span style={{ display: 'block', color: C.dim, fontSize: '0.74rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {row.email}
                    </span>
                  </span>
                  <span style={{ color: C.muted }}>{roleLabel(row.role)}</span>
                  <span style={{ color: C.muted }}>{row.head_office || '—'}</span>
                  <span style={{ color: statusColor(row.verification_status), fontWeight: 700, fontSize: '0.78rem' }}>
                    {row.verification_status}
                  </span>
                  <span style={{ color: C.dim, fontSize: '0.76rem' }}>
                    {row.created_at ? new Date(row.created_at).toLocaleDateString() : '—'}
                  </span>
                </button>
              ))
            )}

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '0.75rem 1rem',
                fontSize: '0.78rem',
                color: C.muted,
              }}
            >
              <span>
                {total} profile{total === 1 ? '' : 's'}
              </span>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <button
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  style={{ ...inputStyle, padding: '0.35rem 0.7rem', cursor: page <= 1 ? 'not-allowed' : 'pointer', opacity: page <= 1 ? 0.5 : 1 }}
                >
                  Previous
                </button>
                <span>
                  Page {page} / {pages || 1}
                </span>
                <button
                  disabled={page >= pages}
                  onClick={() => setPage((p) => Math.min(pages, p + 1))}
                  style={{ ...inputStyle, padding: '0.35rem 0.7rem', cursor: page >= pages ? 'not-allowed' : 'pointer', opacity: page >= pages ? 0.5 : 1 }}
                >
                  Next
                </button>
              </div>
            </div>
          </div>

          {detail && (
            <aside style={{ alignSelf: 'start', position: 'sticky', top: 24 }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  marginBottom: '0.75rem',
                }}
              >
                <div>
                  <h2 style={{ fontFamily: M, fontSize: '1.15rem', fontWeight: 800, margin: '0 0 0.2rem' }}>
                    {detail.company_name || detail.full_name}
                  </h2>
                  <div style={{ color: C.muted, fontSize: '0.8rem' }}>
                    {roleLabel(detail.role)} · {detail.email}
                  </div>
                </div>
                <button
                  onClick={() => setDetail(null)}
                  style={{ background: 'none', border: 'none', color: C.dim, cursor: 'pointer', fontSize: '1.1rem' }}
                  aria-label="Close profile"
                >
                  ✕
                </button>
              </div>

              <Section title="Verification & visibility">
                <Field
                  label="Verification"
                  value={
                    <span style={{ color: statusColor(detail.verification_status), fontWeight: 700 }}>
                      {detail.verification_status}
                    </span>
                  }
                />
                <Field label="Availability" value={detail.availability_status} />
                <Field
                  label="Marketplace"
                  value={
                    detail.visibility.is_visible
                      ? `Visible${detail.visibility.plan ? ` · ${detail.visibility.plan}` : ''}`
                      : 'Not listed'
                  }
                />
                <Field
                  label="Listed until"
                  value={
                    detail.visibility.expires_at
                      ? new Date(detail.visibility.expires_at).toLocaleDateString()
                      : null
                  }
                />
                <Field label="Badge" value={detail.badge_label} />
              </Section>

              <Section title="Business">
                <Field label="Primary category" value={detail.primary_category} />
                <div style={{ marginBottom: '0.6rem' }}>
                  <div style={{ color: C.dim, fontSize: '0.78rem', marginBottom: 4 }}>Capabilities</div>
                  <Chips items={detail.subcategories} />
                </div>
                <Field label="Bio" value={detail.bio} />
                <Field label="Years experience" value={detail.years_experience || null} />
                <Field label="Services" value={detail.services_count} />
                <Field label="Supply listings" value={detail.supply_listings_count} />
              </Section>

              <Section title="Location">
                <Field label="Country" value={detail.country} />
                <Field label="Head office / main port" value={detail.head_office} />
                <div style={{ marginBottom: '0.6rem' }}>
                  <div style={{ color: C.dim, fontSize: '0.78rem', marginBottom: 4 }}>Other ports</div>
                  <Chips items={detail.ports_served} empty="No other ports listed" />
                </div>
                <Field label="Service areas" value={detail.service_areas.join(', ') || null} />
                <Field
                  label="Map coordinates"
                  value={
                    detail.location ? `${detail.location.lat}, ${detail.location.lng}` : null
                  }
                />
                <Field label="Offices" value={detail.offices.join(', ') || null} />
              </Section>

              <Section title="Contacts">
                {detail.contacts.length === 0 ? (
                  <span style={{ color: C.dim, fontSize: '0.82rem' }}>No contacts recorded</span>
                ) : (
                  detail.contacts.map((contact, index) => (
                    <div key={index} style={{ fontSize: '0.82rem', marginBottom: '0.4rem' }}>
                      <strong>{contact.name || 'Contact'}</strong>
                      {contact.email ? <span style={{ color: C.muted }}> · {contact.email}</span> : null}
                      {contact.phone ? <span style={{ color: C.muted }}> · {contact.phone}</span> : null}
                    </div>
                  ))
                )}
                <Field label="Licenses" value={detail.licenses.join(', ') || null} />
                <Field label="Brochure" value={detail.brochure_filename} />
              </Section>

              <div style={{ color: C.dim, fontSize: '0.74rem' }}>
                Read-only view. Approving or rejecting this account happens in the
                {' '}
                <button
                  onClick={() => navigate('/admin/vendors')}
                  style={{ background: 'none', border: 'none', color: C.brand, cursor: 'pointer', padding: 0, fontSize: '0.74rem', fontWeight: 700 }}
                >
                  verification queue
                </button>
                .
              </div>
            </aside>
          )}

          {detailLoading && (
            <aside style={{ color: C.muted, fontSize: '0.85rem' }}>Loading profile…</aside>
          )}
        </div>
      </main>
    </div>
  );
};

export default AdminProfiles;
