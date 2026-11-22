import React from 'react';

const C = {
  bg:        'var(--color-background)',
  bgCardH:   'var(--color-surface)',
  bgLow:     'var(--color-surface-alt)',
  border:    'var(--color-border)',
  text:      'var(--color-text)',
  muted:     'var(--color-muted)',
  slate:     'var(--color-muted)',
  cyan:      'var(--color-brand)',
  dim:       'var(--color-faint)',
  white:     'var(--color-text)',
  primary:   'var(--color-brand)',
  green:     'var(--color-success)',
  error:     'var(--color-error)',
  amber:     'var(--color-warning)',
};

const fonts = { manrope: "'Manrope', sans-serif", inter: "'Inter', sans-serif" };

export interface ConfirmationModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  isDestructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  isOpen,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  isDestructive = false,
  onConfirm,
  onCancel
}) => {
  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(11, 34, 57, 0.5)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 9999, padding: '1rem'
    }}>
      <div style={{
        background: C.bgLow, border: `1px solid ${C.border}`, borderRadius: 24,
        padding: '2rem', width: '100%', maxWidth: 440,
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.15)',
        display: 'flex', flexDirection: 'column', gap: '1.5rem',
        animation: 'modalSlideIn 0.3s ease-out forwards'
      }}>
        <style>{`
          @keyframes modalSlideIn {
            from { opacity: 0; transform: translateY(20px) scale(0.95); }
            to { opacity: 1; transform: translateY(0) scale(1); }
          }
        `}</style>

        <div>
          <h2 style={{ fontFamily: fonts.manrope, fontSize: '1.5rem', fontWeight: 800, margin: '0 0 0.75rem', color: C.white }}>
            {title}
          </h2>
          <p style={{ fontFamily: fonts.inter, fontSize: '1rem', color: C.slate, margin: 0, lineHeight: 1.5 }}>
            {message}
          </p>
        </div>

        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
          <button 
            onClick={onCancel}
            style={{
              padding: '0.75rem 1.5rem', borderRadius: 12, background: 'transparent',
              color: C.slate, border: 'none', fontWeight: 600, fontSize: '0.875rem',
              cursor: 'pointer', transition: 'color 0.2s'
            }}
            onMouseEnter={e => e.currentTarget.style.color = C.white}
            onMouseLeave={e => e.currentTarget.style.color = C.slate}
          >
            {cancelText}
          </button>
          <button 
            onClick={onConfirm}
            style={{
              padding: '0.75rem 1.5rem', borderRadius: 12, border: 'none',
              background: isDestructive ? 'rgba(220, 38, 38, 0.1)' : C.cyan,
              color: isDestructive ? C.error : 'var(--color-on-brand)',
              fontWeight: 700, fontSize: '0.875rem', cursor: 'pointer',
              transition: 'background 0.2s', boxShadow: isDestructive ? 'none' : '0 10px 20px var(--color-brand-tint-strong)'
            }}
            onMouseEnter={e => e.currentTarget.style.background = isDestructive ? 'rgba(220, 38, 38, 0.2)' : 'var(--color-brand-hover)'}
            onMouseLeave={e => e.currentTarget.style.background = isDestructive ? 'rgba(220, 38, 38, 0.1)' : C.cyan}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};
