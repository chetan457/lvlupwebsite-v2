# Staff console — setup runbook

What to do, in order, to get the LVL UP staff console running. Written for
someone who has not used Supabase before. Start to finish it takes about half an
hour, most of it waiting for the project to be provisioned.

You will need: a Supabase account, this repository on your machine with
`npm install` already run, and access to the Hostinger Node app for the deploy.

---

## 1. Create the Supabase project

1. Sign in at <https://supabase.com/dashboard> and choose **New project**.
2. Name it something obvious, such as `lvlup-ops`.
3. Region: **Mumbai (ap-south-1)**. It is the closest region to Gujarat, so every
   start and stop on the floor answers in tens of milliseconds rather than
   hundreds.
4. Plan: **Free** is enough. The console stores a few rows per session.
5. Set a database password when asked and save it in your password manager. It is
   the Postgres password, separate from the owner login created in step 4 below,
   and you will not need it for day-to-day use.
6. Wait for the project to finish provisioning before continuing.

## 2. Copy the keys

In the dashboard, go to **Project Settings → API**. You need three values.

| Value | Where | Goes in |
| --- | --- | --- |
| Project URL | Project Settings → API → Project URL | `NEXT_PUBLIC_SUPABASE_URL` |
| anon key (also shown as publishable) | Project Settings → API → Project API keys → `anon` | `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| service role key | Project Settings → API → Project API keys → `service_role`, press **Reveal** | `SUPABASE_SERVICE_ROLE_KEY` |

The first two are designed to be seen by the browser. The **service role key
must never leave your machine or the server** — it ignores every access rule in
the database. Do not paste it into a chat, an issue, a screenshot or a client
component. It is used by one thing only: the owner-creation script in step 4.

Copy `.env.example` to `.env.local` and fill in the three values:

```bash
cp .env.example .env.local
```

`.env.local` is ignored by git, so it will not be committed.

## 3. Create the tables

The schema is one file, and it is safe to run more than once.

**Option A — SQL editor (no tools to install).**

1. Dashboard → **SQL Editor** → **New query**.
2. Paste the whole of `supabase/migrations/0001_init.sql` and press **Run**.
3. New query again, paste `supabase/seed.sql` and **Run**.

**Option B — Supabase CLI.**

```bash
supabase link --project-ref <your-project-ref>
supabase db push
psql "$DATABASE_URL" -f supabase/seed.sql
```

The seed file is placeholder inventory: six stations and a set of per-hour rates
that are made up. Replace them with the real station list and rate card before
the console is used to take money. Rates are copied onto a session when it
starts, so editing a rate later only affects sessions started after the edit.

## 4. Create the owner account

This creates the Supabase Auth user that holds the password, and the matching
`staff` row that says the account may use the console. Both are needed: an auth
user without an active staff row is signed straight back out.

```bash
node --env-file=.env.local scripts/create-owner.mjs "owner@example.com" "Your Name"
```

The script prompts for the password and hides what you type. Do not pass the
password as an argument — arguments are saved in shell history and are visible
to anyone who can list processes on the machine. If you need to run it without a
terminal, set `OWNER_PASSWORD` in the environment instead.

Running it twice is safe. If the account already exists, the password is left
alone and only the staff row is checked.

## 5. Run it locally

```bash
npm run dev
```

Open <http://localhost:3001/admin/login> and sign in with the email and password
from step 4. A signed-out visitor who opens any `/admin` page is sent to the
login screen and back again afterwards.

## 6. Deploy on Hostinger

1. In the Hostinger panel, open the Node application for the site and go to its
   environment variables.
2. Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` with the
   same values as `.env.local`. Add `SITE_INDEXABLE=true` only when the public
   site is meant to be in search results.
3. Do **not** add `SUPABASE_SERVICE_ROLE_KEY`. Nothing the server does at request
   time needs it, and the owner account is already created.
4. Build and restart:

   ```bash
   npm ci
   npm run build:hostinger
   ```

   Then restart the Node app from the panel.

The two `NEXT_PUBLIC_` values are read at build time as well as at run time, so
they must be set **before** the build, not after. If you change them, build again.

## If sign-in fails

Work through these in order.

1. **"That email and password do not match."** — the password is wrong, or the
   email has no auth user. Re-run the script from step 4 with the same email; it
   will tell you whether the user already existed.
2. **"That account is not active."** — the auth user exists but the `staff` row
   is missing or switched off. In the dashboard: **Table Editor → staff**. Check
   there is a row whose `id` matches the user's id under **Authentication →
   Users**, that `active` is `true`, and that `role` is `owner`. Re-running the
   script repairs both.
3. **"Sign-in is not set up yet."** — the environment variables are missing from
   the running app. Check them in the Hostinger panel and restart; remember that
   a change needs a rebuild.
4. **Signed in, but every screen is empty** — the migration has not been run, or
   was run against a different project than the URL points at.
5. **Signed out again after a few minutes** — the auth cookie is not being
   refreshed. Confirm the site is served over HTTPS and that `middleware.ts` is
   still deployed; it is the only thing that rotates the session.

## Security notes

- **The anon key is public by design.** It identifies the project, it does not
  grant access. Every table has row-level security enabled, and the rules only
  ever answer to a signed-in account with an active `staff` row. That boundary is
  in the database, so it holds even if someone calls the Supabase API directly
  and never loads our pages.
- **The service role key bypasses all of that.** It goes nowhere near the
  browser: no `NEXT_PUBLIC_` prefix, no client component, not in the deployed
  environment. Only the local setup script uses it.
- **Session cookies are readable by page scripts, by design.** Supabase's browser
  client reads the token out of `document.cookie` to open the live-updates
  channel, so these cookies are not `HttpOnly`. The practical consequences: never
  load third-party scripts into the console, treat a shared or borrowed staff
  phone as a shared session, and sign out rather than just closing the tab.
  Signing out invalidates the session everywhere.
- **Passwords are never stored by this application.** They exist only as hashes
  inside Supabase Auth; nobody — including whoever runs the setup script — can
  read one back.
- **Money is calculated in the database.** The amount for a session comes from
  Postgres functions using the rate recorded when the session started, so a
  client cannot send its own figure.
- **Rotate a key the moment it is exposed.** If the service role key is ever
  pasted into a chat, a ticket, a screenshot or a shared document, treat it as
  compromised: Project Settings → API → **Reset service role key**, then update
  wherever you legitimately keep it. The anon key can be rotated the same way,
  but doing so means rebuilding and redeploying the site.
- **Send staff credentials privately** — a password manager share link or a
  direct message, never a public issue or a commit.
