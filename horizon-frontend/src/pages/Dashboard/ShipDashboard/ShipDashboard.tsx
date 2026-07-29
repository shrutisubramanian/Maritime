import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../hooks/useAuth';

const T = {
  manrope: "'Manrope', sans-serif" as const,
  inter:   "'Inter', sans-serif"   as const,
  bg:      '#050B14',
  bgNav:   '#0d141d',
  bgCard:  '#19202a',
  bgCardH: '#2e353f',
  bgHigh:  '#242a34',
  bgLow:   '#080f18',
  glass:   'rgba(46,53,63,0.4)',
  border:  'rgba(68,71,77,0.2)',
  borderS: 'rgba(30,41,59,0.3)',
  text:    '#dce3f0',
  muted:   '#c4c6ce',
  dim:     '#8e9098',
  cyan:    '#4cd6ff',
  primary: '#9ccaff',
  secondary:'#a6c9fa',
  error:   '#ffb4ab',
  white:   '#ffffff',
};
const blur = (): React.CSSProperties => ({ backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' });
const glassCard = (): React.CSSProperties => ({ background: T.glass, ...blur(), boxShadow: '0 20px 40px rgba(0,209,255,0.08)', borderRadius: 14 });

const PROF_IMG = 'https://lh3.googleusercontent.com/aida-public/AB6AXuBJY_PjA32Ko7VulMYcqxMnHmbj3LXb58IiAdFSXIRDNPih8MinwSFCmr7NrnxYq_njxUJ0HVJaEysKbJT7hSOeg0hxc9NGga6DbLsKvpdlm-24Ya3xmmz6rIDlifFbVsvSbgI4mIOkTgR6pekZKe1X-yzKA_AC43GQMd68yCSqAeXBxbnJzRADLaMLU0HpROQhVCOakzWMCNkZKrTyLvO9hRqqYuUxvOQiT9A5e9hF8kvhy6eZOF8-y1hggEV-FVZ1v22XDFOnQSIa';

const SUMMARY_CARDS = [
  { icon: 'payments',      iconBg: '#00203a', iconColor: T.primary,   label: 'Total Earnings / Spend',  value: '$428,500.00', badge: '+12.5%' },
  { icon: 'hourglass_top', iconBg: '#00222c', iconColor: T.cyan,      label: 'Pending Payments',         value: '$12,400.00',  badge: null },
  { icon: 'task_alt',      iconBg: '#244872', iconColor: T.secondary, label: 'Completed Transactions',   value: '156',         badge: null },
  { icon: 'trending_up',   iconBg: '#00203a', iconColor: T.primary,   label: 'Monthly Revenue',          value: '$72,440.00',  badge: null, glow: true },
];

const TRANSACTIONS = [
  { icon: 'build',            iconBg: 'rgba(34,211,238,0.1)',  iconColor: T.cyan,   name: 'Hull Maintenance',   vessel: 'Atlantic Pioneer', provider: 'SwiftMarine Services', port: 'Rotterdam, NL',   date: 'Jun 14, 2024', amount: '$24,500.00', status: 'Paid',    sBg: 'rgba(34,211,238,0.1)',  sColor: T.cyan },
  { icon: 'settings_suggest', iconBg: 'rgba(251,146,60,0.1)',  iconColor:'#fb923c', name: 'Engine Repair',      vessel: 'Blue Horizon',     provider: 'Nordic Engineering',   port: 'Singapore, SG',   date: 'Jun 12, 2024', amount: '$12,400.00', status: 'Pending', sBg: 'rgba(68,71,77,0.4)',   sColor: T.muted },
  { icon: 'local_shipping',   iconBg: 'rgba(34,211,238,0.1)',  iconColor: T.cyan,   name: 'Bunkering Services', vessel: 'Sea Stallion',      provider: 'Global Port Fuels',    port: 'Panama City, PA', date: 'Jun 08, 2024', amount: '$68,200.00', status: 'Paid',    sBg: 'rgba(34,211,238,0.1)',  sColor: T.cyan },
  { icon: 'dangerous',        iconBg: 'rgba(147,0,10,0.2)',    iconColor: T.error,  name: 'Emergency Tow',      vessel: 'Arctic Gale',       provider: 'NorthSea Rescue',      port: 'Oslo, NO',        date: 'Jun 01, 2024', amount: '$45,000.00', status: 'Failed',  sBg: 'rgba(147,0,10,0.25)', sColor: T.error },
];

const INVOICES = [
  { month: 'Jun', day: '14', id: 'INV-2024-089', detail: '$24,500.00 • SwiftMarine' },
  { month: 'Jun', day: '08', id: 'INV-2024-072', detail: '$68,200.00 • Global Port' },
  { month: 'May', day: '29', id: 'INV-2024-064', detail: '$11,200.00 • Nordic Eng'  },
];

const SIDEBAR_NAV = [
  { icon: 'dashboard',              label: 'Dashboard',    active: true,  path: '/ship-dashboard' },
  { icon: 'payments',               label: 'Revenue',      active: false, path: '/ship-dashboard' },
  { icon: 'receipt_long',           label: 'Transactions', active: false, path: '/ship-dashboard' },
  { icon: 'account_balance_wallet', label: 'Payments',     active: false, path: '/ship-dashboard' },
  { icon: 'description',            label: 'Contracts',    active: false, path: '/ship-dashboard' },
];

const SNavItem: React.FC<{ icon: string; label: string; active?: boolean; onClick?: () => void }> = ({ icon, label, active, onClick }) => {
  const [hov, setHov] = useState(false);
  return (
    <a href="#" onClick={e => { e.preventDefault(); onClick?.(); }}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem', borderRadius: 10, textDecoration: 'none', transition: 'all 0.2s',
        color: active ? T.cyan : hov ? '#e2e8f0' : '#64748b',
        background: active ? 'rgba(34,211,238,0.08)' : hov ? 'rgba(30,41,59,0.4)' : 'transparent',
        borderRight: active ? `3px solid ${T.cyan}` : '3px solid transparent',
        transform: hov && !active ? 'translateX(3px)' : 'none',
      }}>
      <span className="material-symbols-outlined" style={{ fontSize: '1.2rem' }}>{icon}</span>
      <span style={{ fontFamily: T.inter, fontSize: '0.9rem', fontWeight: active ? 600 : 400 }}>{label}</span>
    </a>
  );
};

