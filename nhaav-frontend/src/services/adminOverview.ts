import { adminClient } from './adminAuth';

/**
 * Admin operational data.
 *
 * Every field below is computed server-side from real rows. Nothing here is a
 * placeholder: an empty database returns zeros and empty arrays.
 */

export interface RegistrationPoint {
  date: string;
  count: number;
}

export interface AdminOverview {
  generated_at: string;
  accounts: {
    total: number;
    clients: number;
    providers: number;
    suppliers: number;
    vendors: number;
    registered_last_7_days: number;
    registered_last_30_days: number;
    registrations_series: RegistrationPoint[];
  };
  verification: { pending: number; verified: number; rejected: number };
  payments: { awaiting_review: number; verified_last_30_days: number };
  visibility: { active: number; expired: number; awaiting_review: number };
  procurement: { requests_total: number; requests_open: number; quotes_live: number };
  recent_registrations: Array<{
    user_id: string;
    email: string;
    role: string | null;
    company_name: string;
    full_name: string;
    email_verified: boolean;
    verification_status: string;
    created_at: string;
  }>;
  recent_admin_actions: Array<{
    source: 'payment' | 'moderation' | 'verification' | 'visibility' | 'listing_fee' | string;
    entity_type?: string;
    action: string;
    actor_role: string;
    reason: string | null;
    created_at: string;
  }>;
}

/** Onboarding stages, in the order the backend evaluates them. */
export const ACCOUNT_STAGES = [
  'unverified_email',
  'profile_missing',
  'awaiting_documents',
  'pending_verification',
  'awaiting_payment',
  'no_visibility',
  'complete',
] as const;

export type AccountStage = (typeof ACCOUNT_STAGES)[number];

export const STAGE_LABELS: Record<AccountStage, string> = {
  unverified_email: 'E-mail not verified',
  profile_missing: 'No company profile',
  awaiting_documents: 'Documents missing',
  pending_verification: 'Awaiting approval',
  awaiting_payment: 'Awaiting payment',
  no_visibility: 'No paid visibility',
  complete: 'Onboarding complete',
};

export interface AdminAccountRow {
  user_id: string;
  profile_id: string | null;
  email: string;
  full_name: string;
  role: string | null;
  company_name: string;
  country: string | null;
  email_verified: boolean;
  verification_status: string;
  stage: AccountStage;
  created_at: string;
}

export interface AdminAccountsResponse {
  data: AdminAccountRow[];
  total: number;
  page: number;
  pages: number;
  stage_counts: Record<AccountStage, number>;
  generated_at: string;
}

export interface AccountFilterParams {
  stage?: string;
  role?: string;
  q?: string;
  created_from?: string;
  created_to?: string;
  page?: number;
  limit?: number;
}

export interface AdminProcurementRow {
  request_id: string;
  title: string;
  request_type: string;
  category: string;
  subcategory: string | null;
  port: string;
  vessel_name: string | null;
  status: string;
  urgency: string;
  quantity: number | null;
  created_at: string;
  client: { user_id: string; email: string; company_name: string };
  quote_count: number;
}

export interface AdminProcurementResponse {
  data: AdminProcurementRow[];
  total: number;
  page: number;
  pages: number;
}

export interface AdminProcurementDetail {
  request_id: string;
  title: string;
  description: string | null;
  request_type: string;
  category: string;
  subcategory: string | null;
  port: string;
  vessel_name: string | null;
  vessel_type: string | null;
  status: string;
  urgency: string;
  quantity: number | null;
  budget: number | null;
  required_completion_date: string | null;
  created_at: string;
  client: { user_id: string | null; email: string | null; company_name: string; country: string | null };
  quote_count: number;
  quotes: Array<{
    quote_id: string;
    provider: { user_id: string; company_name: string };
    amount: number;
    currency: string;
    status: string;
    pricing_model: string | null;
    estimated_duration: string | null;
    created_at: string;
    decided_at: string | null;
  }>;
  read_only: boolean;
}

export interface ProcurementFilterParams {
  q?: string;
  status?: string;
  request_type?: string;
  created_from?: string;
  created_to?: string;
  sort?: 'newest' | 'oldest';
  page?: number;
  limit?: number;
}

export const adminOverviewService = {
  getOverview: async (): Promise<AdminOverview> => {
    const response = await adminClient.get('/admin/overview');
    return response.data;
  },

  getAccounts: async (params?: AccountFilterParams): Promise<AdminAccountsResponse> => {
    const response = await adminClient.get('/admin/accounts', { params });
    return response.data;
  },

  getProcurementRequests: async (
    params?: ProcurementFilterParams
  ): Promise<AdminProcurementResponse> => {
    const response = await adminClient.get('/admin/procurement/requests', { params });
    return response.data;
  },

  getProcurementRequest: async (requestId: string): Promise<AdminProcurementDetail> => {
    const response = await adminClient.get(`/admin/procurement/requests/${requestId}`);
    return response.data;
  },

  getProcurementSummary: async (): Promise<{
    requests_by_status: Record<string, number>;
    quotes_by_status: Record<string, number>;
    requests_total: number;
    quotes_total: number;
  }> => {
    const response = await adminClient.get('/admin/procurement/summary');
    return response.data;
  },
};

/** Review queue that can actually resolve a given stage. */
export const stageQueuePath = (stage: AccountStage, role: string | null): string => {
  if (stage === 'awaiting_payment') return '/admin/payments';
  if (stage === 'no_visibility') return '/admin/profile-visibility';
  if (stage === 'complete') return '/admin/profiles';
  return role === 'client' ? '/admin/verification' : '/admin/vendors';
};
