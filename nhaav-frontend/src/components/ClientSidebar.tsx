import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../context/ThemeContext';
import { useIsMobile } from '../hooks/useIsMobile';
import { ConfirmationModal } from './ConfirmationModal';
import { BrandLogo } from './BrandLogo';

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

const M = "'Manrope', sans-serif";

export const ClientSidebar: React.FC<{ activePath?: string }> = ({ activePath }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const currentPath = activePath || location.pathname;
  const { logout } = useAuth();
  const { tokens: C, isDark, toggleTheme } = useTheme();
  const isMobile = useIsMobile();

  const [isOpen, setIsOpen] = useState<boolean>(() => {
    const saved = localStorage.getItem('nhaav_sidebar_open');
    return saved !== null ? saved === 'true' : true;
  });

  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);

  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    'Marketplace': currentPath.includes('/marketplace'),
    'Procurement Requests': currentPath.includes('/create-request') || currentPath.includes('/request'),
    'Quotations': currentPath.includes('/compare-quotations'),
    'Jobs': currentPath.includes('/orders') || currentPath.includes('/jobs'),
    'Documents': currentPath.includes('/verification'),
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

  const toggleExpand = (label: string) => {
    setExpanded(prev => ({ ...prev, [label]: !prev[label] }));
  };

  const navItems: NavItem[] = [
    { icon: 'dashboard', label: 'Dashboard', path: '/ship-owner' },
    {
      icon: 'storefront',
      label: 'Marketplace',
      subItems: [
        { label: 'Browse Services', path: '/marketplace/repairs' },
        { label: 'Browse Supplies', path: '/marketplace/stores' },
      ],
    },
    {
      icon: 'assignment',
      label: 'Procurement Requests',
      subItems: [
        { label: 'Active Requests', path: '/create-request' },
        { label: 'Draft Requests', path: '/create-request' },
        { label: 'Closed Requests', path: '/create-request' },
      ],
    },
    {
      icon: 'request_quote',
      label: 'Quotations',
      subItems: [
        { label: 'Received Quotations', path: '/compare-quotations' },
        { label: 'Compare Quotations', path: '/compare-quotations' },
        { label: 'Accepted Quotations', path: '/compare-quotations' },
      ],
    },
    {
      icon: 'work',
      label: 'Jobs',
      subItems: [
        { label: 'Ongoing Jobs', path: '/orders' },
        { label: 'Completed Jobs', path: '/orders' },
      ],
    },
    {
      icon: 'folder_open',
      label: 'Documents',
      subItems: [
        { label: 'Upload Documents', path: '/verification' },
        { label: 'My Documents', path: '/verification' },
        { label: 'Verification Status', path: '/verification' },
      ],
    },
    { icon: 'notifications', label: 'Notifications', path: '/notifications' },
    { icon: 'star', label: 'Reviews', path: '/company-profile' },
  ];

  const bottomItems: NavItem[] = [
    { icon: 'person', label: 'Profile', path: '/company-profile' },
    { icon: 'account_balance', label: 'Billing & Access', path: '/payments' },
    { icon: 'settings', label: 'Settings', path: '/settings' },
    { icon: 'logout', label: 'Logout', path: '/login' },
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
            border: `1px solid ${C.cyanDim}`,
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
          transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), background 0.3s ease',
          boxShadow: isOpen ? C.shadowMd : 'none',
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
            onClick={() => navigate('/ship-owner')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              cursor: 'pointer',
            }}>
            <div>
              <BrandLogo height={28} />
              <p style={{ fontSize: '0.55rem', textTransform: 'uppercase', letterSpacing: '0.18em', color: C.dim, fontWeight: 600, margin: '3px 0 0', whiteSpace: 'nowrap' }}>
                Ship Owner
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
            }}              onMouseEnter={e => (e.currentTarget.style.background = C.cyanDim)}
            onMouseLeave={e => (e.currentTarget.style.background = C.glass)}>
            <span className="material-symbols-outlined" style={{ fontSize: '1.25rem' }}>
              menu
            </span>
          </button>
        </div>

        {/* Main Nav */}
        <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {navItems.map(item => {
            const isParentActive = item.path === currentPath || (item.subItems && item.subItems.some(s => s.path === currentPath));
            const isExp = expanded[item.label];

            if (item.subItems) {
              return (
                <div key={item.label} style={{ display: 'flex', flexDirection: 'column' }}>
                  <button
                    type="button"
                    onClick={() => toggleExpand(item.label)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      width: '100%',
                      padding: '0.6rem 0.75rem',
                      borderRadius: 8,
                      border: 'none',
                      background: isParentActive ? C.primaryDim : 'transparent',
                      color: isParentActive ? C.primary : C.muted,
                      fontWeight: isParentActive ? 700 : 500,
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      textAlign: 'left',
                    }}
                    aria-expanded={isExp}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: '1.2rem', color: isParentActive ? C.cyan : C.muted, flexShrink: 0 }}>
                        {item.icon}
                      </span>
                      <span style={{ fontSize: '0.85rem', whiteSpace: 'nowrap' }}>{item.label}</span>
                    </div>
                    <span
                      className="material-symbols-outlined"
                      style={{ fontSize: '1rem', color: C.dim, transform: isExp ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                      expand_more
                    </span>
                  </button>

                  {isExp && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, paddingLeft: '2.5rem', marginTop: 2, marginBottom: 4 }}>
                      {item.subItems.map(sub => {
                        const isSubActive = currentPath === sub.path;
                        return (
                          <a
                            key={sub.label}
                            href="#"
                            onClick={e => {
                              e.preventDefault();
                              navigate(sub.path);
                              if (isMobile) setIsOpen(false);
                            }}
                            style={{
                              padding: '0.4rem 0.6rem',
                              borderRadius: 6,
                              textDecoration: 'none',
                              fontSize: '0.78rem',
                              color: isSubActive ? C.cyan : C.dim,
                              fontWeight: isSubActive ? 700 : 500,
                              background: isSubActive ? C.cyanDim : 'transparent',
                              transition: 'all 0.2s',
                              whiteSpace: 'nowrap',
                            }}>
                            {sub.label}
                          </a>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            }

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
                  background: isParentActive ? C.primaryDim : 'transparent',
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

        {/* Theme Toggle */}
        <div style={{ paddingTop: '0.5rem', paddingBottom: '0.25rem' }}>
          <button
            type="button"
            onClick={toggleTheme}
            title={`Switch to ${isDark ? 'Light' : 'Dark'} Mode`}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              padding: '0.55rem 0.75rem',
              width: '100%',
              borderRadius: 8,
              border: 'none',
              background: C.cyanDim,
              color: C.cyan,
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '0.85rem',
              transition: 'all 0.2s',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = isDark ? 'rgba(76,157,176,0.2)' : 'rgba(76,157,176,0.15)')}
            onMouseLeave={e => (e.currentTarget.style.background = C.cyanDim)}>
            <span className="material-symbols-outlined" style={{ fontSize: '1.15rem' }}>
              {isDark ? 'light_mode' : 'dark_mode'}
            </span>
            <span>{isDark ? 'Light Mode' : 'Dark Mode'}</span>
          </button>
        </div>

        {/* Footer Nav */}
        <div style={{ paddingTop: '0.75rem', marginTop: '0.25rem', borderTop: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {bottomItems.map(item => (
            <a
              key={item.label}
              href="#"
              onClick={e => {
                e.preventDefault();
                // Logging out CONSUMES the caller's current access pass, so it
                // is confirmed first rather than firing on a stray click.
                if (item.label === 'Logout') {
                  setLogoutConfirmOpen(true);
                  if (isMobile) setIsOpen(false);
                  return;
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

      <ConfirmationModal
        isOpen={logoutConfirmOpen}
        title="Log out of Nhaav?"
        message="Your current access pass will be consumed when you log out. Signing back in will use another pass from your account's balance."
        confirmText="Log out"
        cancelText="Stay signed in"
        isDestructive
        onConfirm={() => {
          setLogoutConfirmOpen(false);
          logout();
          navigate('/login');
        }}
        onCancel={() => setLogoutConfirmOpen(false)}
      />
    </>
  );
};

export default ClientSidebar;
