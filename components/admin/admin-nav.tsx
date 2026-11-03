'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const links = [
  { href: '/admin', label: 'Floor' },
  { href: '/admin/day', label: 'Day sheet' },
  { href: '/admin/stations', label: 'Stations' },
  { href: '/admin/access', label: 'Access' },
] as const;

/**
 * The only navigation the console has.
 *
 * Four screens, always visible, never behind a menu: staff use this one-handed
 * with a guest waiting, so a tap should never cost two. It scrolls sideways
 * rather than wrapping, so the bar is one row tall at every width.
 */
export function AdminNav() {
  const pathname = usePathname();

  // the login screen shares this layout but is not part of the console yet
  if (pathname === '/admin/login') return null;

  return (
    <nav
      aria-label="Console"
      className="sticky top-0 z-20 border-b border-edge bg-room-deep/95 backdrop-blur-md"
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
    >
      <ul className="no-scrollbar flex gap-1 overflow-x-auto px-2">
        {links.map((link) => {
          const current = link.href === '/admin' ? pathname === '/admin' : pathname.startsWith(link.href);
          return (
            <li key={link.href}>
              <Link
                href={link.href}
                aria-current={current ? 'page' : undefined}
                className={`-mb-px flex min-h-11 items-center whitespace-nowrap border-b-2 px-3 font-mono text-[0.78rem] uppercase tracking-[0.12em] transition-colors ${
                  current
                    ? 'border-accent text-paper'
                    : 'border-transparent text-dim hover:border-edge-hi hover:text-paper'
                }`}
              >
                {link.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
