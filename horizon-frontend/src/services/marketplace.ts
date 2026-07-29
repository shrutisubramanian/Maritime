import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

export const marketplaceService = {
  getServices: async (filters: any) => {
    const response = await axios.get(`${API_URL}/marketplace/services`, { params: filters });
    return response.data;
  },
  getServiceById: async (id: string) => {
    const response = await axios.get(`${API_URL}/marketplace/services/${id}`);
    return response.data;
  },
  getCategories: async () => {
    const response = await axios.get(`${API_URL}/marketplace/categories`);
    return response.data;
  }
};