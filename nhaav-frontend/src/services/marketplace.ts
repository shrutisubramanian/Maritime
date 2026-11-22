import { apiClient } from './apiClient';

/* ── Types ──────────────────────────────────────────────────── */

export interface CategoryGroupService {
  name: string;
  description: string;
  verified_provider_count: number;
  ports_covered: number;
  ports: string[];
}

export interface CategoryGroup {
  group_name: string;
  services: CategoryGroupService[];
  total_services: number;
  total_verified_providers: number;
}

export interface MarketplaceService {
  service_name: string;
  description: string;
  category: string;        // category_group name
  subcategory?: string;    // individual category name
  /** Listed price in integer paise. NULL means "Price on request" — the UI
   *  must never invent a figure, so it shows a neutral label instead. */
  price_paise: number | null;
  price_note: string | null;
  /** The company behind THIS card: one card is one company's offering. */
  company_name: string;
  badge_label: string | null;
  rating_avg: number;
  jobs_completed: number;
  /** Profile id (opens /provider/:id) and user id (used by review lookups). */
  profile_id: string | null;
  provider_id: string;
  verified_provider_count: number;   // always 1 per card; kept for old callers
  ports_covered: number;
  ports: { port_name: string; provider_count: number }[];
  preview_ports: string[];
}

export interface ServiceDetail {
  service_name: string;
  description: string;
  category: string;
  subcategory?: string;
  verified_provider_count: number;
  ports_covered: number;
  port_coverage: { port_name: string; provider_count: number }[];
  exists: boolean;
}

export interface PortAvailability {
  service_name: string;
  port: string;
  provider_count: number;
  providers: {
    id: string;
    company_name: string;
    rating_avg: number;
    jobs_completed: number;
    years_experience: number;
    badge_label?: string;
  }[];
  available: boolean;
}

/* ── API ─────────────────────────────────────────────────────── */

/**
 * Human-readable text for a failed search/detail request. HTTP 429 (server-side
 * rate limit) gets a clear, honest message; anything else stays generic. The
 * server's JSON detail message is authoritative when present.
 */
export const searchErrorMessage = (error: unknown): string => {
  const status = (error as { response?: { status?: number } })?.response?.status;
  if (status === 429) return 'Search limit reached. Please try again later.';
  return '';
};

export const marketplaceService = {
  /** Category groups with their services (sidebar) */
  getCategoryGroups: async () => {
    const response = await apiClient.get('/marketplace/category-groups');
    return response.data as { data: CategoryGroup[] };
  },

  /** Service cards for the grid (optionally filtered by category_group) */
  getServices: async (filters?: { category_group?: string; port?: string; search?: string; page?: number; limit?: number }) => {
    const response = await apiClient.get('/marketplace/services', { params: filters });
    return response.data as { data: MarketplaceService[]; total: number; page: number; pages: number };
  },

  /** Service detail with per-port provider coverage */
  getServiceDetail: async (serviceName: string) => {
    const response = await apiClient.get(`/marketplace/services/aggregate/${encodeURIComponent(serviceName)}`);
    return response.data as ServiceDetail;
  },

  /** Port-specific availability for a service */
  getPortAvailability: async (serviceName: string, port: string) => {
    const response = await apiClient.get(
      `/marketplace/services/aggregate/${encodeURIComponent(serviceName)}/availability`,
      { params: { port } }
    );
    return response.data as PortAvailability;
  },

  /** All categories grouped by category_group (legacy) */
  getCategories: async () => {
    const response = await apiClient.get('/marketplace/categories');
    return response.data;
  },
};