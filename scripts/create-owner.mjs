#!/usr/bin/env node
/**
 * Create (or repair) the owner account for the LVL UP staff console.
 *
 *   node --env-file=.env.local scripts/create-owner.mjs "owner@example.com" "Chetan"
 *
 * It does two things that have to happen together: it creates the Supabase Auth
 * user who holds the password, and it writes the matching `staff` row that says
 * the account may use the console. Auth alone is not enough — lib/admin/auth.ts
 * signs out anyone without an active staff row.
 *
 * The password is read from an interactive prompt with the terminal echo off,
 * or from the OWNER_PASSWORD environment variable. It is never taken from a
 * command-line argument: arguments land in shell history and are visible to
 * anyone who can run `ps` on the machine.
 *
 * Safe to run twice. If the auth user already exists it is looked up rather
 * than recreated, and only the staff row is brought into line. Nothing here
 * ever prints the password or the service role key.
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. The service
 * role key bypasses row-level security, which is why this is a one-off script
 * run from a laptop and not a page in the app.
 */

import { createInterface } from 'node:readline';

import { createClient } from '@supabase/supabase-js';

const MIN_PASSWORD = 8;

function fail(message) {
  console.error(`\nFailed: ${message}`);
  process.exit(1);
}

/** Ask a question with the typed characters hidden. */
function askHidden(question) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    let hide = false;

    // readline writes each keystroke back to the terminal; swallow them once the
    // prompt itself has been printed, so the password never appears on screen
    rl._writeToOutput = (chunk) => {
      if (!hide) rl.output.write(chunk);
    };

    rl.question(`${question}: `, (answer) => {
      rl.output.write('\n');
      rl.close();
      resolve(answer);
    });

    hide = true;
  });
}

async function readPassword() {
  const fromEnv = process.env.OWNER_PASSWORD;
  if (fromEnv) {
    if (fromEnv.length < MIN_PASSWORD) fail(`OWNER_PASSWORD is shorter than ${MIN_PASSWORD} characters.`);
    return fromEnv;
  }

  if (!process.stdin.isTTY) {
    fail('No terminal to prompt on. Set OWNER_PASSWORD in the environment instead.');
  }

  const password = await askHidden('Password (not shown)');
  if (password.length < MIN_PASSWORD) fail(`The password must be at least ${MIN_PASSWORD} characters.`);

  const again = await askHidden('Repeat password');
  if (password !== again) fail('The two passwords do not match.');

  return password;
}

/** The admin API has no lookup by email, so page through the user list. */
async function findUserByEmail(supabase, email) {
  const wanted = email.toLowerCase();

  for (let page = 1; page <= 50; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) fail(`could not list existing users — ${error.message}`);

    const match = data.users.find((user) => (user.email ?? '').toLowerCase() === wanted);
    if (match) return match;
    if (data.users.length < 200) return null;
  }

  return null;
}

async function main() {
  const [email, displayName] = process.argv.slice(2);

  if (!email || !displayName) {
    console.error('Usage: node --env-file=.env.local scripts/create-owner.mjs "email@example.com" "Display Name"');
    console.error('The password is prompted for, or read from OWNER_PASSWORD. Do not pass it as an argument.');
    process.exit(1);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(`"${email}" does not look like an email address.`);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) fail('NEXT_PUBLIC_SUPABASE_URL is not set. Run with --env-file=.env.local, or export it.');
  if (!serviceKey) fail('SUPABASE_SERVICE_ROLE_KEY is not set. Copy it from Project Settings -> API.');

  const password = await readPassword();

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log(`\nSupabase project: ${url}`);
  console.log(`Owner email:      ${email}`);

  // ------------------------------------------------------------ auth user ----
  let userId;
  const created = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: displayName },
  });

  if (created.error) {
    const message = created.error.message ?? '';
    const taken = /already|exists|registered/i.test(message) || created.error.status === 422;
    if (!taken) fail(`could not create the auth user — ${message}`);

    const existing = await findUserByEmail(supabase, email);
    if (!existing) fail(`Supabase says that email is taken but it could not be found — ${message}`);

    userId = existing.id;
    console.log('Auth user:        already existed, left as it is (password unchanged)');
  } else {
    userId = created.data.user.id;
    console.log('Auth user:        created, email marked confirmed');
  }

  // ----------------------------------------------------------- staff row ----
  const { data: staff, error: readError } = await supabase
    .from('staff')
    .select('id, role, active')
    .eq('id', userId)
    .maybeSingle();

  if (readError) {
    fail(`could not read the staff table — ${readError.message}. Has supabase/migrations/0001_init.sql been run?`);
  }

  if (!staff) {
    const { error } = await supabase
      .from('staff')
      .insert({ id: userId, display_name: displayName, role: 'owner', active: true });
    if (error) fail(`could not create the staff row — ${error.message}`);
    console.log('Staff row:        created with role owner');
  } else if (staff.role !== 'owner' || !staff.active) {
    const { error } = await supabase.from('staff').update({ role: 'owner', active: true }).eq('id', userId);
    if (error) fail(`could not update the staff row — ${error.message}`);
    console.log(`Staff row:        already existed (role ${staff.role}, active ${staff.active}) — set to owner and active`);
  } else {
    console.log('Staff row:        already correct, nothing to change');
  }

  console.log('\nDone. Sign in at /admin/login with that email and password.');
  console.log('If sign-in is refused, check the staff row still has active = true.');
}

main().catch((error) => fail(error?.message ?? String(error)));
