import { adminClient } from './adminAuth';

/**
 * Admin payment review client. Uses the separate admin session (an httpOnly
 * cookie set by /admin/auth/login, with the CSRF header attached by
 * adminClient) — never the regular user session.
 */
export interface PendingPayment {
  id: string;
  organization_id: string;
  organization_name: string | null;
  plan_code: string;
  plan_name: string;
  /** What the transfer pays for: subscription (this queue). */
  purpose?: string;
  /** Total charged: plan price PLUS GST (₹1,000 -> ₹1,180, ₹10,000 -> ₹11,800). */
  amount_paise: number;
  /** The server-derived split behind that total — shown so an approver sees the
   *  actual GST figure they are signing off, not just a lump sum. */
  base_paise: number;
  gst_paise: number;
  gst_rate_percent: number;
  currency: string;
  /** Nominal days: 6 months for the 10-pass plan, 12 months for the 100-pass. */
  pass_validity_days?: number | null;
  utr: string;
  payment_date: string;
  submitted_at: string | null;
  submitted_by: string | null;
  submitted_by_email: string | null;
  notes: string | null;
  receipt_filename: string;
  receipt_available: boolean;
  receipt_url: string;
}

export interface PaymentDecision {
  payment_id: string;
  status: string;
  rejection_reason: string | null;
  subscription_id: string | null;
  subscription_status: string | null;
  starts_at: string | null;
  expires_at: string | null;
  pack_id: string | null;
  total_passes: number | null;
  accesspack_created: boolean;
  already_processed: boolean;
}

const authHeaders = (): Record<string, string> => ({});

export const adminPaymentsService = {
  getPending: async (): Promise<{ data: PendingPayment[]; total: number }> => {
    const response = await adminClient.get('/admin/payments/pending', { headers: authHeaders() });
    return response.data;
  },

  approve: async (paymentId: string): Promise<PaymentDecision> => {
    const response = await adminClient.post(
      `/admin/payments/${paymentId}/approve`,
      {},
      { headers: authHeaders() },
    );
    return response.data;
  },

  reject: async (paymentId: string, reason: string): Promise<PaymentDecision> => {
    const response = await adminClient.post(
      `/admin/payments/${paymentId}/reject`,
      { reason },
      { headers: authHeaders() },
    );
    return response.data;
  },

  /** Receipts are private; fetch with the admin token as a blob. */
  openReceipt: async (paymentId: string): Promise<void> => {
    const response = await adminClient.get(`/payments/${paymentId}/receipt`, {
      headers: authHeaders(),
      responseType: 'blob',
    });
    const url = window.URL.createObjectURL(response.data as Blob);
    const win = window.open(url, '_blank', 'noopener');
    if (!win) {
      const link = document.createElement('a');
      link.href = url;
      link.target = '_blank';
      link.rel = 'noreferrer';
      document.body.appendChild(link);
      link.click();
      link.remove();
    }
    window.setTimeout(() => window.URL.revokeObjectURL(url), 60_000);
  },
};
