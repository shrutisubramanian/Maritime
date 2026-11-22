import { apiClient } from './apiClient';

export type SupplyListingStatus =
  | 'draft'
  | 'pending_review'
  | 'approved'
  | 'rejected'
  | 'archived';

export interface SupplyListing {
  id: string;
  supplier_id: string;
  name: string;
  category: string;
  subcategory?: string | null;
  description?: string | null;
  manufacturer?: string | null;
  model_number?: string | null;
  part_number?: string | null;
  condition?: string | null;
  country_of_origin?: string | null;
  specifications?: Record<string, string> | null;
  availability?: string | null;
  lead_time?: string | null;
  minimum_order_quantity?: number | null;
  /** Listed price in INTEGER PAISE. null => the UI shows "Price on request". */
  price_paise?: number | null;
  /** Unit for the listed price, e.g. "per drum". */
  price_note?: string | null;
  /** The seller's company name, resolved from their profile by the API. */
  supplier_company_name?: string | null;
  ports?: string[] | null;
  images?: string[] | null;
  datasheets?: string[] | null;
  status: SupplyListingStatus;
  /** Paid placement window: ₹1,000 buys 1 month, ₹10,000 buys 1 year. */
  published_at?: string | null;
  expires_at?: string | null;
  /** True iff approved AND inside its paid window — what a buyer sees. */
  is_live?: boolean;
  created_at: string;
  updated_at: string;
}

export interface SupplyListingInput {
  name: string;
  category: string;
  subcategory?: string;
  description?: string;
  manufacturer?: string;
  model_number?: string;
  part_number?: string;
  condition?: string;
  country_of_origin?: string;
  specifications?: Record<string, string>;
  availability?: string;
  lead_time?: string;
  minimum_order_quantity?: number;
  price_paise?: number | null;
  price_note?: string | null;
  ports?: string[];
  images?: string[];
  datasheets?: string[];
  submit_now?: boolean;
}

export interface SupplierDashboardCounts {
  active_listings: number;
  pending_listings: number;
  draft_listings: number;
  rejected_listings: number;
  archived_listings: number;
  /** Demo-only simulated profile visits; never verified customer analytics. */
  profile_views: number;
  profile_views_is_demo: boolean;
  profile_views_interval_days: number;
}

export interface SupplySearchFilters {
  category?: string;
  subcategory?: string;
  supplier_id?: string;
  port?: string;
  availability?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export const suppliesService = {
  /** Public Supplies Marketplace browse (approved listings only). */
  listSupplies: async (filters: SupplySearchFilters = {}) => {
    const response = await apiClient.get('/supplies/', { params: filters });
    return response.data as { data: SupplyListing[]; total: number; page: number; pages: number };
  },

  /** Public listing detail (owners/admins may also fetch non-approved). */
  getSupply: async (id: string): Promise<SupplyListing> => {
    const response = await apiClient.get(`/supplies/${id}`);
    return response.data;
  },

  /** Supplier's own catalogue. */
  getMyListings: async (status?: SupplyListingStatus): Promise<SupplyListing[]> => {
    const response = await apiClient.get('/supplies/mine', { params: status ? { status } : {} });
    return response.data;
  },

  /** Real dashboard counts. */
  getDashboard: async (): Promise<SupplierDashboardCounts> => {
    const response = await apiClient.get('/supplies/dashboard');
    return response.data;
  },

  createListing: async (data: SupplyListingInput): Promise<SupplyListing> => {
    const response = await apiClient.post('/supplies/', data);
    return response.data;
  },

  updateListing: async (id: string, data: Partial<SupplyListingInput>): Promise<SupplyListing> => {
    const response = await apiClient.patch(`/supplies/${id}`, data);
    return response.data;
  },

  submitListing: async (id: string): Promise<SupplyListing> => {
    const response = await apiClient.post(`/supplies/${id}/submit`);
    return response.data;
  },

  archiveListing: async (id: string): Promise<SupplyListing> => {
    const response = await apiClient.post(`/supplies/${id}/archive`);
    return response.data;
  },

  deleteListing: async (id: string): Promise<void> => {
    await apiClient.delete(`/supplies/${id}`);
  },
};
