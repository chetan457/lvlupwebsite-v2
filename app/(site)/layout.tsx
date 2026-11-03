import { BootLoader } from '@/components/boot-loader';
import { SiteChrome } from '@/components/site-chrome';
import { TrailerModal } from '@/components/trailer-modal';
import { jsonLd, localBusinessSchema } from '@/lib/schema';

/**
 * Everything that makes the public site the public site: the boot screen, the
 * floating chrome, the trailer dialog and the business schema.
 *
 * It lives in a route group so the staff console at /admin never loads any of
 * it — no WebGL, no GSAP, no scanlines over a till screen. The root layout
 * holds only the parts both halves share: the document, the fonts and the
 * colour scheme.
 */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* the boot screen waits on JavaScript that will never run */}
      <noscript>
        <style>{'[data-boot]{display:none!important}'}</style>
      </noscript>
      <BootLoader />
      <SiteChrome />
      <TrailerModal />
      <main id="main" className="relative z-10">
        {children}
      </main>
      <script
        type="application/ld+json"
        // local static content only, never visitor input
        dangerouslySetInnerHTML={{ __html: jsonLd(localBusinessSchema()) }}
      />
    </>
  );
}
