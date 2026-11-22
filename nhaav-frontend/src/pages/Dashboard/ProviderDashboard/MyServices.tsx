import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../hooks/useAuth';
import { ProviderSidebar } from '../../../components/ProviderSidebar';
import { servicesApi, ServiceListing, ServiceListingStatus } from '../../../services/servicesApi';
import { ListingFeeDialog } from '../../../components/ListingFeeDialog';

const C = {
  bg: 'var(--color-background)',
  bgCard: 'var(--color-surface)',
  bgCardH: 'var(--color-surface)',
  bgHigh: 'var(--color-surface-deep)',
  bgBright: 'var(--color-surface-deep)',
  bgLowest: 'var(--color-surface-alt)',
  border: 'var(--color-border)',
  borderMid: 'rgba(0,0,0,0.35)',
  text: 'var(--color-text)',
  muted: 'var(--color-muted)',
  dim: 'var(--color-faint)',
  cyan: 'var(--color-brand)',
  terCont: 'var(--color-brand-tint-solid)',
  primary: 'var(--color-brand)',
  error: 'var(--color-error)',
  amber: 'var(--color-warning)',
  amberCont: 'rgba(76,157,176,0.15)',
  green: 'var(--color-success)',
  greenCont: 'rgba(52,211,153,0.15)',
};
const fonts = { manrope: "'Manrope', sans-serif", inter: "'Inter', sans-serif" };

const FILTERS: { label: string; value?: ServiceListingStatus }[] = [
  { label: 'All' },
  { label: 'Active', value: 'approved' },
  { label: 'Pending', value: 'pending_review' },
  { label: 'Drafts', value: 'draft' },
  { label: 'Rejected', value: 'rejected' },
  { label: 'Archived', value: 'archived' },
];

const statusColor = (s: ServiceListingStatus) =>
  s === 'approved' ? C.green : s === 'rejected' ? C.error : s === 'archived' ? C.dim : C.amber;

