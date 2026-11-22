import React, { useCallback, useEffect, useState } from 'react';
import AdminSidebar from '../../components/AdminSidebar';
import { adminModerationService, ModerationKind, ModerationListing } from '../../services/adminModeration';

const C = {
  bg: 'var(--color-background)',
  bgLow: 'var(--color-surface-alt)',
  bgCard: 'var(--color-surface)',
  border: 'var(--color-border)',
  borderV: 'var(--color-border-strong)',
  text: 'var(--color-text)',
  muted: 'var(--color-muted)',
  dim: 'var(--color-faint)',
  cyan: 'var(--color-brand)',
  primary: 'var(--color-brand)',
  error: 'var(--color-error)',
  success: 'var(--color-success)',
  primCont: 'var(--color-brand-tint-solid)',
  errorCont: 'var(--color-error-tint)',
};
const M = "'Manrope', sans-serif";
const I = "'Inter', sans-serif";

const glass: React.CSSProperties = {
  background: 'var(--color-surface)',
  boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
  border: `1px solid ${C.border}`,
};

export const ListingModeration: React.FC = () => {
  const [kind, setKind] = useState<ModerationKind>('service');
  const [listings, setListings] = useState<ModerationListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await adminModerationService.getQueue(kind);
      setListings(res.data || []);
    } catch (err) {
      console.error('Failed to load moderation queue:', err);
      setLoadError('Could not load the moderation queue. You may need to sign in as an admin.');
    } finally {
      setLoading(false);
    }
  }, [kind]);

  useEffect(() => { load(); }, [load]);

  const approve = async (l: ModerationListing) => {
    setBusyId(l.id);
    setNotice(null);
    try {
      await adminModerationService.act(l.kind, l.id, 'approved');
      setNotice(`Approved "${l.name}".`);
      await load();
    } catch (err) {
      setNotice((err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'Failed to approve listing.');
    } finally {
      setBusyId(null);
    }
  };

  const confirmReject = async (l: ModerationListing) => {
    setBusyId(l.id);
    setNotice(null);
    try {
      await adminModerationService.act(l.kind, l.id, 'rejected', rejectReason.trim() || undefined);
      setNotice(`Rejected "${l.name}".`);
      setRejectingId(null);
      setRejectReason('');
      await load();
    } catch (err) {
      setNotice((err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'Failed to reject listing.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: C.bg, color: C.text, fontFamily: I }}>
      <AdminSidebar activePath="/admin/moderation" />

      <div style={{ marginLeft: 'var(--sidebar-width, 256px)', flex: 1, padding: '2rem', display: 'flex', flexDirection: 'column', gap: '2rem' }}>

        <section style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <p style={{ fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.2em', color: C.cyan, margin: '0 0 4px' }}>Marketplace Control</p>
            <h2 style={{ fontFamily: M, fontWeight: 900, fontSize: 'clamp(1.8rem,4vw,2.4rem)', letterSpacing: '-0.04em', margin: '0 0 4px' }}>Listing Moderation</h2>
            <p style={{ color: C.dim, margin: 0, fontSize: '0.875rem' }}>Review pending service and supply listings before they go live.</p>
          </div>
          <button onClick={load} disabled={loading}
            style={{ padding: '0.6rem 1.25rem', borderRadius: 10, border: `1px solid ${C.borderV}`, background: 'transparent', color: C.text, fontWeight: 700, cursor: loading ? 'wait' : 'pointer' }}>
            Refresh
          </button>
        </section>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {(['service', 'supply'] as ModerationKind[]).map(k => (
            <button key={k} onClick={() => { setKind(k); setRejectingId(null); setNotice(null); }}
              style={{ padding: '0.5rem 1.25rem', borderRadius: 999, border: `1px solid ${C.border}`, background: kind === k ? C.primary : 'transparent', color: kind === k ? 'var(--color-on-brand)' : C.muted, fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}>
              {k === 'service' ? 'Service Listings' : 'Supply Listings'}
            </button>
          ))}
        </div>

        {notice && (
          <div style={{ ...glass, padding: '0.85rem 1.25rem', borderRadius: 12, fontSize: '0.85rem', color: C.text }}>{notice}</div>
        )}
        {loadError && (
          <div style={{ ...glass, padding: '0.85rem 1.25rem', borderRadius: 12, fontSize: '0.85rem', color: C.error, border: `1px solid rgba(220,38,38,0.3)` }}>{loadError}</div>
        )}

        <section style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {loading ? (
            <p style={{ color: C.dim }}>Loading pending listings…</p>
          ) : listings.length === 0 ? (
            <div style={{ ...glass, padding: '3rem', borderRadius: 16, textAlign: 'center', color: C.dim, fontStyle: 'italic' }}>
              No {kind} listings are awaiting review.
            </div>
          ) : (
            listings.map(l => (
              <div key={l.id} style={{ ...glass, borderRadius: 16, padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
                  <div>
                    <h3 style={{ fontFamily: M, fontWeight: 800, fontSize: '1.15rem', margin: '0 0 4px' }}>{l.name}</h3>
                    <p style={{ color: C.muted, margin: 0, fontSize: '0.85rem' }}>
                      {l.category}{l.subcategory ? ` · ${l.subcategory}` : ''}
                      {l.kind === 'service' && l.port_id ? ` · ${l.port_id}` : ''}
                      {l.kind === 'supply' && l.ports.length ? ` · ${l.ports.join(', ')}` : ''}
                    </p>
                  </div>
                  <span style={{ alignSelf: 'flex-start', fontSize: '0.62rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: C.cyan, background: C.primCont, padding: '4px 10px', borderRadius: 999 }}>
                    {l.status.replace('_', ' ')}
                  </span>
                </div>

                {l.description && <p style={{ color: C.muted, margin: 0, fontSize: '0.9rem', lineHeight: 1.6 }}>{l.description}</p>}

                <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', fontSize: '0.8rem', color: C.muted, borderTop: `1px solid ${C.border}`, paddingTop: '0.75rem' }}>
                  <span><strong style={{ color: C.text }}>Owner:</strong> {l.owner_company || '—'}</span>
                  <span><strong style={{ color: C.text }}>Email:</strong> {l.owner_email || '—'}</span>
                  <span><strong style={{ color: C.text }}>Submitted:</strong> {new Date(l.updated_at).toLocaleString()}</span>
                </div>

                {rejectingId === l.id ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)}
                      placeholder="Reason for rejection (shared with the owner)…"
                      style={{ width: '100%', minHeight: 80, background: C.bgLow, border: `1px solid ${C.border}`, borderRadius: 10, padding: '0.75rem', color: C.text, fontFamily: I, outline: 'none', boxSizing: 'border-box' }} />
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button onClick={() => confirmReject(l)} disabled={busyId === l.id}
                        style={{ padding: '0.55rem 1.25rem', borderRadius: 10, border: 'none', background: C.error, color: 'var(--color-text-inverse)', fontWeight: 800, cursor: busyId === l.id ? 'wait' : 'pointer' }}>
                        {busyId === l.id ? 'Rejecting…' : 'Confirm Rejection'}
                      </button>
                      <button onClick={() => { setRejectingId(null); setRejectReason(''); }}
                        style={{ padding: '0.55rem 1.25rem', borderRadius: 10, border: `1px solid ${C.border}`, background: 'transparent', color: C.muted, fontWeight: 700, cursor: 'pointer' }}>
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button onClick={() => approve(l)} disabled={busyId === l.id}
                      style={{ padding: '0.55rem 1.5rem', borderRadius: 10, border: 'none', background: C.success, color: 'var(--color-text-inverse)', fontWeight: 800, cursor: busyId === l.id ? 'wait' : 'pointer' }}>
                      {busyId === l.id ? 'Working…' : 'Approve'}
                    </button>
                    <button onClick={() => { setRejectingId(l.id); setRejectReason(''); }} disabled={busyId === l.id}
                      style={{ padding: '0.55rem 1.5rem', borderRadius: 10, border: `1px solid rgba(220,38,38,0.3)`, background: 'transparent', color: C.error, fontWeight: 800, cursor: 'pointer' }}>
                      Reject
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </section>
      </div>
    </div>
  );
};

export default ListingModeration;
