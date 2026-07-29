import React, { ButtonHTMLAttributes } from 'react';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  icon?: React.ReactNode;
  isLoading?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  icon,
  isLoading = false,
  className = '',
  disabled,
  ...props
}) => {
  const getVariantStyles = () => {
    switch (variant) {
      case 'secondary':
        return 'background: var(--bg-surface); color: var(--text-main); border: 1px solid var(--border-color);';
      case 'outline':
        return 'background: transparent; color: var(--accent-primary); border: 1px solid var(--accent-primary);';
      case 'danger':
        return 'background: var(--accent-rose); color: white; border: none;';
      case 'ghost':
        return 'background: transparent; color: var(--text-muted); border: none;';
      case 'primary':
      default:
        return 'background: linear-gradient(135deg, var(--accent-primary), #0284c7); color: white; border: none; box-shadow: 0 4px 12px var(--accent-glow);';
    }
  };

  const getSizeStyles = () => {
    switch (size) {
      case 'sm':
        return 'padding: 0.35rem 0.75rem; font-size: 0.825rem; border-radius: var(--radius-sm);';
      case 'lg':
        return 'padding: 0.85rem 1.75rem; font-size: 1rem; border-radius: var(--radius-md); font-weight: 600;';
      case 'md':
      default:
        return 'padding: 0.6rem 1.25rem; font-size: 0.9rem; border-radius: var(--radius-sm); font-weight: 500;';
    }
  };

  return (
    <button
      disabled={disabled || isLoading}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.5rem',
        cursor: disabled || isLoading ? 'not-allowed' : 'pointer',
        opacity: disabled || isLoading ? 0.6 : 1,
        transition: 'all 0.2s ease',
        fontFamily: 'var(--font-sans)',
        ...Object.fromEntries(
          (getVariantStyles() + getSizeStyles())
            .split(';')
            .filter(Boolean)
            .map(rule => {
              const [k, v] = rule.split(':');
              const camelK = k.trim().replace(/-([a-z])/g, g => g[1].toUpperCase());
              return [camelK, v.trim()];
            })
        )
      }}
      className={className}
      {...props}
    >
      {isLoading ? (
        <span style={{ display: 'inline-block', width: '1rem', height: '1rem', border: '2px solid currentColor', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
      ) : (
        icon
      )}
      {children}
    </button>
  );
};