export const MyServices: React.FC = () => {
  const { user } = useAuth();
  const companyName = user?.company || user?.full_name || user?.name || user?.email || 'your company';
  const navigate = useNavigate();

  const [listings, setListings] = useState<ServiceListing[]>([]);
  const [filter, setFilter] = useState<ServiceListingStatus | undefined>(undefined);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setListings(await servicesApi.getMyServices(filter));
    } catch (err) {
      console.error(err);
      setError('Could not load your service listings.');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const submit = async (id: string) => { await servicesApi.submitService(id); load(); };
  const archive = async (id: string) => { await servicesApi.archiveService(id); load(); };
  const remove = async (id: string) => {
    if (!window.confirm('Delete this service listing permanently? It will be removed from the marketplace.')) return;
    await servicesApi.deleteService(id);
    load();
  };

  const activeCount = listings.filter(l => l.status === 'approved').length;
  const filtered = listings.filter(l =>
    !searchTerm.trim() ||
    l.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (l.port_id || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    l.category.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: C.bg, color: C.text, fontFamily: fonts.inter }}>

      <ProviderSidebar activePath="/provider/services" />

      <main style={{ marginLeft: 'var(--sidebar-width, 256px)', flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', transition: 'margin-left 0.25s cubic-bezier(0.4, 0, 0.2, 1)' }}>

        <header className="role-header" style={{ height: 64, background: C.bg, borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 'var(--header-padding-left, 4.5rem)', paddingRight: '2rem', position: 'sticky', top: 0, zIndex: 40, gap: '0.75rem' }}>
          <div className="role-header-search" style={{ position: 'relative', width: 400, maxWidth: '100%' }}>
            <span className="material-symbols-outlined" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: C.dim, fontSize: '1.2rem', pointerEvents: 'none' }}>search</span>
            <input type="text" placeholder="Search services or ports..."
              value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
              style={{ width: '100%', background: C.bgLowest, border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 16px 8px 40px', color: C.text, fontSize: '0.875rem', outline: 'none' }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
            <span onClick={() => navigate('/notifications')} className="material-symbols-outlined" style={{ color: C.muted, cursor: 'pointer', fontSize: '1.25rem' }}>notifications</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ textAlign: 'right' }}>
                <p className="role-header-status" style={{ fontSize: '0.875rem', fontWeight: 600, color: C.text, margin: 0 }}>{companyName}</p>
                <p className="role-header-status" style={{ fontSize: '0.65rem', color: C.dim, margin: 0 }}>Provider Access</p>
              </div>
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: C.terCont, color: C.primary, border: `1px solid ${C.borderMid}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.85rem', fontWeight: 700 }}>
                {(companyName.trim()[0] || '?').toUpperCase()}
              </div>
            </div>
          </div>
        </header>

        <div style={{ padding: '2.5rem 2rem 5rem', maxWidth: 1200, margin: '0 auto', width: '100%' }}>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <h1 style={{ fontFamily: fonts.manrope, fontWeight: 800, fontSize: '2.25rem', color: C.text, margin: '0 0 0.4rem', letterSpacing: '-0.02em' }}>
                My Services &amp; Ports
              </h1>
              <p style={{ fontSize: '0.9rem', color: C.muted, margin: 0 }}>
                Manage the service listings you publish to the Nhaav Service Marketplace. Approved listings are matchable for new requests.
              </p>
            </div>
          </div>

          <div style={{ background: C.bgCard, borderRadius: 16, border: `1px solid ${C.border}`, padding: '1.5rem 2rem', marginBottom: '2rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
              <span className="material-symbols-outlined" style={{ color: C.cyan, fontSize: '2rem' }}>anchor</span>
              <div>
                <h3 style={{ fontFamily: fonts.manrope, fontWeight: 700, fontSize: '1.1rem', color: C.text, margin: '0 0 0.25rem' }}>Active Listings</h3>
                <p style={{ fontSize: '0.85rem', color: C.muted, margin: 0 }}>Approved listings visible in the marketplace.</p>
              </div>
            </div>
            <div style={{ fontFamily: fonts.manrope, fontSize: '2.2rem', fontWeight: 900, color: C.cyan }}>{activeCount}</div>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
            {FILTERS.map(f => (
              <button key={f.label} onClick={() => setFilter(f.value)}
                style={{ padding: '0.45rem 1rem', borderRadius: 999, border: `1px solid ${C.border}`, background: filter === f.value ? C.primary : 'transparent', color: filter === f.value ? 'var(--color-on-brand)' : C.muted, fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' }}>
                {f.label}
              </button>
            ))}
          </div>

          {loading ? (
            <p style={{ color: C.muted }}>Loading…</p>
          ) : error ? (
            <p style={{ color: C.error }}>{error}</p>
          ) : filtered.length === 0 ? (
            <div style={{ background: C.bgCard, border: `1px dashed ${C.border}`, borderRadius: 16, padding: '3rem', textAlign: 'center', color: C.muted }}>
              No service listings in this view.
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(340px, 100%), 1fr))', gap: '1.5rem' }}>
              {filtered.map(item => (
                <div key={item.id} style={{ background: C.bgCard, borderRadius: 16, border: `1px solid ${C.border}`, padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div>
                    <h3 style={{ fontFamily: fonts.manrope, fontSize: '1.2rem', fontWeight: 800, color: C.text, margin: '0 0 0.35rem' }}>{item.name}</h3>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: C.cyan, fontSize: '0.9rem', fontWeight: 600 }}>
                      <span className="material-symbols-outlined" style={{ fontSize: '1.1rem' }}>anchor</span>
                      {item.port_id || 'All ports'}
                      <span style={{ color: C.dim, fontWeight: 500 }}>· {item.category}</span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <span style={{ padding: '4px 10px', borderRadius: 999, fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', background: C.bgLowest, color: statusColor(item.status), border: `1px solid ${C.border}` }}>
                      {item.status.replace('_', ' ')}
                    </span>
                    {item.is_live && item.expires_at && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.7rem', fontWeight: 700, color: C.green }}>
                        <span className="material-symbols-outlined" style={{ fontSize: '0.85rem' }}>schedule</span>
                        Live until {new Date(item.expires_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', paddingTop: '0.75rem', borderTop: `1px solid ${C.border}` }}>
                    <ListingFeeDialog
                      listingType="service"
                      listingId={item.id}
                      listingName={item.name}
                      moderationStatus={item.status}
                      expiresAt={item.expires_at}
                      onChanged={load}
                    />
                    <button onClick={() => navigate('/add-service', { state: { service: item } })}
                      style={{ padding: '0.5rem 0.9rem', borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', color: C.text, fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer' }}>Edit</button>
                    {(item.status === 'draft' || item.status === 'rejected') && (
                      <button onClick={() => submit(item.id)} style={{ padding: '0.5rem 0.9rem', borderRadius: 8, border: 'none', background: C.cyan, color: 'var(--color-on-brand)', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer' }}>Submit for review</button>
                    )}
                    {item.status !== 'archived' && (
                      <button onClick={() => archive(item.id)} style={{ padding: '0.5rem 0.9rem', borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', color: C.muted, fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer' }}>Archive</button>
                    )}
                    <button onClick={() => remove(item.id)} style={{ padding: '0.5rem 0.9rem', borderRadius: 8, border: '1px solid rgba(220,38,38,0.3)', background: 'transparent', color: C.error, fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer' }}>Delete</button>
                  </div>
                </div>
              ))}
            </div>
          )}

        </div>
      </main>
    </div>
  );
};

export default MyServices;
