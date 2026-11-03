import type { MetadataRoute } from 'next';

import { site } from '@/content/site';
import { indexable } from '@/lib/seo';

/**
 * Mirrors the robots meta tag: closed until SITE_INDEXABLE=true, then open with the sitemap.
 *
 * The staff console stays disallowed either way. This is only a request a crawler
 * may honour, so it is backed by an `X-Robots-Tag: noindex` header on /admin in
 * next.config.mjs and by the sign-in gate in middleware.ts.
 */
export default function robots(): MetadataRoute.Robots {
  if (!indexable) {
    return { rules: [{ userAgent: '*', disallow: '/' }] };
  }

  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/admin', '/admin/'] }],
    sitemap: `${site.url}/sitemap.xml`,
    host: site.url,
  };
}
