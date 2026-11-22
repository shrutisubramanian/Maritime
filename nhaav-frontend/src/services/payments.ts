import { apiClient } from './apiClient';

/**
 * Organization-side payment client (offline bank transfer).
 *
 * No payment gateway is involved: the organization transfers money externally
 * and submits the transfer details + receipt here for Nhaav to verify.
 *
 * Bank details are NEVER hardcoded in the frontend — they come from
 * GET /payments/instructions, which reads backend configuration. If the account
 * is not configured the UI must not present it as payable.
 */
export interface PaymentInstructions {
  configured: boolean;
  account_holder: string | null;
  bank_name: string | null;
  account_number: string | null;
  ifsc: string | null;
  branch: string | null;
  account_type: string | null;
  instructions: string | null;
  currency: string;
}

export interface PaymentRecord {
  id: string;
  /** The ACCOUNT that purchased. `organization_*` is company metadata only. */
  owner_user_id: string | null;
  organization_id: string | null;
  organization_name: string | null;
  plan_code: string;
  plan_name: string;
  /** What was actually charged: the plan price PLUS GST (₹1,000 -> ₹1,180). */
  amount_paise: number;
  /** The split behind it. The server derives these from the payment's stored
   *  total and the plan it was made against, so a later GST-rate change can
   *  never rewrite what was actually paid. */
  base_paise: number;
  gst_paise: number;
  gst_rate_percent: number;
  currency: string;
  pass_count: number;
  /** How long the purchased passes may be used (6 / 12 calendar months). */
  pass_validity_days: number;
  utr: string;
  payment_date: string;
  status: string;                 // SUBMITTED | VERIFIED | REJECTED | PENDING | CANCELLED
  submitted_at: string | null;
  verified_at: string | null;
  rejection_reason: string | null;
  notes: string | null;
  receipt_filename: string;
  receipt_available: boolean;
  receipt_url: string;
  subscription_status: string | null;
  created_at: string;
}

export interface PaymentSubmitPayload {
  plan_code: string;
  utr: string;
  payment_date: string;           // ISO date or date-time
  receipt: File;
  notes?: string;
}

export interface PaymentSubmitResult {
  id: string;
  status: string;
  plan_code: string;
  /** Total payable, GST included. */
  amount_paise: number;
  base_paise: number;
  gst_paise: number;
  gst_rate_percent: number;
  currency: string;
  pass_count: number;
  pass_validity_days: number;
  utr: string;
  payment_date: string;
  submitted_at: string | null;
  message: string;
}

export const TERMINAL_PAYMENT_STATUSES = ['VERIFIED', 'REJECTED', 'CANCELLED'];

export const paymentsService = {
  getInstructions: async (): Promise<PaymentInstructions> => {
    const response = await apiClient.get('/payments/instructions');
    return response.data;
  },

  listMine: async (): Promise<PaymentRecord[]> => {
    const response = await apiClient.get('/payments/my');
    return response.data?.data ?? [];
  },

  submit: async (payload: PaymentSubmitPayload): Promise<PaymentSubmitResult> => {
    const form = new FormData();
    form.append('plan_code', payload.plan_code);
    form.append('utr', payload.utr);
    form.append('payment_date', payload.payment_date);
    form.append('receipt', payload.receipt);
    if (payload.notes) form.append('notes', payload.notes);

    const response = await apiClient.post('/payments/submit', form);
    return response.data;
  },

  /**
   * Receipts are private, so they are fetched with the caller's token and opened
   * as a blob rather than linked directly (a bare URL would need the token in
   * the query string, which leaks it into history and logs).
   */
  openReceipt: async (paymentId: string): Promise<void> => {
    const response = await apiClient.get(`/payments/${paymentId}/receipt`, {
      responseType: 'blob',
    });
    const url = window.URL.createObjectURL(response.data as Blob);
    window.open(url, '_blank', 'noopener');
    window.setTimeout(() => window.URL.revokeObjectURL(url), 60_000);
  },
};
