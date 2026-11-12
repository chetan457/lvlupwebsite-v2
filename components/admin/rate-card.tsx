'use client';

import { useState, useTransition } from 'react';

import { removeRateTier, setRateTier } from '@/lib/admin/actions';
import { rupees } from '@/lib/admin/billing';
import type { FloorStation } from '@/lib/admin/types';

/**
 * What an hour costs at each head count, per station.
 *
 * A PS5 bay is ₹150 for one and ₹450 for four, and those four figures are not
 * a formula — the counter has to be able to move the three-player price without
 * touching the others, and without a release. A station with no tiers at all
 * bills its flat rate, which is what the racing rig and the party room do.
 */
export function RateCard({ stations, canEdit }: { stations: FloorStation[]; canEdit: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, run] = useTransition();
  const [draft, setDraft] = useState<{ station: string; players: string; rate: string }>({
    station: stations[0]?.id ?? '',
    players: '1',
    rate: '150',
  });

  const save = () => {
    setError(null);
    run(async () => {
      const result = await setRateTier(draft.station, Number(draft.players), Number(draft.rate));
      setError(result.error);
    });
  };

  const drop = (stationId: string, players: number) => {
    setError(null);
    run(async () => {
      const result = await removeRateTier(stationId, players);
      setError(result.error);
    });
  };

  const field = 'min-h-11 w-full border border-edge-hi bg-room px-2 text-[0.95rem] tabular-nums text-paper';
  const label = 'font-mono text-[0.62rem] uppercase tracking-[0.16em] text-dimmer';

  return (
    <section aria-labelledby="rate-card" className="border border-edge bg-surface p-4">
      <h2 id="rate-card" className="font-display text-[1.1rem] font-semibold uppercase">
        Rate card
      </h2>
      <p className="mt-1 text-[0.88rem] text-dim">
        The price of an hour at each head count. A group larger than the top tier pays the top tier.
      </p>

      <div className="mt-4 grid gap-3">
        {stations.map((station) => (
          <div key={station.id} className="grid gap-2 border border-edge bg-surface-hi px-3 py-2.5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-mono text-paper">{station.name}</span>
              <span className="font-mono text-[0.72rem] text-dimmer">
                {station.active ? station.kind_label : `${station.kind_label} · retired`}
              </span>
            </div>
            {station.rates.length === 0 ? (
              <p className="font-mono text-[0.8rem] text-dim">
                Flat {rupees(station.rate_per_hour)}/hr, whoever is playing
              </p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {station.rates.map((tier) => (
                  <li
                    key={tier.players}
                    className="flex items-center gap-2 border border-edge-hi px-2 py-1 font-mono text-[0.8rem] tabular-nums"
                  >
                    <span className="text-dimmer">{tier.players}p</span>
                    <span className="text-paper">{rupees(tier.rate_per_hour)}</span>
                    {canEdit ? (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => drop(station.id, tier.players)}
                        aria-label={`Remove the ${tier.players} player rate for ${station.name}`}
                        className="text-dimmer transition-colors hover:text-alarm disabled:opacity-40"
                      >
                        ×
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>

      {canEdit ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
          className="mt-4 grid gap-2 border-t border-edge pt-4 sm:grid-cols-[2fr_1fr_1fr_auto] sm:items-end"
        >
          <label className="grid gap-1">
            <span className={label}>Station</span>
            <select
              value={draft.station}
              onChange={(event) => setDraft({ ...draft, station: event.target.value })}
              className={field}
            >
              {stations.map((station) => (
                <option key={station.id} value={station.id}>
                  {station.name}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1">
            <span className={label}>Players</span>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={50}
              onFocus={(event) => event.target.select()}
              onClick={(event) => event.currentTarget.select()}
              value={draft.players}
              onChange={(event) => setDraft({ ...draft, players: event.target.value })}
              className={field}
            />
          </label>
          <label className="grid gap-1">
            <span className={label}>₹ / hour</span>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              onFocus={(event) => event.target.select()}
              onClick={(event) => event.currentTarget.select()}
              value={draft.rate}
              onChange={(event) => setDraft({ ...draft, rate: event.target.value })}
              className={field}
            />
          </label>
          <button
            type="submit"
            disabled={pending}
            className="min-h-11 border border-accent/60 bg-accent/10 px-4 font-mono text-[0.78rem] uppercase tracking-[0.12em] text-paper transition-colors hover:bg-accent/20 disabled:opacity-50"
          >
            {pending ? 'Saving…' : 'Set'}
          </button>
        </form>
      ) : (
        <p className="mt-4 border-t border-edge pt-4 text-[0.85rem] text-dim">
          Ask a manager to change a rate.
        </p>
      )}

      <p role="status" aria-live="polite" className="mt-2 min-h-5 text-[0.8rem] text-alarm">
        {error}
      </p>
    </section>
  );
}
