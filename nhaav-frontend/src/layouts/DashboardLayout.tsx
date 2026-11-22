import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Navbar } from '../components/Navbar';
import { Sidebar } from '../components/Sidebar';

export const DashboardLayout: React.FC = () => {
  // On phones the sidebar is an overlay drawer (same pattern as the role
  // sidebars), so navigation has to be opened from the navbar.
  const [navOpen, setNavOpen] = useState(false);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--bg-primary)' }}>
      <Navbar onMenuClick={() => setNavOpen(true)} />
      <div style={{ display: 'flex', flex: 1 }}>
        <Sidebar open={navOpen} onClose={() => setNavOpen(false)} />
        <div
          className={`sidebar-scrim${navOpen ? ' is-open' : ''}`}
          onClick={() => setNavOpen(false)}
        />
        <main style={{ flex: 1, minWidth: 0, padding: '2rem', overflowY: 'auto', maxHeight: 'calc(100vh - 64px)' }}>
          <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};
