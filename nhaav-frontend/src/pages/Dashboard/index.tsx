import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { FileText, CheckCircle2, Clock, UploadCloud, Eye, AlertCircle } from 'lucide-react';
import { documentsService } from '../../services/documents';

/**
 * Documents Dashboard.
 *
 * H9 Phase 4b: every fabricated metric was removed (see H9_DASHBOARD_AUDIT.md).
 * All displayed data comes from the authenticated user's own documents via the
 * existing `GET /documents/me` endpoint — no invented fields, no fabricated
 * trust metrics of any kind (H7 contract), no parser-health badges.
 */

/* Mirrors DocumentResponse from app/schemas/document.py — only fields the API
   actually returns. Do not add fields here that the backend does not provide. */
interface DashboardDocument {
  id: string;
  name: string | null;
  file_type: string | null;
  document_type: string | null;
  verification_status: string;
  created_at: string;
}

const TYPE_LABELS: Record<string, string> = {
  cdc: 'CDC (Continuous Discharge Certificate)',
  coc: 'COC (Certificate of Competency)',
  surveyor_license: 'Surveyor License',
  vendor_registration: 'Vendor Registration',
  kyc_due_diligence: 'KYC Due Diligence',
  form_10f: 'Form 10F',
  no_pe_declaration: 'No-PE Declaration',
  tax_invoice: 'Tax Invoice',
  quotation: 'Quotation',
  verification: 'Verification Document',
};

const STATUS_BADGES: Record<string, { label: string; cls: string }> = {
  pending: { label: 'Pending', cls: 'badge badge-amber' },
  extracted: { label: 'Extracted', cls: 'badge badge-blue' },
  verified: { label: 'Verified', cls: 'badge badge-green' },
  rejected: { label: 'Rejected', cls: 'badge badge-amber' },
};

const typeLabel = (t: string | null): string => (t ? (TYPE_LABELS[t] ?? t) : '—');

const relativeTime = (iso: string): string => {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min${mins === 1 ? '' : 's'} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  return new Date(iso).toLocaleDateString();
};

export const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const [docs, setDocs] = useState<DashboardDocument[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setDocs(null);
    setError(null);
    documentsService
      .getDocuments({})
      .then((data: DashboardDocument[]) => {
        if (!cancelled) setDocs(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!cancelled) setError('Could not load your documents. Please try again.');
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const total = docs?.length ?? 0;
  const pendingReview =
    docs?.filter((d) => d.verification_status === 'pending' || d.verification_status === 'extracted')
      .length ?? 0;
  const verified = docs?.filter((d) => d.verification_status === 'verified').length ?? 0;

  const stats = [
    { label: 'My Documents', value: docs ? String(total) : '—', icon: <FileText size={20} style={{ color: 'var(--accent-primary)' }} /> },
    { label: 'Pending Review', value: docs ? String(pendingReview) : '—', icon: <Clock size={20} style={{ color: 'var(--accent-cyan)' }} /> },
    { label: 'Verified', value: docs ? String(verified) : '—', icon: <CheckCircle2 size={20} style={{ color: 'var(--accent-emerald)' }} /> },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--text-main)' }}>Documents Dashboard</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.925rem' }}>
            Your uploaded documents and their review status.
          </p>
        </div>
        <Button variant="primary" icon={<UploadCloud size={18} />} onClick={() => navigate('/verification')}>
          Upload New Document
        </Button>
      </div>

      {/* Metric Cards — counts derived from the authenticated user's documents */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.25rem' }}>
        {stats.map((stat, i) => (
          <Card key={i}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 500 }}>{stat.label}</span>
                <h2 style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--text-main)', marginTop: '0.25rem' }}>{stat.value}</h2>
              </div>
              <div style={{ padding: '0.6rem', borderRadius: 'var(--radius-sm)', backgroundColor: 'var(--bg-surface)' }}>
                {stat.icon}
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Your Documents */}
      <Card title="Your Documents" subtitle="Documents you have uploaded and their current review status">
        {error && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '1rem', borderRadius: 8, border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.08)', color: '#f87171', fontSize: '0.85rem' }}>
            <AlertCircle size={16} /> {error}
            <Button size="sm" variant="ghost" onClick={() => setReloadKey((k) => k + 1)}>Retry</Button>
          </div>
        )}

        {!error && docs === null && (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
            Loading your documents…
          </div>
        )}

        {!error && docs !== null && docs.length === 0 && (
          <div style={{ padding: '2rem', textAlign: 'center' }}>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', margin: '0 0 1rem' }}>
              No documents yet — upload your first document to see it here.
            </p>
            <Button variant="primary" icon={<UploadCloud size={16} />} onClick={() => navigate('/verification')}>
              Upload New Document
            </Button>
          </div>
        )}

        {!error && docs !== null && docs.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-dim)' }}>
                  <th style={{ padding: '0.75rem 0.5rem' }}>Document</th>
                  <th style={{ padding: '0.75rem 0.5rem' }}>Type</th>
                  <th style={{ padding: '0.75rem 0.5rem' }}>Status</th>
                  <th style={{ padding: '0.75rem 0.5rem' }}>Uploaded</th>
                  <th style={{ padding: '0.75rem 0.5rem' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {docs.map((doc) => {
                  const badge = STATUS_BADGES[doc.verification_status] ?? { label: doc.verification_status, cls: 'badge badge-amber' };
                  return (
                    <tr key={doc.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td style={{ padding: '0.75rem 0.5rem', fontWeight: 600, color: 'var(--text-main)' }}>{doc.name ?? doc.id}</td>
                      <td style={{ padding: '0.75rem 0.5rem', color: 'var(--text-muted)' }}>{typeLabel(doc.document_type)}</td>
                      <td style={{ padding: '0.75rem 0.5rem' }}>
                        <span className={badge.cls}>{badge.label}</span>
                      </td>
                      <td style={{ padding: '0.75rem 0.5rem', color: 'var(--text-muted)' }}>{relativeTime(doc.created_at)}</td>
                      <td style={{ padding: '0.75rem 0.5rem' }}>
                        <Button size="sm" variant="ghost" icon={<Eye size={14} />} onClick={() => navigate('/verification')}>
                          View
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
};

export default DashboardPage;
