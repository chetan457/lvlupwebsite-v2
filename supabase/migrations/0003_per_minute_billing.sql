-- Bill the time on the timer, not a block.
--
-- The first cut charged a 30-minute minimum and then rounded up in 15-minute
-- blocks, so a two-minute session read ₹60 on a ₹120/hr bay. The floor wants
-- the bill to track the clock: the rate, pro-rated over the minutes actually
-- played.
--
-- Any started minute still counts in full — the till cannot settle in
-- fractions, and a stopwatch that bills by the second argues with a guest over
-- ten rupees — so 61 seconds is 2 minutes.
--
-- To reintroduce a minimum later, change `greatest(1, …)` here and the mirror
-- in lib/admin/billing.ts together; nothing else needs touching.

create or replace function public.billed_minutes(p_started timestamptz, p_ended timestamptz)
returns integer
language sql
immutable
as $$
  select greatest(1, ceil(extract(epoch from (p_ended - p_started)) / 60.0)::integer);
$$;

-- the old constraint assumed the 30-minute floor
alter table public.play_sessions drop constraint if exists sessions_minutes_sane;
alter table public.play_sessions
  add constraint sessions_minutes_sane check (billed_minutes is null or billed_minutes >= 1);
