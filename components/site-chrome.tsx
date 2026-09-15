'use client';

import { useEffect, useRef } from 'react';

import { BookButton } from '@/components/book-button';
import { chapterNav } from '@/content/chapters';
import { cheapestHour } from '@/content/pricing';
import { addressLines, site } from '@/content/site';
import { activeChapter, bootDone, menuOpen } from '@/lib/experience-store';
import { scrollToId } from '@/lib/smooth';
import { useSignal } from '@/lib/use-signal';

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Everything fixed to the viewport: logo, menu, the level HUD and the phone dock.
 *
 * Like 8bit's chrome it floats over the stage rather than sitting in a bar. The
 * menu is a full-screen overlay; it is `inert` while closed rather than
 * unmounted, so it can animate out and is still unreachable to keyboard and
 * screen reader until opened.
 */
export function SiteChrome() {
  const open = useSignal(menuOpen, false);
  const chapter = useSignal(activeChapter, 0);
  const booted = useSignal(bootDone, false);

  const toggleRef = useRef<HTMLButtonElement>(null);
  const firstLinkRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    if (!open) return;
    firstLinkRef.current?.focus({ preventScroll: true });

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') menuOpen.set(false);
    };
    window.addEventListener('keydown', onKey);

    const toggle = toggleRef.current;
    return () => {
      window.removeEventListener('keydown', onKey);
      toggle?.focus({ preventScroll: true });
    };
  }, [open]);

  const go = (id: string) => (event: React.MouseEvent) => {
    event.preventDefault();
    menuOpen.set(false);
    // one frame so the scroll lock is released before Lenis is asked to move
    requestAnimationFrame(() => scrollToId(id));
  };

  const fade = `transition-opacity duration-700 ${booted ? 'opacity-100' : 'opacity-0'}`;

  return (
    <>
      {/* keeps the logo legible over whatever scrolls beneath it */}
      <div
        aria-hidden="true"
        className={`pointer-events-none fixed inset-x-0 top-0 z-40 h-24 bg-linear-to-b from-room/90 to-transparent lg:h-32 ${fade}`}
      />

      <header className={`pointer-events-none fixed inset-x-0 top-0 z-50 ${fade}`}>
        <div className="flex items-center justify-between px-[var(--gutter)] pt-4 lg:pt-7">
          <a
            href="#start"
            onClick={go('start')}
            className="pointer-events-auto inline-flex min-h-12 items-center gap-3"
            aria-label={`${site.name}, back to the start`}
          >
            <svg viewBox="0 0 10 10" aria-hidden="true" className="h-5 w-5 fill-accent" shapeRendering="crispEdges">
              <rect x="0" y="0" width="2" height="10" />
              <rect x="2" y="8" width="4" height="2" />
              <rect x="6" y="0" width="2" height="2" />
              <rect x="8" y="2" width="2" height="2" />
              <rect x="6" y="4" width="2" height="2" />
            </svg>
            <span className="font-display text-[1.2rem] font-semibold uppercase leading-none tracking-[0.04em]">
              Lvl<span className="text-accent">Up</span>
            </span>
          </a>

          <div className="pointer-events-auto flex items-center gap-3">
            <div className="hidden lg:block">
              <BookButton>Book a bay</BookButton>
            </div>
            <button
              ref={toggleRef}
              type="button"
              aria-expanded={open}
              aria-controls="site-menu"
              onClick={() => menuOpen.set(!open)}
              className="relative grid h-12 w-12 place-items-center border border-edge-hi bg-room/60 backdrop-blur-md transition-colors hover:border-accent"
            >
              <span className="sr-only">{open ? 'Close menu' : 'Open menu'}</span>
              <span
                aria-hidden="true"
                className={`absolute h-[2px] w-6 bg-paper transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                  open ? 'rotate-45' : '-translate-y-[4px]'
                }`}
              />
              <span
                aria-hidden="true"
                className={`absolute h-[2px] w-6 bg-paper transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                  open ? '-rotate-45' : 'translate-y-[4px]'
                }`}
              />
            </button>
          </div>
        </div>
      </header>

      <div
        id="site-menu"
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        inert={!open}
        className={`fixed inset-0 z-40 overflow-y-auto bg-room-deep/95 backdrop-blur-xl transition-[clip-path] duration-700 ease-[cubic-bezier(0.65,0,0.35,1)] ${
          open ? '[clip-path:inset(0_0_0_0)]' : '[clip-path:inset(0_0_100%_0)]'
        }`}
      >
        <div className="shell grid min-h-full gap-12 pb-12 pt-28 lg:grid-cols-[1.4fr_1fr] lg:items-end lg:pb-16">
          <nav aria-label="Chapters">
            <ol>
              {chapterNav.map((item, i) => {
                const current = chapter === i;
                return (
                  <li key={item.id}>
                    <a
                      ref={i === 0 ? firstLinkRef : undefined}
                      href={`#${item.id}`}
                      onClick={go(item.id)}
                      aria-current={current ? 'true' : undefined}
                      className={`flex items-baseline gap-5 border-b border-edge py-3 font-display text-[clamp(2rem,6vw,4.2rem)] font-semibold uppercase leading-none transition-colors hover:text-accent ${
                        current ? 'text-paper' : 'text-dim'
                      }`}
                    >
                      <span className={`font-mono text-[0.7rem] tracking-[0.18em] ${current ? 'text-accent' : 'text-dimmer'}`}>
                        {pad(i + 1)}
                      </span>
                      {item.label}
                    </a>
                  </li>
                );
              })}
            </ol>
          </nav>

          <div className="grid gap-10 text-[0.95rem] text-dim sm:grid-cols-2 lg:grid-cols-1">
            <div>
              <p className="eyebrow">Visit</p>
              <address className="mt-3 not-italic text-paper">
                {addressLines.map((line) => (
                  <span key={line} className="block">
                    {line}
                  </span>
                ))}
              </address>
              <p className="mt-2">{site.landmark}</p>
            </div>
            <div>
              <p className="eyebrow">Talk to us</p>
              <p className="mt-3">
                <a href={`tel:${site.phone}`} className="inline-flex min-h-11 items-center font-mono text-paper transition-colors hover:text-accent">
                  {site.phoneDisplay}
                </a>
              </p>
              <p className="mt-1">
                <a
                  href={site.instagram}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-11 items-center font-mono text-paper transition-colors hover:text-accent"
                >
                  {site.instagramHandle}
                </a>
              </p>
              <div className="mt-6">
                <BookButton>Book on WhatsApp</BookButton>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* phones: the level HUD as a slim progress bar under the header */}
      <div
        aria-hidden="true"
        className={`pointer-events-none fixed inset-x-[var(--gutter)] top-[4.6rem] z-50 flex gap-1 transition-opacity duration-500 lg:hidden ${
          booted && !open ? 'opacity-100' : 'opacity-0'
        }`}
      >
        {chapterNav.map((item, i) => (
          <span
            key={item.id}
            className={`h-[3px] flex-1 transition-colors duration-500 ${
              i === chapter ? 'bg-accent' : i < chapter ? 'bg-accent/40' : 'bg-edge-hi'
            }`}
          />
        ))}
      </div>

      {/* the level HUD: where you are in the run */}
      <div
        aria-hidden="true"
        className={`pointer-events-none fixed bottom-6 left-[var(--gutter)] z-30 hidden items-center gap-5 border border-edge bg-room/75 px-4 py-2.5 font-mono text-[0.66rem] uppercase tracking-[0.18em] text-dim backdrop-blur-md lg:flex ${fade}`}
      >
        <span className="text-paper">
          LVL {pad(chapter + 1)}
          <span className="text-dimmer"> / {pad(chapterNav.length)}</span>
        </span>
        <span className="flex gap-1">
          {chapterNav.map((item, i) => (
            <span
              key={item.id}
              className={`h-[6px] w-5 transition-colors duration-500 ${
                i === chapter ? 'bg-accent' : i < chapter ? 'bg-accent/40' : 'bg-edge-hi'
              }`}
            />
          ))}
        </span>
        <span>{chapterNav[chapter]?.label}</span>
      </div>

      <p
        aria-hidden="true"
        className={`pointer-events-none fixed bottom-7 right-[var(--gutter)] z-30 hidden items-center gap-3 font-mono text-[0.62rem] uppercase tracking-[0.22em] text-dim transition-opacity duration-700 lg:flex ${
          booted && chapter === 0 ? 'opacity-100' : 'opacity-0'
        }`}
      >
        Scroll to continue
        <span className="block h-px w-10 bg-edge-hi" />
      </p>

      <div
        className={`fixed inset-x-0 bottom-0 z-30 border-t border-edge-hi bg-room/80 pt-3 backdrop-blur-xl transition-[opacity,translate] duration-500 lg:hidden ${
          booted && !open ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-full opacity-0'
        }`}
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 0.75rem)' }}
      >
        <div className="flex items-center justify-between gap-4 px-[var(--gutter)]">
          <p className="flex flex-col gap-1">
            <span className="eyebrow leading-none">From</span>
            <span className="font-mono text-[1.05rem] leading-none text-paper">
              &#8377;{cheapestHour}
              <span className="text-[0.75rem] text-dim"> /hr</span>
            </span>
          </p>
          <BookButton>Book a bay</BookButton>
        </div>
      </div>
    </>
  );
}
