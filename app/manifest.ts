import type { MetadataRoute } from 'next';

import { site } from '@/content/site';

/** Lets a phone save the lounge to its home screen with the right name, icon and colours. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: site.legalName,
    short_name: site.name,
    description: site.shortDescription,
    start_url: '/',
    display: 'standalone',
    background_color: '#050608',
    theme_color: '#050608',
    icons: [
      { src: '/icon', sizes: '32x32', type: 'image/png' },
      { src: '/apple-icon', sizes: '180x180', type: 'image/png' },
    ],
  };
}
