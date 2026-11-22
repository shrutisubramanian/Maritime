import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SupplierSidebar } from '../../../components/SupplierSidebar';
import { suppliesService, SupplyListing, SupplyListingStatus } from '../../../services/supplies';
import { ListingFeeDialog } from '../../../components/ListingFeeDialog';

const M = "'Manrope', sans-serif";
const I = "'Inter', sans-serif";

const C = {
  bg: 'var(--color-background)',
  bgCard: 'var(--color-surface)',
  bgLowest: 'var(--color-surface-alt)',
  border: 'var(--color-border)',
  text: 'var(--color-text)',
  muted: 'var(--color-muted)',
  dim: 'var(--color-faint)',
  cyan: 'var(--color-brand)',
  primary: 'var(--color-brand)',
  error: 'var(--color-error)',
  green: 'var(--color-success)',
};

const FILTERS: { label: string; value?: SupplyListingStatus }[] = [
  { label: 'All' },
  { label: 'Active', value: 'approved' },
  { label: 'Pending', value: 'pending_review' },
  { label: 'Drafts', value: 'draft' },
  { label: 'Rejected', value: 'rejected' },
  { label: 'Archived', value: 'archived' },
];

export const MyCatalog: React.FC = () => {
  const navigate = useNavigate();
  const [listings, setListings] = useState<SupplyListing[]>([]);
  const [filter, setFilter] = useState<SupplyListingStatus | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await suppliesService.getMyListings(filter);
      setListings(data);
    } catch (err) {
      console.error(err);
      setError('Could not load your catalogue.');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const submit = async (id: string) => { await suppliesService.submitListing(id); load(); };
  const archive = async (id: string) => { await suppliesService.archiveListing(id); load(); };
  const remove = async (id: string) => {
    if (!window.confirm('Delete this listing permanently?')) return;
    await suppliesService.deleteListing(id);
    load();
  };

  const statusColor = (s: SupplyListingStatus) =>
    s === 'approved' ? C.green : s === 'rejected' ? C.error : C.cyan;

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: I }}>
      <SupplierSidebar activePath="/supplier/catalog" />
      <main style={{ marginLeft: 'var(--sidebar-width, 256px)', padding: '2.5rem 2rem 5rem', maxWidth: 1200, transition: 'margin-left 0.25s' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '1rem', marginBottom: '2rem' }}>
          <div>
            <h1 style={{ fontFamily: M, fontWeight: 800, fontSize: '2.1rem', margin: '0 0 0.35rem' }}>My Catalog</h1>
            <p style={{ color: C.muted, margin: 0 }}>Manage your supply listings. Only approved listings appear in the Supplies Marketplace.</p>
          </div>
          <button onClick={() => navigate('/supplier/add-listing')}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0.75rem 1.5rem', background: C.primary, color: 'var(--color-on-brand)', border: 'none', borderRadius: 10, fontWeight: 800, cursor: 'pointer' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '1.2rem' }}>add_circle</span>
            + Add Listing
          </button>
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
        ) : listings.length === 0 ? (
          <div style={{ background: C.bgCard, border: `1px dashed ${C.border}`, borderRadius: 16, padding: '3rem', textAlign: 'center', color: C.muted }}>
            No listings in this view.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.25rem' }}>
            {listings.map(l => (
              <div key={l.id} style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 16, padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div>
                  <h3 style={{ fontFamily: M, fontWeight: 800, fontSize: '1.1rem', margin: '0 0 4px' }}>{l.name}</h3>
                  <p style={{ color: C.muted, margin: 0, fontSize: '0.85rem' }}>{l.category}{l.subcategory ? ` · ${l.subcategory}` : ''}</p>
                  {l.ports && l.ports.length > 0 && (
                    <p style={{ color: C.dim, margin: '4px 0 0', fontSize: '0.78rem' }}>Ports: {l.ports.join(', ')}</p>
                  )}
                </div>
                <span style={{ alignSelf: 'flex-start', fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: statusColor(l.status), background: C.bgLowest, padding: '3px 8px', borderRadius: 999 }}>
                  {l.status.replace('_', ' ')}
                </span>
                {l.is_live && l.expires_at && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.72rem', fontWeight: 700, color: C.green }}>
                    <span className="material-symbols-outlined" style={{ fontSize: '0.9rem' }}>schedule</span>
                    Live until {new Date(l.expires_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </span>
                )}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', paddingTop: '0.5rem', borderTop: `1px solid ${C.border}` }}>
                  <ListingFeeDialog
                    listingType="supply"
                    listingId={l.id}
                    listingName={l.name}
                    moderationStatus={l.status}
                    expiresAt={l.expires_at}
                    onChanged={load}
                  />
                  <button onClick={() => navigate('/supplier/add-listing', { state: { listing: l } })}
                    style={{ padding: '0.45rem 0.9rem', borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', color: C.text, fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer' }}>Edit</button>
                  {(l.status === 'draft' || l.status === 'rejected') && (
                    <button onClick={() => submit(l.id)} style={{ padding: '0.45rem 0.9rem', borderRadius: 8, border: 'none', background: C.cyan, color: 'var(--color-on-brand)', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer' }}>Submit for review</button>
                  )}
                  {l.status !== 'archived' && (
                    <button onClick={() => archive(l.id)} style={{ padding: '0.45rem 0.9rem', borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', color: C.muted, fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer' }}>Archive</button>
                  )}
                  <button onClick={() => remove(l.id)} style={{ padding: '0.45rem 0.9rem', borderRadius: 8, border: '1px solid rgba(220,38,38,0.3)', background: 'transparent', color: C.error, fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer' }}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default MyCatalog;
