'use client';

import { useEffect, useRef, useState } from 'react';

import { BookButton } from '@/components/book-button';
import { games } from '@/content/games';
import { site } from '@/content/site';
import { trailerGame } from '@/lib/experience-store';
import { lockScroll } from '@/lib/smooth';
import { useSignal } from '@/lib/use-signal';

/** YouTube's "this video cannot play here": removed (100), embedding off (101/150), bad embed (153). */
const EMBED_ERRORS = new Set([100, 101, 150, 153]);

/**
 * One trailer player for the whole page, opened by any TrailerButton.
 *
 * - A native <dialog> with showModal(): Esc, focus containment, an inert page
 *   behind it and focus returned to the card on close all come from the browser.
 * - The YouTube iframe exists only while the dialog is open, so the page pays
 *   nothing for trailers nobody watches, and closing stops the video outright.
 * - youtube-nocookie sets no cookies until the viewer presses play.
 * - Some trailers (mature games) are age-restricted and refuse to play embedded.
 *   The player reports that through its postMessage API, and we swap the black
 *   box for a link to watch it on YouTube instead.
 */
export function TrailerModal() {
  const slug = useSignal(trailerGame, null);
  const game = slug ? games.find((item) => item.slug === slug && item.trailer) : undefined;
  const dialogRef = useRef<HTMLDialogElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [blocked, setBlocked] = useState(false);
  const wasOpen = useRef(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (game) {
      setBlocked(false);
      if (!dialog.open) dialog.showModal();
      lockScroll(true);
      wasOpen.current = true;
      window.va?.('event', { name: 'trailer_open', game: game.slug });
    } else if (wasOpen.current) {
      if (dialog.open) dialog.close();
      lockScroll(false);
      wasOpen.current = false;
    }
  }, [game]);

  // the player's error events, so an age-restricted trailer gets a way out instead of a black box
  useEffect(() => {
    if (!game) return;
    const onMessage = (event: MessageEvent) => {
      if (!/^https:\/\/www\.youtube(-nocookie)?\.com$/.test(event.origin)) return;
      if (event.source !== frameRef.current?.contentWindow) return;
      try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (data?.event === 'onError' && EMBED_ERRORS.has(Number(data.info))) setBlocked(true);
      } catch {
        // not a player message
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [game]);

  const close = () => trailerGame.set(null);

  const listen = () => {
    // asks the player to post its events (including errors) back to this page
    frameRef.current?.contentWindow?.postMessage(JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }), '*');
  };

  const watchUrl = game ? `https://www.youtube.com/watch?v=${game.trailer}` : '';
  const embedUrl = game
    ? `https://www.youtube-nocookie.com/embed/${game.trailer}?autoplay=1&playsinline=1&rel=0&enablejsapi=1&origin=${encodeURIComponent(
        typeof window === 'undefined' ? '' : window.location.origin,
      )}`
    : '';

  return (
    <dialog
      ref={dialogRef}
      aria-label={game ? `${game.title} trailer` : 'Trailer'}
      onClose={close}
      data-lenis-prevent
      className="fixed inset-0 z-[100] m-0 h-full max-h-none w-full max-w-none overflow-y-auto bg-transparent p-0 text-paper backdrop:bg-room/90 backdrop:backdrop-blur-md"
    >
      {game ? (
        <div
          className="flex min-h-full items-center justify-center px-[var(--gutter)] py-6"
          onClick={(event) => {
            // a tap on the dark around the player closes it; taps on the player do not
            if (event.target === event.currentTarget) close();
          }}
        >
          <div className="w-[min(100%,72rem,calc((100svh-15rem)*16/9))] min-w-[min(100%,20rem)]">
            <div className="mb-3 flex items-center justify-between gap-4">
              <p className="eyebrow text-[0.66rem]">Official trailer</p>
              <button
                type="button"
                onClick={close}
                aria-label="Close trailer"
                className="grid h-11 w-11 place-items-center border border-edge-hi bg-room/70 text-paper transition-colors hover:border-accent hover:text-accent"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                  <path d="M3 3l10 10M13 3 3 13" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            <div className="relative aspect-video overflow-hidden rounded-[10px] border border-edge-hi bg-room-deep shadow-[0_0_80px_-20px_var(--glow-accent)]">
              {blocked ? (
                <div className="absolute inset-0 grid place-items-center p-6 text-center">
                  <div>
                    <p className="text-[1.05rem] text-paper">This trailer can only be played on YouTube.</p>
                    <p className="mt-1 text-[0.9rem] text-dim">Usually because it is age-restricted.</p>
                    <a
                      href={watchUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-5 inline-flex min-h-11 items-center border border-accent px-5 font-mono text-[0.78rem] uppercase tracking-[0.14em] text-accent transition-colors hover:bg-accent hover:text-room"
                    >
                      Watch on YouTube
                    </a>
                  </div>
                </div>
              ) : (
                <iframe
                  ref={frameRef}
                  key={game.slug}
                  src={embedUrl}
                  title={`${game.title} — official trailer`}
                  onLoad={listen}
                  allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                  allowFullScreen
                  referrerPolicy="strict-origin-when-cross-origin"
                  className="absolute inset-0 h-full w-full"
                />
              )}
            </div>

            <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="font-display text-[clamp(1.4rem,3vw,2rem)] font-semibold uppercase leading-none">{game.title}</h2>
                <p className="mt-2 text-[0.92rem] text-dim">
                  <span className="font-mono text-accent">
                    {game.players} {game.players === '1' ? 'player' : 'players'}
                  </span>
                  <span aria-hidden="true" className="px-2 text-dimmer">
                    /
                  </span>
                  {game.note}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-3">
                <a
                  href={watchUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-11 items-center font-mono text-[0.72rem] uppercase tracking-[0.14em] text-dim transition-colors hover:text-accent"
                >
                  YouTube ↗
                </a>
                <BookButton message={`Hi ${site.name}, I'd like to book a bay to play ${game.title}. `}>Play it here</BookButton>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </dialog>
  );
}
