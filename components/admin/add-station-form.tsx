'use client';

import { useState, useTransition } from 'react';

import { addStation } from '@/lib/admin/actions';
import { buttonClass } from '@/components/ui/button';
import type { StationKind } from '@/lib/admin/types';

/**
 * Adding a station is rare and permanent-ish, so nothing here is clever: four
 * fields, one button, and the kind's default rate prefilled because that is
 * right nearly every time — the rate stays editable for the odd premium rig.
 */

const field =
  'min-h-11 w-full border border-edge-hi bg-room px-3 font-mono text-sm text-paper ' +
  'placeholder:text-dimmer focus:border-accent focus:outline-none';

export function AddStationForm({ kinds }: { kinds: StationKind[] }) {
  const first = kinds[0];
  const [name, setName] = useState('');
  const [kindId, setKindId] = useState(first?.id ?? '');
  const [seats, setSeats] = useState('1');
  const [rate, setRate] = useState(first ? String(first.default_rate) : '');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function pickKind(id: string) {
    setKindId(id);
    const kind = kinds.find((row) => row.id === id);
    if (kind) setRate(String(kind.default_rate));
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await addStation({
        name,
        kindId,
        seats: Number(seats),
        ratePerHour: Number(rate),
      });

      if (result.error) {
        setError(result.error);
        return;
      }

      // only the name is cleared-to-empty; kind and rate stay so a second rig of
      // the same sort is two keystrokes away
      setName('');
      setSeats('1');
    });
  }

  if (kinds.length === 0) {
    return (
      <p className="border border-edge bg-surface p-4 text-sm text-dim">
        No station kinds are set up yet, so a station has nothing to be.
      </p>
    );
  }

  return (
    <form
      className="border border-edge-hi bg-surface p-4 sm:p-5"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <h2 className="font-display text-lg font-semibold text-paper">Add a station</h2>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block">
          <span className="eyebrow block pb-1.5">Name</span>
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="PS5 · 03"
            required
            maxLength={40}
            className={field}
          />
        </label>

        <label className="block">
          <span className="eyebrow block pb-1.5">Kind</span>
          <select value={kindId} onChange={(event) => pickKind(event.target.value)} className={field}>
            {kinds.map((kind) => (
              <option key={kind.id} value={kind.id}>
                {kind.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="eyebrow block pb-1.5">Seats</span>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={50}
            step={1}
            value={seats}
            onChange={(event) => setSeats(event.target.value)}
            className={`${field} tabular-nums`}
          />
        </label>

        <label className="block">
          <span className="eyebrow block pb-1.5">Rate per hour</span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={10000}
            step={10}
            value={rate}
            onChange={(event) => setRate(event.target.value)}
            className={`${field} tabular-nums`}
          />
        </label>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={buttonClass('primary', 'md', 'disabled:opacity-50')}>
          {pending ? 'Adding' : 'Add station'}
        </button>
        <span className="font-mono text-xs text-dimmer">It lands at the end of the floor order.</span>
      </div>

      <p role="status" aria-live="polite" className="mt-3 min-h-5 text-sm text-alarm">
        {error}
      </p>
    </form>
  );
}
