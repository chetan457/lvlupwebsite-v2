-- LVL UP ops console — initial schema.
--
-- Run once against the Supabase project (SQL editor, or `supabase db push`).
-- Everything the console does goes through this file: the tables, the row-level
-- security that makes a Supabase anon key safe to ship to the browser, and the
-- three functions that own billing so no client can invent an amount.
--
-- Money is whole rupees (integer). Times are timestamptz; the business day is
-- derived in Asia/Kolkata so a session that ends after midnight still belongs
-- to the night it started.

-- gen_random_uuid() is in pg_catalog from PG 13, so nothing here needs an
-- extension; kept for older local Postgres only, and out of the public schema.
create extension if not exists "pgcrypto" with schema extensions;

-- ---------------------------------------------------------------- staff ----
create table if not exists public.staff (
  -- restrict, not cascade: deleting an auth user must not quietly take the
  -- staff row (and with it the audit trail's only name) with it. Offboarding is
  -- `active = false`, which every policy and the sign-in check already honour.
  id uuid primary key references auth.users (id) on delete restrict,
  display_name text not null,
  role text not null default 'staff' check (role in ('owner', 'manager', 'staff')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

comment on table public.staff is 'One row per sign-in account; mirrors auth.users with a role.';

-- Helpers used by every policy below. SECURITY DEFINER so a policy can read
-- staff without recursing into staff's own policies.
create or replace function public.current_staff_role()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select role from public.staff where id = auth.uid() and active;
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.staff where id = auth.uid() and active);
$$;

create or replace function public.is_manager()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.current_staff_role() in ('owner', 'manager');
$$;

-- --------------------------------------------------------- station kinds ----
create table if not exists public.station_kinds (
  id text primary key,
  label text not null,
  default_rate integer not null check (default_rate >= 0),
  sort integer not null default 0
);

comment on table public.station_kinds is 'PS5 bay, VR arena, racing rig, PC, party room. New kinds are rows, not code.';

-- -------------------------------------------------------------- stations ----
create table if not exists public.stations (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  kind_id text not null references public.station_kinds (id),
  seats integer not null default 2 check (seats between 1 and 50),
  rate_per_hour integer not null check (rate_per_hour >= 0),
  active boolean not null default true,
  sort integer not null default 0,
  created_at timestamptz not null default now()
);

-- -------------------------------------------------------------- sessions ----
create table if not exists public.play_sessions (
  id uuid primary key default gen_random_uuid(),
  station_id uuid not null references public.stations (id),
  guest_name text not null default 'Walk-in',
  players integer not null default 1 check (players between 1 and 50),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  -- copied at start: a later price change must never rewrite an old bill
  rate_snapshot integer not null,
  billed_minutes integer,
  amount integer,
  payment_method text check (payment_method in ('cash', 'upi', 'pending')),
  note text,
  -- set null, never cascade: a session is a financial record and outlives whoever rang it up
  opened_by uuid references public.staff (id) on delete set null,
  closed_by uuid references public.staff (id) on delete set null,
  -- the business day this session belongs to, in local time
  day date generated always as (((started_at at time zone 'Asia/Kolkata'))::date) stored,
  created_at timestamptz not null default now()
);

-- one live session per station, enforced by the database rather than by the UI
-- The database's own opinion of a well-formed session, so a future direct write
-- path or a bug in stop_session cannot leave a negative or half-closed bill.
alter table public.play_sessions
  drop constraint if exists sessions_amount_sane,
  drop constraint if exists sessions_minutes_sane,
  drop constraint if exists sessions_ends_after_start,
  drop constraint if exists sessions_closed_is_complete;
alter table public.play_sessions
  add constraint sessions_amount_sane check (amount is null or amount >= 0),
  add constraint sessions_minutes_sane check (billed_minutes is null or billed_minutes >= 30),
  add constraint sessions_ends_after_start check (ended_at is null or ended_at >= started_at),
  add constraint sessions_closed_is_complete check (
    ended_at is null or (billed_minutes is not null and amount is not null and payment_method is not null)
  );

create unique index if not exists play_sessions_one_live_per_station
  on public.play_sessions (station_id)
  where ended_at is null;

create index if not exists play_sessions_day_idx on public.play_sessions (day desc, started_at desc);
create index if not exists play_sessions_open_idx on public.play_sessions (started_at desc) where ended_at is null;

-- -------------------------------------------------------- day closures -----
create table if not exists public.day_closures (
  day date primary key,
  closed_at timestamptz not null default now(),
  closed_by uuid references public.staff (id) on delete set null,
  totals jsonb not null default '{}'::jsonb
);

-- ------------------------------------------------------------ audit log ----
create table if not exists public.audit_log (
  id bigserial primary key,
  actor uuid references public.staff (id) on delete set null,
  -- the name is copied in as well, so a nulled actor stays attributable
  actor_name text,
  action text not null,
  entity text not null,
  entity_id uuid,
  detail jsonb not null default '{}'::jsonb,
  at timestamptz not null default now()
);

create index if not exists audit_log_at_idx on public.audit_log (at desc);
create index if not exists audit_log_actor_idx on public.audit_log (actor, at desc);
create index if not exists play_sessions_station_idx on public.play_sessions (station_id);

-- One writer for the log, so every entry carries the actor's name as well as
-- their id and nothing has to join a table that may be gone.
--
-- These inserts reach audit_log by table ownership: a SECURITY DEFINER function
-- runs as the owner, and an owner is exempt from RLS unless the table is set to
-- FORCE ROW LEVEL SECURITY. Do not add FORCE here without also adding an insert
-- policy, or every start and stop on the floor will fail.
create or replace function public.write_audit(
  p_action text,
  p_entity text,
  p_entity_id uuid,
  p_detail jsonb default '{}'::jsonb
)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  insert into public.audit_log (actor, actor_name, action, entity, entity_id, detail)
  values (auth.uid(), (select display_name from public.staff where id = auth.uid()),
          p_action, p_entity, p_entity_id, p_detail);
$$;

-- ========================================================== billing ========
-- One definition of what an hour costs, used by stop_session and by the
-- running total the floor shows. Changing the rule here changes it everywhere.
create or replace function public.billed_minutes(p_started timestamptz, p_ended timestamptz)
returns integer
language sql
immutable
as $$
  select greatest(
    30,                                            -- first half hour is the minimum charge
    ceil(ceil(extract(epoch from (p_ended - p_started)) / 60.0) / 15.0)::integer * 15
  );
$$;

create or replace function public.session_amount(p_rate integer, p_minutes integer)
returns integer
language sql
immutable
as $$
  select round(p_rate * p_minutes / 60.0)::integer;
$$;

-- ========================================================== operations ====
-- Start. Fails loudly if the station is already in play or retired, so two
-- phones pressing Start at the same moment cannot open two sessions.
create or replace function public.start_session(
  p_station uuid,
  p_guest text default null,
  p_players integer default 1,
  p_note text default null
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
begin
  if not public.is_staff() then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  select * into v_station from public.stations where id = p_station;
  if not found or not v_station.active then
    raise exception 'station not available' using errcode = 'P0002';
  end if;

  insert into public.play_sessions (station_id, guest_name, players, note, rate_snapshot, opened_by)
  values (
    p_station,
    coalesce(nullif(btrim(p_guest), ''), 'Walk-in'),
    greatest(1, coalesce(p_players, 1)),
    nullif(btrim(p_note), ''),
    v_station.rate_per_hour,
    auth.uid()
  )
  returning * into v_row;

  perform public.write_audit('session.start', 'play_session', v_row.id,
          jsonb_build_object('station', v_station.name, 'rate', v_station.rate_per_hour));

  return v_row;
exception
  when unique_violation then
    -- only the live-session index means "already in play"; anything else (a broken
    -- sequence, a later index) must surface as itself rather than as floor advice
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint <> 'play_sessions_one_live_per_station' then raise; end if;
    raise exception 'station already in play' using errcode = '23505';
end;
$$;

-- Stop. Idempotent: pressing it twice returns the already-closed row rather
-- than billing twice. The amount is computed here, never sent by the client.
create or replace function public.stop_session(
  p_session uuid,
  p_payment text default 'cash'
)
returns public.play_sessions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.play_sessions;
  v_minutes integer;
begin
  if not public.is_staff() then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  -- taken before the row lock, and on the same key close_day uses, so a stop and
  -- a close racing at the counter resolve in one order instead of deadlocking
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

  v_minutes := public.billed_minutes(v_row.started_at, now());

  update public.play_sessions
     set ended_at = now(),
         billed_minutes = v_minutes,
         amount = public.session_amount(v_row.rate_snapshot, v_minutes),
         payment_method = coalesce(nullif(p_payment, ''), 'cash'),
         closed_by = auth.uid()
   where id = p_session
   returning * into v_row;

  perform public.write_audit('session.stop', 'play_session', v_row.id,
          jsonb_build_object('minutes', v_row.billed_minutes, 'amount', v_row.amount, 'payment', v_row.payment_method));

  return v_row;
end;
$$;

-- Close the day: freezes its sessions and stores the totals that were true at
-- closing. A correction after this is a new row with a reason, never an edit.
create or replace function public.close_day(p_day date)
returns public.day_closures
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.day_closures;
  v_totals jsonb;
begin
  if not public.is_manager() then
    raise exception 'only a manager or owner can close the day' using errcode = '42501';
  end if;
  -- Closing a day that has not happened yet is always a mis-tap, and it is the
  -- expensive kind: a closed future day refuses every Start and every Stop on it.
  if p_day > ((now() at time zone 'Asia/Kolkata'))::date then
    raise exception 'that day has not happened yet' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.play_sessions where day = p_day) then
    raise exception 'nothing was played on that day' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('lvlup.day:' || p_day::text, 0));

  if exists (select 1 from public.play_sessions where day = p_day and ended_at is null) then
    raise exception 'stop every running session first' using errcode = 'P0001';
  end if;

  select jsonb_build_object(
           'sessions', count(*),
           'minutes', coalesce(sum(billed_minutes), 0),
           'total', coalesce(sum(amount), 0),
           'cash', coalesce(sum(amount) filter (where payment_method = 'cash'), 0),
           'upi', coalesce(sum(amount) filter (where payment_method = 'upi'), 0)
         )
    into v_totals
    from public.play_sessions
   where day = p_day;

  insert into public.day_closures (day, closed_by, totals)
  values (p_day, auth.uid(), v_totals)
  on conflict (day) do update set totals = excluded.totals, closed_at = now(), closed_by = auth.uid()
  returning * into v_row;

  perform public.write_audit('day.close', 'day', null, v_totals || jsonb_build_object('day', p_day));

  return v_row;
end;
$$;

-- Reopening is the way back from a close pressed by mistake. Owner only, and
-- it leaves its own line in the audit log, so a reopened day is never silent.
create or replace function public.reopen_day(p_day date)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if public.current_staff_role() <> 'owner' then
    raise exception 'only the owner can reopen a day' using errcode = '42501';
  end if;

  delete from public.day_closures where day = p_day;

  perform public.write_audit('day.reopen', 'day', null, jsonb_build_object('day', p_day));
end;
$$;

-- A closed day is read-only from here on.
create or replace function public.guard_closed_day()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_days date[];
begin
  -- `day` is a stored generated column, so NEW.day is still null in a BEFORE
  -- trigger: derive it from started_at instead. Both sides are checked, so a row
  -- can be neither dragged out of a closed day nor dropped into one.
  v_days := array_remove(array[
    case when tg_op <> 'DELETE' then ((new.started_at at time zone 'Asia/Kolkata'))::date end,
    case when tg_op <> 'INSERT' then old.day end
  ], null);

  if exists (select 1 from public.day_closures where day = any (v_days)) then
    raise exception 'that day is closed' using errcode = 'P0001';
  end if;

  -- returning NEW on a DELETE returns null, which silently cancels the delete
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists play_sessions_closed_day on public.play_sessions;
create trigger play_sessions_closed_day
  before insert or update or delete on public.play_sessions
  for each row execute function public.guard_closed_day();

-- ========================================================== row security ==
alter table public.staff enable row level security;
alter table public.station_kinds enable row level security;
alter table public.stations enable row level security;
alter table public.play_sessions enable row level security;
alter table public.day_closures enable row level security;
alter table public.audit_log enable row level security;

-- staff: everyone signed in sees the roster; only an owner changes it
drop policy if exists staff_read on public.staff;
create policy staff_read on public.staff for select using (public.is_staff());
drop policy if exists staff_write on public.staff;
create policy staff_write on public.staff for all
  using (public.current_staff_role() = 'owner')
  with check (public.current_staff_role() = 'owner');

-- station kinds and stations: all staff read, managers and owners change
drop policy if exists kinds_read on public.station_kinds;
create policy kinds_read on public.station_kinds for select using (public.is_staff());
drop policy if exists kinds_write on public.station_kinds;
create policy kinds_write on public.station_kinds for all using (public.is_manager()) with check (public.is_manager());

drop policy if exists stations_read on public.stations;
create policy stations_read on public.stations for select using (public.is_staff());
drop policy if exists stations_write on public.stations;
create policy stations_write on public.stations for all using (public.is_manager()) with check (public.is_manager());

-- Sessions are READ-ONLY to every client.
--
-- A policy can say who may write, never which columns, so "staff may update a
-- session" would also mean "staff may set amount to 0 from a phone with the
-- public key, leaving no trace in the log". Every write goes through
-- start_session / stop_session, which run as the owner and bypass RLS.
drop policy if exists sessions_read on public.play_sessions;
create policy sessions_read on public.play_sessions for select using (public.is_staff());
drop policy if exists sessions_insert on public.play_sessions;
drop policy if exists sessions_update on public.play_sessions;

-- Same reasoning for closures: close_day and reopen_day are the only writers,
-- and both leave a line in the audit log. A direct DELETE would not.
drop policy if exists closures_read on public.day_closures;
create policy closures_read on public.day_closures for select using (public.is_staff());
drop policy if exists closures_write on public.day_closures;

-- the log is readable by owners and managers and is never edited by hand
drop policy if exists audit_read on public.audit_log;
create policy audit_read on public.audit_log for select using (public.is_manager());

-- ========================================================== grants ========
-- Belt and braces behind the policies above: even if a future migration adds a
-- permissive policy by accident, the privilege to write these tables is gone.
revoke insert, update, delete on public.play_sessions from anon, authenticated;
revoke insert, update, delete on public.day_closures from anon, authenticated;
revoke insert, update, delete on public.audit_log from anon, authenticated;

-- Nothing signed-out has any business calling these. Each already refuses an
-- anonymous caller; this stops the call from costing anything at all.
revoke execute on function
  public.start_session(uuid, text, integer, text),
  public.stop_session(uuid, text),
  public.close_day(date),
  public.reopen_day(date),
  public.write_audit(text, text, uuid, jsonb)
from anon, public;

-- ========================================================== realtime ======
-- so a second phone sees a timer start without refreshing. Wrapped because
-- `alter publication ... add table` is the one statement here that cannot be
-- run twice, and this file has to stay re-runnable.
do $$
begin
  alter publication supabase_realtime add table public.play_sessions;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.stations;
exception when duplicate_object then null;
end $$;
