import type { Metadata, Viewport } from 'next';
import { Chakra_Petch, Geist, Geist_Mono } from 'next/font/google';

import { site } from '@/content/site';
import { indexable } from '@/lib/seo';

import 'lenis/dist/lenis.css';
import './globals.css';

const sans = Geist({ subsets: ['latin'], display: 'swap', variable: '--font-geist-sans' });
const mono = Geist_Mono({ subsets: ['latin'], display: 'swap', variable: '--font-geist-mono' });

/* squared-off terminals read as a game HUD without tipping into a pixel font */
const display = Chakra_Petch({
  subsets: ['latin'],
  weight: ['500', '600'],
  display: 'swap',
  variable: '--font-chakra',
});

const title = `${site.name} — ${site.tagline} in ${site.address.locality}`;

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: { default: title, template: `%s — ${site.name}` },
  description: site.description,
  applicationName: site.name,
  keywords: [
    'PS5 gaming lounge',
    `gaming cafe ${site.address.city}`,
    `PS5 on rent ${site.address.locality}`,
    'PlayStation 5 by the hour',
    'gaming cafe near me',
    'birthday party gaming lounge',
  ],
  category: 'entertainment',
  alternates: { canonical: '/' },
  // Closed unless SITE_INDEXABLE=true at build time; see lib/seo.ts for why.
  robots: indexable
    ? { index: true, follow: true, googleBot: { index: true, follow: true, 'max-image-preview': 'large' } }
    : { index: false, follow: false },
  // images come from app/opengraph-image.tsx; Next wires both cards to it
  openGraph: {
    type: 'website',
    locale: 'en_IN',
    url: '/',
    siteName: site.name,
    title,
    description: site.description,
  },
  twitter: { card: 'summary_large_image', title, description: site.shortDescription },
  formatDetection: { telephone: true, address: false, email: false },
};

export const viewport: Viewport = {
  themeColor: '#050608',
  colorScheme: 'dark',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

/**
 * The document itself — fonts, colour scheme, skip link — and nothing else.
 * The public site's chrome lives in app/(site)/layout.tsx and the staff console's
 * in app/admin/layout.tsx, so neither half ships the other's JavaScript.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN" className={`${sans.variable} ${mono.variable} ${display.variable}`}>
      <body>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[120] focus:bg-lamp focus:px-4 focus:py-2 focus:text-lamp-ink"
        >
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
