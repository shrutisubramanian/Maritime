import { apiClient } from './apiClient';
import { INDIAN_PORTS } from '../constants/ports';

/**
 * The head-office port catalogue.
 *
 * `name` is the canonical short form the backend stores and filters by
 * ("Kandla", "JNPT", "New Mangalore"). A company's head office must be one of
 * these, because head office is what places it under a port in the marketplace.
 */
export interface PortOption {
  id: string;
  name: string;
  state?: string | null;
  kind?: string | null;
  aliases: string[];
  is_active: boolean;
}

/** Display label: "Kandla, Gujarat" (state is optional). */
export const portLabel = (port: PortOption): string =>
  port.state ? `${port.name}, ${port.state}` : port.name;

export const portsService = {
  /** Active ports (admin-extended list from the database). */
  list: async (): Promise<PortOption[]> => {
    try {
      const response = await apiClient.get('/ports');
      const data = (response.data?.data ?? []) as PortOption[];
      if (data.length > 0) return data;
      throw new Error('empty catalogue');
    } catch {
      // Fallback for an unreachable catalogue: the same ports from the bundled
      // list, so a profile form never renders an empty dropdown. Names match the
      // seeded catalogue (the backend also resolves aliases).
      return INDIAN_PORTS.map((p) => ({
        id: p.id,
        name: p.value,
        state: p.state,
        kind: p.category,
        aliases: p.aliases,
        is_active: true,
      }));
    }
  },

};
