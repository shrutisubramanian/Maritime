import { apiClient } from './apiClient';

/**
 * Company-first marketplace API.
 *
 * Browsing is: vendor type -> primary category -> companies. A company card
 * opens that company's business profile. Service/supply rows are supporting
 * content inside a profile, never the browse unit and never the thing paid for.
 */

export type VendorType = 'provider' | 'supplier';

export interface VendorSubcategory {
  id: string;
  name: string;
}

export interface VendorCategory {
  id: string;
  name: string;
  subcategories: VendorSubcategory[];
  /** Admin-maintained category (present on the admin view only). */
  is_active?: boolean;
  /** Discoverable companies in this category. */
  company_count: number;
}

export interface CompanyCard {
  profile_id: string;
  user_id: string;
  company_name: string;
  /** Company profile bio — the card description. */
  bio: string | null;
  vendor_type: VendorType;
  primary_category: string | null;
  categories: string[];
  subcategories: string[];
  country: string | null;
  head_office: string | null;
  service_areas: string[];
  ports: string[];
  verification_status: string;
  badge_label: string | null;
  rating_avg: number;
  jobs_completed: number;
  years_experience: number;
  live_capability_count: number;
  /** Lowest price among live listings (paise); null when all are quoted on request. */
  price_from_paise: number | null;
  visibility: {
    is_visible: boolean;
    source: string | null;
    expires_at: string | null;
  };
}

export interface CompanyCapability {
  id: string;
  name: string;
  category: string;
  subcategory: string | null;
  description: string | null;
  price_paise: number | null;
  price_note: string | null;
  kind: 'service' | 'supply';
}

export interface CompanyBrochure {
  filename: string;
  size_bytes: number | null;
  uploaded_at: string | null;
  download_url: string;
}

export interface CompanyBusinessProfile {
  profile_id: string;
  user_id: string;
  vendor_type: VendorType;
  company_name: string;
  phone: string | null;
  bio: string | null;
  primary_category: string | null;
  categories: string[];
  /** Other business categories the company also works in (never discovery). */
  additional_categories: string[];
  subcategories: string[];
  capabilities: CompanyCapability[];
  country: string | null;
  head_office: string | null;
  ports: string[];
  service_areas: string[];
  verification_status: string;
  badge_label: string | null;
  rating_avg: number;
  jobs_completed: number;
  years_experience: number;
  location: { lat: number; lng: number } | null;
  /** Registered business address, when the company published one. */
  address: string | null;
  /** Business registration number (CIN), when published. */
  registration_number: string | null;
  /** Published storefront links (Website, LinkedIn, Facebook, Instagram, …). */
  social_links: Record<string, string>;
  /** Vendor-supplied PDF (15 MB max). Metadata only; download goes through the API. */
  brochure: CompanyBrochure | null;
  visibility: { expires_at: string | null; source: string | null };
}

export interface CompanySearchFilters {
  vendor_type: VendorType;
  category?: string;
  subcategory?: string;
  country?: string;
  port?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export const companiesService = {
  /** Business categories (with capabilities) for one vendor type. */
  getVendorCategories: async (vendorType: VendorType) => {
    const response = await apiClient.get('/marketplace/vendor-categories', {
      params: { vendor_type: vendorType },
    });
    return response.data as { vendor_type: VendorType; data: VendorCategory[] };
  },

  /** Companies for a category/subcategory/filters — never generic category text. */
  listCompanies: async (filters: CompanySearchFilters) => {
    const response = await apiClient.get('/marketplace/companies', { params: filters });
    return response.data as {
      data: CompanyCard[];
      total: number;
      page: number;
      pages: number;
      vendor_type: VendorType;
    };
  },

  /** One company's full business profile. */
  getCompany: async (profileId: string) => {
    const response = await apiClient.get(`/marketplace/companies/${profileId}`);
    return response.data as CompanyBusinessProfile;
  },

  /**
   * Download the company brochure as a blob URL.
   *
   * Fetched with the session so the server can re-check that the company is
   * still discoverable; a saved link stops working once visibility expires.
   */
  downloadBrochure: async (profileId: string): Promise<string> => {
    const response = await apiClient.get(`/marketplace/companies/${profileId}/brochure`, {
      responseType: 'blob',
    });
    return URL.createObjectURL(response.data as Blob);
  },
};
