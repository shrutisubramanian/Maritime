import { apiClient } from './apiClient';

export interface ProfileUpdateData {
  position?: string;
  company_name?: string;
  bio?: string;
  years_experience?: number;
  skills?: string[];
  /** Other ports the company works in — profile information only. */
  ports_served?: string[];
  /** The port the company's head office operates from. Drives the marketplace filter. */
  head_office?: string;
  country?: string;
  /** Regions / coasts covered. */
  service_areas?: string[];
  /**
   * Primary business category (single) from the vendor-type taxonomy, plus the
   * capabilities beneath it. Validated together server-side: a company cannot
   * hold capabilities from another category.
   */
  primary_category?: string | null;
  subcategories?: string[];
  /** Other business categories; descriptive only, never changes discovery. */
  additional_categories?: string[];
  contacts?: any[];
  licenses?: string[];
  team?: any[];
  offices?: string[];
  social_links?: Record<string, string>;
  profile_metadata?: Record<string, any>;
}

export type ExcelImportFieldStatus = 'ok' | 'review' | 'missing' | 'not_provided';
export type ExcelImportAction = 'will_update' | 'unchanged' | 'not_provided' | 'blocked';

/** One of the nine importable fields, as the server resolved it. */
export interface ExcelImportField {
  key: string;
  label: string;
  required: boolean;
  required_missing: boolean;
  /** Resolved value (canonical category/port name), or what the vendor typed. */
  imported: string | null;
  /** What the profile holds today. */
  current: string | null;
  status: ExcelImportFieldStatus;
  action: ExcelImportAction;
  message: string | null;
}

export interface ExcelImportIssue {
  field: string;
  value: string | string[];
  message: string;
  allowed: string[];
}

/** Resolved values, ready to be merged into the existing profile payload. */
export interface ExcelImportValues {
  primary_category: string | null;
  other_categories: string[];
  /** Other whole business categories the company also works in. */
  additional_categories: string[];
  head_office: string | null;
  phone: string | null;
  other_ports: string[];
  social_links: Record<string, string>;
  registration_number: string | null;
  email: string | null;
  address: string | null;
  /** Legacy wide-template columns that map to real profile fields. */
  company_name?: string | null;
  company_type?: string | null;
}

export interface ExcelImportExtra {
  key: string;
  label: string;
  value: string;
}

export interface ExcelImportIgnoredColumn {
  column: string;
  reason: string;
}

export interface ExcelImportPreview {
  fields_found: number;
  fields: ExcelImportField[];
  /** Values from the legacy wide template's extra profile columns. */
  extras: ExcelImportExtra[];
  /** Columns present in the workbook that this import does not fill. */
  ignored_columns: ExcelImportIgnoredColumn[];
  issues: ExcelImportIssue[];
  warnings: string[];
  values: ExcelImportValues;
  raw_values: Record<string, string | string[] | Record<string, string> | null>;
  current: Record<string, unknown>;
  has_existing: boolean;
  warning: string | null;
  can_confirm: boolean;
}

export interface BrochureMeta {
  filename: string;
  size_bytes: number | null;
  uploaded_at: string | null;
}

export const MAX_BROCHURE_BYTES = 15 * 1024 * 1024;

export const profilesService = {
  getMyProfile: async () => {
    const response = await apiClient.get('/profiles/me');
    return response.data;
  },
  updateMyProfile: async (data: ProfileUpdateData) => {
    const response = await apiClient.put('/profiles/me', data);
    return response.data;
  },
  getProfileById: async (id: string) => {
    const response = await apiClient.get(`/profiles/${id}`);
    return response.data;
  },
  /** Public, safe profile view by profile id (approved services only, no PII). */
  getPublicProfileById: async (id: string) => {
    const response = await apiClient.get(`/profiles/${id}/public`);
    return response.data;
  },
  /** Public, safe profile view by user id (used for a supplier on a listing). */
  getPublicProfileByUser: async (userId: string) => {
    const response = await apiClient.get(`/profiles/by-user/${userId}/public`);
    return response.data;
  },
  /** The 9-column, single-sheet Excel template vendors fill in. */
  downloadExcelProfileTemplate: async (): Promise<Blob> => {
    const response = await apiClient.get('/profiles/me/import-excel/template', {
      responseType: 'blob',
    });
    return response.data as Blob;
  },
  /** Parse a completed workbook into a review payload. Saves nothing. */
  previewExcelProfileImport: async (file: File): Promise<ExcelImportPreview> => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await apiClient.post('/profiles/me/import-excel', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data as ExcelImportPreview;
  },
  /** Re-check values corrected in the review form, without re-uploading. */
  validateExcelProfileImport: async (
    values: Record<string, string>,
  ): Promise<ExcelImportPreview> => {
    const response = await apiClient.post('/profiles/me/import-excel/validate', values);
    return response.data as ExcelImportPreview;
  },
  /** Attach or replace the company brochure. PDF only, 15 MB maximum. */
  uploadBrochure: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await apiClient.put('/profiles/me/brochure', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data as { status: string; brochure: BrochureMeta | null };
  },
  removeBrochure: async () => {
    const response = await apiClient.delete('/profiles/me/brochure');
    return response.data;
  },
};
