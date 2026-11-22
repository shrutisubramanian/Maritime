import React, { ReactNode, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';
import { BrandLogo } from './BrandLogo';

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
            background: 'rgba(76,157,176,0.2)',
            animation: `ptcl-${p.id} ${p.duration}s ${p.delay}s infinite linear`,
          }} />
        </React.Fragment>
      ))}
    </div>
  );
};

/* ── layout ──────────────────────────────────────────────────── */
export const AuthLayout: React.FC<AuthLayoutProps> = ({ children, title, subtitle }) => {
  const { tokens: C, isDark } = useTheme();

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
      backgroundColor: C.bgDeep,
      backgroundImage: isDark
        ? `linear-gradient(135deg, ${C.bgDeep}, ${C.bgNav})`
        : `linear-gradient(135deg, #4C9DB0 0%, #4C9DB0 50%, #ffffff 100%)`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
    }}>
      {/* Brand top-left */}
      <div style={{ position: 'fixed', top: 0, left: 0, padding: '2rem', zIndex: 50 }}>
        <Link to="/" style={{ textDecoration: 'none' }} aria-label="NHAAV home">
          <BrandLogo height={34} />
        </Link>
      </div>

      {/* Card */}
      <main style={{ width: '100%', maxWidth: '28rem', padding: '0 1.5rem', zIndex: 10 }}>
        <div style={{
          position: 'relative',
          overflow: 'hidden',
          background: C.glassCardBg,
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderRadius: '0.75rem',
          border: `1px solid ${C.borderW}`,
          borderBottom: isDark ? '1px solid rgba(76,157,176,0.1)' : '1px solid rgba(76,157,176,0.08)',
          padding: '2.5rem',
          boxShadow: C.shadowGlow,
        }}>
          {/* corner glow */}
          <div style={{
            position: 'absolute', top: '-6rem', right: '-6rem',
            width: '12rem', height: '12rem',
            background: C.cyanDim,
            filter: 'blur(80px)', borderRadius: '50%',
            pointerEvents: 'none',
          }} />

          {/* header */}
          <header style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
            <h2 style={{ fontFamily: "'Manrope', sans-serif", fontSize: '1.875rem', fontWeight: 700, color: C.title, letterSpacing: '-0.02em', margin: '0 0 0.5rem' }}>
              {title}
            </h2>
            <p style={{ color: C.muted, fontSize: '0.875rem', letterSpacing: '0.02em', margin: 0 }}>
              {subtitle}
            </p>
          </header>

          {children}
        </div>

      </main>

      <Particles />
    </div>
  );
};
