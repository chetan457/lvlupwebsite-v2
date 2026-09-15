'use client';

import { trailerGame } from '@/lib/experience-store';

/**
 * Makes a whole game case open its trailer.
 *
 * It is laid over the case rather than wrapping it, so GameCase stays a server
 * component and keeps its heading. The "Trailer" pill is always visible, because
 * a phone has no hover to reveal the big play mark.
 */
export function TrailerButton({ slug, title }: { slug: string; title: string }) {
  return (
    <button
      type="button"
      onClick={() => trailerGame.set(slug)}
      aria-haspopup="dialog"
      aria-label={`Watch the ${title} trailer`}
      className="group/play absolute inset-0 z-20 cursor-pointer rounded-[10px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <span
        aria-hidden="true"
        className="absolute left-2 top-2 flex items-center gap-1.5 rounded-full border border-edge-hi bg-room-deep/80 py-1 pl-1.5 pr-2.5 font-mono text-[0.62rem] uppercase leading-none tracking-[0.12em] text-paper transition-colors group-hover/play:border-accent group-hover/play:text-accent"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
          <path d="M2.5 1.2v7.6L8.6 5z" />
        </svg>
        Trailer
      </span>

      <span
        aria-hidden="true"
        className="absolute left-1/2 top-[42%] grid h-14 w-14 -translate-x-1/2 -translate-y-1/2 scale-90 place-items-center rounded-full border border-accent/60 bg-room/60 text-accent opacity-0 shadow-[0_0_32px_var(--glow-accent-faint)] backdrop-blur-sm transition duration-300 group-hover/play:scale-100 group-hover/play:opacity-100 group-focus-visible/play:scale-100 group-focus-visible/play:opacity-100"
      >
        <svg width="20" height="20" viewBox="0 0 10 10" fill="currentColor">
          <path d="M3 1.4v7.2L8.4 5z" />
        </svg>
      </span>
    </button>
  );
}
