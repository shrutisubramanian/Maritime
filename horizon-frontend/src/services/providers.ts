import { apiClient } from './apiClient';

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
  getProviderById: async (id: string) => {
    const response = await apiClient.get(`/profiles/${id}`);
    return response.data;
  },
  // Reviews aren't strictly part of the flow yet but we can leave the route structure
  getProviderReviews: async (id: string) => {
    const response = await apiClient.get(`/reviews/provider/${id}`);
    return response.data;
  }
};