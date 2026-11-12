'use client';

import { useState } from 'react';

import { buttonClass } from '@/components/ui/button';
import { supabaseBrowser } from '@/lib/supabase/browser';

/**
 * Asking for a recovery link.
 *
 * Sent from the browser so `redirectTo` is built from the address the staff
 * member is actually on — localhost while this is in development, the real
 * domain once it is deployed — instead of a URL hard-coded at build time and
 * wrong in one of the two places.
 *
 * The answer is the same whether or not the address has an account. Saying
 * "no such account" turns this form into a way of discovering who works here.
 */

const field =
  'min-h-11 w-full border border-edge bg-room/70 px-3.5 font-mono text-[0.95rem] text-paper ' +
  'transition-colors placeholder:text-dimmer hover:border-edge-hi focus-visible:border-accent';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);

  async function send(event: React.FormEvent) {
    event.preventDefault();
    setError('');

    const supabase = supabaseBrowser();
    if (!supabase) {
      setError('This build has no Supabase keys, so no email can be sent.');
      return;
    }

    setSending(true);
    const { error: failed } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/admin/reset`,
    });
    setSending(false);

    // a rate limit is worth saying out loud: it is the one case where trying
    // again straight away cannot work
    if (failed && /rate limit|too many|security purposes/i.test(failed.message)) {
      setError('Too many requests. Wait a minute and try again.');
      return;
    }

    setSent(true);
  }

  return (
    <div className="grid min-h-[70vh] place-items-center px-[var(--gutter)] py-12">
      <div className="hud-card w-full max-w-sm px-6 py-8 sm:px-8">
        <p className="eyebrow">LvlUp ops</p>
        <h1 className="mt-2 font-display text-[1.8rem] font-semibold uppercase leading-none tracking-[0.01em]">
          Reset password
        </h1>

        {sent ? (
          <>
            <p className="mt-4 text-[0.9rem] text-dim">
              If that address has an account, a link is on its way. It works once, and for an hour. Check the spam
              folder before asking for another.
            </p>
            <a href="/admin/login" className={buttonClass('ghost', 'lg', 'mt-7 w-full')}>
              Back to sign-in
            </a>
          </>
        ) : (
          <>
            <p className="mt-3 text-[0.9rem] text-dim">
              We will email you a link that lets you set a new one.
            </p>

            <form onSubmit={send} className="mt-7 grid gap-5">
              <div className="grid gap-2">
                <label htmlFor="email" className="eyebrow">
                  Email
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="username"
                  inputMode="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  required
                  autoFocus
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className={field}
                />
              </div>

              <p aria-live="polite" className="min-h-5 font-mono text-[0.78rem] leading-5 text-alarm">
                {error}
              </p>

              <button
                type="submit"
                disabled={sending}
                className={buttonClass('primary', 'lg', 'w-full disabled:opacity-60')}
              >
                {sending ? 'Sending…' : 'Email me a link'}
              </button>
            </form>

            <p className="mt-6 text-[0.8rem] text-dimmer">
              <a href="/admin/login" className="transition-colors hover:text-paper">
                Back to sign-in
              </a>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
