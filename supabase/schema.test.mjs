import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PGlite } from '@electric-sql/pglite';

/**
 * The schema's test suite: `npm run test:db`.
 *
 * Runs 0001_init.sql and seed.sql against an embedded Postgres, then exercises
 * the parts that decide what a guest pays and who may change it — billing
 * boundaries, one live session per station, idempotent stops, a frozen day, and
 * the policies and grants that keep clients out of the money. No Docker, no
 * server, no network: it is safe to run before every push, and it catches the
 * errors that would otherwise surface as a half-applied migration on the live
 * project.
 *
 * It cannot test row-level security enforcement itself — PGlite has one
 * superuser, and a superuser is exempt from RLS — so it asserts the shape of
 * the policies and grants instead, and the role checks inside the functions.
 */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OWNER = '11111111-1111-1111-1111-111111111111';
const MANAGER = '22222222-2222-2222-2222-222222222222';
const STAFF = '33333333-3333-3333-3333-333333333333';

const db = await PGlite.create();
let pass = 0;
let fail = 0;

const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name} ${detail}`); }
};

async function raises(name, fn, pattern) {
  try {
    await fn();
    fail++; console.log(`  FAIL ${name} — expected an error, none raised`);
  } catch (error) {
    const message = String(error.message ?? error);
    if (pattern.test(message)) { pass++; console.log(`  ok   ${name}`); }
    else { fail++; console.log(`  FAIL ${name} — wrong error: ${message}`); }
  }
}

const act = (uid) => db.exec(`select set_config('request.jwt.claim.sub', '${uid}', false);`);
const one = async (sql) => (await db.query(sql)).rows[0];

// ---- Supabase pieces PGlite does not ship -------------------------------
await db.exec(`
  create schema if not exists auth;
  create schema if not exists extensions;
  create table auth.users (id uuid primary key, email text unique);
  create or replace function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
  $$;
  do $$ begin create role anon; exception when duplicate_object then null; end $$;
  do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
  create publication supabase_realtime;
  insert into auth.users (id, email) values
    ('${OWNER}', 'owner@lvlup.test'), ('${MANAGER}', 'manager@lvlup.test'), ('${STAFF}', 'staff@lvlup.test');
`);

// pgcrypto is not in PGlite; gen_random_uuid is a builtin from PG13 anyway
const migration = readFileSync(join(ROOT, 'supabase/migrations/0001_init.sql'), 'utf8')
  .replace(/create extension if not exists "pgcrypto" with schema extensions;/, '');

/* Everything after the first migration, applied in order — otherwise this suite
   would keep testing a schema the live project has already moved past. */
const laterMigrations = [
  '0002_guest_phone.sql',
  '0003_per_minute_billing.sql',
  '0004_settled_amount.sql',
  '0005_player_rates.sql',
]
  .map((name) => readFileSync(join(ROOT, 'supabase/migrations', name), 'utf8'))
  .join('\n');

console.log('\n— schema —');
try {
  await db.exec(migration);
  ok('0001_init.sql applies cleanly', true);
} catch (error) {
  ok('0001_init.sql applies cleanly', false, String(error.message));
  console.log('\nCannot continue.');
  process.exit(1);
}

try {
  await db.exec(migration);
  ok('migration is re-runnable', true);
} catch (error) {
  ok('migration is re-runnable', false, String(error.message));
}

try {
  await db.exec(laterMigrations);
  ok('later migrations apply', true);
} catch (error) {
  ok('later migrations apply', false, String(error.message));
}

try {
  await db.exec(readFileSync(join(ROOT, 'supabase/seed.sql'), 'utf8'));
  const { count } = await one('select count(*)::int as count from public.stations');
  ok('seed.sql loads six stations', count === 6, `got ${count}`);
} catch (error) {
  ok('seed.sql loads', false, String(error.message));
}

await db.exec(`
  insert into public.staff (id, display_name, role) values
    ('${OWNER}', 'Chetan', 'owner'),
    ('${MANAGER}', 'Manager', 'manager'),
    ('${STAFF}', 'Floor staff', 'staff');
