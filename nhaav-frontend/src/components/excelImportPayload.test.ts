import test from 'node:test';
import assert from 'node:assert/strict';
import { buildExcelImportPayload } from './excelImportPayload.ts';
import type { ExcelImportValues, ProfileUpdateData } from '../services/profiles';

function values(overrides: Partial<ExcelImportValues> = {}): ExcelImportValues {
  return {
    primary_category: 'Ship Repair & Services',
    other_categories: [],
    additional_categories: [],
    head_office: 'Mumbai',
    phone: null,
    other_ports: [],
    social_links: {},
    registration_number: null,
    email: null,
    address: null,
    ...overrides,
  };
}

// A profile that already holds lists the workbook may leave blank.
function profile(overrides: Partial<ProfileUpdateData> = {}): ProfileUpdateData {
  return {
    company_name: 'Nhaav Marine Services',
    bio: 'Dry dock repairs',
    subcategories: ['Marine Equipment'],
    additional_categories: ['Inspections & Surveys'],
    primary_category: 'Ship Repair & Services',
    ports_served: ['Mumbai'],
    contacts: [{ name: 'Asha', email: 'asha@nhaav.com', phone: '+91 90000 00001' }],
    social_links: { linkedin: 'https://linkedin.com/company/nhaav' },
    profile_metadata: { regNumber: 'U12345MH2015PTC123456' },
    ...overrides,
  };
}

// --- the BLOCKER: a blank list must not be sent as an empty list ------------

test('blank list cells omit subcategories and additional_categories from the payload', () => {
  const payload = buildExcelImportPayload(
    values({ other_categories: [], additional_categories: [] }),
    { company_name: '', bio: '' },
  );

  assert.equal('subcategories' in payload, false);
  assert.equal('additional_categories' in payload, false);
});

test('a blank cell leaves the loaded profile lists in place rather than clearing them', () => {
  const payload = buildExcelImportPayload(
    values({ other_categories: [], additional_categories: [] }),
    profile(),
  );

  assert.deepEqual(payload.subcategories, ['Marine Equipment']);
  assert.deepEqual(payload.additional_categories, ['Inspections & Surveys']);
});

// --- supplied lists are sent ------------------------------------------------

test('supplied lists replace both category lists', () => {
  const payload = buildExcelImportPayload(
    values({
      other_categories: ['Safety Equipment', 'Marine Equipment'],
      additional_categories: ['Ship Chandlers'],
    }),
    profile(),
  );

  assert.deepEqual(payload.subcategories, ['Safety Equipment', 'Marine Equipment']);
  assert.deepEqual(payload.additional_categories, ['Ship Chandlers']);
});

test('only the supplied list is replaced; the blank one is left alone', () => {
  const payload = buildExcelImportPayload(
    values({ other_categories: ['Safety Equipment'], additional_categories: [] }),
    profile(),
  );

  assert.deepEqual(payload.subcategories, ['Safety Equipment']);
  assert.deepEqual(payload.additional_categories, ['Inspections & Surveys']);
});

test('without a primary category no category key is written', () => {
  const payload = buildExcelImportPayload(
    values({
      primary_category: null,
      other_categories: ['Safety Equipment'],
      additional_categories: ['Ship Chandlers'],
    }),
    profile(),
  );

  assert.equal(payload.primary_category, 'Ship Repair & Services');
  assert.deepEqual(payload.subcategories, ['Marine Equipment']);
  assert.deepEqual(payload.additional_categories, ['Inspections & Surveys']);
});

// --- the rest of the merge still behaves ------------------------------------

test('the payload is the current profile plus the imported fields', () => {
  const payload = buildExcelImportPayload(
    values({ head_office: 'Chennai', other_ports: ['Kochi'], company_name: 'Nhaav Dry Dock' }),
    profile(),
  );

  assert.equal(payload.bio, 'Dry dock repairs');
  assert.equal(payload.head_office, 'Chennai');
  assert.deepEqual(payload.ports_served, ['Kochi']);
  assert.equal(payload.company_name, 'Nhaav Dry Dock');
});

test('blank scalar cells keep the existing profile values', () => {
  const payload = buildExcelImportPayload(
    values({ head_office: null, other_ports: [], company_name: null }),
    profile(),
  );

  assert.deepEqual(payload.ports_served, ['Mumbai']);
  assert.equal(payload.company_name, 'Nhaav Marine Services');
});

test('phone and email land on the first contact without dropping the rest', () => {
  const payload = buildExcelImportPayload(
    values({ phone: '+91 98765 43210', email: 'sales@nhaav.com' }),
    profile({
      contacts: [
        { name: 'Asha', email: 'asha@nhaav.com', phone: '+91 90000 00001' },
        { name: 'Ravi', email: 'ravi@nhaav.com', phone: '+91 90000 00002' },
      ],
    }),
  );

  assert.deepEqual(payload.contacts?.[0], {
    name: 'Asha',
    email: 'sales@nhaav.com',
    phone: '+91 98765 43210',
  });
  assert.deepEqual(payload.contacts?.[1], {
    name: 'Ravi',
    email: 'ravi@nhaav.com',
    phone: '+91 90000 00002',
  });
});

test('a company with no contact gets one built from the workbook', () => {
  const payload = buildExcelImportPayload(
    values({ phone: '+91 98765 43210', email: 'sales@nhaav.com' }),
    { company_name: '', bio: '' },
  );

  assert.deepEqual(payload.contacts, [
    { name: '', email: 'sales@nhaav.com', phone: '+91 98765 43210' },
  ]);
});

test('social links merge by network and registration/address go to metadata', () => {
  const payload = buildExcelImportPayload(
    values({
      social_links: { instagram: 'https://instagram.com/nhaav', linkedin: '' },
      registration_number: 'U99999MH2020PTC999999',
      address: 'Unit 5, Harbour Road, Mumbai 400001',
    }),
    profile(),
  );

  assert.deepEqual(payload.social_links, {
    linkedin: 'https://linkedin.com/company/nhaav',
    instagram: 'https://instagram.com/nhaav',
  });
  assert.equal(payload.profile_metadata?.regNumber, 'U99999MH2020PTC999999');
  assert.equal(payload.profile_metadata?.address, 'Unit 5, Harbour Road, Mumbai 400001');
});

test('building the payload does not mutate the loaded profile', () => {
  const current = profile();
  const before = structuredClone(current);

  buildExcelImportPayload(
    values({
      other_categories: ['Safety Equipment'],
      other_ports: ['Kochi'],
      phone: '+91 98765 43210',
      social_links: { instagram: 'https://instagram.com/nhaav' },
      registration_number: 'U99999MH2020PTC999999',
    }),
    current,
  );

  assert.deepEqual(current, before);
});
