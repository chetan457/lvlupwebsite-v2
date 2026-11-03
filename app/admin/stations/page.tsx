import { redirect } from 'next/navigation';

import { AddStationForm } from '@/components/admin/add-station-form';
import { StationAdminRow } from '@/components/admin/station-admin-row';
import { currentStaff, getAllStations, getStationKinds } from '@/lib/admin/queries';

/**
 * The stations screen: what exists, what it costs, and what is retired.
 *
 * Force-dynamic because a rate change has to be visible to the next person who
 * opens this page, and because retired stations must disappear from the floor
 * immediately.
 */
export const dynamic = 'force-dynamic';

export default async function StationsPage() {
  const staff = await currentStaff();
  if (!staff) redirect('/admin/login');

  const [stations, kinds] = await Promise.all([getAllStations(), getStationKinds()]);
  const canEdit = staff.role === 'owner' || staff.role === 'manager';

  return (
    <div className="space-y-7">
      <header>
        <p className="eyebrow">Stations</p>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-paper sm:text-4xl">
          Stations and rates
        </h1>
        <p className="mt-1.5 max-w-prose text-sm text-dim">
          Retiring a station hides it from the floor. Its past sessions stay on every day sheet they were
          billed on.
        </p>
      </header>

      {canEdit ? (
        <AddStationForm kinds={kinds} />
      ) : (
        <p className="border border-edge bg-surface p-4 text-sm text-dim">Ask a manager to add a station.</p>
      )}

      {/* the table, not the page, is what scrolls sideways on a phone */}
      <div className="overflow-x-auto border border-edge bg-surface">
        <table className="w-full min-w-[46rem] border-collapse text-sm">
          <caption className="sr-only">Every station, retired ones included</caption>
          <thead>
            <tr className="border-b border-edge-hi">
              <Th>Station</Th>
              <Th>Kind</Th>
              <Th align="right">Seats</Th>
              <Th align="right">Rate per hour</Th>
              <Th>State</Th>
              <Th align="right">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {stations.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-dim">
                  No stations yet. Add the first one above.
                </td>
              </tr>
            ) : (
              stations.map((station) => (
                <StationAdminRow key={station.id} station={station} canEdit={canEdit} />
              ))
            )}
          </tbody>
        </table>
      </div>

      <section className="border border-edge bg-surface-hi/40 p-4 sm:p-5">
        <h2 className="eyebrow text-accent">How a session is billed</h2>
        <ul className="mt-3 space-y-2 text-sm text-dim">
          <li>The first 30 minutes are the minimum charge, however short the session.</li>
          <li>After that, time rounds up in 15-minute blocks.</li>
          <li>
            The rate is copied onto the session when play starts, so changing a rate here never rewrites a
            bill that has already been taken.
          </li>
        </ul>
        <p className="mt-3 font-mono text-xs text-dimmer">
          The database holds these rules; this panel only states them.
        </p>
      </section>
    </div>
  );
}

function Th({ children, align = 'left' }: { children: string; align?: 'left' | 'right' }) {
  return (
    <th
      scope="col"
      className={`px-4 py-3 font-mono text-[0.7rem] font-medium uppercase tracking-[0.18em] text-dimmer ${
        align === 'right' ? 'text-right' : 'text-left'
      }`}
    >
      {children}
    </th>
  );
}
