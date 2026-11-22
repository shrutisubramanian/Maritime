import React, { useCallback, useEffect, useState } from 'react';
import AdminSidebar from '../../components/AdminSidebar';
import {
  adminVerificationService,
  AdminDocumentItem,
} from '../../services/adminVerification';

/**
 * Admin-wide document register.
 *
 * The approval queues show documents inside an account's detail view. This page
 * answers the other question: what has been uploaded across the platform, who
 * sent it, and where is it in review? Files are opened through the existing
 * admin-only document endpoint; no storage path is exposed to the browser.
 */

const C = {
  bg: 'var(--color-background)',
  card: 'var(--color-surface)',
  low: 'var(--color-surface-alt)',
  border: 'var(--color-border)',
  borderStrong: 'var(--color-border-strong)',
  text: 'var(--color-text)',
  muted: 'var(--color-muted)',
  dim: 'var(--color-faint)',
  brand: 'var(--color-brand)',
  brandTint: 'var(--color-brand-tint)',
  success: 'var(--color-success)',
  successTint: 'var(--color-success-tint)',
  warning: 'var(--color-warning)',
  warningTint: 'var(--color-warning-tint)',
  error: 'var(--color-error)',
  errorTint: 'var(--color-error-tint)',
  info: 'var(--color-info)',
  infoTint: 'var(--color-info-tint)',
};

const M = "'Manrope', sans-serif";
const I = "'Inter', sans-serif";
const PAGE_SIZE = 25;

const fmtDate = (value?: string | null): string => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

const roleLabel = (role?: string | null): string => {
  if (role === 'client') return 'Client';
  if (role === 'provider') return 'Service provider';
  if (role === 'supplier') return 'Supplier';
  return role || 'Account';
};

const statusMeta = (status?: string | null) => {
  switch (status) {
    case 'verified':
      return { label: 'Verified', color: C.success, tint: C.successTint };
    case 'rejected':
      return { label: 'Rejected', color: C.error, tint: C.errorTint };
    case 'extracted':
      return { label: 'Extracted', color: C.info, tint: C.infoTint };
    case 'pending':
    default:
      return { label: 'Pending', color: C.warning, tint: C.warningTint };
  }
};

async function openAdminDocument(documentId: string, filename: string): Promise<void> {
  try {
    const objectUrl = await adminVerificationService.fetchDocumentFile(documentId);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.target = '_blank';
    link.rel = 'noreferrer';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  } catch (err) {
    console.error(`Failed to open document ${filename}:`, err);
    alert('Could not open this document. Your admin session may have expired.');
  }
}

const SummaryCard: React.FC<{ label: string; value: number; color: string }> = ({
  label,
  value,
  color,
}) => (
  <div
    style={{
      background: C.card,
      border: `1px solid ${C.border}`,
      borderRadius: 14,
      padding: '1rem 1.15rem',
      minWidth: 150,
    }}
  >
    <p
      style={{
        margin: 0,
        fontSize: '0.62rem',
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.12em',
        color: C.dim,
      }}
    >
      {label}
    </p>
    <p
      style={{
        margin: '0.35rem 0 0',
        fontFamily: M,
        fontSize: '1.6rem',
        fontWeight: 800,
        color,
        lineHeight: 1,
      }}
    >
      {value}
    </p>
  </div>
);

