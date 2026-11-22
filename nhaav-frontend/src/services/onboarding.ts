import { apiClient } from './apiClient';

export type OnboardingNextStep =
  | 'verify_email'
  | 'complete_profile'
  | 'awaiting_review'
  | 'pay_subscription'
  | 'done';

export interface OnboardingStatus {
  email_verified: boolean;
  verification_status: string;
  verification_approved: boolean;
  documents_count: number;
  /**
   * True once the profile carries a company name, a company description and one
   * contact with a name and a phone number — the fields the setup box asks for.
   */
  profile_completed: boolean;
  /** API field names still missing from the profile (empty when complete). */
  profile_missing: string[];
  /**
   * Billing state. For a CLIENT this is also an ACCESS gate: the platform fee
   * must be paid (and verified by an admin) before the marketplace opens.
   * Providers and suppliers are not payment-gated.
   */
  subscription_active: boolean;
  /** True when this account must pay the platform fee (every non-admin role). */
  payment_required: boolean;
  /** A bank transfer is submitted and waiting for an admin to verify it. */
  payment_submitted: boolean;
  /**
   * True once the email is verified AND an admin approved the verification AND
   * the platform fee is active.
   */
  marketplace_unlocked: boolean;
  next_step: OnboardingNextStep;
  is_admin: boolean;
  /** Route a locked account is confined to. */
  locked_home: string;
}

/**
 * Onboarding / marketplace-access state for the signed-in account.
 *
 * Backed by GET /access/onboarding, which is identity-only on the server (no
 * access-entitlement gate), so it answers even while the account is locked —
 * the exact case the frontend guard must detect.
 */
export const onboardingService = {
  getStatus: async (): Promise<OnboardingStatus> => {
    const response = await apiClient.get('/access/onboarding');
    return response.data as OnboardingStatus;
  },
};
