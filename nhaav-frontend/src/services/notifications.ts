import { apiClient } from './apiClient';

export interface Notification {
  id: string;
  title: string;
  message: string;
  type: string;
  priority?: string;
  related_entity?: string | null;
  related_entity_id?: string | null;
  is_read: boolean;
  created_at: string;
}

export const notificationsService = {
  getNotifications: async (): Promise<Notification[]> => {
    const response = await apiClient.get('/notifications/me');
    return response.data;
  },

  markAsRead: async (id: string): Promise<Notification> => {
    const response = await apiClient.put(`/notifications/${id}/read`);
    return response.data;
  },

  markAllAsRead: async (): Promise<void> => {
    await apiClient.put('/notifications/read-all');
  },

  deleteNotification: async (id: string): Promise<void> => {
    await apiClient.delete(`/notifications/${id}`);
  }
};
