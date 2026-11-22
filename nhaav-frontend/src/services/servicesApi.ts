import { apiClient } from './apiClient';

/**
 * DB-backed Service listing client.
 *
 * Replaces the old localStorage "coverage listings" mock
 * (services/coverageListings.ts). All reads/writes now hit the real
 * `/services` API; free-text marketplace discovery goes through
 * `/marketplace/*` (see services/marketplace.ts).
 */

export type ServiceListingStatus =
  | 'draft'
  | 'pending_review'
  | 'approved'
  | 'rejected'
  | 'archived';

export interface ServiceListing {
  id: string;
  provider_id: string;
  name: string;
  category: string;
  subcategory?: string | null;
  description?: string | null;
  pricing_model?: string | null;
  /** Listed price in INTEGER PAISE. Null = the provider published no figure. */
  price_paise?: number | null;
  price_note?: string | null;
  service_id?: string | null;
  port_id?: string | null;
  is_active: boolean;
  status: ServiceListingStatus;
  certifications_required?: string[] | null;
  images?: string[] | null;
  /** Paid placement window: ₹1,000 buys 1 month, ₹10,000 buys 1 year. */
  published_at?: string | null;
  expires_at?: string | null;
  /** True iff approved AND inside its paid window — what a buyer sees. */
  is_live?: boolean;
  created_at: string;
  updated_at: string;
}

export interface ServiceListingInput {
  name: string;
  category: string;
  subcategory?: string;
  description?: string;
  pricing_model?: string;
  /** Listed price in INTEGER PAISE; null clears it and the card says "Price on request". */
  price_paise?: number | null;
  price_note?: string | null;
  service_id?: string;
  port_id?: string;
  certifications_required?: string[];
  images?: string[];
  submit_now?: boolean;
}

export interface ProviderDashboardCounts {
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

export interface ServiceSearchFilters {
  category?: string;
  subcategory?: string;
  provider_id?: string;
  port?: string;
  service_id?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export const servicesApi = {
  /** Public Service Marketplace browse (approved listings only). */
  listServices: async (filters: ServiceSearchFilters = {}) => {
    const response = await apiClient.get('/services/', { params: filters });
    return response.data as { data: ServiceListing[]; total: number; page: number; pages: number };
  },

  /** Public listing detail. */
  getService: async (id: string): Promise<ServiceListing> => {
    const response = await apiClient.get(`/services/${id}`);
    return response.data;
  },

  /** The signed-in provider's own listings. */
  getMyServices: async (status?: ServiceListingStatus): Promise<ServiceListing[]> => {
    const response = await apiClient.get('/services/mine', { params: status ? { status } : {} });
    return response.data;
  },

  /** Real provider dashboard counts. */
  getDashboard: async (): Promise<ProviderDashboardCounts> => {
    const response = await apiClient.get('/services/dashboard');
    return response.data;
  },

  createService: async (data: ServiceListingInput): Promise<ServiceListing> => {
    const response = await apiClient.post('/services/', data);
    return response.data;
  },

  updateService: async (id: string, data: Partial<ServiceListingInput>): Promise<ServiceListing> => {
    const response = await apiClient.patch(`/services/${id}`, data);
    return response.data;
  },

  submitService: async (id: string): Promise<ServiceListing> => {
    const response = await apiClient.post(`/services/${id}/submit`);
    return response.data;
  },

  archiveService: async (id: string): Promise<ServiceListing> => {
    const response = await apiClient.post(`/services/${id}/archive`);
    return response.data;
  },

  deleteService: async (id: string): Promise<void> => {
    await apiClient.delete(`/services/${id}`);
  },
};
