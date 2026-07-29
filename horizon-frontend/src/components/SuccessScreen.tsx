import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

const C = {
  bg:        '#0d141d',
  bgCardH:   '#242a34',
  bgLow:     '#151c26',
  border:    'rgba(255,255,255,0.05)',
  text:      '#dce3f0',
  muted:     '#c4c6ce',
  slate:     '#64748b',
  cyan:      '#4cd6ff',
  dim:       '#8e9098',
  white:     '#ffffff',
  primary:   '#9ccaff',
  green:     '#22c55e',
};

const fonts = { manrope: "'Manrope', sans-serif", inter: "'Inter', sans-serif" };

export const SuccessScreen: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [show, setShow] = useState(false);

  // Read state from location (passed via navigate('/success', { state: { type: 'quote_submitted' } }))
  const type = location.state?.type || 'default';

  useEffect(() => {
    // Small timeout to trigger animations
    setTimeout(() => setShow(true), 50);
  }, []);

  const config: Record<string, { title: string; subtitle: string; actionText: string; actionPath: string }> = {
    quote_submitted: {
      title: 'Quotation Submitted',
      subtitle: 'Your competitive quotation has been successfully submitted to the client. You will be notified once they review it.',
      actionText: 'View My Quotations',
      actionPath: '/dashboard'
    },
    request_created: {
      title: 'Request Created',
      subtitle: 'Your procurement request is now live. Verified providers will begin submitting quotations shortly.',
      actionText: 'Go to Dashboard',
      actionPath: '/procurement'
    },
    service_published: {
      title: 'Service Published',
      subtitle: 'Your service offering is now publicly listed in the Horizon Marketplace.',
      actionText: 'View Dashboard',
      actionPath: '/dashboard'
    },
    profile_updated: {
      title: 'Profile Updated',
      subtitle: 'Your company profile information has been successfully saved and is now public.',
      actionText: 'Back to Dashboard',
      actionPath: '/dashboard'
    },
    default: {
      title: 'Action Successful',
      subtitle: 'Your requested action has been completed successfully.',
      actionText: 'Return Home',
      actionPath: '/'
    }
  };

  const currentConfig = config[type] || config.default;

  return (
    <div style={{
      background: C.bg, minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', fontFamily: fonts.inter, color: C.text,
      padding: '2rem'
    }}>
      <style>{`
        @keyframes scaleUp {
          0% { transform: scale(0); opacity: 0; }
          60% { transform: scale(1.1); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div style={{
        background: C.bgLow, padding: '4rem 3rem', borderRadius: 32, border: `1px solid ${C.border}`,
        display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center',
        maxWidth: 500, width: '100%', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
        opacity: show ? 1 : 0, transform: show ? 'translateY(0)' : 'translateY(20px)',
        transition: 'all 0.6s cubic-bezier(0.16, 1, 0.3, 1)'
      }}>
        {/* Animated Checkmark */}
        <div style={{
          width: 80, height: 80, borderRadius: '50%', background: 'rgba(34, 197, 94, 0.1)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '2rem',
          animation: show ? 'scaleUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards' : 'none',
          animationDelay: '0.2s', opacity: 0
        }}>
          <span className="material-symbols-outlined" style={{ fontSize: '3rem', color: C.green }}>check_circle</span>
        </div>

        <h1 style={{
          fontFamily: fonts.manrope, fontSize: '2rem', fontWeight: 800, color: C.white,
          margin: '0 0 1rem', opacity: 0, animation: show ? 'slideUp 0.6s forwards' : 'none',
          animationDelay: '0.4s'
        }}>
          {currentConfig.title}
        </h1>

        <p style={{
          fontSize: '1rem', color: C.slate, margin: '0 0 3rem', lineHeight: 1.6,
          opacity: 0, animation: show ? 'slideUp 0.6s forwards' : 'none',
          animationDelay: '0.5s'
        }}>
          {currentConfig.subtitle}
        </p>

        <button
          onClick={() => navigate(currentConfig.actionPath)}
          style={{
            padding: '1rem 2.5rem', borderRadius: 16, background: C.cyan, color: '#001f28',
            fontWeight: 800, fontSize: '1rem', border: 'none', cursor: 'pointer',
            boxShadow: '0 10px 30px rgba(0,209,255,0.25)', transition: 'all 0.2s',
            opacity: 0, animation: show ? 'slideUp 0.6s forwards' : 'none',
            animationDelay: '0.6s'
          }}
          onMouseEnter={e => {
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = '0 15px 35px rgba(0,209,255,0.35)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.transform = 'none';
            e.currentTarget.style.boxShadow = '0 10px 30px rgba(0,209,255,0.25)';
          }}
        >
          {currentConfig.actionText}
        </button>
      </div>
    </div>
  );
};
