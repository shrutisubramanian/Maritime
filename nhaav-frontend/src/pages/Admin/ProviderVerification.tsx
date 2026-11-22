import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import AdminSidebar from "../../components/AdminSidebar";

import {
  adminVerificationService,
  VerificationStats,
  ProviderVerificationItem,
  ProviderVerificationDetail,
  VerificationFilterParams
} from "../../services/adminVerification";
import { adminPaymentsService } from "../../services/adminPayments";

const C = {
  bg:        'var(--color-background)',
  bgLow:     'var(--color-surface-alt)',
  bgLowest:  'var(--color-surface-alt)',
  bgCard:    'var(--color-surface)',
  bgHigh:    'var(--color-surface-deep)',
  bgBright:  'var(--color-surface-deep)',
  border:    'var(--color-border)',
  borderV:   'var(--color-border-strong)',
  text:      'var(--color-text)',
  muted:     'var(--color-muted)',
  dim:       'var(--color-faint)',
  cyan: 'var(--color-brand)',
  primary: 'var(--color-brand)',
  secondary: 'var(--color-muted)',
  error:     'var(--color-error)',
  errorCont: 'var(--color-error-tint)',
  primCont:  'var(--color-brand-tint-solid)',
  white:     'var(--color-text)',
  success:   'var(--color-success)',
  successDim:'var(--color-success-tint)',
  warning:   'var(--color-warning)',
  warningDim:'var(--color-warning-tint)',
  danger:    'var(--color-error)',
  dangerDim: 'var(--color-error-tint)',
  info:      'var(--color-info)',
  infoDim:   'var(--color-info-tint)',
};
const M = "'Manrope', sans-serif";
const I = "'Inter', sans-serif";

const glass: React.CSSProperties = {
  background: 'var(--bg-glass)',
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
  border: `1px solid ${C.border}`,
  transition: 'all 0.3s ease',
};

const PROF_IMG = '';

/**
 * Opens a stored provider document in a new tab.
 * Files are no longer served from a public /uploads URL — they are fetched
 * with the admin JWT as a blob and opened from an in-memory object URL.
 */
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
    // Revoke once the browser has had a chance to load the blob.
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  } catch (err) {
    console.error(`Failed to open document ${filename}:`, err);
    alert('Could not open this document. Your admin session may have expired.');
  }
}

/**
 * One approval queue, scoped to a section of the console.
 *
 * The admin console keeps two separate queues over the same backend endpoint:
 *
 *   roleScope="client" -> Client Approvals   (buyers)
 *   roleScope="vendor" -> Vendor Approvals   (suppliers + service providers)
 *
 * Both follow the same rule — paperwork + platform-fee payment in, then one
 * approval that verifies the transfer and issues the purchased passes.
 */
export type VerificationRoleScope = 'client' | 'vendor';

export interface ProviderVerificationProps {
  roleScope?: VerificationRoleScope;
}

const SCOPE_COPY: Record<VerificationRoleScope, { title: string; crumb: string; eyebrow: string; blurb: string }> = {
  client: {
    title: 'Client Approvals',
    crumb: 'Client Approvals',
    eyebrow: 'Buyer Onboarding',
    blurb:
      'Buyers who signed up, uploaded their documents and paid the platform fee. Approving verifies the bank transfer and issues their access passes.',
  },
  vendor: {
    title: 'Vendor Approvals',
    crumb: 'Vendor Approvals',
    eyebrow: 'Supplier & Service Provider Onboarding',
    blurb:
      'Suppliers and service providers who signed up, uploaded their documents and paid the platform fee. Approving opens their listings, quotations and jobs.',
  },
};

