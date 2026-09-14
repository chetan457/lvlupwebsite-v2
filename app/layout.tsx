import type { Metadata, Viewport } from 'next';
import { Chakra_Petch, Geist, Geist_Mono } from 'next/font/google';

import { BootLoader } from '@/components/boot-loader';
import { SiteChrome } from '@/components/site-chrome';
import { site } from '@/content/site';
import { jsonLd, localBusinessSchema } from '@/lib/schema';

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

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: {
    default: `${site.name} — ${site.tagline} in ${site.address.locality}`,
    template: `%s — ${site.name}`,
  },
  description: site.description,
  applicationName: site.name,
  // v2 is a design preview sharing every word of copy with the live site;
  // letting both be indexed would split the lounge's search presence
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: '#050608',
  colorScheme: 'dark',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN" className={`${sans.variable} ${mono.variable} ${display.variable}`}>
      <body>
        {/* the boot screen waits on JavaScript that will never run */}
        <noscript>
          <style>{'[data-boot]{display:none!important}'}</style>
        </noscript>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[120] focus:bg-lamp focus:px-4 focus:py-2 focus:text-lamp-ink"
        >
          Skip to content
        </a>
        <BootLoader />
        <SiteChrome />
        <main id="main" className="relative z-10">
          {children}
        </main>
        <script
          type="application/ld+json"
          // local static content only, never visitor input
          dangerouslySetInnerHTML={{ __html: jsonLd(localBusinessSchema()) }}
        />
      </body>
    </html>
  );
}
