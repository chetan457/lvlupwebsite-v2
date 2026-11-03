import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { buttonClass } from '@/components/ui/button';
import { signOut } from '@/lib/admin/auth';
import { clockTime } from '@/lib/admin/billing';
import { currentStaff, getStaffRoster } from '@/lib/admin/queries';
import type { StaffRole } from '@/lib/admin/types';

export const metadata: Metadata = { title: 'Access' };

/* Never prerendered: this page reads the signed-in staff row, and a build-time
   render would bake "nobody is signed in" — and its redirect — into the HTML. */
export const dynamic = 'force-dynamic';

const roleLabel: Record<StaffRole, string> = {
  owner: 'Owner',
  manager: 'Manager',
  staff: 'Staff',
};

/** What each role can reach. The database enforces this in 0001_init.sql; this only explains it. */
const permissions: { role: StaffRole; can: string }[] = [
  { role: 'owner', can: 'Everything, including the roster, stations, rates and reopening a closed day' },
  { role: 'manager', can: 'Floor, every day sheet, closing the day, stations and rates' },
  { role: 'staff', can: 'Floor and every day sheet, but cannot change a rate or close a day' },
];

const cell = 'border-b border-edge px-3 py-3 text-left align-middle';
const head = 'border-b border-edge-hi px-3 pb-2 text-left font-mono text-[0.68rem] uppercase tracking-[0.18em] text-dimmer';

/** Dates render in the shop's timezone, not the server's, or a late-night row shows yesterday. */
const joinedDate = (value: string) =>
  new Date(value).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  });

export default async function AccessPage() {
  const staff = await currentStaff();
  if (!staff) redirect('/admin/login');

  const roster = await getStaffRoster();

  return (
    <div className="grid gap-10">
      <header className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="eyebrow">Access</p>
          <h1 className="mt-2 font-display text-[clamp(1.9rem,4vw,2.6rem)] font-semibold uppercase leading-none">
            {staff.display_name}
          </h1>
          <p className="mt-2 font-mono text-[0.8rem] uppercase tracking-[0.16em] text-accent">
            {roleLabel[staff.role]}
          </p>
        </div>

        <form action={signOut}>
          <button type="submit" className={buttonClass('ghost', 'md')}>
            Sign out
          </button>
        </form>
      </header>

      <section aria-labelledby="roster" className="hud-card px-4 py-5 sm:px-6">
        <h2 id="roster" className="font-display text-[1.1rem] font-semibold uppercase tracking-[0.02em]">
          Roster
        </h2>
        <p className="mt-1 text-[0.85rem] text-dim">Every account that can sign in to the console.</p>

        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[34rem] border-collapse text-[0.9rem]">
            <caption className="sr-only">Staff accounts, oldest first</caption>
            <thead>
              <tr>
                <th scope="col" className={head}>
                  Name
                </th>
                <th scope="col" className={head}>
                  Role
                </th>
                <th scope="col" className={head}>
                  Active
                </th>
                <th scope="col" className={head}>
                  Joined
                </th>
              </tr>
            </thead>
            <tbody>
              {roster.map((person) => (
                <tr key={person.id}>
                  <th scope="row" className={`${cell} font-normal text-paper`}>
                    {person.display_name}
                    {person.id === staff.id ? <span className="ml-2 font-mono text-[0.66rem] uppercase tracking-[0.16em] text-dimmer">you</span> : null}
                  </th>
                  <td className={`${cell} text-dim`}>{roleLabel[person.role]}</td>
                  <td className={`${cell} font-mono text-[0.8rem]`}>
                    <span className={person.active ? 'text-live' : 'text-dimmer'}>{person.active ? 'Yes' : 'No'}</span>
                  </td>
                  <td className={`${cell} font-mono text-[0.78rem] text-dim`}>
                    {joinedDate(person.created_at)}
                    <span className="text-dimmer"> · {clockTime(person.created_at)}</span>
                  </td>
                </tr>
              ))}
              {roster.length === 0 ? (
                <tr>
                  <td colSpan={4} className={`${cell} text-dim`}>
                    No accounts yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="roles" className="hud-card px-4 py-5 sm:px-6">
        <h2 id="roles" className="font-display text-[1.1rem] font-semibold uppercase tracking-[0.02em]">
          What each role can do
        </h2>

        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[28rem] border-collapse text-[0.9rem]">
            <thead>
              <tr>
                <th scope="col" className={head}>
                  Role
                </th>
                <th scope="col" className={head}>
                  Can reach
                </th>
              </tr>
            </thead>
            <tbody>
              {permissions.map((row) => (
                <tr key={row.role}>
                  <th scope="row" className={`${cell} font-normal text-paper`}>
                    {roleLabel[row.role]}
                  </th>
                  <td className={`${cell} text-dim`}>{row.can}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="adding" className="border border-edge px-4 py-5 sm:px-6">
        <h2 id="adding" className="eyebrow">
          Adding someone
        </h2>
        <p className="mt-3 max-w-prose text-[0.9rem] text-dim">
          New accounts are made in the Supabase dashboard: Authentication → Users → Add user, with an email address
          and a password. Then give that user a row in the <code className="font-mono text-paper">staff</code> table
          with their name and role — until that row exists and is active, they can sign in to Supabase but not to this
          console.
        </p>
        <p className="mt-3 max-w-prose text-[0.9rem] text-dim">
          To take someone off, set their row to inactive rather than deleting it; their past sessions stay in the day
          sheets. Passwords live only in Supabase — none of them are ever kept in this repository.
        </p>
      </section>
    </div>
  );
}
