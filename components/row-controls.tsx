'use client';

import { useEffect, useState } from 'react';

/**
 * Previous / next for a swipe row below the desktop breakpoint.
 *
 * Touch users swipe; these are for everyone who cannot: a mouse without a
 * trackpad in a narrow window, and keyboard users. Each press moves most of a
 * screen, and a button disables itself at its end of the row.
 */
export function RowControls({ trackId, label }: { trackId: string; label: string }) {
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);

  useEffect(() => {
    const track = document.getElementById(trackId);
    if (!track) return;

    const sync = () => {
      setAtStart(track.scrollLeft < 8);
      setAtEnd(track.scrollLeft + track.clientWidth >= track.scrollWidth - 8);
    };
    sync();
    track.addEventListener('scroll', sync, { passive: true });
    window.addEventListener('resize', sync);
    return () => {
      track.removeEventListener('scroll', sync);
      window.removeEventListener('resize', sync);
    };
  }, [trackId]);

  const step = (direction: 1 | -1) => {
    const track = document.getElementById(trackId);
    if (!track) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    track.scrollBy({ left: direction * track.clientWidth * 0.8, behavior: reduced ? 'auto' : 'smooth' });
  };

  const button =
    'grid h-11 w-11 place-items-center border border-edge-hi bg-room/70 text-paper transition-colors ' +
    'hover:border-accent hover:text-accent disabled:pointer-events-none disabled:opacity-30';

  return (
    <div className="mt-4 flex justify-end gap-2 px-[var(--gutter)] lg:hidden">
      <button
        type="button"
        className={button}
        onClick={() => step(-1)}
        disabled={atStart}
        aria-controls={trackId}
        aria-label={`Previous: ${label}`}
      >
        <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
          <path d="M13 8H3M7 4 3 8l4 4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <button
        type="button"
        className={button}
        onClick={() => step(1)}
        disabled={atEnd}
        aria-controls={trackId}
        aria-label={`Next: ${label}`}
      >
        <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
          <path d="M3 8h10M9 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </div>
  );
}
