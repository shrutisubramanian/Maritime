import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, UploadCloud, FileSearch, ShieldCheck, UserCheck, HelpCircle } from 'lucide-react';

export const Sidebar: React.FC = () => {
  const navItems = [
    { label: 'Dashboard', path: '/dashboard', icon: <LayoutDashboard size={20} /> },
    { label: 'Upload Documents', path: '/upload', icon: <UploadCloud size={20} /> },
    { label: 'OCR Inspection', path: '/ocr-result', icon: <FileSearch size={20} /> },
    { label: 'Admin Panel', path: '/admin', icon: <ShieldCheck size={20} /> },
    { label: 'My Profile', path: '/profile', icon: <UserCheck size={20} /> },
  ];

  return (
    <aside
      style={{
        width: '240px',
        backgroundColor: 'var(--bg-glass)',
        borderRight: '1px solid var(--border-color)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '1.25rem 0.85rem',
        minHeight: 'calc(100vh - 64px)'
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <div style={{ padding: '0 0.5rem 0.5rem 0.5rem', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-dim)', letterSpacing: '0.05em' }}>
          MAIN MENU
        </div>
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            style={({ isActive }) => ({
              display: 'flex',
              alignItems: 'center',
              gap: '0.85rem',
              padding: '0.65rem 0.85rem',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.9rem',
              fontWeight: isActive ? 600 : 400,
              color: isActive ? 'var(--text-main)' : 'var(--text-muted)',
              backgroundColor: isActive ? 'var(--bg-surface-hover)' : 'transparent',
              borderLeft: isActive ? '3px solid var(--accent-primary)' : '3px solid transparent',
              transition: 'all 0.2s ease'
            })}
          >
            {item.icon}
            <span>{item.label}</span>
          </NavLink>
        ))}
      </div>

      {/* Footer info card in sidebar */}
      <div style={{ padding: '1rem', backgroundColor: 'var(--bg-surface)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--accent-cyan)', fontSize: '0.825rem', fontWeight: 600 }}>
          <HelpCircle size={16} /> Need Support?
        </div>
        <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
          Contact Maritime OCR parser support or view documentation.
        </p>
      </div>
    </aside>
  );
};
