import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Anchor, Bell, Menu, Search, User as UserIcon, LogOut } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { BrandLogo } from './BrandLogo';

interface NavbarProps {
  /** Phone-only: opens the sidebar drawer. */
  onMenuClick?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onMenuClick }) => {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <nav
      style={{
        height: '64px',
        backgroundColor: 'var(--bg-glass)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid var(--border-color)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 1.5rem',
        position: 'sticky',
        top: 0,
        zIndex: 40
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
        {/* Phone-only: opens the sidebar drawer (hidden from 769px up). */}
        <button
          type="button"
          className="legacy-menu-btn"
          onClick={onMenuClick}
          aria-label="Open navigation menu"
          style={{ display: 'none', alignItems: 'center', justifyContent: 'center', width: 40, height: 40, borderRadius: 10, background: 'var(--bg-surface)', border: '1px solid var(--border-color)', color: 'var(--text-main)', cursor: 'pointer', flexShrink: 0 }}
        >
          <Menu size={20} />
        </button>

      {/* Brand Logo */}
      <Link to="/dashboard" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: 'var(--text-main)', minWidth: 0 }}>
        <div>
          <BrandLogo height={30} />
          <span style={{ fontSize: '0.65rem', display: 'block', color: 'var(--accent-cyan)', fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase', marginTop: '3px' }}>MARITIME OCR</span>
        </div>
      </Link>
      </div>

      {/* Global Search Bar (hidden on phones: no room for a 320px field) */}
      <div className="legacy-navbar-search" style={{ display: 'flex', alignItems: 'center', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-full)', padding: '0.4rem 1rem', width: '320px', minWidth: 0, gap: '0.5rem' }}>
        <Search size={16} style={{ color: 'var(--text-dim)' }} />
        <input
          type="text"
          placeholder="Search invoices, B/Ls, vessels..."
          style={{ background: 'transparent', border: 'none', color: 'var(--text-main)', outline: 'none', fontSize: '0.85rem', width: '100%' }}
        />
      </div>

      {/* User Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
        <button style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', position: 'relative', display: 'flex' }}>
          <Bell size={20} />
          <span style={{ position: 'absolute', top: '-2px', right: '-2px', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--accent-cyan)' }} />
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', borderLeft: '1px solid var(--border-color)', paddingLeft: '1.25rem' }}>
          <div style={{ width: '34px', height: '34px', borderRadius: '50%', backgroundColor: 'var(--bg-surface-hover)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--border-color)', color: 'var(--accent-primary)' }}>
            <UserIcon size={18} />
          </div>
          <div className="legacy-navbar-user-meta" style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{user?.full_name || user?.name || 'Authorized User'}</span>
            <span style={{ fontSize: '0.725rem', color: 'var(--text-dim)' }}>{user?.role || 'Port Administrator'}</span>
          </div>
          <button
            onClick={handleLogout}
            title="Logout"
            style={{ background: 'transparent', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', marginLeft: '0.5rem', display: 'flex' }}
          >
            <LogOut size={18} />
          </button>
        </div>
      </div>
    </nav>
  );
};
