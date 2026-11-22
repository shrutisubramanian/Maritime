import { adminClient } from './adminAuth';

// All admin-verification calls use adminClient, whose httpOnly session cookie
// and CSRF header are attached by its interceptors — no token in JS.
const adminHeaders = (): Record<string, string> => ({});

/**
 * Which approval queue a section covers.
 *
 * The console keeps two separate queues: `client` (buyers) and `vendor`
 * (suppliers + service providers). Omitted means every role, which is what an
 * older caller sending no scope still gets.
 */
export type VerificationRoleScope = 'client' | 'vendor';

export interface VerificationStats {
  pending: number;
  under_review: number;
  approved: number;
  rejected: number;
  total: number;
  /** Accounts with documents submitted AND a bank transfer awaiting review. */
  ready_for_approval: number;
  /** Echoed by the server: which queue these counts describe. */
  scope?: VerificationRoleScope | 'all';
}

export interface VerificationFilterParams {
  search?: string;
  status?: string;
  /** Only accounts whose paperwork is in AND whose payment is awaiting review. */
  ready_only?: boolean;
  /** Restrict the queue to one admin section. */
  role?: VerificationRoleScope;
  score_min?: number;
  score_max?: number;
  date_from?: string;
  date_to?: string;
  country?: string;
  page?: number;
  limit?: number;
}

export interface OcrComparisonItem {
  field: string;
  ocrValue: string;
  profileValue: string;
  status?: 'MATCH' | 'MISMATCH' | 'MISSING' | 'NOT VERIFIED' | string;
  match: boolean;
}

export interface ProviderDocumentItem {
  id: string;
  document_type: string;
  document_type_label?: string;
  name: string;
  upload_date?: string;
  ocr_status?: string;
  verification_score?: number;
  verification_status: string;
  created_at?: string;
  /** When an admin last approved/rejected this document (server-stamped). */
  reviewed_at?: string | null;
  reviewer_id?: string | null;
  ocr_extracted_data?: any;
}

/** One row in the admin-wide uploaded-document register. */
export interface AdminDocumentItem extends ProviderDocumentItem {
  uploader: {
    user_id: string | null;
    full_name: string | null;
    email: string | null;
    role: string | null;
    company_name: string | null;
  };
  profile_id: string | null;
}

export interface AdminDocumentList {
  data: AdminDocumentItem[];
  total: number;
  page: number;
  limit: number;
  pages: number;
  counts: Record<string, number>;
}

/** The bank-transfer context attached to an account awaiting approval. */
export interface PendingPaymentSummary {
  id: string;
  plan_code: string | null;
  plan_name: string | null;
  amount_paise: number;
  currency: string;
  utr: string;
  payment_date?: string | null;
  submitted_at?: string | null;
  receipt_available: boolean;
  receipt_url: string;
}

export interface ProviderVerificationItem {
  id: string;
  user_id: string;
  /** The account's role — the queue covers every non-admin role. */
  role?: string | null;
  company_name: string;
  full_name: string;
  email: string;
  phone: string;
  position: string | null;
  years_experience: number;
  verification_status: string;
  location: string;
  flag: string;
  /** Field-COMPLETENESS average (H7 semantics); null when no scored documents. */
  verification_score: number | null;
  max_score: number | null;
  created_at?: string;
  submission_date?: string;
  risk_indicator?: string | null;
  risk_level?: 'low' | 'medium' | 'high' | null;
  documents_count: number;
  /** True once at least one verification document is on file. */
  documents_submitted: boolean;
  documents: ProviderDocumentItem[];
  /** Pending bank transfer, if the account has submitted one. */
  payment: PendingPaymentSummary | null;
  /** `documents_required` / `payment_required` — empty means approvable. */
  approval_blockers: string[];
  ready_for_approval: boolean;
}

export interface ProviderVerificationDetail extends ProviderVerificationItem {
  country?: string;
  badge_label?: string | null;
  ocr_confidence: number | null;
  updated_at?: string;
  offices?: string[];
  ports_served?: string[];
  /** Port the company's head office operates from (drives the marketplace filter). */
  head_office?: string | null;
  /** Vendor-supplied brochure metadata (served through the marketplace). */
  brochure_filename?: string | null;
  services?: Array<{
    id: string;
    name: string;
    category: string;
    subcategory?: string;
    description?: string;
    port_id?: string;
    is_active?: boolean;
  }>;
  certifications?: string[];
  availability_status?: string;
  registration_info?: {
    registration_number?: string;
    tax_id?: string;
    expiry_date?: string;
  };
  ocr_comparisons: OcrComparisonItem[];
  /** Append-only record of account-level decisions, newest first. */
  review_history?: Array<{
    action: string;
    reason: string | null;
    reviewed_at: string | null;
    reviewer: string | null;
  }>;
  last_reviewed_at?: string | null;
  last_reviewed_by?: string | null;
  review_note?: string | null;
  /** Metadata state: approved | rejected | under_review, or the raw status. */
  decision_state?: string | null;
}

