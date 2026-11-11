-- Settle at a different figure than the clock worked out.
--
-- The timer proposes; the counter decides. An hour on a ₹150 bay that gets
-- settled at ₹100 — a regular, a goodwill rounding, a half-hour the screen
-- froze for — has to be recordable as what was actually taken, or the day sheet
-- stops matching the cash drawer and staff start keeping a second tally on paper.
--
-- Both figures are kept: `quoted_amount` is what the rule said, `amount` is what
-- the guest paid. The difference is visible on the day sheet and in the audit
-- log, so a discount is a decision with a name on it rather than a silent edit.

alter table public.play_sessions
  add column if not exists quoted_amount integer;

alter table public.play_sessions drop constraint if exists sessions_quoted_sane;
alter table public.play_sessions
  add constraint sessions_quoted_sane check (quoted_amount is null or quoted_amount >= 0);

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

  v_minutes := public.billed_minutes(v_row.started_at, now());
  v_quoted := public.session_amount(v_row.rate_snapshot, v_minutes);
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
                             'amount', v_row.amount, 'payment', v_row.payment_method)
          || case when v_settled <> v_quoted
                  then jsonb_build_object('settled_off_quote', v_settled - v_quoted)
                  else '{}'::jsonb end);

  return v_row;
end;
$$;

-- the two-argument version would otherwise linger as an ambiguous overload
drop function if exists public.stop_session(uuid, text);

revoke execute on function public.stop_session(uuid, text, integer) from anon, public;
