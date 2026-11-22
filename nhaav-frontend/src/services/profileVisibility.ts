import { apiClient } from './apiClient';
import { adminClient } from './adminAuth';

/**
 * Paid COMPANY-PROFILE visibility — a separate commercial entitlement from the
 * legacy listing-fee placements.
 *
 * The whole company profile is the unit of paid visibility, never an individual
 * service or supply listing:
 *
 *   ₹1,000  + GST -> 1 month   (30 days)
 *   ₹10,000 + GST -> 12 months (365 days)
 *
 * Prices and durations come from the API (`/profile-visibility/plans`); nothing
 * here hardcodes an amount. Money moves by bank transfer and only an admin's
 * verification grants visibility, exactly like subscription payments.
 *
 * Visibility is also separate from account verification: a profile can be
 * approved with no paid plan, and it then stays out of marketplace discovery
 * until a payment is verified.
 */
export interface VisibilityPlan {
  code: 'monthly' | 'annual';
  label: string;
  period_days: number;
  base_amount_paise: number;
  gst_rate_percent: number;
  gst_amount_paise: number;
  total_amount_paise: number;
  currency: string;
}

export interface VisibilityInstructions {
  configured: boolean;
  account_holder: string | null;
  bank_name: string | null;
  account_number: string | null;
  ifsc: string | null;
  branch: string | null;
  account_type: string | null;
  instructions: string | null;
  currency: string;
  plans: VisibilityPlan[];
}

export type VisibilityStatus =
  | 'PENDING'
  | 'SUBMITTED'
  | 'VERIFIED'
  | 'REJECTED'
  | 'CANCELLED';

export interface VisibilityPayment {
  id: string;
  profile_id: string;
  owner_user_id: string | null;
  plan: 'monthly' | 'annual';
  period_days: number;
  base_amount_paise: number;
  gst_rate_percent: number;
  gst_amount_paise: number;
  total_amount_paise: number;
  currency: string;
  utr: string;
  payment_date: string;
  status: VisibilityStatus;
  submitted_at: string | null;
  decided_at: string | null;
  rejection_reason: string | null;
  starts_at: string | null;
  expires_at: string | null;
  notes: string | null;
  receipt_filename: string | null;
  receipt_available: boolean;
  receipt_url: string | null;
  created_at: string;
}

/** What the reviewer additionally sees about the company behind the payment. */
export interface AdminVisibilityPayment extends VisibilityPayment {
  owner_email: string | null;
  owner_company: string | null;
  profile_approved: boolean;
  /** The window the company currently has, if any (may be a legacy placement). */
  current_visibility_expires_at: string | null;
}

export interface MyVisibility {
  profile_id: string;
  profile_approved: boolean;
  is_visible: boolean;
  source: 'profile_plan' | 'legacy_listing' | null;
  plan: string | null;
  starts_at: string | null;
  expires_at: string | null;
  latest_payment: VisibilityPayment | null;
  payments: VisibilityPayment[];
}

export interface VisibilitySubmitPayload {
  plan: 'monthly' | 'annual';
  utr: string;
  /** ISO date or date-time of the transfer. */
  payment_date: string;
  receipt: File;
  notes?: string;
}

const blobUrl = (data: Blob): void => {
  const url = window.URL.createObjectURL(data);
  window.open(url, '_blank', 'noopener');
  window.setTimeout(() => window.URL.revokeObjectURL(url), 60_000);
};

export const profileVisibilityService = {
  /** The two plans with GST broken out, plus the bank details to pay into. */
  getPlans: async (): Promise<{
    plans: VisibilityPlan[];
    instructions: VisibilityInstructions;
  }> => {
    const response = await apiClient.get('/profile-visibility/plans');
    return response.data;
  },

  /** This company's visibility state, current payment and full history. */
  mine: async (): Promise<MyVisibility> => {
    const response = await apiClient.get('/profile-visibility/mine');
    return response.data;
  },

  /** Multipart submission; nothing is activated until an admin verifies it. */
  submit: async (payload: VisibilitySubmitPayload): Promise<VisibilityPayment> => {
    const form = new FormData();
    form.append('plan', payload.plan);
    form.append('utr', payload.utr);
    form.append('payment_date', payload.payment_date);
    form.append('receipt', payload.receipt);
    if (payload.notes) form.append('notes', payload.notes);

    const response = await apiClient.post('/profile-visibility/submit', form);
    return response.data;
  },

  /** Receipts are private: fetched as a blob, never a public URL. */
  openReceipt: async (paymentId: string): Promise<void> => {
    const response = await apiClient.get(`/profile-visibility/${paymentId}/receipt`, {
      responseType: 'blob',
    });
    blobUrl(response.data as Blob);
  },
};

export const adminProfileVisibilityService = {
  /**
   * Review queue. With no status the API returns the submissions still awaiting
   * a decision (PENDING + SUBMITTED); pass VERIFIED or REJECTED for history.
   */
  list: async (
    status?: 'VERIFIED' | 'REJECTED',
  ): Promise<{ data: AdminVisibilityPayment[]; total: number }> => {
    const response = await adminClient.get('/admin/profile-visibility', {
      params: status ? { status } : {},
    });
    return response.data;
  },

  /** Verify the transfer — the ONLY path that grants paid visibility. */
  verify: async (paymentId: string): Promise<AdminVisibilityPayment> => {
    const response = await adminClient.post(
      `/admin/profile-visibility/${paymentId}/verify`,
      {},
    );
    return response.data;
  },

  reject: async (paymentId: string, reason: string): Promise<AdminVisibilityPayment> => {
    const response = await adminClient.post(
      `/admin/profile-visibility/${paymentId}/reject`,
      { reason },
    );
    return response.data;
  },

  openReceipt: async (paymentId: string): Promise<void> => {
    const response = await adminClient.get(`/profile-visibility/${paymentId}/receipt`, {
      responseType: 'blob',
    });
    blobUrl(response.data as Blob);
  },
};
