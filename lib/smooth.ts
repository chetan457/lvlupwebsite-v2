/**
 * A handle on the smooth scroller, without importing it.
 *
 * Lenis is created by the scroll director. The menu and the logo need to scroll
 * with it rather than around it — a native jump underneath Lenis snaps back on
 * the next frame — but they should not pull the library into their own bundle.
 */

type Scroller = {
  scrollTo: (target: HTMLElement | number, options?: { offset?: number; duration?: number; immediate?: boolean }) => void;
  stop: () => void;
  start: () => void;
};

let current: Scroller | null = null;

export function registerScroller(scroller: Scroller | null) {
  current = scroller;
}

export function scrollToId(id: string) {
  const target = document.getElementById(id);
  if (!target) return;

  if (current) {
    current.scrollTo(target, { duration: 1.6 });
    return;
  }

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  target.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' });
}

export function lockScroll(locked: boolean) {
  if (current) {
    if (locked) current.stop();
    else current.start();
  }
  document.documentElement.classList.toggle('scroll-locked', locked);
}
