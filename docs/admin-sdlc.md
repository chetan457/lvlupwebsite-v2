# Staff console — engineering record

One page covering what was asked for, what was decided and why, how to verify a
deployed instance by hand, and what is deliberately not built yet.

Scope: the `/admin` area of the v2 site, backed by Supabase. Plan of record:
`docs/admin-panel-plan.html`. Setup steps: `docs/admin-setup.md`.

---

## 1. Requirements

From the owner of the lounge at offices 332–333, third floor, Nadiad Nexus-I,
Nadiad, Gujarat. The console replaces a paper notebook.

1. **Staff sign-in.** Each person who works the floor gets their own account.
   Roles: owner, manager, staff. Staff see the floor and today; managers and the
   owner can close a day and change rates.
2. **A live timer per station.** Start when a guest sits down, stop when they
   leave, with the elapsed time and the running amount visible while they play.
3. **Dynamic station types.** PS5 bays today, plus a VR arena and a racing rig,
   and whatever comes next. Adding a kind of station or another unit of an
   existing kind must not need a code change or a deploy.
4. **Automatic billing.** The amount comes from the rate and the clock, not from
   arithmetic done at the counter.
5. **A daily audit.** At closing, the day's sessions, the cash-versus-UPI split
   and the total, plus a record of which member of staff did what — and once a
   day is closed, its rows must not be quietly editable.
6. **Two devices at once.** A phone at the counter and a tablet on the floor must
   agree about what is running, without anyone refreshing.
7. **One deploy.** The console lives inside the existing site, on the same
   domain, in the same Hostinger Node app, in the same brand styles.

## 2. Design decisions

**Postgres functions own billing and idempotency.**
`start_session`, `stop_session` and `close_day` in
`supabase/migrations/0001_init.sql` are the only way the console changes a
session. The client sends an intent; the database decides what it costs. Two
consequences that matter: a tampered request cannot invent an amount, and
pressing Stop twice returns the already-closed row instead of billing again. The
same reasoning covers starting: a unique partial index allows one session per
station with `ended_at is null`, so two phones pressing Start at the same instant
produce one session and one readable error, not a duplicate.

**Row-level security rather than checks in the application.**
Every table has RLS enabled and policies written against an active `staff` row.
An application-level check only protects the paths that run through it; a policy
protects the data itself, including a direct call to the Supabase API with the
anon key. That is also what makes publishing the anon key to the browser
acceptable. The role helpers are `security definer` so a policy on `staff` does
not recurse into itself.

**Supabase Auth proves identity; the `staff` row grants access.**
A valid password only proves who someone is. `lib/admin/auth.ts` signs out anyone
whose staff row is missing or inactive, so retiring a person is one flag, not a
password reset, and a retired account cannot keep working from a cookie it
already holds. `middleware.ts` only checks that a session exists — it refreshes
the auth cookie and saves a signed-out visitor from loading a dead screen; the
real gate is `currentStaff()` in the layout and pages.

**The rate is snapshotted on the session.**
`play_sessions.rate_snapshot` is copied from the station at start. Changing a
price must never rewrite what a guest was charged last Tuesday, and a day sheet
has to keep adding up months later.

**Billing rule in one place.** The amount is the station's rate spread over the
minutes actually played, with any started minute counted in full (61 seconds is
two minutes). There is no minimum charge: the bill tracks the timer. It is defined in SQL (`billed_minutes`, `session_amount`) and
mirrored in `lib/admin/billing.ts` purely so a running total can be displayed
without a round trip. The SQL is what a guest pays; if one changes, change both.

**The business day is Asia/Kolkata, not UTC.**
`play_sessions.day` is a stored generated column deriving the local date from
`started_at`. A session that ends at half past midnight belongs to the night it
started, which is how the floor and the cash box already think about it.

**A closed day is frozen.**
`close_day` writes the totals that were true at closing and a trigger then
rejects any update or delete on that day's sessions. A correction after closing
is a new row with a reason. Without that, the day sheet is a report; with it, it
is an audit trail. Closing also refuses to run while a session is still open.

**Realtime for multi-device.**
`play_sessions` and `stations` are in the `supabase_realtime` publication, so a
start on one device appears on another without polling. The timer itself is
computed in the browser from the stored `started_at`, so a reconnect, a reload or
a flat battery loses nothing.

**Append-only audit log.**
Every start, stop and closure writes to `audit_log` with the actor and the time.
It is readable by managers and the owner and is never edited from the console.

**`/admin` is excluded from search.**
`X-Robots-Tag: noindex, nofollow, noarchive` and `Cache-Control: no-store` on
`/admin/:path*` in `next.config.mjs`, plus a `Disallow: /admin` in
`app/robots.ts`. `app/sitemap.ts` lists only `/`. The header is the part that
holds even if a crawler ignores robots.txt, and `no-store` keeps a shared cache
or a back button from retaining somebody's live floor.

