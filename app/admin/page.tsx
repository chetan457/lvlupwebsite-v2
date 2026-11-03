import Link from 'next/link';
import { redirect } from 'next/navigation';

import { FloorLive } from '@/components/admin/floor-live';
import { SummaryStrip } from '@/components/admin/summary-strip';
import { clockTime } from '@/lib/admin/billing';
import { currentStaff, getDaySessions, getFloor, totalsFor } from '@/lib/admin/queries';

export const metadata = { title: 'Floor' };

/* A running timer is never cacheable, and neither is "who is signed in". */
export const dynamic = 'force-dynamic';

export default async function FloorPage() {
  // the guard lives here, not in the layout: the layout also wraps /admin/login
  const staff = await currentStaff();
  if (!staff) redirect('/admin/login');

  const [stations, day] = await Promise.all([getFloor(), getDaySessions()]);
  const totals = totalsFor(day);
  const inPlay = stations.filter((station) => station.open_session).length;
  const renderedAt = Date.now();

  return (
    <div className="grid gap-3">
      <header className="flex items-baseline justify-between gap-3 px-1">
        <h1 className="font-display text-[1.3rem] font-semibold uppercase leading-none tracking-[0.03em]">
          Floor
        </h1>
        <p className="font-mono text-[0.62rem] uppercase tracking-[0.14em] text-dimmer">
          {staff.display_name} · {clockTime(renderedAt)}
        </p>
      </header>

      <SummaryStrip
        inPlay={inPlay}
        free={stations.length - inPlay}
        sessions={totals.sessions}
        taken={totals.total}
      />

      {stations.length === 0 ? (
        <div className="border border-edge bg-surface px-4 py-8 text-center">
          <p className="text-[0.95rem] text-dim">No stations yet. Add the bays, rigs and arenas first.</p>
          <Link
            href="/admin/stations"
            className="mt-4 inline-flex min-h-11 items-center border border-accent/60 bg-accent/10 px-4 font-mono text-[0.8rem] uppercase tracking-[0.12em] text-paper transition-colors hover:bg-accent/20"
          >
            Set up stations
          </Link>
        </div>
      ) : (
        <FloorLive stations={stations} serverNow={renderedAt} />
      )}
    </div>
  );
}
