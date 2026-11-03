import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * The console's door, and the only place the auth cookie gets refreshed.
 *
 * It answers one question — is there a session — and nothing more. It does not
 * read `staff`: that would cost a database round trip on every request, and a
 * middleware check can be bypassed by anything that renders outside it. The
 * layout and pages re-check with `currentStaff()`, which is the real gate; this
 * just saves a signed-out visitor from loading a screen they cannot use.
 *
 * Env is read straight off process.env rather than through lib/supabase/server,
 * which imports next/headers and so cannot run here.
 */

const LOGIN = '/admin/login';
const HOME = '/admin';

export async function middleware(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // the public site has to build and deploy before Supabase exists
  if (!url || !anonKey) return NextResponse.next();

  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(list) {
        // both sides: the request so this render sees the fresh session,
        // the response so the browser keeps it
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // always called, never conditionally: this is what rotates the refresh token.
  // Drop it and everyone gets signed out mid-shift when the access token expires.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname, search } = request.nextUrl;
  const onLogin = pathname === LOGIN;

  if (!user && !onLogin) return bounce(request, response, LOGIN, pathname + search);
  // Deliberately no "already signed in, go to the floor" bounce: a session whose
  // staff row is missing or deactivated is turned away by every page, and bouncing
  // it back here would trap it in a redirect loop with no way to reach Sign out.


  return response;
}

/** Carries any cookie the refresh above set onto the redirect, so it is not thrown away. */
function bounce(request: NextRequest, carrying: NextResponse, pathname: string, next?: string) {
  const target = request.nextUrl.clone();
  target.pathname = pathname;
  target.search = '';
  if (next) target.searchParams.set('next', next);

  const redirect = NextResponse.redirect(target);
  carrying.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
  return redirect;
}

export const config = { matcher: ['/admin/:path*'] };
