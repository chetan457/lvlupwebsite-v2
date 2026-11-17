/**
 * Dev-only timing for the console's Supabase round trips.
 *
 * Prints one line per step to the `next dev` terminal so the owner can name
 * the slowest screen and count sequential round trips (docs/perf-seo-plan.md
 * §5.6). In a production build `devTiming` is false and nothing is measured or
 * printed — and nothing is ever sent to the browser (no Server-Timing header).
 */

export const devTiming = process.env.NODE_ENV === 'development';

/** Milliseconds since `start`, rounded, for a log line. */
export function since(start: number): number {
  return Math.round(performance.now() - start);
}

export function logTiming(screen: string, parts: Record<string, number>): void {
  if (!devTiming) return;
  const detail = Object.entries(parts)
    .map(([step, ms]) => `${step} ${ms}ms`)
    .join(' · ');
  console.log(`[admin timing] ${screen}: ${detail}`);
}
