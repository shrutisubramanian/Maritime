import React from 'react';

const M = "'Manrope', sans-serif";
const I = "'Inter', sans-serif";

const C = {
  bgCard: 'var(--color-surface)',
  bgHigh: 'var(--color-surface-deep)',
  border: 'var(--color-border)',
  borderV: 'var(--color-border-strong)',
  text: 'var(--color-text)',
  muted: 'var(--color-muted)',
  dim: 'var(--color-faint)',
  cyan: 'var(--color-brand)',
  primary: 'var(--color-brand)',
  green: 'var(--color-success)',
  amber: 'var(--color-warning)',
  white: 'var(--color-text)',
};

export interface ParsedResult {
  document_type?: string;
  /**
   * Field-COMPLETENESS metric (0-100 legacy integer, or 0-1 fraction).
   * NOT OCR accuracy — see confidence_available. Prefer field_completion_rate.
   */
  confidence?: number;
  /** True only when the engine provides a real per-field accuracy metric. */
  confidence_available?: boolean;
  /** Explicit completeness metric from the backend (0-1). */
  field_completion_rate?: number;
  fields?: Record<string, any>;
  missing_fields?: string[];
  extracted_text?: string;
}

interface ParsedResultBoxProps {
  result?: ParsedResult | null;
  documentName?: string;
}

