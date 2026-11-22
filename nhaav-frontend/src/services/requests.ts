import { apiClient } from './apiClient';

export interface CreateRequestData {
  title: string;
  description: string;
  port: string;
  service_type: string;
  urgency: 'low' | 'medium' | 'high' | 'urgent';
  vessel_name?: string;
  imo_number?: string;
  request_type?: string;
  quantity?: number;
}

export const requestsService = {
  createRequest: async (data: CreateRequestData) => {
    const response = await apiClient.post('/requests/', data);
    return response.data;
  },
  getUserRequests: async (filters: any = {}) => {
    const response = await apiClient.get('/requests/', { params: filters });
    return response.data;
  },
  getRequestById: async (id: string) => {
    const response = await apiClient.get(`/requests/${id}`);
    return response.data;
  },
  updateRequestStatus: async (id: string, updateData: any) => {
    const response = await apiClient.put(`/requests/${id}`, updateData);
    return response.data;
  },
  getClientRequests: async (params: any = {}) => {
    const response = await apiClient.get('/client/requests', { params });
    return response.data;
  }
};