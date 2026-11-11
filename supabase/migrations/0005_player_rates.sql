-- Price by how many people are playing.
--
-- A PS5 bay is ₹150 an hour for one, ₹250 for two, ₹350 for three, ₹450 for
-- four. That is not a single rate with arithmetic behind it — a lounge changes
-- the second head differently from the fourth — so each step is a row the
-- counter can edit without a release.
--
-- stations.rate_per_hour stays as the fallback for a station with no tiers and
-- for a head count above the top tier (six people on a four-seat rate card pay
-- the four-person rate, not nothing).

create table if not exists public.station_rates (
  station_id uuid not null references public.stations (id) on delete cascade,
  players integer not null check (players between 1 and 50),
  rate_per_hour integer not null check (rate_per_hour >= 0),
  primary key (station_id, players)
);

comment on table public.station_rates is 'Per-hour price for a given head count on a station. Highest matching tier wins.';

alter table public.station_rates enable row level security;

drop policy if exists station_rates_read on public.station_rates;
create policy station_rates_read on public.station_rates for select using (public.is_staff());
drop policy if exists station_rates_write on public.station_rates;
create policy station_rates_write on public.station_rates for all
  using (public.is_manager()) with check (public.is_manager());

-- The price for this many people on this station: their own tier, else the
-- nearest tier below them, else the station's flat rate.
create or replace function public.rate_for(p_station uuid, p_players integer)
returns integer
language sql
stable
as $$
  select coalesce(
    (select r.rate_per_hour
       from public.station_rates r
      where r.station_id = p_station
        and r.players <= greatest(1, coalesce(p_players, 1))
      order by r.players desc
      limit 1),
    (select s.rate_per_hour from public.stations s where s.id = p_station)
  );
$$;

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

revoke execute on function public.rate_for(uuid, integer) from anon, public;
