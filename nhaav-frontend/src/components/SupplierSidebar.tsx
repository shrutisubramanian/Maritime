import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../context/ThemeContext';
import { useIsMobile } from '../hooks/useIsMobile';
import { ConfirmationModal } from './ConfirmationModal';
import { BrandLogo } from './BrandLogo';

const M = "'Manrope', sans-serif";

interface SubItem { label: string; path: string; }
interface NavItem { icon: string; label: string; path?: string; subItems?: SubItem[]; }

const navItems: NavItem[] = [
  { icon: 'dashboard', label: 'Dashboard', path: '/supplier-dashboard' },
  {
    icon: 'inventory_2',
    label: 'My Supplies',
    subItems: [
      { label: 'My Catalog', path: '/supplier/catalog' },
      { label: 'Add Listing', path: '/supplier/add-listing' },
    ],
  },
  { icon: 'travel_explore', label: 'Procurement Requests', path: '/procurement-opportunities' },
  { icon: 'request_quote', label: 'My Quotations', path: '/my-quotations' },
  { icon: 'notifications', label: 'Notifications', path: '/notifications' },
  { icon: 'storefront', label: 'Company Profile', path: '/company-profile' },
];

const bottomItems: NavItem[] = [
  { icon: 'account_balance', label: 'Billing & Access', path: '/payments' },
  { icon: 'settings', label: 'Settings', path: '/settings' },
  { icon: 'logout', label: 'Logout', path: '/login' },
];

