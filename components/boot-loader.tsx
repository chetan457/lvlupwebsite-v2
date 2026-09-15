'use client';

import { useEffect, useRef, useState } from 'react';

import { site } from '@/content/site';
import { bootDone, sceneStatus } from '@/lib/experience-store';

const RING = 40;

/**
 * The boot screen.
 *
 * It holds until the fonts are in and the scene has drawn a frame (or given up),
 * so the page never reveals mid-layout-shift or with an empty stage. The counter
 * is honest about that: it runs to 60 on its own, to 86 once fonts land, and only
 * reaches 100 when the scene reports in — or after 2.2 seconds, whichever comes
 * first. Content is never held back for the GPU: a slow scene simply fades in
 * behind the copy when it is ready, and a model that is still loading shows
 * as voxels until it arrives.
 *
 * A second visit in the same tab gets a short version. Without JavaScript the
 * layout's <noscript> rule hides this entirely.
 */
export function BootLoader() {
  const [leaving, setLeaving] = useState(false);
  const [gone, setGone] = useState(false);
  const countRef = useRef<HTMLSpanElement>(null);
  const barRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let seen = false;
    try {
      seen = sessionStorage.getItem('lvlup-v2-booted') === '1';
    } catch {
      // storage blocked; show the full boot
    }

    // pages without a stage (the 404) have no scene to wait for
    const hasStage = document.querySelector('[data-experience]') !== null;
    // phones get a shorter boot: the screen is smaller and every second counts more on a slow link
    const small = window.innerWidth < 1024;
    const minimum = reduced || seen ? 250 : small ? 600 : 1000;
    const started = performance.now();

    let fontsReady = !document.fonts;
    document.fonts?.ready.then(() => {
      fontsReady = true;
    });

    let shown = 0;
    let raf = 0;
    let leaveTimer = 0;
    let previous = started;

    const frame = (now: number) => {
      const elapsed = now - started;
      // time-based, not per-frame: on a device rendering at 5fps a per-frame ease took
      // ten seconds to count to 100 while the page sat ready underneath
      const dt = Math.min(now - previous, 250);
      previous = now;
      const sceneSettled = !hasStage || sceneStatus.get() !== 'pending' || elapsed > (small ? 1600 : 2200);
      const cap = fontsReady ? (sceneSettled ? 100 : 86) : 60;
      const want = Math.min(cap, (elapsed / minimum) * 100);

      shown += (want - shown) * (1 - Math.exp(-dt / 90));
      if (Math.abs(want - shown) < 0.4 || (want === 100 && elapsed > minimum + 400)) shown = want;

      if (countRef.current) countRef.current.textContent = String(Math.floor(shown)).padStart(3, '0');
      if (barRef.current) barRef.current.style.transform = `scaleX(${shown / 100})`;

      if (shown >= 100) {
        try {
          sessionStorage.setItem('lvlup-v2-booted', '1');
        } catch {
          // non-essential
        }
        setLeaving(true);
        bootDone.set(true);
        leaveTimer = window.setTimeout(() => setGone(true), 1100);
        return;
      }
      raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(leaveTimer);
    };
  }, []);

  if (gone) return null;

  return (
    <div
      data-boot
      role="status"
      aria-label={leaving ? undefined : 'Loading'}
      className={`fixed inset-0 z-[100] bg-room-deep transition-[clip-path] duration-1000 ease-[cubic-bezier(0.65,0,0.35,1)] ${
        leaving ? '[clip-path:inset(0_0_100%_0)]' : '[clip-path:inset(0_0_0_0)]'
      }`}
    >
      <div className="absolute left-1/2 top-[46%] -translate-x-1/2 -translate-y-1/2">
        <svg
          viewBox="0 0 200 200"
          aria-hidden="true"
          className="h-[min(64vw,21rem)] w-[min(64vw,21rem)] animate-[spin_10s_linear_infinite]"
        >
          {Array.from({ length: RING }, (_, i) => (
            <rect
              key={i}
              x="97"
              y="4"
              width="6"
              height={i % 5 === 0 ? 16 : 10}
              transform={`rotate(${(i * 360) / RING} 100 100)`}
              className={i % 10 < 3 ? 'fill-accent' : 'fill-edge-hi'}
            />
          ))}
        </svg>
        <p className="absolute inset-0 grid place-items-center font-display text-[clamp(1.6rem,5vw,2.2rem)] font-semibold uppercase tracking-[0.04em]">
          <span>
            Lvl<span className="text-accent">Up</span>
          </span>
        </p>
      </div>

      <div className="absolute inset-x-[var(--gutter)] bottom-[max(2rem,env(safe-area-inset-bottom))] flex flex-col gap-3">
        <div className="flex items-end justify-between font-mono text-[0.68rem] uppercase tracking-[0.2em] text-dim">
          <span>Loading level 01</span>
          <span>
            <span ref={countRef} className="text-[1.6rem] leading-none text-paper">
              000
            </span>
            %
          </span>
        </div>
        <span className="relative block h-2 w-full overflow-hidden bg-edge">
          <span
            ref={barRef}
            className="absolute inset-0 origin-left bg-[repeating-linear-gradient(90deg,var(--color-accent)_0_10px,transparent_10px_14px)]"
            style={{ transform: 'scaleX(0)' }}
          />
        </span>
        <div className="flex justify-between font-mono text-[0.6rem] uppercase tracking-[0.2em] text-dimmer">
          <span>
            PS5 · {site.address.locality}
          </span>
          <span>Press start</span>
        </div>
      </div>
    </div>
  );
}
