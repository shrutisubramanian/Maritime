import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const C = {
  bg: '#071A2E', bgCard: '#19202a', bgCardH: '#242a34', bgHigh: '#2e353f',
  bgBright: '#333a44', bgLowest: '#080f18', bgLow: '#151c26',
  border: 'rgba(68,71,77,0.1)', borderV: 'rgba(68,71,77,0.2)',
  text: '#dce3f0', muted: '#c4c6ce', dim: '#8e9098',
  cyan: '#4cd6ff', primary: '#9ccaff', secondary: '#a6c9fa',
  error: '#ffb4ab', white: '#ffffff',
};
const M = "'Manrope', sans-serif";
const I = "'Inter', sans-serif";
const PROF = 'https://lh3.googleusercontent.com/aida-public/AB6AXuBvT2Ool_SWrRd-hor2VFeE_mWwGxuFi30_lmF8Ogkcyv9oZ2E30qpLzmgD3wJbypHnTBbKY8NzUTmIbKEQLnTsCzTxJsrmAvC_8SIlAv5_zABwvGEgAj4a-ur6yE9_PA1Pstqh6I0H5d6VHEQV87EwWBs9crTNm9LPNFKUhDdW-qPzuiL6XgsMxYbUdRm49DObOJ_DEKjFM26VWju-B-6CLPBf1p2v1viHTrwn5ufZZYwvoQ6XRTZDfA';
const lbl: React.CSSProperties = { display: 'block', fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.15em', color: 'rgba(76,214,255,0.8)', marginBottom: '0.5rem' };
const inp: React.CSSProperties = { width: '100%', background: C.bgLowest, border: 'none', borderBottom: `2px solid ${C.borderV}`, color: C.text, fontFamily: I, fontSize: '0.9rem', padding: '0.75rem 0', outline: 'none', transition: 'border-color 0.2s', boxSizing: 'border-box' as const };
const sel: React.CSSProperties = { ...inp, appearance: 'none' as const, paddingRight: '2rem' };
const onF = (e: React.FocusEvent<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>) => (e.currentTarget.style.borderBottomColor = C.cyan);
const onB = (e: React.FocusEvent<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>) => (e.currentTarget.style.borderBottomColor = C.borderV);

import { requestsService } from '../../../services/requests';

export const CreateProcurementRequest: React.FC = () => {
  const navigate = useNavigate();
  const [reqType, setReqType] = useState<'procurement'|'service'>('procurement');
  const [priority, setPriority] = useState<'low'|'med'|'high'|'urgent'>('med');
  const [dragOver, setDragOver] = useState(false);

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('Mooring & Berthing');
  const [port, setPort] = useState('Rotterdam');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);

  const handlePublish = async () => {
    if (!title || !description) {
      alert("Please enter title and description.");
      return;
    }
    try {
      setLoading(true);
      await requestsService.createRequest({
        title,
        description,
        port,
        service_type: category,
        urgency: priority === 'med' ? 'medium' : priority,
      });
      navigate('/success', { state: { type: 'request_created' } });
    } catch (err) {
      console.error(err);
      alert('Failed to publish request');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ background: C.bg, color: C.text, fontFamily: I, minHeight: '100vh', overflow: 'hidden' }}>

      {/* SIDE NAV */}
      <aside style={{ position: 'fixed', left: 0, top: 0, bottom: 0, width: 256, zIndex: 50, background: C.bgLow, display: 'flex', flexDirection: 'column', padding: '1.5rem 1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0 0.5rem', marginBottom: '2.5rem' }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg,#0062a0,#00B7D9)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span className="material-symbols-outlined" style={{ color: C.white, fontSize: '1.1rem', fontVariationSettings: "'FILL' 1" }}>anchor</span>
          </div>
          <div>
            <h1 style={{ fontFamily: M, fontWeight: 700, fontSize: '1.3rem', color: C.primary, letterSpacing: '-0.04em', margin: 0, lineHeight: 1 }}>Horizon</h1>
            <p style={{ fontSize: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.2em', color: '#c4c6ce99', fontWeight: 500, margin: '3px 0 0' }}>Maritime Infrastructure</p>
          </div>
        </div>
        <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {[
            { icon: 'dashboard',     label: 'Dashboard',            path: '/ship-owner',   active: false },
            { icon: 'store',         label: 'Provider Marketplace', path: '/marketplace',  active: false },
            { icon: 'inventory_2',   label: 'Supplier Marketplace', path: '/marketplace',  active: false },
            { icon: 'redeem',        label: 'Requests',             path: '/create-request', active: true },
            { icon: 'notifications', label: 'Notifications',        path: '/create-request', active: false },
            { icon: 'description',   label: 'Documents',            path: '/upload', active: false },
          ].map(item => (
            <a key={item.label} href="#" onClick={e => { e.preventDefault(); navigate(item.path); }}
              style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.6rem 0.75rem', borderRadius: 8, textDecoration: 'none', color: item.active ? C.primary : C.muted, background: item.active ? 'rgba(0,32,58,0.3)' : 'transparent', fontWeight: item.active ? 700 : 500, transition: 'all 0.2s' }}
              onMouseEnter={e => { if (!item.active) { (e.currentTarget as HTMLElement).style.background = 'rgba(46,53,63,0.2)'; (e.currentTarget as HTMLElement).style.color = C.text; } }}
              onMouseLeave={e => { if (!item.active) { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = C.muted; } }}>
              <span className="material-symbols-outlined" style={{ fontSize: '1.2rem' }}>{item.icon}</span>
              <span style={{ fontSize: '0.875rem' }}>{item.label}</span>
            </a>
          ))}
        </nav>
        <div style={{ paddingTop: '1.5rem', marginTop: '1.5rem', borderTop: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {[{ icon: 'person', label: 'Profile', path: '/company-profile' }, { icon: 'settings', label: 'Settings', path: '/' }].map(item => (
            <a key={item.label} href="#" onClick={e => { e.preventDefault(); navigate(item.path); }}
              style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.6rem 0.75rem', borderRadius: 8, textDecoration: 'none', color: C.muted, transition: 'all 0.2s' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(46,53,63,0.2)'; (e.currentTarget as HTMLElement).style.color = C.text; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = C.muted; }}>
              <span className="material-symbols-outlined" style={{ fontSize: '1.2rem' }}>{item.icon}</span>
              <span style={{ fontSize: '0.875rem' }}>{item.label}</span>
            </a>
          ))}
        </div>
      </aside>

      {/* TOP NAV */}
      <header style={{ position: 'fixed', top: 0, left: 256, right: 0, height: 64, zIndex: 40, background: 'rgba(13,20,29,0.8)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 2rem' }}>
        <h2 style={{ fontFamily: M, fontWeight: 600, fontSize: '1.2rem', color: C.text, margin: 0, letterSpacing: '-0.02em' }}>Create Request</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          <div style={{ position: 'relative' }}>
            <span className="material-symbols-outlined" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: '1.1rem', color: C.muted, pointerEvents: 'none' }}>search</span>
            <input type="text" placeholder="Search infrastructure..." style={{ background: C.bgLowest, border: 'none', borderRadius: 999, padding: '6px 14px 6px 34px', fontSize: '0.875rem', color: C.text, fontFamily: I, outline: 'none', width: 256 }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            {['help','apps'].map(icon => (
              <button key={icon} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted, display: 'flex' }}>
                <span className="material-symbols-outlined">{icon}</span>
              </button>
            ))}
            <div style={{ width: 32, height: 32, borderRadius: '50%', overflow: 'hidden' }}>
              <img src={PROF} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover', cursor: 'pointer' }} onClick={() => navigate('/company-profile')} />
            </div>
          </div>
        </div>
      </header>

      {/* MAIN */}
      <main style={{ marginLeft: 256, marginTop: 64, padding: '2rem', height: 'calc(100vh - 64px)', overflowY: 'auto', paddingBottom: 100 }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', gap: '2rem', alignItems: 'flex-start' }}>

          {/* FORM */}
          <div style={{ flex: 1 }}>
            <section style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 16, overflow: 'hidden' }}>
              <div style={{ padding: '2rem' }}>
                {/* Header + Toggle */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginBottom: '2.5rem' }}>
                  <div>
                    <h3 style={{ fontFamily: M, fontWeight: 700, fontSize: '1.4rem', color: C.text, margin: '0 0 4px' }}>Request Details</h3>
                    <p style={{ fontSize: '0.875rem', color: C.muted, margin: 0 }}>Specify your maritime infrastructure requirements</p>
                  </div>
                  <div style={{ background: C.bgLowest, padding: 4, borderRadius: 12, display: 'flex' }}>
                    {(['procurement','service'] as const).map(t => (
                      <button key={t} onClick={() => setReqType(t)} style={{ padding: '0.5rem 1.5rem', borderRadius: 8, fontSize: '0.875rem', fontWeight: reqType === t ? 600 : 400, border: 'none', cursor: 'pointer', transition: 'all 0.3s', background: reqType === t ? '#00B7D9' : 'transparent', color: reqType === t ? '#001d35' : C.muted }}>
                        {t === 'procurement' ? 'Procurement Request' : 'Service Request'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Fields grid */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                  <div style={{ gridColumn: 'span 2' }}>
                    <label style={lbl}>Request Title</label>
                    <input type="text" placeholder="e.g., Heavy-Duty Mooring Equipment for Terminal A" style={{ ...inp, fontSize: '1.1rem' }} onFocus={onF} onBlur={onB} value={title} onChange={e => setTitle(e.target.value)} />
                  </div>
                  <div>
                    <label style={lbl}>Category</label>
                    <div style={{ position: 'relative' }}>
                      <select style={sel} onFocus={onF} onBlur={onB} value={category} onChange={e => setCategory(e.target.value)}>
                        <option>Mooring &amp; Berthing</option>
                        <option>Navigational Aids</option>
                        <option>Cargo Handling</option>
                        <option>Security Systems</option>
                      </select>
                      <span className="material-symbols-outlined" style={{ position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)', color: C.muted, fontSize: '1.1rem', pointerEvents: 'none' }}>expand_more</span>
                    </div>
                  </div>
                  <div>
                    <label style={lbl}>Required Port</label>
                    <div style={{ position: 'relative' }}>
                      <select style={sel} onFocus={onF} onBlur={onB} value={port} onChange={e => setPort(e.target.value)}>
                        <option>Rotterdam</option>
                        <option>Singapore</option>
                        <option>Jebel Ali</option>
                        <option>Hamburg</option>
                      </select>
                      <span className="material-symbols-outlined" style={{ position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)', color: C.muted, fontSize: '1.1rem', pointerEvents: 'none' }}>location_on</span>
                    </div>
                  </div>
                  <div>
                    <label style={lbl}>Preferred Delivery Date</label>
                    <input type="date" style={inp} onFocus={onF} onBlur={onB} />
                  </div>
                  <div>
                    <label style={lbl}>Priority Level</label>
                    <div style={{ display: 'flex', background: C.bgLowest, borderRadius: 8, padding: 4, border: `1px solid ${C.border}` }}>
                      {(['low','med','high','urgent'] as const).map(p => (
                        <button key={p} onClick={() => setPriority(p)} style={{ flex: 1, padding: '0.5rem', fontSize: '0.7rem', fontWeight: 700, borderRadius: 6, border: 'none', cursor: 'pointer', transition: 'all 0.2s', background: priority === p ? (p === 'urgent' ? 'rgba(255,180,171,0.1)' : 'rgba(76,214,255,0.1)') : 'transparent', color: priority === p ? (p === 'urgent' ? C.error : C.cyan) : C.muted }}>
                          {p.charAt(0).toUpperCase() + p.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div style={{ gridColumn: 'span 2' }}>
                    <label style={lbl}>Description</label>
                    <div style={{ background: C.bgLowest, borderRadius: 12, border: `1px solid ${C.borderV}`, overflow: 'hidden' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.5rem 1rem', borderBottom: `1px solid ${C.border}`, color: C.muted }}>
                        {['format_bold','format_italic','format_list_bulleted','link'].map(icon => (
                          <button key={icon} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', display: 'flex' }}>
                            <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>{icon}</span>
                          </button>
                        ))}
                      </div>
                      <textarea rows={6} placeholder="Provide detailed specifications, technical requirements, or scope of work..." style={{ width: '100%', background: 'transparent', border: 'none', outline: 'none', padding: '1rem', fontSize: '0.875rem', color: C.text, fontFamily: I, resize: 'vertical', boxSizing: 'border-box' }} value={description} onChange={e => setDescription(e.target.value)} />
                    </div>
                  </div>
                  <div style={{ gridColumn: 'span 2' }}>
                    <label style={lbl}>Documentation</label>
                    <label onDragOver={e => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={e => { e.preventDefault(); setDragOver(false); if(e.dataTransfer.files.length)alert(`Added ${e.dataTransfer.files.length} file(s)`); }}
                      style={{ border: `2px dashed ${dragOver ? C.primary : C.borderV}`, borderRadius: 16, padding: '2.5rem 1rem', display: 'flex', flexDirection: 'column', alignItems: 'center', background: 'rgba(8,15,24,0.3)', transition: 'all 0.2s', cursor: 'pointer', boxSizing: 'border-box' }}>
                      <input type="file" multiple style={{ display: 'none' }} onChange={e => { if(e.target.files?.length) alert(`Added ${e.target.files.length} file(s)`); }} />
                      <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(156,202,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: '2rem', color: C.primary }}>upload_file</span>
                      </div>
                      <p style={{ fontWeight: 600, color: C.text, margin: '0 0 4px' }}>Drop files here or click to browse</p>
                      <p style={{ fontSize: '0.75rem', color: C.muted, margin: 0 }}>Support for PDF, CAD, XLSX (Max 25MB per file)</p>
                    </label>
                  </div>
                  <div style={{ gridColumn: 'span 2' }}>
                    <label style={lbl}>Additional Notes</label>
                    <input type="text" placeholder="Internal references or specific compliance standards..." style={inp} onFocus={onF} onBlur={onB} />
                  </div>
                </div>
              </div>
            </section>
          </div>

          {/* SIDEBAR */}
          <aside style={{ width: 300, flexShrink: 0, position: 'sticky', top: 0, display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div style={{ background: C.bgCardH, borderRadius: 16, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
              <div style={{ padding: '1.25rem 1.5rem', borderBottom: `1px solid ${C.border}`, background: 'rgba(51,58,68,0.05)' }}>
                <h4 style={{ fontFamily: M, fontWeight: 700, color: C.text, margin: 0 }}>Request Summary</h4>
              </div>
              <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {[
                  { label: 'Type',        value: reqType === 'procurement' ? 'Procurement' : 'Service' },
                  { label: 'Target Port', value: 'Rotterdam' },
                  { label: 'Attachments',value: '0 Files' },
                ].map((row, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
                    <span style={{ color: C.muted }}>{row.label}</span>
                    <span style={{ fontWeight: 600, color: C.text }}>{row.value}</span>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
                  <span style={{ color: C.muted }}>Priority</span>
                  <span style={{ padding: '2px 8px', background: 'rgba(76,214,255,0.1)', color: C.cyan, fontSize: '0.6rem', fontWeight: 700, borderRadius: 4, textTransform: 'uppercase' }}>Medium</span>
                </div>
                <div style={{ paddingTop: '1rem', borderTop: `1px solid ${C.border}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: '1.1rem', color: C.cyan, fontVariationSettings: "'FILL' 1" }}>verified</span>
                    <span style={{ fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: C.text }}>Visibility</span>
                  </div>
                  <p style={{ fontSize: '0.7rem', color: C.muted, margin: 0, lineHeight: 1.5 }}>Only verified members matching your selected request type will be able to discover this request.</p>
                </div>
              </div>
            </div>
            <div style={{ background: 'rgba(0,32,58,0.1)', borderRadius: 16, padding: '1.5rem', border: 'rgba(156,202,255,0.1) 1px solid' }}>
              <h5 style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: C.primary, margin: '0 0 0.75rem' }}>Submission Tip</h5>
              <p style={{ fontSize: '0.75rem', color: C.muted, margin: 0, lineHeight: 1.6 }}>Detailed technical specifications reduce clarification time by an average of 40%. Ensure CAD drawings are attached for hardware procurement.</p>
            </div>
          </aside>
        </div>
      </main>

      {/* BOTTOM BAR */}
      <footer style={{ position: 'fixed', bottom: 0, left: 256, right: 0, height: 80, background: 'rgba(36,42,52,0.9)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 2.5rem', zIndex: 50 }}>
        <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', color: C.muted, fontWeight: 500, fontSize: '0.875rem' }}>
          <span className="material-symbols-outlined" style={{ fontSize: '1.1rem' }}>close</span>Discard Request
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          <button style={{ padding: '0.6rem 1.5rem', borderRadius: 8, border: `1px solid ${C.borderV}`, background: 'transparent', color: C.text, fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer' }}>Save as Draft</button>
          <button disabled={loading} onClick={handlePublish} style={{ padding: '0.6rem 2.5rem', borderRadius: 8, background: 'linear-gradient(135deg,#0062a0,#00B7D9)', color: C.white, fontWeight: 700, fontSize: '0.875rem', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', boxShadow: '0 8px 24px rgba(76,214,255,0.2)', opacity: loading ? 0.7 : 1 }}>
            {loading ? 'Publishing...' : 'Publish Request'}
            {!loading && <span className="material-symbols-outlined" style={{ fontSize: '1.1rem' }}>send</span>}
          </button>
        </div>
      </footer>
    </div>
  );
};

export default CreateProcurementRequest;
