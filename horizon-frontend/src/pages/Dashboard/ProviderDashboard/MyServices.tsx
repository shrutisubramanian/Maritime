import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const C = {
  bg: '#0d141d',
  bgNav: '#151c26',
  bgCard: '#19202a',
  bgCardH: '#242a34',
  bgHigh: '#2e353f',
  bgBright: '#333a44',
  bgLowest: '#080f18',
  border: 'rgba(68,71,77,0.1)',
  borderMid: 'rgba(68,71,77,0.3)',
  text: '#dce3f0',
  muted: '#c4c6ce',
  dim: '#8e9098',
  slate: '#64748b',
  cyan: '#4cd6ff',
  primary: '#9ccaff',
  secondary: '#a6c9fa',
  secCont: '#244872',
  terCont: '#00222c',
  error: '#ffb4ab',
  white: '#ffffff',
};
const fonts = { manrope: "'Manrope', sans-serif", inter: "'Inter', sans-serif" };

const PROF_IMG = 'https://lh3.googleusercontent.com/aida-public/AB6AXuCnwxqJUDULu6mGu-1ri_AHDMe83jBZJ1ZhF__zrTbb3u52-cPmhAGnVzZTGpqvgRmfK2Tj5AjsMQ7XBFkNpTGd9veAONUebKLx47gLD2T_MeMAUcLlI5vInWxXBFH0eeyBy4JF6cNVtbGki5X3rBn7-Qb7LlM2G4usTi1g1AAHFQRUdwNBGg2nJ8Ybb6oQvGJ5CF5przk2g-hplKHWknbdrDNK4PkZwz-8KBLdFsVj26VHHJvhNXtpew';

// Sidebar NavItem
const NavItem: React.FC<{ icon: string; label: string; active?: boolean; onClick?: () => void }> = ({ icon, label, active, onClick }) => {
  const [hov, setHov] = useState(false);
  return (
    <a href="#" onClick={e => { e.preventDefault(); onClick?.(); }}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: '0.75rem',
        padding: '0.75rem 1.5rem',
        color: active ? C.primary : hov ? C.text : C.muted,
        background: active ? C.bgCardH : hov ? C.bgBright : 'transparent',
        borderRadius: active ? '0 999px 999px 0' : 0,
        textDecoration: 'none', transition: 'all 0.2s',
        fontWeight: active ? 700 : 400,
        marginRight: active ? '1rem' : 0,
      }}>
      <span className="material-symbols-outlined" style={{ fontSize: '1.2rem', fontVariationSettings: active ? "'FILL' 1" : "'FILL' 0" }}>{icon}</span>
      <span style={{ fontFamily: fonts.inter, fontSize: '0.875rem' }}>{label}</span>
    </a>
  );
};

const DROPDOWNS = ['Category', 'Port', 'Status', 'Rating', 'Response'];

const SERVICES = [
  {
    title: 'Underwater Hull Cleaning', category: 'MAINTENANCE', rating: '4.8', reviews: '184',
    img: 'https://images.unsplash.com/photo-1583138848135-2632b724660d?q=80&w=600&auto=format&fit=crop',
    ports: ['Singapore', 'Rotterdam', '+3 More'], leads: 46, views: 328, quotes: 17, conv: '42%',
    demand: 'High Demand', demandColor: C.cyan, active: true, draft: false, type: 'Quotation Based'
  },
  {
    title: 'Specialized Electrical Repair', category: 'TECHNICAL', rating: '4.9', reviews: '42',
    img: 'https://images.unsplash.com/photo-1620601815152-32a2f8623eb1?q=80&w=600&auto=format&fit=crop',
    ports: ['Dubai', 'Busan'], leads: 12, views: 94, quotes: 5, conv: '31%',
    demand: 'Moderate Demand', demandColor: C.muted, active: true, draft: false, type: 'Quotation Based'
  },
  {
    title: 'Autonomous Drone Survey', category: 'INSPECTION', rating: 'N/A', reviews: '0',
    img: 'https://images.unsplash.com/photo-1508614589041-895b88991e3e?q=80&w=600&auto=format&fit=crop',
    ports: ['Global Access'], leads: 0, views: 0, quotes: 0, conv: '--',
    demand: 'DRAFT', demandColor: C.dim, active: false, draft: true, type: 'Draft Mode'
  }
];

