/**
 * One list of supply categories, shared by the supplier's "Add Listing" form,
 * the Supplies Marketplace and the Stores & Supplies tab of the main
 * marketplace.
 *
 * It lives here so a supplier can never create a listing in a category that no
 * marketplace filter offers: the form's dropdown and every filter chip read this
 * same array.
 */
export interface SupplyCategory {
  /** Stored verbatim on the listing (`SupplyListing.category`). */
  name: string;
  /** Material Symbols glyph used by the marketplace sidebar. */
  icon: string;
  description: string;
}

export const SUPPLY_CATEGORIES: SupplyCategory[] = [
  { name: 'Spare Parts', icon: 'inventory_2', description: 'Critical spare parts and components' },
  { name: 'Marine Equipment', icon: 'precision_manufacturing', description: 'Deck, engine and bridge equipment' },
  { name: 'Electrical Equipment', icon: 'bolt', description: 'Switchboards, cables and electrical gear' },
  { name: 'Mechanical Equipment', icon: 'settings', description: 'Pumps, compressors and machinery' },
  { name: 'Safety Equipment', icon: 'health_and_safety', description: 'LSA / FFA and safety systems' },
  { name: 'PPE', icon: 'engineering', description: 'Personal protective equipment for crew' },
  { name: 'Ship Chandlery', icon: 'sailing', description: 'General chandlery and ship stores' },
  { name: 'Provisions', icon: 'restaurant', description: 'Food, beverages and galley supplies' },
  { name: 'Tools & Consumables', icon: 'handyman', description: 'Workshop tools and consumables' },
  { name: 'Generator Parts', icon: 'electrical_services', description: 'Generators, alternators and spares' },
  { name: 'Deck Stores', icon: 'anchor', description: 'Ropes, chains and deck equipment' },
  { name: 'Engine Stores', icon: 'oil_barrel', description: 'Engine-room stores and spares' },
  { name: 'Lubricants', icon: 'water_drop', description: 'Oils, greases and lubricants' },
];

export const SUPPLY_CATEGORY_NAMES = SUPPLY_CATEGORIES.map((c) => c.name);
