-- An optional phone number on a session.
--
-- Optional on purpose: a walk-in who does not want to give a number must never
-- be a reason not to start the timer. What it buys later is a repeat-customer
-- count, a WhatsApp receipt, and a way to reach whoever left a controller behind.
--
-- Stored as digits with an optional leading +, so the same person is the same
-- string whether staff typed spaces, dashes or neither.

alter table public.play_sessions
  add column if not exists guest_phone text;

alter table public.play_sessions
  drop constraint if exists sessions_phone_sane;
alter table public.play_sessions
  add constraint sessions_phone_sane check (guest_phone is null or guest_phone ~ '^\+?[0-9]{6,15}$');

create index if not exists play_sessions_phone_idx on public.play_sessions (guest_phone)
  where guest_phone is not null;

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
begin
  if not public.is_staff() then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  select * into v_station from public.stations where id = p_station;
  if not found or not v_station.active then
    raise exception 'station not available' using errcode = 'P0002';
  end if;

  -- spaces, dashes and brackets are how people write a number, not how we store one
  v_phone := nullif(regexp_replace(coalesce(p_phone, ''), '[^0-9+]', '', 'g'), '');
  if v_phone is not null and v_phone !~ '^\+?[0-9]{6,15}$' then
    raise exception 'that phone number does not look right' using errcode = 'P0001';
  end if;

  insert into public.play_sessions (station_id, guest_name, players, note, guest_phone, rate_snapshot, opened_by)
  values (
    p_station,
    coalesce(nullif(btrim(p_guest), ''), 'Walk-in'),
    greatest(1, coalesce(p_players, 1)),
    nullif(btrim(p_note), ''),
    v_phone,
    v_station.rate_per_hour,
    auth.uid()
  )
  returning * into v_row;

  perform public.write_audit('session.start', 'play_session', v_row.id,
          jsonb_build_object('station', v_station.name, 'rate', v_station.rate_per_hour));

  return v_row;
exception
  when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint <> 'play_sessions_one_live_per_station' then raise; end if;
    raise exception 'station already in play' using errcode = '23505';
end;
$$;

-- the old four-argument version would otherwise linger as an overload
drop function if exists public.start_session(uuid, text, integer, text);

revoke execute on function public.start_session(uuid, text, integer, text, text) from anon, public;
