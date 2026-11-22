import React from 'react';
import { useAuth } from '../hooks/useAuth';
import { formatAuthError } from '../hooks/useLoginForm';
import {
  supportService,
  SupportTicketCategory,
  SupportTicketResult,
} from '../services/support';

/**
 * Support popup.
 *
 * Anyone can use it — signed in or not — so it is safe to render from public
 * pages (landing, register, login). Submitting raises a real support ticket on
 * the backend, which emails the team and returns a ticket number the user can
 * quote back to us.
 *
 * Styling follows the CSS-variable convention used by the other shared
 * components (ConfirmationModal), so it themes automatically.
 */

const C = {
  bg:      'var(--color-surface)',
  border:  'var(--color-border)',
  text:    'var(--color-text)',
  muted:   'var(--color-muted)',
  brand:   'var(--color-brand)',
  brandSoft: 'var(--color-brand-soft)',
  surfaceAlt: 'var(--color-surface-alt)',
  error:   'var(--color-error)',
  errorTint: 'var(--color-error-tint)',
  merino:  'var(--color-merino)',
  success: 'var(--color-success)',
  faint:   'var(--color-faint)',
};

const manrope = "'Manrope', sans-serif";
const inter = "'Inter', sans-serif";

const CATEGORIES: { value: SupportTicketCategory; label: string }[] = [
  { value: 'general', label: 'General question' },
  { value: 'account', label: 'Account & sign-in' },
  { value: 'verification', label: 'Provider verification' },
  { value: 'procurement', label: 'Procurement / orders' },
  { value: 'quotation', label: 'Quotations' },
  { value: 'payment', label: 'Payments & subscriptions' },
  { value: 'technical', label: 'Technical problem' },
];

const fieldLabel: React.CSSProperties = {
  display: 'block',
  fontFamily: inter,
  fontSize: '0.65rem',
  fontWeight: 600,
  letterSpacing: '0.16em',
  textTransform: 'uppercase',
  color: C.muted,
  marginBottom: '0.45rem',
};

const fieldInput: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '0.7rem 0.85rem',
  borderRadius: 10,
  border: `1px solid ${C.border}`,
  background: C.surfaceAlt,
  color: C.text,
  fontFamily: inter,
  fontSize: '0.86rem',
  outline: 'none',
};

export interface SupportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SupportModal: React.FC<SupportModalProps> = ({ isOpen, onClose }) => {
  const { user } = useAuth();

