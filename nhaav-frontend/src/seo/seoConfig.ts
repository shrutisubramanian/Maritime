/**
 * SEO metadata for every route.
 *
 * Nhaav is a single-page app, so the head is managed client-side by
 * `SeoManager`. Only the public marketing pages are indexable: the marketplace,
 * company profiles, dashboards and the admin console all sit behind
 * authentication and contain private business data, so they are explicitly
 * `noindex, nofollow` (and are also blocked in robots.txt and by an
 * `X-Robots-Tag` header on the host).
 */

export const SITE_NAME = 'Nhaav';

/**
 * Public site origin used for canonical URLs and structured data.
 * `VITE_SITE_URL` is baked at build time; the current origin is the fallback so
 * local development and previews still produce valid absolute URLs.
 */
export function siteOrigin(): string {
  const configured = (import.meta.env.VITE_SITE_URL as string | undefined) || '';
  const origin = configured.trim() || (typeof window !== 'undefined' ? window.location.origin : '');
  return origin.replace(/\/+$/, '');
}

export type SeoRobots = 'index,follow' | 'noindex,nofollow';

export interface SeoEntry {
  title: string;
  description: string;
  robots: SeoRobots;
  /** Schema.org type for the page-level JSON-LD block, if any. */
  schemaType?: 'WebPage' | 'AboutPage' | 'CollectionPage' | 'ContactPage';
}

const HOME_TITLE = 'Nhaav — Powering Maritime Procurement';
const HOME_DESCRIPTION =
  'Nhaav connects ship owners and maritime businesses with verified service providers and suppliers. Discover companies, request quotations and manage maritime procurement in one place.';

/** Public, indexable pages. Anything not listed here is noindex by default. */
export const PUBLIC_PAGES: Record<string, SeoEntry> = {
  '/': {
    title: HOME_TITLE,
    description: HOME_DESCRIPTION,
    robots: 'index,follow',
    schemaType: 'WebPage',
  },
  '/about': {
    title: `About Nhaav — Connecting Maritime Businesses`,
    description:
      'Nhaav is built around a real maritime challenge: making it easier for ship owners, operators, service providers and suppliers to find and work with each other. Learn how the platform is put together.',
    robots: 'index,follow',
    schemaType: 'AboutPage',
  },
  '/contact': {
    title: `Contact Nhaav — Services, Supplies & Demos`,
    description:
      'Tell us what you need and our team will get back to you within 24 hours. Enquiries are emailed to services@nhaav.com; request a demo to see the marketplace with your own ports and services.',
    robots: 'index,follow',
    schemaType: 'ContactPage',
  },
  '/pricing': {
    title: `Pricing — Nhaav Access Plans & Vendor Options`,
    description:
      'Nhaav access plans for buyers (₹1,000 per month for 10 passes or ₹10,000 per year for 100 passes) plus company-profile visibility and listing options for maritime vendors.',
    robots: 'index,follow',
    schemaType: 'WebPage',
  },
  '/services': {
    title: `Maritime Services — Sourced From One Verified Network`,
    description:
      'Explore the maritime services available through Nhaav: inspection, diving, repairs, logistics and more, delivered by verified service providers and suppliers.',
    robots: 'index,follow',
    schemaType: 'CollectionPage',
  },
  '/terms': {
    title: `Nhaav Terms & Conditions`,
    description:
      'The terms that govern use of the Nhaav maritime marketplace, including accounts, verification, access passes, payments and marketplace listings.',
    robots: 'index,follow',
    schemaType: 'WebPage',
  },
};

/**
 * Titles for authenticated / utility routes. They stay noindex, but a correct
 * title still matters for browser tabs, history and accessibility.
 */
const PRIVATE_TITLES: Array<[RegExp, string]> = [
  [/^\/login$/, 'Sign in'],
  [/^\/register$/, 'Create your account'],
  [/^\/choose-role$|^\/role$/, 'Choose your role'],
  [/^\/forgot-password$/, 'Reset your password'],
  [/^\/reset-password$/, 'Choose a new password'],
  [/^\/verify-email$/, 'Verify your email'],
  [/^\/resend-verification$/, 'Resend verification email'],
  [/^\/marketplace/, 'Marketplace'],
  [/^\/company\//, 'Company profile'],
  [/^\/provider\//, 'Service provider profile'],
  [/^\/supplier\//, 'Supplier profile'],
  [/^\/supplies\//, 'Supply listing'],
  [/^\/dashboard/, 'Dashboard'],
  [/^\/ship-owner/, 'Ship owner dashboard'],
  [/^\/provider-dashboard/, 'Provider dashboard'],
  [/^\/supplier-dashboard|^\/supplier\//, 'Supplier dashboard'],
  [/^\/payments/, 'Billing & access'],
  [/^\/notifications/, 'Notifications'],
  [/^\/orders/, 'Orders'],
  [/^\/jobs/, 'Jobs'],
  [/^\/procurement/, 'Procurement'],
  [/^\/profile/, 'Profile'],
  [/^\/settings/, 'Settings'],
  [/^\/verification/, 'Verification'],
  [/^\/analytics/, 'Analytics'],
  [/^\/admin\/login$/, 'Admin sign in'],
  [/^\/admin/, 'Admin console'],
];

const DEFAULT_PRIVATE: SeoEntry = {
  title: 'Nhaav',
  description: HOME_DESCRIPTION,
  robots: 'noindex,nofollow',
};

export interface ResolvedSeo extends SeoEntry {
  /** Absolute canonical URL for the current path (no query string). */
  canonical: string;
  /** Page path, used for the breadcrumb structured data. */
  path: string;
}

export function resolveSeo(pathname: string): ResolvedSeo {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : '/';
  const publicEntry = PUBLIC_PAGES[path];

  const entry: SeoEntry = publicEntry ?? (() => {
    const match = PRIVATE_TITLES.find(([pattern]) => pattern.test(path));
    const label = match?.[1] ?? DEFAULT_PRIVATE.title;
    return {
      ...DEFAULT_PRIVATE,
      title: label === SITE_NAME ? SITE_NAME : `${label} | ${SITE_NAME}`,
    };
  })();

  return {
    ...entry,
    path,
    canonical: `${siteOrigin()}${path === '/' ? '/' : path}`,
  };
}

/** Organization structured data, emitted once on the landing page. */
export function organizationJsonLd() {
  const origin = siteOrigin();
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE_NAME,
    url: origin,
    logo: `${origin}/favicon/favicon.svg`,
    email: 'services@nhaav.com',
    description:
      'Nhaav is a maritime B2B marketplace connecting ship owners and operators with verified service providers and suppliers.',
    areaServed: 'Maritime industry',
  };
}

/** Breadcrumb structured data for a public sub-page. */
export function breadcrumbJsonLd(entry: ResolvedSeo) {
  const origin = siteOrigin();
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${origin}/` },
      { '@type': 'ListItem', position: 2, name: entry.title, item: entry.canonical },
    ],
  };
}
