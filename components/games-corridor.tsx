'use client';

import { useEffect, useRef, useState } from 'react';

import { GameCase } from '@/components/game-case';
import { games, platform } from '@/content/games';

/**
 * Scrolling this section walks you down a corridor of discs — ported from v1's
 * components/games-corridor.tsx so the games chapter moves the same way on
 * both sites. In v2 the corridor flies through the voxel tunnel behind it,
 * which is driven by the same scroll.
 *
 * Cards sit alternating left and right at increasing depth; scroll progress
 * flies the camera past them, so each one rises out of the fog, swells as it
 * passes and fades out behind.
 *
 *  - It is `hidden lg:block`, so a phone never runs any of it; phones get the
 *    swipeable rack in chapter-section.tsx, as in v1.
 *  - The 340vh height is set in CSS and server-rendered, so the space is
 *    reserved from first paint. Under `prefers-reduced-motion` the CSS
 *    collapses it to a plain grid instead.
 *  - Only transform and opacity are ever written, from one rAF-throttled
 *    scroll listener. Nothing here touches layout.
 */

/** Spacing between discs along the Z axis, in px of perspective depth. */
const DEPTH = 560;

export function GamesCorridor({
  label,
  count,
  Heading = 'h3',
  CardHeading = 'h4',
}: {
  label: string;
  count: string;
  Heading?: 'h2' | 'h3';
  CardHeading?: 'h3' | 'h4';
}) {
  const sectionRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLUListElement>(null);
  const [now, setNow] = useState(games[0]);

  useEffect(() => {
    const section = sectionRef.current;
    const rail = railRef.current;
    if (!section || !rail) return;

    const still = window.matchMedia('(prefers-reduced-motion: reduce)');
    const wide = window.matchMedia('(min-width: 64rem) and (pointer: fine)');
    if (still.matches || !wide.matches) return;

    const cards = Array.from(rail.querySelectorAll<HTMLLIElement>('[data-disc]'));
    const travel = (cards.length + 1.6) * DEPTH;
    let frame = 0;
    let nearest = -1;

    const place = () => {
      frame = 0;
      const span = section.offsetHeight - window.innerHeight;
      const progress = span > 0 ? Math.min(1, Math.max(0, -section.getBoundingClientRect().top / span)) : 0;

      let bestGap = Infinity;
      let bestIndex = nearest;

      cards.forEach((card, i) => {
        const side = i % 2 ? 1 : -1;
        const x = side * 300 + ((i % 3) - 1) * 26;
        const y = ((i % 4) - 1.5) * 40;
        const z = -(i * DEPTH) - 520 + progress * travel;

        // outside the frustum: stop painting it entirely
        if (z < -2700 || z > 320) {
          card.style.visibility = 'hidden';
          return;
        }
        card.style.visibility = '';

        let opacity = 1;
        if (z < -1750) opacity = Math.max(0, (z + 2700) / 950);
        if (z > -140) opacity = Math.max(0, 1 - (z + 140) / 420);

        card.style.transform = `translate3d(${x}px, ${y}px, ${z.toFixed(1)}px) rotateY(${side * -27}deg)`;
        card.style.opacity = opacity.toFixed(3);
        // Only discs near enough to read take clicks, so a faint one behind can never open the
        // wrong trailer. The rail itself ignores the pointer: its flat box sits at z=0, in front
        // of every disc in 3D hit-testing, and would swallow the click otherwise.
        card.style.pointerEvents = opacity > 0.6 && z > -1600 ? 'auto' : 'none';

        // whichever disc is at reading distance names itself in the readout
        const gap = Math.abs(z + 880);
        if (gap < bestGap) {
          bestGap = gap;
          bestIndex = i;
        }
      });

      if (bestIndex > -1 && bestIndex !== nearest) {
        nearest = bestIndex;
        setNow(games[bestIndex]);
      }
    };

    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(place);
    };

    rail.dataset.flying = 'true';
    place();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      delete rail.dataset.flying;
      cards.forEach((card) => {
        card.style.transform = '';
        card.style.opacity = '';
        card.style.visibility = '';
        card.style.pointerEvents = '';
      });
    };
  }, []);

  return (
    <div ref={sectionRef} className="relative hidden h-[340vh] lg:block motion-reduce:h-auto">
      <div className="sticky top-0 h-screen overflow-hidden [perspective:900px] [perspective-origin:50%_46%] motion-reduce:static motion-reduce:h-auto motion-reduce:overflow-visible motion-reduce:[perspective:none]">
        {/* the light down the far end of the corridor */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(55%_45%_at_50%_42%,var(--glow-accent-faint),transparent_68%)] motion-reduce:hidden"
        />

        {/* v2's chapter rhythm: the row names itself, like every other slide row */}
        <div className="absolute left-[var(--gutter)] top-[16%] z-10 motion-reduce:static motion-reduce:px-[var(--gutter)] motion-reduce:pb-8 motion-reduce:pt-16">
          <p className="eyebrow text-accent">{count}</p>
          <Heading className="mt-4 font-display text-[clamp(1.9rem,3vw,2.7rem)] font-semibold uppercase leading-[0.95]">
            {label}
          </Heading>
        </div>

        <ul
          ref={railRef}
          className="pointer-events-none absolute inset-0 [transform-style:preserve-3d] motion-reduce:static motion-reduce:grid motion-reduce:grid-cols-4 motion-reduce:gap-6 motion-reduce:px-[var(--gutter)] motion-reduce:py-4"
        >
          {games.map((game, index) => (
            <li
              key={game.slug}
              data-disc
              /*
                Resting position is a readable fan. The effect only replaces it
                once the scroll handler is attached, so no-JS is not a blank
                corridor.
              */
              className="pointer-events-auto absolute left-1/2 top-1/2 -ml-[7.5rem] -mt-[11.5rem] w-60 [transform-style:preserve-3d] motion-reduce:static motion-reduce:m-0 motion-reduce:w-auto"
              style={{
                transform: `translate3d(${index % 2 ? 300 : -300}px, ${((index % 4) - 1.5) * 40}px, ${-index * 90}px) rotateY(${(index % 2 ? 1 : -1) * -27}deg)`,
                opacity: index < 4 ? 1 : 0.25,
              }}
            >
              <GameCase
                game={game}
                index={index}
                as={CardHeading}
                className="shadow-[0_40px_80px_-30px_rgb(0_0_0/0.95)]"
              />
            </li>
          ))}
        </ul>

        {/* the readout names whatever disc is at reading distance */}
        <p
          aria-hidden="true"
          className="hud-card absolute bottom-[7%] left-1/2 flex -translate-x-1/2 items-center gap-[1.15rem] whitespace-nowrap rounded-full px-[1.15rem] py-[0.7rem] motion-reduce:hidden"
        >
          <span className="text-[0.95rem]">{now.title}</span>
          <span aria-hidden="true" className="h-[1.1rem] w-px bg-edge-hi" />
          <span className="font-mono text-[0.72rem] text-dim">
            {now.players} {now.players === '1' ? 'player' : 'players'}
          </span>
          <span aria-hidden="true" className="h-[1.1rem] w-px bg-edge-hi" />
          <span className="font-mono text-[0.66rem] uppercase tracking-[0.14em] text-accent">
            {platform.replace('PlayStation ', 'PS')}
          </span>
        </p>
      </div>
    </div>
  );
}
