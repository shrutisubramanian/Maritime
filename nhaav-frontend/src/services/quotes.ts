import { apiClient } from './apiClient';

export const quotesService = {
  createQuote: async (requestId: string, data: any) => {
    const response = await apiClient.post(`/quotes/?request_id=${requestId}`, data);
    return response.data;
  },
  getQuotesForRequest: async (requestId: string) => {
    const response = await apiClient.get(`/quotes/request/${requestId}`);
    return response.data; 
  },
  acceptQuote: async (quoteId: string) => {
    const response = await apiClient.put(`/quotes/${quoteId}/accept`);
    return response.data;
  },
  rejectQuote: async (quoteId: string) => {
    const response = await apiClient.put(`/quotes/${quoteId}/reject`);
    return response.data;
  },
  getMyQuotations: async () => {
    const response = await apiClient.get('/quotes/my-quotations');
    return response.data;
  },
  getQuoteById: async (quoteId: string) => {
    const response = await apiClient.get(`/quotes/${quoteId}`);
    return response.data;
  },
  getClientQuotesForRequest: async (requestId: string) => {
    const response = await apiClient.get(`/client/requests/${requestId}/quotations`);
    return response.data;
  },
  /**
   * The provider confirms it can take a job the client awarded it. This is the
   * second half of the agreement: the client is notified and the provider's
   * name and phone number become visible to them.
   */
  acceptJobAsProvider: async (quoteId: string) => {
    const response = await apiClient.patch(`/quotes/${quoteId}/provider-accept`);
    return response.data;
  },
};
