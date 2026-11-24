-- Two things the counter needs that the schema could not express:
-- a group that changes size mid-session, and a session that should never
-- have been started.
--
-- 1. SEGMENTS. One person plays for ten minutes, a friend joins for five, then
--    two more sit down. At ₹150 / ₹250 / ₹450 an hour that is three prices in
--    one session, and a single `players` column with a single `rate_snapshot`
--    can only tell one of those three stories. So a session is now a row plus
--    an ordered list of segments: a head count, the rate it was charged at, and
--    the minutes it lasted. The bill is the sum.
--
--    Each segment rounds its own part-minute up, the same rule a whole session
--    already used. Three head-count changes therefore cost at most three extra
--    started minutes — a few rupees — which is the honest reading of "any
--    started minute counts in full".
--
-- 2. CANCEL. Start pressed on Bay 02 when the guests sat at Bay 03 is a mistake
--    that currently has to be billed to be cleared, which puts a fake ₹7
--    session in the day sheet for ever. cancel_session deletes the row outright
--    and leaves the whole story in the audit log instead. It is deliberately
--    narrow: nothing that has been billed, nothing on a closed day, and — for
--    anyone who is not a manager or owner — nothing older than ten minutes,
--    because "delete the session and keep the cash" is the oldest trick at a
--    counter and a time limit is what makes it visible.

-- ------------------------------------------------------------- segments ----
create table if not exists public.session_segments (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.play_sessions (id) on delete cascade,
  players integer not null check (players between 1 and 50),
  -- the price in force for this stretch, copied in: a later rate-card edit must
  -- not rewrite a bill that has already been quoted at the counter
  rate_per_hour integer not null check (rate_per_hour >= 0),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  billed_minutes integer,
  amount integer,
  constraint segment_ends_after_start check (ended_at is null or ended_at >= started_at),
  constraint segment_closed_is_complete check (
    ended_at is null or (billed_minutes is not null and amount is not null)
  )
);

comment on table public.session_segments is
  'A stretch of one session at one head count. The bill is the sum of its segments.';

-- one open stretch per session: two would each believe they are the current price
create unique index if not exists session_segments_one_open
  on public.session_segments (session_id)
  where ended_at is null;

create index if not exists session_segments_session_idx
  on public.session_segments (session_id, started_at);

-- Backfill: every session that exists becomes a single segment, so the sums
-- below are correct for history as well as for what starts after this migration.
insert into public.session_segments
  (session_id, players, rate_per_hour, started_at, ended_at, billed_minutes, amount)
select s.id, s.players, s.rate_snapshot, s.started_at, s.ended_at,
       s.billed_minutes, coalesce(s.quoted_amount, s.amount)
  from public.play_sessions s
 where not exists (select 1 from public.session_segments g where g.session_id = s.id);

alter table public.session_segments enable row level security;

-- Read-only to every client, for the same reason sessions are: a policy cannot
-- say "only these columns", and an editable amount with no audit line is how a
-- day sheet quietly stops matching the drawer. The functions below are the only writers.
drop policy if exists segments_read on public.session_segments;
create policy segments_read on public.session_segments for select using (public.is_staff());

revoke insert, update, delete on public.session_segments from anon, authenticated;

-- --------------------------------------------------------------- start -----
-- Same as 0005 but it opens the first segment too.
create or replace function public.start_session(
  p_station uuid,
  p_guest text default null,
  p_players integer default 1,
  p_note text default null,
  p_phone text default null
)
returns public.play_sessions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_station public.stations;
  v_row public.play_sessions;
  v_constraint text;
  v_phone text;
  v_players integer;
  v_rate integer;
