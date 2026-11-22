import React from 'react';
import { passwordRules } from '../utils/passwordPolicy';

interface PasswordRequirementsProps {
  password: string;
  /** The registration panel uses Morning Dawn text on Yale Blue. */
  onBrand?: boolean;
}

/**
 * Live password checklist shown beside the password field. The backend repeats
 * the same three rules; this is the visible, immediate feedback only.
 */
export const PasswordRequirements: React.FC<PasswordRequirementsProps> = ({
  password,
  onBrand = false,
}) => {
  const metColor = onBrand ? '#A7F3D0' : 'var(--color-success)';
  const unmetColor = onBrand ? 'rgba(255, 243, 109, 0.72)' : 'var(--color-muted)';

  return (
    <div
      aria-live="polite"
      style={{
        borderRadius: 10,
        border: `1px solid ${onBrand ? 'rgba(255, 243, 109,0.28)' : 'var(--color-border)'}`,
        background: onBrand ? 'rgba(255, 243, 109,0.07)' : 'var(--color-surface-alt)',
        padding: '0.8rem 0.95rem',
      }}
    >
      <p
        style={{
          margin: '0 0 0.45rem',
          fontFamily: "'Inter', sans-serif",
          fontSize: '0.68rem',
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: onBrand ? 'rgba(255, 243, 109,0.82)' : 'var(--color-muted)',
        }}
      >
        Password must contain
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.32rem' }}>
        {passwordRules(password).map((rule) => (
          <div
            key={rule.key}
            aria-label={`${rule.label}: ${rule.met ? 'met' : 'not met'}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              color: rule.met ? metColor : unmetColor,
              fontFamily: "'Inter', sans-serif",
              fontSize: '0.78rem',
              lineHeight: 1.4,
              transition: 'color 0.2s',
            }}
          >
            <span
              className="material-symbols-outlined"
              aria-hidden="true"
              style={{ fontSize: '1rem', flexShrink: 0 }}
            >
              {rule.met ? 'check_circle' : 'radio_button_unchecked'}
            </span>
            <span>{rule.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default PasswordRequirements;