'use client';

import { useEffect, useState } from 'react';

import { rupees } from '@/lib/admin/billing';

type Props = {
  inPlay: number;
  free: number;
  sessions: number;
  taken: number;
};

/** How long a revealed total stays up before it covers itself again. */
const REVEAL_MS = 15_000;

/**
 * The four numbers worth reading from across the room.
 *
 * Props only, no fetching: the floor already knows its own counts, and the day
 * totals come from the same request, so this never disagrees with the cards
 * below it.
 *
 * Takings are the one figure that should not be readable from across the room,
 * so they start covered — see TakenFigure.
 */
export function SummaryStrip({ inPlay, free, sessions, taken }: Props) {
  return (
    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <Figure label="In play" value={String(inPlay)} live />
      <Figure label="Free" value={String(free)} />
      <Figure label="Sessions today" value={String(sessions)} />
      <TakenFigure taken={taken} />
    </dl>
  );
}

/**
 * The day's takings, hidden until someone asks for them.
 *
 * Deliberately not remembered anywhere: it starts covered on every load and
 * re-covers itself after a few seconds, so the console sitting open on the
 * counter never has the day's money on it. This stops a customer reading it
 * over a shoulder; it is not a permission — anyone who can open the console can
 * reach the same figure on the day sheet.
 */
function TakenFigure({ taken }: { taken: number }) {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (!shown) return;
    const timer = window.setTimeout(() => setShown(false), REVEAL_MS);
    return () => window.clearTimeout(timer);
  }, [shown]);

  return (
    <div className="border border-edge bg-surface px-3 py-2">
      <dt className="font-mono text-[0.62rem] uppercase tracking-[0.16em] text-dimmer">Taken today</dt>
      <dd className="mt-0.5">
        <button
          type="button"
          onClick={() => setShown((was) => !was)}
          aria-pressed={shown}
          aria-label={shown ? 'Hide the takings' : 'Show the takings'}
          className="flex w-full items-baseline justify-between gap-2 text-left transition-colors hover:text-accent"
        >
          {shown ? (
            <span className="font-mono text-2xl leading-none text-paper tabular-nums">{rupees(taken)}</span>
          ) : (
            <span aria-hidden="true" className="font-mono text-2xl leading-none tracking-[0.08em] text-dimmer">
              ₹••••
            </span>
          )}
          <span
            aria-hidden="true"
            className="font-mono text-[0.6rem] uppercase tracking-[0.14em] text-dimmer"
          >
            {shown ? 'Hide' : 'Show'}
          </span>
        </button>
      </dd>
    </div>
  );
}

function Figure({ label, value, live = false }: { label: string; value: string; live?: boolean }) {
  return (
    <div className="border border-edge bg-surface px-3 py-2">
      <dt className="font-mono text-[0.62rem] uppercase tracking-[0.16em] text-dimmer">{label}</dt>
      <dd
        className={`mt-0.5 font-mono text-2xl leading-none tabular-nums ${live ? 'text-live' : 'text-paper'}`}
      >
        {value}
      </dd>
    </div>
  );
}
