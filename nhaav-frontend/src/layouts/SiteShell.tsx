import React from 'react';
import { Outlet } from 'react-router-dom';
import { ConsentBanner } from '../components/ConsentBanner';
import { SeoManager } from '../seo/SeoManager';

/**
 * Root route element.
 *
 * Wraps every route so app-wide chrome that needs router context (the terms
 * consent bar links into /terms) renders once, outside the page layouts.
 */
export const SiteShell: React.FC = () => (
  <>
    {/* Per-route title, description, canonical and social/structured data. */}
    <SeoManager />
    <Outlet />
    <ConsentBanner />
  </>
);

export default SiteShell;
