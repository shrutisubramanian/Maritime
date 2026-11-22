import React, { useState } from 'react';
import { useTheme } from '../context/ThemeContext';
import { supportService } from '../services/support';

const manrope: React.CSSProperties = { fontFamily: "'Manrope', sans-serif" };
const inter: React.CSSProperties = { fontFamily: "'Inter', sans-serif" };

/** Brand primitives that must not follow the in-app light/dark preference. */
const CHIFFON = '#FFF36D';
const YALE = '#0D3B66';
const MOONSTONE_SURFACE = '#62A9BA';

const wrap = (max = 1120): React.CSSProperties => ({
  maxWidth: max,
  margin: '0 auto',
  padding: '0 clamp(1.25rem, 4vw, 2.5rem)',
});

const cardSurface: React.CSSProperties = {
  background: MOONSTONE_SURFACE,
  borderRadius: 24,
  boxShadow: '0 10px 30px rgba(13,59,102,0.06)',
};

type InquiryType = 'buyer' | 'supplier' | 'other';

const TABS: { id: InquiryType; label: string }[] = [
  { id: 'buyer', label: 'I am a Buyer' },
  { id: 'supplier', label: 'I am a Supplier' },
  { id: 'other', label: 'Other' },
];

const SUBJECTS = [
  'General enquiry',
  'Request a demo',
  'Pricing and plans',
  'Service provider onboarding',
  'Partnership',
] as const;

const TALKING_POINTS: { title: string; text: string }[] = [
  {
    title: 'Tell us your needs and we will contact you',
    text: 'Fill out the form and our team will get back to you promptly to discuss your specific requirements.',
  },
  {
    title: 'Experience the platform in action',
    text: 'Choose “Request a demo” as the subject in the form and we will walk you through the marketplace.',
  },
  {
    title: 'Simplify your procurement cycle',
    text: 'One enquiry for services and supplies across your ports, answered by verified providers.',
  },
];

const fieldLabel: React.CSSProperties = {
  display: 'block',
  marginBottom: '0.4rem',
  fontSize: '0.82rem',
  fontWeight: 600,
  color: YALE,
};

const fieldInput: React.CSSProperties = {
  width: '100%',
  padding: '0.7rem 0.85rem',
  borderRadius: 10,
  border: '1px solid rgba(13,59,102,0.22)',
  background: '#ffffff',
  color: YALE,
  fontFamily: "'Inter', sans-serif",
  fontSize: '0.9rem',
  outline: 'none',
  boxSizing: 'border-box',
};

/**
 * "Feel free to contact us" — the end-of-page enquiry form.
 *
 * Not decorative: submitting posts to /support/contact, which persists the
 * enquiry and emails it to the services inbox (services@nhaav.com). There is
 * deliberately no office-location block: Nhaav has no public offices to list.
 */