  const [name, setName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [category, setCategory] = React.useState<SupportTicketCategory>('general');
  const [subject, setSubject] = React.useState('');
  const [message, setMessage] = React.useState('');
  const [isSending, setIsSending] = React.useState(false);
  const [error, setError] = React.useState('');
  const [result, setResult] = React.useState<SupportTicketResult | null>(null);

  // Prefill from the signed-in account when there is one, and reset the form
  // each time the popup is opened so a previous ticket is never resubmitted.
  React.useEffect(() => {
    if (!isOpen) return;
    setName(user?.full_name || user?.name || '');
    setEmail(user?.email || '');
    setCategory('general');
    setSubject('');
    setMessage('');
    setError('');
    setResult(null);
    setIsSending(false);
  }, [isOpen, user]);

  // Escape closes the popup.
  React.useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  // Lock the page behind the popup. Without this, wheel/touch scrolling over
  // the backdrop (and scrolling past the end of the panel) moves the page
  // underneath the dialog. The padding compensates for the vanished
  // scrollbar so the layout does not jump.
  React.useEffect(() => {
    if (!isOpen) return;
    const { body, documentElement } = document;
    const previousBodyOverflow = body.style.overflow;
    const previousHtmlOverflow = documentElement.style.overflow;
    const previousPaddingRight = body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - documentElement.clientWidth;
    // The document scroller here is <html>, so both need locking.
    body.style.overflow = 'hidden';
    documentElement.style.overflow = 'hidden';
    if (scrollbarWidth > 0) body.style.paddingRight = `${scrollbarWidth}px`;
    return () => {
      body.style.overflow = previousBodyOverflow;
      documentElement.style.overflow = previousHtmlOverflow;
      body.style.paddingRight = previousPaddingRight;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim().length < 10) {
      setError('Please describe the issue in at least 10 characters.');
      return;
    }
    setIsSending(true);
    setError('');
    try {
      const res = await supportService.raiseTicket({
        name: name.trim() || undefined,
        email: email.trim() || undefined,
        subject: subject.trim() || undefined,
        message: message.trim(),
        category,
      });
      setResult(res);
    } catch (err) {
      setError(formatAuthError(err, 'We could not send your message. Please try again.'));
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Contact support"
      onMouseDown={e => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        // Above the terms consent strip (9500) and page overlays, below the
        // critical session/confirmation dialogs (9999).
        zIndex: 9600,
        background: 'rgba(10, 12, 15, 0.62)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 560,
          maxHeight: '90vh',
          overflowY: 'auto',
          background: C.bg,
          border: `1px solid ${C.border}`,
          borderRadius: 16,
          padding: 'clamp(1.5rem, 4vw, 2.25rem)',
          boxShadow: '0 24px 60px rgba(0,0,0,0.28)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
          <div>
            <h2 style={{ fontFamily: manrope, fontSize: '1.35rem', fontWeight: 800, color: C.text, margin: '0 0 0.35rem', letterSpacing: '-0.02em' }}>
              Contact support
            </h2>
            <p style={{ fontFamily: inter, fontSize: '0.8rem', color: C.muted, margin: 0, lineHeight: 1.6 }}>
              Tell us what went wrong and we will email you back.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close support dialog"
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: C.muted, display: 'flex', padding: 4 }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '1.35rem' }}>close</span>
          </button>
        </div>

        {result ? (
          <div style={{ marginTop: '1.75rem', textAlign: 'center' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '3rem', color: C.success }}>check_circle</span>
            <h3 style={{ fontFamily: manrope, fontSize: '1.05rem', fontWeight: 700, color: C.text, margin: '0.75rem 0 0.5rem' }}>
              We have logged your issue
            </h3>
            <p style={{ fontFamily: inter, fontSize: '0.85rem', color: C.muted, lineHeight: 1.7, margin: '0 auto 1rem', maxWidth: 380 }}>
              {result.message}
            </p>
            <div style={{
              display: 'inline-block',
              fontFamily: inter,
              fontWeight: 700,
              fontSize: '0.95rem',
              letterSpacing: '0.04em',
              color: C.brand,
              background: C.surfaceAlt,
              border: `1px solid ${C.border}`,
              borderRadius: 10,
              padding: '0.6rem 1.1rem',
              marginBottom: '1.5rem',
            }}>
              {result.ticket_number}
            </div>
            <button
              type="button"
              onClick={onClose}
              style={{
                display: 'block',
                width: '100%',
                padding: '0.85rem',
                background: C.brand,
                color: C.merino,
                fontFamily: manrope,
                fontWeight: 700,
                fontSize: '0.95rem',
                border: 'none',
                borderRadius: 12,
                cursor: 'pointer',
              }}
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
            {error && (
              <div style={{
                padding: '0.7rem 0.85rem',
                borderRadius: 10,
                background: C.errorTint,
                border: `1px solid ${C.error}`,
                color: C.error,
                fontFamily: inter,
                fontSize: '0.78rem',
              }}>
                {error}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
              <div>
                <label htmlFor="support-name" style={fieldLabel}>Your name</label>
                <input
                  id="support-name"
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Name"
                  style={fieldInput}
                />
              </div>
              <div>
                <label htmlFor="support-email" style={fieldLabel}>Email</label>
                <input
                  id="support-email"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  style={fieldInput}
                />
              </div>
            </div>

            <div>
              <label htmlFor="support-category" style={fieldLabel}>Topic</label>
              <select
                id="support-category"
                value={category}
                onChange={e => setCategory(e.target.value as SupportTicketCategory)}
                style={{ ...fieldInput, cursor: 'pointer' }}
              >
                {CATEGORIES.map(c => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="support-subject" style={fieldLabel}>Subject <span style={{ color: C.faint, textTransform: 'none', letterSpacing: 0 }}>(optional)</span></label>
              <input
                id="support-subject"
                type="text"
                value={subject}
                onChange={e => setSubject(e.target.value)}
                placeholder="Short summary"
                style={fieldInput}
              />
            </div>

            <div>
              <label htmlFor="support-message" style={fieldLabel}>Describe your issue</label>
              <textarea
                id="support-message"
                value={message}
                onChange={e => setMessage(e.target.value)}
                required
                minLength={10}
                maxLength={5000}
                rows={6}
                placeholder="What happened, and what were you trying to do?"
                style={{ ...fieldInput, resize: 'vertical', lineHeight: 1.65 }}
              />
              <div style={{ fontFamily: inter, fontSize: '0.7rem', color: C.faint, marginTop: '0.35rem', textAlign: 'right' }}>
                {message.length}/5000
              </div>
            </div>

            <button
              type="submit"
              disabled={isSending}
              style={{
                width: '100%',
                padding: '0.9rem',
                background: C.brand,
                color: C.merino,
                fontFamily: manrope,
                fontWeight: 700,
                fontSize: '0.95rem',
                border: 'none',
                borderRadius: 12,
                cursor: isSending ? 'not-allowed' : 'pointer',
                opacity: isSending ? 0.65 : 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
              }}
            >
              <span>{isSending ? 'Sending…' : 'Send to support'}</span>
              <span className="material-symbols-outlined" style={{ fontSize: '1.05rem' }}>send</span>
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
