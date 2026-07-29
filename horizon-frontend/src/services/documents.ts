import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

export const documentsService = {
  uploadDocument: async (file: any, metadata: any) => {
    const formData = new FormData();
    formData.append('file', file);
    if (metadata) {
      formData.append('metadata', JSON.stringify(metadata));
    }
    const response = await axios.post(`${API_URL}/documents`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    return response.data;
  },
  getDocuments: async (filters: any) => {
    const response = await axios.get(`${API_URL}/documents`, { params: filters });
    return response.data;
  },
  deleteDocument: async (id: any) => {
    const response = await axios.delete(`${API_URL}/documents/${id}`);
    return response.data;
  },
  getAdminDocuments: async () => {
    // Uses the debug endpoint that returns all documents
    const response = await axios.get(`${API_URL}/documents/debug`);
    return response.data;
  }
};