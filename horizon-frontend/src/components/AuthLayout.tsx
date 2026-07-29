import React, { ReactNode, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

export interface AuthLayoutProps {
  readonly children: ReactNode;
  readonly title: string;
  readonly subtitle: string;
}

/* ── floating particles ──────────────────────────────────────── */
interface Particle {
  id: number; size: number; left: string; top: string;
  opacity: number; duration: number; delay: number;
  ty1: number; tx1: number; ty2: number; tx2: number;
}

const Particles: React.FC = () => {
  const [particles, setParticles] = useState<Particle[]>([]);

  useEffect(() => {
    setParticles(
      Array.from({ length: 15 }, (_, i) => ({
        id: i,
        size: Math.random() * 2 + 1,
        left: `${Math.random() * 100}%`,
        top: `${Math.random() * 100}%`,
        opacity: Math.random(),
        duration: Math.random() * 10 + 5,
        delay: Math.random() * 5,
        ty1: Math.random() * 100 + 50,
        tx1: Math.random() * 20 - 10,
        ty2: Math.random() * 200 + 100,
        tx2: Math.random() * 40 - 20,
      }))
    );
  }, []);

  return (
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none' }}>
      {particles.map(p => (
        <React.Fragment key={p.id}>
          <style>{`
            @keyframes ptcl-${p.id} {
              0%   { transform: translateY(0) translateX(0); opacity: 0; }
              50%  { transform: translateY(-${p.ty1}px) translateX(${p.tx1}px); opacity: 0.5; }
              100% { transform: translateY(-${p.ty2}px) translateX(${p.tx2}px); opacity: 0; }
            }
          `}</style>
          <div style={{
            position: 'absolute',
            width: p.size, height: p.size,
            left: p.left, top: p.top,
            opacity: p.opacity,
            borderRadius: '50%',
            background: 'rgba(76,214,255,0.2)',
            animation: `ptcl-${p.id} ${p.duration}s ${p.delay}s infinite linear`,
          }} />
        </React.Fragment>
      ))}
    </div>
  );
};

/* ── layout ──────────────────────────────────────────────────── */
export const AuthLayout: React.FC<AuthLayoutProps> = ({ children, title, subtitle }) => {
  return (
    <div style={{
      position: 'relative',
      minHeight: '100vh',
      width: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      fontFamily: "'Inter', sans-serif",
      backgroundColor: '#050B14',
      backgroundImage: `linear-gradient(to bottom, rgba(5,11,20,0.7), rgba(5,11,20,0.95)),
        url(https://lh3.googleusercontent.com/aida-public/AB6AXuA-BDdikH6puXrEZxn7YgR9Slym7W-4auvBvW-8U9RRoQTN1Tps8uYUn-9inALj1s4ztk0yJtsI2ZI9f_LbnSb4Rakr-8xBnyLuvUxzTnY2SG-qzmHq0D743HPq8HTd5v0o1vkhZhSN189bDi6H7Z5z6zg1jTb2I6j-JFAJuQg1ZcyGuRlb81wIUXr8cEqqpSIb2_bWSsWnVwwRRIDjPoVM9jfPWjwglVP1gfsSH94GMczb0IInK8Nf3o_DmIeVp-CBF1sfEsnL451K)`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
    }}>
      {/* Brand top-left */}
      <div style={{ position: 'fixed', top: 0, left: 0, padding: '2rem', zIndex: 50 }}>
        <Link to="/" style={{ textDecoration: 'none' }}>
          <h1 style={{ fontFamily: "'Manrope', sans-serif", fontSize: '1.4rem', fontWeight: 900, color: '#fff', letterSpacing: '-0.04em', margin: 0 }}>
            HORIZON
          </h1>
        </Link>
      </div>

      {/* Card */}
      <main style={{ width: '100%', maxWidth: '28rem', padding: '0 1.5rem', zIndex: 10 }}>
        <div style={{
          position: 'relative',
          overflow: 'hidden',
          background: 'rgba(46,53,63,0.4)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderRadius: '0.75rem',
          border: '1px solid rgba(255,255,255,0.05)',
          borderBottom: '1px solid rgba(156,202,255,0.1)',
          padding: '2.5rem',
          boxShadow: '0 20px 40px rgba(0,209,255,0.05)',
        }}>
          {/* corner glow */}
          <div style={{
            position: 'absolute', top: '-6rem', right: '-6rem',
            width: '12rem', height: '12rem',
            background: 'rgba(76,214,255,0.1)',
            filter: 'blur(80px)',
            borderRadius: '50%',
            pointerEvents: 'none',
          }} />

          {/* header */}
          <header style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
            <h2 style={{ fontFamily: "'Manrope', sans-serif", fontSize: '1.875rem', fontWeight: 700, color: '#fff', letterSpacing: '-0.02em', margin: '0 0 0.5rem' }}>
              {title}
            </h2>
            <p style={{ color: '#c4c6ce', fontSize: '0.875rem', letterSpacing: '0.02em', margin: 0 }}>
              {subtitle}
            </p>
          </header>

          {children}
        </div>

        {/* footer metadata */}
        <div style={{ marginTop: '2rem', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '2rem', opacity: 0.4 }}>
          {[
            { icon: 'shield',  label: 'AES-256 Encrypted' },
            { icon: 'public',  label: 'Global Logistics Network' },
          ].map(item => (
            <div key={item.icon} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '1rem', color: '#c4c6ce' }}>{item.icon}</span>
              <span style={{ fontSize: '0.625rem', fontWeight: 500, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#c4c6ce' }}>{item.label}</span>
            </div>
          ))}
        </div>
      </main>

      <Particles />
    </div>
  );
};
