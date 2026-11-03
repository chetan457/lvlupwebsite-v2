'use server';

import { redirect } from 'next/navigation';

import { supabaseConfigured, supabaseServer } from '@/lib/supabase/server';

/**
 * Sign-in and sign-out for the console.
 *
 * Supabase Auth proves who holds the password; it does not prove they work
 * here. The gate is an active row in `staff` — someone whose row is switched
 * off (or was never created) is signed straight back out below, so a retired
 * account cannot be left holding a valid session cookie.
 *
 * Both of these end in `redirect()`, which works by throwing: it has to be
 * called after the last try/catch, never inside one.
 */

export type SignInState = { error: string };

/** Only ever send someone back into the console, never to a URL a visitor supplied. */
function safeNext(value: FormDataEntryValue | null): string {
  const path = typeof value === 'string' ? value : '';
  if (!path.startsWith('/admin') || path.startsWith('/admin/login')) return '/admin';
  // "//evil.com" is a protocol-relative URL, not a path
  return path.startsWith('//') ? '/admin' : path;
}

export async function signIn(formData: FormData): Promise<SignInState> {
  if (!supabaseConfigured) return { error: 'Sign-in is not set up yet.' };

  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  if (!email || !password) return { error: 'Enter your email and password.' };

  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !data.user) {
    const message = error?.message ?? '';
    if (/rate limit|too many/i.test(message)) return { error: 'Too many attempts. Wait a minute and try again.' };
    if (/email not confirmed/i.test(message)) return { error: 'That email has not been confirmed yet.' };
    // anything else, invalid credentials included, stays vague on purpose:
    // a precise message tells a stranger which emails exist
    return { error: 'That email and password do not match.' };
  }

  const { data: staff } = await supabase
    .from('staff')
    .select('active')
    .eq('id', data.user.id)
    .maybeSingle();

  if (!staff?.active) {
    await supabase.auth.signOut();
    return { error: 'That account is not active.' };
  }

  redirect(safeNext(formData.get('next')));
}

export async function signOut(): Promise<void> {
  if (supabaseConfigured) {
    const supabase = await supabaseServer();
    await supabase.auth.signOut();
  }

  redirect('/admin/login');
}
