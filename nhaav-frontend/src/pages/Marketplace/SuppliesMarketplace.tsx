import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { suppliesService, SupplyListing } from '../../services/supplies';
import { SUPPLY_CATEGORY_NAMES } from '../../constants/supplies';
import { BrandLogo } from '../../components/BrandLogo';

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

export const SuppliesMarketplace: React.FC = () => {
  const navigate = useNavigate();
  const [listings, setListings] = useState<SupplyListing[]>([]);
  const [category, setCategory] = useState<string>('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await suppliesService.listSupplies({
        category: category || undefined,
        search: search || undefined,
        page,
        limit: 12,
      });
      setListings(res.data);
      setTotal(res.total);
      setPages(res.pages);
    } catch (err) {
      console.error(err);
      setError('Could not load the Supplies Marketplace. Please retry.');
    } finally {
      setLoading(false);
    }
  }, [category, search, page]);

  useEffect(() => { load(); }, [load]);

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: I }}>
      <header style={{ padding: '2.5rem 2rem 1rem', maxWidth: 1240, margin: '0 auto' }}>
        <button onClick={() => navigate('/')} aria-label="Nhaav home" style={{ background: 'none', border: 'none', padding: 0, marginBottom: '1.25rem', cursor: 'pointer' }}>
          <BrandLogo height={22} />
        </button>
        <button onClick={() => navigate('/marketplace')} style={{ background: 'none', border: 'none', color: C.cyan, fontWeight: 700, cursor: 'pointer', padding: 0, marginBottom: '1rem' }}>← Marketplace</button>
        <h1 style={{ fontFamily: M, fontWeight: 800, fontSize: '2.2rem', margin: '0 0 0.35rem' }}>Supplies Marketplace</h1>
        <p style={{ color: C.muted, margin: 0 }}>Verified suppliers offering marine products and consumables.</p>

        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem', flexWrap: 'wrap' }}>
          <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search supplies (e.g. generator, pump, extinguisher)"
            style={{ flex: 1, minWidth: 240, background: C.bgLowest, border: `1px solid ${C.border}`, borderRadius: 999, padding: '0.65rem 1.1rem', color: C.text, outline: 'none' }} />
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', flexWrap: 'wrap' }}>
          <button onClick={() => { setCategory(''); setPage(1); }}
            style={{ padding: '0.4rem 0.95rem', borderRadius: 999, border: `1px solid ${C.border}`, background: category === '' ? C.primary : 'transparent', color: category === '' ? '#ffffff' : C.muted, fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer' }}>All</button>
          {SUPPLY_CATEGORY_NAMES.map(cat => (
            <button key={cat} onClick={() => { setCategory(cat); setPage(1); }}
              style={{ padding: '0.4rem 0.95rem', borderRadius: 999, border: `1px solid ${C.border}`, background: category === cat ? C.primary : 'transparent', color: category === cat ? '#ffffff' : C.muted, fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer' }}>{cat}</button>
          ))}
        </div>
      </header>

      <main style={{ maxWidth: 1240, margin: '0 auto', padding: '1rem 2rem 5rem' }}>
        {error && <p style={{ color: C.error }}>{error}</p>}
        {loading ? (
          <p style={{ color: C.muted }}>Loading supplies…</p>
        ) : listings.length === 0 ? (
          <div style={{ background: C.bgCard, border: `1px dashed ${C.border}`, borderRadius: 16, padding: '3rem', textAlign: 'center', color: C.muted }}>
            No approved supply listings match this search yet.
          </div>
        ) : (
          <>
            <p style={{ color: C.dim, fontSize: '0.8rem' }}>{total} listing{total === 1 ? '' : 's'}</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '1.25rem' }}>
              {listings.map(l => (
                <div key={l.id} onClick={() => navigate(`/supplies/${l.id}`)}
                  style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 16, padding: '1.25rem', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <span style={{ fontSize: '0.62rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: C.cyan }}>{l.category}</span>
                  <h3 style={{ fontFamily: M, fontWeight: 800, fontSize: '1.1rem', margin: 0 }}>{l.name}</h3>
                  {l.supplier_company_name && (
                    <span style={{ fontSize: '0.78rem', fontWeight: 700, color: C.muted }}>{l.supplier_company_name}</span>
                  )}
                  {l.manufacturer && <p style={{ color: C.muted, margin: 0, fontSize: '0.82rem' }}>{l.manufacturer}{l.model_number ? ` · ${l.model_number}` : ''}</p>}
                  {/* Demo marketplace: listed figures are intentionally hidden. */}
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontFamily: M, fontWeight: 800, fontSize: '1.05rem', color: C.text }}>
                      TBC
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem' }}>
                    <span style={{ fontSize: '0.72rem', color: C.muted }}>{l.ports && l.ports.length ? l.ports.slice(0, 2).join(', ') : 'Location on request'}</span>
                    <span style={{ fontSize: '0.62rem', fontWeight: 800, color: C.green }}>● {l.availability ? l.availability.replace('_', ' ') : 'available'}</span>
                  </div>
                </div>
              ))}
            </div>
            {pages > 1 && (
              <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', marginTop: '2rem' }}>
                <button disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))} style={{ padding: '0.5rem 1rem', borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', color: C.text, cursor: 'pointer' }}>Prev</button>
                <span style={{ padding: '0.5rem 1rem', color: C.muted }}>{page} / {pages}</span>
                <button disabled={page >= pages} onClick={() => setPage(p => Math.min(pages, p + 1))} style={{ padding: '0.5rem 1rem', borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', color: C.text, cursor: 'pointer' }}>Next</button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
};

export default SuppliesMarketplace;