export const AdminDocuments: React.FC = () => {
  const [rows, setRows] = useState<AdminDocumentItem[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(0);
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await adminVerificationService.listDocuments({
        status: status || undefined,
        q: search.trim() || undefined,
        page,
        limit: PAGE_SIZE,
      });
      setRows(result.data);
      setCounts(result.counts || {});
      setTotal(result.total);
      setPages(result.pages);
    } catch {
      setRows([]);
      setError('Could not load uploaded documents. Please retry.');
    } finally {
      setLoading(false);
    }
  }, [status, search, page]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [status, search]);

  const allCount = Object.values(counts).reduce((sum, value) => sum + value, 0);
  const awaitingReview = (counts.pending || 0) + (counts.extracted || 0);

  const inputStyle: React.CSSProperties = {
    padding: '0.6rem 0.8rem',
    borderRadius: 9,
    border: `1px solid ${C.border}`,
    background: C.low,
    color: C.text,
    fontFamily: I,
    fontSize: '0.82rem',
    outline: 'none',
  };

  return (
    <div
      style={{
        display: 'flex',
        minHeight: '100vh',
        background: C.bg,
        color: C.text,
        fontFamily: I,
        overflowX: 'clip',
      }}
    >
      <AdminSidebar activePath="/admin/documents" />

      <main
        style={{
          marginLeft: 'var(--sidebar-width, 256px)',
          flex: 1,
          minHeight: '100vh',
          transition: 'margin-left 0.3s cubic-bezier(0.4,0,0.2,1)',
        }}
      >
        <header
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 40,
            minHeight: 64,
            padding: '1rem 2rem',
            background: 'var(--bg-glass)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            borderBottom: `1px solid ${C.border}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
            flexWrap: 'wrap',
          }}
        >
          <div>
            <p
              style={{
                margin: 0,
                fontSize: '0.62rem',
                fontWeight: 700,
                letterSpacing: '0.15em',
                textTransform: 'uppercase',
                color: C.brand,
              }}
            >
              Document Register
            </p>
            <h1
              style={{
                margin: '2px 0 0',
                fontFamily: M,
                fontSize: '1.35rem',
                fontWeight: 800,
                color: C.text,
              }}
            >
              Uploaded Documents
            </h1>
          </div>
          <p style={{ margin: 0, fontSize: '0.78rem', color: C.muted, maxWidth: 440 }}>
            Every file users have uploaded, with the account that sent it and its current review status.
          </p>
        </header>

        <div style={{ padding: '1.5rem 2rem 3rem' }}>
          <section
            style={{
              display: 'flex',
              gap: 12,
              flexWrap: 'wrap',
              marginBottom: '1.25rem',
            }}
          >
            <SummaryCard label="All documents" value={allCount} color={C.text} />
            <SummaryCard label="Awaiting review" value={awaitingReview} color={C.warning} />
            <SummaryCard label="Verified" value={counts.verified || 0} color={C.success} />
            <SummaryCard label="Rejected" value={counts.rejected || 0} color={C.error} />
          </section>

          <section
            style={{
              display: 'flex',
              gap: 10,
              flexWrap: 'wrap',
              alignItems: 'center',
              marginBottom: '1rem',
            }}
          >
            <input
              aria-label="Search uploaded documents"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search sender, email, company or filename"
              style={{ ...inputStyle, minWidth: 280, flex: 1, maxWidth: 460 }}
            />
            <select
              aria-label="Filter uploaded documents by status"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              style={{ ...inputStyle, minWidth: 170 }}
            >
              <option value="">All statuses</option>
              <option value="pending">Pending</option>
              <option value="extracted">Extracted</option>
              <option value="verified">Verified</option>
              <option value="rejected">Rejected</option>
            </select>
            <span style={{ fontSize: '0.78rem', color: C.dim }}>
              {loading ? 'Loading…' : `${total} matching document${total === 1 ? '' : 's'}`}
            </span>
          </section>

          {error && (
            <div
              style={{
                marginBottom: '1rem',
                padding: '0.8rem 1rem',
                borderRadius: 10,
                border: `1px solid ${C.error}`,
                background: C.errorTint,
                color: C.error,
                fontSize: '0.82rem',
              }}
            >
              {error}{' '}
              <button
                onClick={() => void load()}
                style={{
                  marginLeft: 8,
                  border: 'none',
                  background: 'transparent',
                  color: C.error,
                  fontWeight: 700,
                  cursor: 'pointer',
                  textDecoration: 'underline',
                }}
              >
                Retry
              </button>
            </div>
          )}

          <div
            style={{
              background: C.card,
              border: `1px solid ${C.border}`,
              borderRadius: 16,
              overflow: 'hidden',
            }}
          >
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
                <thead>
                  <tr style={{ background: C.low }}>
                    {['Sender', 'Document', 'Uploaded', 'Status', 'Reviewed', 'File'].map((label) => (
                      <th
                        key={label}
                        style={{
                          padding: '0.8rem 1rem',
                          textAlign: label === 'File' ? 'right' : 'left',
                          fontSize: '0.6rem',
                          fontWeight: 700,
                          letterSpacing: '0.12em',
                          textTransform: 'uppercase',
                          color: C.dim,
                          borderBottom: `1px solid ${C.border}`,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading && (
                    <tr>
                      <td colSpan={6} style={{ padding: '3rem', textAlign: 'center', color: C.dim }}>
                        Loading uploaded documents…
                      </td>
                    </tr>
                  )}

                  {!loading && !error && rows.length === 0 && (
                    <tr>
                      <td
                        colSpan={6}
                        style={{
                          padding: '3rem',
                          textAlign: 'center',
                          color: C.dim,
                          fontStyle: 'italic',
                        }}
                      >
                        No documents match this view yet.
                      </td>
                    </tr>
                  )}

                  {!loading && rows.map((doc) => {
                    const meta = statusMeta(doc.verification_status);
                    return (
                      <tr key={doc.id} style={{ borderTop: `1px solid ${C.border}` }}>
                        <td style={{ padding: '1rem', verticalAlign: 'top' }}>
                          <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: 700, color: C.text }}>
                            {doc.uploader.full_name || doc.uploader.email || 'Unknown account'}
                          </p>
                          <p style={{ margin: '2px 0 0', fontSize: '0.74rem', color: C.muted }}>
                            {doc.uploader.company_name || 'No company name'}
                          </p>
                          <p style={{ margin: '2px 0 0', fontSize: '0.7rem', color: C.dim }}>
                            {doc.uploader.email || '—'} · {roleLabel(doc.uploader.role)}
                          </p>
                        </td>
                        <td style={{ padding: '1rem', verticalAlign: 'top' }}>
                          <p
                            style={{
                              margin: 0,
                              fontSize: '0.84rem',
                              fontWeight: 600,
                              color: C.text,
                              overflowWrap: 'anywhere',
                            }}
                          >
                            {doc.name || 'Unnamed document'}
                          </p>
                          <p style={{ margin: '2px 0 0', fontSize: '0.72rem', color: C.dim }}>
                            {doc.document_type_label || doc.document_type || 'General document'}
                          </p>
                        </td>
                        <td style={{ padding: '1rem', verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                          <span style={{ fontSize: '0.78rem', color: C.muted }}>
                            {fmtDate(doc.created_at || doc.upload_date)}
                          </span>
                        </td>
                        <td style={{ padding: '1rem', verticalAlign: 'top' }}>
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 6,
                              padding: '3px 9px',
                              borderRadius: 999,
                              background: meta.tint,
                              color: meta.color,
                              fontSize: '0.62rem',
                              fontWeight: 700,
                              textTransform: 'uppercase',
                              letterSpacing: '0.06em',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            <span
                              style={{
                                width: 6,
                                height: 6,
                                borderRadius: '50%',
                                background: meta.color,
                              }}
                            />
                            {meta.label}
                          </span>
                        </td>
                        <td style={{ padding: '1rem', verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                          <span style={{ fontSize: '0.78rem', color: doc.reviewed_at ? C.text : C.dim }}>
                            {doc.reviewed_at ? fmtDate(doc.reviewed_at) : 'Not reviewed'}
                          </span>
                        </td>
                        <td style={{ padding: '1rem', textAlign: 'right', verticalAlign: 'top' }}>
                          <button
                            onClick={() => void openAdminDocument(doc.id, doc.name || 'document')}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 5,
                              padding: '0.45rem 0.8rem',
                              borderRadius: 8,
                              border: `1px solid ${C.borderStrong}`,
                              background: C.brandTint,
                              color: C.brand,
                              fontFamily: I,
                              fontSize: '0.75rem',
                              fontWeight: 700,
                              cursor: 'pointer',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>
                              open_in_new
                            </span>
                            Open
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              marginTop: '1rem',
              flexWrap: 'wrap',
            }}
          >
            <span style={{ fontSize: '0.78rem', color: C.dim }}>
              Showing {rows.length} of {total}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                disabled={page <= 1 || loading}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                style={{
                  ...inputStyle,
                  cursor: page <= 1 || loading ? 'not-allowed' : 'pointer',
                  opacity: page <= 1 || loading ? 0.5 : 1,
                }}
              >
                Previous
              </button>
              <span style={{ fontSize: '0.78rem', color: C.muted }}>
                Page {page} of {Math.max(pages, 1)}
              </span>
              <button
                disabled={page >= pages || loading}
                onClick={() => setPage((current) => current + 1)}
                style={{
                  ...inputStyle,
                  cursor: page >= pages || loading ? 'not-allowed' : 'pointer',
                  opacity: page >= pages || loading ? 0.5 : 1,
                }}
              >
                Next
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default AdminDocuments;