export const ParsedResultBox: React.FC<ParsedResultBoxProps> = ({ result, documentName }) => {
  if (!result) {
    // Empty placeholder state
    return (
      <div style={{
        background: C.bgCard,
        borderRadius: 14,
        border: `1px dashed ${C.borderV}`,
        padding: '2.5rem 2rem',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', textAlign: 'center', gap: '0.75rem',
      }}>
        <span className="material-symbols-outlined" style={{ fontSize: '2.5rem', color: C.dim }}>
          fact_check
        </span>
        <h3 style={{ fontFamily: M, fontWeight: 700, fontSize: '1rem', color: C.dim, margin: 0 }}>
          Parsed Result
        </h3>
        <p style={{ fontSize: '0.825rem', color: C.dim, margin: 0, lineHeight: 1.5 }}>
          Upload and process a document to see extracted fields here
        </p>
      </div>
    );
  }

  const fields = result.fields || {};
  const missingFields = result.missing_fields || [];
  const confidence = result.confidence ?? null;
  const docType = result.document_type || 'Unknown Document';
  const hasFields = Object.keys(fields).length > 0;

  // H7: this number measures field COMPLETENESS, not OCR correctness.
  // Prefer the explicit 0-1 completion rate; fall back to the legacy 0-100
  // integer (or a 0-1 fraction) from older payloads. The label below is
  // chosen from confidence_available so the UI never claims accuracy the
  // engine did not provide.
  let confidencePct: number | null = null;
  if (typeof result.field_completion_rate === 'number' && Number.isFinite(result.field_completion_rate)) {
    confidencePct = Math.round(result.field_completion_rate * 100);
  } else if (typeof confidence === 'number' && Number.isFinite(confidence)) {
    confidencePct = confidence > 0 && confidence <= 1 ? Math.round(confidence * 100) : Math.round(confidence);
  }
  const metricLabel = result.confidence_available === true ? 'OCR Confidence' : 'Extraction Completeness';
  const confidenceColor = confidencePct !== null
    ? confidencePct >= 90 ? C.green
      : confidencePct >= 70 ? C.amber
        : '#ef4444'
    : C.dim;

  return (
    <div style={{
      background: C.bgCard,
      borderRadius: 14,
      border: `1px solid ${C.borderV}`,
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '1rem 1.25rem',
        borderBottom: `1px solid ${C.border}`,
        background: 'rgba(37,99,235,0.03)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
          <span className="material-symbols-outlined" style={{ color: C.primary, fontSize: '1.2rem' }}>
            fact_check
          </span>
          <h3 style={{ fontFamily: M, fontWeight: 700, fontSize: '1rem', color: C.white, margin: 0 }}>
            Parsed Result
          </h3>
        </div>
        {confidencePct !== null && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.65rem', fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              {metricLabel}
            </span>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '4px 10px', borderRadius: 999,
              background: `${confidenceColor}15`,
              border: `1px solid ${confidenceColor}30`,
            }}>
              <div style={{
                width: 7, height: 7, borderRadius: '50%',
                background: confidenceColor,
                boxShadow: `0 0 6px ${confidenceColor}`,
              }} />
              <span style={{ fontFamily: M, fontWeight: 800, fontSize: '0.8rem', color: confidenceColor }}>
                {confidencePct}%
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Body */}
      <div style={{ padding: '1.25rem' }}>
        {/* Document type + name row */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '0.75rem',
          marginBottom: '1rem',
        }}>
          <span style={{
            padding: '4px 12px', borderRadius: 999,
            background: 'rgba(76,157,176,0.1)',
            border: '1px solid rgba(76,157,176,0.2)',
            fontFamily: I, fontWeight: 600, fontSize: '0.75rem', color: C.cyan,
          }}>
            {docType}
          </span>
          {documentName && (
            <span style={{ fontSize: '0.8rem', color: C.muted }}>
              {documentName}
            </span>
          )}
        </div>

        {/* Extracted fields grid */}
        {hasFields ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {Object.entries(fields).map(([key, value]) => (
              <div key={key} style={{
                display: 'grid',
                gridTemplateColumns: '140px 1fr',
                gap: '0.75rem',
                alignItems: 'center',
                padding: '0.625rem 0.75rem',
                background: 'var(--color-surface-alt)',
                borderRadius: 8,
                border: `1px solid ${C.border}`,
              }}>
                <span style={{
                  fontSize: '0.7rem', fontWeight: 700,
                  textTransform: 'uppercase', letterSpacing: '0.08em',
                  color: C.muted,
                }}>
                  {key.replace(/_/g, ' ')}
                </span>
                {Array.isArray(value) ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem' }}>
                    {value.map((item: string, idx: number) => (
                      <span key={idx} style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        padding: '2px 10px', borderRadius: 999,
                        background: 'rgba(76,157,176,0.08)',
                        border: '1px solid rgba(76,157,176,0.15)',
                        fontSize: '0.75rem', fontWeight: 600, color: C.cyan,
                      }}>
                        <span className="material-symbols-outlined" style={{ fontSize: '0.85rem' }}>check_circle</span>
                        {item}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span style={{ fontFamily: I, fontSize: '0.875rem', fontWeight: 600, color: C.text }}>
                    {String(value)}
                  </span>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div style={{
            textAlign: 'center', padding: '2rem 1rem',
            color: C.muted,
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: '2rem', display: 'block', marginBottom: '0.5rem', color: C.dim }}>
              search_off
            </span>
            <p style={{ fontSize: '0.85rem', margin: 0 }}>No structured fields extracted</p>
          </div>
        )}

        {/* Missing fields warning */}
        {missingFields.length > 0 && (
          <div style={{
            marginTop: '1rem',
            padding: '0.75rem 1rem',
            borderRadius: 8,
            background: 'rgba(245,158,11,0.06)',
            border: '1px solid rgba(245,158,11,0.15)',
            display: 'flex', alignItems: 'flex-start', gap: '0.5rem',
          }}>
            <span className="material-symbols-outlined" style={{ color: C.amber, fontSize: '1.1rem', marginTop: 2 }}>
              warning
            </span>
            <div>
              <p style={{ fontFamily: M, fontWeight: 700, fontSize: '0.8rem', color: C.amber, margin: '0 0 0.25rem' }}>
                Missing Fields ({missingFields.length})
              </p>
              <p style={{ fontSize: '0.78rem', color: C.muted, margin: 0, lineHeight: 1.5 }}>
                {missingFields.map(f => f.replace(/_/g, ' ')).join(', ')}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