export const ShipDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { logout } = useAuth();

  return (
    <div style={{ background: T.bg, color: T.text, fontFamily: T.inter, minHeight: '100vh' }}>

      {/* ── SIDEBAR ── */}
      <aside style={{ position: 'fixed', top: 0, left: 0, bottom: 0, width: 256, zIndex: 50, display: 'flex', flexDirection: 'column', padding: '1.5rem 0', background: T.bgNav, borderRight: `1px solid ${T.borderS}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0 1.5rem', marginBottom: '2.5rem' }}>
          <div style={{ width: 32, height: 32, borderRadius: 6, background: T.primary, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '1.1rem', color: '#001d35' }}>anchor</span>
          </div>
          <div>
            <div style={{ fontFamily: T.manrope, fontWeight: 700, fontSize: '1.05rem', color: '#e2e8f0' }}>Maritime Corp</div>
            <div style={{ fontSize: '0.6rem', color: T.cyan, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase' }}>Premium Tier</div>
          </div>
        </div>
        <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4, padding: '0 1rem' }}>
          {SIDEBAR_NAV.map(item => <SNavItem key={item.label} {...item} onClick={() => navigate(item.path)} />)}
        </nav>
        <div style={{ padding: '1.25rem 1rem 0.5rem' }}>
          <button style={{ width: '100%', padding: '0.75rem', background: 'linear-gradient(to right, #0891b2, #1d4ed8)', color: T.white, fontFamily: T.inter, fontWeight: 600, fontSize: '0.7rem', letterSpacing: '0.05em', textTransform: 'uppercase', border: 'none', borderRadius: 12, cursor: 'pointer' }}>
            Upgrade Fleet
          </button>
        </div>
        <div style={{ padding: '0.5rem 1rem' }}>
          {[{ icon: 'help', label: 'Help Center' }, { icon: 'logout', label: 'Log Out' }].map(({ icon, label }) => (
            <a key={label} href="#" onClick={e => { e.preventDefault(); if (label === 'Log Out') { logout(); navigate('/login'); } }}
              style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.6rem 1rem', color: '#64748b', textDecoration: 'none', fontSize: '0.85rem', transition: 'color 0.2s' }}
              onMouseEnter={e => (e.currentTarget.style.color = '#e2e8f0')} onMouseLeave={e => (e.currentTarget.style.color = '#64748b')}>
              <span className="material-symbols-outlined" style={{ fontSize: '1.1rem' }}>{icon}</span>{label}
            </a>
          ))}
        </div>
      </aside>

      {/* ── RIGHT SIDE ── */}
      <div style={{ marginLeft: 256, display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>

        {/* ── TOP NAV ── */}
        <header style={{ position: 'sticky', top: 0, zIndex: 40, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 2rem', height: 60, background: 'rgba(5,11,20,0.5)', ...blur(), borderBottom: `1px solid ${T.borderS}`, boxShadow: '0 20px 40px rgba(0,209,255,0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '2.5rem' }}>
            <span style={{ fontFamily: T.manrope, fontWeight: 700, fontSize: '1.1rem', color: '#e2e8f0', letterSpacing: '-0.02em' }}>Oceanic Horizon</span>
            <nav style={{ display: 'flex', gap: '1.5rem' }}>
              {[{ l: 'Marketplace', p: '/marketplace' }, { l: 'Vessels', p: '/ship-dashboard' }, { l: 'Logistics', p: '/ship-dashboard' }].map(({ l, p }) => (
                <a key={l} href="#" onClick={e => { e.preventDefault(); navigate(p); }}
                  style={{ fontFamily: T.manrope, fontSize: '0.85rem', fontWeight: 500, color: '#94a3b8', textDecoration: 'none', transition: 'color 0.2s' }}
                  onMouseEnter={e => (e.currentTarget.style.color = T.cyan)} onMouseLeave={e => (e.currentTarget.style.color = '#94a3b8')}>{l}</a>
              ))}
            </nav>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{ display: 'flex', gap: '0.25rem' }}>
              {['notifications', 'settings'].map(icon => (
                <button key={icon} onClick={() => navigate(`/${icon}`)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.5rem', color: '#94a3b8', display: 'flex', transition: 'color 0.2s' }}
                  onMouseEnter={e => (e.currentTarget.style.color = T.cyan)} onMouseLeave={e => (e.currentTarget.style.color = '#94a3b8')}>
                  <span className="material-symbols-outlined" style={{ fontSize: '1.2rem' }}>{icon}</span>
                </button>
              ))}
            </div>
            <button style={{ padding: '0.4rem 1rem', background: 'rgba(34,211,238,0.08)', border: '1px solid rgba(34,211,238,0.25)', color: T.cyan, borderRadius: 8, fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}>Support</button>
            <button style={{ padding: '0.4rem 1.25rem', background: 'linear-gradient(135deg, #06b6d4, #2563eb)', color: T.white, border: 'none', borderRadius: 8, fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer' }}>Create Invoice</button>
            <img src={PROF_IMG} alt="Profile" onClick={() => navigate('/company-profile')} style={{ width: 32, height: 32, borderRadius: '50%', border: '1px solid #334155', objectFit: 'cover', cursor: 'pointer' }} />
          </div>
        </header>

        {/* ── BODY ── */}
        <div style={{ padding: '2rem 2.5rem', maxWidth: 1400, margin: '0 auto', width: '100%', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          <div>
            <p style={{ fontSize: '0.6rem', color: T.muted, letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 4 }}>Financial Overview</p>
            <h2 style={{ fontFamily: T.manrope, fontWeight: 700, fontSize: '1.9rem', color: T.text, letterSpacing: '-0.03em', margin: 0 }}>Maritime Revenue Hub</h2>
          </div>

          {/* summary cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem' }}>
            {SUMMARY_CARDS.map(c => (
              <div key={c.label} style={{ ...glassCard(), padding: '1.5rem', borderBottom: '2px solid transparent', position: 'relative', overflow: 'hidden', transition: 'border-color 0.3s' }}
                onMouseEnter={e => (e.currentTarget.style.borderBottomColor = 'rgba(34,211,238,0.35)')} onMouseLeave={e => (e.currentTarget.style.borderBottomColor = 'transparent')}>
                {c.glow && <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '50%', background: 'linear-gradient(to top, rgba(34,211,238,0.12), transparent)', pointerEvents: 'none' }} />}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                  <div style={{ padding: '0.5rem', borderRadius: 8, background: c.iconBg }}>
                    <span className="material-symbols-outlined" style={{ fontSize: '1.3rem', color: c.iconColor }}>{c.icon}</span>
                  </div>
                  {c.badge && <span style={{ fontSize: '0.65rem', color: T.cyan, fontWeight: 700, padding: '3px 8px', background: 'rgba(34,211,238,0.1)', borderRadius: 999 }}>{c.badge}</span>}
                </div>
                <p style={{ fontSize: '0.8rem', color: T.muted, fontWeight: 500, marginBottom: 4 }}>{c.label}</p>
                <h3 style={{ fontFamily: T.manrope, fontWeight: 700, fontSize: '1.4rem', color: T.text, margin: 0 }}>{c.value}</h3>
              </div>
            ))}
          </div>

          {/* chart + wallet */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '1.5rem' }}>
            <div style={{ ...glassCard(), padding: '2rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '2.5rem' }}>
                <div>
                  <h4 style={{ fontFamily: T.manrope, fontWeight: 700, fontSize: '1.05rem', color: T.text, margin: '0 0 4px' }}>Revenue Performance</h4>
                  <p style={{ fontSize: '0.75rem', color: T.muted, margin: 0 }}>Comparative analysis of last 6 months revenue cycles.</p>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button style={{ padding: '4px 10px', fontSize: '0.7rem', background: T.bgCardH, color: T.text, border: 'none', borderRadius: 6, cursor: 'pointer' }}>6 Months</button>
                  <button style={{ padding: '4px 10px', fontSize: '0.7rem', background: 'transparent', color: T.muted, border: 'none', cursor: 'pointer' }}>1 Year</button>
                </div>
              </div>
              <div style={{ position: 'relative', height: 220 }}>
                <svg width="100%" height="100%" viewBox="0 0 800 200" preserveAspectRatio="none" style={{ overflow: 'visible' }}>
                  <defs>
                    <linearGradient id="sdcg" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor="#9ccaff" stopOpacity="0.3" />
                      <stop offset="100%" stopColor="#9ccaff" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  {[50,100,150].map(y => <line key={y} x1="0" x2="800" y1={y} y2={y} stroke="#44474d" strokeOpacity="0.2" strokeDasharray="4" />)}
                  <path d="M0,180 L100,140 L200,160 L300,100 L400,110 L500,60 L600,80 L700,40 L800,50 L800,200 L0,200 Z" fill="url(#sdcg)" />
                  <path d="M0,180 L100,140 L200,160 L300,100 L400,110 L500,60 L600,80 L700,40 L800,50" fill="none" stroke={T.cyan} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                  <circle cx="500" cy="60" r="4" fill={T.bgNav} stroke={T.cyan} strokeWidth="2" />
                </svg>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1rem', fontSize: '0.65rem', color: T.muted, fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                  {['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug'].map(m => <span key={m}>{m}</span>)}
                </div>
              </div>
            </div>

            {/* wallet */}
            <div style={{ ...glassCard(), padding: '1.75rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h4 style={{ fontFamily: T.manrope, fontWeight: 700, fontSize: '1.05rem', color: T.text, margin: 0 }}>Wallet</h4>
                <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.cyan }}><span className="material-symbols-outlined">add_circle</span></button>
              </div>
              <div style={{ padding: '1.25rem', borderRadius: 12, background: 'linear-gradient(135deg, #1e293b, #0f172a)', border: '1px solid rgba(51,65,85,0.5)', position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', top: 12, right: 12, opacity: 0.3 }}><span className="material-symbols-outlined" style={{ fontSize: '2rem' }}>credit_card</span></div>
                <p style={{ fontSize: '0.6rem', color: T.cyan, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: '0.75rem' }}>Visa Business</p>
                <p style={{ fontFamily: T.manrope, fontSize: '1rem', letterSpacing: '0.2em', color: T.text, marginBottom: '0.75rem' }}>•••• •••• •••• 9928</p>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                  <div><p style={{ fontSize: '0.55rem', color: T.muted, textTransform: 'uppercase', marginBottom: 2 }}>Expiry</p><p style={{ fontSize: '0.8rem', fontWeight: 500, color: T.text }}>12 / 26</p></div>
                  <span style={{ padding: '3px 8px', background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 4, fontSize: '0.6rem', color: T.muted }}>Primary</span>
                </div>
              </div>
              <div style={{ padding: '1rem', borderRadius: 12, background: 'rgba(25,32,42,0.6)', border: `1px solid ${T.borderS}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <div style={{ width: 40, height: 26, background: '#1e293b', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.55rem', fontWeight: 700, color: T.muted }}>MC</div>
                  <div>
                    <p style={{ fontSize: '0.85rem', fontWeight: 500, color: T.text, margin: 0 }}>Mastercard Gold</p>
                    <p style={{ fontSize: '0.75rem', color: T.muted, margin: 0 }}>•••• 4410</p>
                  </div>
                </div>
                <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.muted }}><span className="material-symbols-outlined">more_vert</span></button>
              </div>
              <button style={{ width: '100%', padding: '0.75rem', background: T.bgCardH, border: `1px solid ${T.border}`, color: T.text, fontFamily: T.inter, fontWeight: 600, fontSize: '0.85rem', borderRadius: 10, cursor: 'pointer' }}>Add New Method</button>
            </div>
          </div>

          {/* transactions */}
          <div style={{ ...glassCard(), overflow: 'hidden' }}>
            <div style={{ padding: '1.5rem 2rem', borderBottom: `1px solid ${T.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h4 style={{ fontFamily: T.manrope, fontWeight: 700, fontSize: '1.05rem', color: T.text, margin: '0 0 4px' }}>Recent Transactions</h4>
                <p style={{ fontSize: '0.75rem', color: T.muted, margin: 0 }}>Comprehensive history of fleet service expenditures.</p>
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                <div style={{ position: 'relative' }}>
                  <span className="material-symbols-outlined" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: '1rem', color: T.muted, pointerEvents: 'none' }}>search</span>
                  <input type="text" placeholder="Filter transactions..." style={{ paddingLeft: 34, paddingRight: 14, paddingTop: 8, paddingBottom: 8, background: T.bgLow, border: 'none', borderBottom: `2px solid ${T.border}`, color: T.text, fontFamily: T.inter, fontSize: '0.75rem', width: 220, outline: 'none' }} />
                </div>
                <button style={{ padding: '0.5rem', background: T.bgHigh, border: `1px solid ${T.border}`, borderRadius: 8, cursor: 'pointer', color: T.muted, display: 'flex', alignItems: 'center' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '1.2rem' }}>filter_list</span>
                </button>
              </div>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ background: T.bgNav, fontSize: '0.6rem', color: T.muted, textTransform: 'uppercase', letterSpacing: '0.15em', fontWeight: 700 }}>
                    {['Service','Party','Port','Date','Amount','Status'].map((h, i) => (
                      <th key={h} style={{ padding: '0.9rem 2rem', textAlign: i >= 4 ? 'right' : 'left', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {TRANSACTIONS.map((tx, i) => (
                    <tr key={i} style={{ borderTop: `1px solid ${T.border}`, transition: 'background 0.2s' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(46,53,63,0.25)')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                      <td style={{ padding: '1.25rem 2rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          <div style={{ width: 32, height: 32, borderRadius: 8, background: tx.iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <span className="material-symbols-outlined" style={{ fontSize: '1.1rem', color: tx.iconColor }}>{tx.icon}</span>
                          </div>
                          <span style={{ fontSize: '0.875rem', fontWeight: 500, color: T.text, whiteSpace: 'nowrap' }}>{tx.name}</span>
                        </div>
                      </td>
                      <td style={{ padding: '1.25rem 2rem' }}>
                        <div style={{ fontSize: '0.875rem', fontWeight: 500, color: T.text }}>{tx.vessel}</div>
                        <div style={{ fontSize: '0.65rem', color: T.muted }}>{tx.provider}</div>
                      </td>
                      <td style={{ padding: '1.25rem 2rem', fontSize: '0.875rem', color: T.muted, whiteSpace: 'nowrap' }}>{tx.port}</td>
                      <td style={{ padding: '1.25rem 2rem', fontSize: '0.875rem', color: T.muted, whiteSpace: 'nowrap' }}>{tx.date}</td>
                      <td style={{ padding: '1.25rem 2rem', textAlign: 'right', fontFamily: T.manrope, fontWeight: 700, fontSize: '0.9rem', color: T.text, whiteSpace: 'nowrap' }}>{tx.amount}</td>
                      <td style={{ padding: '1.25rem 2rem', textAlign: 'right' }}>
                        <span style={{ padding: '3px 10px', background: tx.sBg, color: tx.sColor, fontSize: '0.6rem', fontWeight: 700, borderRadius: 999, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{tx.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* invoices */}
          <div style={{ ...glassCard(), padding: '1.75rem 2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h4 style={{ fontFamily: T.manrope, fontWeight: 700, fontSize: '1.05rem', color: T.text, margin: 0 }}>Recent Invoices</h4>
              <button style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 700, color: T.cyan }}>View All Archive</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
              {INVOICES.map(inv => (
                <div key={inv.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', background: T.bgCard, borderRadius: 12, border: `1px solid ${T.border}`, transition: 'border-color 0.2s' }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(34,211,238,0.2)')} onMouseLeave={e => (e.currentTarget.style.borderColor = T.border)}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ width: 48, height: 48, background: T.bgCardH, borderRadius: 8, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>
                      <span style={{ fontSize: '0.55rem', fontWeight: 700, color: T.muted, textTransform: 'uppercase' }}>{inv.month}</span>
                      <span style={{ fontFamily: T.manrope, fontWeight: 700, fontSize: '1.1rem', color: T.text }}>{inv.day}</span>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.875rem', fontWeight: 700, color: T.text }}>{inv.id}</div>
                      <div style={{ fontSize: '0.65rem', color: T.muted }}>{inv.detail}</div>
                    </div>
                  </div>
                  <button style={{ padding: '0.5rem', borderRadius: 8, background: 'none', border: 'none', cursor: 'pointer', color: T.muted, transition: 'color 0.2s, background 0.2s' }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(34,211,238,0.1)'; e.currentTarget.style.color = T.cyan; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = T.muted; }}>
                    <span className="material-symbols-outlined" style={{ fontSize: '1.2rem' }}>download</span>
                  </button>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

export default ShipDashboard;
