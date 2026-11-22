import { apiClient } from './apiClient';

/**
 * The service catalogue is owned by the backend (`service_categories` table).
 * These groups are shared by the public Services page, the provider listing
 * form and the client request form so no screen keeps its own hardcoded list.
 */
export interface ServiceCatalogueGroup {
  category: string;
  subServices: string[];
}

interface GroupedServiceCategory {
  id: string;
  name: string;
}

export const serviceCategoriesApi = {
  /** Every service category, grouped with its services, in display order. */
  getGrouped: async (): Promise<ServiceCatalogueGroup[]> => {
    const response = await apiClient.get<Record<string, GroupedServiceCategory[]>>(
      '/service-categories/grouped'
    );

    return Object.entries(response.data).map(([category, services]) => ({
      category,
      subServices: services.map(service => service.name),
    }));
  },
};
