import type { MetadataRoute } from 'next';

import { site } from '@/content/site';

/** v2 is a single page; every chapter is an anchor on it, so there is one URL to list. */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: `${site.url}/`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1,
    },
  ];
}
