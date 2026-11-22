import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  companiesService,
  CompanyCard,
  VendorCategory,
  VendorType,
} from '../../services/companies';
import { portsService, PortOption, portLabel } from '../../services/ports';
import { searchErrorMessage } from '../../services/marketplace';
import { useAuth } from '../../hooks/useAuth';
import { useIsMobile } from '../../hooks/useIsMobile';
import CompanyCardView from '../../components/MarketplaceCompanyCard';
import { BrandLogo } from '../../components/BrandLogo';

/**
 * Company-first marketplace.
 *
 * The unit of browsing is a COMPANY, not a service description. Pick a vendor
 * type, pick a primary business category, and the grid lists the companies in
 * that category. A subcategory narrows to companies that declared that
 * capability. Every card opens the company's business profile.
 *
 * Eligibility is decided by the API (approved profile + active paid visibility);
 * this page only renders what it is given and never fabricates a badge, a
 * rating or a coverage claim.
 */

const T = {
  manrope: "'Manrope', sans-serif" as const,
  inter: "'Inter', sans-serif" as const,
  bg: 'var(--color-background)',
  bgLow: 'var(--color-surface-alt)',
  bgCard: 'var(--color-surface)',
  border: 'var(--color-border)',
  text: 'var(--color-text)',
  muted: 'var(--color-muted)',
  dim: 'var(--color-faint)',
  brand: 'var(--color-brand)',
  success: 'var(--color-success)',
  onBrand: 'var(--color-on-brand)',
};

const blur = (): React.CSSProperties => ({
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
});

const VENDOR_TABS: { type: VendorType; label: string; blurb: string }[] = [
  {
    type: 'provider',
    label: 'Service Providers',
    blurb: 'Companies that carry out work on board, in port or underwater.',
  },
  {
    type: 'supplier',
    label: 'Suppliers',
    blurb: 'Companies that supply parts, stores, equipment and consumables.',
  },
];

