import { BookButton } from '@/components/book-button';
import { LiveBadge } from '@/components/live-badge';
import { ButtonLink } from '@/components/ui/button';
import { weekOrder } from '@/content/hours';
import { reviews } from '@/content/reviews';
import { addressLines, site } from '@/content/site';
import { formatRange, istDay, openState } from '@/lib/hours';

/**
 * The last level: where the lounge is, when it is open, and what people said.
 * Its formation in the scene is the map pin.
 */
export function Finale({ index }: { index: number }) {
  // first paint only; LiveBadge re-checks against the lounge's clock after hydration
  const state = openState();
  const today = istDay();

  return (
    <section id="find" data-chapter={index} aria-labelledby="find-title" className="relative">
      <div className="shell flex min-h-[100dvh] flex-col justify-end pb-[16dvh] pt-32 lg:justify-center lg:pb-0">
        <p className="eyebrow flex items-center gap-3">
          <span className="text-accent">LVL {String(index + 1).padStart(2, '0')}</span>
          <span aria-hidden="true" className="h-px w-10 bg-edge-hi" />
          <span data-scramble>Continue?</span>
        </p>
        <h2 id="find-title" data-split className="display mt-6">
          <span className="block">Find</span>{' '}
          <span className="block">the room</span>
        </h2>
      </div>

      <div className="shell grid gap-14 py-24 lg:grid-cols-[1.15fr_1fr] lg:items-start lg:gap-20">
        <div className="max-w-[40rem]">
          <div data-reveal>
            <LiveBadge initial={state} />
          </div>
          <address data-reveal className="lead mt-6 not-italic">
            {addressLines.map((line) => (
              <span key={line} className="block">
                {line}
              </span>
            ))}
          </address>
          <p data-reveal className="mt-6 text-dim">
            {site.landmark}. {site.transit}.
          </p>

          <div data-reveal className="mt-10 flex flex-wrap gap-3">
            <BookButton size="lg" />
            <ButtonLink href={site.mapsUrl} variant="ghost" size="lg">
              Open in Maps
            </ButtonLink>
          </div>

          <dl data-reveal className="mt-12 grid gap-6 border-t border-edge-hi pt-6 sm:grid-cols-2">
            <div>
              <dt className="eyebrow">Call</dt>
              <dd className="mt-2">
                <a href={`tel:${site.phone}`} className="inline-flex min-h-11 items-center font-mono text-paper transition-colors hover:text-accent">
                  {site.phoneDisplay}
                </a>
              </dd>
            </div>
            <div>
              <dt className="eyebrow">Instagram</dt>
              <dd className="mt-2">
                <a
                  href={site.instagram}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-11 items-center font-mono text-paper transition-colors hover:text-accent"
                >
                  {site.instagramHandle}
                </a>
              </dd>
            </div>
          </dl>
        </div>

        <div data-reveal className="hud-card relative p-6 lg:p-8">
          <span aria-hidden="true" className="brackets" />
          <h3 className="eyebrow">Opening hours</h3>
          <table className="mt-5 w-full text-[0.95rem]">
            <caption className="sr-only">Opening hours, Monday to Sunday</caption>
            <tbody>
              {weekOrder.map((entry) => {
                const isToday = entry.day === today;
                return (
                  <tr key={entry.day} className={`border-b border-edge last:border-b-0 ${isToday ? 'text-paper' : 'text-dim'}`}>
                    <th scope="row" className="py-3 text-left font-normal">
                      {entry.label}
                      {isToday ? (
                        <span className="ml-3 font-mono text-[0.62rem] uppercase tracking-[0.18em] text-accent">Today</span>
                      ) : null}
                    </th>
                    <td className="py-3 text-right font-mono text-[0.88rem]">{formatRange(entry)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="shell py-20">
        <h3 className="eyebrow">
          Google reviews · <span className="font-mono text-paper">{site.rating.value}</span> from{' '}
          <span className="font-mono text-paper">{site.rating.count}</span>
        </h3>
        <ul className="mt-8 grid gap-4 md:grid-cols-2">
          {reviews.map((review, i) => (
            <li key={review.name} data-reveal className={`hud-card relative p-6 lg:p-8 ${i === 0 ? 'md:row-span-2' : ''}`}>
              <span aria-hidden="true" className="brackets" />
              <p className="flex gap-1">
                <span className="sr-only">{review.stars} out of 5 stars</span>
                {Array.from({ length: 5 }, (_, star) => (
                  <span
                    key={star}
                    aria-hidden="true"
                    className={`h-2.5 w-2.5 ${star < review.stars ? 'bg-accent' : 'bg-edge-hi'}`}
                  />
                ))}
              </p>
              <blockquote className={`mt-5 ${i === 0 ? 'font-display text-[1.35rem] leading-snug' : 'text-paper/90'}`}>
                {review.text}
              </blockquote>
              <p className="eyebrow mt-6">
                {review.name} · {review.source}
              </p>
            </li>
          ))}
        </ul>
      </div>

      <footer className="shell flex flex-wrap items-center justify-between gap-4 border-t border-edge py-8 pb-28 font-mono text-[0.66rem] uppercase tracking-[0.18em] text-dimmer lg:pb-8">
        <span>
          © {new Date().getFullYear()} {site.legalName}
        </span>
        <span>
          {site.address.locality}, {site.address.city}
        </span>
      </footer>
    </section>
  );
}
