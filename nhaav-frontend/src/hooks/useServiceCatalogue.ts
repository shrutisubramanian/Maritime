import { useCallback, useEffect, useState } from 'react';
import {
  serviceCategoriesApi,
  ServiceCatalogueGroup,
} from '../services/serviceCategories';

/**
 * Loads the one service catalogue used by the Services page and provider forms.
 * Pages must not fall back to a local category list: that is how the old
 * Services page and the vendor selector drifted apart.
 */
export function useServiceCatalogue() {
  const [groups, setGroups] = useState<ServiceCatalogueGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const next = await serviceCategoriesApi.getGrouped();
      setGroups(next);
    } catch {
      setGroups([]);
      setError('Could not load the service catalogue. Please retry.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return {
    groups,
    loading,
    error,
    reload,
    totalServices: groups.reduce((total, group) => total + group.subServices.length, 0),
  };
}
