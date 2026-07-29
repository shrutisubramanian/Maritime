import React from 'react';
import { Outlet, Link } from 'react-router-dom';
import { Anchor, Shield, Cpu, FileCheck } from 'lucide-react';

export const AuthLayout: React.FC = () => {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', backgroundColor: 'var(--bg-primary)' }}>
      {/* Left Branding Hero Banner */}
      <div
        style={{
          flex: 1,
          background: 'linear-gradient(135deg, #0b1528 0%, #112240 100%)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '3rem',
          borderRight: '1px solid var(--border-color)',
          position: 'relative',
          overflow: 'hidden'
        }}
      >
        <div style={{ position: 'absolute', top: '-10%', right: '-10%', width: '400px', height: '400px', background: 'radial-gradient(circle, rgba(14, 165, 233, 0.15) 0%, transparent 70%)', borderRadius: '50%' }} />

        <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: 'var(--text-main)', zIndex: 10 }}>
          <div style={{ width: '42px', height: '42px', borderRadius: 'var(--radius-sm)', background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-cyan))', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', boxShadow: 'var(--shadow-glow)' }}>
            <Anchor size={24} />
          </div>
          <div>
            <span style={{ fontWeight: 800, fontSize: '1.4rem', letterSpacing: '-0.02em' }}>HORIZON</span>
            <span style={{ fontSize: '0.75rem', display: 'block', color: 'var(--accent-cyan)', fontWeight: 600 }}>MARITIME OCR SYSTEM</span>
          </div>
        </Link>

        <div style={{ zIndex: 10, maxWidth: '500px' }}>
          <h1 style={{ fontSize: '2.5rem', fontWeight: 800, lineHeight: 1.2, marginBottom: '1rem', background: 'linear-gradient(135deg, #ffffff, var(--accent-primary))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            Next-Gen Maritime Document Parsing
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '1.05rem', marginBottom: '2rem' }}>
            Automate processing for Bills of Lading, Commercial Invoices, Non-PE Certificates, and Port Manifests with AI accuracy.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: 'var(--text-main)' }}>
              <Cpu style={{ color: 'var(--accent-cyan)' }} size={20} />
              <span>Deep Learning Bounding Box Extraction</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: 'var(--text-main)' }}>
              <Shield style={{ color: 'var(--accent-emerald)' }} size={20} />
              <span>Enterprise Grade Compliance Verification</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: 'var(--text-main)' }}>
              <FileCheck style={{ color: 'var(--accent-purple)' }} size={20} />
              <span>Automated Regex & Key-Value Parsing</span>
            </div>
          </div>
        </div>

        <div style={{ fontSize: '0.825rem', color: 'var(--text-dim)', zIndex: 10 }}>
          &copy; 2026 Horizon Maritime Technologies. All rights reserved.
        </div>
      </div>

      {/* Right Form Outlet Container */}
      <div style={{ flex: '0 0 520px', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2.5rem' }}>
        <div style={{ width: '100%' }}>
          <Outlet />
        </div>
      </div>
    </div>
  );
};
