import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../hooks/useAuth';
import { requestsService } from '../../../services/requests';
import { quotesService } from '../../../services/quotes';
import { jobsService } from '../../../services/jobs';
import { showComingSoon } from '../../../utils/comingSoon';

/* ── Design tokens (matches project palette) ── */
const C = {
  bg:        '#0d141d',
  bgDeep:    '#050B14',
  bgNav:     '#050B14',
  bgCard:    '#19202a',
  bgCardH:   '#242a34',
  bgLow:     '#151c26',
  bgLowest:  '#080f18',
  border:    'rgba(255,255,255,0.05)',
  borderMid: 'rgba(68,71,77,0.2)',
  text:      '#dce3f0',
  muted:     '#c4c6ce',
  dim:       '#8e9098',
  slate:     '#64748b',
  cyan:      '#4cd6ff',
  primary:   '#9ccaff',
  secondary: '#a6c9fa',
  error:     '#ffb4ab',
  green:     '#22c55e',
  white:     '#ffffff',
};
const fonts = { manrope: "'Manrope', sans-serif", inter: "'Inter', sans-serif" };
const blur = (): React.CSSProperties => ({ backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' });

const PROF_IMG =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuANjcweUUcCcqhWqTIXiNxkX_AYL6LVQahQp6wSPQWHrteB-KQjb9UPTGV3DXpDpFwzISGvygPubRHiZpTxO6NUutQAiO60yy8zQiOfZdwlfuI8CEFiHmD-0peeoawmlTJt9jhD3wLgVO7WRnifAoObqEifbioJFIDAf1NBt7hvwT41C0h2B_xAynAo4vyiFm8mw6JMgteH8Px9X1PBJsOybv9aqZU20IgoVGu2mOfbXcqsii-rcLAJIA';


const KPI_CARDS = [
  { icon: 'pending_actions', label: 'Active Requests',    value: '08', sub: '+2 since last week',    subColor: C.cyan,  subIcon: 'trending_up' },
  { icon: 'request_quote',   label: 'Pending Quotations', value: '14', sub: '3 Require attention',   subColor: C.error, subIcon: 'priority_high' },
  { icon: 'package_2',       label: 'Orders in Progress', value: '05', sub: 'Avg ETA: 4.2 Days',     subColor: C.cyan,  subIcon: 'schedule' },
  { icon: 'verified',        label: 'Verified Providers', value: '1,240', sub: 'Worldwide Network',  subColor: C.cyan,  subIcon: 'public' },
];


const QUOTATIONS: any[] = [
  { icon: 'factory',           iconColor: C.cyan,      name: 'OceanTech Marine',    loc: 'Rotterdam • Specialized Parts', rating: '4.8', jobs: '2.1k', price: '$12,450', eta: '24 Oct (3 Days)' },
  { icon: 'hub',               iconColor: C.secondary, name: 'Global Marine Supply', loc: 'Singapore • Full Service',      rating: '5.0', jobs: '840',  price: '$14,100', eta: '22 Oct (1 Day)' },
  { icon: 'component_exchange',iconColor: C.dim,       name: 'DeepSea Parts',        loc: 'Panama • Logistics Hub',        rating: '4.6', jobs: '12k',  price: '$11,800', eta: '28 Oct (7 Days)' },
];

const SPEND_CATS = [
  { label: 'Main Engine Parts',       value: '$142.5k', pct: '65%', color: C.cyan },
  { label: 'Auxiliary Machinery',     value: '$88.2k',  pct: '45%', color: C.secondary },
  { label: 'Deck & Safety Equipment', value: '$34.9k',  pct: '25%', color: C.dim },
];

const TOP_PROVIDERS = [
  { initial: 'S', bg: '#00203a', initColor: C.primary,   name: 'SinMar Tech',    spec: 'Instrumentation & Controls', rating: '4.9' },
  { initial: 'P', bg: '#244872', initColor: C.secondary, name: 'Pacific Marine', spec: 'General Ship Supply',        rating: '4.7' },
];

const TIMELINE = [
  { text: <>OceanTech submitted quote for <span style={{ color: C.cyan, fontWeight: 700 }}>Request #4505</span></>,     time: '12:45 PM Today', active: true },
  { text: <>Request <span style={{ color: C.cyan, fontWeight: 700 }}>#241</span> approved by Charter Manager</>,          time: 'Yesterday',      active: false },
  { text: <>Payment processed for <span style={{ color: C.muted }}>Invoice #INV-892</span></>,                             time: '2 Days Ago',     active: false, dim: true },
];


/* ── Sub-components ── */
const SideNavItem: React.FC<{ icon: string; label: string; active?: boolean; onClick?: () => void }> = ({ icon, label, active, onClick }) => {
  const [hov, setHov] = useState(false);
  return (
    <a href="#" onClick={e => { e.preventDefault(); onClick?.(); }}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: '0.75rem',
        padding: '0.75rem 1.5rem',
        color: active ? C.cyan : hov ? '#e2e8f0' : C.slate,
        background: active ? 'linear-gradient(to right, rgba(76,214,255,0.1), transparent)' : hov ? C.bgLow : 'transparent',
        textDecoration: 'none', transition: 'all 0.2s',
        transform: hov && !active ? 'translateX(4px)' : 'none',
      }}>
      <span className={`material-symbols-outlined${active ? ' fill' : ''}`} style={{ fontSize: '1.2rem' }}>{icon}</span>
      <span style={{ fontFamily: fonts.inter, fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}>{label}</span>
    </a>
  );
};


export const ShipOwnerDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { logout } = useAuth();
  
  const [procurement, setProcurement] = useState<any[]>([]);
  const [quotationsList, setQuotationsList] = useState<any[]>(QUOTATIONS);
  const [selectedQuotes, setSelectedQuotes] = useState<any[]>([]);
  const [showCompare, setShowCompare] = useState(false);
  const [viewingQuote, setViewingQuote] = useState<any>(null);

  const { user } = useAuth();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      if (!user) return;
      try {
        setLoading(true);
        const reqRes = await requestsService.getUserRequests({ client_id: user.id });
        const reqs = reqRes.data || reqRes || [];
        
        const mapped = reqs.map((r: any) => ({
          id: r.id,
          name: r.title || r.service_type || 'Service Request',
          impa: r.id.substring(0, 6).toUpperCase(),
          cat: r.port || 'Global',
          catColor: C.secondary,
          status: r.status.charAt(0).toUpperCase() + r.status.slice(1),
          statusColor: r.status === 'open' ? C.cyan : (r.status === 'completed' ? C.green : C.dim),
          pulse: r.status === 'open',
          quotes: 0,
        }));
        setProcurement(mapped);
        
        // Fetch quotes for the top open requests
        const openReqs = reqs.filter((r:any) => r.status === 'open').slice(0, 5);
        let allQuotes: any[] = [];
        for (const req of openReqs) {
           const quotesRes = await quotesService.getQuotesForRequest(req.id);
           const quotes = (quotesRes || []).map((q: any) => ({
             ...q,
             icon: 'factory',
             iconColor: C.cyan,
             name: q.provider?.company_name || 'Verified Provider',
             loc: q.provider?.location || 'Global',
             rating: '4.8',
             jobs: 'Verified',
             price: `$${q.price}`,
             eta: q.eta
           }));
           allQuotes = [...allQuotes, ...quotes];
        }
        setQuotationsList(allQuotes.length > 0 ? allQuotes : []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [user]);

  const toggleCompare = (q: any) => {
    setSelectedQuotes(prev => {
      if (prev.find(item => item.name === q.name)) {
        return prev.filter(item => item.name !== q.name);
      } else {
        return [...prev, q];
      }
    });
  };

  const handleRejectLocalQuote = async (e: React.MouseEvent, quoteToReject: any) => {
    e.stopPropagation();
    if (!quoteToReject.id) return;
    try {
      await quotesService.rejectQuote(quoteToReject.id);
      setQuotationsList(prev => prev.filter(q => q.id !== quoteToReject.id));
      setSelectedQuotes(prev => prev.filter(q => q.id !== quoteToReject.id));
    } catch(err) {
      console.error(err);
      alert("Failed to reject quote");
    }
  };

  const handleAcceptLocalQuote = async (e: React.MouseEvent, quoteToAccept: any) => {
    e.stopPropagation();
    if (!quoteToAccept.id) return;
    try {
      await quotesService.acceptQuote(quoteToAccept.id);
      navigate('/orders');
    } catch(err) {
      console.error(err);
      alert("Failed to accept quote");
    }
  };

  return (
    <div style={{ background: C.bg, color: C.text, fontFamily: fonts.inter, minHeight: '100vh', overflow: 'hidden' }}>

      {/* ── TOP NAV ── */}
      <header style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50, height: 64,
        background: 'rgba(13,20,29,0.8)', ...blur(),
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '0 2.5rem',
        boxShadow: '0 20px 40px rgba(0,209,255,0.08)',
        borderBottom: `1px solid ${C.border}`,
        backgroundImage: 'linear-gradient(to bottom, rgba(255,255,255,0.05), transparent)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
          <h1 style={{ fontFamily: fonts.manrope, fontWeight: 900, fontSize: '1.1rem', letterSpacing: '0.2em', color: C.white, margin: 0 }}>HORIZON MARITIME</h1>
          <nav style={{ display: 'flex', gap: '1.5rem' }}>
            {[
              { l: 'Fleet Overview',    p: '/ship-owner', active: true },
              { l: 'My Orders',         p: '/orders', active: false },
              { l: 'Terminal Ops',      p: '#', active: false, onClick: showComingSoon },
            ].map(({ l, p, active, onClick }) => (
              <a key={l} href="#" onClick={onClick || (e => { e.preventDefault(); navigate(p); })}
                style={{
                  fontFamily: fonts.inter, fontSize: '0.9rem', fontWeight: active ? 700 : 500,
                  color: active ? C.cyan : C.slate, textDecoration: 'none',
                  borderBottom: active ? `2px solid ${C.cyan}` : '2px solid transparent',
                  paddingBottom: 4, transition: 'color 0.2s',
                }}>{l}</a>
            ))}
          </nav>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', background: C.bgLow, padding: '6px 16px', borderRadius: 999, border: `1px solid ${C.borderMid}` }}>
            <span className="material-symbols-outlined" style={{ fontSize: '0.9rem', color: C.cyan }}>anchor</span>
            <span style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.15em', color: C.dim }}>SINGAPORE (SGSIN)</span>
          </div>
          <button onClick={() => navigate('/notifications')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.5rem', color: C.dim }} onMouseEnter={e => (e.currentTarget.style.color = C.text)} onMouseLeave={e => (e.currentTarget.style.color = C.dim)}>
            <span className="material-symbols-outlined">notifications</span>
          </button>
          <button onClick={() => navigate('/settings')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.5rem', color: C.dim }} onMouseEnter={e => (e.currentTarget.style.color = C.text)} onMouseLeave={e => (e.currentTarget.style.color = C.dim)}>
            <span className="material-symbols-outlined">settings</span>
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', paddingLeft: '1rem', borderLeft: C.border }}>
            <div style={{ textAlign: 'right' }}>
              <p style={{ fontSize: '0.75rem', fontWeight: 700, color: C.white, margin: 0 }}>Captain John</p>
              <p style={{ fontSize: '0.6rem', color: C.slate, textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>Maersk Line</p>
            </div>
            <img src={PROF_IMG} alt="Profile" onClick={() => navigate('/company-profile')}
              style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', border: `1px solid rgba(156,202,255,0.2)`, cursor: 'pointer' }} />
          </div>
        </div>
      </header>


      {/* ── SIDE NAV ── */}
      <nav style={{
        position: 'fixed', top: 64, left: 0, bottom: 0, width: 288, zIndex: 40,
        background: C.bgNav, borderRight: `1px solid ${C.border}`,
        display: 'flex', flexDirection: 'column', paddingTop: '2rem',
      }}>
        <div style={{ padding: '0 1.5rem', marginBottom: '2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: C.cyan, boxShadow: '0 0 8px rgba(76,214,255,0.6)', animation: 'pulse 2s infinite' }} />
            <span style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.2em', color: C.dim, textTransform: 'uppercase' }}>Fleet Command</span>
          </div>
          <h3 style={{ fontFamily: fonts.manrope, fontWeight: 500, fontSize: '1.1rem', color: C.white, margin: 0 }}>North Atlantic Div.</h3>
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <SideNavItem icon="dashboard"      label="Dashboard"        active onClick={() => navigate('/ship-owner')} />
          <SideNavItem icon="storefront"     label="Marketplace"             onClick={() => navigate('/marketplace')} />
          <SideNavItem icon="add_box"        label="Create Request"          onClick={() => navigate('/create-request')} />
          <SideNavItem icon="list_alt"       label="My Requests"             onClick={() => navigate('/compare-quotations')} />
          <SideNavItem icon="pending_actions"label="Active Orders"           onClick={() => navigate('/orders')} />
          <SideNavItem icon="task"           label="Completed Orders"        onClick={() => navigate('/orders')} />
        </div>

        <div style={{ padding: '1rem 1.5rem' }}>
          <button onClick={showComingSoon} style={{
            width: '100%', padding: '0.75rem',
            background: 'linear-gradient(to right, #9ccaff, #a6c9fa)',
            color: '#001d35', fontFamily: fonts.inter, fontWeight: 700,
            fontSize: '0.65rem', letterSpacing: '0.15em', textTransform: 'uppercase',
            border: 'none', borderRadius: 12, cursor: 'pointer',
            boxShadow: '0 20px 40px rgba(0,209,255,0.08)',
          }}>New Charter</button>
        </div>

        <div style={{ paddingBottom: '5rem' }}>
          {[{ icon: 'support_agent', label: 'Support' }, { icon: 'gavel', label: 'Compliance' }].map(({ icon, label }) => (
            <a key={label} href="#" onClick={showComingSoon}
              style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 1.5rem', color: C.slate, textDecoration: 'none', fontSize: '0.65rem', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.12em', transition: 'color 0.2s' }}
              onMouseEnter={e => (e.currentTarget.style.color = C.text)} onMouseLeave={e => (e.currentTarget.style.color = C.slate)}>
              <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>{icon}</span>{label}
            </a>
          ))}
        </div>
      </nav>


      {/* ── MAIN CONTENT ── */}
      <main style={{ paddingLeft: 288, paddingTop: 64, height: '100vh', overflowY: 'auto' }}>
        <div style={{ maxWidth: 1600, margin: '0 auto', padding: '2.5rem', display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>

          {/* Welcome + Quick Actions */}
          <section style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-start', gap: '2rem' }}>
            <div>
              <h2 style={{ fontFamily: fonts.manrope, fontWeight: 800, fontSize: 'clamp(1.6rem,3vw,2.25rem)', letterSpacing: '-0.03em', color: C.white, margin: '0 0 0.5rem' }}>Welcome back, Captain John</h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', color: C.dim, fontSize: '0.875rem' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: C.cyan, display: 'inline-block' }} />Maersk Line Fleet
                </span>
                <span style={{ width: 4, height: 4, borderRadius: '50%', background: C.borderMid, display: 'inline-block' }} />
                <span>Data updated 2m ago</span>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
              {[
                { icon: 'storefront',    label: 'Marketplace',   path: '/marketplace' },
                { icon: 'upload_file',   label: 'Upload Docs',   path: '/upload' },
                { icon: 'person_search', label: 'Find Provider', path: '/create-request' },
              ].map(({ icon, label, path }) => (
                <button key={label}
                  onClick={() => path && navigate(path)}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '1rem', borderRadius: 12, background: C.bgCardH, border: `1px solid ${C.border}`, cursor: 'pointer', minWidth: 90, transition: 'background 0.2s' }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#333a44')} onMouseLeave={e => (e.currentTarget.style.background = C.bgCardH)}>
                  <span className="material-symbols-outlined" style={{ color: C.cyan, marginBottom: 6, fontSize: '1.3rem' }}>{icon}</span>
                  <span style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.dim }}>{label}</span>
                </button>
              ))}
            </div>
          </section>

          {/* KPI Row */}
          <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem' }}>
            {KPI_CARDS.map(k => (
              <div key={k.label} style={{ padding: '1.5rem', borderRadius: 16, background: C.bgLow, border: `1px solid ${C.border}`, position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', top: 0, right: 0, padding: '1rem', opacity: 0.1 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '3.5rem' }}>{k.icon}</span>
                </div>
                <p style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: C.dim, margin: '0 0 0.5rem' }}>{k.label}</p>
                <h4 style={{ fontFamily: fonts.manrope, fontWeight: 800, fontSize: '2.25rem', color: C.white, margin: '0 0 1rem', letterSpacing: '-0.02em' }}>{k.value}</h4>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.6rem', color: k.subColor }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '0.9rem' }}>{k.subIcon}</span>
                  <span>{k.sub}</span>
                </div>
              </div>
            ))}
          </section>


          {/* Bento Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '2rem' }}>

            {/* Left: Procurement + Quotations */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>

              {/* Procurement Table */}
              <div style={{ background: C.bgLow, borderRadius: 24, overflow: 'hidden', border: `1px solid ${C.border}` }}>
                <div style={{ padding: '1.5rem 1.5rem', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ fontFamily: fonts.manrope, fontWeight: 700, fontSize: '1rem', color: C.white, margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Procurement Overview</h3>
                  <button onClick={showComingSoon} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, color: C.cyan, fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                    View Full Manifest <span className="material-symbols-outlined" style={{ fontSize: '0.9rem' }}>arrow_forward</span>
                  </button>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
                    <thead>
                      <tr style={{ background: C.bgLowest, fontSize: '0.6rem', color: C.dim, textTransform: 'uppercase', letterSpacing: '0.15em', fontWeight: 700 }}>
                        {['Request','IMPA Code','Category','Status','Quotes','Actions'].map((h, i) => (
                          <th key={h} style={{ padding: '1rem 1.5rem', textAlign: i === 5 ? 'right' : 'left' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {procurement.length === 0 ? (
                        <tr>
                          <td colSpan={6} style={{ padding: '2rem', textAlign: 'center', color: C.dim }}>
                            No active requests found. Click the + button to create one.
                          </td>
                        </tr>
                      ) : procurement.map((row, i) => (
                        <tr key={i} style={{ borderTop: `1px solid ${C.border}`, transition: 'background 0.2s', cursor: 'pointer' }}
                          onClick={() => navigate(`/request/${row.id}`)}
                          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                          <td style={{ padding: '1rem 1.5rem', fontWeight: 500, color: C.white }}>{row.name}</td>
                          <td style={{ padding: '1rem 1.5rem', color: C.dim, fontFamily: 'monospace', fontSize: '0.75rem' }}>{row.impa}</td>
                          <td style={{ padding: '1rem 1.5rem' }}>
                            <span style={{ padding: '3px 8px', borderRadius: 6, background: 'rgba(36,72,114,0.3)', color: row.catColor, fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase' }}>{row.cat}</span>
                          </td>
                          <td style={{ padding: '1rem 1.5rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <div style={{ width: 6, height: 6, borderRadius: '50%', background: row.statusColor }} />
                              <span style={{ color: row.statusColor, fontSize: '0.75rem' }}>{row.status}</span>
                            </div>
                          </td>
                          <td style={{ padding: '1rem 1.5rem', color: row.quotes ? C.white : C.slate, fontWeight: row.quotes ? 700 : 400 }}>{row.quotes || '0'}</td>
                          <td style={{ padding: '1rem 1.5rem', textAlign: 'right' }}>
                            <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.dim, padding: 4, transition: 'color 0.2s' }} onMouseEnter={e => (e.currentTarget.style.color = C.cyan)} onMouseLeave={e => (e.currentTarget.style.color = C.dim)}>
                              <span className="material-symbols-outlined" style={{ fontSize: '1.1rem' }}>visibility</span>
                            </button>
                            {row.status !== 'Completed' && (
                              <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.dim, padding: 4, transition: 'color 0.2s' }} onMouseEnter={e => (e.currentTarget.style.color = C.cyan)} onMouseLeave={e => (e.currentTarget.style.color = C.dim)}>
                                <span className="material-symbols-outlined" style={{ fontSize: '1.1rem' }}>edit</span>
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>


              {/* Recent Quotations */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                  <h3 style={{ fontFamily: fonts.manrope, fontWeight: 700, fontSize: '1rem', color: C.white, margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Recent Quotations</h3>
                  {selectedQuotes.length >= 2 ? (
                    <button onClick={() => setShowCompare(true)} style={{ padding: '0.5rem 1rem', borderRadius: 999, background: C.cyan, color: '#001f28', fontSize: '0.75rem', fontWeight: 700, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>compare_arrows</span> Compare {selectedQuotes.length} Quotes
                    </button>
                  ) : (
                    <span style={{ fontSize: '0.75rem', color: C.dim }}>Select 2+ to Compare</span>
                  )}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.5rem' }}>
                  {quotationsList.length === 0 ? <div style={{ color: C.dim, padding: '2rem' }}>No quotations received yet.</div> : quotationsList.map((q, i) => (
                    <div key={i} onClick={() => setViewingQuote(q)} style={{ padding: '1.5rem', borderRadius: 24, background: selectedQuotes.find(s => s.name === q.name) ? 'rgba(76,214,255,0.05)' : C.bgLow, border: `1px solid ${selectedQuotes.find(s => s.name === q.name) ? C.cyan : C.border}`, display: 'flex', flexDirection: 'column', transition: 'all 0.2s', boxShadow: selectedQuotes.find(s => s.name === q.name) ? '0 0 20px rgba(76,214,255,0.2)' : '0 20px 40px rgba(0,209,255,0.08)', cursor: 'pointer' }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(76,214,255,0.3)'; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                        <div style={{ width: 48, height: 48, background: 'rgba(255,255,255,0.03)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${C.border}` }}>
                          <span className="material-symbols-outlined" style={{ color: q.iconColor }}>{q.icon}</span>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: C.cyan, marginBottom: 2 }}>
                            <span className="material-symbols-outlined fill" style={{ fontSize: '0.9rem' }}>star</span>
                            <span style={{ fontSize: '0.75rem', fontWeight: 700 }}>{q.rating}</span>
                          </div>
                          <span style={{ fontSize: '0.6rem', color: C.slate }}>{q.jobs} Jobs</span>
                        </div>
                      </div>
                      <h4 style={{ fontFamily: fonts.manrope, fontWeight: 700, fontSize: '1rem', color: C.white, margin: '0 0 4px' }}>{q.name}</h4>
                      <p style={{ fontSize: '0.75rem', color: C.slate, marginBottom: '1.5rem' }}>{q.loc}</p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.5rem', flex: 1 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.slate }}>Total Price</span>
                          <span style={{ fontFamily: fonts.manrope, fontWeight: 900, fontSize: '1.1rem', color: C.white }}>{q.price}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.slate }}>ETA</span>
                          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: C.cyan }}>{q.eta}</span>
                        </div>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                        <button onClick={(e) => handleRejectLocalQuote(e, q)} style={{ padding: '0.6rem', borderRadius: 8, background: 'rgba(255,180,171,0.1)', color: '#ef4444', fontSize: '0.65rem', fontWeight: 700, border: `1px solid rgba(255,180,171,0.2)`, cursor: 'pointer', transition: 'all 0.2s' }}
                          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,180,171,0.2)'; }} onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,180,171,0.1)'; }}>Reject</button>
                        <button onClick={(e) => handleAcceptLocalQuote(e, q)} style={{ padding: '0.6rem', borderRadius: 8, background: C.cyan, color: '#001f28', fontSize: '0.65rem', fontWeight: 700, border: 'none', cursor: 'pointer' }}
                          onMouseEnter={e => (e.currentTarget.style.filter = 'brightness(1.1)')} onMouseLeave={e => (e.currentTarget.style.filter = 'none')}>Accept</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>


            {/* Right: Spend + Top Providers + Timeline */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>

              {/* Spend by Category */}
              <div style={{ background: C.bgLow, borderRadius: 24, padding: '1.5rem', border: `1px solid ${C.border}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                  <h3 style={{ fontFamily: fonts.manrope, fontWeight: 700, fontSize: '0.9rem', color: C.white, margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Spend by Category</h3>
                  <button onClick={showComingSoon} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.6rem', fontWeight: 700, color: C.cyan, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Export</button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                  {SPEND_CATS.map(s => (
                    <div key={s.label} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                        <span style={{ color: C.muted }}>{s.label}</span>
                        <span style={{ color: C.white, fontWeight: 700 }}>{s.value}</span>
                      </div>
                      <div style={{ width: '100%', height: 6, background: C.bgLowest, borderRadius: 999, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: s.pct, background: s.color, borderRadius: 999 }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Top Providers */}
              <div style={{ background: C.bgLow, borderRadius: 24, padding: '1.5rem', border: `1px solid ${C.border}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
                  <span className="material-symbols-outlined" style={{ color: C.cyan }}>location_on</span>
                  <h3 style={{ fontFamily: fonts.manrope, fontWeight: 700, fontSize: '0.9rem', color: C.white, margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Top in Singapore</h3>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {TOP_PROVIDERS.map(p => (
                    <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem', borderRadius: 16, background: C.bgLowest, border: `1px solid ${C.border}`, cursor: 'pointer', transition: 'border-color 0.2s' }}
                      onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(76,214,255,0.2)')} onMouseLeave={e => (e.currentTarget.style.borderColor = C.border)}>
                      <div style={{ width: 48, height: 48, borderRadius: 12, background: p.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: fonts.manrope, fontWeight: 900, fontSize: '1.25rem', color: p.initColor, flexShrink: 0 }}>{p.initial}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                          <span style={{ fontSize: '0.875rem', fontWeight: 700, color: C.white }}>{p.name}</span>
                          <span className="material-symbols-outlined fill" style={{ fontSize: '0.75rem', color: C.cyan }}>verified</span>
                        </div>
                        <p style={{ fontSize: '0.65rem', color: C.slate, margin: 0 }}>{p.spec}</p>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '0.65rem', fontWeight: 700, color: C.white }}>{p.rating}</div>
                        <div style={{ fontSize: '0.5rem', color: C.slate, textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.1em' }}>Rating</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Activity Timeline */}
              <div style={{ background: C.bgLow, borderRadius: 24, padding: '1.5rem', border: `1px solid ${C.border}` }}>
                <h3 style={{ fontFamily: fonts.manrope, fontWeight: 700, fontSize: '0.9rem', color: C.white, margin: '0 0 1.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Activity Timeline</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', position: 'relative' }}>
                  <div style={{ position: 'absolute', left: 10, top: 8, bottom: 8, width: 1, background: C.border }} />
                  {TIMELINE.map((t, i) => (
                    <div key={i} style={{ paddingLeft: '2rem', position: 'relative', opacity: t.dim ? 0.6 : 1 }}>
                      <div style={{ position: 'absolute', left: 0, top: 4, width: 20, height: 20, borderRadius: '50%', background: C.bgLow, border: `2px solid ${t.active ? C.cyan : C.borderMid}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {t.active && <div style={{ width: 6, height: 6, borderRadius: '50%', background: C.cyan }} />}
                      </div>
                      <p style={{ fontSize: '0.75rem', color: C.white, margin: '0 0 4px', lineHeight: 1.4 }}>{t.text}</p>
                      <p style={{ fontSize: '0.6rem', color: C.slate, margin: 0, textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700 }}>{t.time}</p>
                    </div>
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
        borderRadius: '50%', background: 'linear-gradient(to top right, #9ccaff, #4cd6ff)',
        color: '#001d35', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 20px 40px rgba(0,209,255,0.3)', zIndex: 50, transition: 'transform 0.2s',
      }}
        onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.1)')}
        onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}>
        <span className="material-symbols-outlined" style={{ fontSize: '1.75rem', fontWeight: 900 }}>add</span>
      </button>

      {/* Compare Modal */}
      {showCompare && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(5,11,20,0.8)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 24, padding: '2rem', width: '90%', maxWidth: 1000, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
              <h2 style={{ fontFamily: fonts.manrope, fontWeight: 800, fontSize: '1.5rem', color: C.white, margin: 0 }}>Quotation Comparison</h2>
              <button onClick={() => setShowCompare(false)} style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', display: 'flex' }}><span className="material-symbols-outlined">close</span></button>
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${selectedQuotes.length}, 1fr)`, gap: '1.5rem' }}>
              {selectedQuotes.map((q, idx) => (
                <div key={idx} style={{ background: C.bgLow, padding: '1.5rem', borderRadius: 16, border: `1px solid ${C.border}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                    <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span className="material-symbols-outlined" style={{ color: q.iconColor || C.cyan }}>{q.icon || 'factory'}</span>
                    </div>
                    <div>
                      <h4 style={{ margin: 0, color: C.white, fontWeight: 700 }}>{q.name}</h4>
                      <p style={{ margin: 0, fontSize: '0.65rem', color: C.dim }}>{q.loc}</p>
                    </div>
                  </div>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div>
                      <p style={{ margin: '0 0 4px', fontSize: '0.65rem', color: C.slate, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Price</p>
                      <p style={{ margin: 0, fontFamily: fonts.manrope, fontSize: '1.25rem', fontWeight: 800, color: C.cyan }}>{q.price}</p>
                    </div>
                    <div>
                      <p style={{ margin: '0 0 4px', fontSize: '0.65rem', color: C.slate, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Estimated ETA</p>
                      <p style={{ margin: 0, fontSize: '0.875rem', color: C.white, fontWeight: 500 }}>{q.eta}</p>
                    </div>
                    <div>
                      <p style={{ margin: '0 0 4px', fontSize: '0.65rem', color: C.slate, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Provider Rating</p>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#fbbf24', fontSize: '0.875rem' }}>
                        ★ <span style={{ color: C.white }}>{q.rating}</span> <span style={{ fontSize: '0.65rem', color: C.dim }}>({q.jobs} Jobs)</span>
                      </div>
                    </div>
                  </div>
                  
                  <button onClick={() => setShowCompare(false)} style={{ width: '100%', padding: '0.75rem', marginTop: '2rem', borderRadius: 8, background: C.cyan, color: '#001f28', fontWeight: 700, fontSize: '0.875rem', border: 'none', cursor: 'pointer' }}>Award Contract</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* View Full Quote Modal */}
      {viewingQuote && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(5,11,20,0.8)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 24, padding: '2.5rem', width: '90%', maxWidth: 800, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 40px 80px rgba(0,0,0,0.5)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2.5rem' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                  <div style={{ width: 48, height: 48, borderRadius: 12, background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span className="material-symbols-outlined" style={{ color: viewingQuote.iconColor || C.cyan, fontSize: '1.5rem' }}>{viewingQuote.icon || 'inventory_2'}</span>
                  </div>
                  <div>
                    <p style={{ fontFamily: fonts.inter, fontSize: '0.75rem', fontWeight: 700, color: C.cyan, textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 4px' }}>Official Quotation</p>
                    <h2 style={{ fontFamily: fonts.manrope, fontWeight: 800, fontSize: '1.5rem', color: C.white, margin: 0 }}>{viewingQuote.name}</h2>
                  </div>
                </div>
                <p style={{ color: C.slate, margin: 0, fontSize: '0.875rem' }}>{viewingQuote.loc}</p>
              </div>
              <button onClick={() => setViewingQuote(null)} style={{ background: 'rgba(255,255,255,0.05)', border: 'none', color: C.muted, width: 36, height: 36, borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.2s' }} onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.1)')} onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}>
                <span className="material-symbols-outlined" style={{ fontSize: '1.25rem' }}>close</span>
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
              
              {/* Financial Summary */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', background: C.bgLow, padding: '1.5rem', borderRadius: 16, border: `1px solid ${C.border}` }}>
                <div>
                  <p style={{ margin: '0 0 4px', fontSize: '0.65rem', color: C.slate, textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700 }}>Total Price (Locked)</p>
                  <p style={{ margin: 0, fontFamily: fonts.manrope, fontSize: '2rem', fontWeight: 800, color: C.cyan }}>{viewingQuote.price}</p>
                </div>
                <div>
                  <p style={{ margin: '0 0 8px', fontSize: '0.65rem', color: C.slate, textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700 }}>Financial Details</p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', fontSize: '0.75rem' }}>
                    <div style={{ color: C.muted }}>Currency: <span style={{ color: C.white, fontWeight: 500 }}>{viewingQuote.details?.currency || 'USD'}</span></div>
                    <div style={{ color: C.muted }}>Model: <span style={{ color: C.white, fontWeight: 500 }}>{viewingQuote.details?.pricingModel || 'Fixed Fee'}</span></div>
                    <div style={{ color: C.muted }}>Surcharge: <span style={{ color: C.white, fontWeight: 500 }}>{viewingQuote.details?.surcharge ? `$${viewingQuote.details.surcharge}` : 'None'}</span></div>
                    <div style={{ color: C.muted }}>Tax Applied: <span style={{ color: C.white, fontWeight: 500 }}>{viewingQuote.details?.taxOn ? 'Yes (7%)' : 'No'}</span></div>
                  </div>
                </div>
              </div>

              {/* Timeline */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1.5rem', background: C.bgLowest, padding: '1.5rem', borderRadius: 16, border: `1px solid ${C.border}` }}>
                <div>
                  <p style={{ margin: '0 0 4px', fontSize: '0.65rem', color: C.slate, textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700 }}>Estimated Start</p>
                  <p style={{ margin: 0, fontSize: '0.875rem', color: C.white, fontWeight: 500 }}>{viewingQuote.details?.etaStart || 'TBD'}</p>
                </div>
                <div>
                  <p style={{ margin: '0 0 4px', fontSize: '0.65rem', color: C.slate, textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700 }}>Estimated Completion</p>
                  <p style={{ margin: 0, fontSize: '0.875rem', color: C.white, fontWeight: 500 }}>{viewingQuote.details?.etaEnd || 'TBD'}</p>
                </div>
                <div>
                  <p style={{ margin: '0 0 4px', fontSize: '0.65rem', color: C.slate, textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700 }}>Response Commitment</p>
                  <p style={{ margin: 0, fontSize: '0.875rem', color: C.white, fontWeight: 500 }}>{viewingQuote.details?.commitment || 'N/A'}</p>
                </div>
              </div>

              {/* Technical Proposal */}
              <div>
                <p style={{ margin: '0 0 0.75rem', fontSize: '0.65rem', color: C.slate, textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700 }}>Technical Proposal & Scope</p>
                <div style={{ background: C.bgLowest, padding: '1.5rem', borderRadius: 16, border: `1px solid ${C.border}`, fontSize: '0.875rem', color: '#cbd5e1', lineHeight: 1.6, whiteSpace: 'pre-wrap', minHeight: 120 }}>
                  {viewingQuote.details?.proposal || 'No technical proposal provided.'}
                </div>
              </div>
            </div>

            <div style={{ marginTop: '2.5rem', display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
              <button onClick={() => setViewingQuote(null)} style={{ padding: '0.75rem 2rem', borderRadius: 8, background: 'transparent', color: C.white, fontWeight: 700, fontSize: '0.875rem', border: `1px solid ${C.border}`, cursor: 'pointer', transition: 'background 0.2s' }} onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>Close</button>
              <button style={{ padding: '0.75rem 2.5rem', borderRadius: 8, background: C.cyan, color: '#001f28', fontWeight: 700, fontSize: '0.875rem', border: 'none', cursor: 'pointer', boxShadow: '0 10px 20px rgba(0,209,255,0.2)' }}>Accept Quotation</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default ShipOwnerDashboard;
