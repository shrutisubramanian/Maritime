'use client';
import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { BrandLogo } from '@/components/BrandLogo';
import { Menu, X } from 'lucide-react';
import { useScroll, motion } from 'framer-motion';

export function HeroSection() {
  return (
    <div className='relative min-h-screen w-full flex flex-col justify-between overflow-x-hidden'>
      {/* Background Video */}
      <video
        autoPlay
        loop
        muted
        playsInline
        preload='auto'
        className='absolute inset-0 h-full w-full object-cover z-0'
      >
        <source src='/hero-video.mp4' type='video/mp4' />
      </video>

      {/* Brand-tinted gradient overlay: deep Venice left, fading to transparent right
          so the hero copy stays readable and the right edge of the video breathes. */}
      <div className='absolute inset-0 z-10 pointer-events-none' style={{ background: 'linear-gradient(to right, rgba(10,12,15,0.96) 0%, rgba(10,12,15,0.78) 38%, rgba(10,12,15,0.32) 72%, rgba(10,12,15,0.06) 100%)' }} />

      {/* Header / Navbar */}
      <HeroHeader />

      {/* Hero Content — 48px desktop left padding (24px mobile) */}
      <main style={{ paddingLeft: '48px', paddingRight: '48px' }} className='relative z-20 flex-1 flex items-center justify-start max-w-7xl mx-auto w-full pt-28 pb-16 md:pt-36 md:pb-20'>
        <div className='flex flex-col items-start text-left max-w-xl lg:max-w-2xl'>
          <span
            className='mb-4 block text-[10px] font-semibold uppercase sm:text-[11px]'
            style={{ color: 'rgba(255, 243, 109,0.82)', letterSpacing: '0.22em' }}
          >
            The maritime business network
          </span>

          <h1 className='text-balance text-3xl font-extrabold sm:text-4xl md:text-5xl lg:text-6xl leading-[1.15] tracking-tight' style={{ color: 'var(--color-text-inverse)' }}>
            Find the Right Maritime Partners.
          </h1>

          {/* One line only: the hero sits on moving video, so the long-form
              messaging lives in the sections below rather than here. */}
          <p className='mt-5 text-balance text-base sm:text-lg leading-relaxed max-w-md' style={{ color: 'rgba(245,238,221,0.92)' }}>
            One marketplace for maritime suppliers, services and enquiries.
          </p>

          {/* CTA Buttons — wide container width with compact small text */}
          <div style={{ marginTop: '36px' }} className='flex flex-col sm:flex-row items-stretch sm:items-center gap-5 w-full sm:w-auto'>
            <Button asChild variant='outline' className='h-14 min-w-[220px] sm:min-w-[250px] px-12 sm:px-16 rounded-2xl text-xs sm:text-sm font-semibold bg-white/10 hover:bg-white/20 border-white/35 text-white backdrop-blur-md transition-all hover:scale-[1.02] shadow-lg justify-center'>
              <Link to='/marketplace'>
                <span className='text-nowrap text-white'>Explore Marketplace</span>
              </Link>
            </Button>
            <Button asChild variant='outline' className='h-14 min-w-[220px] sm:min-w-[250px] px-12 sm:px-16 rounded-2xl text-xs sm:text-sm font-semibold bg-white/10 hover:bg-white/20 border-white/35 text-white backdrop-blur-md transition-all hover:scale-[1.02] shadow-lg justify-center'>
              <Link to='/choose-role'>
                <span className='text-nowrap text-white'>Join Nhaav</span>
              </Link>
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}

const menuItems = [
  { name: 'Features', href: '#features' },
  { name: 'Services', href: '/services' },
  { name: 'Pricing', href: '/pricing' },
  { name: 'About', href: '/about' },
  { name: 'Contact Us', href: '/contact' },
];

/**
 * Menu entries are a mix of in-page anchors ('#features') and real routes
 * ('/pricing'). Routes go through the router so the SPA state survives;
 * anchors stay plain links.
 */
const MenuLink = ({ item, className }: { item: { name: string; href: string }; className: string }) =>
  item.href.startsWith('/') ? (
    <Link to={item.href} className={className}>
      <span>{item.name}</span>
    </Link>
  ) : (
    <a href={item.href} className={className}>
      <span>{item.name}</span>
    </a>
  );

const HeroHeader = () => {
  const [menuState, setMenuState] = React.useState(false);
  const [scrolled, setScrolled] = React.useState(false);
  const { scrollYProgress } = useScroll();

  React.useEffect(() => {
    const unsubscribe = scrollYProgress.on('change', (latest: number) => {
      setScrolled(latest > 0.03);
    });
    return () => unsubscribe();
  }, [scrollYProgress]);

  return (
    <header className='relative z-30 w-full'>
      {/* Absolute, not fixed: the landing bar sits over the hero at the top of
          the page and scrolls away with it, so it never trails the content. */}
      <nav data-state={menuState && 'active'} className='group absolute top-0 left-0 right-0 z-50 w-full pt-4'>
        {/* Navbar container: 36px horizontal padding on desktop */}
        <div style={{ paddingLeft: '36px', paddingRight: '36px' }} className={cn('mx-auto max-w-7xl rounded-2xl transition-all duration-300', 'bg-transparent border border-transparent shadow-none py-1')}>
          <motion.div key={1} className={cn('relative flex flex-wrap items-center justify-between gap-6 py-3 duration-200 lg:gap-0 lg:py-4')}>
            <div className='flex w-full items-center justify-between gap-10 md:gap-12 lg:w-auto'>
              <Link to='/' aria-label='home' className='flex items-center space-x-2'>
                <Logo />
              </Link>
              <button
                onClick={() => setMenuState(!menuState)}
                aria-label={menuState ? 'Close Menu' : 'Open Menu'}
                className='relative z-20 -m-2.5 -mr-4 block cursor-pointer p-2.5 lg:hidden text-white'
              >
                <Menu className='group-data-[state=active]:rotate-180 group-data-[state=active]:scale-0 group-data-[state=active]:opacity-0 m-auto size-6 duration-200' />
                <X className='group-data-[state=active]:rotate-0 group-data-[state=active]:scale-100 group-data-[state=active]:opacity-100 absolute inset-0 m-auto size-6 -rotate-180 scale-0 opacity-0 duration-200' />
              </button>
              <div className='hidden lg:block'>
                <ul className='flex gap-8 text-sm font-medium'>
                  {menuItems.map((item, index) => (
                    <li key={index}>
                      <MenuLink item={item} className='text-white/90 hover:text-white transition-colors duration-150' />
                    </li>
                  ))}
                </ul>
              </div>
            </div>              <div className='bg-black/98 lg:bg-transparent group-data-[state=active]:block lg:group-data-[state=active]:flex mb-6 hidden w-full flex-wrap items-center justify-end space-y-6 rounded-2xl border border-white/10 p-6 shadow-2xl lg:m-0 lg:flex lg:w-fit lg:gap-6 lg:space-y-0 lg:border-transparent lg:p-0 lg:shadow-none'>
              <div className='lg:hidden'>
                <ul className='space-y-4 text-base font-medium'>
                  {menuItems.map((item, index) => (
                    <li key={index}>
                      <MenuLink item={item} className='text-white/80 hover:text-white block duration-150' />
                    </li>
                  ))}
                </ul>
              </div>
              {/* Login & Sign Up — font-size: 18px; padding: 10px 18px; */}
              <div className='flex w-full flex-col space-y-3 sm:flex-row sm:gap-3 sm:space-y-0 md:w-fit items-center'>
                <Button asChild variant='ghost' style={{ fontSize: '18px', padding: '10px 18px' }} className='font-semibold text-white/95 hover:bg-white/15 hover:text-white rounded-xl h-auto'>
                  <Link to='/login'><span>Login</span></Link>
                </Button>
                <Button asChild variant='ghost' style={{ fontSize: '18px', padding: '10px 18px' }} className='font-semibold text-white/95 hover:bg-white/15 hover:text-white border border-white/20 rounded-xl h-auto'>
                  <Link to='/choose-role'><span>Sign Up</span></Link>
                </Button>
              </div>
            </div>
          </motion.div>
        </div>
      </nav>
    </header>
  );
};

// The hero navbar sits on a permanently dark video backdrop, so the reversed
// (white) artwork is used regardless of the active theme.
const Logo = ({ className }: { className?: string }) => (
  <BrandLogo height={34} variant="light" className={className} />
);
