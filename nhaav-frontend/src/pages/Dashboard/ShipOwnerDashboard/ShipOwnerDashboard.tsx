import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../hooks/useAuth';
import { requestsService } from '../../../services/requests';
import { quotesService } from '../../../services/quotes';
import { providersService } from '../../../services/providers';
import { ClientSidebar } from '../../../components/ClientSidebar';
import { BrandLogo } from '../../../components/BrandLogo';
import { useTheme } from '../../../context/ThemeContext';

const fonts = { manrope: "'Manrope', sans-serif", inter: "'Inter', sans-serif" };
const blur = (): React.CSSProperties => ({ backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' });

// Everything on this page is derived from the real APIs (GET /requests?client_id=,
// GET /quotes/request/{id}, GET /profiles/{id}). There are no default or sample
// values: until the data arrives the page shows honest loading / empty states.
interface QuoteRow {
  id: string;
  request_id: string;
  provider_id: string;
  provider_name?: string;
  amount: number;
  currency: string;
  quotation_reference?: string | null;
  status: string;
  created_at: string;
}

interface RequestRow {
  id: string;
  name: string;
  port: string;
  status: string;
  statusColor: string;
  pulse: boolean;
  quotes: number;
}

export const ShipOwnerDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { tokens: themeTokens } = useTheme();
  const C = { ...themeTokens, primCont: 'rgba(3,105,161,0.1)', secCont: '#0369a1', terCont: 'rgba(3,105,161,0.08)' };

  const [procurement, setProcurement] = useState<RequestRow[]>([]);
  const [openCount, setOpenCount] = useState(0);
  const [quotesList, setQuotesList] = useState<QuoteRow[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedQuotes, setSelectedQuotes] = useState<QuoteRow[]>([]);
  const [showCompare, setShowCompare] = useState(false);
  const [viewingQuote, setViewingQuote] = useState<QuoteRow | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  const { user } = useAuth();

  useEffect(() => {
    const fetchData = async () => {
      if (!user) return;
      try {
        setLoading(true);
        setLoadError(null);
        const reqRes = await requestsService.getUserRequests({ client_id: user.id });
        const reqs = reqRes.data || reqRes || [];

        // Quote counts per request (fetched once here so the table and the
        // pending-quotations KPI show real numbers).
        const openReqs = reqs.filter((r: any) => r.status === 'open').slice(0, 5);
        const quoteCountByRequest = new Map<string, number>();
        const collected: QuoteRow[] = [];
        let pending = 0;
        for (const req of openReqs) {
          try {
            const quotesRes = await quotesService.getQuotesForRequest(req.id);
            const list: any[] = quotesRes || [];
            quoteCountByRequest.set(req.id, list.length);
            for (const q of list) {
              if (q.status === 'submitted') pending += 1;
              let providerName: string | undefined = undefined;
              try {
                const p = await providersService.getProviderById(q.provider_id);
                if (p && (p.company_name || p.name)) providerName = p.company_name || p.name;
              } catch { /* profile not public — omit the name, never invent one */ }
              collected.push({
                id: q.id,
                request_id: req.id,
                provider_id: q.provider_id,
                provider_name: providerName,
                amount: q.amount,
                currency: q.currency,
                quotation_reference: q.quotation_reference ?? null,
                status: q.status,
                created_at: q.created_at,
              });
            }
          } catch { /* a failed request-level fetch must not blank the page */ }
        }

        setProcurement(reqs.map((r: any) => ({
          id: r.id,
          name: r.title || r.service_type || 'Service Request',
          port: r.port || '—',
          status: r.status.charAt(0).toUpperCase() + r.status.slice(1),
          statusColor: r.status === 'open' ? C.cyan : (r.status === 'completed' ? C.green : C.dim),
          pulse: r.status === 'open',
          quotes: quoteCountByRequest.get(r.id) ?? 0,
        })));
        setOpenCount(reqs.filter((r: any) => r.status === 'open').length);
        setQuotesList(collected);
        setPendingCount(pending);
      } catch (err) {
        console.error(err);
        setLoadError('Could not load your dashboard data. Please refresh.');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const toggleCompare = (q: QuoteRow) => {
    setSelectedQuotes(prev => {
      if (prev.find(item => item.id === q.id)) {
        return prev.filter(item => item.id !== q.id);
      } else {
        return [...prev, q];
      }
    });
  };

  const handleRejectQuote = async (e: React.MouseEvent, quoteToReject: QuoteRow) => {
    e.stopPropagation();
    if (quoteToReject.status.toLowerCase() !== 'submitted') return;
    try {
      await quotesService.rejectQuote(quoteToReject.id);
      setActionMsg('Quotation rejected.');
      setQuotesList(prev => prev.filter(q => q.id !== quoteToReject.id));
      setSelectedQuotes(prev => prev.filter(q => q.id !== quoteToReject.id));
      setPendingCount(prev => Math.max(0, prev - 1));
    } catch (err) {
      console.error(err);
      setActionMsg('Could not reject this quotation.');
    }
  };

  const handleAcceptQuote = async (e: React.MouseEvent, quoteToAccept: QuoteRow) => {
    e.stopPropagation();
    if (quoteToAccept.status.toLowerCase() !== 'submitted') return;
    try {
      await quotesService.acceptQuote(quoteToAccept.id);
      navigate('/orders');
    } catch (err) {
      console.error(err);
      setActionMsg('Could not accept this quotation.');
    }
  };

  const fmtDate = (iso: string) => {
    try { return new Date(iso).toLocaleDateString(); } catch { return iso; }
  };

  const displayName = user?.full_name || user?.name || user?.email || 'there';

  return (
    <div style={{ background: C.bg, color: C.text, fontFamily: fonts.inter, minHeight: '100vh', overflow: 'hidden' }}>

      {/* ── TOP NAV ── */}
      <header style={{
        position: 'fixed', top: 0, left: 'var(--sidebar-width, 256px)', right: 0, zIndex: 50, height: 64,
        background: 'var(--bg-glass)', ...blur(),
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        paddingLeft: 'var(--header-padding-left, 4.5rem)', paddingRight: '2.5rem',
        boxShadow: '0 20px 40px rgba(76,157,176,0.08)',
        borderBottom: `1px solid ${C.border}`,
        backgroundImage: 'linear-gradient(to bottom, rgba(13,59,102,0.08), transparent)',
        transition: 'left 0.25s cubic-bezier(0.4, 0, 0.2, 1), padding-left 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
          {/* Header background is a hardcoded light strip, so brand-blue is used. */}
          <BrandLogo height={26} variant="brand" />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          <button onClick={() => navigate('/notifications')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.5rem', color: C.dim }} onMouseEnter={e => (e.currentTarget.style.color = C.text)} onMouseLeave={e => (e.currentTarget.style.color = C.dim)}>
            <span className="material-symbols-outlined">notifications</span>
          </button>
          <button onClick={() => navigate('/settings')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.5rem', color: C.dim }} onMouseEnter={e => (e.currentTarget.style.color = C.text)} onMouseLeave={e => (e.currentTarget.style.color = C.dim)}>
            <span className="material-symbols-outlined">settings</span>
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', paddingLeft: '1rem', borderLeft: C.border }}>
            <div style={{ textAlign: 'right' }}>
              <p style={{ fontSize: '0.75rem', fontWeight: 700, color: C.white, margin: 0 }}>{displayName}</p>
            </div>
            <div onClick={() => navigate('/company-profile')} style={{ width: 36, height: 36, borderRadius: '50%', background: C.primCont, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${C.border}`, cursor: 'pointer' }}>
              <span className="material-symbols-outlined" style={{ color: C.primary, fontSize: '1.2rem' }}>person</span>
            </div>
          </div>
        </div>
      </header>


      {/* ── SIDE NAV ── */}
      <ClientSidebar activePath="/ship-owner" />


      {/* ── MAIN CONTENT ── */}
      <main style={{ paddingLeft: 'var(--sidebar-width, 256px)', paddingTop: 64, height: '100vh', overflowY: 'auto', transition: 'padding-left 0.25s cubic-bezier(0.4, 0, 0.2, 1)' }}>
        <div style={{ maxWidth: 1600, margin: '0 auto', padding: '2.5rem', display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>

          {/* Welcome + Quick Actions */}
          <section style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-start', gap: '2rem' }}>
            <div>
              <h2 style={{ fontFamily: fonts.manrope, fontWeight: 800, fontSize: 'clamp(1.6rem,3vw,2.25rem)', letterSpacing: '-0.03em', color: C.white, margin: '0 0 0.5rem' }}>Welcome back, {displayName}</h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', color: C.dim, fontSize: '0.875rem' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: C.cyan, display: 'inline-block' }} />
                  {loading ? 'Loading your data…' : `${openCount} open request${openCount === 1 ? '' : 's'}`}
                </span>
              </div>
            </div>
            <div className="mobile-grid-collapse" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
              {[
                { icon: 'storefront',    label: 'Marketplace',   path: '/marketplace' },
                { icon: 'upload_file',   label: 'Upload Docs',   path: '/verification' },
                { icon: 'person_search', label: 'Find Provider', path: '/create-request' },
              ].map(({ icon, label, path }) => (
                <button key={label}
                  onClick={() => path && navigate(path)}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '1rem', borderRadius: 12, background: C.bgCardH, border: `1px solid ${C.border}`, cursor: 'pointer', minWidth: 90, transition: 'background 0.2s' }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#e4e6ea')} onMouseLeave={e => (e.currentTarget.style.background = C.bgCardH)}>
                  <span className="material-symbols-outlined" style={{ color: C.cyan, marginBottom: 6, fontSize: '1.3rem' }}>{icon}</span>
                  <span style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.dim }}>{label}</span>
                </button>
              ))}
            </div>
          </section>

          {/* KPI Row — derived from real state, no invented values */}
          <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem' }}>
            {[
              { icon: 'pending_actions', label: 'Open Requests',        value: openCount,    sub: 'Currently active' },
              { icon: 'request_quote',   label: 'Quotations Received',  value: quotesList.length, sub: 'Across open requests' },
              { icon: 'hourglass_top',   label: 'Awaiting Your Review', value: pendingCount, sub: 'Pending quotations' },
            ].map(k => (
              <div key={k.label} style={{ padding: '1.5rem', borderRadius: 16, background: C.bgLow, border: `1px solid ${C.border}`, position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', top: 0, right: 0, padding: '1rem', opacity: 0.1 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '3.5rem' }}>{k.icon}</span>
                </div>
                <p style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: C.dim, margin: '0 0 0.5rem' }}>{k.label}</p>
                <h4 style={{ fontFamily: fonts.manrope, fontWeight: 800, fontSize: '2.25rem', color: C.white, margin: '0 0 1rem', letterSpacing: '-0.02em' }}>{k.value}</h4>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.6rem', color: C.dim }}>
                  <span>{k.sub}</span>
                </div>
              </div>
            ))}
          </section>


          {/* Bento Grid */}
          <div className="mobile-grid-collapse" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '2rem' }}>

            {/* Left: Procurement + Quotations */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>

              {/* Procurement Table */}
              <div style={{ background: C.bgLow, borderRadius: 24, overflow: 'hidden', border: `1px solid ${C.border}` }}>
                <div style={{ padding: '1.5rem 1.5rem', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ fontFamily: fonts.manrope, fontWeight: 700, fontSize: '1rem', color: C.white, margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Procurement Overview</h3>
                  <button onClick={() => navigate('/compare-quotations')} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, color: C.cyan, fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                    Review Quotations <span className="material-symbols-outlined" style={{ fontSize: '0.9rem' }}>arrow_forward</span>
                  </button>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
                    <thead>
                      <tr style={{ background: C.bgLowest, fontSize: '0.6rem', color: C.dim, textTransform: 'uppercase', letterSpacing: '0.15em', fontWeight: 700 }}>
                        {['Request', 'Port', 'Status', 'Quotes', 'Actions'].map((h, i) => (
                          <th key={h} style={{ padding: '1rem 1.5rem', textAlign: i === 4 ? 'right' : 'left' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {loading ? (
                        <tr><td colSpan={5} style={{ padding: '2rem', textAlign: 'center', color: C.dim }}>Loading your requests...</td></tr>
                      ) : loadError ? (
                        <tr><td colSpan={5} style={{ padding: '2rem', textAlign: 'center', color: C.error }}>{loadError}</td></tr>
                      ) : procurement.length === 0 ? (
                        <tr>
                          <td colSpan={5} style={{ padding: '2rem', textAlign: 'center', color: C.dim }}>
                            No requests yet. Click the + button to create one.
                          </td>
                        </tr>
                      ) : procurement.map(row => (
                        <tr key={row.id} style={{ borderTop: `1px solid ${C.border}`, transition: 'background 0.2s', cursor: 'pointer' }}
                          onClick={() => navigate(`/request/${row.id}`)}
                          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(13,59,102,0.06)')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                          <td style={{ padding: '1rem 1.5rem', fontWeight: 500, color: C.white }}>{row.name}</td>
                          <td style={{ padding: '1rem 1.5rem', color: C.dim }}>{row.port}</td>
                          <td style={{ padding: '1rem 1.5rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <div style={{ width: 6, height: 6, borderRadius: '50%', background: row.statusColor }} />
                              <span style={{ color: row.statusColor, fontSize: '0.75rem' }}>{row.status}</span>
                            </div>
                          </td>
                          <td style={{ padding: '1rem 1.5rem', color: row.quotes ? C.white : C.slate, fontWeight: row.quotes ? 700 : 400 }}>{row.quotes || '0'}</td>
                          <td style={{ padding: '1rem 1.5rem', textAlign: 'right' }}>
                            <button onClick={e => { e.stopPropagation(); navigate(`/request/${row.id}`); }} title="View request"
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.dim, padding: 4, transition: 'color 0.2s' }} onMouseEnter={e => (e.currentTarget.style.color = C.cyan)} onMouseLeave={e => (e.currentTarget.style.color = C.dim)}>
                              <span className="material-symbols-outlined" style={{ fontSize: '1.1rem' }}>visibility</span>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>


              {/* Recent Quotations — real quotes only, no sample providers */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                  <h3 style={{ fontFamily: fonts.manrope, fontWeight: 700, fontSize: '1rem', color: C.white, margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Recent Quotations</h3>
                  {selectedQuotes.length >= 2 ? (
                    <button onClick={() => setShowCompare(true)} style={{ padding: '0.5rem 1rem', borderRadius: 999, background: C.cyan, color: 'var(--color-on-brand)', fontSize: '0.75rem', fontWeight: 700, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>compare_arrows</span> Compare {selectedQuotes.length} Quotes
                    </button>
                  ) : (
                    <span style={{ fontSize: '0.75rem', color: C.dim }}>Select 2+ to Compare</span>
                  )}
                </div>
                <div className="mobile-grid-collapse" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.5rem' }}>
                  {quotesList.length === 0 ? (
                    <div style={{ color: C.dim, padding: '2rem', gridColumn: '1 / -1' }}>
                      {loading ? 'Loading quotations...' : 'No quotations have been submitted yet.'}
                    </div>
                  ) : quotesList.map(q => {
                    const selected = selectedQuotes.some(s => s.id === q.id);
                    const isPending = q.status.toLowerCase() === 'submitted';
                    return (
                      <div key={q.id} onClick={() => setViewingQuote(q)} style={{ padding: '1.5rem', borderRadius: 24, background: selected ? 'rgba(76,157,176,0.05)' : C.bgLow, border: `1px solid ${selected ? C.cyan : C.border}`, display: 'flex', flexDirection: 'column', transition: 'all 0.2s', boxShadow: selected ? '0 0 20px rgba(76,157,176,0.2)' : '0 20px 40px rgba(76,157,176,0.08)', cursor: 'pointer' }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(76,157,176,0.3)'; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = selected ? C.cyan : C.border; }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                          <span style={{ padding: '2px 8px', borderRadius: 6, background: C.bgLowest, color: C.muted, fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase' }}>{q.status}</span>
                          <input type="checkbox" checked={selected} onClick={e => e.stopPropagation()} onChange={() => toggleCompare(q)}
                            style={{ width: 16, height: 16, accentColor: C.cyan, cursor: 'pointer' }} title="Select to compare" />
                        </div>
                        <h4 style={{ fontFamily: fonts.manrope, fontWeight: 700, fontSize: '1rem', color: C.white, margin: '0 0 4px' }}>
                          {q.provider_name || 'Provider'}
                        </h4>
                        <p style={{ fontSize: '0.75rem', color: C.slate, marginBottom: '1.5rem', fontFamily: 'monospace' }}>
                          {q.quotation_reference ? `Ref: ${q.quotation_reference}` : `Quote ID: ${q.id.slice(0, 8)}…`}
                        </p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.5rem', flex: 1 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.slate }}>Amount</span>
                            <span style={{ fontFamily: fonts.manrope, fontWeight: 900, fontSize: '1.1rem', color: C.white }}>{q.amount} {q.currency}</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.slate }}>Received</span>
                            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: C.cyan }}>{fmtDate(q.created_at)}</span>
                          </div>
                        </div>
                        {isPending ? (
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                            <button onClick={(e) => handleRejectQuote(e, q)} style={{ padding: '0.6rem', borderRadius: 8, background: 'rgba(220,38,38,0.1)', color: '#ef4444', fontSize: '0.65rem', fontWeight: 700, border: `1px solid rgba(220,38,38,0.2)`, cursor: 'pointer', transition: 'all 0.2s' }}
                              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(220,38,38,0.2)'; }} onMouseLeave={e => { e.currentTarget.style.background = 'rgba(220,38,38,0.1)'; }}>Reject</button>
                            <button onClick={(e) => handleAcceptQuote(e, q)} style={{ padding: '0.6rem', borderRadius: 8, background: C.cyan, color: 'var(--color-on-brand)', fontSize: '0.65rem', fontWeight: 700, border: 'none', cursor: 'pointer' }}
                              onMouseEnter={e => (e.currentTarget.style.filter = 'brightness(1.1)')} onMouseLeave={e => (e.currentTarget.style.filter = 'none')}>Accept</button>
                          </div>
                        ) : (
                          <span style={{ fontSize: '0.7rem', color: C.dim }}>Reviewed — no further action possible</span>
                        )}
                      </div>
                    );
                  })}
                </div>
                {actionMsg && <div style={{ marginTop: '1rem', fontSize: '0.8rem', color: C.primary, fontWeight: 700 }}>{actionMsg}</div>}
              </div>
            </div>


            {/* Right column — platform guidance, no invented metrics */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>

              {/* How awarding works */}
              <div style={{ background: C.bgLow, borderRadius: 24, padding: '1.5rem', border: `1px solid ${C.border}` }}>
                <h3 style={{ fontFamily: fonts.manrope, fontWeight: 700, fontSize: '0.9rem', color: C.white, margin: '0 0 1rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>How Awarding Works</h3>
                <p style={{ fontSize: '0.85rem', color: C.muted, margin: 0, lineHeight: 1.6 }}>
                  Nhaav does not rank or score quotations. Compare the amounts and terms yourself,
                  then accept the single quotation that fits your needs — accepting one marks it as
                  the awarded quote for that request.
                </p>
              </div>

              {/* Next steps */}
              <div style={{ background: C.bgLow, borderRadius: 24, padding: '1.5rem', border: `1px solid ${C.border}` }}>
                <h3 style={{ fontFamily: fonts.manrope, fontWeight: 700, fontSize: '0.9rem', color: C.white, margin: '0 0 1rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Next Steps</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {[
                    { icon: 'post_add', label: 'Create a procurement request', path: '/create-request' },
                    { icon: 'verified_user', label: 'Complete document verification', path: '/verification' },
                    { icon: 'compare_arrows', label: 'Review submitted quotations', path: '/compare-quotations' },
                    { icon: 'inventory', label: 'Track awarded jobs in Orders', path: '/orders' },
                  ].map(item => (
                    <button key={item.label} onClick={() => navigate(item.path)}
                      style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.85rem 1rem', borderRadius: 12, background: C.bgLowest, border: `1px solid ${C.border}`, cursor: 'pointer', textAlign: 'left', transition: 'border-color 0.2s' }}
                      onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(76,157,176,0.3)')} onMouseLeave={e => (e.currentTarget.style.borderColor = C.border)}>
                      <span className="material-symbols-outlined" style={{ color: C.cyan, fontSize: '1.1rem' }}>{item.icon}</span>
                      <span style={{ fontSize: '0.85rem', color: C.white, fontWeight: 500 }}>{item.label}</span>
                    </button>
                  ))}
                </div>
              </div>

            </div>
          </div>
        </div>
      </main>

      {/* FAB */}
      <button
        onClick={() => navigate('/create-request')}
        style={{
        position: 'fixed', bottom: '2.5rem', right: '2.5rem', width: 64, height: 64,
        borderRadius: '50%', background: 'linear-gradient(to top right, #2563eb, #4C9DB0)',
        color: '#001d35', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 20px 40px rgba(76,157,176,0.3)', zIndex: 50, transition: 'transform 0.2s',
      }}
        onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.1)')}
        onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}>
        <span className="material-symbols-outlined" style={{ fontSize: '1.75rem', fontWeight: 900 }}>add</span>
      </button>

      {/* Compare Modal — side-by-side of the real selected quotes */}
      {showCompare && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(5,11,20,0.8)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 24, padding: '2rem', width: '90%', maxWidth: 1000, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
              <h2 style={{ fontFamily: fonts.manrope, fontWeight: 800, fontSize: '1.5rem', color: C.white, margin: 0 }}>Quotation Comparison</h2>
              <button onClick={() => setShowCompare(false)} style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', display: 'flex' }}><span className="material-symbols-outlined">close</span></button>
            </div>

            <div className="mobile-grid-collapse" style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(selectedQuotes.length, 3)}, 1fr)`, gap: '1.5rem' }}>
              {selectedQuotes.map(q => (
                <div key={q.id} style={{ background: C.bgLow, padding: '1.5rem', borderRadius: 16, border: `1px solid ${C.border}` }}>
                  <div style={{ marginBottom: '1rem' }}>
                    <h4 style={{ margin: 0, color: C.white, fontWeight: 700 }}>{q.provider_name || 'Provider'}</h4>
                    <p style={{ margin: 0, fontSize: '0.65rem', color: C.dim }}>
                      {q.quotation_reference ? `Ref: ${q.quotation_reference}` : `Quote ID: ${q.id.slice(0, 8)}…`}
                    </p>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div>
                      <p style={{ margin: '0 0 4px', fontSize: '0.65rem', color: C.slate, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Amount</p>
                      <p style={{ margin: 0, fontFamily: fonts.manrope, fontSize: '1.25rem', fontWeight: 800, color: C.cyan }}>{q.amount} {q.currency}</p>
                    </div>
                    <div>
                      <p style={{ margin: '0 0 4px', fontSize: '0.65rem', color: C.slate, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Received</p>
                      <p style={{ margin: 0, fontSize: '0.875rem', color: C.white, fontWeight: 500 }}>{fmtDate(q.created_at)}</p>
                    </div>
                    <div>
                      <p style={{ margin: '0 0 4px', fontSize: '0.65rem', color: C.slate, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Status</p>
                      <p style={{ margin: 0, fontSize: '0.875rem', color: C.white, fontWeight: 500 }}>{q.status}</p>
                    </div>
                  </div>

                  {q.status.toLowerCase() === 'submitted' && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginTop: '2rem' }}>
                      <button onClick={e => handleRejectQuote(e, q)} style={{ padding: '0.6rem', borderRadius: 8, background: 'rgba(220,38,38,0.1)', color: '#ef4444', fontWeight: 700, fontSize: '0.75rem', border: `1px solid rgba(220,38,38,0.2)`, cursor: 'pointer' }}>Reject</button>
                      <button onClick={e => handleAcceptQuote(e, q)} style={{ padding: '0.6rem', borderRadius: 8, background: C.cyan, color: 'var(--color-on-brand)', fontWeight: 700, fontSize: '0.75rem', border: 'none', cursor: 'pointer' }}>Accept</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* View Full Quote Modal — only real fields from QuoteResponse */}
      {viewingQuote && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(5,11,20,0.8)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 24, padding: '2.5rem', width: '90%', maxWidth: 800, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 40px 80px rgba(0,0,0,0.5)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2.5rem' }}>
              <div>
                <p style={{ fontFamily: fonts.inter, fontSize: '0.75rem', fontWeight: 700, color: C.cyan, textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 4px' }}>Quotation</p>
                <h2 style={{ fontFamily: fonts.manrope, fontWeight: 800, fontSize: '1.5rem', color: C.white, margin: 0 }}>{viewingQuote.provider_name || 'Provider'}</h2>
              </div>
              <button onClick={() => setViewingQuote(null)} style={{ background: 'rgba(13,59,102,0.08)', border: 'none', color: C.muted, width: 36, height: 36, borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.2s' }} onMouseEnter={e => (e.currentTarget.style.background = 'rgba(13,59,102,0.12)')} onMouseLeave={e => (e.currentTarget.style.background = 'rgba(13,59,102,0.08)')}>
                <span className="material-symbols-outlined" style={{ fontSize: '1.25rem' }}>close</span>
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', background: C.bgLow, padding: '1.5rem', borderRadius: 16, border: `1px solid ${C.border}` }}>
              <div>
                <p style={{ margin: '0 0 4px', fontSize: '0.65rem', color: C.slate, textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700 }}>Amount</p>
                <p style={{ margin: 0, fontFamily: fonts.manrope, fontSize: '2rem', fontWeight: 800, color: C.cyan }}>{viewingQuote.amount} {viewingQuote.currency}</p>
              </div>
              <div>
                <p style={{ margin: '0 0 8px', fontSize: '0.65rem', color: C.slate, textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700 }}>Details</p>
                <div style={{ display: 'grid', gap: '0.5rem', fontSize: '0.75rem' }}>
                  <div style={{ color: C.muted }}>Status: <span style={{ color: C.white, fontWeight: 500 }}>{viewingQuote.status}</span></div>
                  <div style={{ color: C.muted }}>Reference: <span style={{ color: C.white, fontWeight: 500 }}>{viewingQuote.quotation_reference || '—'}</span></div>
                  <div style={{ color: C.muted }}>Received: <span style={{ color: C.white, fontWeight: 500 }}>{fmtDate(viewingQuote.created_at)}</span></div>
                </div>
              </div>
            </div>

            <div style={{ marginTop: '2.5rem', display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
              <button onClick={() => setViewingQuote(null)} style={{ padding: '0.75rem 2rem', borderRadius: 8, background: 'transparent', color: C.white, fontWeight: 700, fontSize: '0.875rem', border: `1px solid ${C.border}`, cursor: 'pointer', transition: 'background 0.2s' }} onMouseEnter={e => (e.currentTarget.style.background = 'rgba(13,59,102,0.08)')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>Close</button>
              {viewingQuote.status.toLowerCase() === 'submitted' && (
                <button onClick={e => handleAcceptQuote(e, viewingQuote)} style={{ padding: '0.75rem 2.5rem', borderRadius: 8, background: C.cyan, color: 'var(--color-on-brand)', fontWeight: 700, fontSize: '0.875rem', border: 'none', cursor: 'pointer', boxShadow: '0 10px 20px rgba(76,157,176,0.2)' }}>Accept Quotation</button>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default ShipOwnerDashboard;
