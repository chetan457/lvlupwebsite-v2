import 'server-only';

import { cache } from 'react';

import { supabaseConfigured, supabaseServer } from '@/lib/supabase/server';

import { businessDay } from './billing';
import type { DayClosure, DayTotals, FloorStation, PlaySession, RateTier, Staff, StationKind } from './types';

/**
 * A failed read is raised, not swallowed.
 *
 * Returning [] on error makes a database outage look like a quiet night: the
 * day sheet shows nothing played, the floor offers to set up stations that
 * already exist, and — worst — an unread closure makes a closed day look open,
 * so pressing Close overwrites the original record. app/admin/error.tsx turns
 * the throw into a retry screen. `currentStaff` is the deliberate exception: it
 * fails closed, to the sign-in page.
 */
function unwrap<T>(result: { data: T | null; error: { message: string } | null }, what: string): T | null {
  if (result.error) throw new Error(`Could not load ${what}: ${result.error.message}`);
  return result.data;
}

/** A closed session with the station it was played on, for the day sheet. */
export type DaySession = PlaySession & { station_name: string };

/*
 * Who-is-signed-in lookups are wrapped in React `cache()`: memoised for one
 * server request only, so a second call in the same render costs nothing. Never
 * 'use cache', unstable_cache or any other cross-request cache on these or on
 * any admin query — that would hand one person's staff row or data to another.
 */

/** The staff row for a signed-in user, or null when it is missing or switched off. */
async function activeStaff(supabase: Awaited<ReturnType<typeof supabaseServer>>, id: string): Promise<Staff | null> {
  const { data } = await supabase.from('staff').select('*').eq('id', id).maybeSingle();
  return data && data.active ? (data as Staff) : null;
}

/**
 * The signed-in staff member, or null when nobody is signed in or the account is switched off.
 *
 * Asks the Auth server (`getUser()`), so a session revoked elsewhere is refused
 * here even if its access token has not expired yet. This is the gate every
 * Server Action passes before it writes; pages use `pageStaff()` instead.
 */
export const currentStaff = cache(async (): Promise<Staff | null> => {
  if (!supabaseConfigured) return null;
  const supabase = await supabaseServer();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;

  return activeStaff(supabase, auth.user.id);
});

/**
 * The signed-in user's id, from the access token, verified on this server.
 *
 * The project signs its tokens with an asymmetric key (ES256), so `getClaims()`
 * checks the signature locally against the project's public keys, which
 * auth-js fetches once and keeps for ten minutes per server process — no Auth
 * round trip per page. With a legacy HS256 secret it would fall back to
 * `getUser()` and still be correct, just not faster.
 *
 * Trade-off, accepted in docs/perf-seo-plan.md §5.1: a token is trusted until
 * it expires, so a sign-out on another device is enforced by middleware (which
 * still calls `getUser()` on every /admin request) rather than here. Deactivating
 * someone still takes effect on the next page load: the `staff` row is always
 * re-read, and RLS (`is_staff()`) refuses every read for an inactive row.
 *
 * Fails closed: any error, an unverifiable token or a missing `sub` is "nobody".
 */
export const pageUserId = cache(async (): Promise<string | null> => {
  if (!supabaseConfigured) return null;
  try {
    const supabase = await supabaseServer();
    const { data, error } = await supabase.auth.getClaims();
    if (error || !data) return null;
    const sub = data.claims.sub;
    return typeof sub === 'string' && sub ? sub : null;
  } catch {
    return null;
  }
});

/** The staff member a page renders for: `pageUserId()` plus their active `staff` row. */
export const pageStaff = cache(async (): Promise<Staff | null> => {
  const id = await pageUserId();
  if (!id) return null;
  return activeStaff(await supabaseServer(), id);
});

