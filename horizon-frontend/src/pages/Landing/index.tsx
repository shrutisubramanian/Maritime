import React from 'react';
import { useNavigate } from 'react-router-dom';

const HERO_IMG = 'https://lh3.googleusercontent.com/aida-public/AB6AXuBRTPSZ_hoSpi89EeKpQNvDJJm9ZyQTyNYIYYfRZfMN3KtcrnoDJ1YUwu9StxwuvHLoM5DwXGvedrHecXvLyN8PDeA-2XnZjwaJxAubBHxbD6EQb94YXf3seUANk7v8ptUC1xjMdkjbs6WXNAUvqeGusnj4oMlI91ffyuyDiuDoWVk0Q2E52mbPEQPcFU_rkhPurUOxri6DCEGe3bF833kY1IDlBvA7VeLLJ47hZjwXCXEHLLLY2NUZu58XNPSyOQ4fEQzKlQxSXtbI';
const MAP_IMG  = 'https://lh3.googleusercontent.com/aida-public/AB6AXuDxnF2Z5U2-JMxTfzJwfPvoWWEjynzkWRn2wTd9eKjwvp5BoUyu51GTO_vbD9kZBrreyM1jc0ciSvL4JYHEaLjK3SgjPp7NsLyKjVIu2dTMfzicEys2-AUIPA0npHG81apiIrW5u0rRe8jx_TtrAcrOOg4yq7ROPNQl0GML6Ays33kzn0AzaN0DkgO6WK37NjpRjrFTYJvG3ZHGd2w8N1sMG0QI-7N7D1vAQJViMZIhoC6QeTQZIK0Z4f2a5XgwBrNCq5ib-A7Fw6XO';
const USR1_IMG = 'https://lh3.googleusercontent.com/aida-public/AB6AXuD-asY92nYtxQWtkQtOyotF2YSVo08sPAsOqGpiIgF_jc7CMtAmHEzHzcjPvRXLsIZxmwRCl-9_4V5YFmUpbXZP-IDruyEF9wm99rcH4l8o-F4-EhPff7yUq6BSkbtnZWmL7G2--VFB0w5RMlPryBIrpefKWeRVWMFH0Mi8I1Ud45Hqu9HbB01nI1ynxxRKbrBgyRoetkywsvM7fSc3Um2fYykRAzfy8FQTvFkNjryYlwA4y4Sex0ZaranfDi-gpR0mUyGUytu5n5oc';
const USR2_IMG = 'https://lh3.googleusercontent.com/aida-public/AB6AXuCD5efQ-7mPKt_9VIMAXAyHUDC7XKmAdShAA_8eNbEJWNC4cymtJ9H4YQGAx62N0ZGXREwHoLw7rRZbS8K-1O1SNzvL7EAQAj7YaunhLTEK9m-E4VR9j08ot2UYyYD1I-4_o5zfey-XGNHjV5oPEwCW-bEN1xFB-qwfVkVTsLZmZz-9TYf4DIP56VI8KmyX3HpAEydhAXB6FqiHP2ySS5elzmNMokKWWUYzRoOMQhAUyH6xfBOH_BcF5Q1ZAS9zxoDX1YYf3JsY-dW6';
const PROF_IMG = 'https://lh3.googleusercontent.com/aida-public/AB6AXuCeiNNnwQEuuRxgyvPYkLmQiqfqmEy3UqcDNkctVYRWkMtNv9PKVKvpE8t8KgVH-W6oEdEDFbWzKYvvUuwYQvjPJOaZjrOlUO_LaJas63gXsY4YLCoMgUfjxPi5dJ3HWBuztfOE-nthHCGdM-LymxYmh0FjTslL8DLhAD60XwOvtRIRUFdPIdB3AOf_KShB2XuO9JdguUX2pIzmsIJyiscQQ_PeXTVhla8qo4H70g-OJ0R9zB7NN3xqS95oTvvJV_RoajBOZvbDu6J9';

/* ─── shared style tokens ─────────────────────────────────────── */
const C = {
  bg:           '#0d141d',
  bgLow:        '#080f18',
  bgCard:       '#242a34',
  bgCardHover:  '#333a44',
  glass:        'rgba(46,53,63,0.45)',
  border:       'rgba(68,71,77,0.18)',
  borderW:      'rgba(255,255,255,0.08)',
  cyan:         '#22d3ee',
  cyanDim:      'rgba(34,211,238,0.12)',
  primary:      '#9ccaff',
  primaryDim:   'rgba(156,202,255,0.12)',
  muted:        '#c4c6ce',
  faint:        '#64748b',
  white:        '#ffffff',
};

