import { apiClient } from './apiClient';

/**
 * A review left on a completed job (`GET /reviews/provider/{user_id}`).
 * `reviewed_user_id` is the provider/supplier's USER id.
 */
export interface Review {
  id: string;
  job_id: string;
  reviewer_id: string;
  reviewed_user_id: string;
  rating: number;            // 1..5
  comment: string | null;
  created_at: string;
}

export interface ProviderFilters {
  page?: number;
  limit?: number;
  position?: string;
  skill?: string;
  port?: string;
}

export const providersService = {
  getProviders: async (filters?: ProviderFilters) => {
    const response = await apiClient.get('/profiles/providers', { params: filters });
    return response.data;
  },
  /**
   * Provider profile by id. `/profiles/{id}` takes a PROFILE id but is now
   * owner/admin-only; quotations and orders carry the provider's USER id
   * (Quote.provider_id is users.id). Use the safe public endpoint first, then
   * the by-user public view on 404. Both expose company_name, which is all the
   * callers read.
   */
  getProviderById: async (id: string) => {
    try {
      const response = await apiClient.get(`/profiles/${id}/public`);
      return response.data;
    } catch (err) {
      if ((err as { response?: { status?: number } })?.response?.status !== 404) throw err;
      const response = await apiClient.get(`/profiles/by-user/${id}/public`);
      return response.data;
    }
  },
  /** Reviews people left for this account (its USER id), newest-ish order. */
  getProviderReviews: async (id: string): Promise<Review[]> => {
    const response = await apiClient.get(`/reviews/provider/${id}`);
    return response.data ?? [];
  }
};