begin
  if not public.is_staff() then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  select * into v_station from public.stations where id = p_station;
  if not found or not v_station.active then
    raise exception 'station not available' using errcode = 'P0002';
  end if;

  v_players := greatest(1, coalesce(p_players, 1));
  v_rate := public.rate_for(p_station, v_players);

  -- spaces, dashes and brackets are how people write a number, not how we store one
  v_phone := nullif(regexp_replace(coalesce(p_phone, ''), '[^0-9+]', '', 'g'), '');
  if v_phone is not null and v_phone !~ '^\+?[0-9]{6,15}$' then
    raise exception 'that phone number does not look right' using errcode = 'P0001';
  end if;

  insert into public.play_sessions (station_id, guest_name, players, note, guest_phone, rate_snapshot, opened_by)
  values (
    p_station,
    coalesce(nullif(btrim(p_guest), ''), 'Walk-in'),
    v_players,
    nullif(btrim(p_note), ''),
    v_phone,
    v_rate,
    auth.uid()
  )
  returning * into v_row;

  insert into public.session_segments (session_id, players, rate_per_hour, started_at)
  values (v_row.id, v_players, v_rate, v_row.started_at);

  perform public.write_audit('session.start', 'play_session', v_row.id,
          jsonb_build_object('station', v_station.name, 'players', v_players, 'rate', v_rate));

  return v_row;
exception
  when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint <> 'play_sessions_one_live_per_station' then raise; end if;
    raise exception 'station already in play' using errcode = '23505';
end;
$$;

-- ------------------------------------------------------- change the group --
-- Someone joins or leaves. The stretch at the old head count is closed and
-- priced there and then; a new one opens at the new price. Nothing already
-- played is re-rated, in either direction.
create or replace function public.set_session_players(p_session uuid, p_players integer)
returns public.play_sessions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.play_sessions;
  v_open public.session_segments;
  v_before integer;
  v_players integer;
  v_rate integer;
  v_minutes integer;
begin
  if not public.is_staff() then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  v_players := greatest(1, least(50, coalesce(p_players, 1)));

  perform pg_advisory_xact_lock(hashtextextended('lvlup.day:' ||
    (select day::text from public.play_sessions where id = p_session), 0));

  select * into v_row from public.play_sessions where id = p_session for update;
  if not found then
    raise exception 'session not found' using errcode = 'P0002';
  end if;
  if v_row.ended_at is not null then
    raise exception 'that session is already billed' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.day_closures where day = v_row.day) then
    raise exception 'that day is closed' using errcode = 'P0001';
  end if;
  if v_row.players = v_players then
    return v_row;                                   -- nothing changed; no segment, no audit line
  end if;

  v_before := v_row.players;                        -- v_row is re-read after the update below
  v_rate := public.rate_for(v_row.station_id, v_players);

  select * into v_open
    from public.session_segments
   where session_id = p_session and ended_at is null
   for update;

  if found then
    v_minutes := public.billed_minutes(v_open.started_at, now());
    update public.session_segments
       set ended_at = now(),
           billed_minutes = v_minutes,
           amount = public.session_amount(v_open.rate_per_hour, v_minutes)
     where id = v_open.id;
  end if;

  insert into public.session_segments (session_id, players, rate_per_hour, started_at)
  values (p_session, v_players, v_rate, now());

  -- rate_snapshot now means "the price in force right now", which is what the
  -- floor card prints. The bill does not read it any more: stop_session sums
  -- the segments, each of which kept its own rate.
  update public.play_sessions
     set players = v_players,
         rate_snapshot = v_rate
   where id = p_session
   returning * into v_row;

  perform public.write_audit('session.players', 'play_session', p_session,
          jsonb_build_object('from', v_before, 'to', v_players, 'rate', v_rate,
                             'closed_minutes', v_minutes));

  return v_row;
end;
$$;

-- ---------------------------------------------------------------- stop -----
-- Closes the open segment, then bills the sum of all of them.
create or replace function public.stop_session(
  p_session uuid,
  p_payment text default 'cash',
  p_amount integer default null
)
returns public.play_sessions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.play_sessions;
  v_open public.session_segments;
  v_seg_minutes integer;
  v_minutes integer;
  v_quoted integer;
  v_settled integer;
