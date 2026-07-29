import React, { useState } from 'react';

export interface FormInputFieldProps {
  id: string;
  label: string;
  type: string;
  placeholder: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  icon: string;
}

const S = {
  inter:      "'Inter', sans-serif"   as const,
  labelColor: 'rgba(196,198,206,0.8)',
  iconDim:    'rgba(196,198,206,0.4)',
  iconFocus:  '#4cd6ff',
  border:     'rgba(68,71,77,0.3)',
  borderFocus:'linear-gradient(to right, #4cd6ff, #9ccaff)',
  text:       '#dce3f0',
  placeholder:'rgba(142,144,152,0.4)',
};

export const FormInputField: React.FC<FormInputFieldProps> = ({ id, label, type, placeholder, value, onChange, icon }) => {
  const [focused, setFocused] = useState(false);

  return (
    <div>
      <label htmlFor={id} style={{ display: 'block', fontFamily: S.inter, fontSize: '0.65rem', fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase', color: S.labelColor, marginBottom: '0.5rem' }}>
        {label}
      </label>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <span
          className="material-symbols-outlined"
          style={{
            fontSize: '1.25rem',
            marginRight: '0.75rem',
            color: focused ? S.iconFocus : S.iconDim,
            fontVariationSettings: focused ? "'FILL' 1" : "'FILL' 0",
            transition: 'color 0.2s, font-variation-settings 0.2s',
            flexShrink: 0,
          }}
        >{icon}</span>
        <input
          id={id}
          type={type}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          required
          style={{
            width: '100%',
            background: 'transparent',
            border: 'none',
            borderBottom: `2px solid ${focused ? '#4cd6ff' : S.border}`,
            padding: '0.5rem 0',
            fontFamily: S.inter,
            fontSize: '0.9rem',
            fontWeight: 500,
            color: S.text,
            outline: 'none',
            transition: 'border-color 0.3s',
          }}
        />
      </div>
    </div>
  );
};
