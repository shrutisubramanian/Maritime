import { apiClient } from './apiClient';

/** Support-ticket intake for the in-app support popup. */
export interface SupportTicketPayload {
  name?: string;
  email?: string;
  subject?: string;
  message: string;
  category?: SupportTicketCategory;
}

export type SupportTicketCategory =
  | 'account'
  | 'verification'
  | 'procurement'
  | 'quotation'
  | 'technical'
  | 'payment'
  | 'general';

export interface SupportTicketResult {
  ticket_number: string;
  message: string;
}

/** Public website contact form (Services page). */
export interface ContactEnquiryPayload {
  name: string;
  email: string;
  company?: string;
  phone?: string;
  inquiry_type: 'buyer' | 'supplier' | 'other';
  subject?: string;
  message: string;
}

/** Public endpoint — works signed out as well as signed in. */
export const supportService = {
  raiseTicket: async (payload: SupportTicketPayload): Promise<SupportTicketResult> => {
    const response = await apiClient.post<SupportTicketResult>('/support/tickets', payload);
    return response.data;
  },

  /** Emails the services inbox (services@nhaav.com); works signed out. */
  sendContactEnquiry: async (
    payload: ContactEnquiryPayload
  ): Promise<SupportTicketResult> => {
    const response = await apiClient.post<SupportTicketResult>('/support/contact', payload);
    return response.data;
  },
};
