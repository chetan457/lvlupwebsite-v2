import { hours, type Hours } from '@/content/hours';

/**
 * Opening-hours helpers.
 *
 * These run on the server at request time and on the client for the live
 * badge. Both agree because they take the same `now`, and the server render is
 * never trusted to stay true — the client re-checks after mount.
 */

export function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

export function formatTime(time: string): string {
  const [h, m] = time.split(':').map(Number);
  // a late close is stored as 24:00; "12 am" is the one clock reading people
  // reliably read backwards, so it is spelled out
  if (h % 24 === 0 && m === 0) return 'midnight';
  const hour = h % 24;
  const suffix = hour >= 12 && hour < 24 ? 'pm' : 'am';
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return m === 0 ? `${display} ${suffix}` : `${display}:${String(m).padStart(2, '0')} ${suffix}`;
}

export function formatRange(entry: Hours): string {
  if (!entry.opens || !entry.closes) return 'Closed';
  return `${formatTime(entry.opens)} — ${formatTime(entry.closes)}`;
}

export function forDay(day: number): Hours | undefined {
  return hours.find((h) => h.day === day);
}

export type OpenState = { open: boolean; closesAt: string | null; opensAt: string | null };

const TZ = 'Asia/Kolkata';

const DAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/**
 * The lounge's own wall clock, not the server's.
 *
 * On Vercel the render happens in UTC, so reading `now.getHours()` directly
 * reports the lounge open at half past midnight IST — 19:00 UTC the previous
 * day, still inside Monday's 13:00–23:00 window. Everything time-dependent on
 * the site goes through here instead.
 */
export function istNow(now: Date = new Date()): { day: number; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);

  const read = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? '';

  const day = DAY_INDEX[read('weekday')] ?? now.getUTCDay();
  // some runtimes render midnight as "24" under hour12: false
  const hour = Number(read('hour')) % 24;
  const minute = Number(read('minute'));

  return { day, minutes: hour * 60 + minute };
}

/** Today in Kalyani Nagar, for highlighting the right row of the week. */
export function istDay(now: Date = new Date()): number {
  return istNow(now).day;
}

/**
 * A close time past midnight is written as 24:00 or later, so a Friday that
 * runs to 1 am is "25:00" rather than a second row for Saturday.
 */
export function openState(now: Date = new Date()): OpenState {
  const { day, minutes } = istNow(now);

  const today = forDay(day);
  if (today?.opens && today.closes) {
    const opens = toMinutes(today.opens);
    const closes = toMinutes(today.closes);
    if (minutes >= opens && minutes < closes) {
      return { open: true, closesAt: formatTime(today.closes), opensAt: null };
    }
    if (minutes < opens) {
      return { open: false, closesAt: null, opensAt: formatTime(today.opens) };
    }
  }

  // still inside yesterday's late session?
  const yesterday = forDay((day + 6) % 7);
  if (yesterday?.closes) {
    const overflow = toMinutes(yesterday.closes) - 24 * 60;
    if (overflow > 0 && minutes < overflow) {
      return { open: true, closesAt: formatTime(yesterday.closes), opensAt: null };
    }
  }

  const next = forDay((day + 1) % 7);
  return { open: false, closesAt: null, opensAt: next?.opens ? formatTime(next.opens) : null };
}
