import type { ExcelImportValues, ProfileUpdateData } from '../services/profiles';

/**
 * Build the `PUT /profiles/me` body for a confirmed Excel import.
 *
 * The imported values are merged into the profile already loaded into the
 * manual form, so nothing outside the imported fields changes. Crucially, a
 * blank workbook cell must never erase what the profile holds: on the server an
 * empty list means "clear", so a list the workbook did not fill in is left out
 * of the payload entirely and the existing value survives untouched.
 */
export function buildExcelImportPayload(
  values: ExcelImportValues,
  formData: ProfileUpdateData,
): ProfileUpdateData {
  // Phone and email live on the first contact, so merge into it and keep the
  // rest of the contact list exactly as the profile holds it.
  const [existing, ...rest] = formData.contacts || [];
  const first = { name: '', email: '', phone: '', ...(existing ?? {}) };
  if (values.phone) first.phone = values.phone;
  if (values.email) first.email = values.email;
  const contacts = [first, ...rest];

  const social_links = { ...(formData.social_links || {}) };
  Object.entries(values.social_links || {}).forEach(([network, url]) => {
    if (url) social_links[network] = url;
  });

  const profile_metadata = { ...(formData.profile_metadata || {}) };
  if (values.registration_number) profile_metadata.regNumber = values.registration_number;
  // The registered address is its own field on the page; the Offices list
  // stays the city/country locations the vendor maintains by hand.
  if (values.address) profile_metadata.address = values.address;

  const payload: ProfileUpdateData = {
    ...formData,
    contacts,
    social_links,
    profile_metadata,
  };
  if (values.primary_category) {
    payload.primary_category = values.primary_category;
    // Only send a list the workbook actually filled in — see above.
    if (values.other_categories.length > 0) {
      payload.subcategories = values.other_categories;
    }
    if (values.additional_categories.length > 0) {
      payload.additional_categories = values.additional_categories;
    }
  }
  if (values.head_office) payload.head_office = values.head_office;
  if (values.other_ports.length > 0) {
    payload.ports_served = values.other_ports;
  }
  // Company Name is a real profile field; Company Type is the account role,
  // which the workbook may not overwrite (the preview warns on a mismatch).
  if (values.company_name) payload.company_name = values.company_name;

  return payload;
}
