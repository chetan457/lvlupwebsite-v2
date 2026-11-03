'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { StationCard } from '@/components/admin/station-card';
import type { FloorStation } from '@/lib/admin/types';
import { supabaseBrowser } from '@/lib/supabase/browser';

type Props = {
  stations: FloorStation[];
  /** Server time at render, so the first client paint matches the HTML it hydrates. */
  serverNow: number;
};

/** How often to re-fetch when realtime is unavailable. Long enough to be cheap, short enough to notice. */
const POLL_MS = 20_000;

/**
 * The live layer around the station grid.
 *
 * Two jobs, both of them "one of a thing instead of N":
 *
 * 1. One interval. Every card reads the same `now`, so twelve timers cost one
 *    timer and they all show the same second. It keeps ticking under
 *    prefers-reduced-motion — a clock is information, not decoration, and a
 *    frozen one would be a lie about what the guest owes.
 * 2. One realtime channel. Any write to play_sessions anywhere — the other
 *    phone, the tablet at the counter — refreshes this tree, so two staff never
 *    disagree about what is running. Where the browser client is not
 *    configured, it falls back to polling rather than going silently stale.
 */
export function FloorLive({ stations, serverNow }: Props) {
  const router = useRouter();
  const [now, setNow] = useState(serverNow);

  useEffect(() => {
    // first beat immediately: serverNow is already a little stale by hydration
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const supabase = supabaseBrowser();

    if (!supabase) {
      const id = window.setInterval(() => router.refresh(), POLL_MS);
      return () => window.clearInterval(id);
    }

    // A websocket can die quietly — shop wifi, a captive portal, a project with
    // realtime switched off — and a floor that has stopped hearing about the other
    // phones looks exactly like a quiet evening. Watch the status and fall back to
    // polling the moment the channel is not actually live.
    let poll = 0;
    const startPolling = () => {
      if (!poll) poll = window.setInterval(() => router.refresh(), POLL_MS);
    };
    const stopPolling = () => {
      if (poll) window.clearInterval(poll);
      poll = 0;
    };

    const channel = supabase
      .channel('floor')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'play_sessions' }, () => router.refresh())
      .subscribe((status: string) => {
        if (status === 'SUBSCRIBED') stopPolling();
        else startPolling();
      });

    return () => {
      stopPolling();
      void supabase.removeChannel(channel);
    };
  }, [router]);

  return (
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {stations.map((station) => (
        <StationCard key={station.id} station={station} now={now} />
      ))}
    </div>
  );
}