export const SupplierSidebar: React.FC<{ activePath?: string }> = ({ activePath }) => {
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
    'My Supplies': currentPath.includes('/supplier/catalog') || currentPath.includes('/supplier/add-listing'),
  });

  useEffect(() => {
    const width = isOpen && !isMobile ? '256px' : '0px';
    const headerPaddingLeft = !isMobile && isOpen ? '2rem' : '4.5rem';
    document.documentElement.style.setProperty('--sidebar-width', width);
    document.documentElement.style.setProperty('--header-padding-left', headerPaddingLeft);
    localStorage.setItem('nhaav_sidebar_open', String(isOpen));
  }, [isOpen, isMobile]);

  const go = (path?: string) => { if (path) navigate(path); if (isMobile) setIsOpen(false); };

  return (
    <>
      {!isOpen && (
        <button type="button" onClick={() => setIsOpen(true)} title="Open sidebar"
          style={{ position: 'fixed', top: 14, left: 16, zIndex: 99, background: C.glass, border: `1px solid ${C.cyanDim}`, borderRadius: 8, width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: C.cyan, boxShadow: C.shadowSm }}>
          <span className="material-symbols-outlined" style={{ fontSize: '1.3rem' }}>menu</span>
        </button>
      )}
      <div className={`sidebar-scrim${isOpen && isMobile ? ' is-open' : ''}`} onClick={() => setIsOpen(false)} />
      <aside style={{ position: 'fixed', left: 0, top: 0, bottom: 0, width: 256, zIndex: 80, background: C.bgLow, display: 'flex', flexDirection: 'column', padding: '1.25rem 0.85rem', borderRight: `1px solid ${C.border}`, boxSizing: 'border-box', overflowY: 'auto', transform: isOpen ? 'translateX(0)' : 'translateX(-100%)', transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), background 0.3s ease', boxShadow: isOpen ? C.shadowMd : 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0.25rem', marginBottom: '1.75rem' }}>
          <div onClick={() => navigate('/supplier-dashboard')} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}>
            <div>
              <BrandLogo height={28} />
              <p style={{ fontSize: '0.55rem', textTransform: 'uppercase', letterSpacing: '0.18em', color: C.dim, fontWeight: 600, margin: '3px 0 0' }}>Supplier Hub</p>
            </div>
          </div>
          <button type="button" onClick={() => setIsOpen(false)} title="Hide sidebar"
            style={{ background: C.glass, border: `1px solid ${C.border}`, borderRadius: 8, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: C.cyan }}>
            <span className="material-symbols-outlined" style={{ fontSize: '1.25rem' }}>menu</span>
          </button>
        </div>

        <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {navItems.map(item => {
            const isParentActive = item.path === currentPath || (item.subItems?.some(s => s.path === currentPath) ?? false);
            if (item.subItems) {
              const isExp = expanded[item.label];
              return (
                <div key={item.label} style={{ display: 'flex', flexDirection: 'column' }}>
                  <button type="button" onClick={() => setExpanded(p => ({ ...p, [item.label]: !p[item.label] }))}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '0.6rem 0.75rem', borderRadius: 8, border: 'none', background: isParentActive ? C.primaryDim : 'transparent', color: isParentActive ? C.primary : C.muted, fontWeight: isParentActive ? 700 : 500, cursor: 'pointer', textAlign: 'left' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: '1.2rem', color: isParentActive ? C.cyan : C.muted }}>{item.icon}</span>
                      <span style={{ fontSize: '0.85rem' }}>{item.label}</span>
                    </div>
                    <span className="material-symbols-outlined" style={{ fontSize: '1rem', color: C.dim, transform: isExp ? 'rotate(180deg)' : 'none' }}>expand_more</span>
                  </button>
                  {isExp && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, paddingLeft: '2.5rem', marginTop: 2, marginBottom: 4 }}>
                      {item.subItems.map(sub => (
                        <a key={sub.label} href="#" onClick={e => { e.preventDefault(); go(sub.path); }}
                          style={{ padding: '0.4rem 0.6rem', borderRadius: 6, textDecoration: 'none', fontSize: '0.78rem', color: currentPath === sub.path ? C.cyan : C.dim, fontWeight: currentPath === sub.path ? 700 : 500 }}>
                          {sub.label}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              );
            }
            return (
              <a key={item.label} href="#" onClick={e => { e.preventDefault(); go(item.path); }}
                style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.6rem 0.75rem', borderRadius: 8, textDecoration: 'none', color: isParentActive ? C.primary : C.muted, background: isParentActive ? C.primaryDim : 'transparent', fontWeight: isParentActive ? 700 : 500 }}>
                <span className="material-symbols-outlined" style={{ fontSize: '1.2rem', color: isParentActive ? C.cyan : C.muted }}>{item.icon}</span>
                <span style={{ fontSize: '0.85rem' }}>{item.label}</span>
              </a>
            );
          })}
        </nav>

        <div style={{ paddingTop: '0.5rem', paddingBottom: '0.25rem' }}>
          <button type="button" onClick={toggleTheme} title={`Switch to ${isDark ? 'Light' : 'Dark'} Mode`}
            style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.55rem 0.75rem', width: '100%', borderRadius: 8, border: 'none', background: C.cyanDim, color: C.cyan, cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '1.15rem' }}>{isDark ? 'light_mode' : 'dark_mode'}</span>
            <span>{isDark ? 'Light Mode' : 'Dark Mode'}</span>
          </button>
        </div>

        <div style={{ paddingTop: '0.75rem', marginTop: '0.25rem', borderTop: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {bottomItems.map(item => (
            <a key={item.label} href="#" onClick={e => {
              e.preventDefault();
              // Logging out CONSUMES the caller's current access pass, so it is
              // confirmed first rather than firing on a stray click.
              if (item.label === 'Logout') { setLogoutConfirmOpen(true); if (isMobile) setIsOpen(false); return; }
              go(item.path);
            }}
              style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.55rem 0.75rem', borderRadius: 8, textDecoration: 'none', color: C.muted, fontSize: '0.85rem', fontWeight: 500 }}>
              <span className="material-symbols-outlined" style={{ fontSize: '1.15rem' }}>{item.icon}</span>
              <span>{item.label}</span>
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

export default SupplierSidebar;
