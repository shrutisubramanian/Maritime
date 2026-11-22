import React from 'react';

// Design tokens
const C = {
  bgLowest: 'var(--color-surface-alt)', bgHigh: 'var(--color-surface-deep)',
  border: 'var(--color-border)', borderV: 'var(--color-border-strong)',
  text: 'var(--color-text)', muted: 'var(--color-muted)',
  cyan: 'var(--color-brand)', primary: 'var(--color-brand)', white: 'var(--color-text)',
};
const M = "'Manrope', sans-serif";
const I = "'Inter', sans-serif";

interface ExtractedDataGridProps {
  fields: Record<string, any>;
  onConfirm: () => void;
}

export const ExtractedDataGrid: React.FC<ExtractedDataGridProps> = ({ fields, onConfirm }) => {
  return (
    <div style={{
      background: C.bgLowest, padding: "1.5rem", borderRadius: 12,
      border: `1px solid ${C.border}`, display: "flex", flexDirection: "column", gap: "1.25rem"
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h3 style={{
          fontFamily: M, fontWeight: 700, fontSize: "1.1rem", color: C.white, margin: 0,
          display: "flex", alignItems: "center", gap: "0.5rem"
        }}>
          <span className="material-symbols-outlined" style={{ color: C.primary, fontSize: "1.2rem" }}>bolt</span>
          Extracted Data Verification
        </h3>
      </div>
      
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
        {Object.entries(fields).map(([key, value]) => (
          <div key={key} style={{ display: "flex", flexDirection: "column", gap: "0.25rem", gridColumn: Array.isArray(value) || (typeof value === "string" && value.length > 50) ? "span 2" : "span 1" }}>
            <label style={{ fontSize: "0.75rem", color: C.muted, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              {key.replace(/_/g, " ")}
            </label>
            {Array.isArray(value) ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginTop: "0.25rem" }}>
                {value.map((item: string, idx: number) => (
                  <div key={idx} style={{ display: "flex", alignItems: "center", gap: "0.25rem",                    background: "rgba(76,157,176,0.1)", border: `1px solid rgba(76,157,176,0.2)`, borderRadius: 999, padding: "0.25rem 0.75rem", fontSize: "0.75rem", color: C.cyan }}>
                    <span className="material-symbols-outlined" style={{ fontSize: "1rem" }}>check_circle</span>
                    {item}
                  </div>
                ))}
              </div>
            ) : (
              <input 
                type="text" 
                defaultValue={value || ""} 
                style={{ 
                  background: C.bgHigh, 
                  border: `1px solid ${C.borderV}`, 
                  borderRadius: 6, 
                  padding: "0.75rem", 
                  color: C.text, 
                  fontFamily: I, 
                  outline: "none" 
                }} 
              />
            )}
          </div>
        ))}
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "0.5rem" }}>
        <button
          onClick={onConfirm}
          style={{
            padding: "0.75rem 2.5rem",
            background: `linear-gradient(to right, ${C.primary}, ${C.cyan})`,
            color: "var(--color-on-brand)", fontWeight: 700, fontFamily: M,
            fontSize: "0.875rem", border: "none", borderRadius: 8,
            cursor: "pointer",
            boxShadow: "0 8px 24px rgba(76,157,176,0.2)",
          }}
        >
          Confirm & Proceed
        </button>
      </div>
    </div>
  );
};
