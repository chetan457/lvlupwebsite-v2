/**
 * What a console screen shows in the instant between a tap and its data.
 *
 * Rendered by the loading.tsx files in app/admin/(console)/ only — the sign-in,
 * forgot and reset screens sit outside that group and never stream a skeleton.
 * Static markup, no data, no client JS: it is the same for everyone, so it
 * carries nothing a signed-out visitor should not see. The heading is the real
 * one, so the screen reads as "the right page, filling in" rather than a spinner.
 */

type Screen = 'floor' | 'day' | 'stations' | 'access';

const titles: Record<Screen, string> = {
  floor: 'Floor',
  day: 'Day sheet',
  stations: 'Stations',
  access: 'Access',
};

const block = 'border border-edge bg-surface motion-safe:animate-pulse';

export function ScreenSkeleton({ screen }: { screen: Screen }) {
  return (
    <div data-skeleton={screen} role="status" aria-live="polite" className="grid gap-3">
      <span className="sr-only">Loading {titles[screen].toLowerCase()}…</span>

      <header className="flex items-baseline justify-between gap-3 px-1" aria-hidden="true">
        <p className="font-display text-[1.3rem] font-semibold uppercase leading-none tracking-[0.03em] text-dim">
          {titles[screen]}
        </p>
        <span className="h-3 w-24 bg-surface-hi motion-safe:animate-pulse" />
      </header>

      <div aria-hidden="true" className="grid gap-3">
        {screen === 'floor' ? <Floor /> : null}
        {screen === 'day' ? <Day /> : null}
        {screen === 'stations' ? <Stations /> : null}
        {screen === 'access' ? <Access /> : null}
      </div>
    </div>
  );
}

function Tiles({ count, height }: { count: number; height: string }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={`${block} ${height}`} />
      ))}
    </div>
  );
}

function Rows({ count }: { count: number }) {
  return (
    <div className="grid gap-px border border-edge bg-edge">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="h-12 bg-surface motion-safe:animate-pulse" />
      ))}
    </div>
  );
}

function Floor() {
  return (
    <>
      <Tiles count={4} height="h-14" />
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className={`${block} h-40 border-l-4 border-l-edge-hi`} />
        ))}
      </div>
    </>
  );
}

function Day() {
  return (
    <>
      <Tiles count={4} height="h-20" />
      <Rows count={6} />
    </>
  );
}

function Stations() {
  return (
    <>
      <div className={`${block} h-28`} />
      <Rows count={5} />
    </>
  );
}

function Access() {
  return (
    <>
      <div className={`${block} h-48`} />
      <div className={`${block} h-36`} />
    </>
  );
}
