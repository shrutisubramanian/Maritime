import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

import {
  breadcrumbJsonLd,
  organizationJsonLd,
  resolveSeo,
  siteOrigin,
  SITE_NAME,
} from './seoConfig';

/**
 * Keeps <head> and the page's structured data in sync with the current route.
 *
 * Dependency-free on purpose: the app has no react-helmet, and this only needs
 * title, description, canonical, robots and social tags. Mounted once in
 * SiteShell, so navigating between pages replaces the managed tags instead of
 * accumulating duplicates.
 */

const MANAGED = 'data-nhaav-seo';
const JSON_LD_ID = 'nhaav-jsonld';
const SOCIAL_IMAGE_PATH = '/ocean-bg.png';

function upsertMeta(attr: 'name' | 'property', key: string, content: string): void {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    el.setAttribute(MANAGED, '');
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function upsertCanonical(href: string): void {
  let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!link) {
    link = document.createElement('link');
    link.setAttribute('rel', 'canonical');
    link.setAttribute(MANAGED, '');
    document.head.appendChild(link);
  }
  link.setAttribute('href', href);
}

function upsertJsonLd(data: object | null): void {
  const existing = document.getElementById(JSON_LD_ID);
  if (data === null) {
    existing?.remove();
    return;
  }
  const script = (existing as HTMLScriptElement | null) ?? document.createElement('script');
  script.id = JSON_LD_ID;
  script.type = 'application/ld+json';
  script.textContent = JSON.stringify(data);
  if (!existing) document.head.appendChild(script);
}

export const SeoManager: React.FC = () => {
  const { pathname } = useLocation();

  useEffect(() => {
    const seo = resolveSeo(pathname);
    const origin = siteOrigin();
    const image = `${origin}${SOCIAL_IMAGE_PATH}`;

    document.documentElement.lang = 'en';
    document.title = seo.title;

    upsertMeta('name', 'description', seo.description);
    upsertMeta('name', 'robots', seo.robots);
    upsertCanonical(seo.canonical);

    // Open Graph
    upsertMeta('property', 'og:type', 'website');
    upsertMeta('property', 'og:site_name', SITE_NAME);
    upsertMeta('property', 'og:title', seo.title);
    upsertMeta('property', 'og:description', seo.description);
    upsertMeta('property', 'og:url', seo.canonical);
    upsertMeta('property', 'og:image', image);
    upsertMeta('property', 'og:locale', 'en_IN');

    // Twitter/X
    upsertMeta('name', 'twitter:card', 'summary_large_image');
    upsertMeta('name', 'twitter:title', seo.title);
    upsertMeta('name', 'twitter:description', seo.description);
    upsertMeta('name', 'twitter:image', image);

    if (seo.robots === 'index,follow') {
      const graph: object[] = [
        {
          '@context': 'https://schema.org',
          '@type': seo.schemaType ?? 'WebPage',
          name: seo.title,
          description: seo.description,
          url: seo.canonical,
          isPartOf: { '@type': 'WebSite', name: SITE_NAME, url: origin },
        },
      ];
      if (seo.path === '/') graph.push(organizationJsonLd());
      if (seo.path !== '/') graph.push(breadcrumbJsonLd(seo));
      upsertJsonLd({ '@context': 'https://schema.org', '@graph': graph });
    } else {
      // Private surfaces must not emit structured data describing their content.
      upsertJsonLd(null);
    }
  }, [pathname]);

  return null;
};

export default SeoManager;