export const adminVerificationService = {
  getStats: async (role?: VerificationRoleScope): Promise<VerificationStats> => {
    const response = await adminClient.get('/admin/verification/stats', {
      params: role ? { role } : undefined,
      headers: adminHeaders(),
    });
    return response.data;
  },

  getProviders: async (params?: VerificationFilterParams) => {
    const response = await adminClient.get('/admin/verification/providers', { params, headers: adminHeaders() });
    return response.data;
  },

  getProviderDetail: async (profileId: string): Promise<ProviderVerificationDetail> => {
    const response = await adminClient.get(`/admin/verification/providers/${profileId}`, { headers: adminHeaders() });
    return response.data;
  },

  /** Every uploaded document, with sender identity and review status. */
  listDocuments: async (params?: {
    status?: string;
    q?: string;
    page?: number;
    limit?: number;
  }): Promise<AdminDocumentList> => {
    const response = await adminClient.get('/admin/verification/documents', {
      params,
      headers: adminHeaders(),
    });
    return response.data;
  },

  /**
   * Add a port to the marketplace catalogue during verification, so a vendor
   * whose head office port is missing can select it.
   */
  createPort: async (payload: { name: string; state?: string }): Promise<{ id: string; name: string }> => {
    const response = await adminClient.post('/ports', payload, { headers: adminHeaders() });
    return response.data;
  },

  updateProviderAction: async (profileId: string, action: 'approve' | 'reject' | 'under_review', reason?: string): Promise<{
    message: string;
    payment_id?: string | null;
    passes_granted?: number | null;
  }> => {
    const response = await adminClient.post(`/admin/verification/providers/${profileId}/action`, {
      action,
      reason
    }, { headers: adminHeaders() });
    return response.data;
  },

  /**
   * Whether manual (no-payment) pass issue is available.
   *
   * The product rule is payment-first: approving a client's platform-fee
   * payment issues the plan's passes. Manual issue is an exception that an
   * operator has to switch on, and it always needs a written reason plus an
   * explicit no-payment confirmation.
   */
  passGrantPolicy: async (): Promise<{
    enabled: boolean;
    requires_reason: boolean;
    reason_min_length: number;
    requires_no_payment_confirmation: boolean;
    packs: { pack: string; passes: number; validity_months: number; plan_code: string }[];
    payment_flow: { message: string; monthly: string; annual: string };
  }> => {
    const response = await adminClient.get('/admin/verification/pass-grants/policy', {
      headers: adminHeaders(),
    });
    return response.data;
  },

  /**
   * Hand an account one of the two fixed access packs, WITHOUT a payment.
   * The size and validity are set by the server — the caller only picks which
   * pack, supplies the justification, and confirms nothing was paid.
   *   10 passes -> 6 months   100 passes -> 12 months
   */
  grantPasses: async (
    profileId: string,
    pack: '10' | '100',
    reason: string,
    confirmNoPayment: boolean
  ): Promise<{
    message: string;
    passes_granted: number;
    validity_months: number;
    validity_days: number;
    pack_id: string;
    expires_at: string;
    subscription_opened: boolean;
    payment_linked: boolean;
    reason: string;
  }> => {
    const response = await adminClient.post(
      `/admin/verification/providers/${profileId}/grant-passes`,
      { pack, reason, confirm_no_payment: confirmNoPayment },
      { headers: adminHeaders() }
    );
    return response.data;
  },

  /** A rejection must carry a reason; the server refuses one without it. */
  updateDocumentAction: async (documentId: string, action: 'approve' | 'reject', reason?: string) => {
    const response = await adminClient.post(`/admin/verification/documents/${documentId}/action`, {
      action,
      reason,
    }, { headers: adminHeaders() });
    return response.data;
  },

  /**
   * Fetch a stored provider document (KYC, tax, registration...) as a blob
   * using the admin JWT, and return an object URL for display/download.
   * Documents are never served from a public URL.
   */
  fetchDocumentFile: async (documentId: string): Promise<string> => {
    const response = await adminClient.get(`/admin/verification/documents/${documentId}/file`, {
      headers: adminHeaders(),
      responseType: 'blob',
    });
    return URL.createObjectURL(response.data as Blob);
  }
};