export const ProviderVerification: React.FC<ProviderVerificationProps> = ({ roleScope = 'client' }) => {
  const navigate = useNavigate();
  const scope = SCOPE_COPY[roleScope];

  // State
  const [stats, setStats] = useState<VerificationStats>({
    pending: 0,
    under_review: 0,
    approved: 0,
    rejected: 0,
    total: 0,
    ready_for_approval: 0
  });

  const [providers, setProviders] = useState<ProviderVerificationItem[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [activeDetail, setActiveDetail] = useState<ProviderVerificationDetail | null>(null);
  // A vendor whose head office port is missing from the list needs it added
  // before their profile can be completed, so it is done right here.
  const [newPortName, setNewPortName] = useState('');
  const [newPortState, setNewPortState] = useState('');
  const [addingPort, setAddingPort] = useState(false);
  const [portNotice, setPortNotice] = useState('');
  const [loading, setLoading] = useState<boolean>(true);
  const [detailLoading, setDetailLoading] = useState<boolean>(false);
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [actionFeedback, setActionFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  // Manual pass issue is an audited exception to the payment-first rule, so the
  // panel first asks the server whether an operator has enabled it at all.
  const [grantPolicy, setGrantPolicy] = useState<{
    enabled: boolean;
    requires_reason: boolean;
    reason_min_length: number;
    requires_no_payment_confirmation: boolean;
  } | null>(null);
  const [grantReason, setGrantReason] = useState('');
  const [grantConfirmed, setGrantConfirmed] = useState(false);
  const [receiptLoading, setReceiptLoading] = useState<boolean>(false);
  const [receiptError, setReceiptError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'queue' | 'split'>('queue');

  // Filters
  const [searchValue, setSearchValue] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [countryFilter, setCountryFilter] = useState<string>("");
  const [scoreMinFilter, setScoreMinFilter] = useState<string>("");
  const [dateFromFilter, setDateFromFilter] = useState<string>("");
  // Clients who paid AND uploaded paperwork — the rows the reviewer can clear.
  const [readyOnly, setReadyOnly] = useState<boolean>(false);

  // Clarification / Rejection Modal
  const [modalType, setModalType] = useState<'under_review' | 'reject' | null>(null);
  const [modalReason, setModalReason] = useState<string>("");

  // Fetch Summary Stats
  const fetchStats = useCallback(async () => {
    try {
      const res = await adminVerificationService.getStats(roleScope);
      setStats(res);
    } catch (err) {
      console.error("Failed to load verification stats:", err);
    }
  }, [roleScope]);

  // Fetch Providers List
  const fetchProviders = useCallback(async () => {
    setLoading(true);
    try {
      const filters: VerificationFilterParams = { role: roleScope };
      if (searchValue.trim()) filters.search = searchValue.trim();
      if (statusFilter) filters.status = statusFilter;
      if (countryFilter.trim()) filters.country = countryFilter.trim();
      if (scoreMinFilter) filters.score_min = parseFloat(scoreMinFilter);
      if (dateFromFilter) filters.date_from = dateFromFilter;
      if (readyOnly) filters.ready_only = true;

      const res = await adminVerificationService.getProviders(filters);
      setProviders(res.data || []);

      // Auto-select first provider if available
      if (res.data && res.data.length > 0) {
        const exists = res.data.some((p: ProviderVerificationItem) => p.id === selectedProfileId);
        if (!selectedProfileId || !exists) {
          setSelectedProfileId(res.data[0].id);
        }
      } else {
        setSelectedProfileId(null);
        setActiveDetail(null);
      }
    } catch (err) {
      console.error("Failed to load verification providers:", err);
    } finally {
      setLoading(false);
    }
  }, [searchValue, statusFilter, countryFilter, scoreMinFilter, dateFromFilter, readyOnly, selectedProfileId, roleScope]);

  // Fetch Selected Provider Audit Detail
  const fetchProviderDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    setReceiptError(null);
    setReceiptLoading(false);
    try {
      const detail = await adminVerificationService.getProviderDetail(id);
      setActiveDetail(detail);
    } catch (err) {
      console.error("Failed to load provider audit detail:", err);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const handleViewReceipt = async (paymentId: string) => {
    setReceiptLoading(true);
    setReceiptError(null);
    try {
      await adminPaymentsService.openReceipt(paymentId);
    } catch (err: unknown) {
      console.error('Failed to open payment receipt:', err);
      let message = 'Could not open the receipt. The file may be unavailable or your session expired.';
      const resData = (err as { response?: { data?: unknown } })?.response?.data;
      if (resData instanceof Blob) {
        try {
          const text = await resData.text();
          const parsed = JSON.parse(text);
          if (typeof parsed?.detail === 'string') {
            message = parsed.detail;
          }
        } catch {
          // keep fallback message
        }
      } else if (typeof resData === 'object' && resData !== null && 'detail' in resData && typeof (resData as { detail?: unknown }).detail === 'string') {
        message = (resData as { detail: string }).detail;
      }
      setReceiptError(message);
    } finally {
      setReceiptLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
    fetchProviders();
  }, [fetchStats, fetchProviders]);

  useEffect(() => {
    if (selectedProfileId) {
      fetchProviderDetail(selectedProfileId);
    }
  }, [selectedProfileId, fetchProviderDetail]);

  // Action Handler (Approve / Reject / Under Review)
  const handleAction = async (action: 'approve' | 'reject' | 'under_review', reason?: string) => {
    if (!selectedProfileId) return;
    setActionLoading(true);
    setActionFeedback(null);
    try {
      const result = await adminVerificationService.updateProviderAction(selectedProfileId, action, reason);
      setActionFeedback({
        type: 'success',
        message: result.message || `Provider status updated to ${action}.`
      });

      // Refresh stats, list and active detail
      await fetchStats();
      await fetchProviders();
      await fetchProviderDetail(selectedProfileId);
      setModalType(null);
      setModalReason("");
    } catch (err: any) {
      console.error("Action error:", err);
      // 409s carry a structured detail ({code, message}) for the
      // documents/payment preconditions — surface the human message, not
      // "[object Object]".
      const detail = err.response?.data?.detail;
      setActionFeedback({
        type: 'error',
        message:
          typeof detail === 'string'
            ? detail
            : detail?.message || "Failed to execute verification action."
      });
    } finally {
      setActionLoading(false);
    }
  };

  // Read the manual-grant policy once: disabled by default in production.
  useEffect(() => {
    let cancelled = false;
    adminVerificationService
      .passGrantPolicy()
      .then((policy) => {
        if (!cancelled) setGrantPolicy(policy);
      })
      .catch((err) => {
        console.error('Failed to load manual pass-issue policy:', err);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Issue one of the two fixed access packs by hand, WITHOUT a payment.
   * The server owns the sizes and windows (10 passes / 6 months, 100 / 12) and
   * refuses the request unless a reason and the no-payment confirmation arrive.
   */
  const handleGrantPasses = async (pack: '10' | '100') => {
    if (!selectedProfileId) return;
    const reason = grantReason.trim();
    const minLength = grantPolicy?.reason_min_length ?? 10;
    if (!grantPolicy?.enabled) {
      setActionFeedback({
        type: 'error',
        message:
          'Manual pass issue is disabled. Approve the client’s platform payment to issue their passes.',
      });
      return;
    }
    if (reason.length < minLength) {
      setActionFeedback({
        type: 'error',
        message: `Write a reason of at least ${minLength} characters before issuing passes without a payment.`,
      });
      return;
    }
    if (!grantConfirmed) {
      setActionFeedback({
        type: 'error',
        message: 'Confirm that no payment is linked to this grant before issuing passes.',
      });
      return;
    }
    setActionLoading(true);
    setActionFeedback(null);
    try {
      const result = await adminVerificationService.grantPasses(
        selectedProfileId,
        pack,
        reason,
        grantConfirmed
      );
      setActionFeedback({
        type: 'success',
        message: `${result.message} Recorded as a manual grant with no payment linked.`,
      });
      setGrantReason('');
      setGrantConfirmed(false);
      await fetchStats();
      await fetchProviders();
      await fetchProviderDetail(selectedProfileId);
    } catch (err: any) {
      console.error("Grant passes error:", err);
      const detail = err.response?.data?.detail;
      setActionFeedback({
        type: 'error',
        message:
          typeof detail === 'string'
            ? detail
            : detail?.message || "Could not issue the passes."
      });
    } finally {
      setActionLoading(false);
    }
  };

  const getStatusBadgeStyle = (statusStr: string) => {
    switch (statusStr.toLowerCase()) {
      case 'verified':
      case 'approved':
        return { background: C.successDim, color: C.success, border: `1px solid rgba(52,211,153,0.3)` };
      case 'under_review':
        return { background: C.warningDim, color: C.warning, border: `1px solid rgba(76,157,176,0.3)` };
      case 'pending':
        return { background: C.infoDim, color: C.info, border: `1px solid rgba(76,157,176,0.3)` };
      case 'rejected':
        return { background: C.dangerDim, color: C.danger, border: `1px solid rgba(251,113,133,0.3)` };
      default:
        return { background: C.bgHigh, color: C.muted, border: `1px solid ${C.borderV}` };
    }
  };

  const formatStatusLabel = (statusStr: string) => {
    switch (statusStr.toLowerCase()) {
      case 'verified': return 'Approved';
      case 'under_review': return 'Under Review';
      case 'pending': return 'Pending';
      case 'rejected': return 'Rejected';
      default: return statusStr;
    }
  };

  const getRiskBadgeStyle = (level?: string | null) => {
    switch (level) {
      case 'high':
        return { background: C.dangerDim, color: C.danger, border: `1px solid rgba(251,113,133,0.3)` };
      case 'medium':
        return { background: C.warningDim, color: C.warning, border: `1px solid rgba(76,157,176,0.3)` };
      default:
        return { background: C.successDim, color: C.success, border: `1px solid rgba(52,211,153,0.3)` };
    }
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: C.bg, color: C.text, fontFamily: I, overflowX: 'clip' }}>

      {/* 1. ADMIN SIDEBAR */}
      <AdminSidebar />

      {/* HEADER & MAIN CONTENT WRAPPER */}
      <div style={{ marginLeft: 'var(--sidebar-width, 256px)', flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', minHeight: '100vh', transition: 'margin-left 0.3s cubic-bezier(0.4, 0, 0.2, 1)' }}>

        {/* TOP HEADER */}
        <header style={{ position: 'sticky', top: 0, zIndex: 40, height: 64, background: 'var(--bg-glass)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', borderBottom: `1px solid ${C.borderV}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '2rem', flex: 1 }}>
            <div style={{ position: 'relative', maxWidth: 380, flex: 1 }}>
              <span className="material-symbols-outlined" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: C.dim, fontSize: '1.1rem', pointerEvents: 'none' }}>search</span>
              <input type="text" placeholder="Search accounts, companies, emails..." value={searchValue} onChange={e => setSearchValue(e.target.value)}
                style={{ width: '100%', background: C.bgLowest, border: 'none', borderRadius: 999, padding: '8px 16px 8px 36px', fontSize: '0.875rem', color: C.text, fontFamily: I, outline: 'none', boxSizing: 'border-box' as const }} />
            </div>
            <div style={{ fontSize: '0.8rem', color: C.dim, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>Admin Terminal</span>
              <span style={{ opacity: 0.4 }}>/</span>
              <span style={{ color: C.primary, fontWeight: 700 }}>{scope.crumb}</span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
            <button onClick={() => navigate('/notifications')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.dim, position: 'relative', display: 'flex', transition: 'color 0.2s' }}
              onMouseEnter={e => (e.currentTarget.style.color = C.primary)} onMouseLeave={e => (e.currentTarget.style.color = C.dim)}>
              <span className="material-symbols-outlined">notifications</span>
              <span style={{ position: 'absolute', top: 0, right: 0, width: 8, height: 8, background: C.error, borderRadius: '50%', border: `2px solid ${C.bg}` }} />
            </button>
            <div style={{ width: 1, height: 24, background: C.borderV }} />
            <button onClick={() => navigate('/company-profile')} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px', borderRadius: 999, background: 'none', border: 'none', cursor: 'pointer', transition: 'background 0.2s' }}
              onMouseEnter={e => (e.currentTarget.style.background = C.bgBright)} onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
              <div style={{ width: 32, height: 32, borderRadius: '50%', background: C.primCont, color: C.primary, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '1.1rem' }}>shield_person</span>
              </div>
              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: C.text }}>Systems Oversight</span>
            </button>
          </div>
        </header>

        {/* MAIN BODY */}
        <main style={{ padding: '2rem', flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '2rem' }}>

          {/* PAGE TITLE & ACTION CONTROLS */}
          <section style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <p style={{ fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.2em', color: C.cyan, margin: '0 0 4px' }}>{scope.eyebrow}</p>
              <h2 style={{ fontFamily: M, fontWeight: 900, fontSize: 'clamp(2rem,4vw,2.5rem)', color: C.text, letterSpacing: '-0.04em', margin: '0 0 4px' }}>{scope.title}</h2>
              <p style={{ color: C.text, margin: 0, fontSize: '0.875rem' }}>{scope.blurb}</p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {/* View Switcher Toggle */}
              <div style={{ padding: 4, background: C.bgHigh, borderRadius: 12, border: `1px solid ${C.borderV}`, display: 'flex', gap: 4 }}>
                <button
                  type="button"
                  onClick={() => setViewMode('queue')}
                  style={{
                    padding: '0.5rem 1rem',
                    borderRadius: 8,
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    background: viewMode === 'queue' ? C.primary : 'transparent',
                    color: viewMode === 'queue' ? 'var(--color-on-brand)' : C.muted,
                    transition: 'all 0.2s',
                  }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>list_alt</span>
                  Queue View
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('split')}
                  style={{
                    padding: '0.5rem 1rem',
                    borderRadius: 8,
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    background: viewMode === 'split' ? C.primary : 'transparent',
                    color: viewMode === 'split' ? 'var(--color-on-brand)' : C.muted,
                    transition: 'all 0.2s',
                  }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>view_sidebar</span>
                  Split Audit View
                </button>
              </div>

              {/* Refresh Button */}
              <button
                type="button"
                onClick={() => { fetchStats(); fetchProviders(); }}
                style={{ ...glass, padding: '0.6rem 1.25rem', borderRadius: 12, color: C.text, fontFamily: I, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', border: `1px solid ${C.borderV}` }}>
                <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>refresh</span>
                Refresh Data
              </button>
            </div>
          </section>

          {/* ACTION FEEDBACK BANNER */}
          {actionFeedback && (
            <div style={{ padding: '1rem 1.25rem', borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: actionFeedback.type === 'success' ? `1px solid rgba(76,157,176,0.3)` : `1px solid rgba(220,38,38,0.3)`, background: actionFeedback.type === 'success' ? 'var(--color-brand-tint)' : C.errorCont, color: actionFeedback.type === 'success' ? C.cyan : C.error }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.875rem', fontWeight: 600 }}>
                <span className="material-symbols-outlined">
                  {actionFeedback.type === 'success' ? 'check_circle' : 'error'}
                </span>
                <span>{actionFeedback.message}</span>
              </div>
              <button onClick={() => setActionFeedback(null)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', opacity: 0.7 }}>
                <span className="material-symbols-outlined" style={{ fontSize: '1.1rem' }}>close</span>
              </button>
            </div>
          )}

          {/* 2. SUMMARY CARDS (LIVE BACKEND METRICS) */}
          <section style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '1rem' }}>
            {/* Card 0: Ready to approve — paid + paperwork, approvable now */}
            <div
              onClick={() => setReadyOnly(v => !v)}
              title="Clients whose documents are in and whose bank transfer awaits verification"
              style={{
                ...glass,
                padding: '1.5rem',
                borderRadius: 16,
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                cursor: 'pointer',
                border: readyOnly ? `2px solid ${C.success}` : `1px solid ${C.borderV}`,
              }}
            >
              <div>
                <p style={{ fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em', color: C.text, margin: '0 0 12px' }}>Ready To Approve</p>
                <h3 style={{ fontFamily: M, fontWeight: 800, fontSize: '2rem', color: C.text, letterSpacing: '-0.04em', margin: '0 0 8px' }}>{stats.ready_for_approval}</h3>
                <p style={{ fontSize: '0.7rem', color: C.text, margin: 0 }}>{readyOnly ? 'Showing only these' : 'Paid + documents in'}</p>
              </div>
              <div style={{ padding: 12, background: C.successDim, borderRadius: 12, flexShrink: 0 }}>
                <span className="material-symbols-outlined" style={{ color: C.success }}>task_alt</span>
              </div>
            </div>

            {/* Card 1: Pending Verification */}
            <div style={{ ...glass, padding: '1.5rem', borderRadius: 16, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <div>
                <p style={{ fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em', color: C.dim, margin: '0 0 12px' }}>Pending Verification</p>
                <h3 style={{ fontFamily: M, fontWeight: 800, fontSize: '2rem', color: C.text, letterSpacing: '-0.04em', margin: '0 0 8px' }}>{stats.pending}</h3>
                <p style={{ fontSize: '0.7rem', color: C.primary, margin: 0 }}>Awaiting audit</p>
              </div>
              <div style={{ padding: 12, background: 'rgba(37,99,235,0.1)', borderRadius: 12, flexShrink: 0 }}>
                <span className="material-symbols-outlined" style={{ color: C.primary }}>pending_actions</span>
              </div>
            </div>

            {/* Card 2: Under Review */}
            <div style={{ ...glass, padding: '1.5rem', borderRadius: 16, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <div>
                <p style={{ fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em', color: C.dim, margin: '0 0 12px' }}>Under Review</p>
                <h3 style={{ fontFamily: M, fontWeight: 800, fontSize: '2rem', color: C.text, letterSpacing: '-0.04em', margin: '0 0 8px' }}>{stats.under_review}</h3>
                <p style={{ fontSize: '0.7rem', color: C.secondary, margin: 0 }}>Clarification requested</p>
              </div>
              <div style={{ padding: 12, background: 'rgba(166,201,250,0.1)', borderRadius: 12, flexShrink: 0 }}>
                <span className="material-symbols-outlined" style={{ color: C.secondary }}>manage_search</span>
              </div>
            </div>

            {/* Card 3: Approved */}
            <div style={{ ...glass, padding: '1.5rem', borderRadius: 16, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <div>
                <p style={{ fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em', color: C.dim, margin: '0 0 12px' }}>Approved</p>
                <h3 style={{ fontFamily: M, fontWeight: 800, fontSize: '2rem', color: C.text, letterSpacing: '-0.04em', margin: '0 0 8px' }}>{stats.approved}</h3>
                <p style={{ fontSize: '0.7rem', color: C.cyan, margin: 0 }}>Verified accounts</p>
              </div>
              <div style={{ padding: 12, background: 'rgba(76,157,176,0.1)', borderRadius: 12, flexShrink: 0 }}>
                <span className="material-symbols-outlined" style={{ color: C.cyan }}>verified</span>
              </div>
            </div>

            {/* Card 4: Rejected */}
            <div style={{ ...glass, padding: '1.5rem', borderRadius: 16, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', borderLeft: `4px solid ${C.error}` }}>
              <div>
                <p style={{ fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em', color: C.dim, margin: '0 0 12px' }}>Rejected</p>
                <h3 style={{ fontFamily: M, fontWeight: 800, fontSize: '2rem', color: C.error, letterSpacing: '-0.04em', margin: '0 0 8px' }}>{stats.rejected}</h3>
                <p style={{ fontSize: '0.7rem', color: 'rgba(220,38,38,0.8)', margin: 0 }}>Failed compliance</p>
              </div>
              <div style={{ padding: 12, background: C.errorCont, borderRadius: 12, flexShrink: 0 }}>
                <span className="material-symbols-outlined" style={{ color: C.error }}>cancel</span>
              </div>
            </div>
          </section>

          {/* FILTERS BAR */}
          <section style={{ ...glass, padding: '1.25rem 1.5rem', borderRadius: 16, border: `1px solid ${C.borderV}` }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '1rem' }}>
              {/* Filter 1: Search provider/company */}
              <div>
                <label style={{ display: 'block', fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em', color: C.dim, marginBottom: 6 }}>
                  Search Account / Company
                </label>
                <div style={{ position: 'relative' }}>
                  <span className="material-symbols-outlined" style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: C.dim, fontSize: '1.1rem', pointerEvents: 'none' }}>search</span>
                  <input
                    type="text"
                    placeholder="Company name, user..."
                    value={searchValue}
                    onChange={(e) => setSearchValue(e.target.value)}
                    style={{ width: '100%', background: 'var(--color-surface)', border: 'none', borderBottom: `2px solid ${C.borderV}`, color: C.text, fontFamily: I, fontSize: '0.875rem', padding: '6px 8px 6px 30px', outline: 'none', boxSizing: 'border-box' as const }}
                  />
                </div>
              </div>

              {/* Filter 2: Verification status */}
              <div>
                <label style={{ display: 'block', fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em', color: C.dim, marginBottom: 6 }}>
                  Verification Status
                </label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  style={{ width: '100%', background: 'var(--color-surface)', border: 'none', borderBottom: `2px solid ${C.borderV}`, color: C.text, fontFamily: I, fontSize: '0.875rem', padding: '6px 8px', outline: 'none', appearance: 'none', cursor: 'pointer', boxSizing: 'border-box' as const }}
                >
                  <option value="" style={{ background: C.bgCard }}>All Statuses</option>
                  <option value="pending" style={{ background: C.bgCard }}>Pending Verification</option>
                  <option value="under_review" style={{ background: C.bgCard }}>Under Review</option>
                  <option value="verified" style={{ background: C.bgCard }}>Approved / Verified</option>
                  <option value="rejected" style={{ background: C.bgCard }}>Rejected</option>
                </select>
              </div>

              {/* Filter 3: Country / Region */}
              <div>
                <label style={{ display: 'block', fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em', color: C.dim, marginBottom: 6 }}>
                  Country / Region
                </label>
                <div style={{ position: 'relative' }}>
                  <span className="material-symbols-outlined" style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: C.dim, fontSize: '1.1rem', pointerEvents: 'none' }}>public</span>
                  <input
                    type="text"
                    placeholder="Norway, Singapore..."
                    value={countryFilter}
                    onChange={(e) => setCountryFilter(e.target.value)}
                    style={{ width: '100%', background: 'var(--color-surface)', border: 'none', borderBottom: `2px solid ${C.borderV}`, color: C.text, fontFamily: I, fontSize: '0.875rem', padding: '6px 8px 6px 30px', outline: 'none', boxSizing: 'border-box' as const }}
                  />
                </div>
              </div>

              {/* Filter 4: Min Score */}
              <div>
                <label style={{ display: 'block', fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em', color: C.dim, marginBottom: 6 }}>
                  Min Score Filter
                </label>
                <select
                  value={scoreMinFilter}
                  onChange={(e) => setScoreMinFilter(e.target.value)}
                  style={{ width: '100%', background: 'var(--color-surface)', border: 'none', borderBottom: `2px solid ${C.borderV}`, color: C.text, fontFamily: I, fontSize: '0.875rem', padding: '6px 8px', outline: 'none', appearance: 'none', cursor: 'pointer', boxSizing: 'border-box' as const }}
                >
                  <option value="" style={{ background: C.bgCard }}>Any Score</option>
                  <option value="90" style={{ background: C.bgCard }}>90+ (Optimal)</option>
                  <option value="80" style={{ background: C.bgCard }}>80+ (Standard)</option>
                  <option value="70" style={{ background: C.bgCard }}>70+ (Moderate)</option>
                  <option value="50" style={{ background: C.bgCard }}>50+ (Low)</option>
                </select>
              </div>

              {/* Filter 5: Date Submitted */}
              <div>
                <label style={{ display: 'block', fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em', color: C.dim, marginBottom: 6 }}>
                  Date Submitted From
                </label>
                <input
                  type="date"
                  value={dateFromFilter}
                  onChange={(e) => setDateFromFilter(e.target.value)}
                  style={{ width: '100%', background: 'var(--color-surface)', border: 'none', borderBottom: `2px solid ${C.borderV}`, color: C.dim, fontFamily: I, fontSize: '0.875rem', padding: '6px 8px', outline: 'none', boxSizing: 'border-box' as const, colorScheme: 'dark' }}
                />
              </div>
            </div>
          </section>

          {/* 3. VERIFICATION QUEUE TABLE SECTION */}
          <section style={{ ...glass, borderRadius: 24, overflow: 'hidden' }}>
            <div style={{ padding: '1.5rem 2rem', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <h3 style={{ fontFamily: M, fontWeight: 700, fontSize: '1.2rem', color: C.text, margin: '0 0 4px' }}>Verification Queue</h3>
                <p style={{ fontSize: '0.8rem', color: C.dim, margin: 0 }}>
                  Accounts awaiting administrative audit &amp; credential verification. Click any row to inspect audit details.
                </p>
              </div>
              <span style={{ padding: '4px 12px', background: C.primCont, color: C.primary, fontSize: '0.65rem', fontWeight: 700, borderRadius: 999, textTransform: 'uppercase', letterSpacing: '0.05em', border: `1px solid rgba(37,99,235,0.2)` }}>
                {providers.length} Accounts Listed
              </span>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${C.border}`, background: 'var(--color-surface)' }}>
                    {['Company Name', 'Primary Contact', 'Country / Region', 'Submission Date', 'Verification Status', 'Field Completion', 'Uploaded Docs', 'Payment', 'Risk Indicator'].map(h => (
                      <th key={h} style={{ padding: '1rem 1.5rem', textAlign: 'left', fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em', color: C.dim, whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={9} style={{ padding: '3rem', textAlign: 'center', color: C.dim }}>
                        <span className="material-symbols-outlined" style={{ fontSize: '2rem', color: C.primary, marginBottom: 8, animation: 'spin 1s linear infinite' }}>sync</span>
                        <p style={{ margin: 0, fontSize: '0.875rem' }}>Loading verification queue from database...</p>
                      </td>
                    </tr>
                  ) : providers.length > 0 ? (
                    providers.map((p) => {
                      const isSelected = p.id === selectedProfileId;
                      const statusBadge = getStatusBadgeStyle(p.verification_status);
                      const riskBadge = getRiskBadgeStyle(p.risk_level);

                      return (
                        <tr
                          key={p.id}
                          onClick={() => {
                            setSelectedProfileId(p.id);
                            setViewMode('split');
                          }}
                          style={{
                            borderBottom: '1px solid rgba(0,0,0,0.06)',
                            transition: 'background 0.2s',
                            cursor: 'pointer',
                            background: isSelected ? 'rgba(76,157,176,0.4)' : 'transparent',
                          }}
                          onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'var(--color-surface-alt)'; }}
                          onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}>
                          {/* 1. Company Name */}
                          <td style={{ padding: '1.25rem 1.5rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                              <div style={{ width: 36, height: 36, borderRadius: 10, background: C.bgHigh, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.primary, border: `1px solid ${C.borderV}`, flexShrink: 0 }}>
                                <span className="material-symbols-outlined" style={{ fontSize: '1.2rem' }}>domain</span>
                              </div>
                              <span style={{ fontWeight: 700, color: C.text, fontSize: '0.875rem' }}>{p.company_name}</span>
                              {p.role && (
                                <span style={{ fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: C.dim, border: `1px solid ${C.borderV}`, borderRadius: 999, padding: '2px 8px' }}>
                                  {p.role}
                                </span>
                              )}
                            </div>
                          </td>

                          {/* 2. Primary Contact */}
                          <td style={{ padding: '1.25rem 1.5rem' }}>
                            <p style={{ fontSize: '0.875rem', fontWeight: 600, color: C.text, margin: '0 0 2px' }}>{p.full_name}</p>
                            <p style={{ fontSize: '0.7rem', color: C.dim, margin: 0 }}>{p.position || "—"}</p>
                          </td>

                          {/* 3. Country */}
                          <td style={{ padding: '1.25rem 1.5rem', color: C.muted, fontSize: '0.85rem' }}>
                            {p.location}
                          </td>

                          {/* 4. Submission Date */}
                          <td style={{ padding: '1.25rem 1.5rem', color: C.dim, fontFamily: 'monospace', fontSize: '0.8rem' }}>
                            {p.submission_date || "N/A"}
                          </td>

                          {/* 5. Verification Status */}
                          <td style={{ padding: '1.25rem 1.5rem' }}>
                            <span style={{ padding: '4px 12px', borderRadius: 999, fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', ...statusBadge }}>
                              {formatStatusLabel(p.verification_status)}
                            </span>
                            {/* Clients are only approvable once paperwork AND payment are in. */}
                            {p.verification_status !== 'verified' && (
                              <div
                                title={p.approval_blockers.includes('payment_required') ? 'Waiting on the bank transfer' : p.approval_blockers.includes('documents_required') ? 'Waiting on documents' : 'Approving issues the paid passes'}
                                style={{ marginTop: 6, fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: p.ready_for_approval ? C.success : C.warning }}>
                                {p.ready_for_approval ? 'Ready to approve' : 'Not ready'}
                              </div>
                            )}
                          </td>

                          {/* 6. Field completion (H7: completeness, not accuracy) */}
                          <td style={{ padding: '1.25rem 1.5rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <span style={{ fontFamily: M, fontWeight: 800, fontSize: '1rem', color: C.primary }}>
                                {p.verification_score ?? "—"}
                              </span>
                              {p.verification_score != null && (
                                <span style={{ fontSize: '0.65rem', color: C.dim }}>/100</span>
                              )}
                            </div>
                          </td>

                          {/* 7. Uploaded Documents */}
                          <td style={{ padding: '1.25rem 1.5rem', color: C.muted }}>
                            <span style={{ padding: '4px 8px', borderRadius: 6, background: C.bgLowest, border: `1px solid ${C.borderV}`, fontSize: '0.75rem', fontWeight: 600 }}>
                              {p.documents_count} Files
                            </span>
                          </td>

                          {/* 8. Payment — a client's platform fee here; vendors pay per listing */}
                          <td style={{ padding: '1.25rem 1.5rem' }}>
                            {p.payment ? (
                              <div>
                                <span style={{ padding: '4px 8px', borderRadius: 6, background: C.successDim, color: C.success, fontSize: '0.7rem', fontWeight: 700 }}>
                                  {p.payment.plan_name || p.payment.plan_code} · ₹{(p.payment.amount_paise / 100).toLocaleString('en-IN')}
                                </span>
                                <p style={{ margin: '4px 0 0', fontSize: '0.65rem', color: C.dim, fontFamily: 'monospace' }}>UTR {p.payment.utr}</p>
                              </div>
                            ) : p.role === 'client' ? (
                              <span style={{ fontSize: '0.75rem', color: C.dim }}>Not paid</span>
                            ) : (
                              // Vendors have no platform fee — they pay per listing.
                              <span style={{ fontSize: '0.75rem', color: C.dim }}>Per listing</span>
                            )}
                          </td>

                          {/* 9. Risk / Mismatch Indicator — empty when nothing adverse is known */}
                          <td style={{ padding: '1.25rem 1.5rem' }}>
                            {p.risk_indicator ? (
                              <span style={{ padding: '4px 10px', borderRadius: 999, fontSize: '0.6rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6, ...riskBadge }}>
                                <span className="material-symbols-outlined" style={{ fontSize: '0.85rem' }}>
                                  {p.risk_level === 'high' ? 'warning' : 'error_outline'}
                                </span>
                                {p.risk_indicator}
                              </span>
                            ) : (
                              <span style={{ fontSize: '0.75rem', color: C.dim }}>—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={9} style={{ padding: '3rem', textAlign: 'center', color: C.dim, fontStyle: 'italic' }}>
                        No providers found matching current filter criteria.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* 4. PROVIDER VERIFICATION AUDIT DETAIL VIEW */}
          {selectedProfileId && (
            <section id="provider-audit-detail" style={{ ...glass, borderRadius: 24, overflow: 'hidden' }}>
              {detailLoading ? (
                <div style={{ padding: '4rem', textAlign: 'center', color: C.dim }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '2.5rem', color: C.primary, marginBottom: 12, animation: 'spin 1s linear infinite' }}>sync</span>
                  <p style={{ margin: 0, fontSize: '0.9rem' }}>Loading provider audit details from database...</p>
                </div>
              ) : activeDetail ? (
                <div style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '2rem' }}>

                  {/* 4. PROVIDER HEADER & REVIEW INTERFACE */}
                  <div style={{ padding: '1.75rem', borderRadius: 20, background: 'var(--color-surface)', border: `1px solid ${C.borderV}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <div style={{ width: 56, height: 56, borderRadius: 16, background: 'linear-gradient(135deg, #4C9DB0, #4C9DB0)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.white, boxShadow: '0 4px 16px rgba(76,157,176,0.25)' }}>
                          <span className="material-symbols-outlined" style={{ fontSize: '2rem' }}>domain</span>
                        </div>
                        <div>
                          <h3 style={{ fontFamily: M, fontWeight: 900, fontSize: '1.6rem', color: C.text, margin: '0 0 4px' }}>
                            {activeDetail.company_name}
                          </h3>
                          <p style={{ fontSize: '0.8rem', color: C.dim, margin: 0 }}>
                            Detailed Administrative Verification Audit
                          </p>
                        </div>
                      </div>

                      <div style={{ textAlign: 'right' }}>
                        <p style={{ fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em', color: C.dim, margin: '0 0 4px' }}>Field Completion (not OCR accuracy)</p>
                        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'flex-end', gap: 4 }}>
                          <span style={{ fontFamily: M, fontWeight: 900, fontSize: '2.25rem', color: C.primary, lineHeight: 1 }}>
                            {activeDetail.verification_score ?? "—"}
                          </span>
                          {activeDetail.verification_score != null && (
                            <span style={{ fontSize: '0.8rem', color: C.dim }}>/100</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* PROVIDER HEADER METADATA GRID */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '1rem', padding: '1rem 1.25rem', borderRadius: 14, background: C.bgCard, border: `1px solid ${C.border}` }}>
                      <div>
                        <p style={{ fontSize: '0.55rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em', color: C.dim, margin: '0 0 4px' }}>Company Name</p>
                        <p style={{ fontSize: '0.8rem', fontWeight: 700, color: C.text, margin: 0 }}>{activeDetail.company_name}</p>
                      </div>
                      <div>
                        <p style={{ fontSize: '0.55rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em', color: C.dim, margin: '0 0 4px' }}>Account / Contact</p>
                        <p style={{ fontSize: '0.8rem', fontWeight: 700, color: C.text, margin: 0 }}>{activeDetail.full_name}</p>
                      </div>
                      <div>
                        <p style={{ fontSize: '0.55rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em', color: C.dim, margin: '0 0 4px' }}>Email Address</p>
                        <p style={{ fontSize: '0.8rem', fontWeight: 700, color: C.cyan, margin: 0 }}>{activeDetail.email}</p>
                      </div>
                      <div>
                        <p style={{ fontSize: '0.55rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em', color: C.dim, margin: '0 0 4px' }}>Country / Region</p>
                        <p style={{ fontSize: '0.8rem', fontWeight: 700, color: C.text, margin: 0 }}>{activeDetail.country || activeDetail.location}</p>
                      </div>
                      <div>
                        <p style={{ fontSize: '0.55rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em', color: C.dim, margin: '0 0 4px' }}>Verification Status</p>
                        <span style={{ padding: '3px 10px', borderRadius: 999, fontSize: '0.55rem', fontWeight: 700, textTransform: 'uppercase', display: 'inline-block', ...getStatusBadgeStyle(activeDetail.verification_status) }}>
                          {formatStatusLabel(activeDetail.verification_status)}
                        </span>
                      </div>
                      <div>
                        <p style={{ fontSize: '0.55rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em', color: C.dim, margin: '0 0 4px' }}>Submission Date</p>
                        <p style={{ fontSize: '0.8rem', fontFamily: 'monospace', fontWeight: 700, color: C.text, margin: 0 }}>{activeDetail.submission_date || "N/A"}</p>
                      </div>
                      <div>
                        <p style={{ fontSize: '0.55rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em', color: C.dim, margin: '0 0 4px' }}>Last Reviewed</p>
                        <p style={{ fontSize: '0.8rem', fontFamily: 'monospace', fontWeight: 700, color: C.text, margin: 0 }}>
                          {activeDetail.last_reviewed_at ? new Date(activeDetail.last_reviewed_at).toLocaleString() : "Not reviewed yet"}
                        </p>
                        {activeDetail.last_reviewed_by && (
                          <p style={{ fontSize: '0.65rem', color: C.dim, margin: '2px 0 0' }}>by {activeDetail.last_reviewed_by}</p>
                        )}
                      </div>
                    </div>

                    {(activeDetail.review_history?.length ?? 0) > 0 && (
                      <div style={{ padding: '1rem 1.25rem', borderRadius: 14, background: C.bgCard, border: `1px solid ${C.border}` }}>
                        <p style={{ fontSize: '0.55rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em', color: C.dim, margin: '0 0 8px' }}>Review history</p>
                        <div style={{ display: 'grid', gap: 8 }}>
                          {(activeDetail.review_history ?? []).map((entry, i) => (
                            <div key={`${entry.reviewed_at}-${i}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: '0.78rem', flexWrap: 'wrap' }}>
                              <span style={{ fontWeight: 700, color: C.text, textTransform: 'capitalize' }}>
                                {entry.action.replace('_', ' ')}
                                {entry.reason ? ` — ${entry.reason}` : ''}
                              </span>
                              <span style={{ color: C.dim, whiteSpace: 'nowrap' }}>
                                {entry.reviewer ?? 'Administrator'}
                                {entry.reviewed_at ? ` · ${new Date(entry.reviewed_at).toLocaleString()}` : ''}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* OCR comparisons only exist for documents that were actually
                      processed. General uploads skip OCR, so this section is hidden
                      rather than showing an empty OCR table. */}
                  {activeDetail.ocr_comparisons && activeDetail.ocr_comparisons.length > 0 && (
                  <div style={{ padding: '1.5rem', borderRadius: 20, background: 'var(--color-surface)', border: `1px solid ${C.borderV}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                      <div>
                        <h4 style={{ fontFamily: M, fontWeight: 700, fontSize: '0.95rem', color: C.primary, margin: '0 0 2px' }}>
                          OCR ANALYSIS vs PROFILE DATA
                        </h4>
                        <p style={{ fontSize: '0.75rem', color: C.dim, margin: 0 }}>
                          Field-by-field verification audit extracted from uploaded credentials vs database profile attributes.
                        </p>
                      </div>
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, color: C.cyan, background: 'var(--color-brand-tint)', padding: '4px 12px', borderRadius: 999, border: `1px solid rgba(76,157,176,0.3)`, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span className="material-symbols-outlined" style={{ fontSize: '0.9rem' }}>analytics</span> Fields Extracted: {activeDetail.ocr_confidence != null ? `${activeDetail.ocr_confidence}% of fields found` : "N/A"}
                      </span>
                    </div>

                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ borderBottom: `1px solid ${C.border}`, background: 'var(--color-surface)' }}>
                            <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em', color: C.dim }}>Field</th>
                            <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em', color: C.dim }}>OCR Extracted Value</th>
                            <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em', color: C.dim }}>Database Profile Value</th>
                            <th style={{ padding: '0.75rem 1rem', textAlign: 'center', fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em', color: C.dim }}>Audit Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {activeDetail.ocr_comparisons && activeDetail.ocr_comparisons.length > 0 ? (
                            activeDetail.ocr_comparisons.map((item, idx) => {
                              const status = item.status || (item.match ? "MATCH" : "MISMATCH");
                              const isNeutral = status === 'NOT EXTRACTED' || status === 'NOT PRESENT IN DOCUMENT' || status === 'NOT APPLICABLE';

                              return (
                                <tr key={idx} style={{ borderBottom: '1px solid rgba(0,0,0,0.06)', background: status === 'MISMATCH' ? C.dangerDim : 'transparent' }}>
                                  <td style={{ padding: '1rem', fontWeight: 700, color: C.text, fontSize: '0.85rem' }}>
                                    {item.field}
                                  </td>
                                  <td style={{ padding: '1rem', fontFamily: 'monospace', fontSize: '0.85rem', color: item.ocrValue === 'Not Extracted' ? C.dim : (status === 'MISMATCH' ? C.danger : C.text) }}>
                                    {item.ocrValue}
                                  </td>
                                  <td style={{ padding: '1rem', fontFamily: 'monospace', fontSize: '0.85rem', color: item.profileValue === 'Not Present in Document' ? C.dim : (status === 'MISMATCH' ? C.danger : C.text) }}>
                                    {item.profileValue}
                                  </td>
                                  <td style={{ padding: '1rem', textAlign: 'center' }}>
                                    {status === "MATCH" && (
                                      <span style={{ padding: '4px 12px', borderRadius: 999, fontSize: '0.6rem', fontWeight: 700, background: C.successDim, color: C.success, border: `1px solid rgba(52,211,153,0.3)` }}>
                                        ✓ MATCH
                                      </span>
                                    )}
                                    {status === "MISMATCH" && (
                                      <span style={{ padding: '4px 12px', borderRadius: 999, fontSize: '0.6rem', fontWeight: 700, background: C.dangerDim, color: C.danger, border: `1px solid rgba(251,113,133,0.3)` }}>
                                        ⚠ MISMATCH
                                      </span>
                                    )}
                                    {status === "NOT EXTRACTED" && (
                                      <span style={{ padding: '4px 12px', borderRadius: 999, fontSize: '0.6rem', fontWeight: 700, background: C.infoDim, color: C.info, border: `1px solid rgba(76,157,176,0.3)` }}>
                                        — NOT EXTRACTED
                                      </span>
                                    )}
                                    {status === "NOT PRESENT IN DOCUMENT" && (
                                      <span style={{ padding: '4px 12px', borderRadius: 999, fontSize: '0.6rem', fontWeight: 700, background: C.warningDim, color: C.warning, border: `1px solid rgba(76,157,176,0.3)` }}>
                                        — NOT IN DOCUMENT
                                      </span>
                                    )}
                                    {status === "NOT APPLICABLE" && (
                                      <span style={{ padding: '4px 12px', borderRadius: 999, fontSize: '0.6rem', fontWeight: 700, background: C.bgHigh, color: C.dim, border: `1px solid ${C.borderV}` }}>
                                        — N/A
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })
                          ) : (
                            <tr>
                              <td colSpan={4} style={{ padding: '2rem', textAlign: 'center', color: C.dim, fontStyle: 'italic' }}>
                                No extracted fields available for comparison.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  )}

                  {/* 7. VERIFICATION DOCUMENTS SECTION */}
                  <div>
                    <div style={{ marginBottom: '1rem' }}>
                      <h4 style={{ fontFamily: M, fontWeight: 700, fontSize: '0.95rem', color: C.primary, margin: '0 0 2px' }}>
                        Uploaded Documents ({activeDetail.documents.length})
                      </h4>
                      <p style={{ fontSize: '0.75rem', color: C.dim, margin: 0 }}>
                        Open and review any files uploaded by this account.
                      </p>
                    </div>

                    {activeDetail.documents.length > 0 ? (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
                        {activeDetail.documents.map((doc, idx) => {
                          const docStatusBadge = getStatusBadgeStyle(doc.verification_status);

                          return (
                            <div key={idx} style={{ ...glass, padding: '1.25rem', borderRadius: 16, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                              <div>
                                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 12 }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <div style={{ width: 40, height: 40, borderRadius: 10, background: C.primCont, color: C.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid rgba(37,99,235,0.2)` }}>
                                      <span className="material-symbols-outlined" style={{ fontSize: '1.25rem' }}>picture_as_pdf</span>
                                    </div>
                                    <div>
                                      <h5 style={{ fontSize: '0.85rem', fontWeight: 700, color: C.text, margin: 0 }}>
                                        {doc.document_type_label || doc.document_type}
                                      </h5>
                                      <span style={{ fontSize: '0.65rem', fontFamily: 'monospace', color: C.cyan, fontWeight: 600 }} title={doc.name}>
                                        {doc.name}
                                      </span>
                                    </div>
                                  </div>
                                  <span style={{ padding: '2px 8px', borderRadius: 999, fontSize: '0.55rem', fontWeight: 700, textTransform: 'uppercase', ...docStatusBadge }}>
                                    {formatStatusLabel(doc.verification_status)}
                                  </span>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '10px 0', borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`, fontSize: '0.75rem', marginBottom: 16 }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ color: C.dim }}>Filename:</span>
                                    <span style={{ fontFamily: 'monospace', color: C.text, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={doc.name}>
                                      {doc.name}
                                    </span>
                                  </div>
                                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ color: C.dim }}>Upload Date:</span>
                                    <span style={{ fontFamily: 'monospace', color: C.text }}>
                                      {doc.upload_date || "N/A"}
                                    </span>
                                  </div>
                                  {doc.verification_score != null && (
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                      <span style={{ color: C.dim }}>Field Completion:</span>
                                      <span style={{ fontWeight: 700, color: C.primary }}>
                                        {doc.verification_score}%
                                      </span>
                                    </div>
                                  )}
                                </div>
                              </div>

                              <a
                                href="#"
                                onClick={(e) => {
                                  e.preventDefault();
                                  void openAdminDocument(doc.id, doc.name || 'document');
                                }}
                                style={{
                                  width: '100%',
                                  padding: '0.6rem 0',
                                  textAlign: 'center',
                                  borderRadius: 10,
                                  background: C.primCont,
                                  color: C.primary,
                                  fontSize: '0.8rem',
                                  fontWeight: 700,
                                  textDecoration: 'none',
                                  border: `1px solid rgba(37,99,235,0.25)`,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: 6,
                                  transition: 'all 0.2s',
                                }}
                                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = C.primary; (e.currentTarget as HTMLElement).style.color = '#001d35'; }}
                                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = C.primCont; (e.currentTarget as HTMLElement).style.color = C.primary; }}>
                                <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>open_in_new</span>
                                View Document
                              </a>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p style={{ fontSize: '0.8rem', color: C.dim, fontStyle: 'italic', padding: '1.5rem', background: 'var(--color-surface)', borderRadius: 16, border: `1px solid ${C.border}`, margin: 0, textAlign: 'center' }}>
                        No documents have been uploaded by this account yet.
                      </p>
                    )}
                  </div>

                  {/* 8. PROVIDER PROFILE INFORMATION SECTION */}
                  <div style={{ padding: '1.5rem', borderRadius: 20, background: 'var(--color-surface)', border: `1px solid ${C.borderV}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', paddingBottom: '0.75rem', borderBottom: `1px solid ${C.border}` }}>
                      <div>
                        <h4 style={{ fontFamily: M, fontWeight: 700, fontSize: '0.95rem', color: C.primary, margin: '0 0 2px' }}>
                          PROVIDER PROFILE INFORMATION
                        </h4>
                        <p style={{ fontSize: '0.75rem', color: C.dim, margin: 0 }}>
                          Verified database profile record, registered services, ports attended, and corporate metadata.
                        </p>
                      </div>
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, color: C.text, background: C.bgCard, padding: '4px 12px', borderRadius: 12, border: `1px solid ${C.borderV}`, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span className="material-symbols-outlined" style={{ fontSize: '0.9rem', color: C.cyan }}>account_box</span>
                        Profile ID: {activeDetail.id.slice(0, 8)}...
                      </span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                      {/* 1. Company Information */}
                      <div style={{ padding: '1.25rem', borderRadius: 14, background: 'var(--color-surface)', border: `1px solid ${C.border}` }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: C.primary }}>
                          <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>domain</span> Company Information
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: '0.8rem' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: C.dim }}>Company Name:</span>
                            <span style={{ fontWeight: 600, color: C.text }}>{activeDetail.company_name}</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: C.dim }}>Position / Role:</span>
                            <span style={{ fontWeight: 600, color: C.text }}>{activeDetail.position || "N/A"}</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: C.dim }}>Years Experience:</span>
                            <span style={{ fontWeight: 600, color: C.text }}>{activeDetail.years_experience} Years</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: C.dim }}>Availability:</span>
                            <span style={{ fontWeight: 600, color: C.cyan, textTransform: 'uppercase' }}>{activeDetail.availability_status || "Available"}</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: C.dim }}>Offices / Base:</span>
                            <span style={{ fontWeight: 600, color: C.text }}>{activeDetail.offices && activeDetail.offices.length > 0 ? activeDetail.offices.join(", ") : activeDetail.location}</span>
                          </div>
                        </div>
                      </div>

                      {/* 2. Contact Information */}
                      <div style={{ padding: '1.25rem', borderRadius: 14, background: 'var(--color-surface)', border: `1px solid ${C.border}` }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: C.primary }}>
                          <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>badge</span> Contact Information
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: '0.8rem' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: C.dim }}>Primary Contact:</span>
                            <span style={{ fontWeight: 600, color: C.text }}>{activeDetail.full_name}</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: C.dim }}>Email Address:</span>
                            <span style={{ fontWeight: 600, color: C.cyan }}>{activeDetail.email}</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: C.dim }}>Phone Number:</span>
                            <span style={{ fontFamily: 'monospace', color: C.text }}>{activeDetail.phone || "N/A"}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                      {/* 3. Registration Info */}
                      <div style={{ padding: '1.25rem', borderRadius: 14, background: 'var(--color-surface)', border: `1px solid ${C.border}` }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: C.primary }}>
                          <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>verified_user</span> Registration Information
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: '0.8rem' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: C.dim }}>Registration No.:</span>
                            <span style={{ fontFamily: 'monospace', fontWeight: 600, color: C.text }}>{activeDetail.registration_info?.registration_number || "N/A"}</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: C.dim }}>Tax ID / VAT:</span>
                            <span style={{ fontFamily: 'monospace', fontWeight: 600, color: C.text }}>{activeDetail.registration_info?.tax_id || "N/A"}</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: C.dim }}>Expiry Date:</span>
                            <span style={{ fontFamily: 'monospace', fontWeight: 600, color: C.text }}>{activeDetail.registration_info?.expiry_date || "N/A"}</span>
                          </div>
                        </div>
                      </div>

                      {/* 4. Certifications */}
                      <div style={{ padding: '1.25rem', borderRadius: 14, background: 'var(--color-surface)', border: `1px solid ${C.border}` }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: C.primary }}>
                          <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>workspace_premium</span> Certifications &amp; Licenses
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                          {activeDetail.certifications && activeDetail.certifications.length > 0 ? (
                            activeDetail.certifications.map((cert, idx) => (
                              <span key={idx} style={{ padding: '4px 10px', borderRadius: 8, background: C.bgLowest, color: C.text, fontSize: '0.75rem', border: `1px solid ${C.borderV}`, fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                <span className="material-symbols-outlined" style={{ fontSize: '0.85rem', color: C.cyan }}>verified</span>
                                {cert}
                              </span>
                            ))
                          ) : (
                            <span style={{ fontSize: '0.8rem', color: C.dim, fontStyle: 'italic' }}>No licenses recorded</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* 5. Ports Attended */}
                    <div style={{ padding: '1.25rem', borderRadius: 14, background: 'var(--color-surface)', border: `1px solid ${C.border}`, marginBottom: '1rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: C.primary }}>
                        <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>anchor</span> Ports Attended / Service Locations
                      </div>
                      {activeDetail.head_office && (
                        <div style={{ fontSize: '0.8rem', color: C.text, marginBottom: 10 }}>
                          <span style={{ color: C.dim }}>Head office / main port: </span>
                          <strong>{activeDetail.head_office}</strong>
                          {activeDetail.country ? <span style={{ color: C.dim }}> · {activeDetail.country}</span> : null}
                        </div>
                      )}
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {activeDetail.ports_served && activeDetail.ports_served.length > 0 ? (
                          activeDetail.ports_served.map((port, idx) => (
                            <span key={idx} style={{ padding: '4px 12px', borderRadius: 8, background: C.primCont, color: C.primary, fontSize: '0.75rem', fontWeight: 700, border: `1px solid rgba(37,99,235,0.25)`, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                              <span className="material-symbols-outlined" style={{ fontSize: '0.85rem' }}>location_on</span>
                              {port}
                            </span>
                          ))
                        ) : (
                          <span style={{ fontSize: '0.8rem', color: C.dim, fontStyle: 'italic' }}>No ports specified</span>
                        )}
                      </div>

                      {/* Add a missing port so the vendor can set it as head office */}
                      <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${C.borderV}` }}>
                        <div style={{ fontSize: '0.7rem', color: C.dim, marginBottom: 6 }}>
                          Port missing from the marketplace list? Add it here — the vendor can then select it as their head office.
                        </div>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <input
                            value={newPortName}
                            onChange={(e) => { setNewPortName(e.target.value); setPortNotice(''); }}
                            placeholder="Port name (e.g. Kollam)"
                            style={{ flex: '2 1 180px', padding: '0.5rem 0.7rem', borderRadius: 8, border: `1px solid ${C.borderV}`, background: C.bgLowest, color: C.text, fontSize: '0.8rem' }}
                          />
                          <input
                            value={newPortState}
                            onChange={(e) => setNewPortState(e.target.value)}
                            placeholder="State (optional)"
                            style={{ flex: '1 1 120px', padding: '0.5rem 0.7rem', borderRadius: 8, border: `1px solid ${C.borderV}`, background: C.bgLowest, color: C.text, fontSize: '0.8rem' }}
                          />
                          <button
                            disabled={addingPort || newPortName.trim().length < 2}
                            onClick={async () => {
                              setAddingPort(true);
                              setPortNotice('');
                              try {
                                await adminVerificationService.createPort({ name: newPortName.trim(), state: newPortState.trim() || undefined });
                                setPortNotice(`'${newPortName.trim()}' added to the port list.`);
                                setNewPortName('');
                                setNewPortState('');
                              } catch (err: any) {
                                setPortNotice(err?.response?.data?.detail?.message || 'Could not add that port.');
                              } finally {
                                setAddingPort(false);
                              }
                            }}
                            style={{ padding: '0.5rem 1rem', borderRadius: 8, border: 'none', background: C.primary, color: 'var(--color-on-brand)', fontWeight: 700, fontSize: '0.8rem', cursor: addingPort || newPortName.trim().length < 2 ? 'not-allowed' : 'pointer', opacity: addingPort || newPortName.trim().length < 2 ? 0.6 : 1 }}
                          >
                            {addingPort ? 'Adding…' : 'Add port'}
                          </button>
                        </div>
                        {portNotice && (
                          <div style={{ fontSize: '0.75rem', color: C.muted, marginTop: 6 }}>{portNotice}</div>
                        )}
                      </div>
                    </div>

                    {/* 6. Registered Services */}
                    <div style={{ padding: '1.25rem', borderRadius: 14, background: 'var(--color-surface)', border: `1px solid ${C.border}` }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: C.primary }}>
                          <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>construction</span> Registered Services ({activeDetail.services?.length || 0})
                        </div>
                        <span style={{ fontSize: '0.65rem', color: C.dim, textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600 }}>
                          Linked via Service Model
                        </span>
                      </div>

                      {activeDetail.services && activeDetail.services.length > 0 ? (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                          {activeDetail.services.map((srv, idx) => (
                            <div key={idx} style={{ padding: '1rem', borderRadius: 12, background: C.bgLowest, border: `1px solid ${C.borderV}` }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                                <h6 style={{ fontSize: '0.85rem', fontWeight: 700, color: C.text, margin: 0 }}>{srv.name}</h6>
                                <span style={{ padding: '2px 8px', borderRadius: 999, fontSize: '0.55rem', fontWeight: 700, textTransform: 'uppercase', background: 'var(--color-brand-tint)', color: C.cyan }}>
                                  {srv.category}
                                </span>
                              </div>
                              {srv.description && (
                                <p style={{ fontSize: '0.75rem', color: C.dim, margin: '4px 0 8px', lineHeight: 1.4 }}>{srv.description}</p>
                              )}
                              <div style={{ fontSize: '0.7rem', color: C.dim, display: 'flex', justifyContent: 'space-between' }}>
                                <span>Port: <span style={{ fontFamily: 'monospace', color: C.text }}>{srv.port_id}</span></span>
                                <span style={{ color: C.cyan, fontWeight: 600 }}>Active Listing</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p style={{ fontSize: '0.8rem', color: C.dim, fontStyle: 'italic', margin: 0 }}>No active services registered for this provider.</p>
                      )}
                    </div>
                  </div>

                  {/* PAYMENT & PAPERWORK — a client is only approvable when
                      both the documents and the bank transfer are in. */}
                  <div style={{ padding: '1.25rem', borderRadius: 12, background: C.bgLowest, border: `1px solid ${C.borderV}`, display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
                      <h5 style={{ fontFamily: M, fontSize: '0.8rem', fontWeight: 700, color: C.text, margin: 0, textTransform: 'uppercase', letterSpacing: '0.12em' }}>
                        Payment &amp; Paperwork
                      </h5>
                      <span style={{
                        padding: '3px 10px',
                        borderRadius: 999,
                        fontSize: '0.6rem',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.08em',
                        background: activeDetail.ready_for_approval ? C.successDim : C.warningDim,
                        color: activeDetail.ready_for_approval ? C.success : C.warning,
                        border: `1px solid ${activeDetail.ready_for_approval ? C.success : C.warning}`,
                      }}>
                        {activeDetail.ready_for_approval ? 'Ready to approve' : 'Not ready'}
                      </span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                      <div>
                        <p style={{ fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: C.text, margin: '0 0 4px' }}>Paperwork</p>
                        <p style={{ fontSize: '0.8rem', color: activeDetail.documents_submitted ? C.text : C.error, margin: 0 }}>
                          {activeDetail.documents_submitted
                            ? `${activeDetail.documents_count} document${activeDetail.documents_count === 1 ? '' : 's'} submitted`
                            : 'No documents submitted yet'}
                        </p>
                      </div>
                      <div>
                        <p style={{ fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: C.text, margin: '0 0 4px' }}>Payment</p>
                        {activeDetail.payment ? (
                          <div style={{ fontSize: '0.8rem', color: C.text, lineHeight: 1.5 }}>
                            <div style={{ fontWeight: 700 }}>
                              {activeDetail.payment.plan_name || activeDetail.payment.plan_code}
                              {' · '}₹{(activeDetail.payment.amount_paise / 100).toLocaleString('en-IN')}
                            </div>
                            <div>UTR {activeDetail.payment.utr}</div>
                            {activeDetail.payment.submitted_at && (
                              <div>Submitted {new Date(activeDetail.payment.submitted_at).toLocaleDateString()}</div>
                            )}
                            {activeDetail.payment.receipt_available ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginTop: 2 }}>
                                <span>Receipt attached</span>
                                <span style={{ color: C.dim }}>·</span>
                                <button
                                  type="button"
                                  disabled={receiptLoading}
                                  onClick={() => handleViewReceipt(activeDetail.payment!.id)}
                                  style={{
                                    background: 'none',
                                    border: 'none',
                                    color: C.primary,
                                    fontSize: '0.8rem',
                                    fontWeight: 700,
                                    cursor: receiptLoading ? 'wait' : 'pointer',
                                    padding: 0,
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 4,
                                    textDecoration: 'underline',
                                    textUnderlineOffset: 2,
                                    fontFamily: 'inherit',
                                  }}
                                  aria-label="View uploaded payment receipt"
                                >
                                  <span className="material-symbols-outlined" style={{ fontSize: '0.95rem' }}>visibility</span>
                                  {receiptLoading ? 'Opening...' : 'View Receipt'}
                                </button>
                              </div>
                            ) : (
                              <div>No receipt attached</div>
                            )}
                            {receiptError && (
                              <div style={{ fontSize: '0.72rem', color: C.error, marginTop: 4 }}>
                                {receiptError}
                              </div>
                            )}
                          </div>
                        ) : (
                          <p style={{ fontSize: '0.8rem', color: C.error, margin: 0 }}>
                            No bank transfer awaiting verification
                          </p>
                        )}
                      </div>
                    </div>

                    {activeDetail.approval_blockers.length > 0 && (
                      <p style={{ fontSize: '0.75rem', color: C.text, margin: 0, lineHeight: 1.6 }}>
                        Approving this account is blocked until the following is in:{' '}
                        {activeDetail.approval_blockers
                          .map(b => (b === 'payment_required' ? 'the bank transfer' : 'the verification documents'))
                          .join(' and ')}
                        .
                      </p>
                    )}
                  </div>

                  {/* GIVE PASSES — clients only. Vendors hold no passes and have no
                      session limit; their money buys listing showcase time, which is
                      verified in the Listing Fees queue with a 1-month/1-year period. */}
                  <div
                    style={{
                      display: activeDetail.role === 'client' ? 'flex' : 'none',
                      flexDirection: 'column',
                      gap: '0.75rem',
                      paddingTop: '1.5rem',
                      borderTop: `1px solid ${C.border}`,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span
                        className="material-symbols-outlined"
                        style={{ color: C.primary, fontSize: '1.1rem' }}
                      >
                        confirmation_number
                      </span>
                      <span
                        style={{
                          fontSize: '0.65rem',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          letterSpacing: '0.15em',
                          color: C.dim,
                        }}
                      >
                        Give access passes
                      </span>
                    </div>
                    <p style={{ fontSize: '0.78rem', color: C.muted, margin: 0, lineHeight: 1.6 }}>
                      Passes follow a <strong style={{ color: C.text }}>verified payment</strong>:
                      approving the client's platform fee issues 10 passes (monthly) or 100
                      (annual) automatically. Manual issue is only for a fee settled outside the
                      portal, and it is recorded as a grant with no payment linked.
                    </p>
                    {grantPolicy && !grantPolicy.enabled && (
                      <div
                        style={{
                          padding: '0.75rem 0.9rem',
                          borderRadius: 10,
                          background: C.warningDim,
                          border: `1px solid ${C.borderV}`,
                        }}
                      >
                        <p style={{ fontSize: '0.76rem', color: C.text, margin: 0, lineHeight: 1.6 }}>
                          <strong>Manual issue is disabled.</strong> Client passes are issued
                          when you approve their platform-fee payment in the Pending Payments
                          queue. An operator can enable manual grants for genuine offline cases.
                        </p>
                      </div>
                    )}
                    {grantPolicy?.enabled && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                        <textarea
                          value={grantReason}
                          onChange={(e) => setGrantReason(e.target.value)}
                          rows={2}
                          placeholder="Why are these passes being issued without a payment? (required)"
                          style={{
                            width: '100%',
                            padding: '0.6rem 0.75rem',
                            borderRadius: 10,
                            background: C.bgHigh,
                            color: C.text,
                            border: `1px solid ${C.borderV}`,
                            fontFamily: I,
                            fontSize: '0.8rem',
                            resize: 'vertical',
                          }}
                        />
                        <label
                          style={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: 8,
                            fontSize: '0.75rem',
                            color: C.muted,
                            lineHeight: 1.5,
                            cursor: 'pointer',
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={grantConfirmed}
                            onChange={(e) => setGrantConfirmed(e.target.checked)}
                            style={{ marginTop: 2 }}
                          />
                          I confirm no payment is linked to this issue; it will be logged as a
                          manual grant.
                        </label>
                      </div>
                    )}
                    <div
                      style={{
                        display: grantPolicy?.enabled ? 'flex' : 'none',
                        gap: '0.75rem',
                        flexWrap: 'wrap',
                      }}
                    >
                      {([
                        { pack: '10' as const, passes: 10, months: 6 },
                        { pack: '100' as const, passes: 100, months: 12 },
                      ]).map((option) => (
                        <button
                          key={option.pack}
                          disabled={actionLoading}
                          onClick={() => handleGrantPasses(option.pack)}
                          style={{
                            flex: '1 1 180px',
                            padding: '0.7rem 1rem',
                            borderRadius: 12,
                            background: C.bgHigh,
                            color: C.text,
                            border: `1px solid ${C.borderV}`,
                            cursor: actionLoading ? 'not-allowed' : 'pointer',
                            opacity: actionLoading ? 0.6 : 1,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 10,
                            fontFamily: I,
                          }}
                        >
                          <span style={{ fontWeight: 800, fontSize: '0.85rem' }}>
                            {option.passes} passes
                          </span>
                          <span style={{ fontSize: '0.72rem', color: C.muted }}>
                            {option.months} months
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* ACTION CONTROL BUTTONS */}
                  <div style={{ display: 'flex', gap: '1rem', paddingTop: '1.5rem', borderTop: `1px solid ${C.border}` }}>
                    <button
                      disabled={actionLoading || activeDetail.approval_blockers.length > 0}
                      onClick={() => handleAction('approve')}
                      title={
                        activeDetail.approval_blockers.length > 0
                          ? activeDetail.role === 'client'
                            ? 'Waiting on the documents and the bank transfer'
                            : 'Waiting on the verification documents'
                          : activeDetail.role === 'client'
                            ? 'Approve and issue the purchased passes'
                            : 'Approve this vendor (their listings go live once a showcase payment is verified)'
                      }
                      style={{
                        flex: 1,
                        padding: '0.85rem 1.5rem',
                        borderRadius: 12,
                        background: C.primary,
                        color: 'var(--color-on-brand)',
                        fontFamily: I,
                        fontWeight: 700,
                        fontSize: '0.9rem',
                        border: 'none',
                        cursor: actionLoading || activeDetail.approval_blockers.length > 0 ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 8,
                        boxShadow: '0 8px 20px rgba(37,99,235,0.2)',
                        opacity: actionLoading || activeDetail.approval_blockers.length > 0 ? 0.55 : 1,
                        transition: 'transform 0.15s',
                      }}>
                      <span className="material-symbols-outlined">check_circle</span>
                      {activeDetail.role === 'client' ? 'Approve & Issue Passes' : 'Approve Vendor'}
                    </button>

                    <button
                      disabled={actionLoading}
                      onClick={() => setModalType('under_review')}
                      style={{
                        padding: '0.85rem 1.5rem',
                        borderRadius: 12,
                        background: 'var(--bg-glass)',
                        backdropFilter: 'blur(20px)',
                        color: C.text,
                        fontFamily: I,
                        fontWeight: 700,
                        fontSize: '0.9rem',
                        border: `1px solid ${C.borderV}`,
                        cursor: actionLoading ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 8,
                        opacity: actionLoading ? 0.6 : 1,
                      }}>
                      <span className="material-symbols-outlined" style={{ color: C.secondary }}>help_outline</span>
                      Request Clarification / Under Review
                    </button>

                    <button
                      disabled={actionLoading}
                      onClick={() => setModalType('reject')}
                      style={{
                        padding: '0.85rem 1.5rem',
                        borderRadius: 12,
                        background: C.errorCont,
                        color: C.error,
                        fontFamily: I,
                        fontWeight: 700,
                        fontSize: '0.9rem',
                        border: `1px solid rgba(220,38,38,0.25)`,
                        cursor: actionLoading ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 8,
                        opacity: actionLoading ? 0.6 : 1,
                      }}>
                      <span className="material-symbols-outlined">block</span>
                      Reject Request
                    </button>
                  </div>
                </div>
              ) : null}
            </section>
          )}
        </main>
      </div>

      {/* CLARIFICATION / REJECTION REASON MODAL */}
      {modalType && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(12px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div style={{ ...glass, maxWidth: 480, width: '100%', padding: '2rem', borderRadius: 24, boxShadow: '0 20px 40px rgba(0,0,0,0.5)' }}>
            <h3 style={{ fontFamily: M, fontWeight: 800, fontSize: '1.25rem', color: C.text, margin: '0 0 8px' }}>
              {modalType === 'under_review' ? 'Request Clarification / Mark Under Review' : 'Reject Account Verification'}
            </h3>
            <p style={{ fontSize: '0.8rem', color: C.dim, margin: '0 0 1.25rem' }}>
              {modalType === 'under_review'
                ? 'Specify the reason or missing documents required from the provider.'
                : 'Provide the compliance or document reason for rejecting this application.'}
            </p>
            <textarea
              rows={4}
              value={modalReason}
              onChange={(e) => setModalReason(e.target.value)}
              placeholder="Enter note or reason for provider notification..."
              style={{ width: '100%', background: C.bgLowest, borderRadius: 12, padding: '12px', fontSize: '0.85rem', color: C.text, border: `1px solid ${C.borderV}`, outline: 'none', marginBottom: '1.5rem', fontFamily: I, boxSizing: 'border-box' as const }}
            />
            {modalType === 'reject' && modalReason.trim().length < 3 && (
              <p style={{ fontSize: '0.72rem', color: C.error, margin: '-1rem 0 1rem' }}>
                A rejection reason of at least 3 characters is required.
              </p>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
              <button
                type="button"
                onClick={() => { setModalType(null); setModalReason(""); }}
                style={{ padding: '0.6rem 1.25rem', borderRadius: 12, fontSize: '0.875rem', fontWeight: 600, color: C.dim, background: 'none', border: 'none', cursor: 'pointer' }}>
                Cancel
              </button>
              <button
                type="button"
                disabled={actionLoading || (modalType === 'reject' && modalReason.trim().length < 3)}
                onClick={() => handleAction(modalType, modalReason)}
                style={{
                  padding: '0.6rem 1.25rem',
                  borderRadius: 12,
                  fontSize: '0.875rem',
                  fontWeight: 700,
                  border: 'none',
                  cursor: actionLoading ? 'not-allowed' : 'pointer',
                  background: modalType === 'under_review' ? C.primary : C.error,
                  color: modalType === 'under_review' ? 'var(--color-on-brand)' : 'var(--color-text-inverse)',
                  boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
                }}>
                Confirm Action
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProviderVerification;

