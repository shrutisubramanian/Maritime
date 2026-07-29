import { apiClient } from './apiClient';

export interface ProfileUpdateData {
  position?: string;
  company_name?: string;
  bio?: string;
  years_experience?: number;
  skills?: string[];
  ports_served?: string[];
  contacts?: any[];
  licenses?: string[];
  team?: any[];
  offices?: string[];
  social_links?: Record<string, string>;
  profile_metadata?: Record<string, any>;
}

export const profilesService = {
  getMyProfile: async () => {
    const response = await apiClient.get('/profiles/me');
    return response.data;
  },
  updateMyProfile: async (data: ProfileUpdateData) => {
    const response = await apiClient.put('/profiles/me', data);
    return response.data;
  }
};
