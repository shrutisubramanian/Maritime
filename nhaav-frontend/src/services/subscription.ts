import { apiClient } from './apiClient';

/**
 * Account subscription / plan API.
 *
 * A subscription, its pack and every pass in it belong to the individual
 * ACCOUNT — never to a company pool. An account may hold SEVERAL packs at once
 * (a later purchase adds one; it never replaces or extends an earlier one), and
 * every pass has its own unused-validity window (`pass_validity_days`).
 *
 * Money arrives from the API as INTEGER PAISE (₹1,000 -> 100000) plus a
 * 3-letter currency. Formatting happens here; no floating-point arithmetic is
 * performed on money.
 */
export interface SubscriptionPlanInfo {
  code: string;                 // MONTHLY | ANNUAL
  name: string;
  price_paise: number;          // TAXABLE VALUE in paise (₹1,000 -> 100000)
  currency: string;
  duration_value: number;       // pack validity, e.g. 6 / 12
  duration_unit: string;        // DAY | MONTH | YEAR
  pass_count: number;
  /** GST is charged ON TOP of price_paise; total_paise is what is payable. */
  gst_rate_percent: number;
  gst_paise: number;
  total_paise: number;
  /** How long the purchased passes stay usable. */
  pass_validity_days: number;
}

export interface SubscriptionInfo {
  status: string;               // PENDING | ACTIVE | EXPIRED | CANCELLED
  starts_at: string | null;
  expires_at: string | null;
}

export interface PassBalanceInfo {
  total: number;
  used: number;
  remaining: number;
}

export interface ActivePassInfo {
  expires_at: string;
  remaining_seconds: number;
  held_by_me: boolean;
}

/** One pack the account owns. Separate purchases stay separate. */
export interface OwnedPackInfo {
  pack_id: string;
  status: string;
  source: string;
  plan_code: string | null;
  plan_name: string | null;
  subscription_status: string | null;
  starts_at: string | null;
  expires_at: string | null;
  total: number;
  used: number;
  remaining: number;
  /** Nominal validity this pack was sold with (6 or 12 months), when known. */
  pass_validity_days?: number | null;
  /** Earliest closing window among this pack's remaining passes. */
  next_pass_expiry: string | null;
}

export interface AccountSubscriptionInfo {
  id: string;
  status: string | null;
  plan_code: string | null;
  plan_name: string | null;
  starts_at: string | null;
  expires_at: string | null;
  total: number;
  remaining: number;
}

export interface SubscriptionStatus {
  access_control_enabled: boolean;
  /** The account (email) these passes belong to. */
  account: string | null;
  /** Company metadata only — not an entitlement owner. */
  organization: string | null;
  plan: SubscriptionPlanInfo | null;
  subscription: SubscriptionInfo | null;
  /** Every subscription/pack the account owns. */
  subscriptions: AccountSubscriptionInfo[];
  packs: OwnedPackInfo[];
  passes: PassBalanceInfo;
  active_pass: ActivePassInfo | null;
  /** Server-stated rules, so the client never hardcodes them. */
  pass_validity_days: number;
  session_hours: number;
}

/** Format integer paise as a display amount, e.g. 100000 -> "₹1,000". */
export const formatPaise = (paise: number, currency = 'INR'): string => {
  const symbol = currency === 'INR' ? '₹' : `${currency} `;
  const negative = paise < 0;
  const abs = Math.abs(Math.trunc(paise));
  const whole = Math.floor(abs / 100);
  const fraction = abs % 100;
  const grouped = whole.toLocaleString('en-IN');
  const body = fraction === 0
    ? grouped
    : `${grouped}.${String(fraction).padStart(2, '0')}`;
  return `${negative ? '-' : ''}${symbol}${body}`;
};

/** Human label for a plan's duration unit: DAY -> "day", MONTH -> "month". */
export const billingPeriodLabel = (durationUnit: string): string => {
  if (durationUnit === 'DAY') return 'day';
  if (durationUnit === 'YEAR') return 'year';
  if (durationUnit === 'MONTH') return 'month';
  return 'period';
};

/** e.g. "6 months" — how long a pack's passes stay usable. */
export const formatPlanValidity = (plan: SubscriptionPlanInfo): string => {
  const unit = billingPeriodLabel(plan.duration_unit);
  return `${plan.duration_value} ${unit}${plan.duration_value === 1 ? '' : 's'}`;
};

/** The listed (pre-tax) price, e.g. "₹1,000". */
export const formatPlanPrice = (plan: SubscriptionPlanInfo): string =>
  formatPaise(plan.price_paise, plan.currency);

/** The amount actually payable, GST included, e.g. "₹1,180". */
export const formatPlanTotal = (plan: SubscriptionPlanInfo): string =>
  formatPaise(plan.total_paise || plan.price_paise, plan.currency);

/** e.g. "₹1,000 + ₹180 GST (18%)". */
export const formatPlanTaxNote = (plan: SubscriptionPlanInfo): string =>
  `${formatPaise(plan.price_paise, plan.currency)} + ` +
  `${formatPaise(plan.gst_paise, plan.currency)} GST (${plan.gst_rate_percent}%)`;

export const subscriptionService = {
  getStatus: async (): Promise<SubscriptionStatus> => {
    const response = await apiClient.get('/subscription/status');
    return response.data;
  },
  getPlans: async (): Promise<SubscriptionPlanInfo[]> => {
    const response = await apiClient.get('/subscription/plans');
    return response.data?.plans ?? [];
  },
};
