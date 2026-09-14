import { GameCase } from '@/components/game-case';
import type { Slide } from '@/content/chapters';

const TAGS = {
  live: { label: 'Live', text: 'text-live', dot: 'bg-live' },
  soon: { label: 'Soon', text: 'text-dimmer', dot: 'bg-dimmer' },
  best: { label: 'Best value', text: 'text-accent', dot: 'bg-accent' },
} as const;

const pad = (n: number) => String(n).padStart(2, '0');

export function SlideCard({
  slide,
  index,
  total,
  as: Heading = 'h4',
}: {
  slide: Slide;
  index: number;
  total: number;
  as?: 'h3' | 'h4';
}) {
  const tag = slide.tag ? TAGS[slide.tag] : null;

  // the game rack uses the same case as v1's games section: cover art, player count, note below
  if (slide.game) {
    return (
      <article className="group w-[min(56vw,14rem)] lg:w-[16.5rem]">
        <GameCase
          game={slide.game}
          index={index}
          as={Heading}
          className="transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:-translate-y-1"
        />
        {/* backed, because this row flies over the tunnel and bare text lost to the lit cubes */}
        <p className="mt-2 rounded-[8px] border border-edge bg-room/85 px-3 py-2.5 text-[0.88rem] leading-snug text-dim backdrop-blur-md">
          {slide.body}
        </p>
      </article>
    );
  }

  return (
    <article className="hud-card relative flex h-full min-h-[22rem] w-[min(80vw,21rem)] flex-col p-6 lg:min-h-[27rem] lg:w-[23rem] lg:p-7">
      <span aria-hidden="true" className="brackets" />

      <header className="flex items-center justify-between gap-3 font-mono text-[0.66rem] uppercase tracking-[0.18em] text-dim">
        <span>
          <span className="text-paper">{pad(index + 1)}</span>
          <span className="text-dimmer"> / {pad(total)}</span>
        </span>
        {tag ? (
          <span className={`flex items-center gap-2 ${tag.text}`}>
            <span aria-hidden="true" className={`h-1.5 w-1.5 ${tag.dot}`} />
            {tag.label}
          </span>
        ) : null}
      </header>

      <p className="mt-12 font-mono text-[0.7rem] uppercase leading-snug tracking-[0.14em] text-accent-mute">
        {slide.kicker}
      </p>
      <Heading className="mt-3 font-display text-[1.65rem] font-semibold uppercase leading-[1.02]">{slide.title}</Heading>
      {slide.body ? <p className="mt-4 text-[0.94rem] leading-relaxed text-dim">{slide.body}</p> : null}

      {slide.stat ? (
        <div className="mt-auto flex items-end justify-between gap-4 border-t border-edge pt-5">
          <span className="eyebrow text-[0.62rem]">{slide.stat.label}</span>
          <span className="font-mono text-[1.35rem] leading-none text-paper">{slide.stat.value}</span>
        </div>
      ) : null}
    </article>
  );
}
