import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Anchor, Bell, Search, User as UserIcon, LogOut } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

export const Navbar: React.FC = () => {
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
      {/* Brand Logo */}
      <Link to="/dashboard" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: 'var(--text-main)' }}>
        <div style={{
          width: '38px',
          height: '38px',
          borderRadius: 'var(--radius-sm)',
          background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-cyan))',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'white',
          boxShadow: 'var(--shadow-glow)'
        }}>
          <Anchor size={22} />
        </div>
        <div>
          <span style={{ fontWeight: 800, fontSize: '1.2rem', letterSpacing: '-0.02em' }}>HORIZON</span>
          <span style={{ fontSize: '0.7rem', display: 'block', color: 'var(--accent-cyan)', fontWeight: 600, marginTop: '-3px' }}>MARITIME OCR</span>
        </div>
      </Link>

      {/* Global Search Bar */}
      <div style={{ display: 'flex', alignItems: 'center', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-full)', padding: '0.4rem 1rem', width: '320px', gap: '0.5rem' }}>
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
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{user?.name || 'Authorized User'}</span>
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
