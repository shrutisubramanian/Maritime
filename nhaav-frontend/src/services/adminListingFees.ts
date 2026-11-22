import { adminClient } from './adminAuth';
import type { ListingFee } from './listingFees';

/**
 * Admin review client for paid placements. Uses the separate admin session
 * (an httpOnly cookie set by /admin/auth/login, with the CSRF header attached
 * by adminClient) — never the regular user session.
 */
export interface AdminListingFee extends ListingFee {
  owner_email: string | null;
  owner_company: string | null;
  /** The listing's content-moderation status at review time. */
  listing_status: 'draft' | 'pending_review' | 'approved' | 'rejected' | 'archived' | null;
}

export interface ListingFeeDecision {
  fee_id: string;
  status: string;
  listing_type: string;
  listing_id: string;
  starts_at: string | null;
  expires_at: string | null;
  rejection_reason?: string | null;
}

const authHeaders = (): Record<string, string> => ({});

export const adminListingFeesService = {
  /**
   * Fee submissions. With no status the API returns the queue of submissions
   * still awaiting a decision (PENDING + SUBMITTED), matching payment review.
   */
  list: async (status?: string): Promise<{ data: AdminListingFee[]; total: number }> => {
    const response = await adminClient.get('/admin/listing-fees', {
      headers: authHeaders(),
      params: status ? { status } : {},
    });
    return response.data;
  },

  /**
   * Verify the transfer and start the showcase window.
   *
   * `period` is the reviewer's choice between the two approved options:
   * `month` (1 month, ₹1,000) or `year` (1 year, ₹10,000). The server refuses a
   * choice that does not match what the vendor paid, so a ₹1,000 transfer can
   * never be granted a year.
   */
  approve: async (
    feeId: string,
    period: 'month' | 'year',
  ): Promise<ListingFeeDecision> => {
    const response = await adminClient.post(
      `/admin/listing-fees/${feeId}/approve`,
      {},
      { headers: authHeaders(), params: { period } },
    );
    return response.data;
  },

  reject: async (feeId: string, reason: string): Promise<ListingFeeDecision> => {
    const response = await adminClient.post(
      `/admin/listing-fees/${feeId}/reject`,
      { reason },
      { headers: authHeaders() },
    );
    return response.data;
  },

  /** Receipts are private; fetch with the admin token as a blob. */
  openReceipt: async (feeId: string): Promise<void> => {
    const response = await adminClient.get(`/listing-fees/${feeId}/receipt`, {
      headers: authHeaders(),
      responseType: 'blob',
    });
    const url = window.URL.createObjectURL(response.data as Blob);
    window.open(url, '_blank', 'noopener');
    window.setTimeout(() => window.URL.revokeObjectURL(url), 60_000);
  },
};
