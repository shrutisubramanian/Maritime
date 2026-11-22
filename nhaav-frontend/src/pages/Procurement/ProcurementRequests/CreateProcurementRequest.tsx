import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../../hooks/useAuth';
import { API_BASE_URL, getCsrfHeaders } from '../../../services/apiEnv';

const C = {
  bg: 'var(--color-background)', bgCard: 'var(--color-surface)', bgCardH: 'var(--color-surface)', bgHigh: 'var(--color-surface-deep)',
  bgBright: 'var(--color-surface-deep)', bgLowest: 'var(--color-surface-alt)', bgLow: 'var(--color-surface-alt)',
  border: 'var(--color-border)', borderV: 'var(--color-border-strong)',
  text: 'var(--color-text)', muted: 'var(--color-muted)', dim: 'var(--color-faint)',
  cyan: 'var(--color-brand)', primary: 'var(--color-brand)', secondary: 'var(--color-muted)',
  error: 'var(--color-error)', white: 'var(--color-text)',
};
const M = "'Manrope', sans-serif";
const I = "'Inter', sans-serif";
const lbl: React.CSSProperties = { display: 'block', fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.15em', color: 'rgba(76,157,176,0.8)', marginBottom: '0.5rem' };
const inp: React.CSSProperties = { width: '100%', background: C.bgLowest, border: 'none', borderBottom: `2px solid ${C.borderV}`, color: C.text, fontFamily: I, fontSize: '0.9rem', padding: '0.75rem 0', outline: 'none', transition: 'border-color 0.2s', boxSizing: 'border-box' as const };
const sel: React.CSSProperties = { ...inp, appearance: 'none' as const, paddingRight: '2rem' };
const onF = (e: React.FocusEvent<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>) => (e.currentTarget.style.borderBottomColor = C.cyan);
const onB = (e: React.FocusEvent<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>) => (e.currentTarget.style.borderBottomColor = C.borderV);

import { ClientSidebar } from '../../../components/ClientSidebar';
import { ParsedResultBox, ParsedResult } from '../../../components/ParsedResultBox';
import { requestsService } from '../../../services/requests';
import { INDIAN_PORTS } from '../../../constants/ports';
import { useServiceCatalogue } from '../../../hooks/useServiceCatalogue';

// Document types accepted by POST /documents/upload (DocumentType enum).
// Kept in sync with the canonical selector on Documents/Verification.
const DOCUMENT_TYPES = [
  { value: 'cdc', label: 'Continuous Discharge Certificate' },
  { value: 'coc', label: 'Certificate of Competency' },
  { value: 'surveyor_license', label: 'Surveyor License' },
  { value: 'vendor_registration', label: 'Vendor Registration' },
  { value: 'kyc_due_diligence', label: 'KYC Due Diligence' },
  { value: 'form_10f', label: 'Form 10F' },
  { value: 'no_pe_declaration', label: 'No PE Declaration' },
  { value: 'tax_invoice', label: 'Tax Invoice' },
  { value: 'quotation', label: 'Quotation' },
];

const PROCUREMENT_CATEGORIES = [
  'Ship Stores',
  'Deck Stores',
  'Engine Stores',
  'Cabin Stores',
  'Provisions',
  'Ship Spare Parts',
  'Deck & Machinery Spares',
  'Mooring & Berthing Equipment',
];


export const CreateProcurementRequest: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const queryType = searchParams.get('type');
  const initialType: 'procurement' | 'service' = queryType === 'service' ? 'service' : 'procurement';

  const [reqType, setReqType] = useState<'procurement'|'service'>(initialType);
  const [priority, setPriority] = useState<'low'|'med'|'high'|'urgent'>('med');
  const [dragOver, setDragOver] = useState(false);

  const { groups, loading: catalogueLoading, error: catalogueError } = useServiceCatalogue();

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState(initialType === 'procurement' ? 'Ship Stores' : '');
  const [serviceName, setServiceName] = useState('');
  const [port, setPort] = useState('Kandla');
  const [description, setDescription] = useState('');
  const [quantity, setQuantity] = useState<number>(1);
  const [loading, setLoading] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [parsedResult, setParsedResult] = useState<ParsedResult | null>(null);
  const [docProcessing, setDocProcessing] = useState(false);
  const [documentType, setDocumentType] = useState('');
  const [uploadedCount, setUploadedCount] = useState(0);

  // The service half of this form uses the same backend catalogue as the
  // Services page and provider listing form; procurement categories stay local.
  useEffect(() => {
    if (reqType !== 'service' || !groups.length) return;
    setCategory(current => current || groups[0].category);
    setServiceName(current => current || groups[0].subServices[0] || '');
  }, [groups, reqType]);

  const handleReqTypeChange = (t: 'procurement' | 'service') => {
    setReqType(t);
    setCategory(t === 'procurement' ? 'Ship Stores' : groups[0]?.category || '');
    setServiceName(t === 'procurement' ? '' : groups[0]?.subServices[0] || '');
  };

  const handleServiceCategoryChange = (next: string) => {
    setCategory(next);
    const first = groups.find(g => g.category === next)?.subServices[0];
    if (first) setServiceName(first);
  };

  const serviceCategoryOptions = category && !groups.some(g => g.category === category)
    ? [category, ...groups.map(g => g.category)]
    : groups.map(g => g.category);
  const serviceSubcategories = groups.find(g => g.category === category)?.subServices ?? [];
  const serviceNameOptions = serviceName && !serviceSubcategories.includes(serviceName)
    ? [serviceName, ...serviceSubcategories]
    : serviceSubcategories;

  const handlePublish = async () => {
    if (!title || !description) {
      alert("Please enter title and description.");
      return;
    }
    if (reqType === 'service' && (!category || !serviceName)) {
      alert(catalogueError || 'Please choose a service category and specific service.');
      return;
    }
    try {
      setLoading(true);
      await requestsService.createRequest({
        title,
        description,
        port,
        service_type: reqType === 'service' ? serviceName : category,
        urgency: priority === 'med' ? 'medium' : priority,
        request_type: reqType === 'procurement' ? 'supply' : 'service',
        quantity,
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
      <ClientSidebar />

      {/* TOP NAV */}
      <header style={{ position: 'fixed', top: 0, left: 'var(--sidebar-width, 256px)', right: 0, height: 64, zIndex: 40, background: 'var(--bg-glass)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingLeft: 'var(--header-padding-left, 4.5rem)', paddingRight: '2rem', transition: 'left 0.25s cubic-bezier(0.4, 0, 0.2, 1), padding-left 0.25s cubic-bezier(0.4, 0, 0.2, 1)' }}>
        <h2 style={{ fontFamily: M, fontWeight: 600, fontSize: '1.2rem', color: C.text, margin: 0, letterSpacing: '-0.02em' }}>
          {reqType === 'procurement' ? 'Create Procurement Request' : 'Create Service Request'}
        </h2>
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
            <div onClick={() => navigate('/company-profile')} style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--color-brand-tint)', color: C.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer' }}>{(user?.full_name || user?.name || user?.email || '?').trim().charAt(0).toUpperCase()}</div>
          </div>
        </div>
      </header>

      {/* MAIN */}
      <main style={{ marginLeft: 'var(--sidebar-width, 256px)', marginTop: 64, padding: '2rem', height: 'calc(100vh - 64px)', overflowY: 'auto', paddingBottom: 24, transition: 'margin-left 0.25s cubic-bezier(0.4, 0, 0.2, 1)' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', gap: '2rem', alignItems: 'flex-start' }}>

          {/* FORM */}
          <div style={{ flex: 1 }}>
            <section style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 16, overflow: 'hidden' }}>
              <div style={{ padding: '2rem' }}>
                {/* Header + Interactive Request Type Selector */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '2.5rem' }}>
                  <div>
                    <h3 style={{ fontFamily: M, fontWeight: 700, fontSize: '1.4rem', color: C.text, margin: '0 0 4px' }}>Request Details</h3>
                    <p style={{ fontSize: '0.875rem', color: C.muted, margin: 0 }}>
                      {reqType === 'service'
                        ? 'Specify your maritime service and repair requirements'
                        : 'Specify your maritime procurement and supply requirements'}
                    </p>
                  </div>
                  <div style={{
                    display: 'flex',
                    background: C.bgLowest,
                    borderRadius: 12,
                    padding: 4,
                    border: `1px solid ${C.border}`,
                    gap: 4
                  }}>
                    <button
                      type="button"
                      onClick={() => handleReqTypeChange('procurement')}
                      style={{
                        padding: '0.6rem 1.25rem',
                        borderRadius: 8,
                        border: 'none',
                        fontSize: '0.85rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        transition: 'all 0.2s',
                        background: reqType === 'procurement' ? 'linear-gradient(135deg,#4C9DB0,#4C9DB0)' : 'transparent',
                        color: reqType === 'procurement' ? C.white : C.muted,
                        boxShadow: reqType === 'procurement' ? '0 4px 12px rgba(76,157,176,0.2)' : 'none'
                      }}>
                      <span className="material-symbols-outlined" style={{ fontSize: '1.1rem' }}>inventory_2</span>
                      Procurement Request
                    </button>
                    <button
                      type="button"
                      onClick={() => handleReqTypeChange('service')}
                      style={{
                        padding: '0.6rem 1.25rem',
                        borderRadius: 8,
                        border: 'none',
                        fontSize: '0.85rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        transition: 'all 0.2s',
                        background: reqType === 'service' ? 'linear-gradient(135deg,#4C9DB0,#4C9DB0)' : 'transparent',
                        color: reqType === 'service' ? C.white : C.muted,
                        boxShadow: reqType === 'service' ? '0 4px 12px rgba(76,157,176,0.2)' : 'none'
                      }}>
                      <span className="material-symbols-outlined" style={{ fontSize: '1.1rem' }}>build</span>
                      Service Request
                    </button>
                  </div>
                </div>

                {/* Fields grid */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                  <div style={{ gridColumn: 'span 2' }}>
                    <label style={lbl}>Request Title</label>
                    <input type="text" placeholder={reqType === 'service' ? "e.g., Main Engine Overhaul & Hull Inspection at Berth 4" : "e.g., Heavy-Duty Mooring Equipment for Terminal A"} style={{ ...inp, fontSize: '1.1rem' }} onFocus={onF} onBlur={onB} value={title} onChange={e => setTitle(e.target.value)} />
                  </div>
                  <div>
                    <label style={lbl}>Category</label>
                    <div style={{ position: 'relative' }}>
                      <select style={sel} disabled={reqType === 'service' && catalogueLoading} onFocus={onF} onBlur={onB} value={category} onChange={e => (reqType === 'service' ? handleServiceCategoryChange(e.target.value) : setCategory(e.target.value))}>
                        {(reqType === 'procurement' ? PROCUREMENT_CATEGORIES : serviceCategoryOptions).map(cat => (
                          <option key={cat} value={cat} style={{ background: C.bgCard, color: C.text }}>{cat}</option>
                        ))}
                      </select>
                      <span className="material-symbols-outlined" style={{ position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)', color: C.muted, fontSize: '1.1rem', pointerEvents: 'none' }}>expand_more</span>
                    </div>
                  </div>
                  {reqType === 'service' && (
                    <div>
                      <label style={lbl}>Specific Service</label>
                      <div style={{ position: 'relative' }}>
                        <select style={sel} disabled={catalogueLoading} onFocus={onF} onBlur={onB} value={serviceName} onChange={e => setServiceName(e.target.value)}>
                          {serviceNameOptions.map(s => (
                            <option key={s} value={s} style={{ background: C.bgCard, color: C.text }}>{s}</option>
                          ))}
                        </select>
                        <span className="material-symbols-outlined" style={{ position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)', color: C.muted, fontSize: '1.1rem', pointerEvents: 'none' }}>expand_more</span>
                      </div>
                    </div>
                  )}
                  <div>
                    <label style={lbl}>Required Port</label>
                    <div style={{ position: 'relative' }}>
                      <select style={sel} onFocus={onF} onBlur={onB} value={port} onChange={e => setPort(e.target.value)}>
                        {INDIAN_PORTS.map(p => (
                          <option key={p.id} value={p.value} style={{ background: C.bgCard, color: C.text }}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                      <span className="material-symbols-outlined" style={{ position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)', color: C.cyan, fontSize: '1.1rem', pointerEvents: 'none' }}>location_on</span>
                    </div>
                  </div>
                  <div style={{ gridColumn: 'span 2', background: 'rgba(76,157,176,0.06)', padding: '0.75rem 1rem', borderRadius: 10, border: '1px solid rgba(76,157,176,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8rem', color: C.text }}>
                      <span className="material-symbols-outlined" style={{ color: C.cyan, fontSize: '1.1rem' }}>verified</span>
                      <span>Services &amp; Providers matched for <strong style={{ color: C.white }}>Port of {port}</strong></span>
                    </div>
                    <span style={{ fontSize: '0.7rem', color: C.cyan, fontWeight: 700, background: 'rgba(76,157,176,0.15)', padding: '3px 8px', borderRadius: 999 }}>Verified Port Coverage</span>
                  </div>
                  <div>
                    <label style={lbl}>Preferred Delivery Date</label>
                    <input type="date" style={inp} onFocus={onF} onBlur={onB} />
                  </div>
                  <div>
                    <label style={lbl}>Quantity</label>
                    <input type="number" min="1" value={quantity} onChange={e => setQuantity(parseInt(e.target.value) || 1)} style={inp} onFocus={onF} onBlur={onB} />
                  </div>
                  <div>
                    <label style={lbl}>Priority Level</label>
                    <div style={{ display: 'flex', background: C.bgLowest, borderRadius: 8, padding: 4, border: `1px solid ${C.border}` }}>
                      {(['low','med','high','urgent'] as const).map(p => (
                        <button key={p} onClick={() => setPriority(p)} style={{ flex: 1, padding: '0.5rem', fontSize: '0.7rem', fontWeight: 700, borderRadius: 6, border: 'none', cursor: 'pointer', transition: 'all 0.2s', background: priority === p ? (p === 'urgent' ? 'rgba(220,38,38,0.1)' : 'rgba(76,157,176,0.1)') : 'transparent', color: priority === p ? (p === 'urgent' ? C.error : C.cyan) : C.muted }}>
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
                    {/* Real DocumentType selector — the declared type is persisted
                        with each uploaded document; no silent default. */}
                    <div style={{ marginBottom: '1rem', maxWidth: 420 }}>
                      <label style={lbl}>Document Type</label>
                      <div style={{ position: 'relative' }}>
                        <select style={sel} value={documentType} onChange={e => setDocumentType(e.target.value)} onFocus={onF} onBlur={onB}>
                          <option value="" disabled style={{ background: C.bgCard, color: C.muted }}>Select document type…</option>
                          {DOCUMENT_TYPES.map(dt => (
                            <option key={dt.value} value={dt.value} style={{ background: C.bgCard, color: C.text }}>{dt.label}</option>
                          ))}
                        </select>
                        <span className="material-symbols-outlined" style={{ position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)', color: C.muted, fontSize: '1.1rem', pointerEvents: 'none' }}>expand_more</span>
                      </div>
                      <p style={{ fontSize: '0.7rem', color: C.muted, margin: '0.35rem 0 0' }}>
                        The selected type is saved with each document and shown to reviewers.
                      </p>
                    </div>
                    <label onDragOver={e => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={e => { e.preventDefault(); setDragOver(false); if(e.dataTransfer.files.length) setPendingFiles(prev => [...prev, ...Array.from(e.dataTransfer.files)]); }}
                      style={{ border: `2px dashed ${dragOver ? C.primary : C.borderV}`, borderRadius: 16, padding: '2.5rem 1rem', display: 'flex', flexDirection: 'column', alignItems: 'center', background: 'var(--color-surface)', transition: 'all 0.2s', cursor: 'pointer', boxSizing: 'border-box' }}>
                      <input type="file" multiple style={{ display: 'none' }} onChange={e => { if(e.target.files?.length) setPendingFiles(prev => [...prev, ...Array.from(e.target!.files!)]); }} />
                      <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(37,99,235,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: '2rem', color: C.primary }}>upload_file</span>
                      </div>
                      <p style={{ fontWeight: 600, color: C.text, margin: '0 0 4px' }}>Drop files here or click to browse</p>
                      <p style={{ fontSize: '0.75rem', color: C.muted, margin: 0 }}>Support for PDF, DOCX, JPG, PNG, TIFF (Max 25MB per file)</p>
                    </label>
                    {/* Process Document button */}
                    {pendingFiles.length > 0 && (
                      <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end' }}>
                        <button
                          disabled={docProcessing}
                          onClick={async () => {
                            if (docProcessing || !pendingFiles.length) return;
                            if (!documentType) {
                              alert('Select a document type before processing.');
                              return;
                            }
                            setDocProcessing(true);
                            try {
                              for (const file of pendingFiles) {
                                const formData = new FormData();
                                formData.append('file', file);
                                formData.append('document_type', documentType);
                                const res = await fetch(`${API_BASE_URL}/documents/upload`, {
                                  // The session is an httpOnly cookie, so the
                                  // request must ask for credentials to be sent;
                                  // the CSRF header proves it came from the app.
                                  credentials: 'include',
                                  method: 'POST',
                                  headers: getCsrfHeaders('POST'),
                                  body: formData,
                                });
                                if (res.ok) {
                                  const data = await res.json();
                                  if (data.status === 'success') {
                                    setUploadedCount(c => c + 1);
                                  }
                                  if (data.status === 'success' && data.fields) {
                                    setParsedResult({
                                      document_type: data.document_type || data.document?.document_type || undefined,
                                      confidence: data.confidence ?? data.document?.verification_score ?? undefined,
                                      fields: data.fields,
                                      missing_fields: data.document?.ocr_extracted_data?.missing_fields || [],
                                    });
                                  }
                                }
                              }
                            } catch (err) {
                              console.error(err);
                              alert('Failed to process documents.');
                            } finally {
                              setDocProcessing(false);
                            }
                          }}
                          style={{
                            display: 'flex', alignItems: 'center', gap: '0.5rem',
                            padding: '0.6rem 1.5rem',
                            background: `linear-gradient(to right, ${C.primary}, ${C.cyan})`,
                            color: 'var(--color-on-brand)', fontWeight: 700, fontFamily: M,
                            fontSize: '0.8rem', border: 'none', borderRadius: 8,
                            cursor: docProcessing ? 'wait' : 'pointer',
                            boxShadow: '0 6px 20px rgba(76,157,176,0.2)',
                            opacity: docProcessing ? 0.75 : 1,
                          }}
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>
                            {docProcessing ? 'hourglass_empty' : 'document_scanner'}
                          </span>
                          {docProcessing ? 'Processing...' : `Process ${pendingFiles.length} Document${pendingFiles.length > 1 ? 's' : ''}`}
                        </button>
                      </div>
                    )}
                    {/* Parsed Result Box */}
                    <div style={{ marginTop: '1rem' }}>
                      <ParsedResultBox result={parsedResult || undefined} />
                    </div>
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
              <div style={{ padding: '1.25rem 1.5rem', borderBottom: `1px solid ${C.border}`, background: 'var(--color-surface)' }}>
                <h4 style={{ fontFamily: M, fontWeight: 700, color: C.text, margin: 0 }}>Request Summary</h4>
              </div>
              <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {[
                  { label: 'Type',        value: reqType === 'procurement' ? 'Procurement Request' : 'Service Request' },
                  { label: 'Target Port', value: `Port of ${port}` },
                  { label: 'Documents Uploaded', value: `${uploadedCount}` },
                ].map((row, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
                    <span style={{ color: C.muted }}>{row.label}</span>
                    <span style={{ fontWeight: 600, color: C.text }}>{row.value}</span>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
                  <span style={{ color: C.muted }}>Priority</span>
                  <span style={{ padding: '2px 8px', background: 'rgba(76,157,176,0.1)', color: C.cyan, fontSize: '0.6rem', fontWeight: 700, borderRadius: 4, textTransform: 'uppercase' }}>Medium</span>
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

          </aside>
        </div>

        {/* ACTION BUTTONS */}
        <div style={{ marginTop: '2rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button onClick={() => navigate(-1)} style={{ padding: '0.75rem 1.5rem', borderRadius: 8, border: `1px solid ${C.borderV}`, background: 'transparent', color: C.muted, fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '1.1rem' }}>close</span>Discard Request
          </button>
          <button style={{ padding: '0.75rem 1.5rem', borderRadius: 8, border: `1px solid ${C.borderV}`, background: 'transparent', color: C.text, fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer' }}>Save as Draft</button>
          <button disabled={loading} onClick={handlePublish} style={{ padding: '0.75rem 2.5rem', borderRadius: 8, background: 'linear-gradient(135deg, var(--color-brand), var(--color-brand-grad-end))', color: 'var(--color-on-brand)', fontWeight: 700, fontSize: '0.875rem', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', boxShadow: '0 8px 24px rgba(76,157,176,0.2)', opacity: loading ? 0.7 : 1 }}>
            {loading ? 'Publishing...' : 'Publish Request'}
            {!loading && <span className="material-symbols-outlined" style={{ fontSize: '1.1rem' }}>send</span>}
          </button>
        </div>
      </main>
    </div>
  );
};

export default CreateProcurementRequest;

