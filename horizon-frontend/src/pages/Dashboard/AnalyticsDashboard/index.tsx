import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../hooks/useAuth';

const T = {
  manrope:  "'Manrope', sans-serif"  as const,
  inter:    "'Inter', sans-serif"    as const,
  bg:       '#0d141d',
  bgNav:    'rgba(15,23,42,0.6)',
  bgSide:   'rgba(15,23,42,0.6)',
  bgCard:   'rgba(46,53,63,0.4)',
  bgLow:    '#151c26',
  bgHigh:   '#242a34',
  bgHighest:'#2e353f',
  bgLowest: '#080f18',
  border:   'rgba(30,41,59,0.2)',
  text:     '#f1f5f9',
  muted:    '#c4c6ce',
  dim:      '#8e9098',
  cyan:     '#4cd6ff',
  primary:  '#9ccaff',
  secondary:'#a6c9fa',
  error:    '#ffb4ab',
};
const blur = (): React.CSSProperties => ({ backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' });
const gc = (): React.CSSProperties => ({ background: T.bgCard, ...blur(), boxShadow: '0 8px 32px rgba(0,0,0,0.3)' });

const PROF = 'https://lh3.googleusercontent.com/aida-public/AB6AXuCbufiZgLAk1V5xUiQ35unzVY6Pv3kFMo8IkBo5dPIy1i0ITm5oda8dVIjHusQuxzWIQIs7lmTdGsPfyFgHdRITro9S6diWSRGvj1KJIfu-6y-cGdNrUvUry2EaCKDjRMgWCROBIH25P63HaKq3k1oh8wzwWBmuwT01UqK0LzncCUn6dIyVrlNt1tW4sMzjl-o7q3gAmTr_2yB3-TXO3iJ57abks8z-kBZpjzHQkSc8bMJxmy3LTYCr0p5xtVCBBa4Blf7x6Q8TcogD';
const MAP  = 'https://lh3.googleusercontent.com/aida-public/AB6AXuBtp38VPCY7oDbo4bCPISyFSza1Z6cb4U4ZDYNuoUog09_7Y6GwtnDqUx85fPvsYkAHvBH_i-1mbl34_v_sBEpsyznv6Hj07P3fqGI_clnV8DS9mVclHuG5SP7uLEShP0ZvOde2I4n4ZqZomgj93RlKkJwMdu3khpfcNTw2AL1rzyg7T4-d-VZt0-DfmKD1Y_DD-sYYk5Ce5UXim3JRb8MuP2ubHfOe2T8qSPwZGAZ_DQZhCVoj20paFV7YVRR98zWThZFeRRBJOUFV';

const KPI_CARDS = [
  { icon: 'task_alt',        color: T.primary,   borderColor: T.primary,   label: 'Total Jobs Completed', value: '1.2k',  badge: '+12%',   badgeBg: 'rgba(76,214,255,0.1)',  badgeColor: T.cyan  },
  { icon: 'pending_actions', color: T.cyan,      borderColor: T.cyan,      label: 'Active Requests',       value: '45',    badge: '-4%',    badgeBg: 'rgba(255,180,171,0.1)', badgeColor: T.error },
  { icon: 'verified',        color: T.secondary, borderColor: T.secondary, label: 'Success Rate',           value: '99.4%', badge: 'Stable', badgeBg: 'rgba(76,214,255,0.1)',  badgeColor: T.cyan  },
  { icon: 'timer',           color: T.dim,       borderColor: T.dim,       label: 'Avg Response Time',      value: '2.4h',  badge: '-0.4h',  badgeBg: 'rgba(76,214,255,0.1)',  badgeColor: T.cyan  },
];

const SIDEBAR_NAV = [
  { icon: 'dashboard',    label: 'Dashboard',           path: '/ship-dashboard', active: false },
  { icon: 'directions_boat', label: 'Vessel Tracking',  path: '/ship-dashboard', active: false },
  { icon: 'storefront',   label: 'Marketplace',         path: '/marketplace',    active: false },
  { icon: 'description',  label: 'Contract Management', path: '/ship-dashboard', active: false },
  { icon: 'insights',     label: 'Analytics',           path: '/analytics',      active: true  },
];

const TOP_SERVICES = [
  { icon: 'engineering',       name: 'Engine Repair',  sub: 'High Priority Maintenance', jobs: '422 Jobs', pct: '85%' },
  { icon: 'cleaning_services', name: 'Hull Cleaning',  sub: 'Scheduled Maintenance',     jobs: '315 Jobs', pct: '65%' },
  { icon: 'propane_tank',      name: 'Bunkering',      sub: 'Fuel Logistics',            jobs: '298 Jobs', pct: '60%' },
];

const PROVIDERS = [
  { initials: 'RM', color: T.primary,   name: 'Rotterdam Marine Services', rating: '4.9', completion: '98%', response: '1.8h' },
  { initials: 'SL', color: T.secondary, name: 'Singapore Logistics Hub',   rating: '4.7', completion: '95%', response: '2.1h' },
  { initials: 'NB', color: T.dim,       name: 'Nordic Bergen Technical',   rating: '4.8', completion: '99%', response: '1.5h' },
];

const BAR_WEEKS = [
  { rev: '40%', svc: '60%' },
  { rev: '75%', svc: '45%' },
  { rev: '60%', svc: '85%' },
  { rev: '90%', svc: '30%' },
];

const SNavItem: React.FC<{ icon: string; label: string; active?: boolean; fill?: boolean; onClick?: () => void }> = ({ icon, label, active, fill, onClick }) => {
  const [hov, setHov] = useState(false);
  return (
    <a href="#" onClick={e => { e.preventDefault(); onClick?.(); }}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem', textDecoration: 'none', transition: 'all 0.25s', borderRadius: active ? '0 999px 999px 0' : 8,
        color: active ? T.cyan : hov ? '#e2e8f0' : '#64748b',
        background: active ? 'rgba(34,211,238,0.12)' : hov ? 'rgba(30,41,59,0.4)' : 'transparent',
        borderLeft: active ? `4px solid ${T.cyan}` : '4px solid transparent',
      }}>
      <span className="material-symbols-outlined" style={{ fontSize: '1.2rem', fontVariationSettings: (active || fill) ? "'FILL' 1" : "'FILL' 0" }}>{icon}</span>
      <span style={{ fontFamily: T.inter, fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}>{label}</span>
    </a>
  );
};

export const AnalyticsDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { logout } = useAuth();

  return (
    <div style={{ background: T.bg, color: T.text, fontFamily: T.inter, minHeight: '100vh' }}>

      {/* ── TOP NAV ── */}
      <header style={{ position: 'fixed', top: 0, left: 0, right: 0, height: 64, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 1.5rem', background: 'rgba(15,23,42,0.4)', ...blur(), boxShadow: '0 20px 40px rgba(0,209,255,0.06)', borderBottom: `1px solid ${T.border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
          <span style={{ fontFamily: T.manrope, fontWeight: 700, fontSize: '1.05rem', color: T.text, letterSpacing: '-0.02em' }}>Oceanic Horizon Marketplace</span>
          <nav style={{ display: 'flex', gap: '0.25rem' }}>
            {[{ l: 'Marketplace', p: '/marketplace', active: false }, { l: 'Analytics', p: '/analytics', active: true }, { l: 'Fleet', p: '/ship-dashboard', active: false }].map(({ l, p, active }) => (
              <a key={l} href="#" onClick={e => { e.preventDefault(); navigate(p); }}
                style={{ padding: '4px 12px', fontFamily: T.manrope, fontSize: '0.85rem', fontWeight: active ? 700 : 500, textDecoration: 'none', borderRadius: 6, transition: 'color 0.2s',
                  color: active ? T.cyan : '#94a3b8',
                  borderBottom: active ? `2px solid ${T.cyan}` : 'none',
                }}>{l}</a>
            ))}
          </nav>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ position: 'relative' }}>
            <span className="material-symbols-outlined" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: T.dim, fontSize: '1rem', pointerEvents: 'none' }}>search</span>
            <input type="text" placeholder="Global Search..." style={{ background: T.bgLowest, border: 'none', borderBottom: `1px solid rgba(68,71,77,0.15)`, borderRadius: 999, padding: '6px 16px 6px 34px', width: 220, fontSize: '0.8rem', color: T.text, outline: 'none', fontFamily: T.inter }} />
          </div>
          {['notifications','help_outline'].map(icon => (
            <button key={icon} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', display: 'flex', transition: 'color 0.2s' }}
              onMouseEnter={e => (e.currentTarget.style.color = T.cyan)} onMouseLeave={e => (e.currentTarget.style.color = '#94a3b8')}>
              <span className="material-symbols-outlined" style={{ fontSize: '1.3rem' }}>{icon}</span>
            </button>
          ))}
          <div style={{ width: 32, height: 32, borderRadius: '50%', overflow: 'hidden', border: `1px solid rgba(76,214,255,0.3)`, cursor: 'pointer' }} onClick={() => navigate('/company-profile')}>
            <img src={PROF} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
        </div>
      </header>

      {/* ── SIDEBAR ── */}
      <aside style={{ position: 'fixed', left: 0, top: 64, bottom: 0, width: 256, zIndex: 40, display: 'flex', flexDirection: 'column', padding: '2rem 0 1.5rem', background: T.bgSide, ...blur(), borderRight: `1px solid ${T.border}` }}>
        <div style={{ padding: '0 1.5rem', marginBottom: '2rem' }}>
          <h2 style={{ fontFamily: T.manrope, fontWeight: 900, fontSize: '0.85rem', color: '#f8fafc', letterSpacing: '0.15em', textTransform: 'uppercase', margin: 0 }}>Fleet Command</h2>
          <p style={{ fontSize: '0.6rem', color: '#64748b', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', margin: '2px 0 0' }}>Global Operations</p>
        </div>
        <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2, padding: '0 1rem' }}>
          {SIDEBAR_NAV.map(item => <SNavItem key={item.label} {...item} fill={item.active} onClick={() => navigate(item.path)} />)}
        </nav>
        <div style={{ padding: '0 1rem', marginTop: '1rem' }}>
          <button style={{ width: '100%', marginBottom: '1rem', padding: '0.75rem', background: 'linear-gradient(to right, #9ccaff, #a6c9fa)', color: '#001d35', fontFamily: T.manrope, fontWeight: 700, fontSize: '0.7rem', letterSpacing: '0.1em', textTransform: 'uppercase', border: 'none', borderRadius: 12, cursor: 'pointer', boxShadow: '0 4px 16px rgba(76,214,255,0.15)' }}>
            Schedule Cargo
          </button>
          {[{ icon: 'settings', label: 'Settings', path: '/settings' }, { icon: 'support_agent', label: 'Support', path: '/support' }].map(({ icon, label, path }) => (
            <a key={label} href="#" onClick={e => { e.preventDefault(); if (path !== '/support') navigate(path); }} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 1rem', color: '#64748b', textDecoration: 'none', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', transition: 'color 0.2s' }}
              onMouseEnter={e => (e.currentTarget.style.color = '#e2e8f0')} onMouseLeave={e => (e.currentTarget.style.color = '#64748b')}>
              <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>{icon}</span>{label}
            </a>
          ))}
        </div>
      </aside>

      {/* ── MAIN ── */}
      <main style={{ marginLeft: 256, paddingTop: 64, minHeight: '100vh', background: T.bg }}>
        <div style={{ padding: '2.5rem 1.5rem 3rem', maxWidth: 1400, margin: '0 auto' }}>

          {/* heading + filters */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '1.5rem', marginBottom: '2.5rem' }}>
            <div>
              <p style={{ fontSize: '0.6rem', color: T.cyan, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 4 }}>Performance Insight</p>
              <h1 style={{ fontFamily: T.manrope, fontWeight: 800, fontSize: 'clamp(1.8rem,3.5vw,2.5rem)', color: '#f8fafc', letterSpacing: '-0.04em', margin: 0 }}>Horizon Maritime Analytics</h1>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
              {[{ label: 'Date Range', options: ['Last 30 Days','Last Quarter','Year to Date'] }, { label: 'Port', options: ['All Ports','Rotterdam','Singapore'] }, { label: 'Service Type', options: ['All Services','Maintenance','Logistics'] }].map(({ label, options }) => (
                <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label style={{ fontSize: '0.55rem', color: T.dim, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', paddingLeft: 4 }}>{label}</label>
                  <select style={{ background: T.bgLow, border: 'none', color: T.text, borderRadius: 8, padding: '0.5rem 1rem', fontSize: '0.75rem', outline: 'none', cursor: 'pointer', fontFamily: T.inter }}>
                    {options.map(o => <option key={o}>{o}</option>)}
                  </select>
                </div>
              ))}
            </div>
          </div>

          {/* KPI cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px,1fr))', gap: '1.5rem', marginBottom: '1.5rem' }}>
            {KPI_CARDS.map(c => (
              <div key={c.label} style={{ ...gc(), borderRadius: 16, padding: '1.5rem', borderLeft: `4px solid ${c.borderColor}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                  <div style={{ padding: '0.5rem', borderRadius: 8, background: `${c.color}18` }}>
                    <span className="material-symbols-outlined" style={{ fontSize: '1.3rem', color: c.color }}>{c.icon}</span>
                  </div>
                  <span style={{ fontSize: '0.6rem', fontWeight: 700, padding: '3px 8px', borderRadius: 999, background: c.badgeBg, color: c.badgeColor }}>{c.badge}</span>
                </div>
                <p style={{ fontSize: '0.65rem', color: T.muted, fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>{c.label}</p>
                <p style={{ fontFamily: T.manrope, fontWeight: 800, fontSize: '2rem', color: '#f8fafc', letterSpacing: '-0.04em', margin: 0 }}>{c.value}</p>
              </div>
            ))}
          </div>

          {/* bento row 1: line chart + donut */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>

            {/* jobs over time */}
            <div style={{ ...gc(), borderRadius: 24, padding: '2rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <div>
                  <h3 style={{ fontFamily: T.manrope, fontWeight: 700, fontSize: '1.1rem', color: '#f8fafc', margin: '0 0 4px' }}>Jobs Over Time</h3>
                  <p style={{ fontSize: '0.75rem', color: T.muted, margin: 0 }}>Monthly operations volume</p>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: T.cyan }} />
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'rgba(76,214,255,0.2)' }} />
                </div>
              </div>
              <div style={{ position: 'relative', height: 220 }}>
                <svg width="100%" height="100%" viewBox="0 0 100 40" preserveAspectRatio="none" style={{ overflow: 'visible' }}>
                  <defs>
                    <linearGradient id="ag" x1="0%" x2="0%" y1="0%" y2="100%">
                      <stop offset="0%" stopColor={T.cyan} stopOpacity="0.3" />
                      <stop offset="100%" stopColor={T.cyan} stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  {/* vertical grid */}
                  {[0,20,40,60,80,100].map(x => <line key={x} x1={x} x2={x} y1="0" y2="40" stroke="rgba(68,71,77,0.1)" strokeWidth="0.3" />)}
                  <path d="M0,35 Q10,32 20,28 T40,15 T60,22 T80,8 T100,18 V40 H0 Z" fill="url(#ag)" />
                  <path d="M0,35 Q10,32 20,28 T40,15 T60,22 T80,8 T100,18" fill="none" stroke={T.cyan} strokeWidth="0.5" strokeLinecap="round" />
                  {[[20,28],[40,15],[80,8]].map(([cx,cy]) => <circle key={cx} cx={cx} cy={cy} r="0.8" fill={T.cyan} />)}
                </svg>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.75rem', fontSize: '0.6rem', color: T.dim, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase' }}>
                  {['Jan','Feb','Mar','Apr','May','Jun'].map(m => <span key={m}>{m}</span>)}
                </div>
              </div>
            </div>

            {/* service categories donut */}
            <div style={{ ...gc(), borderRadius: 24, padding: '2rem', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <h3 style={{ fontFamily: T.manrope, fontWeight: 700, fontSize: '1.1rem', color: '#f8fafc', margin: '0 0 1.5rem', alignSelf: 'flex-start' }}>Service Categories</h3>
              <div style={{ position: 'relative', width: 160, height: 160, marginBottom: '1.5rem' }}>
                <svg viewBox="0 0 36 36" width="100%" height="100%" style={{ transform: 'rotate(-90deg)' }}>
                  <circle cx="18" cy="18" r="16" fill="none" stroke={T.bgHighest} strokeWidth="3" />
                  <circle cx="18" cy="18" r="16" fill="none" stroke={T.primary}   strokeWidth="3" strokeDasharray="40 100" strokeDashoffset="0" />
                  <circle cx="18" cy="18" r="16" fill="none" stroke={T.cyan}      strokeWidth="3" strokeDasharray="25 100" strokeDashoffset="-40" />
                  <circle cx="18" cy="18" r="16" fill="none" stroke={T.secondary} strokeWidth="3" strokeDasharray="20 100" strokeDashoffset="-65" />
                  <circle cx="18" cy="18" r="16" fill="none" stroke={T.dim}       strokeWidth="3" strokeDasharray="15 100" strokeDashoffset="-85" />
                </svg>
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontFamily: T.manrope, fontWeight: 900, fontSize: '1.8rem', color: '#f8fafc', lineHeight: 1 }}>4</span>
                  <span style={{ fontSize: '0.55rem', fontWeight: 700, color: T.dim, letterSpacing: '0.15em', textTransform: 'uppercase' }}>Main Sectors</span>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', width: '100%' }}>
                {[{ color: T.primary, label: 'Maintenance' }, { color: T.cyan, label: 'Logistics' }, { color: T.secondary, label: 'Repair' }, { color: T.dim, label: 'Crew' }].map(({ color, label }) => (
                  <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
                    <span style={{ fontSize: '0.7rem', color: T.muted }}>{label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* revenue vs services bar chart */}
          <div style={{ ...gc(), borderRadius: 24, padding: '2rem', marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
              <h3 style={{ fontFamily: T.manrope, fontWeight: 700, fontSize: '1.1rem', color: '#f8fafc', margin: 0 }}>Revenue vs Services Analytics</h3>
              <div style={{ display: 'flex', gap: '1rem', fontSize: '0.6rem', fontWeight: 700, color: T.dim, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><div style={{ width: 8, height: 8, borderRadius: 2, background: T.cyan }} /> Revenue ($)</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><div style={{ width: 8, height: 8, borderRadius: 2, background: T.bgHighest }} /> Service Count</span>
              </div>
            </div>
            <div style={{ height: 180, display: 'flex', alignItems: 'flex-end', gap: '3rem', padding: '0 1rem' }}>
              {BAR_WEEKS.map((w, i) => (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, height: '100%' }}>
                  <div style={{ width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'flex-end', gap: 4, flex: 1 }}>
                    <div style={{ width: 14, background: T.cyan, borderRadius: '4px 4px 0 0', height: w.rev, transition: 'height 0.3s' }} />
                    <div style={{ width: 14, background: T.bgHighest, borderRadius: '4px 4px 0 0', height: w.svc, transition: 'height 0.3s' }} />
                  </div>
                  <span style={{ fontSize: '0.55rem', fontWeight: 700, color: T.dim, letterSpacing: '0.1em', textTransform: 'uppercase' }}>WEEK {String(i + 1).padStart(2, '0')}</span>
                </div>
              ))}
            </div>
          </div>

          {/* live port activity map */}
          <div style={{ ...gc(), borderRadius: 24, height: 460, position: 'relative', overflow: 'hidden', marginBottom: '1.5rem' }}>
            {/* overlay info top-left */}
            <div style={{ position: 'absolute', top: 24, left: 24, zIndex: 10, background: 'rgba(8,15,24,0.8)', ...blur(), padding: '1rem 1.25rem', borderRadius: 12 }}>
              <h3 style={{ fontFamily: T.manrope, fontWeight: 700, fontSize: '1.05rem', color: '#f8fafc', margin: '0 0 4px' }}>Live Port Activity</h3>
              <p style={{ fontSize: '0.6rem', fontWeight: 700, color: T.cyan, textTransform: 'uppercase', letterSpacing: '0.15em', display: 'flex', alignItems: 'center', gap: 6, margin: 0 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: T.cyan, display: 'inline-block', animation: 'pulse 2s infinite' }} />
                14 Active Hubs Monitored
              </p>
            </div>
            {/* overlay stats bottom-right */}
            <div style={{ position: 'absolute', bottom: 24, right: 24, zIndex: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[{ label: 'Rotterdam Hub', vol: '4.2k Daily Vol' }, { label: 'Singapore Terminal', vol: '8.9k Daily Vol' }].map(({ label, vol }) => (
                <div key={label} style={{ background: 'rgba(8,15,24,0.8)', ...blur(), padding: '0.5rem 0.875rem', borderRadius: 8, display: 'flex', justifyContent: 'space-between', gap: '2rem', fontSize: '0.7rem' }}>
                  <span style={{ color: T.text }}>{label}</span>
                  <span style={{ color: T.cyan, fontWeight: 700 }}>{vol}</span>
                </div>
              ))}
            </div>
            {/* map bg */}
            <img src={MAP} alt="World map" style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'grayscale(100%) brightness(0.45) contrast(1.2)', opacity: 0.4 }} />
            {/* glowing dots */}
            {[{ t:'35%',l:'48%',size:12,color:T.cyan },{ t:'45%',l:'75%',size:12,color:T.cyan },{ t:'52%',l:'82%',size:14,color:T.primary },{ t:'38%',l:'80%',size:12,color:T.cyan },{ t:'60%',l:'12%',size:8,color:T.cyan }].map((d, i) => (
              <div key={i} style={{ position: 'absolute', top: d.t, left: d.l, width: d.size, height: d.size, borderRadius: '50%', background: d.color, boxShadow: `0 0 14px ${d.color}`, zIndex: 5 }} />
            ))}
          </div>

          {/* bottom row: top services + provider performance */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>

            {/* top services */}
            <div style={{ ...gc(), borderRadius: 24, padding: '2rem' }}>
              <h3 style={{ fontFamily: T.manrope, fontWeight: 700, fontSize: '1.1rem', color: '#f8fafc', margin: '0 0 1.5rem' }}>Top Performing Services</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {TOP_SERVICES.map(s => (
                  <div key={s.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem', background: 'rgba(8,15,24,0.25)', borderRadius: 16, transition: 'background 0.2s', cursor: 'default' }}
                    onMouseEnter={e => (e.currentTarget.style.background = T.bgHighest)} onMouseLeave={e => (e.currentTarget.style.background = 'rgba(8,15,24,0.25)')}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: '1.3rem', color: T.primary }}>{s.icon}</span>
                      <div>
                        <p style={{ fontSize: '0.875rem', fontWeight: 700, color: '#f8fafc', margin: '0 0 2px' }}>{s.name}</p>
                        <p style={{ fontSize: '0.65rem', color: T.dim, margin: 0 }}>{s.sub}</p>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <p style={{ fontSize: '0.75rem', fontWeight: 900, color: T.cyan, margin: '0 0 4px' }}>{s.jobs}</p>
                      <div style={{ width: 80, height: 4, background: T.bgHighest, borderRadius: 4, overflow: 'hidden' }}>
                        <div style={{ height: '100%', background: T.cyan, width: s.pct, borderRadius: 4 }} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* provider performance */}
            <div style={{ ...gc(), borderRadius: 24, padding: '2rem' }}>
              <h3 style={{ fontFamily: T.manrope, fontWeight: 700, fontSize: '1.1rem', color: '#f8fafc', margin: '0 0 1.5rem' }}>Provider Performance</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                {PROVIDERS.map(p => (
                  <div key={p.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <div style={{ width: 40, height: 40, borderRadius: 10, background: T.bgHighest, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: T.manrope, fontWeight: 900, fontSize: '0.75rem', color: p.color, flexShrink: 0 }}>{p.initials}</div>
                      <div>
                        <p style={{ fontSize: '0.875rem', fontWeight: 700, color: '#f8fafc', margin: '0 0 3px' }}>{p.name}</p>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: '0.65rem', color: T.cyan, display: 'flex', alignItems: 'center', gap: 3 }}>
                            <span className="material-symbols-outlined" style={{ fontSize: '0.65rem', fontVariationSettings: "'FILL' 1" }}>star</span>{p.rating}
                          </span>
                          <span style={{ fontSize: '0.65rem', color: T.dim }}>• {p.completion} Completion Rate</span>
                        </div>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <p style={{ fontSize: '0.55rem', fontWeight: 700, color: T.dim, textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 2px' }}>Avg Response</p>
                      <p style={{ fontFamily: T.manrope, fontWeight: 900, fontSize: '0.9rem', color: T.primary, margin: 0, letterSpacing: '-0.02em' }}>{p.response}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

        </div>
      </main>
    </div>
  );
};

export default AnalyticsDashboard;
