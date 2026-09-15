import type { MetadataRoute } from 'next';

import { site } from '@/content/site';
import { indexable } from '@/lib/seo';

/** Mirrors the robots meta tag: closed until SITE_INDEXABLE=true, then open with the sitemap. */
export default function robots(): MetadataRoute.Robots {
  if (!indexable) {
    return { rules: [{ userAgent: '*', disallow: '/' }] };
  }

  return {
    rules: [{ userAgent: '*', allow: '/' }],
    sitemap: `${site.url}/sitemap.xml`,
    host: site.url,
  };
}
