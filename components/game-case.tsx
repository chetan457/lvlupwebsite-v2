import Image from 'next/image';

import { covers } from '@/content/game-covers';
import type { Game } from '@/content/games';

/**
 * A game case, with real cover art where we have it — ported from v1's
 * components/game-case.tsx so both sites show the rack the same way.
 *
 * `content/game-covers.ts` and public/games/ are copied from v1, where
 * scripts/fetch-covers.mjs generates them. A title in that map gets its actual
 * cover; a title missing from it gets the generated case below, so the rack is
 * never half-empty while covers are being sourced.
 *
 * The generated case is built from the one thing we do own: the title, set like
 * a cover, over a mark chosen deterministically from the slug. The same game
 * gets the same case on every render and on every device.
 *
 * Accent appears on one case in six, not on all of them.
 */

const VARIANTS = 6;

/** Stable across server and client; the same slug must always pick the same face. */
function variantFor(slug: string): number {
  let hash = 0;
  for (let i = 0; i < slug.length; i += 1) {
    hash = (hash * 31 + slug.charCodeAt(i)) >>> 0;
  }
  return hash % VARIANTS;
}

/** Six grounds, all graphite, differing in where the light falls. */
const GROUNDS = [
  'linear-gradient(158deg, var(--color-surface-hi) 0%, var(--color-surface) 46%, var(--color-room-deep) 100%)',
  'linear-gradient(200deg, var(--color-surface) 0%, var(--color-room-deep) 62%, var(--color-surface-hi) 100%)',
  'linear-gradient(120deg, var(--color-room-deep) 0%, var(--color-surface-hi) 54%, var(--color-room-deep) 100%)',
  'linear-gradient(178deg, var(--color-surface-hi) 0%, var(--color-room-deep) 74%)',
  'linear-gradient(145deg, var(--color-surface) 0%, var(--color-surface-hi) 38%, var(--color-room-deep) 100%)',
  'linear-gradient(215deg, var(--color-room-deep) 0%, var(--color-surface) 48%, var(--color-surface-hi) 100%)',
];

/** The mark behind the title. Geometry only, so it costs nothing to render. */
function Mark({ variant, lit }: { variant: number; lit: boolean }) {
  const ink = lit ? 'var(--glow-accent)' : 'var(--edge-lit)';

  switch (variant) {
    case 0: // a band cutting the corner
      return (
        <span
          aria-hidden="true"
          className="absolute -right-6 -top-10 h-40 w-24 rotate-[24deg]"
          style={{ background: `linear-gradient(to bottom, ${ink}, transparent)` }}
        />
      );
    case 1: // a disc bleeding off the top edge
      return (
        <span
          aria-hidden="true"
          className="absolute -top-12 left-1/2 h-32 w-32 -translate-x-1/2 rounded-full"
          style={{ background: `radial-gradient(circle, ${ink}, transparent 68%)` }}
        />
      );
    case 2: // scanlines
      return (
        <span
          aria-hidden="true"
          className="absolute inset-x-0 top-0 h-1/2 opacity-70"
          style={{
            backgroundImage: `repeating-linear-gradient(to bottom, ${ink} 0 1px, transparent 1px 7px)`,
            maskImage: 'linear-gradient(to bottom, #000, transparent)',
            WebkitMaskImage: 'linear-gradient(to bottom, #000, transparent)',
          }}
        />
      );
    case 3: // a field of dots, thinning downward
      return (
        <span
          aria-hidden="true"
          className="absolute inset-0"
          style={{
            backgroundImage: `radial-gradient(${ink} 1px, transparent 1px)`,
            backgroundSize: '11px 11px',
            maskImage: 'linear-gradient(to bottom, #000 10%, transparent 70%)',
            WebkitMaskImage: 'linear-gradient(to bottom, #000 10%, transparent 70%)',
          }}
        />
      );
    case 4: // a wedge climbing from the base
      return (
        <span
          aria-hidden="true"
          className="absolute inset-x-0 bottom-0 h-2/3"
          style={{
            background: `linear-gradient(to top right, ${ink}, transparent 58%)`,
            clipPath: 'polygon(0 100%, 100% 22%, 100% 100%)',
          }}
        />
      );
    default: // two arcs, top right
      return (
        <span
          aria-hidden="true"
          className="absolute -right-10 top-6 h-28 w-28 rounded-full border-2"
          style={{ borderColor: ink, borderRightColor: 'transparent', borderBottomColor: 'transparent' }}
        />
      );
  }
}

export function GameCase({
  game,
  index,
  className = '',
  as: Heading = 'h3',
}: {
  game: Game;
  index: number;
  className?: string;
  /** v2 nests the rack a level deeper than v1, so the heading level is the caller's. */
  as?: 'h3' | 'h4';
}) {
  const cover = covers[game.slug];
  const variant = variantFor(game.slug);
  // one case in six carries the accent, so the rack has rhythm without turning blue
  const lit = variant === 1;

  if (cover) {
    return (
      <div
        className={`relative flex aspect-[3/4] flex-col justify-end overflow-hidden rounded-[10px] border border-edge ${className}`}
      >
        <Image
          src={cover.src}
          alt=""
          fill
          loading="lazy"
          sizes="(max-width: 64rem) 56vw, 16.5rem"
          {...(cover.blur ? { placeholder: 'blur' as const, blurDataURL: cover.blur } : {})}
          className="object-cover"
        />

        {/* the title stays readable whatever the artwork behind it does */}
        <div
          className="relative z-10 p-3 pt-10"
          style={{
            background:
              'linear-gradient(to top, rgb(var(--ch-room) / 0.95) 0%, rgb(var(--ch-room) / 0.8) 55%, rgb(var(--ch-room) / 0) 100%)',
          }}
        >
          <Heading className="text-[0.98rem] font-semibold leading-[1.15] tracking-[-0.02em] text-paper">
            {game.title}
          </Heading>
        </div>

        <span className="absolute right-2 top-2 z-10 rounded-full border border-edge-hi bg-room-deep/80 px-2 py-1 font-mono text-[0.68rem] leading-none text-dim">
          {game.players}
          <span className="sr-only">{game.players === '1' ? ' player' : ' players'}</span>
        </span>
      </div>
    );
  }

  return (
    <div
      className={`relative flex aspect-[3/4] flex-col justify-end overflow-hidden rounded-[10px] border border-edge p-3 ${className}`}
      style={{ background: GROUNDS[variant] }}
    >
      <Mark variant={variant} lit={lit} />

      {/* the spine, so a rack of these reads as shelved cases */}
      <span
        aria-hidden="true"
        className="absolute inset-y-0 left-0 w-[7px] border-r border-edge-hi"
        style={{ background: 'linear-gradient(180deg, var(--edge-lit), var(--edge-lit-fade))' }}
      />

      <span className="absolute right-2 top-2 rounded-full border border-edge-hi bg-room-deep/70 px-2 py-1 font-mono text-[0.68rem] leading-none text-dim">
        {game.players}
        <span className="sr-only">{game.players === '1' ? ' player' : ' players'}</span>
      </span>

      {/* The title is the artwork, so it is also the heading — printed once. */}
      <Heading
        className="relative z-10 pl-1 pr-1 text-[0.98rem] font-semibold leading-[1.15] tracking-[-0.02em] text-paper"
        style={{ textWrap: 'balance' }}
      >
        {game.title}
      </Heading>

      <span
        aria-hidden="true"
        className="relative z-10 mt-1.5 pl-1 font-mono text-[0.62rem] tracking-[0.14em] text-dimmer"
      >
        {String(index + 1).padStart(2, '0')}
      </span>
    </div>
  );
}
