-- Stop the clock without ending the session.
--
-- A bay drops out — the power cuts, the wifi goes, a controller dies, the group
-- goes down for food and leaves their things on the seat. The guest is still
-- here and the bay is still theirs, but they are not playing, and a timer that
-- keeps counting is a bill they will argue with at the counter. Until now the
-- only way out was to stop and restart, which splits one group across two rows,
-- or to discount at the end, which hides the reason in a settlement figure.
--
-- Segments already carry the shape of this: a session is a list of stretches,
-- and the bill is their sum. So a pause is simply a session with no open
-- stretch — nothing is accruing — and a resume opens a new one at whatever the
-- current head count costs. No new columns, no second clock, and a bill that
-- already knows how to add itself up.
--
-- Each pause closes a stretch, and every stretch rounds its last minute up. So
-- pausing costs at most a started minute, the same rule the rest of the billing
-- already uses. Pausing twice in one minute is not free, and should not be.

-- --------------------------------------------------------------- pause -----
create or replace function public.pause_session(p_session uuid)
returns public.play_sessions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.play_sessions;
  v_open public.session_segments;
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

  select * into v_open
    from public.session_segments
   where session_id = p_session and ended_at is null
   for update;

  if not found then
    return v_row;                                   -- already paused; say so quietly
  end if;

  v_minutes := public.billed_minutes(v_open.started_at, now());
  update public.session_segments
     set ended_at = now(),
         billed_minutes = v_minutes,
         amount = public.session_amount(v_open.rate_per_hour, v_minutes)
   where id = v_open.id;

  perform public.write_audit('session.pause', 'play_session', p_session,
          jsonb_build_object('minutes', v_minutes, 'rate', v_open.rate_per_hour,
                             'players', v_open.players));

  return v_row;
end;
$$;

-- -------------------------------------------------------------- resume -----
create or replace function public.resume_session(p_session uuid)
returns public.play_sessions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.play_sessions;
  v_rate integer;
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

  if exists (select 1 from public.session_segments
              where session_id = p_session and ended_at is null) then
    return v_row;                                   -- already running; nothing to do
  end if;

  -- the price that applies now, not the one that applied before the pause: a
  -- rate card edited during the break is the counter's decision, deliberately made
  v_rate := public.rate_for(v_row.station_id, v_row.players);

  insert into public.session_segments (session_id, players, rate_per_hour, started_at)
  values (p_session, v_row.players, v_rate, now());

  update public.play_sessions
     set rate_snapshot = v_rate
   where id = p_session
   returning * into v_row;

  perform public.write_audit('session.resume', 'play_session', p_session,
          jsonb_build_object('rate', v_rate, 'players', v_row.players));

  return v_row;
end;
$$;

-- ------------------------------------------------- players, while paused ---
-- Changing the head count on a paused session must not quietly start the clock
-- again: it sets the number and the price that will apply on resume, and leaves
-- the session paused.
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
  v_paused boolean;
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
  v_paused := not found;

  if not v_paused then
    v_minutes := public.billed_minutes(v_open.started_at, now());
    update public.session_segments
       set ended_at = now(),
           billed_minutes = v_minutes,
           amount = public.session_amount(v_open.rate_per_hour, v_minutes)
     where id = v_open.id;

    insert into public.session_segments (session_id, players, rate_per_hour, started_at)
    values (p_session, v_players, v_rate, now());
  end if;

  -- rate_snapshot means "the price in force right now", which is what the floor
  -- card prints. The bill does not read it: stop_session sums the segments,
  -- each of which kept its own rate.
  update public.play_sessions
     set players = v_players,
         rate_snapshot = v_rate
   where id = p_session
   returning * into v_row;

  perform public.write_audit('session.players', 'play_session', p_session,
          jsonb_build_object('from', v_before, 'to', v_players, 'rate', v_rate,
                             'closed_minutes', v_minutes, 'paused', v_paused));

  return v_row;
end;
$$;

revoke execute on function
  public.pause_session(uuid),
  public.resume_session(uuid)
from anon, public;

-- ------------------------------------------------------------ realtime ----
-- A pause changes no row in play_sessions — only the segment under it — so the
-- floor's existing subscription would not hear about it and a second phone
-- would keep showing a running timer until it polled. Publish the segments too.
do $$
begin
  alter publication supabase_realtime add table public.session_segments;
exception when duplicate_object then null;
end $$;
