import { useSyncExternalStore } from 'react';

import type { Signal } from '@/lib/experience-store';

/** Reads a signal in a client component. `server` is what the prerender shows. */
export function useSignal<T>(source: Signal<T>, server: T): T {
  return useSyncExternalStore(source.subscribe, source.get, () => server);
}
