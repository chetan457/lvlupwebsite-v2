/**
 * The seam between the DOM and the WebGL scene.
 *
 * The scroll director writes here and the scene reads here, once a frame.
 * Neither imports the other, which is what lets three.js live in its own
 * lazily loaded chunk while GSAP drives it from the main bundle.
 *
 * `experience` is a plain mutable object on purpose: it changes on every scroll
 * event, and routing that through React state would re-render the page sixty
 * times a second for values nothing in the DOM displays.
 */
export const experience = {
  /** 0 → formation count - 1. Fractional values are mid-morph. */
  progress: 0,
  /** Distance flown down the tunnel, in world units. */
  flow: 0,
  /** Pointer position, -1 → 1 on both axes. */
  pointerX: 0,
  pointerY: 0,
};

export type Signal<T> = {
  get: () => T;
  set: (next: T) => void;
  subscribe: (listener: () => void) => () => void;
};

/** The smallest store that works with useSyncExternalStore. */
export function signal<T>(initial: T): Signal<T> {
  let value = initial;
  const listeners = new Set<() => void>();

  return {
    get: () => value,
    set(next) {
      if (Object.is(next, value)) return;
      value = next;
      listeners.forEach((listener) => listener());
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/** 'off' covers every reason the scene will never draw: reduced motion, no WebGL2, save-data. */
export const sceneStatus = signal<'pending' | 'ready' | 'off'>('pending');

/** Index of the chapter covering the middle of the viewport. */
export const activeChapter = signal(0);

/** Flipped once the boot screen has lifted, so the chrome can fade in behind it. */
export const bootDone = signal(false);

export const menuOpen = signal(false);
