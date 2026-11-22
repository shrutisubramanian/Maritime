import { adminClient } from './adminAuth';

/**
 * Read-only admin directory over every profile.
 *
 * The admin console can READ any profile a client or vendor created. It cannot
 * write to one from here: approval stays in the verification workflow, and this
 * service exposes no create/update/delete call on purpose.
 */

export type ProfileRoleFilter = 'all' | 'client' | 'vendor' | 'provider' | 'supplier';

export interface AdminProfileListItem {
  profile_id: string;
  user_id: string;
  role: 'client' | 'provider' | 'supplier';
  company_name: string;
  full_name: string;
  email: string;
  phone: string;
  country: string | null;
  head_office: string | null;
  primary_category: string | null;
  subcategories: string[];
  verification_status: 'pending' | 'verified' | 'rejected';
  availability_status: string | null;
  is_visible: boolean | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface AdminProfileDetail extends AdminProfileListItem {
  position: string | null;
  bio: string | null;
  years_experience: number;
  contacts: Array<{ name?: string; email?: string; phone?: string }>;
  team: Array<{ name?: string; role?: string }>;
  offices: string[];
  licenses: string[];
  social_links: Record<string, string>;
  profile_metadata: Record<string, unknown>;
  ports_served: string[];
  service_areas: string[];
  location: { lat: number; lng: number } | null;
  badge_label: string | null;
  rating_avg: number;
  jobs_completed: number;
  brochure_filename: string | null;
  brochure_size_bytes: number | null;
  visibility: {
    is_visible: boolean;
    source: string | null;
    plan: string | null;
    starts_at: string | null;
    expires_at: string | null;
  };
  services_count: number;
  supply_listings_count: number;
  read_only: true;
}

export interface AdminProfileListResponse {
  data: AdminProfileListItem[];
  total: number;
  page: number;
  pages: number;
  counts: { all: number; client: number; vendor: number };
}

export const adminProfilesService = {
  list: async (params: {
    role?: ProfileRoleFilter;
    verification_status?: string;
    q?: string;
    page?: number;
    limit?: number;
  }): Promise<AdminProfileListResponse> => {
    const response = await adminClient.get('/admin/profiles', { params });
    return response.data;
  },

  get: async (profileId: string): Promise<AdminProfileDetail> => {
    const response = await adminClient.get(`/admin/profiles/${profileId}`);
    return response.data;
  },
};
