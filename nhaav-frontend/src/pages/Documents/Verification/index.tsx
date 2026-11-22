import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { documentsService } from '../../../services/documents';
import { BrandLogo } from '../../../components/BrandLogo';

/*
 * User-facing document upload surface.
 *
 * Any supported document can be uploaded here. Files are stored privately and
 * appear in the admin verification queue for review. OCR is intentionally not
 * part of this flow, so there are no extracted fields or extraction states to
 * present.
 */

const C = {
  bg: 'var(--color-background)',
  bgCard: 'var(--color-surface)',
  bgCardH: 'var(--color-surface)',
  bgHigh: 'var(--color-surface-deep)',
  bgLowest: 'var(--color-surface-alt)',
  border: 'var(--color-border)',
  borderV: 'var(--color-border-strong)',
  text: 'var(--color-text)',
  muted: 'var(--color-muted)',
  dim: 'var(--color-faint)',
  slate: 'var(--color-muted)',
  cyan: 'var(--color-brand)',
  primary: 'var(--color-brand)',
  primCont: 'var(--color-brand-tint-solid)',
  secondary: 'var(--color-muted)',
  error: 'var(--color-error)',
  green: 'var(--color-success)',
  amber: 'var(--color-warning)',
  white: 'var(--color-text)',
};
const fonts = { manrope: "'Manrope', sans-serif", inter: "'Inter', sans-serif" };