begin
  if not public.is_staff() then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('lvlup.day:' ||
    (select day::text from public.play_sessions where id = p_session), 0));

  select * into v_row from public.play_sessions where id = p_session for update;
  if not found then
    raise exception 'session not found' using errcode = 'P0002';
  end if;
  if v_row.ended_at is not null then
    return v_row;                                   -- already closed; say so quietly
  end if;
  if exists (select 1 from public.day_closures where day = v_row.day) then
    raise exception 'that day is closed' using errcode = 'P0001';
  end if;

  select * into v_open
    from public.session_segments
   where session_id = p_session and ended_at is null
   for update;

  if found then
    v_seg_minutes := public.billed_minutes(v_open.started_at, now());
    update public.session_segments
       set ended_at = now(),
           billed_minutes = v_seg_minutes,
           amount = public.session_amount(v_open.rate_per_hour, v_seg_minutes)
     where id = v_open.id;
  end if;

  select coalesce(sum(billed_minutes), 0), coalesce(sum(amount), 0)
    into v_minutes, v_quoted
    from public.session_segments
   where session_id = p_session;

  -- a session from before segments existed, or one whose segments went missing,
  -- still has to be billable: fall back to the old whole-session arithmetic
  if v_minutes < 1 then
    v_minutes := public.billed_minutes(v_row.started_at, now());
    v_quoted := public.session_amount(v_row.rate_snapshot, v_minutes);
  end if;

  v_settled := coalesce(p_amount, v_quoted);

  if v_settled < 0 then
    raise exception 'a bill cannot be negative' using errcode = 'P0001';
  end if;
  -- A fat-fingered extra zero is far likelier than a guest paying ten times the
  -- rate. The ₹2,000 floor keeps short sessions settleable at a party-sized
  -- figure while still catching a stray digit on a ₹2 clock.
  if v_settled > greatest(v_quoted * 10, 2000) then
    raise exception 'that amount looks wrong' using errcode = 'P0001';
  end if;

  update public.play_sessions
     set ended_at = now(),
         billed_minutes = v_minutes,
         quoted_amount = v_quoted,
         amount = v_settled,
         payment_method = coalesce(nullif(p_payment, ''), 'cash'),
         closed_by = auth.uid()
   where id = p_session
   returning * into v_row;

  perform public.write_audit('session.stop', 'play_session', v_row.id,
          jsonb_build_object('minutes', v_row.billed_minutes, 'quoted', v_quoted,
                             'amount', v_row.amount, 'payment', v_row.payment_method,
                             'segments', (select count(*) from public.session_segments where session_id = p_session))
          || case when v_settled <> v_quoted
                  then jsonb_build_object('settled_off_quote', v_settled - v_quoted)
                  else '{}'::jsonb end);

  return v_row;
end;
$$;

-- -------------------------------------------------------------- cancel -----
-- The way out of a Start that should not have happened. The row goes; the
-- record of it going stays in the audit log, with who, when, how long the
-- timer had been running and why.
create or replace function public.cancel_session(p_session uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.play_sessions;
  v_station text;
  v_minutes integer;
begin
  if not public.is_staff() then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('lvlup.day:' ||
    (select day::text from public.play_sessions where id = p_session), 0));

  select * into v_row from public.play_sessions where id = p_session for update;
  if not found then
    raise exception 'session not found' using errcode = 'P0002';
  end if;
  if v_row.ended_at is not null then
    raise exception 'that session is already billed' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.day_closures where day = v_row.day) then
    raise exception 'that day is closed' using errcode = 'P0001';
  end if;

  v_minutes := public.billed_minutes(v_row.started_at, now());

  -- A mis-tap is noticed in the first minute or two. An hour-old session being
  -- deleted is either a long-running mistake or money walking out of the
  -- drawer, and either way it is a decision for whoever runs the shift.
  if v_minutes > 10 and not public.is_manager() then
    raise exception 'only a manager or owner can delete a session this old' using errcode = '42501';
  end if;

  select name into v_station from public.stations where id = v_row.station_id;

  -- written before the delete: after it there is no row left to describe
  perform public.write_audit('session.cancel', 'play_session', p_session,
          jsonb_build_object('station', v_station, 'guest', v_row.guest_name,
                             'players', v_row.players, 'rate', v_row.rate_snapshot,
                             'started_at', v_row.started_at, 'minutes_on_the_clock', v_minutes,
                             'reason', nullif(btrim(coalesce(p_reason, '')), '')));

  delete from public.play_sessions where id = p_session;   -- segments go with it
end;
$$;

-- Nothing signed-out has any business calling these.
revoke execute on function
  public.set_session_players(uuid, integer),
  public.cancel_session(uuid, text)
from anon, public;
