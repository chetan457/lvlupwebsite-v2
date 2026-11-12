'use client';

import { useState, useTransition } from 'react';

import { setStationActive, setStationRate } from '@/lib/admin/actions';
import { rupees } from '@/lib/admin/billing';
import type { Station } from '@/lib/admin/types';

/**
 * One station, editable in place.
 *
 * Save only appears once the number has actually changed, so a mis-tap on the
 * stepper is obvious before it is saved and an unchanged row has nothing to
 * press. Errors stay on the row that caused them — a page-level banner would
 * not say which station failed.
 *
 * Two layouts, one set of handlers: a table row from tablet width up, and a
 * card on a phone, where six columns push the rate off the right edge behind a
 * sideways scroll nobody finds mid-shift.
 */

type Row = Station & { kind_label: string };

export function StationAdminRow({
  station,
  canEdit,
  layout = 'row',
}: {
  station: Row;
  canEdit: boolean;
  layout?: 'row' | 'card';
}) {
  const [rate, setRate] = useState(String(station.rate_per_hour));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const parsed = Number(rate);
  const dirty = Number.isFinite(parsed) && parsed >= 0 && Math.trunc(parsed) !== station.rate_per_hour;

  function saveRate() {
    setError(null);
    startTransition(async () => {
      const result = await setStationRate(station.id, parsed);
      if (result.error) setError(result.error);
    });
  }

  function toggleActive() {
    setError(null);
    startTransition(async () => {
      const result = await setStationActive(station.id, !station.active);
      if (result.error) setError(result.error);
    });
  }

  const control =
    'min-h-11 border border-edge-hi bg-room px-3 font-mono text-xs uppercase tracking-[0.14em] text-paper ' +
    'transition-colors hover:border-accent hover:text-accent disabled:pointer-events-none disabled:opacity-30';

  const rateControl = (
    <div className="flex items-center gap-2">
      <label className="sr-only" htmlFor={`rate-${layout}-${station.id}`}>
        Rate per hour for {station.name}
      </label>
      <input
        id={`rate-${layout}-${station.id}`}
        type="number"
        inputMode="numeric"
        min={0}
        max={10000}
        step={1}
        onFocus={(event) => event.target.select()}
        onClick={(event) => event.currentTarget.select()}
        value={rate}
        disabled={!canEdit || pending}
        onChange={(event) => setRate(event.target.value)}
        className="min-h-11 w-24 border border-edge-hi bg-room px-2 text-right font-mono text-sm text-paper tabular-nums focus:border-accent focus:outline-none disabled:opacity-50"
      />
      {canEdit && dirty ? (
        <button type="button" onClick={saveRate} disabled={pending} className={control}>
          {pending ? 'Saving' : 'Save'}
        </button>
      ) : (
        <span className="font-mono text-xs text-dimmer tabular-nums">{rupees(station.rate_per_hour)}</span>
      )}
    </div>
  );

  const state = station.active ? (
    <span className="font-mono text-xs uppercase tracking-[0.14em] text-live">On the floor</span>
  ) : (
    <span className="font-mono text-xs uppercase tracking-[0.14em] text-dimmer">Retired</span>
  );

  if (layout === 'card') {
    return (
      <article className="grid gap-2 bg-surface px-4 py-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="font-mono text-paper">{station.name}</span>
          {state}
        </div>
        <p className="text-[0.85rem] text-dim">
          {station.kind_label} · {station.seats} seat{station.seats === 1 ? '' : 's'}
        </p>
        <div className="flex flex-wrap items-center justify-between gap-2">
          {rateControl}
          <button type="button" onClick={toggleActive} disabled={!canEdit || pending} className={control}>
            {station.active ? 'Retire' : 'Restore'}
          </button>
        </div>
        {/* the region exists even when empty, or a screen reader has nothing to announce into */}
        <p role="status" aria-live="polite" className="min-h-5 text-xs text-alarm">
          {error}
        </p>
      </article>
    );
  }

  return (
    <tr className="border-b border-edge last:border-0 align-middle">
      <td className="px-4 py-3 font-mono text-paper">{station.name}</td>
      <td className="px-4 py-3 text-dim">{station.kind_label}</td>
      <td className="px-4 py-3 text-right font-mono text-dim tabular-nums">{station.seats}</td>

      <td className="px-4 py-3">
        <div className="flex items-center justify-end">{rateControl}</div>
      </td>

      <td className="px-4 py-3">{state}</td>

      <td className="px-4 py-3 text-right">
        <button type="button" onClick={toggleActive} disabled={!canEdit || pending} className={control}>
          {station.active ? 'Retire' : 'Restore'}
        </button>
        {/* the region exists even when empty, or a screen reader has nothing to announce into */}
        <p role="status" aria-live="polite" className="mt-1.5 min-h-5 text-left text-xs text-alarm">
          {error}
        </p>
      </td>
    </tr>
  );
}
