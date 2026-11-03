import 'server-only';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * Supabase clients for server components, server actions and route handlers.
 *
 * The public site must keep building and deploying when no Supabase project is
 * configured yet, so nothing here throws at import time — `supabaseConfigured`
 * is the flag the admin pages check before they try to talk to the database.
 */

export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
export const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
export const supabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

/**
 * Request-scoped client carrying the signed-in staff member's session.
 * Every query it makes is filtered by the row-level security in 0001_init.sql,
 * which is what makes the anon key safe to expose.
 */
export async function supabaseServer() {
  const store = await cookies();

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll(list) {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // called from a server component, where cookies are read-only;
          // middleware refreshes the session instead
        }
      },
    },
  });
}
