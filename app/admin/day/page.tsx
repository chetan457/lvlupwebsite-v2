import { redirect } from 'next/navigation';
import Link from 'next/link';

import { CloseDayForm } from '@/components/admin/close-day-form';
import { DayTable } from '@/components/admin/day-table';
import { businessDay, clockTime, rupees } from '@/lib/admin/billing';
import { ReopenDayForm } from '@/components/admin/reopen-day-form';
import { currentStaff, getClosure, getDaySessions, totalsFor } from '@/lib/admin/queries';
import type { DayTotals } from '@/lib/admin/types';

/**
 * The day sheet: one day of play, and the button that freezes it.
 *
 * Always fresh — a sheet cached for even a minute would show a session that has
 * already been paid for as still running.
 */
export const dynamic = 'force-dynamic';

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/* Shape is not enough: 2026-02-31 passes the pattern, formats as 3 March, and
   reaches Postgres as a cast error this page would render as an empty day. */
function isRealDay(value: string): boolean {
  if (!DAY_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/* UTC in, UTC out: a `day` is a plain calendar date, so nothing here may shift it by a timezone. */
const DAY_LABEL = new Intl.DateTimeFormat('en-IN', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

function dayLabel(day: string): string {
  return DAY_LABEL.format(new Date(`${day}T00:00:00Z`));
}

function shiftDay(day: string, days: number): string {
  const moved = new Date(`${day}T00:00:00Z`);
  moved.setUTCDate(moved.getUTCDate() + days);
  return moved.toISOString().slice(0, 10);
}

export default async function DaySheetPage({
  searchParams,
}: {
  searchParams: Promise<{ day?: string }>;
}) {
  const staff = await currentStaff();
  if (!staff) redirect('/admin/login');

  const today = businessDay();
  const { day: requested } = await searchParams;
  // a hand-typed or stale ?day= falls back to today rather than querying nonsense
  const day = requested && isRealDay(requested) ? requested : today;

  const [sessions, closure] = await Promise.all([getDaySessions(day), getClosure(day)]);
  const live = totalsFor(sessions);
  const frozen = closure;
  // once a day is closed the stored totals are the record, even if a later read disagrees;
  // spread over the live ones so a closure written without totals still shows numbers
  const totals: DayTotals = frozen ? { ...live, ...frozen.totals } : live;

  const running = sessions.filter((row) => !row.ended_at).length;
  const canClose = staff.role === 'owner' || staff.role === 'manager';

  const closedBy = frozen?.closed_by_name ?? null;

  const previous = shiftDay(day, -1);
  const next = shiftDay(day, 1);
  const hasNext = next <= today;

  return (
    <div className="space-y-7">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Day sheet</p>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-paper sm:text-4xl">
            {dayLabel(day)}
          </h1>
          <p className="mt-1 font-mono text-xs text-dimmer tabular-nums">
            {day}
            {day === today ? ' · today' : ''}
          </p>
        </div>

        <nav aria-label="Change day" className="flex items-center gap-2">
          <DayLink href={`/admin/day?day=${previous}`} label="Previous day">
            Previous
          </DayLink>
          {hasNext ? (
            <DayLink href={`/admin/day?day=${next}`} label="Next day">
              Next
            </DayLink>
          ) : (
            // no link into tomorrow: there is nothing there to read
            <span
              aria-disabled="true"
              className="inline-flex min-h-11 items-center border border-edge bg-surface/40 px-4 font-mono text-[0.72rem] uppercase tracking-[0.14em] text-dimmer"
            >
              Next
            </span>
          )}
          {day !== today ? (
            <DayLink href="/admin/day" label="Jump to today">
              Today
            </DayLink>
          ) : null}
        </nav>
      </header>

      {frozen ? (
        <div className="border border-edge-hi bg-surface-hi/60 p-4 sm:p-5" role="status">
          <p className="eyebrow text-accent">Day closed</p>
          <p className="mt-2 text-sm text-paper">
            {closedBy ? `Closed by ${closedBy}` : 'Closed'} at{' '}
            <span className="font-mono tabular-nums">{clockTime(frozen.closed_at)}</span>. The sessions below
            cannot be changed any more. A correction is a new session with a note, never an edit.
          </p>
          <p className="mt-1 text-sm text-dim">
            Takings at closing:{' '}
            <span className="font-mono text-paper tabular-nums">{rupees(totals.total)}</span> over{' '}
            <span className="font-mono text-paper tabular-nums">{totals.sessions}</span> sessions.
          </p>
          {staff.role === 'owner' ? <ReopenDayForm day={day} /> : null}
        </div>
      ) : null}

      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Closed sessions" value={String(totals.sessions)} />
        <Tile label="Billed hours" value={(totals.minutes / 60).toFixed(1)} />
        <Tile label="Cash" value={rupees(totals.cash)} />
        <Tile label="UPI" value={rupees(totals.upi)} />
      </dl>

      <DayTable sessions={sessions} total={totals.total} />

      {!frozen && canClose ? <CloseDayForm day={day} running={running} /> : null}

      {!frozen && !canClose ? (
        <p className="text-sm text-dim">Only a manager or owner closes the day.</p>
      ) : null}
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-edge bg-surface p-4">
      <dt className="eyebrow text-dimmer">{label}</dt>
      <dd className="mt-1.5 font-mono text-2xl text-paper tabular-nums">{value}</dd>
    </div>
  );
}

function DayLink({ href, label, children }: { href: string; label: string; children: string }) {
  return (
    <Link
      href={href}
      aria-label={label}
      className="inline-flex min-h-11 items-center border border-edge-hi bg-room/40 px-4 font-mono text-[0.72rem] uppercase tracking-[0.14em] text-paper transition-colors hover:border-accent hover:text-accent"
    >
      {children}
    </Link>
  );
}
