import React, { useState, useEffect } from 'react';
import { profilesService } from '../../services/profiles';
import { useNavigate } from 'react-router-dom';

const C = {
  bg: '#071A2E', bgCard: '#19202a', bgCardH: '#242a34', bgHigh: '#2e353f',
  bgBright: '#333a44', bgLowest: '#080f18', bgLow: '#151c26',
  border: 'rgba(68,71,77,0.1)', borderV: 'rgba(68,71,77,0.2)',
  text: '#dce3f0', muted: '#c4c6ce', dim: '#8e9098',
  cyan: '#4cd6ff', primary: '#9ccaff', secondary: '#a6c9fa',
  green: '#34d399', amber: '#fbbf24', white: '#ffffff',
};
const M = "'Manrope', sans-serif";
const I = "'Inter', sans-serif";

const PROF_IMG = 'https://lh3.googleusercontent.com/aida-public/AB6AXuBuDUkkUbwhOdXPzGkTiTN8_n790GFcQr1WXqyuT7QC5eyyyAOlDuSw1DDnkH1zqCCwkuqCiLzvfYmbvoYfjtr3GJIERWWkalUiyunC6XcEpvfTiYmtO1aTPI2kuMQuJo3tHZX7qWGbLRi4Y3xo2g-ugQnkSHgd5HYehbCjhhxyBEyGnvb2SzOCmzRco_qO0zvjrAgThmbyH_sdIlxxngypnpkHw8_1aZYjUYrhcrgT5vs62pGpBpEcMg';
const MAP_IMG = 'https://lh3.googleusercontent.com/aida-public/AB6AXuBpBGifQOYPkXZJAld2OvoJWXB_k2UGK9qky_ennr059RbupDtiW4rX-QtwGIrNPrJUn1_IofD_c7Av08lcL72Xhid_iqNDZx65vt_HqVAVexg0-kSm7UXxjOdg0v3sJD4GizZUNtghcjJA6QFs4syFZxVonrVaOYdLA95pu2ZyrvH6FeNfYvToVwnTq2gA1hrNDOqydBl9MBUTASqF3h_tDSMrxCOl8B4WsUPkh48U_pTqc7vvkwvTaw';

