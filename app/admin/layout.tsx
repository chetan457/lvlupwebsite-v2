import type { Metadata } from 'next';

import { AdminNav } from '@/components/admin/admin-nav';

/**
 * The console shell.
 *
 * Deliberately *not* where the auth guard lives. This layout wraps
 * app/admin/login/page.tsx too, so redirecting from here on a null staff row
 * would send the login screen to itself forever. Every console page does its
 * own `currentStaff()` check instead (see app/admin/page.tsx); this file is
 * only chrome. The marketing chrome is not here to fight: the public site sits
 * in its own route group, so none of it is loaded on these routes.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: { default: 'Ops console', template: '%s · LVL UP ops' },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <main id="main" data-ops className="min-h-dvh bg-room text-paper">
      <AdminNav />
      {/* no shell, no gutter token: a tool wants the whole width, and a phone wants all of it */}
      <div
        className="px-2 pt-2 sm:px-3 sm:pt-3"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 1.5rem)' }}
      >
        {children}
      </div>
    </main>
  );
}
