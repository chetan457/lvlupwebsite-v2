'use server';

import { revalidatePath } from 'next/cache';

import { supabaseServer } from '@/lib/supabase/server';

import { currentStaff } from './queries';
import type { PaymentMethod } from './types';

/**
 * Every change the console makes.
 *
 * Amounts, idempotency and "is this day already closed" live in the Postgres
 * functions these call, not here: the client sends an intent, the database
 * decides what it costs. Each action returns `{ error }` rather than throwing,
 * so a failed stop shows a message on the card instead of a crash page.
 */

type Result = { error: string | null };

const GENERIC = 'Something went wrong. Try again.';

/** Readable versions of the errors the SQL functions raise. */
function explain(message: string): string {
  if (/already in play/i.test(message)) return 'That station is already in play — refresh the floor.';
  if (/day is closed/i.test(message)) return 'That day is closed. Reopen it before changing anything.';
  if (/not allowed/i.test(message)) return 'Your account cannot do that.';
  if (/only the owner can reopen/i.test(message)) return 'Only the owner can reopen a day.';
  if (/stop every running session/i.test(message)) return 'Stop every running session before closing the day.';
  if (/only a manager or owner can close/i.test(message)) return 'Only a manager or owner can close the day.';
  if (/has not happened yet/i.test(message)) return 'That day has not happened yet.';
  if (/nothing was played/i.test(message)) return 'Nothing was played on that day, so there is nothing to close.';
  if (/station not available/i.test(message)) return 'That station is retired.';
  if (/phone number does not look right/i.test(message)) return 'Check the phone number, or leave it blank.';
  return GENERIC;
}

async function guard() {
  const staff = await currentStaff();
  if (!staff) return { staff: null, error: 'Sign in again.' };
  return { staff, error: null };
}

export async function startSession(
  stationId: string,
  guestName: string,
  players: number,
  phone = '',
): Promise<Result> {
  const { error: denied } = await guard();
  if (denied) return { error: denied };

  const supabase = await supabaseServer();
  const { error } = await supabase.rpc('start_session', {
    p_station: stationId,
    // capped: a guest name is written on a card by a busy person, not pasted
    p_guest: guestName.trim().slice(0, 80) || null,
    p_players: Number.isFinite(players) ? Math.max(1, Math.min(50, Math.trunc(players))) : 1,
    // never required: the database normalises it and rejects only obvious nonsense
    p_phone: phone.trim().slice(0, 24) || null,
  });

  revalidatePath('/admin');
  revalidatePath('/admin/day');
  return { error: error ? explain(error.message) : null };
}

export async function stopSession(sessionId: string, payment: PaymentMethod): Promise<Result> {
  const { error: denied } = await guard();
  if (denied) return { error: denied };

  const supabase = await supabaseServer();
  const { error } = await supabase.rpc('stop_session', { p_session: sessionId, p_payment: payment });

  revalidatePath('/admin');
  revalidatePath('/admin/day');
  return { error: error ? explain(error.message) : null };
}

export async function addStation(input: {
  name: string;
  kindId: string;
  seats: number;
  ratePerHour: number;
}): Promise<Result> {
  const { staff, error: denied } = await guard();
  if (denied || !staff) return { error: denied ?? GENERIC };
  if (staff.role === 'staff') return { error: 'Only a manager or owner can add a station.' };

  const name = input.name.trim().slice(0, 60);
  if (!name) return { error: 'Give the station a name.' };
  // a station at ₹0 bills nothing, for ever, silently — almost always a cleared field
  const rate = Math.trunc(input.ratePerHour);
  if (!Number.isFinite(rate) || rate < 1) return { error: 'Set a rate per hour above zero.' };

  const supabase = await supabaseServer();
  // the floor is ordered by `sort`, so a new station needs its own place in the
  // line: identical values leave Postgres free to reshuffle the grid between
  // refreshes, and a card can move under a thumb that is already on its way down
  const { data: last } = await supabase
    .from('stations')
    .select('sort')
    .order('sort', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase.from('stations').insert({
    name,
    kind_id: input.kindId,
    seats: Math.max(1, Math.min(50, Math.trunc(input.seats) || 1)),
    rate_per_hour: rate,
    sort: (last?.sort ?? 0) + 1,
  });

  revalidatePath('/admin');
  revalidatePath('/admin/stations');
  if (error) return { error: /duplicate key/i.test(error.message) ? 'A station already has that name.' : GENERIC };
  return { error: null };
}

/** Retiring hides a station from the floor; its past sessions stay in the day sheets. */
export async function setStationActive(stationId: string, active: boolean): Promise<Result> {
  const { staff, error: denied } = await guard();
  if (denied || !staff) return { error: denied ?? GENERIC };
  if (staff.role === 'staff') return { error: 'Only a manager or owner can retire a station.' };

  const supabase = await supabaseServer();

  // Retiring a station that is in play would hide a running, billing session:
  // the card leaves the floor, the timer keeps going, and the day cannot be
  // closed because of a session nobody can see to stop.
  if (!active) {
    const { data: live } = await supabase
      .from('play_sessions')
      .select('id')
      .eq('station_id', stationId)
      .is('ended_at', null)
      .maybeSingle();
    if (live) return { error: 'That station is in play. Stop the session on the floor first.' };
  }

  const { error } = await supabase.from('stations').update({ active }).eq('id', stationId);

  revalidatePath('/admin');
  revalidatePath('/admin/stations');
  return { error: error ? GENERIC : null };
}

export async function setStationRate(stationId: string, ratePerHour: number): Promise<Result> {
  const { staff, error: denied } = await guard();
  if (denied || !staff) return { error: denied ?? GENERIC };
  if (staff.role === 'staff') return { error: 'Only a manager or owner can change a rate.' };

  const rate = Math.trunc(ratePerHour);
  if (!Number.isFinite(rate) || rate < 1) return { error: 'Set a rate per hour above zero.' };

  const supabase = await supabaseServer();
  const { error } = await supabase.from('stations').update({ rate_per_hour: rate }).eq('id', stationId);

  // the floor prints the rate on every idle card, so it has to hear about this too
  revalidatePath('/admin');
  revalidatePath('/admin/stations');
  return { error: error ? GENERIC : null };
}

/** The way back from a close pressed by mistake. The SQL refuses anyone but the owner. */
export async function reopenDay(day: string): Promise<Result> {
  const { error: denied } = await guard();
  if (denied) return { error: denied };
  if (!validDay(day)) return { error: 'That is not a real date.' };

  const supabase = await supabaseServer();
  const { error } = await supabase.rpc('reopen_day', { p_day: day });

  revalidatePath('/admin/day');
  return { error: error ? explain(error.message) : null };
}

/** A real calendar date, not merely four-two-two digits: 2026-02-31 reaches Postgres as a cast error. */
function validDay(day: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const parsed = new Date(`${day}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === day;
}

/** The day must be named by the caller: after midnight, "today" is no longer the shift being closed. */
export async function closeDay(day: string): Promise<Result> {
  const { error: denied } = await guard();
  if (denied) return { error: denied };
  if (!validDay(day)) return { error: 'That is not a real date.' };

  const supabase = await supabaseServer();
  const { error } = await supabase.rpc('close_day', { p_day: day });

  revalidatePath('/admin/day');
  return { error: error ? explain(error.message) : null };
}
