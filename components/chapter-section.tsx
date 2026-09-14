import { Fragment } from 'react';

import { BookButton } from '@/components/book-button';
import { GamesCorridor } from '@/components/games-corridor';
import { SlideCard } from '@/components/slide-card';
import type { Chapter } from '@/content/chapters';

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * One level: a title card, a brief, then a row of slides.
 *
 * Server-rendered and complete without JavaScript. The scroll director adds the
 * motion afterwards — split-line title reveals, and on desktop, pinning the
 * slide row so vertical scroll drives it sideways. On a phone the same row is a
 * native swipe with scroll snap, so there is nothing to pin and nothing to break.
 */
export function ChapterSection({ chapter, index }: { chapter: Chapter; index: number }) {
  const first = index === 0;
  const Title = first ? 'h1' : 'h2';
  const Label = first ? 'h2' : 'h3';
  const CardHeading = first ? 'h3' : 'h4';
  const titleId = `${chapter.id}-title`;

  return (
    <section id={chapter.id} data-chapter={index} aria-labelledby={titleId} className="relative">
      <div
        data-intro={first ? '' : undefined}
        className="shell flex min-h-[100dvh] flex-col justify-end pb-[16dvh] pt-32 lg:justify-center lg:pb-0"
      >
        <p className="eyebrow flex items-center gap-3">
          <span className="text-accent">LVL {pad(index + 1)}</span>
          <span aria-hidden="true" className="h-px w-10 bg-edge-hi" />
          <span data-scramble>{chapter.overline}</span>
        </p>
        <Title id={titleId} data-split className="display mt-6">
          {chapter.title.map((line, i) => (
            <Fragment key={line}>
              {/* a real space between lines, or the heading's text reads "PS5 bythe hour" */}
              {i > 0 ? ' ' : null}
              <span className="block">{line}</span>
            </Fragment>
          ))}
        </Title>
      </div>

      <div className="shell flex min-h-[90dvh] items-center py-24">
        <div className="max-w-[40rem]">
          <p data-reveal className="lead">
            {chapter.heading}
          </p>
          <p data-reveal className="mt-6 max-w-[54ch] text-[1.02rem] text-dim">
            {chapter.body}
          </p>

          <dl data-reveal className="mt-10 grid border-t border-edge-hi sm:grid-cols-3">
            {chapter.stats.map((stat) => (
              <div
                key={stat.label}
                className="border-b border-edge py-4 sm:border-b-0 sm:border-r sm:px-4 sm:first:pl-0 sm:last:border-r-0"
              >
                <dt className="eyebrow text-[0.62rem]">{stat.label}</dt>
                <dd className="mt-2 font-mono text-[0.92rem] leading-snug text-paper">{stat.value}</dd>
              </div>
            ))}
          </dl>

          <div data-reveal className="mt-10">
            <BookButton size="lg" message={chapter.cta.message}>
              {chapter.cta.label}
            </BookButton>
          </div>
        </div>
      </div>

      {chapter.id === 'games' ? (
        <>
          {/* the game rack moves like v1's: a swipeable rack on phones, the corridor on desktop */}
          <div className="lg:hidden">
            <SlideRow chapter={chapter} Label={Label} CardHeading={CardHeading} pinned={false} />
          </div>
          <GamesCorridor
            label={chapter.slidesLabel}
            count={`${pad(chapter.slides.length)} ${chapter.slidesUnit}`}
            Heading={Label}
            CardHeading={CardHeading}
          />
        </>
      ) : (
        <SlideRow chapter={chapter} Label={Label} CardHeading={CardHeading} pinned />
      )}
    </section>
  );
}

/**
 * A row of slides. Pinned rows are picked up by the scroll director on desktop
 * and driven sideways; an unpinned row is always a native swipe with snap.
 */
function SlideRow({
  chapter,
  Label,
  CardHeading,
  pinned,
}: {
  chapter: Chapter;
  Label: 'h2' | 'h3';
  CardHeading: 'h3' | 'h4';
  pinned: boolean;
}) {
  return (
    <div
      data-slides={pinned ? '' : undefined}
      className={`relative pb-24 ${pinned ? 'lg:flex lg:h-[100dvh] lg:items-center lg:overflow-hidden lg:pb-0' : ''}`}
    >
        <ol
          data-track
          aria-label={chapter.slidesLabel}
          className="no-scrollbar flex snap-x snap-mandatory scroll-px-[var(--gutter)] gap-4 overflow-x-auto px-[var(--gutter)] lg:snap-none lg:gap-6 lg:overflow-visible"
        >
          <li className="flex w-[min(62vw,16rem)] shrink-0 snap-start flex-col justify-between py-2 lg:w-[19rem] lg:py-6">
            <div>
              <p className="eyebrow text-accent">
                {pad(chapter.slides.length)} {chapter.slidesUnit}
              </p>
              <Label className="mt-4 font-display text-[clamp(1.9rem,3vw,2.7rem)] font-semibold uppercase leading-[0.95]">
                {chapter.slidesLabel}
              </Label>
            </div>
            <p aria-hidden="true" className="eyebrow mt-8 flex items-center gap-3">
              <span className="lg:hidden">Swipe</span>
              <span className="hidden lg:inline">Keep scrolling</span>
              <span className="h-px w-10 bg-edge-hi" />
            </p>
          </li>

          {chapter.slides.map((slide, i) => (
            <li key={slide.id} className="shrink-0 snap-start">
              <SlideCard slide={slide} index={i} total={chapter.slides.length} as={CardHeading} />
            </li>
          ))}

          {/* trailing gutter: flex overflow drops the track's right padding from scrollWidth */}
          <li aria-hidden="true" className="w-px shrink-0 lg:w-[var(--gutter)]" />
        </ol>
      </div>
  );
}
