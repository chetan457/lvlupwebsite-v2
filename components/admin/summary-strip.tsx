import { rupees } from '@/lib/admin/billing';

type Props = {
  inPlay: number;
  free: number;
  sessions: number;
  taken: number;
};

/**
 * The four numbers worth reading from across the room.
 *
 * Props only, no fetching: the floor already knows its own counts, and the day
 * totals come from the same request, so this never disagrees with the cards
 * below it.
 */
export function SummaryStrip({ inPlay, free, sessions, taken }: Props) {
  return (
    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <Figure label="In play" value={String(inPlay)} live />
      <Figure label="Free" value={String(free)} />
      <Figure label="Sessions today" value={String(sessions)} />
      <Figure label="Taken today" value={rupees(taken)} />
    </dl>
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