## 3. Acceptance tests

Run these by hand against a deployed instance, in order. Two devices are needed
for step 4 — a laptop and a phone is fine. Rates below assume the placeholder
seed (a PS5 bay at ₹120 per hour); substitute the real rate once it is loaded.

1. **Signed-out visitor is redirected.** In a private window, open `/admin` and
   then `/admin/day`. Both land on `/admin/login`, and the address carries a
   `next` parameter. Nothing of the console is visible.
2. **Sign in.** Use the owner email and password from the setup runbook. You
   arrive on the floor screen and every station is listed as free.
3. **Start a session.** Press Start on a PS5 bay, with a guest name. The card
   shows a running timer and the station is marked in play. Press Start on the
   same bay again — it is refused with a readable message, not a second session.
4. **See it on a second device.** Sign in on the phone and open the floor
   **without** refreshing after step 3. The same station shows as in play, with
   the same elapsed time to within a second or two.
5. **Stop after a few minutes.** Press Stop and choose cash. Billed time and
   amount match the timer: ten minutes on a ₹120/hr bay is **₹20**, not a
   half-hour minimum.
6. **Stop after a part block.** Start another session, stop it after about 37
   minutes. Billed time follows the clock to the minute.
   block) and the amount is **₹90**.
7. **Stop is idempotent.** Press Stop again on a session already closed. The
   amount does not change and no second row appears on the day sheet.
8. **Day sheet adds up.** Open the day screen. Both sessions are listed with
   their start, end, billed minutes, payment method and amount. The total equals
   the sum of the rows, and the cash and UPI columns split to the same total.
9. **Closing refuses while a session runs.** Start one more session, then try to
   close the day. It is refused, naming the running session as the reason.
10. **Close the day.** Stop the session, then close the day as the owner. The
    screen shows the stored totals and who closed it.
11. **A closed day is frozen.** Try to stop or change anything dated to the
    closed day. Every attempt is refused with "that day is closed".
12. **Role boundary.** Signed in as an account with role `staff`, the controls
    for adding a station, changing a rate and closing the day are unavailable,
    and calling those actions is refused server-side.
13. **An inactive account cannot sign in.** Set `active` to `false` on a staff
    row in the Supabase table editor, then sign in as that person. Sign-in is
    refused with "that account is not active", and no console page loads.
14. **The noindex header is live.** From any machine:

    ```bash
    curl -I https://your-domain/admin | grep -i x-robots-tag
    ```

    It prints `x-robots-tag: noindex, nofollow, noarchive`. Repeat for
    `/admin/login`. Also check `https://your-domain/robots.txt` contains
    `Disallow: /admin`, and that `https://your-domain/sitemap.xml` lists only the
    home page.
15. **Audit trail.** As the owner, confirm the log holds a row for each start,
    stop and closure above, naming the member of staff and the time.

## 4. Known gaps and next phases

**Not built, by decision.**

- **Guests and passes.** No guest records, phone-number lookup, visit counts or
  prepaid 10-hour passes tracked against a balance. A session carries a free-text
  name only. This needs a `guests` table and a balance that a stop can draw down,
  which is a second round of billing logic.
- **GST on bills.** Amounts are a single net figure. There is no tax breakdown,
  no GSTIN on a receipt and no printable or WhatsApp bill. The GSTIN and whether
  tax applies are still to be confirmed with the owner.
- **Public "bays free now".** The home page does not show live availability. It
  would mean a read path for anonymous visitors, so a deliberately narrow view
  (counts per station kind, never guest names) rather than loosening the existing
  policies.
- **Rates with time windows.** Happy-hour and weekend pricing was in the plan but
  is not in the schema: a station has one `rate_per_hour`. Adding windows means a
  `rates` table and a lookup at start, while keeping the snapshot behaviour.
- **Bookings.** No party or birthday reservations held against a station and a
  time, so no clash detection.
- **Backups and a restore drill.** Supabase takes automated backups on its own
  schedule, but nobody has restored one. Before this is the only record of the
  day's takings: confirm the retention window on the project's plan, add a
  periodic export of `play_sessions` and `day_closures`, and actually restore
  into a scratch project once so the procedure is known rather than assumed.
- **Sign-in rate limiting beyond Supabase's defaults.** The plan mentioned
  locking an account after three bad attempts; what exists today is Supabase
  Auth's own throttling, surfaced as "too many attempts".

**Operational prerequisites still open.**

- The real station list for Nadiad Nexus-I, and the real rate card. Everything in
  `supabase/seed.sql` is a placeholder.
- How many staff need their own login.
- Whether GST applies, and the GSTIN if it does.
- `content/site.ts` still holds a placeholder public URL, and `SITE_INDEXABLE`
  stays off until the public content is real.
