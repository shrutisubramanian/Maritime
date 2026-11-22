import React, { useCallback, useEffect, useState } from 'react';
import { profilesService } from '../../services/profiles';
import { documentsService } from '../../services/documents';
import { useNavigate } from 'react-router-dom';
import { ClientSidebar } from '../../components/ClientSidebar';

const C = {
  bg: 'var(--color-background)', bgCard: 'var(--color-surface)', bgCardH: 'var(--color-surface)', bgHigh: 'var(--color-surface-deep)',
  bgBright: 'var(--color-surface-deep)', bgLowest: 'var(--color-surface-alt)', bgLow: 'var(--color-surface-alt)',
  border: 'var(--color-border)', borderV: 'var(--color-border-strong)',
  text: 'var(--color-text)', muted: 'var(--color-muted)', dim: 'var(--color-faint)',
  cyan: 'var(--color-brand)', primary: 'var(--color-brand)', secondary: 'var(--color-muted)',
  green: 'var(--color-success)', amber: 'var(--color-warning)', white: 'var(--color-text)',
};
const M = "'Manrope', sans-serif";
const I = "'Inter', sans-serif";

const MAP_GRADIENT = 'linear-gradient(160deg, rgba(7,26,46,0.96), rgba(76,157,176,0.16))';

const lbl: React.CSSProperties = { display: 'block', fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.15em', color: C.dim, marginBottom: '0.4rem' };
const inp: React.CSSProperties = { width: '100%', background: C.bgLowest, border: `1px solid ${C.borderV}`, borderRadius: 8, color: C.text, fontFamily: I, fontSize: '0.875rem', padding: '0.6rem 1rem', outline: 'none', transition: 'border-color 0.2s, box-shadow 0.2s', boxSizing: 'border-box' as const };
const onF = (e: React.FocusEvent<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>) => { e.currentTarget.style.borderColor = C.cyan; e.currentTarget.style.boxShadow = '0 0 10px rgba(76,157,176,0.2)'; };
const onB = (e: React.FocusEvent<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>) => { e.currentTarget.style.borderColor = C.borderV; e.currentTarget.style.boxShadow = 'none'; };

const glass: React.CSSProperties = { background: 'var(--color-surface)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', border: `1px solid ${C.border}`, borderRadius: 16, padding: '2rem' };

const FLEET_TYPES = ['Container Ships','Bulk Carriers','Tankers','LNG','LPG','Passenger','RORO','Offshore Support'];
const SUPPLIER_TYPES = ['Marine Stores','Engine Spares','Deck Equipment','Safety Equipment'];
const PROCUREMENT_METHODS = ['RFQ (Request for Quotation)','E-Auction','Direct Purchase','Contractual Supply'];
const RESPONSE_TIMES = ['Under 4 Hours','Under 12 Hours','Under 24 Hours','Flexible'];
const DEFAULT_SUPPLIER_TYPES = ['Marine Stores','Engine Spares'];
const REGIONS = ['India','Middle East','South East Asia','Europe','Africa','Worldwide'];
interface MyDocument {
  id: string;
  name: string | null;
  document_type: string | null;
  verification_status: string | null;
  created_at: string;
}

const formatDocDate = (iso?: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString();
};

const docStatusLabel = (status?: string | null) => {
  if (!status) return 'Pending';
  return status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
};

const docStatusColor = (status?: string | null) =>
  status === 'verified' ? C.green : status === 'rejected' ? 'var(--color-error)' : C.amber;

const docStatusTint = (status?: string | null) =>
  status === 'verified'
    ? 'var(--color-success-tint)'
    : status === 'rejected'
      ? 'var(--color-error-tint)'
      : 'var(--color-warning-tint)';
const PREFS = [
  { label: 'Receive Procurement Notifications', sub: 'Get alerts for RFQ updates and supplier bids.', on: true  },
  { label: 'Service Provider Recommendations',  sub: 'AI-curated recommendations based on fleet needs.', on: true  },
  { label: 'Allow Suppliers to Contact',         sub: 'Verified suppliers can initiate chat requests.', on: false },
  { label: 'Public Company Profile',             sub: 'Make your basic fleet info visible to the marketplace.', on: true  },
];

const NAV = [
  { icon: 'dashboard',   label: 'Dashboard',            path: '/ship-owner'        },
  { icon: 'storefront',  label: 'Provider Marketplace', path: '/marketplace/repairs'       },
  { icon: 'hub',         label: 'Supplier Marketplace', path: '/marketplace/stores'       },
  { icon: 'move_to_inbox', label: 'Requests',           path: '/create-request'    },
  { icon: 'notifications', label: 'Notifications',      path: '/notifications'     },
  { icon: 'description', label: 'Documents',            path: '/verification'      },
  { icon: 'person',      label: 'Profile',              path: '/company-profile', active: true },
  { icon: 'settings',    label: 'Settings',             path: '/company-profile'   },
];

const Toggle: React.FC<{ on: boolean; onChange: () => void }> = ({ on, onChange }) => (
  <button onClick={onChange} style={{ width: 48, height: 24, borderRadius: 999, background: on ? C.cyan : C.bgHigh, position: 'relative', border: 'none', cursor: 'pointer', flexShrink: 0, transition: 'background 0.3s' }}>
    <div style={{ position: 'absolute', top: 3, [on ? 'right' : 'left']: 3, width: 18, height: 18, borderRadius: '50%', background: on ? '#2563eb' : C.dim, transition: 'all 0.3s' }} />
  </button>
);

/**
 * Editable list of free-text tags (ports, services, locations). Enter or
 * leaving the field adds the typed value; each chip can be removed again.
 * Values are owned by the page so they persist with the profile save.
 */
const TagEditor: React.FC<{
  inputId?: string;
  tags: string[];
  color: string;
  placeholder?: string;
  onChange: (next: string[]) => void;
  inputStyle?: React.CSSProperties;
}> = ({ inputId, tags, color, placeholder = 'Add...', onChange, inputStyle }) => {
  const [draft, setDraft] = useState('');
  const add = () => {
    const value = draft.trim();
    if (!value) return;
    if (!tags.includes(value)) onChange([...tags, value]);
    setDraft('');
  };
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5rem', padding: '0.75rem', background: C.bgLowest, borderRadius: 8, border: `1px solid ${C.borderV}`, minHeight: 48 }}>
      {tags.map((tag, i) => (
        <span key={`${tag}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 10px', background: C.bgCardH, borderRadius: 6, fontSize: '0.75rem', color }}>
          {tag}
          <button
            type="button"
            aria-label={`Remove ${tag}`}
            onClick={() => onChange(tags.filter((_, idx) => idx !== i))}
            style={{ background: 'none', border: 'none', padding: 0, display: 'flex', cursor: 'pointer' }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '0.75rem', color: C.dim }}>close</span>
          </button>
        </span>
      ))}
      <input
        id={inputId}
        type="text"
        value={draft}
        placeholder={placeholder}
        aria-label={placeholder}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
        onBlur={add}
        style={{ background: 'transparent', border: 'none', outline: 'none', fontSize: '0.75rem', color: C.text, width: 110, fontFamily: I, ...inputStyle }}
      />
    </div>
  );
};

const Chip: React.FC<{ label: string; active?: boolean; onClick: () => void }> = ({ label, active, onClick }) => (
  <button onClick={onClick} style={{ padding: '6px 14px', borderRadius: 999, fontSize: '0.75rem', fontWeight: 500, border: `1px solid ${active ? C.cyan : C.borderV}`, background: active ? 'rgba(76,157,176,0.2)' : 'transparent', color: active ? C.cyan : C.muted, cursor: 'pointer', transition: 'all 0.2s' }}>
    {label}
  </button>
);


export const CompanyProfile: React.FC = () => {
  const navigate = useNavigate();
  const [fleetTypes, setFleetTypes] = useState<string[]>([]);
  const [regions, setRegions] = useState<string[]>([]);
  const [prefs, setPrefs] = useState(PREFS.map(p => ({ ...p })));
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [myDocuments, setMyDocuments] = useState<MyDocument[] | null>(null);
  const [documentsError, setDocumentsError] = useState<string | null>(null);
  
  const [loading, setLoading] = useState(true);
  // Empty until the saved profile arrives: the form must never present invented
  // company details as if they were the signed-in user's own records.
  const [companyName, setCompanyName] = useState('');
  const [regNumber, setRegNumber] = useState('');
  const [website, setWebsite] = useState('');
  const [email, setEmail] = useState('');
  const [companyType, setCompanyType] = useState('');
  const [gstNumber, setGstNumber] = useState('');
  const [primaryContact, setPrimaryContact] = useState('');
  const [designation, setDesignation] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [bio, setBio] = useState('');
  const [numVessels, setNumVessels] = useState('');
  const [saving, setSaving] = useState(false);
  const [portsOfOperation, setPortsOfOperation] = useState<string[]>([]);
  const [requiredServices, setRequiredServices] = useState<string[]>([]);
  const [serviceLocations, setServiceLocations] = useState<string[]>([]);
  const [supplierTypes, setSupplierTypes] = useState<string[]>(DEFAULT_SUPPLIER_TYPES);
  const [procurementMethod, setProcurementMethod] = useState(PROCUREMENT_METHODS[0]);
  const [responseTime, setResponseTime] = useState('Under 12 Hours');
  // Everything else already stored on the profile that this page does not edit,
  // kept so a save writes back these keys instead of dropping them.
  const [baseMeta, setBaseMeta] = useState<Record<string, any>>({});

  const loadDocuments = useCallback(async () => {
    try {
      setDocumentsError(null);
      setMyDocuments(await documentsService.getDocuments());
    } catch (e) {
      console.error(e);
      setDocumentsError('Could not load your uploaded documents.');
    }
  }, []);

  useEffect(() => {
    void loadDocuments();
  }, [loadDocuments]);

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
        setBaseMeta(meta);
        if (Array.isArray(meta.portsOfOperation)) setPortsOfOperation(meta.portsOfOperation);
        if (Array.isArray(meta.requiredServices)) setRequiredServices(meta.requiredServices);
        if (Array.isArray(meta.serviceLocations)) setServiceLocations(meta.serviceLocations);
        if (Array.isArray(meta.supplierTypes)) setSupplierTypes(meta.supplierTypes);
        if (typeof meta.procurementMethod === 'string' && meta.procurementMethod) setProcurementMethod(meta.procurementMethod);
        if (typeof meta.responseTime === 'string' && meta.responseTime) setResponseTime(meta.responseTime);
      }
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await profilesService.updateMyProfile({
        company_name: companyName,
        bio: bio,
        offices: regions,
        contacts: [{ name: primaryContact, title: designation, phone: contactNumber, email: email }],
        profile_metadata: {
          ...baseMeta,
          regNumber,
          website,
          companyType,
          gstNumber,
          numVessels,
          fleetTypes,
          prefs,
          portsOfOperation,
          requiredServices,
          serviceLocations,
          supplierTypes,
          procurementMethod,
          responseTime
        }
      });
      alert('Profile updated successfully!');
    } catch (e) {
      console.error(e);
      alert('Failed to update profile.');
    } finally {
      // Runs on success, on failure and on an unexpected throw, so the button
      // always comes back out of its saving state.
      setSaving(false);
    }
  };

  const toggleFleet = (t: string) => setFleetTypes(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);
  const toggleRegion = (r: string) => setRegions(prev => prev.includes(r) ? prev.filter(x => x !== r) : [...prev, r]);
  const togglePref = (i: number) => setPrefs(prev => prev.map((p, idx) => idx === i ? { ...p, on: !p.on } : p));

  const handleDocumentUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploadingDoc(true);
    let uploaded = 0;
    let failed = 0;
    try {
      for (const file of Array.from(files)) {
        try {
          // "other" is the backend's general-purpose document type. These
          // files are reviewed by an admin and do not enter OCR.
          await documentsService.uploadDocument(file, { document_type: 'other' });
          uploaded++;
        } catch (e) {
          console.error(e);
          failed++;
        }
      }
      await loadDocuments();
      if (failed > 0) {
        alert(`${uploaded} uploaded, ${failed} failed. Please check the file type and try again.`);
      } else {
        alert(`${uploaded} document${uploaded === 1 ? '' : 's'} uploaded for admin review.`);
      }
    } finally {
      setUploadingDoc(false);
    }
  };

  if (loading) return <div style={{background: C.bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.cyan}}>Loading...</div>;


  return (
    <div style={{ background: C.bg, color: C.text, fontFamily: I, minHeight: '100vh' }}>

      {/* Atmospheric glows */}
      <div style={{ position: 'fixed', top: 0, right: 0, width: '50%', height: '50%', background: 'rgba(76,157,176,0.05)', filter: 'blur(120px)', pointerEvents: 'none', zIndex: 0, borderRadius: '50%' }} />
      <div style={{ position: 'fixed', bottom: 0, left: 0, width: '33%', height: '33%', background: 'rgba(37,99,235,0.05)', filter: 'blur(120px)', pointerEvents: 'none', zIndex: 0, borderRadius: '50%' }} />

      {/* SIDE NAV */}
      <ClientSidebar activePath="/company-profile" />

      {/* TOP NAV */}
      <header className="role-header" style={{ position: 'fixed', top: 0, left: 'var(--sidebar-width, 256px)', right: 0, height: 64, zIndex: 40, background: 'var(--bg-glass)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingLeft: 'var(--header-padding-left, 4.5rem)', paddingRight: '2rem', transition: 'left 0.25s cubic-bezier(0.4, 0, 0.2, 1), padding-left 0.25s cubic-bezier(0.4, 0, 0.2, 1)' }}>
        <div className="role-header-status" style={{ display: 'flex', gap: '1.5rem' }}>
          {['Fleet','Logistics','Analytics'].map(l => (
            <a key={l} href="#" style={{ fontSize: '0.875rem', fontWeight: 500, color: C.muted, textDecoration: 'none', transition: 'color 0.2s' }}
              onMouseEnter={e => (e.currentTarget.style.color = C.text)} onMouseLeave={e => (e.currentTarget.style.color = C.muted)}>{l}</a>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          <div className="role-header-search" style={{ position: 'relative' }}>
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
            <div className="role-header-divider" style={{ width: 1, height: 32, background: C.borderV }} />
            <button style={{ width: 32, height: 32, borderRadius: 8, background: C.bgHigh, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', cursor: 'pointer', color: C.primary }}>
              <span className="material-symbols-outlined" style={{ fontSize: '1.25rem' }}>account_circle</span>
            </button>
          </div>
        </div>
      </header>

      {/* MAIN */}
      <main style={{ marginLeft: 'var(--sidebar-width, 256px)', paddingTop: 96, paddingBottom: 120, padding: '96px 3rem 120px', maxWidth: 1280, position: 'relative', zIndex: 1, transition: 'margin-left 0.25s cubic-bezier(0.4, 0, 0.2, 1)' }}>

        {/* Page header */}
        <div style={{ marginBottom: '3rem' }}>
          <h2 style={{ fontFamily: M, fontWeight: 800, fontSize: '2.25rem', color: C.text, letterSpacing: '-0.03em', margin: '0 0 0.5rem' }}>My Company Profile</h2>
          <p style={{ color: C.muted, fontSize: '0.9rem', lineHeight: 1.7, maxWidth: 600, margin: 0 }}>Manage your company profile, procurement preferences, and fleet information. This profile helps verified suppliers and service providers understand your operational requirements.</p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>

          {/* 1. Company Information */}
          <section style={glass}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
              <div style={{ width: 40, height: 40, borderRadius: 8, background: 'rgba(76,157,176,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span className="material-symbols-outlined" style={{ color: C.cyan }}>business</span></div>
              <h3 style={{ fontFamily: M, fontWeight: 700, fontSize: '1.2rem', color: C.text, margin: 0 }}>Company Information</h3>
            </div>
            <div style={{ display: 'flex', gap: '2.5rem', flexWrap: 'wrap' }}>
              {/* Logo upload */}
              <div style={{ flexShrink: 0 }}>
                <label style={{ width: 128, height: 128, borderRadius: 12, background: C.bgLowest, border: `2px dashed ${C.borderV}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: C.dim, cursor: 'pointer', transition: 'border-color 0.2s', boxSizing: 'border-box' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = C.primary; (e.currentTarget as HTMLElement).style.background = 'rgba(37,99,235,0.05)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = C.borderV; (e.currentTarget as HTMLElement).style.background = C.bgLowest; }}
                  onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); if (e.dataTransfer.files.length) alert(`Added ${e.dataTransfer.files.length} file(s)`); }}>
                  <input type="file" style={{ display: 'none' }} onChange={e => { if (e.target.files?.length) alert(`Added ${e.target.files.length} file(s)`); }} />
                  <span className="material-symbols-outlined" style={{ fontSize: '2rem', marginBottom: 4 }}>add_a_photo</span>
                  <span style={{ fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Upload Logo</span>
                </label>
              </div>
              {/* Fields */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="mobile-grid-collapse" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
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
            <div className="mobile-grid-collapse" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1.5rem', marginTop: '1.5rem' }}>
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
              <div style={{ width: 40, height: 40, borderRadius: 8, background: 'rgba(76,157,176,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span className="material-symbols-outlined" style={{ color: C.cyan }}>directions_boat</span></div>
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
              <div style={{ width: 40, height: 40, borderRadius: 8, background: 'rgba(76,157,176,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span className="material-symbols-outlined" style={{ color: C.cyan }}>anchor</span></div>
              <h3 style={{ fontFamily: M, fontWeight: 700, fontSize: '1.2rem', color: C.text, margin: 0 }}>Ports &amp; Services</h3>
            </div>
            <div className="mobile-grid-collapse" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                <div>
                  <label style={lbl} htmlFor="ports-of-operation-input">Ports of Operation</label>
                  <TagEditor
                    inputId="ports-of-operation-input"
                    tags={portsOfOperation}
                    color={C.text}
                    placeholder="Add a port..."
                    onChange={setPortsOfOperation}
                  />
                </div>
                <div>
                  <label style={lbl} htmlFor="required-services-input">Frequently Required Services</label>
                  <TagEditor
                    inputId="required-services-input"
                    tags={requiredServices}
                    color={C.cyan}
                    placeholder="Add a service..."
                    onChange={setRequiredServices}
                  />
                </div>
              </div>
              <div>
                <label style={lbl} htmlFor="service-locations-input">Preferred Service Locations</label>
                <div style={{ height: 96, borderRadius: 12, overflow: 'hidden', position: 'relative', marginBottom: '0.75rem' }}>
                  <div style={{ position: 'absolute', inset: 0, background: MAP_GRADIENT }} />
                  <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, #071A2E, transparent)' }} />
                </div>
                <TagEditor
                  inputId="service-locations-input"
                  tags={serviceLocations}
                  color={C.text}
                  placeholder="Add a location..."
                  onChange={setServiceLocations}
                />
              </div>
            </div>
          </section>

          {/* 4. Procurement Preferences */}
          <section style={glass}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
              <div style={{ width: 40, height: 40, borderRadius: 8, background: 'rgba(76,157,176,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span className="material-symbols-outlined" style={{ color: C.cyan }}>shopping_cart</span></div>
              <h3 style={{ fontFamily: M, fontWeight: 700, fontSize: '1.2rem', color: C.text, margin: 0 }}>Procurement Preferences</h3>
            </div>
            <div className="mobile-grid-collapse" style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '2.5rem', alignItems: 'start' }}>
              <div>
                <label style={lbl}>Preferred Supplier Types</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.75rem' }}>
                  {SUPPLIER_TYPES.map(t => (
                    <label key={t} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={supplierTypes.includes(t)}
                        onChange={() => setSupplierTypes(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])}
                        style={{ accentColor: C.cyan, width: 16, height: 16 }}
                      />
                      <span style={{ fontSize: '0.875rem', color: C.text }}>{t}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="mobile-grid-collapse" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                <div>
                  <label style={lbl} htmlFor="procurement-method-select">Preferred Procurement Method</label>
                  <select
                    id="procurement-method-select"
                    style={inp}
                    value={procurementMethod}
                    onChange={e => setProcurementMethod(e.target.value)}
                    onFocus={onF}
                    onBlur={onB}
                  >
                    {PROCUREMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl} htmlFor="response-time-select">Preferred Response Time</label>
                  <select
                    id="response-time-select"
                    style={inp}
                    value={responseTime}
                    onChange={e => setResponseTime(e.target.value)}
                    onFocus={onF}
                    onBlur={onB}
                  >
                    {RESPONSE_TIMES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>
            </div>
          </section>

          {/* 5. Documents & Verification */}
          <section style={glass}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap', gap: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div style={{ width: 40, height: 40, borderRadius: 8, background: 'rgba(76,157,176,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span className="material-symbols-outlined" style={{ color: C.cyan }}>verified_user</span></div>
                <h3 style={{ fontFamily: M, fontWeight: 700, fontSize: '1.2rem', color: C.text, margin: 0 }}>Documents &amp; Verification</h3>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1.25rem', borderRadius: 8, background: 'rgba(76,157,176,0.1)', border: `1px solid rgba(76,157,176,0.3)`, color: C.cyan, fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', transition: 'background 0.2s', boxSizing: 'border-box' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(76,157,176,0.2)')} onMouseLeave={e => (e.currentTarget.style.background = 'rgba(76,157,176,0.1)')}
                onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); handleDocumentUpload(e.dataTransfer.files); }}>
                <input
                  type="file"
                  multiple
                  accept=".pdf,.doc,.docx,.txt,.csv,.xlsx,.png,.jpg,.jpeg,.tif,.tiff,.webp"
                  style={{ display: 'none' }}
                  onChange={e => handleDocumentUpload(e.target.files)}
                />
                <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>{uploadingDoc ? 'hourglass_empty' : 'upload_file'}</span>{uploadingDoc ? 'Uploading...' : 'Upload New Document'}
              </label>
            </div>
            
            {documentsError && (
              <p style={{ fontSize: '0.8rem', color: 'var(--color-error)', margin: '0 0 1rem' }}>{documentsError}</p>
            )}
            
            <div className="mobile-table-scroll" style={{ borderRadius: 12, overflowX: 'auto', border: `1px solid ${C.border}` }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ background: C.bgLowest, fontSize: '0.6rem', color: C.muted, textTransform: 'uppercase', letterSpacing: '0.15em', fontWeight: 700 }}>
                    {['Document Name','Upload Date','Status','Actions'].map((h, i) => (
                      <th key={h} style={{ padding: '1rem 1.5rem', textAlign: i === 3 ? 'right' : 'left' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {myDocuments === null && (
                    <tr>
                      <td colSpan={4} style={{ padding: '2rem', textAlign: 'center', color: C.dim }}>Loading your documents…</td>
                    </tr>
                  )}
                  {myDocuments !== null && myDocuments.length === 0 && (
                    <tr>
                      <td colSpan={4} style={{ padding: '2rem', textAlign: 'center', color: C.dim, fontStyle: 'italic' }}>No documents uploaded yet.</td>
                    </tr>
                  )}
                  {myDocuments !== null && myDocuments.map(doc => {
                    const status = doc.verification_status || 'pending';
                    const color = docStatusColor(status);
                    return (
                      <tr key={doc.id} style={{ borderTop: `1px solid ${C.border}`, transition: 'background 0.2s' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(36,42,52,0.5)')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                        <td style={{ padding: '1rem 1.5rem', fontSize: '0.875rem', fontWeight: 500, color: C.text }}>{doc.name || 'Document'}</td>
                        <td style={{ padding: '1rem 1.5rem', fontSize: '0.875rem', color: C.muted }}>{formatDocDate(doc.created_at)}</td>
                        <td style={{ padding: '1rem 1.5rem' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 999, background: docStatusTint(status), color, fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                            <div style={{ width: 6, height: 6, borderRadius: '50%', background: color }} />
                            {docStatusLabel(status)}
                          </span>
                        </td>
                        <td style={{ padding: '1rem 1.5rem', textAlign: 'right' }}>
                          <button
                            onClick={() => void (async () => {
                              try {
                                const objectUrl = await documentsService.getDocumentFile(doc.id);
                                const link = document.createElement('a');
                                link.href = objectUrl;
                                link.target = '_blank';
                                link.rel = 'noreferrer';
                                document.body.appendChild(link);
                                link.click();
                                link.remove();
                                window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
                              } catch (e) {
                                console.error(e);
                                alert('Could not open this document. Your session may have expired.');
                              }
                            })()}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted, transition: 'color 0.2s' }}
                            onMouseEnter={e => (e.currentTarget.style.color = C.cyan)} onMouseLeave={e => (e.currentTarget.style.color = C.muted)}>
                            <span className="material-symbols-outlined" style={{ fontSize: '1.2rem' }}>open_in_new</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {/* 6. Account Preferences */}
          <section style={glass}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
              <div style={{ width: 40, height: 40, borderRadius: 8, background: 'rgba(76,157,176,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span className="material-symbols-outlined" style={{ color: C.cyan }}>tune</span></div>
              <h3 style={{ fontFamily: M, fontWeight: 700, fontSize: '1.2rem', color: C.text, margin: 0 }}>Account Preferences</h3>
            </div>
            <div className="mobile-grid-collapse" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 3rem' }}>
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
      <footer style={{ position: 'fixed', bottom: 0, left: 256, right: 0, padding: '1.25rem 3rem', background: 'var(--bg-glass)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', borderTop: `1px solid ${C.border}`, display: 'flex', justifyContent: 'flex-end', gap: '1rem', zIndex: 40 }}>
        <button style={{ padding: '0.6rem 1.5rem', borderRadius: 8, border: `1px solid ${C.borderV}`, background: 'transparent', color: C.text, fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer', transition: 'background 0.2s' }}
          onMouseEnter={e => (e.currentTarget.style.background = C.bgCardH)} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>Preview Public Profile</button>
        <button onClick={() => void handleSave()} disabled={saving} style={{ padding: '0.6rem 2rem', borderRadius: 8, background: `linear-gradient(to right,${C.primary},${C.cyan})`, color: '#2563eb', fontWeight: 700, fontSize: '0.875rem', border: 'none', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1, boxShadow: '0 4px 16px rgba(76,157,176,0.1)', transition: 'all 0.2s' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 24px rgba(76,157,176,0.25)'; (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 16px rgba(76,157,176,0.1)'; (e.currentTarget as HTMLElement).style.transform = 'none'; }}>
          {saving ? 'Saving…' : 'Save Company Profile'}
        </button>
      </footer>

    </div>
  );
};

export default CompanyProfile;
