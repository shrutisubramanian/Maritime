import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';
import { useIsMobile } from '../hooks/useIsMobile';
import { adminAuthService } from '../services/adminAuth';
import { BrandLogo } from './BrandLogo';
const M = "'Manrope', sans-serif";

interface SubItem {
  label: string;
  path: string;
}

interface NavItem {
  icon: string;
  label: string;
  path?: string;
  subItems?: SubItem[];
}

export const AdminSidebar: React.FC<{ activePath?: string }> = ({ activePath }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { tokens: C } = useTheme();
  const isMobile = useIsMobile();
  const currentPath = activePath || location.pathname;

  const [isOpen, setIsOpen] = useState<boolean>(() => {
    const saved = localStorage.getItem('nhaav_sidebar_open');
    return saved !== null ? saved === 'true' : true;
  });

  useEffect(() => {
    // On phones the sidebar is an overlay drawer: content offset stays 0
    // and the header keeps room for the floating menu button.
    const width = isOpen && !isMobile ? '256px' : '0px';
    const headerPaddingLeft = !isMobile && isOpen ? '2rem' : '4.5rem';
    document.documentElement.style.setProperty('--sidebar-width', width);
    document.documentElement.style.setProperty('--header-padding-left', headerPaddingLeft);
    localStorage.setItem('nhaav_sidebar_open', String(isOpen));
  }, [isOpen, isMobile]);

  const toggleSidebar = () => {
    setIsOpen(prev => !prev);
  };

  const navItems: NavItem[] = [
    { icon: 'dashboard', label: 'Dashboard', path: '/admin' },
    // Onboarding pipeline: who registered, and what still blocks each account.
    { icon: 'person_search', label: 'Accounts & Follow-up', path: '/admin/accounts' },
    // Two separate approval queues — keep clients and vendors apart.
    { icon: 'person_check', label: 'Client Approvals', path: '/admin/verification' },
    { icon: 'storefront', label: 'Vendor Approvals', path: '/admin/vendors' },
    { icon: 'description', label: 'Uploaded Documents', path: '/admin/documents' },
    { icon: 'group', label: 'All Profiles', path: '/admin/profiles' },
    { icon: 'storefront', label: 'Marketplace Control', path: '/admin/marketplace-services' },
    { icon: 'fact_check', label: 'Listing Moderation', path: '/admin/moderation' },
    { icon: 'anchor', label: 'Procurement Requests', path: '/admin/procurement' },
    { icon: 'account_balance', label: 'Pending Payments', path: '/admin/payments' },
    // Who is spending access passes, when, and how many remain.
    { icon: 'confirmation_number', label: 'Pass Usage', path: '/admin/pass-usage' },
    { icon: 'workspace_premium', label: 'Company Visibility', path: '/admin/profile-visibility' },
    { icon: 'payments', label: 'Listing Fees', path: '/admin/listing-fees' },
  ];

  const bottomItems: NavItem[] = [
    { icon: 'settings', label: 'Settings', path: '/settings' },
    { icon: 'logout', label: 'Sign Out', path: '/admin/login' },
  ];

  return (
    <>
      {/* Floating 3-Lines Button (Shown when sidebar is hidden) */}
      {!isOpen && (
        <button
          type="button"
          onClick={toggleSidebar}
          title="Open sidebar"
          style={{
            position: 'fixed',
            top: 14,
            left: 16,
            zIndex: 99,
            background: C.glass,
            border: `1px solid ${C.border}`,
            borderRadius: 8,
            width: 36,
            height: 36,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            color: C.cyan,
            boxShadow: C.shadowSm,
            backdropFilter: 'blur(8px)',
            transition: 'all 0.2s ease-in-out',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = C.cyan;
            e.currentTarget.style.color = 'var(--color-on-brand)';
            e.currentTarget.style.transform = 'scale(1.05)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = C.glass;
            e.currentTarget.style.color = C.cyan;
            e.currentTarget.style.transform = 'scale(1)';
          }}>
          <span className="material-symbols-outlined" style={{ fontSize: '1.3rem' }}>
            menu
          </span>
        </button>
      )}

      {/* Mobile scrim: tap to close the drawer */}
      <div
        className={`sidebar-scrim${isOpen && isMobile ? ' is-open' : ''}`}
        onClick={() => setIsOpen(false)}
      />

      {/* Main Sidebar Container */}
      <aside
        style={{
          position: 'fixed',
          left: 0,
          top: 0,
          bottom: 0,
          width: 256,
          zIndex: 80,
          background: C.bgLow,
          display: 'flex',
          flexDirection: 'column',
          padding: '1.25rem 0.85rem',
          borderRight: `1px solid ${C.border}`,
          boxSizing: 'border-box',
          overflowY: 'auto',
          transform: isOpen ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          boxShadow: isOpen ? '8px 0 24px rgba(0,0,0,0.08)' : 'none',
        }}>
        {/* Brand Header & 3-Lines Close Button */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0.5rem 0.25rem',
            marginBottom: '1.75rem',
          }}>
          <div
            onClick={() => navigate('/admin')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              cursor: 'pointer',
            }}>
            <div>
              <BrandLogo height={28} />
              <p style={{ fontSize: '0.55rem', textTransform: 'uppercase', letterSpacing: '0.18em', color: C.muted, fontWeight: 600, margin: '3px 0 0', whiteSpace: 'nowrap' }}>
                Maritime Admin
              </p>
            </div>
          </div>

          {/* 3-Lines Button to Hide Sidebar */}
          <button
            type="button"
            onClick={toggleSidebar}
            title="Hide sidebar"
            style={{
              background: C.glass,
              border: `1px solid ${C.border}`,
              borderRadius: 8,
              width: 32,
              height: 32,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: C.cyan,
              flexShrink: 0,
              transition: 'all 0.2s',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(76,157,176,0.1)')}
            onMouseLeave={e => (e.currentTarget.style.background = C.glass)}>
            <span className="material-symbols-outlined" style={{ fontSize: '1.25rem' }}>
              menu
            </span>
          </button>
        </div>

        {/* Main Nav */}
        <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {navItems.map(item => {
            const isParentActive = item.path === currentPath;

            return (
              <a
                key={item.label}
                href="#"
                onClick={e => {
                  e.preventDefault();
                  if (item.path) navigate(item.path);
                  if (isMobile) setIsOpen(false);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  padding: '0.6rem 0.75rem',
                  borderRadius: 8,
                  textDecoration: 'none',
                  color: isParentActive ? C.primary : C.muted,
                  background: isParentActive ? 'rgba(76,157,176,0.08)' : 'transparent',
                  fontWeight: isParentActive ? 700 : 500,
                  transition: 'all 0.2s',
                }}>
                <span className="material-symbols-outlined" style={{ fontSize: '1.2rem', color: isParentActive ? C.cyan : C.muted, flexShrink: 0 }}>
                  {item.icon}
                </span>
                <span style={{ fontSize: '0.85rem', whiteSpace: 'nowrap' }}>{item.label}</span>
              </a>
            );
          })}
        </nav>

        {/* CTA Button */}
        <div style={{ marginTop: '1rem' }}>
          <button
            onClick={() => navigate('/admin/verification')}
            style={{
              width: '100%',
              padding: '0.65rem 1rem',
              // Solid brand fill (not a gradient) so the on-brand ink keeps its
              // contrast pair: white on Yale in light, deep ink on the lighter
              // Moonstone accent in dark.
              background: 'var(--color-brand)',
              color: 'var(--color-on-brand)',
              border: 'none',
              borderRadius: 10,
              fontFamily: M,
              fontWeight: 700,
              fontSize: '0.8rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              boxShadow: '0 4px 12px rgba(76,157,176,0.25)',
              transition: 'filter 0.2s',
            }}
            onMouseEnter={e => (e.currentTarget.style.filter = 'brightness(1.1)')}
            onMouseLeave={e => (e.currentTarget.style.filter = 'brightness(1)')}>
            {/* Explicit ink: the glyph must stay Morning Dawn on the Yale fill. */}
            <span className="material-symbols-outlined" style={{ fontSize: '1.1rem', color: '#FFF36D' }}>verified_user</span>
            Verify New Account
          </button>
        </div>

        {/* Footer Nav */}
        <div style={{ paddingTop: '1rem', marginTop: '0.75rem', borderTop: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {bottomItems.map(item => (
            <a
              key={item.label}
              href="#"
              onClick={e => {
                e.preventDefault();
                // Sign out must clear the admin JWT before redirecting.
                if (item.label === 'Sign Out') {
                  adminAuthService.logout();
                }
                if (item.path) navigate(item.path);
                if (isMobile) setIsOpen(false);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                padding: '0.55rem 0.75rem',
                borderRadius: 8,
                textDecoration: 'none',
                color: C.muted,
                fontSize: '0.85rem',
                fontWeight: 500,
                transition: 'all 0.2s',
              }}>
              <span className="material-symbols-outlined" style={{ fontSize: '1.15rem', flexShrink: 0 }}>
                {item.icon}
              </span>
              <span style={{ whiteSpace: 'nowrap' }}>{item.label}</span>
            </a>
          ))}
        </div>
      </aside>
    </>
  );
};

export default AdminSidebar;