function typeLabel(value?: string | null): string {
  if (!value || value === 'other') return 'General document';
  return value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatStatusLabel(status?: string | null): string {
  if (!status) return 'Unknown';
  return status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function statusColor(status?: string | null): string {
  switch (status) {
    case 'verified':
      return C.green;
    case 'rejected':
      return C.error;
    case 'extracted':
      return C.primary;
    case 'pending':
    default:
      return C.amber;
  }
}

interface MyDocument {
  id: string;
  name: string | null;
  document_type: string | null;
  doc_category: string | null;
  verification_status: string | null;
  created_at: string;
}

export const Verification: React.FC = () => {
  const navigate = useNavigate();
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<FileList | null>(null);
  const [lastUploadError, setLastUploadError] = useState<string | null>(null);
  const [uploadNotice, setUploadNotice] = useState<string | null>(null);

  const [myDocuments, setMyDocuments] = useState<MyDocument[] | null>(null);
  const [myDocsError, setMyDocsError] = useState<string | null>(null);

  const loadMyDocuments = useCallback(async () => {
    try {
      setMyDocsError(null);
      const docs = await documentsService.getDocuments();
      setMyDocuments(docs);
    } catch (e) {
      console.error(e);
      setMyDocsError('Could not load your documents.');
    }
  }, []);

  useEffect(() => {
    void loadMyDocuments();
  }, [loadMyDocuments]);

  const handleFileDrop = (files: FileList) => {
    setPendingFiles(files);
    setLastUploadError(null);
    setUploadNotice(null);
  };

  const handleProcess = async () => {
    if (!pendingFiles || uploading) return;
    const files = Array.from(pendingFiles);
    try {
      setUploading(true);
      setLastUploadError(null);
      setUploadNotice(null);
      let okCount = 0;
      let failCount = 0;
      for (const file of files) {
        try {
          // Generic uploads are reviewed by an administrator; they do not use
          // the OCR pipeline. "other" is the backend's general-purpose type.
          await documentsService.uploadDocument(file, { document_type: 'other' });
          okCount++;
        } catch (fileError) {
          console.error(fileError);
          failCount++;
        }
      }
      if (failCount > 0 && okCount === 0) {
        setLastUploadError('Upload failed for all files. Check the file type and try again.');
      } else if (failCount > 0) {
        setLastUploadError(`${okCount} uploaded, ${failCount} failed. Check the document list below.`);
      } else {
        setUploadNotice(`${okCount} document${okCount === 1 ? '' : 's'} uploaded for admin review.`);
      }
      setPendingFiles(null);
      void loadMyDocuments();
    } catch (e) {
      console.error(e);
      setLastUploadError('Failed to upload documents.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div style={{ background: C.bg, color: C.text, fontFamily: fonts.inter, minHeight: '100vh', overflowX: 'hidden' }}>

      {/* ── TOP NAV ── */}
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50, height: 80,
        background: 'rgba(15,23,36,0.4)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
        backgroundImage: 'linear-gradient(to bottom, rgba(255,255,255,0.05), transparent)',
        boxShadow: '0 20px 40px rgba(76,157,176,0.08)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '0 2rem',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
          {/* The nav sits on a dark translucent glass bar, so the reversed
              (white) artwork is used. */}
          <BrandLogo height={26} variant="light" />
          <div style={{ display: 'flex', gap: '1.5rem' }}>
            {['Marketplace'].map(l => (
              <a key={l} href="#" onClick={e => { e.preventDefault(); navigate('/marketplace'); }}
                style={{ fontFamily: fonts.manrope, fontSize: '0.9rem', color: C.slate, textDecoration: 'none', letterSpacing: '-0.01em', transition: 'color 0.2s' }}
                onMouseEnter={e => (e.currentTarget.style.color = C.white)} onMouseLeave={e => (e.currentTarget.style.color = C.slate)}>{l}</a>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <span onClick={() => navigate('/notifications')} className="material-symbols-outlined" style={{ color: C.muted, cursor: 'pointer', transition: 'color 0.2s', fontSize: '1.4rem' }}
            onMouseEnter={e => (e.currentTarget.style.color = C.white)} onMouseLeave={e => (e.currentTarget.style.color = C.muted)}>notifications</span>
        </div>
      </nav>


      {/* ── MAIN GRID ── */}
      <main className="mobile-grid-collapse" style={{ minHeight: '100vh', padding: '128px 2rem 80px', maxWidth: 1280, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '2rem', alignItems: 'start' }}>

        {/* ── LEFT SIDEBAR ── */}
        <aside style={{ display: 'flex', flexDirection: 'column', gap: '2rem', position: 'sticky', top: 112, minWidth: 0 }}>

          {/* Heading */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <span style={{ fontSize: '0.65rem', color: C.muted, textTransform: 'uppercase', letterSpacing: '0.2em', fontWeight: 500, opacity: 0.7 }}>Documents & Verification</span>
            <h1 style={{ fontFamily: fonts.manrope, fontWeight: 800, fontSize: 'clamp(1.8rem,3vw,2.25rem)', color: C.white, letterSpacing: '-0.04em', margin: 0, lineHeight: 1.15 }}>Trust is our{' '}<br />primary anchor.</h1>
            <p style={{ fontSize: '0.9rem', color: C.muted, lineHeight: 1.7, margin: 0 }}>
              Upload any supporting document. Files are stored privately and sent to the Nhaav admin team for review.
            </p>
          </div>

          {/* Stepper — position reflects what this page actually is: upload step */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0, paddingTop: '0.5rem' }}>
            {[
              { n: 1, label: 'Profile', sub: 'Complete your company profile', active: false, done: false },
              { n: 2, label: 'Documentation', sub: 'Upload your documents', active: true, done: false },
              { n: 3, label: 'Verification', sub: 'Admin review of your documents', active: false, done: false },
            ].map((s, i, arr) => (
              <div key={s.n}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', opacity: !s.done && !s.active ? 0.4 : 1 }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, flexShrink: 0,
                    background: s.active ? C.primCont : C.bgHigh,
                    border: s.active ? `2px solid ${C.primary}` : 'none',
                    color: s.active ? C.primary : C.muted,
                  }}>
                    <span style={{ fontFamily: fonts.manrope }}>{s.n}</span>
                  </div>
                  <div>
                    <p style={{ fontSize: '0.875rem', fontWeight: 700, fontFamily: fonts.manrope, color: s.active ? C.primary : C.white, margin: '0 0 2px' }}>{s.label}</p>
                    {/* Chiffon ground => solid Yale ink, active or not. */}
                    <p style={{ fontSize: '0.7rem', color: C.primary, margin: 0 }}>{s.sub}</p>
                  </div>
                </div>
                {i < arr.length - 1 && (
                  <div style={{ width: 1, height: 32, background: C.borderV, margin: '0 0 0 19px' }} />
                )}
              </div>
            ))}
          </div>

          {/* Status summary — computed from the real persisted documents */}
          <div style={{ padding: '1.5rem', background: C.bgCard, borderRadius: 12, borderBottom: `2px solid ${C.border}`, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <h3 style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em', color: C.muted, margin: 0 }}>Your Document Status</h3>
            {myDocuments === null ? (
              <p style={{ fontSize: '0.8rem', color: C.dim, margin: 0 }}>Loading your documents…</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {(['pending', 'extracted', 'verified', 'rejected'] as const).map(status => {
                  const count = myDocuments.filter(d => d.verification_status === status).length;
                  return (
                    <div key={status} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: C.bgLowest, padding: '0.75rem 1rem', borderRadius: 8 }}>
                      <span style={{ fontSize: '0.875rem', color: C.text }}>{formatStatusLabel(status)}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: statusColor(status) }} />
                        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: statusColor(status) }}>{count}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </aside>


        {/* ── RIGHT CONTENT ── */}
        <section style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

          {/* Drop Zone */}
          <div style={{ position: 'relative' }}>
            {/* Glow border */}
            <div style={{
              position: 'absolute', inset: -4, borderRadius: 16,
              background: 'linear-gradient(135deg, rgba(37,99,235,0.2), rgba(76,157,176,0.2))',
              filter: 'blur(8px)', opacity: dragOver ? 1 : 0.25,
              transition: 'opacity 0.3s', pointerEvents: 'none',
            }} />
            <label
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files.length) handleFileDrop(e.dataTransfer.files); }}
              style={{
                position: 'relative', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
                background: dragOver ? 'var(--color-surface-alt)' : 'var(--bg-glass)',
                borderRadius: 12, padding: '3rem 2rem',
                borderBottom: `2px solid ${C.borderV}`,
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'center', textAlign: 'center', gap: '1.5rem',
                minHeight: 360, cursor: 'pointer', transition: 'background 0.2s', boxSizing: 'border-box'
              }}>
              <input
                type="file"
                multiple
                accept=".pdf,.doc,.docx,.txt,.csv,.xlsx,.png,.jpg,.jpeg,.tif,.tiff,.webp"
                style={{ display: 'none' }}
                onChange={e => { if (e.target.files?.length) handleFileDrop(e.target.files); }}
              />
              <div style={{ width: 80, height: 80, borderRadius: '50%', background: C.bgHigh, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 20px 40px rgba(76,157,176,0.08)' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '2.5rem', color: C.primary }}>cloud_upload</span>
              </div>
              <div style={{ maxWidth: 400 }}>
                <h2 style={{ fontFamily: fonts.manrope, fontWeight: 700, fontSize: '1.4rem', color: C.white, margin: '0 0 0.5rem', letterSpacing: '-0.02em' }}>Upload Documents</h2>
                <p style={{ fontSize: '0.875rem', color: C.muted, margin: 0, lineHeight: 1.6 }}>Drag and drop files here or click to browse. Any supporting document can be uploaded; the admin team reviews it.</p>
              </div>
              <div style={{ background: 'linear-gradient(to right, var(--color-brand), var(--color-brand-grad-end))', color: 'var(--color-on-brand)', padding: '0.75rem 2rem', borderRadius: 6, fontWeight: 700, letterSpacing: '-0.01em', transition: 'filter 0.2s' }}
                onMouseEnter={e => (e.currentTarget.style.filter = 'brightness(1.1)')} onMouseLeave={e => (e.currentTarget.style.filter = 'none')}>Select Files</div>
              <p style={{ fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.2em', color: `${C.muted}80`, margin: 0 }}>Accepted formats: PDF, DOC, DOCX, TXT, CSV, XLSX, PNG, JPG, JPEG, TIF, TIFF, WEBP (max 25 MB)</p>
            </label>
          </div>

          {/* Upload button — shown when files are pending */}
          {pendingFiles && (
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={handleProcess}
                disabled={uploading}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.5rem',
                  padding: '0.75rem 2rem',
                  background: `linear-gradient(to right, ${C.primary}, ${C.cyan})`,
                  color: 'var(--color-on-brand)', fontWeight: 700, fontFamily: fonts.manrope,
                  fontSize: '0.875rem', border: 'none', borderRadius: 8,
                  cursor: uploading ? 'wait' : 'pointer',
                  boxShadow: '0 8px 24px rgba(76,157,176,0.25)',
                  opacity: uploading ? 0.75 : 1,
                  transition: 'opacity 0.2s',
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '1.1rem' }}>
                  {uploading ? 'hourglass_empty' : 'upload'}
                </span>
                {uploading ? 'Uploading...' : `Upload ${pendingFiles.length} Document${pendingFiles.length > 1 ? 's' : ''}`}
              </button>
            </div>
          )}

          {/* Upload feedback */}
          {lastUploadError && (
            <p style={{ fontSize: '0.85rem', color: C.error, margin: 0 }} role="alert">{lastUploadError}</p>
          )}
          {uploadNotice && (
            <p style={{ fontSize: '0.85rem', color: C.green, margin: 0 }} role="status">{uploadNotice}</p>
          )}

          {/* My Documents — the persisted records from GET /documents/me */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <h3 style={{ fontFamily: fonts.manrope, fontWeight: 700, fontSize: '1.1rem', color: C.white, margin: '0 0 2px' }}>
                Uploaded Documents
              </h3>
              <p style={{ fontSize: '0.8rem', color: C.primary, margin: 0 }}>
                Files you have sent to the admin team, with their review status.
              </p>
            </div>

            {myDocsError && (
              <div style={{ padding: '1.25rem', background: C.bgCardH, borderRadius: 12, border: `1px solid ${C.border}` }}>
                <p style={{ fontSize: '0.875rem', color: C.error, margin: '0 0 0.75rem' }}>{myDocsError}</p>
                <button
                  onClick={() => void loadMyDocuments()}
                  style={{ background: C.primCont, color: C.primary, padding: '0.5rem 1.25rem', borderRadius: 6, fontWeight: 700, fontSize: '0.8rem', border: 'none', cursor: 'pointer' }}
                >
                  Retry
                </button>
              </div>
            )}

            {myDocuments === null && !myDocsError && (
              <p style={{ fontSize: '0.875rem', color: C.dim, margin: 0 }}>Loading your documents…</p>
            )}

            {myDocuments !== null && myDocuments.length === 0 && (
              <p style={{ fontSize: '0.85rem', color: C.dim, fontStyle: 'italic', padding: '1.5rem', background: 'var(--color-surface)', borderRadius: 12, border: `1px solid ${C.border}`, margin: 0, textAlign: 'center' }}>
                No documents uploaded yet. Add your first file above.
              </p>
            )}

            {myDocuments !== null && myDocuments.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {myDocuments.map(doc => (
                  <div key={doc.id} style={{ background: C.bgCardH, borderRadius: 12, border: `1px solid ${C.border}`, borderBottom: `2px solid ${C.border}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', padding: '1rem 1.25rem' }}>
                      <div style={{ minWidth: 0 }}>
                        <p style={{ fontSize: '0.9rem', fontWeight: 700, color: C.text, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {doc.name || typeLabel(doc.document_type)}
                        </p>
                        <p style={{ fontSize: '0.72rem', color: C.dim, margin: '2px 0 0' }}>
                          {typeLabel(doc.document_type)}
                          {doc.created_at ? ` · uploaded ${new Date(doc.created_at).toLocaleDateString()}` : ''}
                        </p>
                      </div>
                      <span style={{ padding: '3px 10px', borderRadius: 999, fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', color: statusColor(doc.verification_status), border: `1px solid ${statusColor(doc.verification_status)}`, flexShrink: 0 }}>
                        {formatStatusLabel(doc.verification_status)}
                      </span>
                    </div>
                    <div style={{ padding: '0 1.25rem 1.25rem' }}>
                      <a
                        href="#"
                        onClick={(e) => {
                          e.preventDefault();
                          void (async () => {
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
                            } catch (err) {
                              console.error(`Failed to open document ${doc.id}:`, err);
                              alert('Could not open this document. Your session may have expired.');
                            }
                          })();
                        }}
                        style={{ fontSize: '0.8rem', fontWeight: 700, color: C.primary, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>open_in_new</span>
                        View original document
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </section>
      </main>
    </div>
  );
};

export default Verification;
