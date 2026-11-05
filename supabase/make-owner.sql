-- Promote an existing Supabase Auth user to console owner.
--
-- Use this instead of scripts/create-owner.mjs when you would rather not handle
-- the service role key at all:
--
--   1. Supabase dashboard → Authentication → Users → Add user
--      Email + password, and tick "Auto Confirm User".
--   2. Paste this into the SQL editor, change the two values, run it.
--
-- Signing in needs both halves: an auth user, and an active row here. Until the
-- row exists, the account can authenticate with Supabase but not open the console.

insert into public.staff (id, display_name, role, active)
select id, 'CHANGE ME — display name', 'owner', true
from auth.users
where email = 'change-me@example.com'
on conflict (id) do update
  set role = 'owner',
      active = true,
      display_name = excluded.display_name;

-- Check it landed. One row, role owner, active true.
select s.display_name, s.role, s.active, u.email
from public.staff s
join auth.users u on u.id = s.id;