export const MyServices: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: C.bg, color: C.text, fontFamily: fonts.inter }}>
      
      {/* ── SIDE NAV ── */}
      <aside style={{ width: 256, flexShrink: 0, position: 'fixed', left: 0, top: 0, bottom: 0, background: C.bgNav, display: 'flex', flexDirection: 'column', paddingTop: '2rem', zIndex: 50, borderRight: `1px solid ${C.border}` }}>
        <div style={{ padding: '0 1.5rem', marginBottom: '2.5rem' }}>
          <h1 style={{ fontFamily: fonts.manrope, fontWeight: 700, fontSize: '1rem', color: C.primary, letterSpacing: '-0.02em', margin: 0, lineHeight: 1 }}>Horizon</h1>
          <p style={{ fontSize: '0.55rem', letterSpacing: '0.2em', textTransform: 'uppercase', color: C.muted, fontWeight: 500, margin: '4px 0 0' }}>SERVICE PROVIDER PORTAL</p>
        </div>
        <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <NavItem icon="grid_view"      label="Dashboard"         onClick={() => navigate('/provider-dashboard')} />
          <NavItem icon="sailing"        label="My Services"       active onClick={() => navigate('/provider/services')} />
          <NavItem icon="hail"           label="Incoming Requests" onClick={() => navigate('/procurement-opportunities')} />
          <NavItem icon="request_quote"  label="Quotations"        onClick={() => navigate('/provider-dashboard')} />
          <div style={{ height: 16 }} />
          <NavItem icon="business"       label="Company Profile"   onClick={() => navigate('/provider/me')} />
          <NavItem icon="verified"       label="Verification"      onClick={() => navigate('/verification')} />
          <NavItem icon="description"    label="Documents"         onClick={() => navigate('/verification')} />
          <NavItem icon="reviews"        label="Reviews"           onClick={() => navigate('/provider-dashboard')} />
          <div style={{ flex: 1 }} />
          <NavItem icon="person"         label="Profile"           onClick={() => navigate('/provider/me')} />
          <NavItem icon="settings"       label="Settings"          onClick={() => navigate('/settings')} />
        </nav>
      </aside>

      {/* ── MAIN CONTENT ── */}
      <main style={{ marginLeft: 256, flex: 1, display: 'flex', flexDirection: 'column' }}>
        
        {/* TOP HEADER */}
        <header style={{ height: 64, background: C.bg, borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 2rem', position: 'sticky', top: 0, zIndex: 40 }}>
          <div style={{ position: 'relative', width: 400 }}>
            <span className="material-symbols-outlined" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: C.dim, fontSize: '1.2rem', pointerEvents: 'none' }}>search</span>
            <input type="text" placeholder="Search across infrastructure..." 
              style={{ width: '100%', background: C.bgLowest, border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 16px 8px 40px', color: C.text, fontSize: '0.875rem', outline: 'none' }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
            <span className="material-symbols-outlined" style={{ color: C.muted, cursor: 'pointer', fontSize: '1.25rem' }}>notifications</span>
            <span className="material-symbols-outlined" style={{ color: C.muted, cursor: 'pointer', fontSize: '1.25rem' }}>apps</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ textAlign: 'right' }}>
                <p style={{ fontSize: '0.875rem', fontWeight: 600, color: C.text, margin: 0 }}>Horizon Maritime</p>
                <p style={{ fontSize: '0.65rem', color: C.dim, margin: 0 }}>Manager Access</p>
              </div>
              <div style={{ width: 36, height: 36, borderRadius: '50%', overflow: 'hidden', border: `1px solid ${C.borderMid}` }}>
                <img src={PROF_IMG} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>
            </div>
          </div>
        </header>

        {/* CONTENT */}
        <div style={{ padding: '3rem 2rem 5rem', maxWidth: 1200, margin: '0 auto', width: '100%' }}>
          
          {/* Title & Action Buttons */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem' }}>
            <div>
              <p style={{ fontSize: '0.65rem', fontWeight: 700, color: C.cyan, textTransform: 'uppercase', letterSpacing: '0.15em', margin: '0 0 0.5rem' }}>PROVIDER CONSOLE</p>
              <h2 style={{ fontFamily: fonts.manrope, fontWeight: 800, fontSize: '2rem', color: C.white, margin: '0 0 0.5rem' }}>My Services</h2>
              <p style={{ fontSize: '0.9rem', color: C.muted, margin: 0, maxWidth: 500, lineHeight: 1.6 }}>Manage, monitor, and optimize all of your maritime service offerings across global hubs.</p>
            </div>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <button style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0.75rem 1.25rem', background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer', transition: 'background 0.2s' }}
                onMouseEnter={e => e.currentTarget.style.background = C.bgCardH} onMouseLeave={e => e.currentTarget.style.background = C.bgCard}>
                <span className="material-symbols-outlined" style={{ fontSize: '1.2rem' }}>system_update_alt</span> Import Services
              </button>
              <button onClick={() => navigate('/add-service')} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0.75rem 1.25rem', background: C.cyan, color: '#00203a', border: 'none', borderRadius: 8, fontSize: '0.875rem', fontWeight: 700, cursor: 'pointer', transition: 'filter 0.2s' }}
                onMouseEnter={e => e.currentTarget.style.filter = 'brightness(1.1)'} onMouseLeave={e => e.currentTarget.style.filter = 'none'}>
                <span className="material-symbols-outlined" style={{ fontSize: '1.2rem' }}>add_circle</span> Add New Service
              </button>
            </div>
          </div>

          {/* KPI Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1.5rem', marginBottom: '2rem' }}>
            {[
              { lbl: 'ACTIVE SERVICES', val: '24', trend: '+2', trendColor: C.cyan, icon: 'anchor' },
              { lbl: 'TOTAL LEADS (MTD)', val: '186', trend: '14%', trendColor: C.cyan, icon: 'share_windows' },
              { lbl: 'QUOTE REQUESTS', val: '58', trend: '-3%', trendColor: C.error, icon: 'description' },
              { lbl: 'COMPLETED JOBS', val: '97', trend: '8%', trendColor: C.cyan, icon: 'verified' },
            ].map((kpi, i) => (
              <div key={i} style={{ background: C.bgCard, borderRadius: 12, padding: '1.25rem', position: 'relative', overflow: 'hidden' }}>
                <p style={{ fontSize: '0.65rem', fontWeight: 700, color: C.dim, margin: '0 0 1rem', letterSpacing: '0.1em' }}>{kpi.lbl}</p>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.5rem' }}>
                  <h3 style={{ fontFamily: fonts.manrope, fontSize: '2rem', fontWeight: 700, color: C.white, margin: 0, lineHeight: 1 }}>{kpi.val}</h3>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: kpi.trendColor, marginBottom: 4 }}>
                    {kpi.trend.startsWith('-') ? <span className="material-symbols-outlined" style={{ fontSize: '0.875rem', verticalAlign: 'middle' }}>trending_down</span> : <span className="material-symbols-outlined" style={{ fontSize: '0.875rem', verticalAlign: 'middle' }}>trending_up</span>} {kpi.trend}
                  </span>
                </div>
                <span className="material-symbols-outlined" style={{ position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)', fontSize: '3.5rem', color: 'rgba(255,255,255,0.02)', pointerEvents: 'none' }}>{kpi.icon}</span>
              </div>
            ))}
          </div>

          {/* Filter Bar */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem', background: C.bgLowest, borderRadius: 12, marginBottom: '2rem', border: `1px solid ${C.border}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div style={{ position: 'relative', width: 280 }}>
                <span className="material-symbols-outlined" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: C.dim, fontSize: '1.2rem', pointerEvents: 'none' }}>search</span>
                <input type="text" placeholder="Search services by name or ID..." 
                  style={{ width: '100%', background: 'transparent', border: 'none', padding: '8px 16px 8px 40px', color: C.text, fontSize: '0.875rem', outline: 'none' }} />
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                {DROPDOWNS.map(d => (
                  <button key={d} style={{ display: 'flex', alignItems: 'center', gap: 4, background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 8, padding: '6px 12px', color: C.muted, fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}>
                    {d} <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>expand_more</span>
                  </button>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', paddingRight: '0.5rem' }}>
              <button style={{ width: 32, height: 32, borderRadius: 6, background: C.primary, color: '#00203a', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '1.2rem' }}>grid_view</span>
              </button>
              <button style={{ width: 32, height: 32, borderRadius: 6, background: 'transparent', color: C.dim, border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '1.2rem' }}>list</span>
              </button>
            </div>
          </div>

          {/* Services Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.5rem', marginBottom: '3rem' }}>
            {SERVICES.map((s, i) => (
              <div key={i} style={{ background: C.bgCard, borderRadius: 16, overflow: 'hidden', border: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column' }}>
                
                {/* Header Image */}
                <div style={{ height: 160, position: 'relative' }}>
                  <img src={s.img} alt={s.title} style={{ width: '100%', height: '100%', objectFit: 'cover', filter: s.draft ? 'grayscale(100%)' : 'none' }} />
                  <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(13,20,29,1) 0%, rgba(13,20,29,0) 50%)' }} />
                  
                  {/* Verified Badge */}
                  {!s.draft && (
                    <div style={{ position: 'absolute', top: 12, left: 12, background: C.cyan, color: '#00203a', padding: '4px 8px', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.65rem', fontWeight: 800 }}>
                      <span className="material-symbols-outlined" style={{ fontSize: '0.8rem', fontVariationSettings: "'FILL' 1" }}>verified</span>
                      VERIFIED
                    </div>
                  )}

                  {/* Mode Badge */}
                  <div style={{ position: 'absolute', bottom: 12, right: 12, background: 'rgba(13,20,29,0.8)', backdropFilter: 'blur(4px)', padding: '4px 8px', borderRadius: 6, fontSize: '0.65rem', fontWeight: 600, color: C.text, border: `1px solid ${C.borderMid}` }}>
                    {s.type}
                  </div>
                </div>

                {/* Body */}
                <div style={{ padding: '1.25rem', flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                    <h3 style={{ fontFamily: fonts.manrope, fontSize: '1.1rem', fontWeight: 700, color: C.white, margin: 0 }}>{s.title}</h3>
                    <span className="material-symbols-outlined" style={{ color: C.dim, cursor: 'pointer', fontSize: '1.25rem' }}>more_vert</span>
                  </div>
                  
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                    <span style={{ fontSize: '0.65rem', fontWeight: 700, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{s.category}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span className="material-symbols-outlined" style={{ color: s.draft ? C.dim : C.cyan, fontSize: '0.9rem', fontVariationSettings: "'FILL' 1" }}>star</span>
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, color: C.text }}>{s.rating}</span>
                      <span style={{ fontSize: '0.75rem', color: C.dim }}>({s.reviews} Reviews)</span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1.5rem' }}>
                    {s.ports.map(p => (
                      <span key={p} style={{ padding: '4px 8px', background: C.bgLowest, border: `1px solid ${C.border}`, borderRadius: 6, fontSize: '0.65rem', fontWeight: 600, color: C.text }}>
                        {p}
                      </span>
                    ))}
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem', paddingTop: '1rem', borderTop: `1px solid ${C.border}` }}>
                    <div style={{ textAlign: 'center' }}>
                      <p style={{ fontSize: '0.6rem', color: C.dim, margin: '0 0 4px', textTransform: 'uppercase' }}>LEADS</p>
                      <p style={{ fontSize: '1rem', fontWeight: 600, color: C.text, margin: 0 }}>{s.leads}</p>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <p style={{ fontSize: '0.6rem', color: C.dim, margin: '0 0 4px', textTransform: 'uppercase' }}>VIEWS</p>
                      <p style={{ fontSize: '1rem', fontWeight: 600, color: C.text, margin: 0 }}>{s.views}</p>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <p style={{ fontSize: '0.6rem', color: C.dim, margin: '0 0 4px', textTransform: 'uppercase' }}>QUOTES</p>
                      <p style={{ fontSize: '1rem', fontWeight: 600, color: C.text, margin: 0 }}>{s.quotes}</p>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <p style={{ fontSize: '0.6rem', color: C.dim, margin: '0 0 4px', textTransform: 'uppercase' }}>CONV.</p>
                      <p style={{ fontSize: '1rem', fontWeight: 600, color: s.draft ? C.dim : C.primary, margin: 0 }}>{s.conv}</p>
                    </div>
                  </div>

                  <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        <div style={{ width: 6, height: 6, borderRadius: '50%', background: s.demandColor }} />
                        <span style={{ fontSize: '0.65rem', fontWeight: 600, color: C.dim }}>{s.demand}</span>
                      </div>
                      <span style={{ padding: '2px 8px', background: s.active ? 'rgba(76,214,255,0.1)' : C.bgLowest, color: s.active ? C.cyan : C.dim, borderRadius: 4, fontSize: '0.65rem', fontWeight: 700 }}>
                        {s.active ? 'Active' : 'DRAFT'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      {!s.draft && <span className="material-symbols-outlined" style={{ color: C.dim, cursor: 'pointer', fontSize: '1.2rem' }}>visibility</span>}
                      <button style={{ padding: '0.5rem 1rem', background: s.draft ? C.bgLowest : C.secCont, color: C.text, border: s.draft ? `1px solid ${C.border}` : 'none', borderRadius: 8, fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}>
                        {s.draft ? 'Resume Setup' : 'Edit Service'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* AI Insights Panel */}
          <div style={{ background: C.bgCardH, borderRadius: 16, padding: '1.5rem 2rem', display: 'flex', alignItems: 'center', gap: '2rem', border: `1px solid ${C.border}` }}>
            <div style={{ width: 48, height: 48, borderRadius: 12, background: C.terCont, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <span className="material-symbols-outlined" style={{ color: C.cyan, fontSize: '1.5rem' }}>auto_awesome</span>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                <h4 style={{ fontFamily: fonts.manrope, fontSize: '1.1rem', fontWeight: 700, color: C.white, margin: 0 }}>Service Performance Insights</h4>
                <span style={{ background: 'rgba(76,214,255,0.1)', color: C.cyan, padding: '2px 8px', borderRadius: 4, fontSize: '0.65rem', fontWeight: 800 }}>AI POWERED</span>
              </div>
              <p style={{ fontSize: '0.875rem', color: C.muted, margin: '0 0 0.75rem', lineHeight: 1.5 }}>
                Based on real-time traffic analysis and maritime logistics trends, we recommend expanding your <strong style={{ color: C.cyan, fontWeight: 600 }}>"Underwater Hull Cleaning"</strong> availability to <strong style={{ color: C.cyan, fontWeight: 600 }}>Port Klang (MY)</strong>. Search demand for this hub has increased by <strong style={{ color: C.cyan }}>22%</strong> in the last 14 days with limited local competition.
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                <a href="#" style={{ color: C.cyan, fontSize: '0.75rem', fontWeight: 700, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
                  View Demand Map <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>arrow_forward</span>
                </a>
                <a href="#" style={{ color: C.dim, fontSize: '0.75rem', textDecoration: 'none' }}>Dismiss Recommendation</a>
              </div>
            </div>
            <div>
              <button style={{ padding: '0.75rem 1.5rem', background: C.bgLowest, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', transition: 'background 0.2s' }}
                onMouseEnter={e => e.currentTarget.style.background = C.bgCard} onMouseLeave={e => e.currentTarget.style.background = C.bgLowest}>
                Optimize Portfolio
              </button>
            </div>
          </div>

        </div>
      </main>
    </div>
  );
};

export default MyServices;
