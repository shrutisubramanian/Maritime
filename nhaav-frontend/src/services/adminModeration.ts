import { adminClient } from './adminAuth';

/**
 * Admin moderation client. Uses the separate admin session (an httpOnly cookie
 * set by /admin/auth/login, with the CSRF header attached by adminClient).
 */

export type ModerationKind = 'service' | 'supply';

export interface ModerationListing {
  id: string;
  kind: ModerationKind;
  name: string;
  category: string;
  subcategory: string | null;
  description: string | null;
  status: string;
  rejection_reason: string | null;
  owner_id: string;
  owner_company: string | null;
  owner_email: string | null;
  service_id: string | null;
  port_id: string | null;
  ports: string[];
  created_at: string;
  updated_at: string;
}

const authHeaders = (): Record<string, string> => ({});

export const adminModerationService = {
  getQueue: async (kind: ModerationKind, status?: string): Promise<{ data: ModerationListing[]; total: number }> => {
    const response = await adminClient.get('/admin/moderation/queue', {
      params: { kind, ...(status ? { status } : {}) },
      headers: authHeaders(),
    });
    return response.data;
  },

  act: async (
    kind: ModerationKind,
    listingId: string,
    status: 'approved' | 'rejected',
    reason?: string,
  ): Promise<{ id: string; kind: string; status: string; rejection_reason: string | null }> => {
    const response = await adminClient.post(
      `/admin/moderation/${kind}/${listingId}`,
      { status, reason: reason || null },
      { headers: authHeaders() },
    );
    return response.data;
  },
};
