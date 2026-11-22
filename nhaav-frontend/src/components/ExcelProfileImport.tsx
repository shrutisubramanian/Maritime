import React, { useRef, useState } from 'react';
import {
  profilesService,
  ExcelImportPreview,
  ExcelImportValues,
} from '../services/profiles';
import { mergeRevalidatedPreview } from './excelImportPreview';

const C = {
  card: 'var(--color-surface-alt)',
  cardInner: 'var(--color-surface)',
  border: 'var(--color-border)',
  text: 'var(--color-text)',
  muted: 'var(--color-muted)',
  dim: 'var(--color-faint)',
  brand: 'var(--color-brand)',
  green: 'var(--color-success)',
  amber: 'var(--color-warning)',
  error: 'var(--color-error)',
};

const fonts = { manrope: "'Manrope', sans-serif", inter: "'Inter', sans-serif" };

// Status colours are the *-text variants: the solid */
const TONES = {
  green: { bg: 'var(--color-success-tint)', fg: 'var(--color-success-text)' },
  amber: { bg: 'var(--color-warning-tint)', fg: 'var(--color-warning-text)' },
  red: { bg: 'var(--color-error-tint)', fg: 'var(--color-error-text)' },
  grey: { bg: 'var(--color-brand-tint-solid)', fg: C.text },
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.6rem 0.85rem',
  background: C.card,
  border: `1px solid ${C.border}`,
  color: C.text,
  borderRadius: 8,
  outline: 'none',
  fontFamily: fonts.inter,
  fontSize: '0.9rem',
  boxSizing: 'border-box',
};

const buttonBase: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  padding: '0.6rem 1.1rem',
  borderRadius: 8,
  fontWeight: 700,
  fontSize: '0.85rem',
  fontFamily: fonts.manrope,
  cursor: 'pointer',
  border: '1px solid transparent',
};

const primaryButton: React.CSSProperties = {
  ...buttonBase,
  background: C.brand,
  color: 'var(--color-on-brand)',
};

const secondaryButton: React.CSSProperties = {
  ...buttonBase,
  background: 'transparent',
  border: `1px solid ${C.border}`,
  color: C.text,
};

const ghostButton: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: C.brand,
  fontWeight: 700,
  fontSize: '0.82rem',
  cursor: 'pointer',
  padding: 0,
  fontFamily: fonts.inter,
};

// Multi-value fields are edited as comma-separated text, exactly as they are
// typed into the spreadsheet.
const MULTI_KEYS = new Set(['other_categories', 'additional_categories', 'other_ports', 'social_links']);

// Extra profile fields a wider (legacy) workbook may carry. They have no input
// in the review form, but must ride along on re-validation — otherwise editing
// any field would silently drop them from the import.
const CARRIED_EXTRA_KEYS = ['company_name', 'company_type'] as const;

const EDITABLE_FIELDS: { key: string; label: string; placeholder: string }[] = [
  { key: 'primary_category', label: 'Primary Business Category', placeholder: 'e.g. Ship Repair & Services' },
  // Two different concepts: capabilities sit under the primary category, while
  // "other business categories" are separate whole categories the company also
  // works in. They stay separately editable so an edit cannot move a value from
  // one to the other.
  { key: 'other_categories', label: 'Capabilities Under Your Primary Category', placeholder: 'e.g. Marine Equipment, Safety Equipment' },
  { key: 'additional_categories', label: 'Other Business Categories', placeholder: 'e.g. Inspections & Surveys' },
  { key: 'head_office', label: 'Head Office', placeholder: 'e.g. Mumbai' },
  { key: 'phone', label: 'Phone Number', placeholder: 'e.g. +91 98765 43210' },
  { key: 'other_ports', label: 'Other Ports They Are Available In', placeholder: 'e.g. Chennai, Kochi' },
  { key: 'social_links', label: 'Social Links', placeholder: 'https://linkedin.com/company/example, https://instagram.com/example' },
  { key: 'registration_number', label: 'Company Registration Number', placeholder: 'e.g. U12345MH2015PTC123456' },
  { key: 'email', label: 'Email', placeholder: 'e.g. company@example.com' },
  { key: 'address', label: 'Address', placeholder: 'e.g. Unit 5, Harbour Road, Mumbai 400001' },
];

const toText = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'object') return Object.values(value as Record<string, string>).filter(Boolean).join(', ');
  return String(value);
};

const detailMessage = (error: any, fallback: string): string => {
  const detail = error?.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  if (detail?.message) return detail.message;
  return fallback;
};

