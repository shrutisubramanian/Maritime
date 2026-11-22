import React, { InputHTMLAttributes } from 'react';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  icon?: React.ReactNode;
}

export const Input: React.FC<InputProps> = ({
  label,
  error,
  helperText,
  icon,
  className = '',
  id,
  ...props
}) => {
  const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', width: '100%' }}>
      {label && (
        <label
          htmlFor={inputId}
          style={{
            fontSize: '0.85rem',
            fontWeight: 500,
            color: 'var(--text-muted)'
          }}
        >
          {label}
        </label>
      )}

      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        {icon && (
          <span style={{ position: 'absolute', left: '0.75rem', color: 'var(--text-dim)', display: 'flex' }}>
            {icon}
          </span>
        )}
        <input
          id={inputId}
          style={{
            width: '100%',
            padding: '0.65rem 0.85rem',
            paddingLeft: icon ? '2.5rem' : '0.85rem',
            backgroundColor: 'var(--bg-surface)',
            border: error ? '1px solid var(--accent-rose)' : '1px solid var(--border-color)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--text-main)',
            fontSize: '0.9rem',
            outline: 'none',
            transition: 'border-color 0.2s ease, box-shadow 0.2s ease'
          }}
          className={className}
          {...props}
        />
      </div>

      {error ? (
        <span style={{ fontSize: '0.775rem', color: 'var(--accent-rose)' }}>{error}</span>
      ) : helperText ? (
        <span style={{ fontSize: '0.775rem', color: 'var(--text-dim)' }}>{helperText}</span>
      ) : null}
    </div>
  );
};