const lbl: React.CSSProperties = { display: 'block', fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.15em', color: C.dim, marginBottom: '0.4rem' };
const inp: React.CSSProperties = { width: '100%', background: C.bgLowest, border: `1px solid ${C.borderV}`, borderRadius: 8, color: C.text, fontFamily: I, fontSize: '0.875rem', padding: '0.6rem 1rem', outline: 'none', transition: 'border-color 0.2s, box-shadow 0.2s', boxSizing: 'border-box' as const };
const onF = (e: React.FocusEvent<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>) => { e.currentTarget.style.borderColor = C.cyan; e.currentTarget.style.boxShadow = '0 0 10px rgba(76,214,255,0.2)'; };
const onB = (e: React.FocusEvent<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>) => { e.currentTarget.style.borderColor = C.borderV; e.currentTarget.style.boxShadow = 'none'; };

const glass: React.CSSProperties = { background: 'rgba(36,42,52,0.4)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', border: `1px solid ${C.border}`, borderRadius: 16, padding: '2rem' };

const FLEET_TYPES = ['Container Ships','Bulk Carriers','Tankers','LNG','LPG','Passenger','RORO','Offshore Support'];
const REGIONS = ['India','Middle East','South East Asia','Europe','Africa','Worldwide'];
const DOCS = [
  { name: 'Certificate of Incorporation', date: 'Oct 12, 2023', status: 'Verified',  statusBg: 'rgba(52,211,153,0.1)', statusColor: '#34d399' },
  { name: 'GST Registration Certificate',  date: 'Oct 12, 2023', status: 'Verified',  statusBg: 'rgba(52,211,153,0.1)', statusColor: '#34d399' },
  { name: 'IMMA Membership Proof',          date: 'Jan 04, 2024', status: 'Pending',   statusBg: 'rgba(251,191,36,0.1)',  statusColor: '#fbbf24', pulse: true },
];
const PREFS = [
  { label: 'Receive Procurement Notifications', sub: 'Get alerts for RFQ updates and supplier bids.', on: true  },
  { label: 'Service Provider Recommendations',  sub: 'AI-curated recommendations based on fleet needs.', on: true  },
  { label: 'Allow Suppliers to Contact',         sub: 'Verified suppliers can initiate chat requests.', on: false },
  { label: 'Public Company Profile',             sub: 'Make your basic fleet info visible to the marketplace.', on: true  },
];

const NAV = [
  { icon: 'dashboard',   label: 'Dashboard',            path: '/ship-owner'        },
  { icon: 'storefront',  label: 'Provider Marketplace', path: '/marketplace'       },
  { icon: 'hub',         label: 'Supplier Marketplace', path: '/marketplace'       },
  { icon: 'move_to_inbox', label: 'Requests',           path: '/create-request'    },
  { icon: 'notifications', label: 'Notifications',      path: '/company-profile'   },
  { icon: 'description', label: 'Documents',            path: '/verification'      },
  { icon: 'person',      label: 'Profile',              path: '/company-profile', active: true },
  { icon: 'settings',    label: 'Settings',             path: '/company-profile'   },
];

const Toggle: React.FC<{ on: boolean; onChange: () => void }> = ({ on, onChange }) => (
  <button onClick={onChange} style={{ width: 48, height: 24, borderRadius: 999, background: on ? C.cyan : C.bgHigh, position: 'relative', border: 'none', cursor: 'pointer', flexShrink: 0, transition: 'background 0.3s' }}>
    <div style={{ position: 'absolute', top: 3, [on ? 'right' : 'left']: 3, width: 18, height: 18, borderRadius: '50%', background: on ? '#003256' : C.dim, transition: 'all 0.3s' }} />
  </button>
);

const Chip: React.FC<{ label: string; active?: boolean; onClick: () => void }> = ({ label, active, onClick }) => (
  <button onClick={onClick} style={{ padding: '6px 14px', borderRadius: 999, fontSize: '0.75rem', fontWeight: 500, border: `1px solid ${active ? C.cyan : C.borderV}`, background: active ? 'rgba(76,214,255,0.2)' : 'transparent', color: active ? C.cyan : C.muted, cursor: 'pointer', transition: 'all 0.2s' }}>
    {label}
  </button>
);


export const CompanyProfile: React.FC = () => {
  const navigate = useNavigate();
  const [fleetTypes, setFleetTypes] = useState<string[]>(['Container Ships','Bulk Carriers']);
  const [regions, setRegions] = useState<string[]>(['Middle East','South East Asia','Europe']);
  const [prefs, setPrefs] = useState(PREFS.map(p => ({ ...p })));
  
  const [loading, setLoading] = useState(true);
  const [companyName, setCompanyName] = useState('Oceanic Logistics Group');
  const [regNumber, setRegNumber] = useState('REG-990234-LX');
  const [website, setWebsite] = useState('www.oceaniclogistics.com');
  const [email, setEmail] = useState('ops@oceaniclogistics.com');
  const [companyType, setCompanyType] = useState('Ship Manager');
  const [gstNumber, setGstNumber] = useState('VAT77881122');
  const [primaryContact, setPrimaryContact] = useState('Capt. Elias Vance');
  const [designation, setDesignation] = useState('Fleet Manager');
  const [contactNumber, setContactNumber] = useState('+1 (555) 012-3456');
  const [bio, setBio] = useState('Oceanic Logistics Group is a premier ship management firm specializing in bulk carrier operations across the South East Asian and European corridors. With over 25 years of maritime excellence, we prioritize safety, technical efficiency, and sustainable procurement practices.');
  const [numVessels, setNumVessels] = useState('42');

  useEffect(() => {
    profilesService.getMyProfile().then(p => {
      if (p) {
        if (p.company_name) setCompanyName(p.company_name);
        if (p.bio) setBio(p.bio);
        if (p.contacts && p.contacts.length > 0) {
          setPrimaryContact(p.contacts[0].name || '');
          setDesignation(p.contacts[0].title || '');
          setContactNumber(p.contacts[0].phone || '');
          setEmail(p.contacts[0].email || '');
        }
        if (p.offices && p.offices.length > 0) setRegions(p.offices);
        
        const meta = p.profile_metadata || {};
        if (meta.regNumber) setRegNumber(meta.regNumber);
        if (meta.website) setWebsite(meta.website);
        if (meta.companyType) setCompanyType(meta.companyType);
        if (meta.gstNumber) setGstNumber(meta.gstNumber);
        if (meta.numVessels) setNumVessels(meta.numVessels);
        if (meta.fleetTypes) setFleetTypes(meta.fleetTypes);
        if (meta.prefs) setPrefs(meta.prefs);
      }
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    try {
      await profilesService.updateMyProfile({
        company_name: companyName,
        bio: bio,
        offices: regions,
        contacts: [{ name: primaryContact, title: designation, phone: contactNumber, email: email }],
        profile_metadata: {
          regNumber,
          website,
          companyType,
          gstNumber,
          numVessels,
          fleetTypes,
          prefs
        }
      });
      alert('Profile updated successfully!');
    } catch (e) {
      console.error(e);
      alert('Failed to update profile.');
    }
  };

  const toggleFleet = (t: string) => setFleetTypes(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);
  const toggleRegion = (r: string) => setRegions(prev => prev.includes(r) ? prev.filter(x => x !== r) : [...prev, r]);
  const togglePref = (i: number) => setPrefs(prev => prev.map((p, idx) => idx === i ? { ...p, on: !p.on } : p));

  if (loading) return <div style={{background: C.bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.cyan}}>Loading...</div>;


  return (
    <div style={{ background: C.bg, color: C.text, fontFamily: I, minHeight: '100vh' }}>

      {/* Atmospheric glows */}
      <div style={{ position: 'fixed', top: 0, right: 0, width: '50%', height: '50%', background: 'rgba(76,214,255,0.05)', filter: 'blur(120px)', pointerEvents: 'none', zIndex: 0, borderRadius: '50%' }} />
      <div style={{ position: 'fixed', bottom: 0, left: 0, width: '33%', height: '33%', background: 'rgba(156,202,255,0.05)', filter: 'blur(120px)', pointerEvents: 'none', zIndex: 0, borderRadius: '50%' }} />

      {/* SIDE NAV */}
      <aside style={{ position: 'fixed', left: 0, top: 0, bottom: 0, width: 256, zIndex: 50, background: C.bgLow, display: 'flex', flexDirection: 'column', padding: '1.5rem 1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0 0.5rem', marginBottom: '2.5rem' }}>
          <div style={{ width: 40, height: 40, borderRadius: 8, background: `linear-gradient(135deg,${C.primary},${C.cyan})`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span className="material-symbols-outlined" style={{ color: '#001d35', fontVariationSettings: "'FILL' 1" }}>directions_boat</span>
          </div>
          <div>
            <h1 style={{ fontFamily: M, fontWeight: 900, fontSize: '1.3rem', color: C.text, letterSpacing: '-0.03em', margin: 0, lineHeight: 1 }}>Horizon</h1>
            <p style={{ fontSize: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.2em', color: C.cyan, fontWeight: 700, margin: '3px 0 0' }}>Maritime B2B</p>
          </div>
        </div>
        <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {NAV.map(item => (
            <a key={item.label} href="#" onClick={e => { e.preventDefault(); navigate(item.path); }}
              style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.65rem 1rem', borderRadius: 8, textDecoration: 'none', color: item.active ? C.primary : C.muted, background: item.active ? C.bgCardH : 'transparent', fontWeight: item.active ? 700 : 400, borderRight: item.active ? `2px solid ${C.cyan}` : '2px solid transparent', transition: 'all 0.2s' }}
              onMouseEnter={e => { if (!item.active) { (e.currentTarget as HTMLElement).style.background = C.bgCardH; (e.currentTarget as HTMLElement).style.color = C.text; } }}
              onMouseLeave={e => { if (!item.active) { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = C.muted; } }}>
              <span className="material-symbols-outlined" style={{ fontSize: '1.25rem', fontVariationSettings: item.active ? "'FILL' 1" : "'FILL' 0" }}>{item.icon}</span>
              <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{item.label}</span>
            </a>
          ))}
        </nav>
        <div style={{ padding: '1rem 0.5rem 0', borderTop: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ width: 32, height: 32, borderRadius: '50%', overflow: 'hidden', border: `1px solid rgba(76,214,255,0.3)`, flexShrink: 0 }}>
            <img src={PROF_IMG} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontSize: '0.75rem', fontWeight: 700, color: C.text, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Capt. Elias Vance</p>
            <p style={{ fontSize: '0.6rem', color: C.muted, margin: 0 }}>Fleet Manager</p>
          </div>
        </div>
      </aside>

      {/* TOP NAV */}
      <header style={{ position: 'fixed', top: 0, left: 256, right: 0, height: 64, zIndex: 40, background: 'rgba(13,20,29,0.4)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 2rem' }}>
        <div style={{ display: 'flex', gap: '1.5rem' }}>
          {['Fleet','Logistics','Analytics'].map(l => (
            <a key={l} href="#" style={{ fontSize: '0.875rem', fontWeight: 500, color: C.muted, textDecoration: 'none', transition: 'color 0.2s' }}
              onMouseEnter={e => (e.currentTarget.style.color = C.text)} onMouseLeave={e => (e.currentTarget.style.color = C.muted)}>{l}</a>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          <div style={{ position: 'relative' }}>
            <span className="material-symbols-outlined" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: '1.1rem', color: C.muted, pointerEvents: 'none' }}>search</span>
            <input type="text" placeholder="Search vessels, suppliers..." style={{ background: C.bgLowest, border: 'none', borderRadius: 999, padding: '6px 14px 6px 34px', fontSize: '0.75rem', color: C.text, fontFamily: I, outline: 'none', width: 256, boxShadow: `0 0 0 1px ${C.borderV}` }}
              onFocus={e => (e.currentTarget.style.boxShadow = `0 0 0 1px ${C.cyan}66`)} onBlur={e => (e.currentTarget.style.boxShadow = `0 0 0 1px ${C.borderV}`)} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            {['help','apps'].map(icon => (
              <button key={icon} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted, display: 'flex', transition: 'color 0.2s' }}
                onMouseEnter={e => (e.currentTarget.style.color = C.text)} onMouseLeave={e => (e.currentTarget.style.color = C.muted)}>
                <span className="material-symbols-outlined">{icon}</span>
              </button>
            ))}
            <div style={{ width: 1, height: 32, background: C.borderV }} />
            <button style={{ width: 32, height: 32, borderRadius: 8, background: C.bgHigh, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', cursor: 'pointer', color: C.primary }}>
              <span className="material-symbols-outlined" style={{ fontSize: '1.25rem' }}>account_circle</span>
            </button>
          </div>
        </div>
      </header>

      {/* MAIN */}
      <main style={{ marginLeft: 256, paddingTop: 96, paddingBottom: 120, padding: '96px 3rem 120px', maxWidth: 1280, position: 'relative', zIndex: 1 }}>

        {/* Page header */}
        <div style={{ marginBottom: '3rem' }}>
          <h2 style={{ fontFamily: M, fontWeight: 800, fontSize: '2.25rem', color: C.text, letterSpacing: '-0.03em', margin: '0 0 0.5rem' }}>My Company Profile</h2>
          <p style={{ color: C.muted, fontSize: '0.9rem', lineHeight: 1.7, maxWidth: 600, margin: 0 }}>Manage your company profile, procurement preferences, and fleet information. This profile helps verified suppliers and service providers understand your operational requirements.</p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>

          {/* 1. Company Information */}
          <section style={glass}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
              <div style={{ width: 40, height: 40, borderRadius: 8, background: 'rgba(76,214,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span className="material-symbols-outlined" style={{ color: C.cyan }}>business</span></div>
              <h3 style={{ fontFamily: M, fontWeight: 700, fontSize: '1.2rem', color: C.text, margin: 0 }}>Company Information</h3>
            </div>
            <div style={{ display: 'flex', gap: '2.5rem', flexWrap: 'wrap' }}>
              {/* Logo upload */}
              <div style={{ flexShrink: 0 }}>
                <label style={{ width: 128, height: 128, borderRadius: 12, background: C.bgLowest, border: `2px dashed ${C.borderV}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: C.dim, cursor: 'pointer', transition: 'border-color 0.2s', boxSizing: 'border-box' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = C.primary; (e.currentTarget as HTMLElement).style.background = 'rgba(156,202,255,0.05)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = C.borderV; (e.currentTarget as HTMLElement).style.background = C.bgLowest; }}
                  onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); if (e.dataTransfer.files.length) alert(`Added ${e.dataTransfer.files.length} file(s)`); }}>
                  <input type="file" style={{ display: 'none' }} onChange={e => { if (e.target.files?.length) alert(`Added ${e.target.files.length} file(s)`); }} />
                  <span className="material-symbols-outlined" style={{ fontSize: '2rem', marginBottom: 4 }}>add_a_photo</span>
                  <span style={{ fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Upload Logo</span>
                </label>
              </div>
              {/* Fields */}
              <div style={{ flex: 1, minWidth: 300 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                  <div>
                    <label style={lbl}>Company Name</label>
                    <input type="text" value={companyName} onChange={e => setCompanyName(e.target.value)} style={inp} onFocus={onF} onBlur={onB} />
                  </div>
                  <div>
                    <label style={lbl}>Registered Company Number</label>
                    <input type="text" value={regNumber} onChange={e => setRegNumber(e.target.value)} style={inp} onFocus={onF} onBlur={onB} />
                  </div>
                  <div>
                    <label style={lbl}>Website</label>
                    <input type="text" value={website} onChange={e => setWebsite(e.target.value)} style={inp} onFocus={onF} onBlur={onB} />
                  </div>
                  <div>
                    <label style={lbl}>Official Email</label>
                    <input type="email" value={email} onChange={e => setEmail(e.target.value)} style={inp} onFocus={onF} onBlur={onB} />
                  </div>
                  <div>
                    <label style={lbl}>Company Type</label>
                    <select style={inp} value={companyType} onChange={e => setCompanyType(e.target.value)} onFocus={onF} onBlur={onB}>
                      <option value="Ship Owner">Ship Owner</option>
                      <option value="Ship Manager">Ship Manager</option>
                      <option value="Charterer">Charterer</option>
                      <option value="Agency">Agency</option>
                    </select>
                  </div>
                  <div>
                    <label style={lbl}>GST / VAT Number</label>
                    <input type="text" value={gstNumber} onChange={e => setGstNumber(e.target.value)} style={inp} onFocus={onF} onBlur={onB} />
                  </div>
                </div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1.5rem', marginTop: '1.5rem' }}>
                <div>
                  <label style={lbl}>Primary Contact Person</label>
                  <input type="text" value={primaryContact} onChange={e => setPrimaryContact(e.target.value)} style={inp} onFocus={onF} onBlur={onB} />
                </div>
                <div>
                  <label style={lbl}>Designation</label>
                  <input type="text" value={designation} onChange={e => setDesignation(e.target.value)} style={inp} onFocus={onF} onBlur={onB} />
                </div>
                <div>
                  <label style={lbl}>Contact Number</label>
                  <input type="text" value={contactNumber} onChange={e => setContactNumber(e.target.value)} style={inp} onFocus={onF} onBlur={onB} />
                </div>
            </div>
            <div style={{ marginTop: '1.5rem' }}>
              <label style={lbl}>Company Description</label>
              <textarea rows={4} value={bio} onChange={e => setBio(e.target.value)}
                style={{ ...inp, resize: 'vertical' as const }} onFocus={onF} onBlur={onB} />
            </div>
          </section>

          {/* 2. Fleet Information */}
          <section style={glass}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
              <div style={{ width: 40, height: 40, borderRadius: 8, background: 'rgba(76,214,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span className="material-symbols-outlined" style={{ color: C.cyan }}>directions_boat</span></div>
              <h3 style={{ fontFamily: M, fontWeight: 700, fontSize: '1.2rem', color: C.text, margin: 0 }}>Fleet Information</h3>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <div style={{ width: 192 }}>
                <label style={lbl}>Number of Vessels</label>
                <input type="number" value={numVessels} onChange={e => setNumVessels(e.target.value)} style={inp} onFocus={onF} onBlur={onB} />
              </div>
              <div>
                <label style={lbl}>Fleet Types</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.5rem' }}>
                  {FLEET_TYPES.map(t => <Chip key={t} label={t} active={fleetTypes.includes(t)} onClick={() => toggleFleet(t)} />)}
                </div>
              </div>
              <div>
                <label style={lbl}>Operating Regions</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.5rem' }}>
                  {REGIONS.map(r => <Chip key={r} label={r} active={regions.includes(r)} onClick={() => toggleRegion(r)} />)}
                </div>
              </div>
            </div>
          </section>

          {/* 3. Ports & Services */}
          <section style={glass}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
              <div style={{ width: 40, height: 40, borderRadius: 8, background: 'rgba(76,214,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span className="material-symbols-outlined" style={{ color: C.cyan }}>anchor</span></div>
              <h3 style={{ fontFamily: M, fontWeight: 700, fontSize: '1.2rem', color: C.text, margin: 0 }}>Ports &amp; Services</h3>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                {[
                  { lbl: 'Ports of Operation',            tags: ['Mumbai','Singapore','Rotterdam'], color: C.text },
                  { lbl: 'Frequently Required Services',  tags: ['Hull Cleaning','Engine Repair'],  color: C.cyan },
                ].map(row => (
                  <div key={row.lbl}>
                    <label style={lbl}>{row.lbl}</label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5rem', padding: '0.75rem', background: C.bgLowest, borderRadius: 8, border: `1px solid ${C.borderV}`, minHeight: 48 }}>
                      {row.tags.map(tag => (
                        <span key={tag} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 10px', background: C.bgCardH, borderRadius: 6, fontSize: '0.75rem', color: row.color }}>
                          {tag}
                          <span className="material-symbols-outlined" style={{ fontSize: '0.75rem', cursor: 'pointer', color: C.dim }}>close</span>
                        </span>
                      ))}
                      <input type="text" placeholder="Add..." style={{ background: 'transparent', border: 'none', outline: 'none', fontSize: '0.75rem', color: C.text, width: 80, fontFamily: I }} />
                    </div>
                  </div>
                ))}
              </div>
              <div>
                <label style={lbl}>Preferred Service Locations</label>
                <div style={{ height: 160, borderRadius: 12, overflow: 'hidden', position: 'relative', marginTop: '0.5rem' }}>
                  <div style={{ position: 'absolute', inset: 0, backgroundImage: `url('${MAP_IMG}')`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
                  <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, #071A2E, transparent)' }} />
                  <div style={{ position: 'absolute', bottom: 12, left: 12, right: 12 }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.25rem', padding: '0.5rem', background: 'rgba(36,42,52,0.8)', backdropFilter: 'blur(8px)', borderRadius: 8 }}>
                      {['Jebel Ali','Busan','Antwerp'].map((p, i) => (
                        <span key={p} style={{ fontSize: '0.7rem', fontWeight: 700, padding: '0 8px', borderLeft: i > 0 ? `1px solid ${C.borderV}` : 'none' }}>{p}</span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* 4. Procurement Preferences */}
          <section style={glass}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
              <div style={{ width: 40, height: 40, borderRadius: 8, background: 'rgba(76,214,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span className="material-symbols-outlined" style={{ color: C.cyan }}>shopping_cart</span></div>
              <h3 style={{ fontFamily: M, fontWeight: 700, fontSize: '1.2rem', color: C.text, margin: 0 }}>Procurement Preferences</h3>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '2.5rem', alignItems: 'start' }}>
              <div>
                <label style={lbl}>Preferred Supplier Types</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.75rem' }}>
                  {['Marine Stores','Engine Spares','Deck Equipment','Safety Equipment'].map((t, i) => (
                    <label key={t} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}>
                      <input type="checkbox" defaultChecked={i < 2} style={{ accentColor: C.cyan, width: 16, height: 16 }} />
                      <span style={{ fontSize: '0.875rem', color: C.text }}>{t}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                <div>
                  <label style={lbl}>Preferred Procurement Method</label>
                  <select style={inp} onFocus={onF} onBlur={onB}>
                    <option>RFQ (Request for Quotation)</option>
                    <option>E-Auction</option>
                    <option>Direct Purchase</option>
                    <option>Contractual Supply</option>
                  </select>
                </div>
                <div>
                  <label style={lbl}>Preferred Response Time</label>
                  <select style={inp} onFocus={onF} onBlur={onB}>
                    <option>Under 4 Hours</option>
                    <option selected>Under 12 Hours</option>
                    <option>Under 24 Hours</option>
                    <option>Flexible</option>
                  </select>
                </div>
              </div>
            </div>
          </section>

          {/* 5. Documents & Verification */}
          <section style={glass}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div style={{ width: 40, height: 40, borderRadius: 8, background: 'rgba(76,214,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span className="material-symbols-outlined" style={{ color: C.cyan }}>verified_user</span></div>
                <h3 style={{ fontFamily: M, fontWeight: 700, fontSize: '1.2rem', color: C.text, margin: 0 }}>Documents &amp; Verification</h3>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1.25rem', borderRadius: 8, background: 'rgba(76,214,255,0.1)', border: `1px solid rgba(76,214,255,0.3)`, color: C.cyan, fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', transition: 'background 0.2s', boxSizing: 'border-box' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(76,214,255,0.2)')} onMouseLeave={e => (e.currentTarget.style.background = 'rgba(76,214,255,0.1)')}
                onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); if (e.dataTransfer.files.length) alert(`Added ${e.dataTransfer.files.length} file(s)`); }}>
                <input type="file" multiple style={{ display: 'none' }} onChange={e => { if (e.target.files?.length) alert(`Added ${e.target.files.length} file(s)`); }} />
                <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>upload_file</span>Upload New Document
              </label>
            </div>
            <div style={{ borderRadius: 12, overflow: 'hidden', border: `1px solid ${C.border}` }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ background: C.bgLowest, fontSize: '0.6rem', color: C.muted, textTransform: 'uppercase', letterSpacing: '0.15em', fontWeight: 700 }}>
                    {['Document Name','Upload Date','Status','Actions'].map((h, i) => (
                      <th key={h} style={{ padding: '1rem 1.5rem', textAlign: i === 3 ? 'right' : 'left' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {DOCS.map((doc, i) => (
                    <tr key={i} style={{ borderTop: `1px solid ${C.border}`, transition: 'background 0.2s' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(36,42,52,0.5)')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                      <td style={{ padding: '1rem 1.5rem', fontSize: '0.875rem', fontWeight: 500, color: C.text }}>{doc.name}</td>
                      <td style={{ padding: '1rem 1.5rem', fontSize: '0.875rem', color: C.muted }}>{doc.date}</td>
                      <td style={{ padding: '1rem 1.5rem' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 999, background: doc.statusBg, color: doc.statusColor, fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                          <div style={{ width: 6, height: 6, borderRadius: '50%', background: doc.statusColor }} />
                          {doc.status}
                        </span>
                      </td>
                      <td style={{ padding: '1rem 1.5rem', textAlign: 'right' }}>
                        <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted, transition: 'color 0.2s' }}
                          onMouseEnter={e => (e.currentTarget.style.color = C.cyan)} onMouseLeave={e => (e.currentTarget.style.color = C.muted)}>
                          <span className="material-symbols-outlined" style={{ fontSize: '1.2rem' }}>download</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* 6. Account Preferences */}
          <section style={glass}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
              <div style={{ width: 40, height: 40, borderRadius: 8, background: 'rgba(76,214,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span className="material-symbols-outlined" style={{ color: C.cyan }}>tune</span></div>
              <h3 style={{ fontFamily: M, fontWeight: 700, fontSize: '1.2rem', color: C.text, margin: 0 }}>Account Preferences</h3>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 3rem' }}>
              {prefs.map((p, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 0', borderBottom: `1px solid ${C.border}` }}>
                  <div>
                    <p style={{ fontSize: '0.875rem', fontWeight: 600, color: C.text, margin: '0 0 2px' }}>{p.label}</p>
                    <p style={{ fontSize: '0.75rem', color: C.muted, margin: 0 }}>{p.sub}</p>
                  </div>
                  <Toggle on={p.on} onChange={() => togglePref(i)} />
                </div>
              ))}
            </div>
          </section>

        </div>
      </main>

      {/* BOTTOM BAR */}
      <footer style={{ position: 'fixed', bottom: 0, left: 256, right: 0, padding: '1.25rem 3rem', background: 'rgba(13,20,29,0.8)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', borderTop: `1px solid ${C.border}`, display: 'flex', justifyContent: 'flex-end', gap: '1rem', zIndex: 40 }}>
        <button style={{ padding: '0.6rem 1.5rem', borderRadius: 8, border: `1px solid ${C.borderV}`, background: 'transparent', color: C.text, fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer', transition: 'background 0.2s' }}
          onMouseEnter={e => (e.currentTarget.style.background = C.bgCardH)} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>Preview Public Profile</button>
        <button style={{ padding: '0.6rem 2rem', borderRadius: 8, background: `linear-gradient(to right,${C.primary},${C.cyan})`, color: '#003256', fontWeight: 700, fontSize: '0.875rem', border: 'none', cursor: 'pointer', boxShadow: '0 4px 16px rgba(76,214,255,0.1)', transition: 'all 0.2s' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 24px rgba(76,214,255,0.25)'; (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 16px rgba(76,214,255,0.1)'; (e.currentTarget as HTMLElement).style.transform = 'none'; }}>
          Save Company Profile
        </button>
      </footer>

    </div>
  );
};

export default CompanyProfile;
