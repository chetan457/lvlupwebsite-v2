'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { buttonClass } from '@/components/ui/button';
import { supabaseBrowser } from '@/lib/supabase/browser';

/**
 * Setting a new password, from the link in a recovery email.
 *
 * The link carries a one-time credential, and Supabase has shipped three
 * shapes of it over the years: tokens in the URL fragment (`#access_token=`),
 * a PKCE `?code=`, and a `?token_hash=` to verify. Which one arrives depends
 * on the project's email template, so all three are handled rather than
 * guessing — an unhandled shape looks to the visitor like a broken link.
 *
 * Everything happens in the browser: the credential is in the fragment, which
 * is never sent to a server, so a server action could not see it. Once the
 * password is set, the client writes the session cookies and the console opens
 * normally. The address bar is rewritten as soon as the credential is spent,
 * so a shoulder-surfer or a screenshot cannot reuse it.
 */

const field =
  'min-h-11 w-full border border-edge bg-room/70 px-3.5 font-mono text-[0.95rem] text-paper ' +
  'transition-colors placeholder:text-dimmer hover:border-edge-hi focus-visible:border-accent';

/** Supabase itself allows six. Six is not a password for a till. */
const MIN_LENGTH = 10;

type Stage = 'checking' | 'ready' | 'expired' | 'unconfigured';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>('checking');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const supabase = supabaseBrowser();
    if (!supabase) {
      setStage('unconfigured');
      return;
    }

    let cancelled = false;

    (async () => {
      const url = new URL(window.location.href);
      const hash = new URLSearchParams(url.hash.replace(/^#/, ''));

      // an expired or already-used link comes back as an error in the fragment
      if (hash.get('error') || url.searchParams.get('error')) {
        if (!cancelled) setStage('expired');
        return;
      }

      const accessToken = hash.get('access_token');
      const refreshToken = hash.get('refresh_token');
      const code = url.searchParams.get('code');
      const tokenHash = url.searchParams.get('token_hash');

      try {
        if (accessToken && refreshToken) {
          // Handed over explicitly rather than left to detectSessionInUrl: the
          // browser client is configured for the PKCE flow, and in that mode
          // supabase-js walks past a fragment like this one without reading it.
          await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
        } else if (code) {
          await supabase.auth.exchangeCodeForSession(code);
        } else if (tokenHash) {
          await supabase.auth.verifyOtp({ type: 'recovery', token_hash: tokenHash });
        }
      } catch {
        // fall through to the session check, which decides what to show
      }

      const { data } = await supabase.auth.getSession();
      if (cancelled) return;

      if (data.session) {
        setStage('ready');
        window.history.replaceState({}, '', '/admin/reset');
      } else {
        setStage('expired');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setError('');

    if (password.length < MIN_LENGTH) {
      setError(`Use at least ${MIN_LENGTH} characters.`);
      return;
    }
    if (password !== confirm) {
      setError('The two passwords do not match.');
      return;
    }

    const supabase = supabaseBrowser();
    if (!supabase) return;

    setSaving(true);
    const { error: failed } = await supabase.auth.updateUser({ password });
    setSaving(false);

    if (failed) {
      setError(
        /different from the old|should be different/i.test(failed.message)
          ? 'That is the password you already had. Choose a new one.'
          : failed.message,
      );
      return;
    }

    // the browser client has written the session cookies, so the console opens
    router.replace('/admin');
    router.refresh();
  }

  return (
    <div className="grid min-h-[70vh] place-items-center px-[var(--gutter)] py-12">
      <div className="hud-card w-full max-w-sm px-6 py-8 sm:px-8">
        <p className="eyebrow">LvlUp ops</p>
        <h1 className="mt-2 font-display text-[1.8rem] font-semibold uppercase leading-none tracking-[0.01em]">
          New password
        </h1>

        {stage === 'checking' ? (
          <p className="mt-4 text-[0.9rem] text-dim">Checking your link…</p>
        ) : null}

        {stage === 'unconfigured' ? (
          <p className="mt-4 text-[0.9rem] text-alarm">This build has no Supabase keys, so passwords cannot be changed here.</p>
        ) : null}

        {stage === 'expired' ? (
          <>
            <p className="mt-4 text-[0.9rem] text-dim">
              That link has expired or has already been used. Each one works once, and for an hour.
            </p>
            <a href="/admin/forgot" className={buttonClass('primary', 'lg', 'mt-7 w-full')}>
              Send a new link
            </a>
          </>
        ) : null}

        {stage === 'ready' ? (
          <>
            <p className="mt-3 text-[0.9rem] text-dim">
              Pick something you have not used anywhere else. {MIN_LENGTH} characters or more.
            </p>

            <form onSubmit={save} className="mt-7 grid gap-5">
              {/* the email field is hidden but present, or password managers save the
                  new password against no account at all */}
              <input type="text" name="username" autoComplete="username" className="hidden" readOnly value="" />

              <div className="grid gap-2">
                <label htmlFor="password" className="eyebrow">
                  New password
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  minLength={MIN_LENGTH}
                  required
                  autoFocus
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className={field}
                />
              </div>

              <div className="grid gap-2">
                <label htmlFor="confirm" className="eyebrow">
                  Again
                </label>
                <input
                  id="confirm"
                  name="confirm"
                  type="password"
                  autoComplete="new-password"
                  minLength={MIN_LENGTH}
                  required
                  value={confirm}
                  onChange={(event) => setConfirm(event.target.value)}
                  className={field}
                />
              </div>

              <p aria-live="polite" className="min-h-5 font-mono text-[0.78rem] leading-5 text-alarm">
                {error}
              </p>

              <button
                type="submit"
                disabled={saving}
                className={buttonClass('primary', 'lg', 'w-full disabled:opacity-60')}
              >
                {saving ? 'Saving…' : 'Save and sign in'}
              </button>
            </form>
          </>
        ) : null}
      </div>
    </div>
  );
}