/** Every bookable station with whatever is playing on it. One query, so the floor cannot show a stale pairing. */
export async function getFloor(): Promise<FloorStation[]> {
  const supabase = await supabaseServer();

  const [stationRows, openRows] = await Promise.all([
    supabase
      .from('stations')
      .select('*, station_kinds(label), station_rates(players, rate_per_hour)')
      .eq('active', true)
      // name breaks ties: equal sort values let Postgres reorder the grid between
      // refreshes, and a card must never move under a thumb on its way down
      .order('sort', { ascending: true })
      .order('name', { ascending: true }),
    supabase.from('play_sessions').select('*').is('ended_at', null),
  ]);

  const stations = unwrap(stationRows, 'the floor');
  const open = unwrap(openRows, 'the sessions in play');
  const live = new Map((open ?? []).map((row) => [row.station_id as string, row as PlaySession]));

  return (stations ?? []).map((row) => {
    const { station_kinds: kind, station_rates: rates, ...station } = row as typeof row & {
      station_kinds: { label: string } | null;
      station_rates: RateTier[] | null;
    };
    return {
      ...(station as Omit<FloorStation, 'kind_label' | 'rates' | 'open_session'>),
      kind_label: kind?.label ?? station.kind_id,
      rates: [...(rates ?? [])].sort((a, b) => a.players - b.players),
      open_session: live.get(station.id) ?? null,
    };
  });
}

export async function getStationKinds(): Promise<StationKind[]> {
  const supabase = await supabaseServer();
  const result = await supabase.from('station_kinds').select('*').order('sort', { ascending: true });
  return (unwrap(result, 'the station kinds') ?? []) as StationKind[];
}

/** Every station, retired ones included, for the stations screen. */
export async function getAllStations() {
  const supabase = await supabaseServer();
  const result = await supabase
    .from('stations')
    .select('*, station_kinds(label), station_rates(players, rate_per_hour)')
    .order('sort', { ascending: true })
    .order('name', { ascending: true });
  return (unwrap(result, 'the stations') ?? []).map((row) => {
    const { station_kinds: kind, station_rates: rates, ...station } = row as typeof row & {
      station_kinds: { label: string } | null;
      station_rates: RateTier[] | null;
    };
    return {
      ...station,
      kind_label: kind?.label ?? station.kind_id,
      rates: [...(rates ?? [])].sort((a, b) => a.players - b.players),
    } as FloorStation;
  });
}

export async function getDaySessions(day: string = businessDay()): Promise<DaySession[]> {
  const supabase = await supabaseServer();
  const result = await supabase
    .from('play_sessions')
    .select('*, stations(name)')
    .eq('day', day)
    .order('started_at', { ascending: false });

  return (unwrap(result, 'the day sheet') ?? []).map((row) => {
    const { stations: station, ...session } = row as typeof row & { stations: { name: string } | null };
    return { ...(session as PlaySession), station_name: station?.name ?? '—' };
  });
}

/** Totals for one day, counting only closed sessions — a running one has no amount yet. */
export function totalsFor(sessions: DaySession[]): DayTotals {
  return sessions.reduce<DayTotals>(
    (sum, row) => {
      if (!row.ended_at) return sum;
      sum.sessions += 1;
      sum.minutes += row.billed_minutes ?? 0;
      sum.total += row.amount ?? 0;
      if (row.payment_method === 'cash') sum.cash += row.amount ?? 0;
      if (row.payment_method === 'upi') sum.upi += row.amount ?? 0;
      return sum;
    },
    { sessions: 0, minutes: 0, total: 0, cash: 0, upi: 0 },
  );
}

export async function getClosure(day: string = businessDay()): Promise<DayClosure | null> {
  const supabase = await supabaseServer();
  // the join puts a name on the close without a second round trip to the roster
  const result = await supabase
    .from('day_closures')
    .select('*, staff:closed_by(display_name)')
    .eq('day', day)
    .maybeSingle();

  const data = unwrap(result, 'the closing record');
  if (!data) return null;

  const { staff, ...closure } = data as typeof data & { staff: { display_name: string } | null };
  return { ...(closure as Omit<DayClosure, 'closed_by_name'>), closed_by_name: staff?.display_name ?? null };
}

export async function getStaffRoster(): Promise<Staff[]> {
  const supabase = await supabaseServer();
  const result = await supabase.from('staff').select('*').order('created_at', { ascending: true });
  return (unwrap(result, 'the roster') ?? []) as Staff[];
}