interface ExcelProfileImportProps {
  /** Hides the import card and leaves the manual form in place. */
  onUseManual: () => void;
  /** Applies the reviewed values through the existing profile update flow. */
  onConfirm: (values: ExcelImportValues) => Promise<void>;
}

export const ExcelProfileImport: React.FC<ExcelProfileImportProps> = ({
  onUseManual,
  onConfirm,
}) => {
  const fileInput = useRef<HTMLInputElement | null>(null);
  const [step, setStep] = useState<'idle' | 'preview' | 'edit' | 'done'>('idle');
  const [preview, setPreview] = useState<ExcelImportPreview | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const downloadTemplate = async () => {
    setError('');
    try {
      const blob = await profilesService.downloadExcelProfileTemplate();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'nhaav-company-profile-template.xlsx';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(detailMessage(err, 'Could not download the template. Please try again.'));
    }
  };

  const startUpload = () => {
    setError('');
    fileInput.current?.click();
  };

  const handleFile = async (files: FileList | null) => {
    const file = files?.[0];
    if (fileInput.current) fileInput.current.value = '';
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.xlsx')) {
      setError('Please upload the Excel workbook (.xlsx) you filled in.');
      return;
    }

    setBusy(true);
    setError('');
    try {
      const result = await profilesService.previewExcelProfileImport(file);
      setPreview(result);
      setStep('preview');
    } catch (err) {
      setError(detailMessage(err, "We couldn't read this workbook. Please check it and try again."));
    } finally {
      setBusy(false);
    }
  };

  const openEditor = () => {
    if (!preview) return;
    const next: Record<string, string> = {};
    for (const field of EDITABLE_FIELDS) {
      next[field.key] = toText(preview.raw_values?.[field.key] ?? preview.values?.[field.key as keyof ExcelImportValues]);
    }
    for (const key of CARRIED_EXTRA_KEYS) {
      const value = preview.values?.[key];
      if (value) next[key] = toText(value);
    }
    setDraft(next);
    setStep('edit');
  };

  const revalidate = async () => {
    setBusy(true);
    setError('');
    try {
      const result = await profilesService.validateExcelProfileImport(draft);
      // The re-check only knows the edited values, not the workbook headings, so
      // keep the columns the original upload reported as not imported.
      setPreview(prev => mergeRevalidatedPreview(result, prev));
      setStep('preview');
    } catch (err) {
      setError(detailMessage(err, 'Could not check those changes. Please try again.'));
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    if (!preview?.can_confirm) return;
    setBusy(true);
    setError('');
    try {
      await onConfirm(preview.values);
      setStep('done');
    } catch (err) {
      setError(detailMessage(err, 'Could not save the imported details. Please try again.'));
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setPreview(null);
    setDraft({});
    setError('');
    setStep('idle');
  };

  const header = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '0.5rem' }}>
      <span className="material-symbols-outlined" style={{ color: C.brand }}>table_view</span>
      <h2 style={{ fontFamily: fonts.manrope, fontSize: '1.25rem', fontWeight: 700, margin: 0, color: C.text }}>
        Complete your profile using Excel
      </h2>
    </div>
  );

  const notice = error ? (
    <div
      role="alert"
      style={{
        marginTop: '1rem',
        padding: '0.8rem 1rem',
        borderRadius: 10,
        border: `1px solid var(--color-error)`,
        background: TONES.red.bg,
        color: TONES.red.fg,
        fontSize: '0.85rem',
        fontWeight: 600,
      }}
    >
      {error}
    </div>
  ) : null;

  return (
    <section
      aria-label="Complete your profile using Excel"
      style={{
        background: C.card,
        border: `1px solid ${C.border}`,
        borderRadius: 16,
        padding: '1.75rem',
        marginBottom: '2rem',
      }}
    >
      {header}
      <p style={{ color: C.muted, fontSize: '0.9rem', margin: '0 0 1.25rem' }}>
        Upload your company details and we&apos;ll fill your profile for you.
      </p>

      {step === 'idle' && (
        <>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button type="button" onClick={downloadTemplate} style={secondaryButton}>
              <span className="material-symbols-outlined" style={{ fontSize: '1.05rem' }}>download</span>
              Download Excel Template
            </button>
            <button type="button" onClick={startUpload} disabled={busy} style={{ ...primaryButton, opacity: busy ? 0.7 : 1 }}>
              <span className="material-symbols-outlined" style={{ fontSize: '1.05rem' }}>upload_file</span>
              {busy ? 'Reading your file…' : 'Upload Completed Excel'}
            </button>
          </div>
          <input
            ref={fileInput}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            style={{ display: 'none' }}
            onChange={e => void handleFile(e.target.files)}
          />
          <p style={{ color: C.dim, fontSize: '0.8rem', margin: '0.9rem 0 0' }}>
            The official template has one column per profile field: primary business
            category, other business categories, head office, phone number, other ports,
            social links, registration number, email and address — with dropdowns for
            categories and ports. Only primary business category and head office are
            required; separate multiple values with commas. An older sheet also works —
            any column that isn&apos;t a profile field is listed before anything is saved.{' '}
          </p>
          <p style={{ color: C.dim, fontSize: '0.8rem', margin: '0.5rem 0 0' }}>
            Nothing is saved until you review the details and confirm. Your existing profile stays as it is.{' '}
            <button type="button" onClick={onUseManual} style={ghostButton}>
              Fill manually instead
            </button>
          </p>
          {notice}
        </>
      )}

      {step === 'preview' && preview && (
        <div>
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              justifyContent: 'space-between',
              gap: '1rem',
              flexWrap: 'wrap',
              marginBottom: '0.75rem',
            }}
          >
            <h3 style={{ fontFamily: fonts.manrope, fontSize: '0.8rem', fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.dim, margin: 0 }}>
              Profile import preview
            </h3>
            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: C.brand }}>
              {preview.fields_found} field{preview.fields_found === 1 ? '' : 's'} found
            </span>
          </div>

          {preview.warning && (
            <div
              style={{
                padding: '0.75rem 0.9rem',
                borderRadius: 10,
                background: TONES.amber.bg,
                color: TONES.amber.fg,
                fontSize: '0.83rem',
                fontWeight: 600,
                marginBottom: '1rem',
              }}
            >
              {preview.warning}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {preview.fields.map(field => {
              const tone =
                field.status === 'ok' ? TONES.green
                  : field.status === 'review' ? TONES.amber
                    : field.status === 'missing' ? TONES.red
                      : TONES.grey;
              const symbol =
                field.status === 'ok' ? '✓'
                  : field.status === 'review' ? '!'
                    : field.status === 'missing' ? '✕'
                      : '–';
              const valueLabel =
                field.status === 'missing' ? 'Required field missing'
                  : field.status === 'not_provided' || !field.imported ? 'Not provided'
                    : field.imported;

              return (
                <div
                  key={field.key}
                  style={{
                    display: 'flex',
                    gap: '0.75rem',
                    alignItems: 'flex-start',
                    padding: '0.7rem 0.85rem',
                    borderRadius: 10,
                    background: C.cardInner,
                    border: `1px solid ${C.border}`,
                  }}
                >
                  <span
                    aria-hidden
                    style={{
                      flex: '0 0 22px',
                      width: 22,
                      height: 22,
                      borderRadius: '50%',
                      background: tone.bg,
                      color: tone.fg,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '0.75rem',
                      fontWeight: 800,
                    }}
                  >
                    {symbol}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.dim }}>
                      {field.label}
                    </p>
                    <p
                      style={{
                        margin: '0.2rem 0 0',
                        fontSize: '0.9rem',
                        color: field.status === 'ok' ? C.text : C.muted,
                        fontWeight: field.status === 'ok' ? 600 : 400,
                        overflowWrap: 'anywhere',
                      }}
                    >
                      {valueLabel}
                    </p>

                    {field.action === 'will_update' && field.current && (
                      <p style={{ margin: '0.3rem 0 0', fontSize: '0.78rem', color: C.muted }}>
                        Current: <span style={{ textDecoration: 'line-through' }}>{field.current}</span>
                        {' '}→ Will be updated
                      </p>
                    )}
                    {field.action === 'unchanged' && field.imported && (
                      <p style={{ margin: '0.3rem 0 0', fontSize: '0.78rem', color: C.dim }}>
                        Already matches your profile.
                      </p>
                    )}
                    {field.message && (
                      <p style={{ margin: '0.35rem 0 0', fontSize: '0.78rem', color: tone.fg, fontWeight: 600 }}>
                        {field.message}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {preview.extras.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
              {preview.extras.map(extra => (
                <div
                  key={extra.key}
                  style={{
                    display: 'flex',
                    gap: '0.75rem',
                    alignItems: 'flex-start',
                    padding: '0.7rem 0.85rem',
                    borderRadius: 10,
                    background: C.cardInner,
                    border: `1px solid ${C.border}`,
                  }}
                >
                  <span
                    aria-hidden
                    style={{
                      flex: '0 0 22px', width: 22, height: 22, borderRadius: '50%',
                      background: TONES.green.bg, color: TONES.green.fg,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '0.75rem', fontWeight: 800,
                    }}
                  >
                    +
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.dim }}>
                      {extra.label}
                    </p>
                    <p style={{ margin: '0.2rem 0 0', fontSize: '0.9rem', fontWeight: 600, color: C.text, overflowWrap: 'anywhere' }}>
                      {extra.value}
                    </p>
                    <p style={{ margin: '0.3rem 0 0', fontSize: '0.76rem', color: C.dim }}>
                      Also imported — this is an extra column in your workbook.
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {preview.ignored_columns.length > 0 && (
            <div
              style={{
                marginTop: '1rem',
                padding: '0.8rem 0.95rem',
                borderRadius: 10,
                border: `1px dashed ${C.border}`,
                background: C.cardInner,
              }}
            >
              <p style={{ margin: 0, fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.dim }}>
                Not imported from this workbook
              </p>
              {preview.ignored_columns.map(column => (
                <p key={column.column} style={{ margin: '0.3rem 0 0', fontSize: '0.8rem', color: C.muted }}>
                  <strong style={{ color: C.text }}>{column.column}</strong> — {column.reason}
                </p>
              ))}
            </div>
          )}

          {preview.warnings.length > 0 && (
            <div style={{ marginTop: '0.9rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              {preview.warnings.map(warning => (
                <p key={warning} style={{ margin: 0, fontSize: '0.8rem', color: 'var(--color-warning-text)' }}>
                  {warning}
                </p>
              ))}
            </div>
          )}

          {!preview.can_confirm && (
            <p style={{ margin: '1rem 0 0', fontSize: '0.82rem', color: 'var(--color-error-text)', fontWeight: 600 }}>
              Fix the highlighted fields to continue. You can edit them below — no need to upload the file again.
            </p>
          )}

          <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', marginTop: '1.25rem' }}>
            <button type="button" onClick={openEditor} style={secondaryButton} disabled={busy}>
              Edit Import
            </button>
            <button type="button" onClick={reset} style={secondaryButton} disabled={busy}>
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void confirm()}
              disabled={busy || !preview.can_confirm}
              style={{ ...primaryButton, opacity: busy || !preview.can_confirm ? 0.55 : 1, cursor: busy || !preview.can_confirm ? 'not-allowed' : 'pointer' }}
            >
              {busy ? 'Saving…' : 'Confirm & Fill Profile'}
            </button>
          </div>
          {notice}
        </div>
      )}

      {step === 'edit' && (
        <div>
          <p style={{ color: C.muted, fontSize: '0.86rem', margin: '0 0 1rem' }}>
            Correct anything below and we&apos;ll check it again. Separate multiple values with commas.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '0.9rem' }}>
            {EDITABLE_FIELDS.map(field => (
              <label key={field.key} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.dim }}>
                  {field.label}
                </span>
                <input
                  value={draft[field.key] ?? ''}
                  placeholder={field.placeholder}
                  onChange={e => setDraft(prev => ({ ...prev, [field.key]: e.target.value }))}
                  style={inputStyle}
                  aria-label={field.label}
                />
                {MULTI_KEYS.has(field.key) && (
                  <span style={{ fontSize: '0.72rem', color: C.dim }}>Separate each value with a comma.</span>
                )}
              </label>
            ))}
          </div>

          <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', marginTop: '1.25rem' }}>
            <button type="button" onClick={() => void revalidate()} disabled={busy} style={{ ...primaryButton, opacity: busy ? 0.7 : 1 }}>
              {busy ? 'Checking…' : 'Check my changes'}
            </button>
            <button type="button" onClick={() => setStep('preview')} disabled={busy} style={secondaryButton}>
              Back to preview
            </button>
          </div>
          {notice}
        </div>
      )}

      {step === 'done' && (
        <div>
          <div
            style={{
              padding: '0.85rem 1rem',
              borderRadius: 10,
              background: TONES.green.bg,
              color: TONES.green.fg,
              fontSize: '0.9rem',
              fontWeight: 700,
            }}
          >
            Profile details imported successfully.
          </div>
          <p style={{ color: C.muted, fontSize: '0.85rem', margin: '0.75rem 0 0' }}>
            Your profile has been refreshed below with the imported details.
          </p>
          <button type="button" onClick={reset} style={{ ...secondaryButton, marginTop: '0.9rem' }}>
            Import another file
          </button>
        </div>
      )}
    </section>
  );
};

export default ExcelProfileImport;
