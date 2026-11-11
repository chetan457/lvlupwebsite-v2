/**
 * The billing rules, for display only.
 *
 * The database owns the real numbers (billed_minutes / session_amount, now in
 * supabase/migrations/0003_per_minute_billing.sql). These mirror them so a
 * running session can show what it has cost so far without a round trip. If one
 * changes, change both: the SQL is what a guest actually pays.
 */

/**
 * The time on the timer, in whole minutes.
 *
 * Any started minute counts in full: a till cannot settle in fractions, and a
 * clock that bills by the second starts arguments over ten rupees. So 61
 * seconds is 2 minutes, and there is no minimum beyond the first one.
 */
export function billedMinutes(startedAt: string | Date, now: number = Date.now()): number {
  const started = typeof startedAt === 'string' ? Date.parse(startedAt) : startedAt.getTime();
  return Math.max(1, Math.ceil(Math.max(0, now - started) / 60000));
}

export function sessionAmount(ratePerHour: number, minutes: number): number {
  return Math.round((ratePerHour * minutes) / 60);
}

/** What a session has run up so far, at this instant. */
export function runningAmount(ratePerHour: number, startedAt: string, now: number = Date.now()): number {
  return sessionAmount(ratePerHour, billedMinutes(startedAt, now));
}

/**
 * How a settled bill differs from the figure the clock worked out.
 *
 * Derived rather than stored: the two amounts are the facts, and a label that
 * can disagree with them is worse than no label. A quote of zero has no
 * meaningful percentage, so it reports none.
 */
export type Settlement = {
  kind: 'exact' | 'discount' | 'extra';
  /** Signed whole percent against the quote, or null when the quote was zero. */
  percent: number | null;
  difference: number;
  label: string;
};

export function settlement(quoted: number | null | undefined, settled: number | null | undefined): Settlement {
  const q = quoted ?? 0;
  const s = settled ?? 0;
  const difference = s - q;
  if (difference === 0) return { kind: 'exact', percent: 0, difference: 0, label: 'As the clock' };

  const percent = q === 0 ? null : Math.round((difference / q) * 100);
  const kind = difference < 0 ? 'discount' : 'extra';
  const sign = difference < 0 ? '−' : '+';
  const size = percent === null ? rupees(Math.abs(difference)) : `${Math.abs(percent)}%`;
  return { kind, percent, difference, label: `${sign}${size} ${kind}` };
}

/**
 * What an hour costs for this many people: their own tier, else the nearest
 * tier below, else the station's flat rate. Mirrors rate_for() in
 * supabase/migrations/0005_player_rates.sql, which is what actually charges.
 */
export function rateFor(
  tiers: { players: number; rate_per_hour: number }[],
  flatRate: number,
  players: number,
): number {
  const wanted = Math.max(1, Math.trunc(players) || 1);
  const match = tiers
    .filter((tier) => tier.players <= wanted)
    .sort((a, b) => b.players - a.players)[0];
  return match ? match.rate_per_hour : flatRate;
}

export function rupees(amount: number | null | undefined): string {
  return `₹${Math.round(amount ?? 0).toLocaleString('en-IN')}`;
}

/** Elapsed time as h:mm:ss, for a timer that is counting up. */
export function elapsed(startedAt: string, now: number = Date.now()): string {
  const total = Math.max(0, Math.floor((now - Date.parse(startedAt)) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (v: number) => String(v).padStart(2, '0');
  return (h > 0 ? `${h}:` : '') + `${pad(m)}:${pad(s)}`;
}

const TIME = new Intl.DateTimeFormat('en-IN', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: true,
  timeZone: 'Asia/Kolkata',
});

export function clockTime(value: string | number | Date): string {
  return TIME.format(typeof value === 'string' ? new Date(value) : value);
}

/** Today's business day in Nadiad, as the YYYY-MM-DD the `day` column uses. */
export function businessDay(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(now);
}
