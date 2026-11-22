import { apiClient } from './apiClient';



export const documentsService = {
  uploadDocument: async (file: any, metadata: any) => {
    const formData = new FormData();
    formData.append('file', file);
    
    // Extract document_type if metadata is an object, or use it directly if it's a string
    let docType = "unknown";
    if (typeof metadata === "string") {
      docType = metadata;
    } else if (metadata && metadata.document_type) {
      docType = metadata.document_type;
    }
    
    formData.append('document_type', docType);

    const response = await apiClient.post(`/documents/upload`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    return response.data;
  },
  getDocuments: async (filters?: any) => {
    const response = await apiClient.get(`/documents/me`, { params: filters });
    return response.data;
  },
  /**
   * Fetch one of the current user's stored documents as a blob using the
   * user JWT, and return an object URL for display/download. Documents are
   * never served from a public URL.
   */
  getDocumentFile: async (documentId: string): Promise<string> => {
    const response = await apiClient.get(`/documents/${documentId}/file`, {
      responseType: 'blob',
    });
    return URL.createObjectURL(response.data as Blob);
  },
  deleteDocument: async (id: any) => {
    const response = await apiClient.delete(`/documents/${id}`);
    return response.data;
  }
};