export const ContactSection: React.FC = () => {
  const { tokens: C } = useTheme();

  const [inquiryType, setInquiryType] = useState<InquiryType>('buyer');
  const [company, setCompany] = useState('');
  const [name, setName] = useState('');
  const [subject, setSubject] = useState<string>(SUBJECTS[0]);
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');

  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [reference, setReference] = useState('');

  /** "Schedule a demo" is the same form with the subject pre-picked. */
  const requestDemo = () => {
    setReference('');
    setError('');
    setSubject('Request a demo');
    document.getElementById('contact-form')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    document.getElementById('contact-name')?.focus({ preventScroll: true });
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!name.trim() || !email.trim()) {
      setError('Please add your contact name and email address.');
      return;
    }
    if (message.trim().length < 10) {
      setError('Please describe your requirement in at least 10 characters.');
      return;
    }

    setSending(true);
    try {
      const result = await supportService.sendContactEnquiry({
        name: name.trim(),
        email: email.trim(),
        company: company.trim() || undefined,
        phone: phone.trim() || undefined,
        inquiry_type: inquiryType,
        subject,
        message: message.trim(),
      });
      setReference(result.ticket_number);
    } catch {
      setError('We could not send your enquiry. Please try again, or email services@nhaav.com directly.');
    } finally {
      setSending(false);
    }
  };

  return (
    <section style={{ marginTop: 'clamp(3.5rem, 8vw, 6rem)', ...inter }}>
      <div style={wrap()}>
        <div style={{ textAlign: 'center', marginBottom: 'clamp(2rem, 5vw, 3rem)' }}>
          <h2
            style={{
              ...manrope,
              fontWeight: 900,
              fontSize: 'clamp(1.7rem, 3.6vw, 2.5rem)',
              letterSpacing: '-0.03em',
              color: YALE,
              margin: '0 0 0.4rem',
            }}
          >
            Feel free to contact us
          </h2>
          <p style={{ fontSize: '0.98rem', color: YALE, opacity: 0.8, margin: 0 }}>
            We will get back to you within 24hrs.
          </p>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(320px, 100%), 1fr))',
            gap: 'clamp(1.5rem, 4vw, 3rem)',
            alignItems: 'start',
          }}
        >
          {/* ── left: why get in touch ── */}
          <div>
            <h3
              style={{
                ...manrope,
                fontWeight: 900,
                fontSize: 'clamp(1.3rem, 2.4vw, 1.7rem)',
                letterSpacing: '-0.02em',
                color: YALE,
                margin: '0 0 1.5rem',
              }}
            >
              Let&apos;s talk.
            </h3>

            {TALKING_POINTS.map(point => (
              <div key={point.title} style={{ marginBottom: '1.4rem' }}>
                <h4
                  style={{
                    ...inter,
                    fontWeight: 700,
                    fontSize: '0.92rem',
                    color: YALE,
                    margin: '0 0 0.3rem',
                  }}
                >
                  {point.title}
                </h4>
                <p style={{ fontSize: '0.9rem', lineHeight: 1.7, color: YALE, opacity: 0.82, margin: 0 }}>
                  {point.text}
                </p>
              </div>
            ))}
          </div>

          {/* ── right: the form ── */}
          <div id="contact-form" style={{ ...cardSurface, border: `1px solid ${C.border}`, padding: 'clamp(1.25rem, 3vw, 2rem)' }}>
            {reference ? (
              <div style={{ textAlign: 'center', padding: '2rem 0.5rem' }}>
                <span
                  className="material-symbols-outlined"
                  aria-hidden="true"
                  style={{ fontSize: '2.6rem', color: YALE, display: 'block', marginBottom: '0.75rem' }}
                >
                  mark_email_read
                </span>
                <h3 style={{ ...manrope, fontWeight: 800, fontSize: '1.2rem', color: YALE, margin: '0 0 0.5rem' }}>
                  Enquiry sent
                </h3>
                <p style={{ fontSize: '0.9rem', lineHeight: 1.7, color: YALE, opacity: 0.85, margin: 0 }}>
                  Your reference is <strong>{reference}</strong>. Our services team will reply within 24 hours
                  at the address you gave.
                </p>
              </div>
            ) : (
              <form onSubmit={onSubmit} noValidate>
                {/* enquiry type */}
                <div style={{ display: 'flex', gap: 6, marginBottom: '1.4rem', flexWrap: 'wrap' }}>
                  {TABS.map(tab => {
                    const active = inquiryType === tab.id;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setInquiryType(tab.id)}
                        aria-pressed={active}
                        style={{
                          flex: '1 1 auto',
                          padding: '0.6rem 0.9rem',
                          borderRadius: 10,
                          border: `1px solid ${active ? YALE : 'rgba(13,59,102,0.22)'}`,
                          background: active ? YALE : 'transparent',
                          color: active ? CHIFFON : YALE,
                          fontSize: '0.8rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        {active ? '✓ ' : ''}
                        {tab.label}
                      </button>
                    );
                  })}
                </div>

                <div style={{ marginBottom: '1rem' }}>
                  <label style={fieldLabel} htmlFor="contact-company">
                    Company name
                  </label>
                  <input
                    id="contact-company"
                    style={fieldInput}
                    value={company}
                    onChange={e => setCompany(e.target.value)}
                    placeholder="Your company name"
                    autoComplete="organization"
                  />
                </div>

                <div style={{ marginBottom: '1rem' }}>
                  <label style={fieldLabel} htmlFor="contact-name">
                    Contact name <span style={{ color: '#B3261E' }}>*</span>
                  </label>
                  <input
                    id="contact-name"
                    style={fieldInput}
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="Your name"
                    autoComplete="name"
                    required
                  />
                </div>

                <div style={{ marginBottom: '1rem' }}>
                  <label style={fieldLabel} htmlFor="contact-subject">
                    Subject
                  </label>
                  <select
                    id="contact-subject"
                    style={fieldInput}
                    value={subject}
                    onChange={e => setSubject(e.target.value)}
                  >
                    {SUBJECTS.map(option => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ marginBottom: '1rem' }}>
                  <label style={fieldLabel} htmlFor="contact-email">
                    Email <span style={{ color: '#B3261E' }}>*</span>
                  </label>
                  <input
                    id="contact-email"
                    style={fieldInput}
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    autoComplete="email"
                    required
                  />
                </div>

                <div style={{ marginBottom: '1rem' }}>
                  <label style={fieldLabel} htmlFor="contact-phone">
                    Phone (optional)
                  </label>
                  <input
                    id="contact-phone"
                    style={fieldInput}
                    type="tel"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    placeholder="With country code"
                    autoComplete="tel"
                  />
                </div>

                <div style={{ marginBottom: '0.6rem' }}>
                  <label style={fieldLabel} htmlFor="contact-message">
                    Message <span style={{ color: '#B3261E' }}>*</span>
                  </label>
                  <textarea
                    id="contact-message"
                    style={{ ...fieldInput, minHeight: 120, resize: 'vertical' }}
                    value={message}
                    onChange={e => setMessage(e.target.value)}
                    placeholder="Tell us what you need, the port and the vessel"
                    required
                  />
                </div>

                <p style={{ fontSize: '0.74rem', color: YALE, opacity: 0.7, margin: '0 0 0.9rem' }}>
                  (*) Mandatory fields
                </p>

                {error && (
                  <p role="alert" style={{ fontSize: '0.82rem', color: '#B3261E', margin: '0 0 0.9rem' }}>
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={sending}
                  style={{
                    width: '100%',
                    padding: '0.9rem 1.2rem',
                    borderRadius: 12,
                    border: 'none',
                    background: YALE,
                    color: CHIFFON,
                    ...manrope,
                    fontSize: '0.92rem',
                    fontWeight: 800,
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                    cursor: sending ? 'default' : 'pointer',
                    opacity: sending ? 0.7 : 1,
                  }}
                >
                  {sending ? 'Sending…' : 'Submit'}
                </button>
              </form>
            )}
          </div>
        </div>

        {/* ── contact channels ── */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 'clamp(0.85rem, 2vw, 1.25rem)',
            marginTop: 'clamp(1.5rem, 4vw, 2.5rem)',
          }}
        >
          <div style={{ ...cardSurface, background: '#ffffff', border: `1px solid ${C.border}`, padding: '1.5rem', textAlign: 'center' }}>
            <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: '1.6rem', color: C.cyan }}>
              mail
            </span>
            <h3 style={{ ...manrope, fontWeight: 800, fontSize: '1rem', color: YALE, margin: '0.5rem 0 0.35rem' }}>Email Us</h3>
            <p style={{ fontSize: '0.85rem', lineHeight: 1.6, color: YALE, opacity: 0.8, margin: '0 0 0.75rem' }}>
              Submit an email and we will get back to you soon.
            </p>
            <a href="mailto:services@nhaav.com" style={{ color: C.cyan, fontSize: '0.85rem', fontWeight: 700, textDecoration: 'none' }}>
              services@nhaav.com
            </a>
          </div>

          <div style={{ ...cardSurface, background: '#ffffff', border: `1px solid ${C.border}`, padding: '1.5rem', textAlign: 'center' }}>
            <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: '1.6rem', color: C.cyan }}>
              calendar_month
            </span>
            <h3 style={{ ...manrope, fontWeight: 800, fontSize: '1rem', color: YALE, margin: '0.5rem 0 0.35rem' }}>Schedule a Demo</h3>
            <p style={{ fontSize: '0.85rem', lineHeight: 1.6, color: YALE, opacity: 0.8, margin: '0 0 0.75rem' }}>
              See the marketplace with your own ports and services.
            </p>
            <button
              type="button"
              onClick={requestDemo}
              style={{ background: 'none', border: 'none', padding: 0, color: C.cyan, fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer' }}
            >
              Request a demo
            </button>
          </div>

          <div style={{ ...cardSurface, background: '#ffffff', border: `1px solid ${C.border}`, padding: '1.5rem', textAlign: 'center' }}>
            <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: '1.6rem', color: C.cyan }}>
              schedule
            </span>
            <h3 style={{ ...manrope, fontWeight: 800, fontSize: '1rem', color: YALE, margin: '0.5rem 0 0.35rem' }}>Response Time</h3>
            <p style={{ fontSize: '0.85rem', lineHeight: 1.6, color: YALE, opacity: 0.8, margin: '0 0 0.75rem' }}>
              Every enquiry is read by the services team.
            </p>
            <span style={{ ...manrope, fontWeight: 800, fontSize: '0.95rem', color: YALE }}>Within 24 hours</span>
          </div>
        </div>
      </div>

    </section>
  );
};

export default ContactSection;