const blur = (px = 20): React.CSSProperties => ({
  backdropFilter: `blur(${px}px)`,
  WebkitBackdropFilter: `blur(${px}px)`,
});

const manrope: React.CSSProperties = { fontFamily: "'Manrope', sans-serif" };
const inter:   React.CSSProperties = { fontFamily: "'Inter', sans-serif" };

const glassCard: React.CSSProperties = {
  background: C.glass,
  ...blur(20),
  boxShadow: '0 20px 40px rgba(0,209,255,0.07)',
};

/* ─── component ──────────────────────────────────────────────── */
export default function LandingPage() {
  const navigate = useNavigate();

  return (
    <div style={{ background: C.bg, color: C.muted, ...inter, minHeight: '100vh' }}>

      {/* ══ HEADER ══════════════════════════════════════════════ */}
      <header style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50,
        height: 72,
        background: 'rgba(8,15,24,0.65)',
        ...blur(24),
        borderBottom: `1px solid ${C.border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 2.5rem',
      }}>
        {/* left */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
          <span style={{ ...manrope, fontWeight: 900, fontSize: '1.35rem', color: C.white, letterSpacing: '-0.04em' }}>
            HORIZON
          </span>
          <nav style={{ display: 'flex', gap: '1.5rem' }}>
            {[
              { label: 'Marketplace', path: '/marketplace' },
              { label: 'Vessels',     path: '/dashboard' },
              { label: 'Contracts',   path: '/dashboard' },
              { label: 'Logistics',   path: '/dashboard' },
            ].map((item, i) => (
              <a key={item.label} href="#" onClick={e => { e.preventDefault(); navigate(item.path); }} style={{
                ...manrope, fontSize: '0.85rem', letterSpacing: '-0.01em',
                color: i === 0 ? C.cyan : '#94a3b8',
                borderBottom: i === 0 ? `2px solid ${C.cyan}` : 'none',
                paddingBottom: i === 0 ? 2 : 0,
                textDecoration: 'none',
                cursor: 'pointer',
              }}>{item.label}</a>
            ))}
          </nav>
        </div>

        {/* right */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ position: 'relative' }}>
            <span className="material-symbols-outlined" style={{
              position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
              color: '#64748b', fontSize: '1rem',
            }}>search</span>
            <input
              type="text"
              placeholder="Search operations..."
              style={{
                ...inter,
                background: C.bgLow,
                border: 'none',
                borderBottom: `2px solid ${C.border}`,
                borderRadius: '6px 6px 0 0',
                padding: '8px 14px 8px 34px',
                width: 240,
                fontSize: '0.8rem',
                color: '#cbd5e1',
                outline: 'none',
              }}
            />
          </div>
          {['notifications', 'anchor'].map(icon => (
            <button key={icon} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, color: '#64748b' }}
              onMouseEnter={e => (e.currentTarget.style.color = C.cyan)}
              onMouseLeave={e => (e.currentTarget.style.color = '#64748b')}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '1.3rem' }}>{icon}</span>
            </button>
          ))}
          <img src={PROF_IMG} alt="Profile" onClick={() => navigate('/company-profile')} style={{ width: 36, height: 36, borderRadius: '50%', border: `1px solid ${C.border}`, cursor: 'pointer' }} />
        </div>
      </header>

      <main style={{ paddingTop: 72 }}>

        {/* ══ HERO ════════════════════════════════════════════════ */}
        <section style={{ position: 'relative', minHeight: 860, display: 'flex', alignItems: 'center', overflow: 'hidden' }}>
          {/* bg image + overlays */}
          <div style={{ position: 'absolute', inset: 0 }}>
            <img src={HERO_IMG} alt="Container ship" style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'grayscale(100%)', opacity: 0.38 }} />
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to right, #0d141d 35%, rgba(13,20,29,0.75) 60%, transparent)' }} />
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, transparent 55%, #0d141d)' }} />
          </div>

          {/* content */}
          <div style={{ position: 'relative', zIndex: 2, maxWidth: 1200, margin: '0 auto', padding: '0 2.5rem', width: '100%' }}>
            <div style={{ maxWidth: 640 }}>
              <span style={{
                display: 'inline-block',
                padding: '6px 14px',
                borderRadius: 999,
                background: C.cyanDim,
                color: C.cyan,
                fontSize: '0.65rem',
                fontWeight: 700,
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                marginBottom: '1.5rem',
                ...inter,
              }}>
                Infrastructure for the Blue Economy
              </span>

              <h1 style={{
                ...manrope,
                fontWeight: 900,
                fontSize: 'clamp(3rem, 7vw, 5.5rem)',
                color: C.white,
                letterSpacing: '-0.04em',
                lineHeight: 0.92,
                marginBottom: '1.5rem',
              }}>
                Powering Global<br />
                <span style={{ color: C.cyan }}>Maritime</span><br />
                Operations.
              </h1>

              <p style={{ fontSize: '1rem', color: C.muted, lineHeight: 1.7, marginBottom: '2rem', maxWidth: 480 }}>
                The definitive operating system for international logistics. Secure vessel management,
                verified provider networks, and real-time telemetry delivered through a single glass pane.
              </p>

              <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                <button onClick={() => navigate('/marketplace')} style={{
                  padding: '12px 28px',
                  background: 'linear-gradient(135deg, #9ccaff, #a6c9fa)',
                  color: '#001d35',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  border: 'none',
                  borderRadius: 10,
                  cursor: 'pointer',
                  boxShadow: '0 8px 24px rgba(156,202,255,0.25)',
                }}>Explore Services</button>
                <button onClick={() => navigate('/choose-role')} style={{
                  padding: '12px 28px',
                  background: C.glass,
                  ...blur(),
                  color: C.white,
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  border: `1px solid ${C.borderW}`,
                  borderRadius: 10,
                  cursor: 'pointer',
                }}>Get Started</button>
              </div>
            </div>
          </div>
        </section>

        {/* ══ STATS ═══════════════════════════════════════════════ */}
        <section style={{
          background: C.bgLow,
          borderTop: `1px solid ${C.border}`,
          borderBottom: `1px solid ${C.border}`,
          padding: '3rem 0',
        }}>
          <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 2.5rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '2rem' }}>
              {[
                { val: '240+',  label: 'Active Global Ports',  color: C.white },
                { val: '1,500+', label: 'Verified Providers',   color: C.cyan  },
                { val: '50k+',  label: 'Jobs Completed',       color: C.white },
              ].map(s => (
                <div key={s.label}>
                  <div style={{ ...manrope, fontWeight: 900, fontSize: '3rem', color: s.color, lineHeight: 1.1 }}>{s.val}</div>
                  <div style={{ ...inter, fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#94a3b8', marginTop: 4 }}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ══ FEATURES ════════════════════════════════════════════ */}
        <section style={{ background: C.bg, padding: '6rem 0', position: 'relative', overflow: 'hidden' }}>
          {/* ambient glow */}
          <div style={{ position: 'absolute', top: 0, right: 0, width: '35%', height: '100%', background: 'rgba(34,211,238,0.04)', filter: 'blur(120px)', pointerEvents: 'none' }} />

          <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 2.5rem', position: 'relative' }}>
            {/* section heading */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '4rem', gap: '2rem' }}>
              <div style={{ maxWidth: 560 }}>
                <h2 style={{ ...manrope, fontWeight: 900, fontSize: 'clamp(1.8rem, 3.5vw, 2.8rem)', color: C.white, letterSpacing: '-0.03em', marginBottom: '1rem' }}>
                  Built for the Depths of<br />Modern Trade
                </h2>
                <p style={{ color: '#94a3b8', fontSize: '0.95rem', lineHeight: 1.7 }}>
                  We solve the structural inefficiencies of the sea through advanced telemetry and cryptographic trust protocols.
                </p>
              </div>
              <span className="material-symbols-outlined" style={{ color: C.cyan, fontSize: '3.5rem', opacity: 0.18, flexShrink: 0 }}>hub</span>
            </div>

            {/* cards */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>

              {/* Verified Trust */}
              <div style={{ ...glassCard, borderRadius: 24, padding: '2.5rem' }}>
                <div style={{ display: 'inline-flex', padding: '0.75rem', borderRadius: 14, background: C.cyanDim, marginBottom: '1.5rem' }}>
                  <span className="material-symbols-outlined" style={{ color: C.cyan, fontSize: '2rem', fontVariationSettings: "'FILL' 1" }}>verified_user</span>
                </div>
                <h3 style={{ ...manrope, fontWeight: 700, fontSize: '1.5rem', color: C.white, marginBottom: '0.75rem' }}>Verified Trust</h3>
                <p style={{ color: '#94a3b8', fontSize: '0.9rem', lineHeight: 1.75, marginBottom: '1.5rem' }}>
                  Every provider in our network undergoes a rigorous 12-point authentication process, ensuring compliance with international maritime standards and safety regulations.
                </p>
                <div
                  onClick={() => navigate('/dashboard')}
                  onMouseEnter={e => (e.currentTarget.style.transform = 'translateX(6px)')}
                  onMouseLeave={e => (e.currentTarget.style.transform = 'translateX(0)')}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, color: C.cyan, fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', transition: 'transform 0.2s ease' }}
                >
                  <span>Learn about Compliance</span>
                  <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>arrow_forward</span>
                </div>
              </div>

              {/* Real-time Logistics */}
              <div style={{ background: C.bgCard, borderRadius: 24, padding: '2.5rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ display: 'inline-flex', padding: '0.75rem', borderRadius: 14, background: C.primaryDim, marginBottom: '1.5rem' }}>
                    <span className="material-symbols-outlined" style={{ color: C.primary, fontSize: '2rem' }}>monitoring</span>
                  </div>
                  <h3 style={{ ...manrope, fontWeight: 700, fontSize: '1.5rem', color: C.white, marginBottom: '0.75rem' }}>Real-time Logistics</h3>
                  <p style={{ color: '#94a3b8', fontSize: '0.9rem', lineHeight: 1.75 }}>
                    Live telemetry syncing from vessel AIS to ground operations without the 15-minute latency typical of legacy systems.
                  </p>
                </div>
                <div style={{ display: 'flex', marginTop: '2rem' }}>
                  {[USR1_IMG, USR2_IMG].map((src, i) => (
                    <img key={i} src={src} alt="User" style={{ width: 40, height: 40, borderRadius: '50%', border: `3px solid ${C.bgCard}`, marginLeft: i > 0 ? -12 : 0 }} />
                  ))}
                  <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(34,211,238,0.18)', border: `3px solid ${C.bgCard}`, marginLeft: -12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', fontWeight: 700, color: C.cyan }}>+12</div>
                </div>
              </div>

              {/* Global Infrastructure — full width */}
              <div style={{ ...glassCard, borderRadius: 24, padding: '2.5rem', gridColumn: '1 / -1', display: 'flex', gap: '3rem', alignItems: 'center' }}>
                <div style={{ flex: 1 }}>
                  <h3 style={{ ...manrope, fontWeight: 700, fontSize: '1.5rem', color: C.white, marginBottom: '0.75rem' }}>Global Infrastructure</h3>
                  <p style={{ color: '#94a3b8', fontSize: '0.9rem', lineHeight: 1.75, marginBottom: '1.5rem', maxWidth: 480 }}>
                    Deploy resources across continents. Our API connects port authority data with private terminal operators, bridging the gap between national infrastructure and commercial speed.
                  </p>
                  <button style={{ background: 'none', border: 'none', borderBottom: `2px solid ${C.cyan}`, padding: '8px 0', color: C.cyan, fontWeight: 700, fontSize: '0.7rem', letterSpacing: '0.18em', textTransform: 'uppercase', cursor: 'pointer', ...inter }}>
                    View Network Map
                  </button>
                </div>

                {/* map */}
                <div style={{ flex: 1, position: 'relative', height: 220, borderRadius: 16, overflow: 'hidden' }}>
                  <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, #0d141d 10%, transparent)', zIndex: 2 }} />
                  <img src={MAP_IMG} alt="World map" style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'grayscale(100%) contrast(1.3)', opacity: 0.28 }} />
                  {/* dots */}
                  <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 12, height: 12, borderRadius: '50%', background: C.cyan, zIndex: 3, boxShadow: `0 0 12px ${C.cyan}` }} className="animate-ping" />
                  <div style={{ position: 'absolute', top: '32%', left: '26%', width: 7, height: 7, borderRadius: '50%', background: C.cyan, zIndex: 3, boxShadow: `0 0 8px ${C.cyan}` }} />
                  <div style={{ position: 'absolute', bottom: '28%', right: '30%', width: 7, height: 7, borderRadius: '50%', background: C.cyan, zIndex: 3, boxShadow: `0 0 8px ${C.cyan}` }} />
                </div>
              </div>

            </div>
          </div>
        </section>

        {/* ══ CTA ═════════════════════════════════════════════════ */}
        <section style={{ background: C.bgLow, padding: '5rem 0', overflow: 'hidden' }}>
          <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 2.5rem' }}>
            <div style={{
              background: 'linear-gradient(135deg, #00203a 0%, #1a2232 100%)',
              borderRadius: 40,
              padding: 'clamp(2.5rem, 5vw, 5rem)',
              position: 'relative',
              overflow: 'hidden',
            }}>
              {/* glow orb */}
              <div style={{ position: 'absolute', bottom: '-5rem', right: '-5rem', width: '22rem', height: '22rem', background: 'rgba(34,211,238,0.09)', filter: 'blur(90px)', borderRadius: '50%', pointerEvents: 'none' }} />

              <div style={{ position: 'relative', zIndex: 2, maxWidth: 640 }}>
                <h2 style={{ ...manrope, fontWeight: 900, fontSize: 'clamp(2.4rem, 5.5vw, 4rem)', color: C.white, letterSpacing: '-0.04em', lineHeight: 1.05, marginBottom: '1.25rem' }}>
                  Ready to navigate the{' '}
                  <span style={{ color: C.cyan }}>next era</span>?
                </h2>
                <p style={{ color: '#94a3b8', fontSize: '1rem', lineHeight: 1.75, marginBottom: '2.5rem' }}>
                  Join the network of over 1,500 shipping leaders already optimizing their operations on the Horizon platform.
                </p>
                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                  <button onClick={() => navigate('/choose-role')} style={{ padding: '14px 32px', background: C.white, color: '#0f172a', fontWeight: 700, fontSize: '0.9rem', border: 'none', borderRadius: 14, cursor: 'pointer' }}>
                    Get Started
                  </button>
                  <button onClick={() => navigate('/login')} style={{ padding: '14px 32px', ...glassCard, color: C.white, fontWeight: 700, fontSize: '0.9rem', border: `1px solid rgba(255,255,255,0.15)`, borderRadius: 14, cursor: 'pointer' }}>
                    Schedule a Demo
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

      </main>

      {/* ══ FOOTER ══════════════════════════════════════════════ */}
      <footer style={{ background: 'rgba(2,6,14,0.9)', borderTop: `1px solid ${C.border}`, padding: '4.5rem 0' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 2.5rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 1fr', gap: '3rem' }}>
            <div>
              <div style={{ ...manrope, fontWeight: 900, fontSize: '1.6rem', color: C.white, letterSpacing: '-0.04em' }}>HORIZON</div>
              <p style={{ marginTop: '1rem', color: C.faint, fontSize: '0.85rem', lineHeight: 1.7 }}>
                The global standard for maritime business-to-business infrastructure and logistics orchestration.
              </p>
            </div>
            {[
              { title: 'Solutions',       links: ['Fleet Management','Digital Charters','Bunker Procurement','Port Services'] },
              { title: 'Infrastructure',  links: ['API Documentation','Satellite Telemetry','Edge Nodes','Security Specs'] },
              { title: 'Company',         links: ['About Horizon','Global Network','Contact Operations','Trust Center'] },
            ].map(col => (
              <div key={col.title}>
                <div style={{ ...manrope, fontWeight: 700, fontSize: '0.65rem', letterSpacing: '0.18em', textTransform: 'uppercase', color: C.white, marginBottom: '1.5rem' }}>{col.title}</div>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                  {col.links.map(link => (
                    <li key={link}><a href="#" style={{ color: '#64748b', fontSize: '0.85rem', textDecoration: 'none' }}
                      onMouseEnter={e => (e.currentTarget.style.color = C.cyan)}
                      onMouseLeave={e => (e.currentTarget.style.color = '#64748b')}
                    >{link}</a></li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div style={{ marginTop: '3.5rem', paddingTop: '1.5rem', borderTop: 'rgba(255,255,255,0.05) 1px solid', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
            <p style={{ color: '#334155', fontSize: '0.8rem' }}>© 2024 HORIZON Maritime Systems Inc. All rights reserved.</p>
            <div style={{ display: 'flex', gap: '2rem' }}>
              {['Privacy Policy','Terms of Service','Legal'].map(l => (
                <a key={l} href="#" style={{ color: '#334155', fontSize: '0.8rem', textDecoration: 'none' }}
                  onMouseEnter={e => (e.currentTarget.style.color = C.white)}
                  onMouseLeave={e => (e.currentTarget.style.color = '#334155')}
                >{l}</a>
              ))}
            </div>
          </div>
        </div>
      </footer>

    </div>
  );
}
