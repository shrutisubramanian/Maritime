import type { ExcelImportPreview } from '../services/profiles';

/**
 * Combine the result of a re-check ("Check my changes") with the preview the
 * original workbook produced.
 *
 * The re-check endpoint only knows the edited values, not the workbook's
 * headings, so it always reports `ignored_columns: []`. Taking its answer as-is
 * would make the "Not imported from this workbook" list vanish after an edit —
 * even though nothing about the file changed. When the re-check has its own
 * ignored columns they win; otherwise the upload's list is carried over.
 */
export function mergeRevalidatedPreview(
  result: ExcelImportPreview,
  previous: ExcelImportPreview | null,
): ExcelImportPreview {
  if (result.ignored_columns.length > 0 || !previous) return result;
  return { ...result, ignored_columns: previous.ignored_columns };
}
