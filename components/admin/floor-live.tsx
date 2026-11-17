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
 * At most one refresh per this window. A busy minute at the counter is a burst
 * of writes (start, stop, a correction) and each one re-renders the whole floor
 * on the server; one refresh after the burst shows the same end state.
 */
const REFRESH_GAP_MS = 2_000;

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
 *
 * Refreshes are throttled to one per REFRESH_GAP_MS, the poll pauses while the
 * tab is hidden, and the floor refreshes the moment it becomes visible again.
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
    // set first thing on unmount: removeChannel() fires the subscribe callback with
    // CLOSED, which would otherwise restart the fallback poll on whatever screen is next
    let disposed = false;

    // --- refresh, throttled (deliberately a throttle, not a debounce): the first change refreshes at once, a burst after it
    // collapses into one trailing refresh REFRESH_GAP_MS later
    let lastRefresh = 0;
    let pendingRefresh = 0;
    const refreshNow = () => {
      if (disposed) return;
      if (pendingRefresh) window.clearTimeout(pendingRefresh);
      pendingRefresh = 0;
      lastRefresh = Date.now();
      router.refresh();
    };
    const requestRefresh = () => {
      // a hidden tab skips it: becoming visible refreshes anyway
      if (disposed || document.hidden || pendingRefresh) return;
      const wait = Math.max(0, lastRefresh + REFRESH_GAP_MS - Date.now());
      pendingRefresh = window.setTimeout(refreshNow, wait);
    };

    // --- fallback poll, only while realtime is not live and the screen is on.
    // A phone in a pocket polling every 20 s is server load nobody is reading.
    let needPoll = !supabase;
    let poll = 0;
    const syncPolling = () => {
      const want = !disposed && needPoll && !document.hidden;
      if (want && !poll) poll = window.setInterval(requestRefresh, POLL_MS);
      if (!want && poll) {
        window.clearInterval(poll);
        poll = 0;
      }
    };

    // a phone coming back from sleep may have missed changes (and its websocket
    // may have been dropped meanwhile): catch up at once rather than on the next tick
    const onVisibility = () => {
      if (!document.hidden) refreshNow();
      syncPolling();
    };
    document.addEventListener('visibilitychange', onVisibility);
    syncPolling();

    // A websocket can die quietly — shop wifi, a captive portal, a project with
    // realtime switched off — and a floor that has stopped hearing about the other
    // phones looks exactly like a quiet evening. Watch the status and fall back to
    // polling the moment the channel is not actually live.
    const channel = supabase
      ?.channel('floor')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'play_sessions' }, requestRefresh)
      .subscribe((status: string) => {
        if (disposed) return;
        needPoll = status !== 'SUBSCRIBED';
        syncPolling();
      });

    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', onVisibility);
      syncPolling();
      if (pendingRefresh) window.clearTimeout(pendingRefresh);
      if (supabase && channel) void supabase.removeChannel(channel);
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
