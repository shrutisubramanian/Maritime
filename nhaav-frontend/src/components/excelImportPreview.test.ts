import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeRevalidatedPreview } from './excelImportPreview.ts';
import type {
  ExcelImportIgnoredColumn,
  ExcelImportPreview,
} from '../services/profiles';

// Only the fields the merge reads or preserves matter; the rest are filled with
// shape-correct placeholders so the test stays readable.
function preview(
  ignored: ExcelImportIgnoredColumn[],
  overrides: Partial<ExcelImportPreview> = {},
): ExcelImportPreview {
  return {
    fields_found: 3,
    fields: [],
    extras: [],
    ignored_columns: ignored,
    issues: [],
    warnings: [],
    values: {
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
    },
    raw_values: {},
    current: {},
    has_existing: true,
    warning: null,
    can_confirm: true,
    ...overrides,
  };
}

const UPLOAD_IGNORED: ExcelImportIgnoredColumn[] = [
  { column: 'Company Type', reason: 'Not a profile field' },
  { column: 'Notes', reason: 'Not a profile field' },
];

test('an edit keeps the ignored columns the original workbook reported', () => {
  const upload = preview(UPLOAD_IGNORED);
  const recheck = preview([]);

  const merged = mergeRevalidatedPreview(recheck, upload);

  assert.deepEqual(merged.ignored_columns, UPLOAD_IGNORED);
});

test('the re-checked values, not the upload, supply everything else', () => {
  const upload = preview(UPLOAD_IGNORED, { fields_found: 9, can_confirm: true });
  const recheck = preview([], {
    fields_found: 4,
    can_confirm: false,
    warning: 'Two fields need attention',
  });

  const merged = mergeRevalidatedPreview(recheck, upload);

  assert.equal(merged.fields_found, 4);
  assert.equal(merged.can_confirm, false);
  assert.equal(merged.warning, 'Two fields need attention');
});

test('ignored columns from the re-check itself are not overwritten', () => {
  const upload = preview(UPLOAD_IGNORED);
  const fresh: ExcelImportIgnoredColumn[] = [
    { column: 'Phone Number', reason: 'Not a valid phone number' },
  ];

  const merged = mergeRevalidatedPreview(preview(fresh), upload);

  assert.deepEqual(merged.ignored_columns, fresh);
});

test('a re-check before any upload stays empty instead of throwing', () => {
  const merged = mergeRevalidatedPreview(preview([]), null);

  assert.deepEqual(merged.ignored_columns, []);
});
