import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../hooks/useAuth';
import { SupplierSidebar } from '../../../components/SupplierSidebar';
import NhaavAccessCard from '../../../components/NhaavAccessCard';
import { suppliesService, SupplyListing, SupplierDashboardCounts } from '../../../services/supplies';
import { requestsService } from '../../../services/requests';
import { notificationsService, Notification } from '../../../services/notifications';

const M = "'Manrope', sans-serif";
const I = "'Inter', sans-serif";

const C = {
  bg: 'var(--color-background)',
  bgCard: 'var(--color-surface)',
  bgCardH: 'var(--color-surface)',
  bgLowest: 'var(--color-surface-alt)',
  border: 'var(--color-border)',
  text: 'var(--color-text)',
  muted: 'var(--color-muted)',
  dim: 'var(--color-faint)',
  cyan: 'var(--color-brand)',
  primary: 'var(--color-brand)',
  error: 'var(--color-error)',
  green: 'var(--color-success)',
  white: 'var(--color-text)',
};

interface OpenRequest { id: string; title: string; service_type: string; port: string; created_at?: string; }

export const SupplierDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const companyName = user?.company || user?.full_name || user?.name || user?.email || 'your company';

  const [counts, setCounts] = useState<SupplierDashboardCounts | null>(null);
  const [listings, setListings] = useState<SupplyListing[]>([]);
  const [requests, setRequests] = useState<OpenRequest[]>([]);
  const [notifs, setNotifs] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        setLoading(true);
        const [dash, mine, reqs, notes] = await Promise.all([
          suppliesService.getDashboard(),
          suppliesService.getMyListings(),
          requestsService.getUserRequests({ status: 'open', request_type: 'supply', limit: 5 }),
          notificationsService.getNotifications(),
        ]);
        if (!active) return;
        setCounts(dash);
        setListings(mine);
        setRequests((reqs?.data || reqs || []) as OpenRequest[]);
        setNotifs(notes || []);
      } catch (err) {
        console.error(err);
        if (active) setError('Could not load your supplier dashboard.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  const unread = notifs.filter(n => !n.is_read).length;
  const stat = (label: string, value: number | '—', accent?: string) => (
    <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 16, padding: '1.25rem 1.5rem' }}>
      <p style={{ fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.14em', color: C.muted, margin: '0 0 0.5rem' }}>{label}</p>
      <h3 style={{ fontFamily: M, fontWeight: 800, fontSize: '1.9rem', margin: 0, color: accent || C.text }}>{value}</h3>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: I }}>
      <SupplierSidebar activePath="/supplier-dashboard" />
      <main style={{ marginLeft: 'var(--sidebar-width, 256px)', padding: '2.5rem 2rem 5rem', maxWidth: 1200, transition: 'margin-left 0.25s' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '1rem', marginBottom: '2rem' }}>
          <div>
            <h1 style={{ fontFamily: M, fontWeight: 800, fontSize: '2.1rem', margin: '0 0 0.35rem', letterSpacing: '-0.02em' }}>Supplier Dashboard</h1>
            <p style={{ color: C.muted, margin: 0 }}>{companyName} — supplies, catalogue and procurement in one place.</p>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button onClick={() => navigate('/profile/edit')}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0.75rem 1.25rem', background: 'transparent', color: C.primary, border: `1px solid ${C.border}`, borderRadius: 10, fontWeight: 800, cursor: 'pointer' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '1.2rem' }}>domain</span>
              Company profile & ports
            </button>
            <button onClick={() => navigate('/supplier/add-listing')}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0.75rem 1.5rem', background: C.primary, color: 'var(--color-on-brand)', border: 'none', borderRadius: 10, fontWeight: 800, cursor: 'pointer' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '1.2rem' }}>add_circle</span>
              + Add Supply Listing
            </button>
          </div>
        </div>

        {error && <p style={{ color: C.error, marginBottom: '1.5rem' }}>{error}</p>}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '2.5rem' }}>
          {stat('Active Listings', counts ? counts.active_listings : '—', C.green)}
          {stat('Pending Review', counts ? counts.pending_listings : '—')}
          {stat('Drafts', counts ? counts.draft_listings : '—')}
          {stat('Procurement Requests', loading ? '—' : requests.length, C.cyan)}
          {stat('Unread Notifications', loading ? '—' : unread)}
        </div>

        {/* Nhaav Access: plan, pass balance + current session (gated orgs only) */}
        <NhaavAccessCard style={{ marginBottom: '2.5rem' }} />

        <section style={{ marginBottom: '2.5rem' }}>
          <h2 style={{ fontFamily: M, fontWeight: 700, fontSize: '1.2rem', margin: '0 0 1rem' }}>Matching Procurement Requests</h2>
          {loading ? (
            <p style={{ color: C.muted }}>Loading…</p>
          ) : requests.length === 0 ? (
            <div style={{ background: C.bgCard, border: `1px dashed ${C.border}`, borderRadius: 16, padding: '2rem', textAlign: 'center', color: C.muted }}>
              No open supply requests match your catalogue yet.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {requests.map(r => (
                <div key={r.id} style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 14, padding: '1rem 1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                  <div>
                    <h3 style={{ fontFamily: M, fontWeight: 700, margin: '0 0 4px', fontSize: '1rem' }}>{r.title || r.service_type}</h3>
                    <p style={{ color: C.muted, margin: 0, fontSize: '0.85rem' }}>{r.service_type} · {r.port}</p>
                  </div>
                  <button onClick={() => navigate(`/submit-quotation?requestId=${r.id}`)}
                    style={{ padding: '0.55rem 1.25rem', background: C.cyan, color: 'var(--color-on-brand)', border: 'none', borderRadius: 10, fontWeight: 700, cursor: 'pointer' }}>
                    Submit Quotation
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2 style={{ fontFamily: M, fontWeight: 700, fontSize: '1.2rem', margin: 0 }}>My Catalogue</h2>
            <button onClick={() => navigate('/supplier/catalog')} style={{ background: 'none', border: 'none', color: C.cyan, fontWeight: 700, cursor: 'pointer' }}>Manage all →</button>
          </div>
          {loading ? (
            <p style={{ color: C.muted }}>Loading…</p>
          ) : listings.length === 0 ? (
            <div style={{ background: C.bgCard, border: `1px dashed ${C.border}`, borderRadius: 16, padding: '2rem', textAlign: 'center', color: C.muted }}>
              You have no supply listings yet. <button onClick={() => navigate('/supplier/add-listing')} style={{ background: 'none', border: 'none', color: C.cyan, fontWeight: 700, cursor: 'pointer' }}>Add your first listing</button>.
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '1rem' }}>
              {listings.slice(0, 6).map(l => (
                <div key={l.id} style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 14, padding: '1rem' }}>
                  <h3 style={{ fontFamily: M, fontWeight: 700, margin: '0 0 4px', fontSize: '1rem' }}>{l.name}</h3>
                  <p style={{ color: C.muted, margin: '0 0 0.5rem', fontSize: '0.8rem' }}>{l.category}</p>
                  <span style={{ fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: l.status === 'approved' ? C.green : C.cyan, background: C.bgLowest, padding: '3px 8px', borderRadius: 999 }}>{l.status.replace('_', ' ')}</span>
                </div>
              ))}
            </div>
          )}
        </section>

      </main>
    </div>
  );
};

export default SupplierDashboard;
