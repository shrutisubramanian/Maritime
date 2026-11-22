import React from 'react';

/**
 * Official NHAAV wordmark.
 *
 * Single source for the brand mark so every surface (headers, sidebars, auth
 * shells, landing hero, footers) shows the same asset. The artwork is a blue
 * wordmark on a transparent background, so on a dark backdrop the dark-blue
 * letters would disappear — `variant` controls that:
 *
 *   'auto'  (default) - the blue artwork. Both themes use light surfaces
 *                       (Morning Dawn in both), so the mark stays blue.
 *   'brand'           - always the original blue artwork.
 *   'light'           - the dedicated reverse artwork (white NH, cyan AAV and
 *                       anchor) for permanently dark panels such as the video
 *                       hero, dark footer and verification nav.
 */

export type BrandLogoVariant = 'auto' | 'brand' | 'light';

export interface BrandLogoProps {
  /** Rendered height in px. Width scales automatically (artwork is ~3:1). */
  height?: number;
  variant?: BrandLogoVariant;
  className?: string;
  style?: React.CSSProperties;
  alt?: string;
}

export const BrandLogo: React.FC<BrandLogoProps> = ({
  height = 30,
  variant = 'auto',
  className,
  style,
  alt = 'NHAAV',
}) => {
  // No theme lookup needed any more: the night theme is also a light surface,
  // so 'auto' keeps the blue artwork in both modes.
  const resolved: 'brand' | 'light' = variant === 'auto' ? 'brand' : variant;
  const src = resolved === 'light'
    ? '/brand/nhaav-logo-on-dark.png'
    : '/brand/nhaav-logo.png';

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      style={{
        height,
        width: 'auto',
        display: 'block',
        ...style,
      }}
    />
  );
};
