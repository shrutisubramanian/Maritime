import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { documentsService } from '../../../services/documents';

/* ── Tokens ── */
const C = {
  bg:       '#0d141d',
  bgCard:   '#19202a',
  bgCardH:  '#242a34',
  bgHigh:   '#2e353f',
  bgBright: '#333a44',
  bgLowest: '#080f18',
  bgLow:    '#151c26',
  border:   'rgba(68,71,77,0.15)',
  borderV:  'rgba(68,71,77,0.3)',
  text:     '#dce3f0',
  muted:    '#c4c6ce',
  dim:      '#8e9098',
  slate:    '#64748b',
  cyan:     '#4cd6ff',
  primary:  '#9ccaff',
  primCont: '#00203a',
  secondary:'#a6c9fa',
  terCont:  '#00222c',
  error:    '#ffb4ab',
  white:    '#ffffff',
};
const fonts = { manrope: "'Manrope', sans-serif", inter: "'Inter', sans-serif" };
const blur = (): React.CSSProperties => ({ backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' });

const PROF_IMG = 'https://lh3.googleusercontent.com/aida-public/AB6AXuAO8ljqlvLx15UuNrHjnbb-nqCSFThCnawPCu6z956HFbdmORHXSOe_rEf9JGLADpWCg_7k1GcOyEDJJs4-toEg21JWIFMkvunkfiDwlGOvOXyTu7DcErpl1DRxvqtXEb2YMMAJ4Nex5iOPyiE77ci2PjO1KSAWs7oTZNPusu9T9k2Y137lOfuaiynUqw1bGwrDeXM4QZntpSS7AOWcJxILcDSjqjE2NKGc5Hr_55BRkLxK0MkW7AZa5RoBHyiSVznHSSeUz_XoRmOy';

const STEPS = [
  { n: 1, label: 'Profile',       sub: 'Vessel identity established',    done: true,  active: false },
  { n: 2, label: 'Documentation', sub: 'Upload active certifications',   done: false, active: true  },
  { n: 3, label: 'Verification',  sub: 'Awaiting ledger confirmation',   done: false, active: false },
];

const LIVE_STATUS = [
  { label: 'Certificate of Registry', status: 'VERIFIED', color: C.cyan,      pulse: true  },
  { label: 'Safety Management',       status: 'PENDING',  color: C.secondary, pulse: false },
];

const REQUIREMENTS = [
  { icon: 'description', iconColor: C.cyan,    badgeBg: C.terCont,  badgeColor: C.cyan,    title: 'International Tonnage',  desc: 'Proof of vessel dimensions and cargo capacity metrics.' },
  { icon: 'security',    iconColor: C.primary,  badgeBg: C.primCont, badgeColor: C.primary, title: 'ISPS Certification',      desc: 'Compliance with International Ship and Port Facility Security.' },
];


export const Verification: React.FC = () => {
  const navigate = useNavigate();
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (files: FileList) => {
    try {
      setUploading(true);
      let lastStatus = "";
      for (let i = 0; i < files.length; i++) {
        const response = await documentsService.uploadDocument(files[i], { document_type: 'verification' });
        lastStatus = response.status || "Document uploaded successfully";
      }
      alert(lastStatus);
    } catch (e) {
      console.error(e);
      alert('Failed to upload documents.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div style={{ background: C.bg, color: C.text, fontFamily: fonts.inter, minHeight: '100vh', overflowX: 'hidden' }}>

      {/* ── TOP NAV ── */}
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50, height: 80,
        background: 'rgba(15,23,36,0.4)', ...blur(),
        backgroundImage: 'linear-gradient(to bottom, rgba(255,255,255,0.05), transparent)',
        boxShadow: '0 20px 40px rgba(0,209,255,0.08)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '0 2rem',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
          <span style={{ fontFamily: fonts.manrope, fontWeight: 900, fontSize: '1.4rem', color: C.white, letterSpacing: '-0.04em' }}>HORIZON</span>
          <div style={{ display: 'flex', gap: '1.5rem' }}>
            {['Marketplace','Vessels','Contracts','Logistics'].map(l => (
              <a key={l} href="#" onClick={e => { e.preventDefault(); if (l === 'Marketplace') navigate('/marketplace'); }}
                style={{ fontFamily: fonts.manrope, fontSize: '0.9rem', color: C.slate, textDecoration: 'none', letterSpacing: '-0.01em', transition: 'color 0.2s' }}
                onMouseEnter={e => (e.currentTarget.style.color = C.white)} onMouseLeave={e => (e.currentTarget.style.color = C.slate)}>{l}</a>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {['notifications','anchor'].map(icon => (
            <span key={icon} className="material-symbols-outlined" style={{ color: C.muted, cursor: 'pointer', transition: 'color 0.2s', fontSize: '1.4rem' }}
              onMouseEnter={e => (e.currentTarget.style.color = C.white)} onMouseLeave={e => (e.currentTarget.style.color = C.muted)}>{icon}</span>
          ))}
          <div style={{ width: 40, height: 40, borderRadius: '50%', overflow: 'hidden', border: `1px solid ${C.borderV}` }}>
            <img src={PROF_IMG} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover', cursor: 'pointer' }} onClick={() => navigate('/company-profile')} />
          </div>
        </div>
      </nav>


      {/* ── MAIN GRID ── */}
      <main style={{ minHeight: '100vh', paddingTop: 128, paddingBottom: 80, padding: '128px 2rem 80px', maxWidth: 1280, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '2rem', alignItems: 'start' }}>

        {/* ── LEFT SIDEBAR ── */}
        <aside style={{ display: 'flex', flexDirection: 'column', gap: '2rem', position: 'sticky', top: 112 }}>

          {/* Heading */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <span style={{ fontSize: '0.65rem', color: C.muted, textTransform: 'uppercase', letterSpacing: '0.2em', fontWeight: 500, opacity: 0.7 }}>Onboarding Phase 02</span>
            <h1 style={{ fontFamily: fonts.manrope, fontWeight: 800, fontSize: 'clamp(1.8rem,3vw,2.25rem)', color: C.white, letterSpacing: '-0.04em', margin: 0, lineHeight: 1.15 }}>Trust is our<br />primary anchor.</h1>
            <p style={{ fontSize: '0.9rem', color: C.muted, lineHeight: 1.7, margin: 0 }}>
              To maintain the integrity of the HORIZON ecosystem, we require verified maritime documentation for every vessel in your fleet. Our automated systems cross-reference these with global port authorities and IMO databases.
            </p>
          </div>

          {/* Stepper */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0, paddingTop: '0.5rem' }}>
            {STEPS.map((s, i) => (
              <div key={s.n}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', opacity: !s.done && !s.active ? 0.4 : 1 }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, flexShrink: 0,
                    background: s.done ? '#008be1' : s.active ? C.primCont : C.bgHigh,
                    border: s.active ? `2px solid ${C.primary}` : 'none',
                    color: s.done ? '#00203a' : s.active ? C.primary : C.muted,
                  }}>
                    {s.done
                      ? <span className="material-symbols-outlined" style={{ fontSize: '1.2rem', fontVariationSettings: "'FILL' 1" }}>check</span>
                      : <span style={{ fontFamily: fonts.manrope }}>{s.n}</span>
                    }
                  </div>
                  <div>
                    <p style={{ fontSize: '0.875rem', fontWeight: 700, fontFamily: fonts.manrope, color: s.active ? C.primary : C.white, margin: '0 0 2px' }}>{s.label}</p>
                    <p style={{ fontSize: '0.7rem', color: s.active ? `${C.primary}99` : C.dim, margin: 0 }}>{s.sub}</p>
                  </div>
                </div>
                {i < STEPS.length - 1 && (
                  <div style={{ width: 1, height: 32, background: C.borderV, margin: '0 0 0 19px' }} />
                )}
              </div>
            ))}
          </div>

          {/* Live Status Card */}
          <div style={{ padding: '1.5rem', background: C.bgCard, borderRadius: 12, borderBottom: `2px solid ${C.border}`, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <h3 style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em', color: C.muted, margin: 0 }}>Live Verification Status</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {LIVE_STATUS.map(ls => (
                <div key={ls.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: C.bgLowest, padding: '0.75rem 1rem', borderRadius: 8 }}>
                  <span style={{ fontSize: '0.875rem', color: C.text }}>{ls.label}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: ls.color }} />
                    <span style={{ fontSize: '0.65rem', fontWeight: 700, color: ls.color }}>{ls.status}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Vessel info block */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '1rem', background: 'rgba(0,209,255,0.05)', borderRadius: 10, border: '1px solid rgba(76,214,255,0.1)' }}>
            <div style={{ width: 40, height: 40, borderRadius: 8, background: 'rgba(76,214,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span className="material-symbols-outlined" style={{ color: C.cyan }}>directions_boat</span>
            </div>
            <div>
              <p style={{ fontSize: '0.875rem', fontWeight: 700, color: C.white, margin: 0 }}>Maersk Tianjin</p>
              <p style={{ fontSize: '0.6rem', color: C.slate, textTransform: 'uppercase', letterSpacing: '0.15em', margin: 0 }}>IMO 9632117</p>
            </div>
          </div>
        </aside>


        {/* ── RIGHT CONTENT ── */}
        <section style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

          {/* Drop Zone */}
          <div style={{ position: 'relative' }}>
            {/* Glow border */}
            <div style={{
              position: 'absolute', inset: -4, borderRadius: 16,
              background: 'linear-gradient(135deg, rgba(156,202,255,0.2), rgba(76,214,255,0.2))',
              filter: 'blur(8px)', opacity: dragOver ? 1 : 0.25,
              transition: 'opacity 0.3s', pointerEvents: 'none',
            }} />
            <label
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files.length) handleUpload(e.dataTransfer.files); }}
              style={{
                position: 'relative', ...blur(),
                background: dragOver ? 'rgba(51,58,68,0.4)' : 'rgba(46,53,63,0.4)',
                borderRadius: 12, padding: '3rem 2rem',
                borderBottom: `2px solid ${C.borderV}`,
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'center', textAlign: 'center', gap: '1.5rem',
                minHeight: 360, cursor: 'pointer', transition: 'background 0.2s', boxSizing: 'border-box'
              }}>
              <input type="file" multiple style={{ display: 'none' }} onChange={e => { if (e.target.files?.length) handleUpload(e.target.files); }} />
              <div style={{ width: 80, height: 80, borderRadius: '50%', background: C.bgHigh, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 20px 40px rgba(0,209,255,0.08)' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '2.5rem', color: C.primary }}>cloud_upload</span>
              </div>
              <div style={{ maxWidth: 400 }}>
                <h2 style={{ fontFamily: fonts.manrope, fontWeight: 700, fontSize: '1.4rem', color: C.white, margin: '0 0 0.5rem', letterSpacing: '-0.02em' }}>Deposit Vessel Certificates</h2>
                <p style={{ fontSize: '0.875rem', color: C.muted, margin: 0, lineHeight: 1.6 }}>Drag and drop your IMO-certified PDF documents here or click to browse your local terminal.</p>
              </div>
              <div style={{ display: 'flex', gap: '1rem' }}>
                <div style={{ background: 'linear-gradient(to right, #9ccaff, #a6c9fa)', color: '#003256', padding: '0.75rem 2rem', borderRadius: 6, fontWeight: 700, border: 'none', cursor: 'pointer', letterSpacing: '-0.01em', transition: 'filter 0.2s' }}
                  onMouseEnter={e => (e.currentTarget.style.filter = 'brightness(1.1)')} onMouseLeave={e => (e.currentTarget.style.filter = 'none')}>Select Files</div>
                <div style={{ background: 'rgba(46,53,63,0.2)', ...blur(), color: C.white, padding: '0.75rem 2rem', borderRadius: 6, fontWeight: 700, border: `1px solid ${C.borderV}`, cursor: 'pointer', transition: 'background 0.2s' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(46,53,63,0.5)')} onMouseLeave={e => (e.currentTarget.style.background = 'rgba(46,53,63,0.2)')}>Bulk Import</div>
              </div>
              <p style={{ fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.2em', color: `${C.muted}80`, margin: 0 }}>Accepted Formats: PDF, PNG, JPEG (MAX 50MB)</p>
            </label>
          </div>

          {/* Requirement cards */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
            {REQUIREMENTS.map(r => (
              <div key={r.title} style={{ background: C.bgCardH, padding: '1.5rem', borderRadius: 12, borderBottom: `2px solid ${C.border}`, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <span className="material-symbols-outlined" style={{ color: r.iconColor, fontSize: '1.4rem' }}>{r.icon}</span>
                  <span style={{ fontSize: '0.6rem', fontWeight: 700, padding: '3px 8px', background: r.badgeBg, color: r.badgeColor, borderRadius: 4 }}>REQUIRED</span>
                </div>
                <div>
                  <h4 style={{ fontWeight: 700, color: C.white, margin: '0 0 4px', fontSize: '0.9rem' }}>{r.title}</h4>
                  <p style={{ fontSize: '0.75rem', color: C.muted, margin: 0, lineHeight: 1.5 }}>{r.desc}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Footer bar */}
          <div style={{ paddingTop: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: `1px solid ${C.border}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: C.cyan, boxShadow: '0 0 10px #4cd6ff' }} />
              <span style={{ fontSize: '0.65rem', fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.15em' }}>System Online: Encrypted Connection</span>
            </div>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <button style={{ background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '0.875rem', color: C.muted, transition: 'color 0.2s' }}
                onMouseEnter={e => (e.currentTarget.style.color = C.white)} onMouseLeave={e => (e.currentTarget.style.color = C.muted)}>Save Progress</button>
              <button style={{ background: C.bgBright, color: C.white, padding: '0.5rem 1.5rem', borderRadius: 6, fontWeight: 700, fontSize: '0.875rem', border: 'none', cursor: 'pointer', transition: 'background 0.2s' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.1)')} onMouseLeave={e => (e.currentTarget.style.background = C.bgBright)}
                onClick={() => navigate(-1)}>Previous Step</button>
            </div>
          </div>

        </section>
      </main>
    </div>
  );
};

export default Verification;
