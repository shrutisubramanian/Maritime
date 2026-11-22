import React, { useState } from 'react';
import { useTheme } from '../context/ThemeContext';
import { brand } from '../constants/colors';

export interface FormInputFieldProps {
  id: string;
  label: string;
  type: string;
  placeholder: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  icon: string;
  autoFocus?: boolean;
  inputRef?: React.Ref<HTMLInputElement>;
  /**
   * `onBrand` renders the field for a Yale Blue panel: labels, icon and value
   * text are Morning Dawn and the underline is a chiffon hairline. Use it
   * wherever this field sits inside the brand-coloured surface.
   */
  variant?: 'default' | 'onBrand';
}

/**
 * Morning Dawn on Yale Blue — label, value, icon and placeholder inks.
 *
 * Every one of these is the SAME ink at full strength: the registration panel
 * specifies its copy as strictly Morning Dawn, so nothing inside it is tinted
 * or greyed. The placeholder is still distinguishable from a typed value, but
 * by style (italic, see `.on-brand-field::placeholder`) rather than by colour.
 * Only the non-text hairlines — field underlines and the panel edge — carry
 * alpha, because they are decoration and not copy.
 */
const ON_BRAND = {
  label:   brand.merino,
  value:   brand.merino,
  iconDim: brand.merino,
  accent:  brand.merino,
  border:  'rgba(255, 243, 109, 0.30)',
} as const;

export const FormInputField: React.FC<FormInputFieldProps> = ({ id, label, type, placeholder, value, onChange, icon, autoFocus, inputRef, variant = 'default' }) => {
  const [focused, setFocused] = useState(false);
  const { tokens: C, isDark } = useTheme();
  const onBrand = variant === 'onBrand';

  const labelColor = onBrand
    ? ON_BRAND.label
    : isDark ? C.muted : 'rgba(71,85,105,0.8)';
  const iconDim = onBrand
    ? ON_BRAND.iconDim
    : isDark ? 'rgba(13,59,102,0.45)' : 'rgba(100,116,139,0.5)';
  const border = onBrand ? ON_BRAND.border : isDark ? 'rgba(13,59,102,0.3)' : 'rgba(203,213,225,0.8)';
  const textColor = onBrand ? ON_BRAND.value : C.text;
  const accent = onBrand ? ON_BRAND.accent : C.cyan;

  return (
    <div>
      <label htmlFor={id} style={{ display: 'block', fontFamily: "'Inter', sans-serif", fontSize: '0.65rem', fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase', color: labelColor, marginBottom: '0.5rem' }}>
        {label}
      </label>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <span
          className="material-symbols-outlined"
          style={{
            fontSize: '1.25rem',
            marginRight: '0.75rem',
            color: focused ? accent : iconDim,
            fontVariationSettings: focused ? "'FILL' 1" : "'FILL' 0",
            transition: 'color 0.2s, font-variation-settings 0.2s',
            flexShrink: 0,
          }}
        >{icon}</span>
        <input
          id={id}
          ref={inputRef}
          type={type}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          autoFocus={autoFocus}
          required
          className={onBrand ? 'on-brand-field' : undefined}
          style={{
            width: '100%',
            background: 'transparent',
            border: 'none',
            borderBottom: `2px solid ${focused ? accent : border}`,
            padding: '0.5rem 0',
            fontFamily: "'Inter', sans-serif",
            fontSize: '0.9rem',
            fontWeight: 500,
            color: textColor,
            outline: 'none',
            transition: 'border-color 0.3s',
          }}
        />
      </div>
    </div>
  );
};