/* ── Page ─────────────────────────────────────────────────────── */
export const Marketplace: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isMobile = useIsMobile();
  // On phones the category rail is an overlay drawer (same scrim pattern as
  // the dashboards), opened from the results header.
  const [categoriesOpen, setCategoriesOpen] = useState(false);

  const [vendorType, setVendorType] = useState<VendorType>('provider');
  const [categories, setCategories] = useState<VendorCategory[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedSubcategory, setSelectedSubcategory] = useState<string | null>(null);

  const [companies, setCompanies] = useState<CompanyCard[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const [port, setPort] = useState('');
  const [country, setCountry] = useState('');
  // Head-office port catalogue from the API (admins can extend it).
  const [portOptions, setPortOptions] = useState<PortOption[]>([]);

  const activeTab = VENDOR_TABS.find((t) => t.type === vendorType) ?? VENDOR_TABS[0];
  const activeCategory = categories.find((c) => c.name === selectedCategory) ?? null;

  /* Ports a company's HEAD OFFICE can be based at — the filter list. */
  useEffect(() => {
    let cancelled = false;
    portsService
      .list()
      .then((list) => {
        if (!cancelled) setPortOptions(list);
      })
      .catch(() => {
        if (!cancelled) setPortOptions([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /* Categories for the selected vendor type (sidebar + subcategory chips). */
  useEffect(() => {
    let cancelled = false;
    setCategoriesLoading(true);
    companiesService
      .getVendorCategories(vendorType)
      .then((res) => {
        if (cancelled) return;
        setCategories(res.data || []);
      })
      .catch(() => {
        if (!cancelled) setCategories([]);
      })
      .finally(() => {
        if (!cancelled) setCategoriesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [vendorType]);

  const loadCompanies = useCallback(async () => {
    setLoading(true);
    try {
      const res = await companiesService.listCompanies({
        vendor_type: vendorType,
        category: selectedCategory || undefined,
        subcategory: selectedSubcategory || undefined,
        port: port || undefined,
        country: country || undefined,
        search: search || undefined,
        page,
        limit: 12,
      });
      setCompanies(res.data || []);
      setTotal(res.total || 0);
      setPages(res.pages || 1);
      setNotice('');
    } catch (err) {
      setCompanies([]);
      setTotal(0);
      setPages(1);
      setNotice(searchErrorMessage(err) || 'Could not load companies. Please retry.');
    } finally {
      setLoading(false);
    }
  }, [vendorType, selectedCategory, selectedSubcategory, port, country, search, page]);

  useEffect(() => {
    loadCompanies();
  }, [loadCompanies]);

  const switchVendorType = (next: VendorType) => {
    if (next === vendorType) return;
    setVendorType(next);
    setSelectedCategory(null);
    setSelectedSubcategory(null);
    setPage(1);
  };

  const pickCategory = (name: string | null) => {
    setSelectedCategory(name);
    setSelectedSubcategory(null);
    setPage(1);
    if (isMobile) setCategoriesOpen(false);
  };

  return (
    <div style={{ background: T.bg, color: T.text, fontFamily: T.inter, minHeight: '100vh' }}>
      {/* Top nav */}
      <nav
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          height: 72,
          zIndex: 50,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 2rem',
          background: 'var(--bg-glass)',
          ...blur(),
          borderBottom: `1px solid ${T.border}`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
          <BrandLogo height={28} />
          <button
            onClick={() => navigate('/ship-owner')}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: T.muted,
              fontFamily: T.manrope,
              fontSize: '0.85rem',
            }}
          >
            Dashboard
          </button>
          <button
            onClick={() => navigate('/create-request?type=service')}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: T.muted,
              fontFamily: T.manrope,
              fontSize: '0.85rem',
            }}
          >
            Create Request
          </button>
        </div>
        <div
          onClick={() => navigate('/company-profile')}
          style={{
            width: 36,
            height: 36,
            borderRadius: '50%',
            border: `1px solid ${T.border}`,
            cursor: 'pointer',
            background: 'var(--color-brand-tint)',
            color: T.brand,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '0.85rem',
            fontWeight: 700,
          }}
        >
          {(user?.full_name || user?.name || user?.email || '?').trim().charAt(0).toUpperCase()}
        </div>
      </nav>

      <main style={{ paddingTop: 72 }}>
        <div style={{ maxWidth: 1320, margin: '0 auto', padding: '2.5rem 2rem 5rem' }}>
          {/* Vendor type tabs */}
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
            {VENDOR_TABS.map((tab) => {
              const active = tab.type === vendorType;
              return (
                <button
                  key={tab.type}
                  onClick={() => switchVendorType(tab.type)}
                  style={{
                    padding: '0.55rem 1.1rem',
                    borderRadius: 999,
                    border: `1px solid ${active ? T.brand : T.border}`,
                    background: active ? T.brand : 'transparent',
                    color: active ? T.onBrand : T.muted,
                    fontFamily: T.manrope,
                    fontWeight: 700,
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                  }}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          <h1
            style={{
              fontFamily: T.manrope,
              fontWeight: 800,
              fontSize: 'clamp(1.8rem, 3vw, 2.6rem)',
              letterSpacing: '-0.03em',
              margin: '0 0 0.4rem',
            }}
          >
            Find a company, not a catalogue line.
          </h1>
          <p style={{ color: T.muted, margin: '0 0 1.75rem', maxWidth: 720 }}>
            {activeTab.blurb} Choose a category to see the companies registered in it, then open a
            company's profile for its declared capabilities, coverage and contact details.
          </p>

          {/* Search + filters */}
          <div
            style={{
              display: 'flex',
              gap: '0.6rem',
              flexWrap: 'wrap',
              padding: '0.6rem',
              borderRadius: 14,
              background: T.bgCard,
              border: `1px solid ${T.border}`,
              marginBottom: '1rem',
            }}
          >
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search company, category or capability"
              style={{
                flex: '2 1 260px',
                minWidth: 220,
                padding: '0.7rem 0.9rem',
                borderRadius: 10,
                border: `1px solid ${T.border}`,
                background: T.bgLow,
                color: T.text,
                outline: 'none',
                fontSize: '0.88rem',
              }}
            />
            <input
              value={country}
              onChange={(e) => {
                setCountry(e.target.value);
                setPage(1);
              }}
              placeholder="Country"
              style={{
                flex: '1 1 140px',
                padding: '0.7rem 0.9rem',
                borderRadius: 10,
                border: `1px solid ${T.border}`,
                background: T.bgLow,
                color: T.text,
                outline: 'none',
                fontSize: '0.88rem',
              }}
            />
            <select
              value={port}
              onChange={(e) => {
                setPort(e.target.value);
                setPage(1);
              }}
              style={{
                flex: '1 1 170px',
                padding: '0.7rem 0.9rem',
                borderRadius: 10,
                border: `1px solid ${T.border}`,
                background: T.bgLow,
                color: T.text,
                outline: 'none',
                fontSize: '0.88rem',
              }}
            >
              <option value="">All head-office ports</option>
              {portOptions.map((p) => (
                <option key={p.id} value={p.name}>
                  {portLabel(p)}
                </option>
              ))}
            </select>
          </div>

          {/* Quick port chips */}
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '1.75rem' }}>
            <button
              onClick={() => {
                setPort('');
                setPage(1);
              }}
              style={{
                padding: '4px 11px',
                borderRadius: 999,
                border: `1px solid ${!port ? T.brand : T.border}`,
                background: !port ? 'var(--color-brand-tint)' : 'transparent',
                color: !port ? T.text : T.muted,
                fontSize: '0.74rem',
                fontWeight: !port ? 700 : 500,
                cursor: 'pointer',
              }}
            >
              All ports
            </button>
            {portOptions.slice(0, 8).map((p) => {
              const chip = p.name;
              const active = !!port && port.toLowerCase() === chip.toLowerCase();
              return (
                <button
                  key={chip}
                  onClick={() => {
                    setPort(chip);
                    setPage(1);
                  }}
                  style={{
                    padding: '4px 11px',
                    borderRadius: 999,
                    border: `1px solid ${active ? T.brand : T.border}`,
                    background: active ? 'var(--color-brand-tint)' : 'transparent',
                    color: active ? T.text : T.muted,
                    fontSize: '0.74rem',
                    fontWeight: active ? 700 : 500,
                    cursor: 'pointer',
                  }}
                >
                  {chip}
                </button>
              );
            })}
          </div>

          <p style={{ color: T.dim, fontSize: '0.74rem', margin: '0 0 1.25rem' }}>
            Ports match a company's head office — the port it is based at. Companies
            also list the other ports they work in, which you can see on their profile.
          </p>

          <div style={{ display: 'flex', gap: '2rem', alignItems: 'flex-start', flexDirection: isMobile ? 'column' : 'row' }}>
            {/* Category sidebar — sticky rail on desktop, drawer under 769px */}
            {isMobile && (
              <div
                className={`sidebar-scrim${categoriesOpen ? ' is-open' : ''}`}
                onClick={() => setCategoriesOpen(false)}
              />
            )}
            <aside
              style={{
                width: isMobile ? 280 : 260,
                maxWidth: '85vw',
                flexShrink: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
                ...(isMobile
                  ? {
                      position: 'fixed' as const,
                      top: 0,
                      bottom: 0,
                      left: 0,
                      zIndex: 80,
                      height: '100vh',
                      overflowY: 'auto' as const,
                      background: T.bgCard,
                      borderRight: `1px solid ${T.border}`,
                      padding: '1.25rem 1rem',
                      transform: categoriesOpen ? 'none' : 'translateX(-100%)',
                      transition: 'transform 0.25s ease',
                      boxShadow: categoriesOpen ? '0 20px 60px rgba(0,0,0,0.25)' : 'none',
                    }
                  : { position: 'sticky' as const, top: 88 }),
              }}
            >
              {isMobile && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: T.dim }}>
                    Categories
                  </span>
                  <button
                    type="button"
                    onClick={() => setCategoriesOpen(false)}
                    aria-label="Close categories"
                    style={{ background: 'transparent', border: 'none', color: T.muted, cursor: 'pointer', fontSize: '1.25rem', lineHeight: 1, padding: 4 }}
                  >
                    ×
                  </button>
                </div>
              )}
              <div
                style={{
                  fontSize: '0.68rem',
                  fontWeight: 800,
                  letterSpacing: '0.14em',
                  textTransform: 'uppercase',
                  color: T.dim,
                  margin: '0 0 0.4rem 0.5rem',
                }}
              >
                {vendorType === 'supplier' ? 'Supplier categories' : 'Service categories'}
              </div>
              <button
                onClick={() => pickCategory(null)}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '0.55rem 0.7rem',
                  borderRadius: 9,
                  border: 'none',
                  cursor: 'pointer',
                  background: !selectedCategory ? 'var(--color-brand-tint)' : 'transparent',
                  color: !selectedCategory ? T.text : T.muted,
                  fontWeight: !selectedCategory ? 700 : 500,
                  fontSize: '0.85rem',
                  textAlign: 'left',
                }}
              >
                <span>All categories</span>
                <span style={{ fontSize: '0.7rem', color: T.muted }}>{total || ''}</span>
              </button>

              {categoriesLoading ? (
                <span style={{ padding: '0.5rem', color: T.dim, fontSize: '0.8rem' }}>
                  Loading categories…
                </span>
              ) : categories.length === 0 ? (
                <span style={{ padding: '0.5rem', color: T.dim, fontSize: '0.8rem' }}>
                  No categories yet.
                </span>
              ) : (
                categories.map((category) => {
                  const active = selectedCategory === category.name;
                  return (
                    <button
                      key={category.id}
                      onClick={() => pickCategory(category.name)}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: 8,
                        padding: '0.55rem 0.7rem',
                        borderRadius: 9,
                        border: 'none',
                        cursor: 'pointer',
                        background: active ? 'var(--color-brand-tint)' : 'transparent',
                        color: active ? T.text : T.muted,
                        fontWeight: active ? 700 : 500,
                        fontSize: '0.85rem',
                        textAlign: 'left',
                      }}
                    >
                      <span>{category.name}</span>
                      <span style={{ fontSize: '0.7rem', color: active ? T.text : T.muted }}>
                        {category.company_count}
                      </span>
                    </button>
                  );
                })
              )}
            </aside>

            {/* Results */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '1rem',
                  flexWrap: 'wrap',
                  padding: '0.75rem 1rem',
                  borderRadius: 12,
                  border: `1px solid ${T.border}`,
                  background: T.bgLow,
                  marginBottom: '1.25rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                  {isMobile && (
                    <button
                      type="button"
                      onClick={() => setCategoriesOpen(true)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '0.45rem 0.8rem',
                        borderRadius: 999,
                        border: `1px solid ${T.border}`,
                        background: T.bgCard,
                        color: T.text,
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>category</span>
                      Categories
                    </button>
                  )}
                  <div style={{ fontSize: '0.88rem', fontWeight: 600 }}>
                    {selectedCategory || 'All categories'}
                    {selectedSubcategory ? ` · ${selectedSubcategory}` : ''}
                  </div>
                </div>
                <div style={{ fontSize: '0.8rem', color: T.muted }}>
                  {total} {total === 1 ? 'company' : 'companies'}
                </div>
              </div>

              {/* Subcategory chips for the chosen category */}
              {activeCategory && activeCategory.subcategories.length > 0 && (
                <div
                  style={{
                    display: 'flex',
                    gap: '0.4rem',
                    flexWrap: 'wrap',
                    marginBottom: '1.25rem',
                  }}
                >
                  <button
                    onClick={() => {
                      setSelectedSubcategory(null);
                      setPage(1);
                    }}
                    style={{
                      padding: '4px 11px',
                      borderRadius: 999,
                      border: `1px solid ${!selectedSubcategory ? T.brand : T.border}`,
                      background: !selectedSubcategory ? 'var(--color-brand-tint)' : 'transparent',
                      color: !selectedSubcategory ? T.text : T.muted,
                      fontSize: '0.75rem',
                      fontWeight: !selectedSubcategory ? 700 : 500,
                      cursor: 'pointer',
                    }}
                  >
                    All capabilities
                  </button>
                  {activeCategory.subcategories.map((sub) => {
                    const active = selectedSubcategory === sub.name;
                    return (
                      <button
                        key={sub.id}
                        onClick={() => {
                          setSelectedSubcategory(sub.name);
                          setPage(1);
                        }}
                        style={{
                          padding: '4px 11px',
                          borderRadius: 999,
                          border: `1px solid ${active ? T.brand : T.border}`,
                          background: active ? 'var(--color-brand-tint)' : 'transparent',
                          color: active ? T.text : T.muted,
                          fontSize: '0.75rem',
                          fontWeight: active ? 700 : 500,
                          cursor: 'pointer',
                        }}
                      >
                        {sub.name}
                      </button>
                    );
                  })}
                </div>
              )}

              {notice && (
                <div
                  style={{
                    padding: '0.8rem 1rem',
                    borderRadius: 10,
                    border: `1px solid ${T.border}`,
                    background: 'var(--color-brand-tint)',
                    color: T.text,
                    fontSize: '0.85rem',
                    marginBottom: '1rem',
                  }}
                >
                  {notice}
                </div>
              )}

              {loading ? (
                <div style={{ padding: '3rem', textAlign: 'center', color: T.muted }}>
                  Loading companies…
                </div>
              ) : companies.length === 0 ? (
                <div
                  style={{
                    padding: '3rem 2rem',
                    textAlign: 'center',
                    background: T.bgCard,
                    border: `1px dashed ${T.border}`,
                    borderRadius: 16,
                  }}
                >
                  <p style={{ fontFamily: T.manrope, fontWeight: 700, margin: '0 0 0.4rem' }}>
                    No companies in this category yet
                  </p>
                  <p style={{ color: T.muted, fontSize: '0.86rem', margin: 0 }}>
                    A company appears here once its profile is approved and its visibility plan is
                    verified. Try another category or clear the filters.
                  </p>
                </div>
              ) : (
                <>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(min(290px, 100%), 1fr))',
                      gap: '1.25rem',
                    }}
                  >
                    {companies.map((company) => (
                      <CompanyCardView
                        key={company.profile_id}
                        company={company}
                        onOpen={() => navigate(`/company/${company.profile_id}`)}
                      />
                    ))}
                  </div>

                  {pages > 1 && (
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        gap: '0.75rem',
                        marginTop: '2rem',
                      }}
                    >
                      <button
                        disabled={page <= 1}
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        style={{
                          padding: '0.5rem 1rem',
                          borderRadius: 8,
                          border: `1px solid ${T.border}`,
                          background: 'transparent',
                          color: T.text,
                          cursor: page <= 1 ? 'not-allowed' : 'pointer',
                          opacity: page <= 1 ? 0.5 : 1,
                        }}
                      >
                        Previous
                      </button>
                      <span style={{ color: T.muted, fontSize: '0.85rem' }}>
                        {page} / {pages}
                      </span>
                      <button
                        disabled={page >= pages}
                        onClick={() => setPage((p) => Math.min(pages, p + 1))}
                        style={{
                          padding: '0.5rem 1rem',
                          borderRadius: 8,
                          border: `1px solid ${T.border}`,
                          background: 'transparent',
                          color: T.text,
                          cursor: page >= pages ? 'not-allowed' : 'pointer',
                          opacity: page >= pages ? 0.5 : 1,
                        }}
                      >
                        Next
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Marketplace;
