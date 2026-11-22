import { apiClient } from './apiClient';

export const jobsService = {
  getUserJobs: async () => {
    const response = await apiClient.get('/jobs/');
    return response.data;
  },
  getJobById: async (jobId: string) => {
    const response = await apiClient.get(`/jobs/${jobId}`);
    return response.data;
  },
  completeJob: async (jobId: string) => {
    const response = await apiClient.put(`/jobs/${jobId}/complete`);
    return response.data;
  },
  cancelJob: async (jobId: string) => {
    const response = await apiClient.put(`/jobs/${jobId}/cancel`);
    return response.data;
  }
};
