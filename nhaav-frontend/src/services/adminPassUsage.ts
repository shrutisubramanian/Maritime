import { adminClient } from './adminAuth';

/**
 * Admin pass-usage client.
 *
 * Read-only: passes belong to individual ACCOUNTS, and every figure comes from
 * the entitlement rows the backend already records (activation, expiry,
 * consumption). Nothing here is computed in the browser beyond formatting.
 */

export interface PassPack {
  pack_id: string;
  source: string;
  token_count: number;
  status: string;
  created_at: string | null;
}

export interface PassAccount {
  user_id: string;
  email: string;
  full_name: string;
  company_name: string;
  role: string | null;
  access_control_enabled: boolean;
  plan: { code: string | null; name: string | null; expires_at: string | null } | null;
  total_passes: number;
  available_passes: number;
  active_passes: number;
  consumed_passes: number;
  expired_passes: number;
  current_session: {
    pass_id: string;
    activated_at: string | null;
    expires_at: string | null;
    remaining_seconds: number;
  } | null;
  last_used_at: string | null;
  last_consumed_at: string | null;
  next_unused_expiry: string | null;
  packs: PassPack[];
}

export interface PassRow {
  pass_id: string;
  status: 'AVAILABLE' | 'ACTIVE' | 'CONSUMED' | 'EXPIRED' | string;
  pack_id: string;
  pack_source: string | null;
  available_at: string | null;
  unused_expires_at: string | null;
  activated_at: string | null;
  expires_at: string | null;
  consumed_at: string | null;
  session_seconds: number;
}

export interface PassUsageTotals {
  accounts: number;
  passes_total: number;
  available: number;
  active: number;
  consumed: number;
  expired: number;
}

export interface PassUsageResponse {
  data: PassAccount[];
  total: number;
  page: number;
  pages: number;
  totals: PassUsageTotals;
  generated_at: string;
}

export interface PassUsageDetail {
  account: PassAccount;
  passes: PassRow[];
  generated_at: string;
}

export const adminPassUsageService = {
  list: async (params: {
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<PassUsageResponse> => {
    const response = await adminClient.get('/admin/passes/usage', { params });
    return response.data;
  },

  detail: async (userId: string): Promise<PassUsageDetail> => {
    const response = await adminClient.get(`/admin/passes/usage/${userId}`);
    return response.data;
  },
};