`);

// ---- billing ------------------------------------------------------------
console.log('\n— billing rules —');
for (const [seconds, expected] of [[0, 1], [1, 1], [59, 1], [61, 2], [1800, 30], [1801, 31], [3600, 60], [3660, 61]]) {
  const row = await one(
    `select public.billed_minutes(now() - interval '${seconds} seconds', now()) as m`,
  );
  ok(`${seconds}s bills as ${expected} min`, row.m === expected, `got ${row.m}`);
}
const amount = await one('select public.session_amount(120, 45) as a');
ok('45 min at ₹120/hr is ₹90', amount.a === 90, `got ${amount.a}`);

// ---- start and stop -----------------------------------------------------
console.log('\n— start and stop —');
await act(STAFF);
const bay = await one(`select id, rate_per_hour from public.stations where name = 'Bay 01'`);
const started = await one(`select * from public.start_session('${bay.id}', 'Dhruv', 2)`);
ok('start_session opens a session', Boolean(started.id) && started.guest_name === 'Dhruv');
// two players on Bay 01, so the two-player tier, not the station's flat fallback
ok('rate is snapshotted at start', started.rate_snapshot === 250, `got ${started.rate_snapshot}`);

const audit = await one(`select action, actor_name from public.audit_log order by id desc limit 1`);
ok('start writes an audit row naming the actor', audit.action === 'session.start' && audit.actor_name === 'Floor staff',
  `${audit.action} / ${audit.actor_name}`);

await raises('a second start on the same station is refused',
  () => db.exec(`select public.start_session('${bay.id}', 'Someone', 1)`), /already in play/i);

const stopped = await one(`select * from public.stop_session('${started.id}', 'upi')`);
// started a moment ago, so one minute at ₹250/hr: 250/60 rounds to 4
ok('stop bills the time on the timer', stopped.amount === 4 && stopped.billed_minutes === 1,
  `${stopped.amount} / ${stopped.billed_minutes}`);
ok('stop records the payment method', stopped.payment_method === 'upi');

const again = await one(`select * from public.stop_session('${started.id}', 'cash')`);
ok('stopping twice does not re-bill', again.amount === 4 && again.payment_method === 'upi',
  `${again.amount} / ${again.payment_method}`);
const stopAudits = await one(`select count(*)::int as c from public.audit_log where action = 'session.stop'`);
ok('the second stop writes no second audit row', stopAudits.c === 1, `got ${stopAudits.c}`);

// ---- pricing by head count ----------------------------------------------
console.log('\n— rate card —');
const bay3Rates = await one(`select id, rate_per_hour from public.stations where name = 'Bay 03'`);
const tiers = await one(`select count(*)::int as c from public.station_rates where station_id = '${bay3Rates.id}'`);
ok('seed loads the PS5 rate card', tiers.c === 4, `got ${tiers.c}`);

for (const [players, expected] of [[1, 150], [2, 250], [3, 350], [4, 450], [9, 450]]) {
  const row = await one(`select public.rate_for('${bay3Rates.id}', ${players}) as rate`);
  ok(`${players} player${players === 1 ? '' : 's'} is ₹${expected}/hr`, row.rate === expected, `got ${row.rate}`);
}

const rigRate = await one(`select public.rate_for((select id from public.stations where name = 'Rig 01'), 2) as rate`);
ok('a station with no tiers keeps its flat rate', rigRate.rate === 200, String(rigRate.rate));

const four = await one(`select * from public.start_session('${bay3Rates.id}', 'Four up', 4)`);
ok('a session snapshots the head-count rate', four.rate_snapshot === 450, String(four.rate_snapshot));
await db.exec(`select public.stop_session('${four.id}', 'cash')`);
await db.exec(`delete from public.play_sessions where guest_name = 'Four up'`);

// ---- the optional phone -------------------------------------------------
console.log('\n— guest phone —');
const bay2 = await one(`select id from public.stations where name = 'Bay 02'`);
const withPhone = await one(`select * from public.start_session('${bay2.id}', 'Messy', 1, null, '+91 (98250) 12-345')`);
ok('a messy number is stored as digits', withPhone.guest_phone === '+919825012345', String(withPhone.guest_phone));
await db.exec(`select public.stop_session('${withPhone.id}', 'cash')`);
await raises('nonsense is refused',
  () => db.exec(`select public.start_session('${bay2.id}', 'Bad', 1, null, '12')`), /does not look right/i);
const noPhone = await one(`select * from public.start_session('${bay2.id}', 'No number', 1)`);
ok('no number is fine', noPhone.guest_phone === null, String(noPhone.guest_phone));
await db.exec(`select public.stop_session('${noPhone.id}', 'cash')`);
await db.exec(`delete from public.play_sessions where guest_name in ('Messy', 'No number')`);

// ---- settling at a different figure --------------------------------------
console.log('\n— settling off the clock —');
const bay3 = await one(`select id from public.stations where name = 'Bay 03'`);
const toSettle = await one(`select * from public.start_session('${bay3.id}', 'Regular', 2)`);
const settled = await one(`select * from public.stop_session('${toSettle.id}', 'cash', 100)`);
ok('the settled amount is what was taken', settled.amount === 100, String(settled.amount));
ok('the clock figure is kept beside it', settled.quoted_amount === 4, String(settled.quoted_amount));
const settleAudit = await one(`select detail from public.audit_log order by id desc limit 1`);
ok('the gap is written to the audit log', settleAudit.detail.settled_off_quote === 96, JSON.stringify(settleAudit.detail));

const plain = await one(`select * from public.start_session('${bay3.id}', 'Plain', 1)`);
const plainStop = await one(`select * from public.stop_session('${plain.id}', 'upi')`);
ok('no override bills the clock figure', plainStop.amount === plainStop.quoted_amount, `${plainStop.amount} / ${plainStop.quoted_amount}`);

const free = await one(`select * from public.start_session('${bay3.id}', 'On the house', 1)`);
const freeStop = await one(`select * from public.stop_session('${free.id}', 'cash', 0)`);
ok('a session can be settled at zero', freeStop.amount === 0, String(freeStop.amount));

const slip = await one(`select * from public.start_session('${bay3.id}', 'Fat finger', 1)`);
await raises('an absurd amount is refused',
  () => db.exec(`select public.stop_session('${slip.id}', 'cash', 999999)`), /looks wrong/i);
await raises('a negative bill is refused',
  () => db.exec(`select public.stop_session('${slip.id}', 'cash', -50)`), /cannot be negative/i);
await db.exec(`select public.stop_session('${slip.id}', 'cash')`);
await db.exec(`delete from public.play_sessions where guest_name in ('Regular', 'Plain', 'On the house', 'Fat finger')`);

// ---- constraints --------------------------------------------------------
console.log('\n— constraints —');
await raises('a negative amount is rejected',
  () => db.exec(`update public.play_sessions set amount = -100 where id = '${started.id}'`), /sessions_amount_sane/);
await raises('a station cannot be in play twice',
  () => db.exec(`insert into public.play_sessions (station_id, rate_snapshot) values ('${bay.id}', 100), ('${bay.id}', 100)`),
  /one_live_per_station/);

// ---- closing the day ----------------------------------------------------
console.log('\n— closing the day —');
const today = (await one(`select ((now() at time zone 'Asia/Kolkata'))::date::text as d`)).d;
const rig = await one(`select id from public.stations where name = 'Rig 01'`);
const live = await one(`select * from public.start_session('${rig.id}', 'Jay', 1)`);

await act(MANAGER);
await raises('a running session blocks the close',
  () => db.exec(`select public.close_day('${today}')`), /stop every running session/i);

await raises('a future day cannot be closed',
  () => db.exec(`select public.close_day((current_date + 30)::date)`), /has not happened yet/i);

await raises('a day with no play cannot be closed',
  () => db.exec(`select public.close_day('2020-01-01')`), /nothing was played/i);

await act(STAFF);
await db.exec(`select public.stop_session('${live.id}', 'cash')`);
await raises('a staff account cannot close the day',
  () => db.exec(`select public.close_day('${today}')`), /only a manager or owner/i);

await act(MANAGER);
const closure = await one(`select * from public.close_day('${today}')`);
// Bay 01 at the two-player ₹250/hr and Rig 01 at its flat ₹200/hr, a minute each: ₹4 + ₹3
ok('close_day stores the takings', closure.totals.total === 7 && closure.totals.cash === 3 && closure.totals.upi === 4,
  JSON.stringify(closure.totals));

// ---- a closed day is frozen ---------------------------------------------
console.log('\n— a closed day is frozen —');
await act(STAFF);
await raises('no new session can start into a closed day',
  () => db.exec(`select public.start_session('${bay.id}', 'Late arrival', 1)`), /day is closed/i);
await raises('a closed session cannot be edited',
  () => db.exec(`update public.play_sessions set amount = 1 where id = '${started.id}'`), /day is closed/i);
await raises('a closed session cannot be deleted',
  () => db.exec(`delete from public.play_sessions where id = '${started.id}'`), /day is closed/i);
await raises('a session cannot be dragged into a closed day',
  () => db.exec(`insert into public.play_sessions (station_id, rate_snapshot, started_at)
                 values ('${rig.id}', 100, now() - interval '2 hours')`), /day is closed/i);

await raises('a manager cannot reopen the day',
  () => { return act(MANAGER).then(() => db.exec(`select public.reopen_day('${today}')`)); }, /only the owner/i);

await act(OWNER);
await db.exec(`select public.reopen_day('${today}')`);
const reopened = await one(`select count(*)::int as c from public.day_closures where day = '${today}'`);
ok('the owner can reopen the day', reopened.c === 0);
const reopenAudit = await one(`select action, actor_name from public.audit_log order by id desc limit 1`);
ok('reopening is written to the audit log', reopenAudit.action === 'day.reopen' && reopenAudit.actor_name === 'Chetan',
  `${reopenAudit.action} / ${reopenAudit.actor_name}`);

// ---- deletes work again once the day is open ----------------------------
const deleted = await db.query(`delete from public.play_sessions where id = '${started.id}'`);
ok('a delete on an open day really deletes', deleted.affectedRows === 1, `affected ${deleted.affectedRows}`);

// ---- policies exist in the shape we expect ------------------------------
console.log('\n— policies —');
const policies = await db.query(`select tablename, policyname, cmd from pg_policies where schemaname = 'public' order by tablename, policyname`);
const names = policies.rows.map((r) => `${r.tablename}.${r.cmd}`);
ok('sessions are select-only for clients',
  names.filter((n) => n.startsWith('play_sessions')).join() === 'play_sessions.SELECT',
  names.filter((n) => n.startsWith('play_sessions')).join());
ok('closures are select-only for clients',
  names.filter((n) => n.startsWith('day_closures')).join() === 'day_closures.SELECT',
  names.filter((n) => n.startsWith('day_closures')).join());
ok('every table has row-level security on',
  (await one(`select count(*)::int as c from pg_tables t join pg_class c on c.relname = t.tablename
              where t.schemaname = 'public' and not c.relrowsecurity`)).c === 0);

const grants = await one(`select count(*)::int as c from information_schema.role_table_grants
                          where table_schema = 'public' and grantee in ('anon','authenticated')
                          and privilege_type in ('INSERT','UPDATE','DELETE')
                          and table_name in ('play_sessions','day_closures','audit_log')`);
ok('clients hold no write grant on sessions, closures or the log', grants.c === 0, `got ${grants.c}`);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
