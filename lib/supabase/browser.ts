'use client';

import { createBrowserClient } from '@supabase/ssr';

/**
 * The browser client, used only for live updates: when one phone starts a
 * session, every other open console hears it without polling. Writes still go
 * through server actions so the rules live in one place.
 */
let client: ReturnType<typeof createBrowserClient> | null = null;

export function supabaseBrowser() {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  client = createBrowserClient(url, key);
  return client;
}
