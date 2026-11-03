'use client';

import { Suspense, useActionState } from 'react';
import { useSearchParams } from 'next/navigation';

import { buttonClass } from '@/components/ui/button';
import { signIn, type SignInState } from '@/lib/admin/auth';

/**
 * The console sign-in.
 *
 * A client component end to end so the form can report its own pending and
 * error state without a round trip through a query string. Keeping search
 * engines out is a headers job, not a metadata one — a client component cannot
 * export `metadata`, and the route is behind middleware anyway.
 */

const field =
  'min-h-11 w-full border border-edge bg-room/70 px-3.5 font-mono text-[0.95rem] text-paper ' +
  'transition-colors placeholder:text-dimmer hover:border-edge-hi focus-visible:border-accent';

export default function LoginPage() {
  // a div, not a main: the console layout already provides the page landmark
  return (
    <div className="grid min-h-[70vh] place-items-center px-[var(--gutter)] py-12">
      {/* the attempted path arrives as ?next=, so this reads the URL and opts out of the static shell */}
      <Suspense fallback={<div className="min-h-[22rem] w-full max-w-sm" />}>
        <LoginForm />
      </Suspense>
    </div>
  );
}

function LoginForm() {
  const next = useSearchParams().get('next') ?? '';

  const [state, submit, pending] = useActionState<SignInState, FormData>(
    (_previous, formData) => signIn(formData),
    { error: '' },
  );

  return (
    <div className="hud-card w-full max-w-sm px-6 py-8 sm:px-8">
      <p className="eyebrow">LvlUp ops</p>
      <h1 className="mt-2 font-display text-[1.8rem] font-semibold uppercase leading-none tracking-[0.01em]">
        Staff sign-in
      </h1>
      <p className="mt-3 text-[0.9rem] text-dim">
        For the floor team only. Use the email address your account was set up with.
      </p>

      <form action={submit} className="mt-7 grid gap-5">
        <input type="hidden" name="next" value={next} />

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
            className={field}
          />
        </div>

        <div className="grid gap-2">
          <label htmlFor="password" className="eyebrow">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className={field}
          />
        </div>

        {/* always mounted, so the message is announced when it appears rather than on mount */}
        <p aria-live="polite" className="min-h-5 font-mono text-[0.78rem] leading-5 text-alarm">
          {state.error}
        </p>

        <button type="submit" disabled={pending} className={buttonClass('primary', 'lg', 'w-full disabled:opacity-60')}>
          {pending ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      <p className="mt-6 text-[0.8rem] text-dimmer">
        Forgotten your password? Ask the owner to reset it from the Supabase dashboard.
      </p>
    </div>
  );
}
