import { apiClient } from './apiClient';

/**
 * Paid placement client for vendors — how long their listing is SHOWN.
 *
 * Vendors have no usage passes and no session time limit; their money buys
 * marketplace showcase time, and there are two approved choices:
 *
 *   ₹1,000  -> 1 month   (30 days)
 *   ₹10,000 -> 1 year    (365 days)
 *
 * There is no card/UPI gateway: the vendor transfers the chosen amount by bank
 * and submits the UTR + receipt here, and an admin's VERIFIED decision is the
 * only thing that publishes the listing (and confirms the period). Bank details
 * are NEVER hardcoded here — they come from GET /listing-fees/instructions.
 *
 * Money is INTEGER PAISE and always set server-side; the amounts and periods
 * below are the server's price list echoed back, not values the client chooses
 * beyond picking which of the two plans it paid for.
 */
export interface ListingFeePlan {
  code: 'month' | 'year';
  /** "1 month" / "1 year" — the server's own label. */
  label: string;
  /** 100000 = ₹1,000 */
  amount_paise: number;
  /** 30 / 365 */
  period_days: number;
}

export interface ListingFeeInstructions {
  configured: boolean;
  account_holder: string | null;
  bank_name: string | null;
  account_number: string | null;
  ifsc: string | null;
  branch: string | null;
  account_type: string | null;
  instructions: string | null;
  currency: string;
  /** The default (cheapest) plan's amount: 100000 = ₹1,000 */
  amount_paise: number;
  /** The default plan's period: 30 */
  period_days: number;
  /** The two showcase choices, cheapest first. */
  plans: ListingFeePlan[];
}

export type ListingFeeStatus =
  | 'PENDING'
  | 'SUBMITTED'
  | 'VERIFIED'
  | 'REJECTED'
  | 'CANCELLED';

export interface ListingFee {
  id: string;
  owner_user_id: string | null;
  listing_type: 'service' | 'supply';
  listing_id: string;
  listing_name: string;
  amount_paise: number;
  currency: string;
  period_days: number;
  /** Which showcase plan this payment bought (`month` / `year`). */
  plan_code?: 'month' | 'year' | null;
  utr: string;
  payment_date: string;
  status: ListingFeeStatus;
  submitted_at: string | null;
  decided_at: string | null;
  rejection_reason: string | null;
  notes: string | null;
  receipt_filename: string;
  receipt_available: boolean;
  receipt_url: string;
  /** The showcase window this fee bought — set only when VERIFIED. */
  starts_at: string | null;
  expires_at: string | null;
  created_at: string;
}

/**
 * One listing's placement state as the owner sees it: `is_live` is the answer
 * to "would a buyer see this card right now?", `awaiting_verification` means a
 * payment is already in the admin queue (so no second payment is possible).
 */
export interface ListingFeeStatusResponse {
  listing_type: 'service' | 'supply';
  listing_id: string;
  status: 'draft' | 'pending_review' | 'approved' | 'rejected' | 'archived';
  is_live: boolean;
  published_at: string | null;
  expires_at: string | null;
  amount_paise: number;
  period_days: number;
  latest_fee: ListingFee | null;
  awaiting_verification: boolean;
}

export interface ListingFeeSubmitPayload {
  listing_type: 'service' | 'supply';
  listing_id: string;
  /** The showcase plan this transfer is paying for. */
  plan: 'month' | 'year';
  utr: string;
  payment_date: string;
  receipt: File;
  notes?: string;
}

export const listingFeesService = {
  getInstructions: async (): Promise<ListingFeeInstructions> => {
    const response = await apiClient.get('/listing-fees/instructions');
    return response.data;
  },

  /** Placement state for one of my listings. */
  getStatus: async (
    listing_type: 'service' | 'supply',
    listing_id: string,
  ): Promise<ListingFeeStatusResponse> => {
    const response = await apiClient.get('/listing-fees/status', {
      params: { listing_type, listing_id },
    });
    return response.data;
  },

  /** Every fee submission I made, newest first. */
  listMine: async (): Promise<ListingFee[]> => {
    const response = await apiClient.get('/listing-fees/mine');
    return response.data?.data ?? [];
  },

  /** Multipart: UTR + date + receipt file, exactly like subscription payments. */
  submit: async (payload: ListingFeeSubmitPayload): Promise<ListingFee> => {
    const form = new FormData();
    form.append('listing_type', payload.listing_type);
    form.append('listing_id', payload.listing_id);
    form.append('plan', payload.plan);
    form.append('utr', payload.utr);
    form.append('payment_date', payload.payment_date);
    form.append('receipt', payload.receipt);
    if (payload.notes) form.append('notes', payload.notes);

    const response = await apiClient.post('/listing-fees/submit', form);
    return response.data;
  },

  /** Private receipt; fetched as a blob so the URL is never guessable. */
  openReceipt: async (feeId: string): Promise<void> => {
    const response = await apiClient.get(`/listing-fees/${feeId}/receipt`, {
      responseType: 'blob',
    });
    const url = window.URL.createObjectURL(response.data as Blob);
    window.open(url, '_blank', 'noopener');
    window.setTimeout(() => window.URL.revokeObjectURL(url), 60_000);
  },
};
