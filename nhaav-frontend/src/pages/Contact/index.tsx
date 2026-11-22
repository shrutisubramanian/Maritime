import React from 'react';
import { useTheme } from '../../context/ThemeContext';
import { HeaderNav } from '../../components/HeaderNav';
import { FooterNav } from '../../components/FooterNav';
import { ContactSection } from '../../components/ContactSection';

/**
 * Public "Contact Us" page.
 *
 * The form itself lives in ContactSection so this page and the end of the
 * Services page cannot drift apart: both post to /support/contact, which stores
 * the enquiry and emails services@nhaav.com.
 */
const ContactPage: React.FC = () => {
  const { tokens: C } = useTheme();

  return (
    <div
      style={{
        background: C.bg,
        color: C.text,
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <HeaderNav glass />

      <main style={{ flex: 1, padding: 'clamp(6.5rem, 12vw, 9rem) 0 4rem' }}>
        <ContactSection />
      </main>

      <FooterNav />
    </div>
  );
};

export default ContactPage;
