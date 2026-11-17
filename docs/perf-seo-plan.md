# Speed + SEO plan — lvlupzone.in (v2)

Status: FINAL v3 (2026-11-18) — 3/3 reviewers READY in round 2 (perf, admin/security, SEO/ops); round-2 non-blocking notes folded in
Owner approval needed before any phase ships. Each phase ships as its own deploy, never bundled with another phase.

## 1. Baseline (measured 2026-11-18, live site)

Lighthouse 12.8.2, headless Chromium, default throttling (mobile = 4x CPU, slow 4G).

| Page | Perf mobile | Perf desktop | SEO | Notes |
|---|---|---|---|---|
| `/` | 54 | 96 | 69 | mobile TBT 3,040 ms, TTI 8.2 s, LCP 3.9 s, main thread 9.6 s (8.5 s script eval) |
| `/admin/login` | 97 | 100 | 50 | fine; SEO irrelevant (noindex by design) |

**Server:** TTFB ~20–120 ms, HTML gzip 33 KB, prerendered, CDN (`hcdn`) in front with `s-maxage=600, stale-while-revalidate=31535400`. Not the bottleneck.

**Homepage (corrected after review):**
- Bootup: chunk `926.*.js` 5.9 s scripting, `794-*.js` 2.4 s; long tasks up to 1.6 s.
- Headless Lighthouse renders WebGL with SwiftShader (CPU). Shader compiles and every rendered frame are counted as script time, so lab numbers overstate the cost on a real phone GPU — but they are what Lighthouse/PageSpeed score.
- Phones get the `low` tier (coarser voxels, lower DPR) **but still run bloom**: `bloomAllowed` (`scene.ts` ~437) only checks float render targets, so EffectComposer + UnrealBloom + OutputPass run on phones too.
- Scene start is **already** idle-gated: `experience.tsx` `requestIdleCallback(begin, { timeout: 1200 })`.
- Before the scene is up (`status === 'pending'`) the hero shows only glow + grid; the console still renders only when `status === 'off'` (`experience.tsx` ~84).
- At progress 0, `scene.ts` ~559 requests every model with `|progress - i| < 1.1` → console **and** bays GLBs load immediately; their dust/halo surface sampling then runs at idle (800 ms timeout).
- `renderer.compile(scene, camera)` (~721) runs synchronously (compileAsync was removed on purpose — see comment ~699); no worker can move it.

**Admin (code reading; logged-in timing not yet measured):**
- Per page, sequential: middleware `getUser()` (network) → page `currentStaff()` → `getUser()` again (network) → `staff` select → page queries (`Promise.all`). Each page/action calls `currentStaff()` once; no layout/component calls it.
- Floor (`components/admin/floor-live.tsx`): realtime is primary; a fallback poll runs only when the channel is not `SUBSCRIBED`; every realtime event triggers `router.refresh()` (no debounce).
- No `loading.tsx` anywhere under `app/admin`.
- RLS: every read policy uses `is_staff()`, which requires `staff.active` → a session without an active staff row reads nothing.

**SEO:**
- `SITE_INDEXABLE` unset → `robots.txt Disallow: /` and `<meta robots noindex,nofollow>`.
- Hosts: `http://lvlupzone.in` → 301 `https://lvlupzone.in/` ✓; **`https://www.lvlupzone.in/` → 200 full page** (duplicate host; canonical points to apex); `http://www` → `https://www` (not apex).
- Structured data: EntertainmentBusiness, FAQPage, Offer, OpeningHoursSpecification — hours are placeholders, `geo` null.
- H1 "PS5 by the hour" (no location). Title, description, OG image, `lang=en-IN`, alt text OK.
- v2 shares copy with v1 (`lib/seo.ts`); where v1 is served must be confirmed.

## 2. Principles / constraints

- Hostinger shared Node, Git auto-deploy on push to `main`, ~7 min builds, `experimental.cpus: 1` stays.
- One phase per deploy, off-peak (before 12:00 IST; lounge opens afternoons). A regression is live ≥ 7 min until a revert builds.
- No visual regression on desktop; once the scene is up it looks exactly as now.
- Admin auth must not get weaker: middleware stays a convenience gate (and the only refresh-token rotation point); pages and actions stay the real gate; RLS unchanged.
- Measure before/after with the same commands, 3 runs, median; compare against the **live** site, not localhost.
- Rollback: code → `git revert <sha>` + push. Env-var changes (e.g. `SITE_INDEXABLE`) are not in git — rollback is documented per step.

## 3. Phase 0 — Profile (1 h)

1. Production build locally (`npm run build:hostinger && npm start`), Chrome DevTools Performance at 4x CPU, `low` tier forced (narrow viewport). Rank by ms: `buildFormations`, `createModels`/GLB decode, `renderer.compile`, bloom composer setup, first frames, dust/halo sampling, tunnel.
2. Same on a **real mid-range Android** over remote DevTools (real GPU), including steady-state FPS with and without bloom (`?bloom=off` debug switch).
3. Two ranked lists (lab vs real device). Phase 1 items are ordered by the lab list for the Lighthouse score and checked against the device list so real users are not made worse.

## 4. Phase 1 — Homepage on phones

**Decision (recommended, owner to confirm): low tier starts the 3D on first interaction** (scroll, touch, key, pointer move) or after an idle fallback following `load`, whichever first. Fallback starts at 6 s; Stage A lab runs must show no scene setup in the trace without interaction — if it still appears, raise to 8 s or go interaction-only. High tier (desktop) keeps today's idle start. Trade-off: on phones the 3D appears a moment later for a visitor who does nothing; in exchange the page is usable immediately and the Lighthouse window is clear. Alternative "idle start only" would gain little (work still lands before TTI).

Staged targets (mobile Lighthouse, median of 3):
- Stage A (interaction start + still hero): Perf ≥ 80, TBT ≤ 600 ms, LCP ≤ 2.5 s, CLS 0.
- Stage B (setup diet): Perf ≥ 85, TBT ≤ 300 ms.
- Desktop Perf stays ≥ 95 at every stage.

Items (one commit each):
1. **Still hero while pending (low tier only).** Show `/stills/console.webp` for `pending` as well as `off` on the low tier (desktop keeps today's pending look, so no desktop visual change), crossfade to canvas on first frame. It becomes the LCP element: preload it (`fetchpriority="high"`, correct `width/height`, `sizes`), re-encode to ≤ 40 KB, check LCP does not grow.
2. **Interaction start on low tier** (decision above) in `experience.tsx`; keep reduced-motion / save-data / no-WebGL2 → `off`.
3. **Phones: no bloom.** Hard gate `bloomAllowed` on `quality === 'high'`. Not added later mid-scroll: compiling UnrealBloom shaders mid-scroll brings back the stutter the compileAsync comment warns about.
4. **Load only chapter 0's model at start on low**: request threshold `< 0.6` on low (keep `1.1` on high); after the first frame, prefetch the bays GLB in idle time (fetch only, no decode) so chapter 1 is not late; chunk dust/halo sampling per source mesh (one per idle callback).
5. **Shader compile diet:** compile per model when it loads (not one big compile of everything), reduce material variants on low (shared materials, fewer defines). Re-test that the stutter fixed by removing compileAsync does not come back (comment ~699).
6. **Formations off the main thread:** `buildFormations` is pure (no imports) → move to a module Worker returning transferable `Float32Array`s, or precompute `public/formations-{low,high}.bin` at build. Pick by Phase 0 cost; worker preferred (no build-step risk on Hostinger). Worker via webpack pattern `new Worker(new URL('./formations.worker.ts', import.meta.url))`, verified once under `build:hostinger`; rates/seats passed in by message, no content imports inside the worker.
7. **JS weight:** `@next/bundle-analyzer` with the webpack build (`build:hostinger`). Next 16 already targets modern browsers (`node_modules/next/dist/docs/03-architecture/supported-browsers.md`), so trace where the 12 KB legacy JS actually comes from before changing anything. Drop unused three.js example / gsap imports.

## 5. Phase 2 — Admin console

Goal: ≤ 2 sequential Supabase round trips server-side per screen; every navigation shows feedback within 100 ms.

1. **Signing keys check first:** Supabase dashboard → Auth → JWT signing keys. Record which type. If asymmetric: pages use `getClaims()` (local JWT check against cached JWKS). If legacy HS256: `getClaims()` would call `getUser()` anyway, so keep `getUser()` and rely on items 2–3. Middleware keeps `getUser()` on every `/admin/*` request (rotation; also covers Server Actions, which POST to `/admin/*`). Known trade-off with `getClaims()`: a sign-out elsewhere is enforced by the middleware `getUser()` only — acceptable, documented.
2. **Per-request dedupe only:** `import { cache } from 'react'` around `currentStaff()`. Never `'use cache'`, `unstable_cache` or any cross-request cache on `currentStaff` or any admin query (would share data across users). Expected gain small (each page calls it once) — it is a safety net.
3. **Parallel reads, pages only:** once the user id is known, run the `staff` lookup and the page's read queries in one `Promise.all`; if staff is null/inactive, discard the data and `redirect('/admin/login')` before rendering anything. Safe because RLS returns nothing to non-staff. Note: if the access token expired, concurrent reads could each try a refresh; middleware refreshes first so this should not occur — if the idle-tab test signs the user out, look here first. Role checks (`canEdit`, `canClose`) keep using the fetched staff row. **Actions unchanged:** `lib/admin/actions.ts` `guard()` must complete before any write.
4. **Loading states without touching login:** move console pages into a route group `app/admin/(console)/{page,day,stations,access}` with a `loading.tsx` per screen; `login`, `forgot`, `reset` stay outside the group (no skeleton, no streaming). Delete the old `app/admin/page.tsx` in the same commit (two pages resolving to `/admin` fails the build). Verify a signed-out visit to any console URL still ends on `/admin/login` — for signed-out visitors middleware's 307 happens before streaming; a signed-in account without an active staff row passes middleware, sees the skeleton, then gets a streamed client-side redirect to login (no data rendered; covered by the §7 no-staff-row test).
5. **Floor refresh:** debounce realtime-triggered `router.refresh()` to one per 2 s; pause the fallback poll while `document.hidden`; refresh immediately on `visibilitychange` → visible so a phone returning from sleep is not stale.
6. **Measure:** dev-only timing logs per screen (no `Server-Timing` in production responses). Owner names the slowest screen; before/after round-trip count recorded.
7. Out of scope (own deploy later): `middleware.ts` → `proxy.ts` rename (deprecated in Next 16, still works).

## 6. Phase 3 — SEO

**3a. Ship now (no owner data needed, own deploy):**
1. **www → apex redirect:** `next.config.mjs` `redirects()` with `has: [{ type: 'host', value: 'www.lvlupzone.in' }]` → `https://lvlupzone.in/:path*` with `statusCode: 301`; if the Hostinger proxy does not pass the `www` Host header to Node, use the Hostinger domain redirect instead. After deploy, **purge the Hostinger CDN** (the www 200 is cached with long stale-while-revalidate). Verify all four variants with `curl -I` (http/https × www/apex) end at `https://lvlupzone.in/` in ≤ 2 hops (accept 301 or 308).
2. Canonical and sitemap use the same form for the root: set an absolute canonical string `https://lvlupzone.in/` (Next drops the trailing slash for `canonical: '/'` with `metadataBase`).
3. H1/hero copy includes "Nadiad" (e.g. "PS5 by the hour in Nadiad") without breaking the hero layout.
4. Confirm the single `ld+json` block carries both the business node and FAQPage (`@graph`) and passes Rich Results Test + schema.org validator; `sameAs` = Instagram. (Real lounge photo as `image`, GBP/WhatsApp in `sameAs` → moved to 3b, needs owner photos/links.)

**3b. Indexing gate — all must be true before `SITE_INDEXABLE=true`:**
- Real opening hours in `content/hours.ts`, identical to the Google Business Profile.
- NAP identical character-for-character on site, schema and GBP: name ("LvlUp Gaming Lounge" vs GBP name), "Office 332–333, Third floor, Nadiad Nexus-I", road, PIN 387001 (confirmed), +91 84016 65488.
- `geo` filled from the real Maps pin, or left out; `mapsUrl` = GBP share link.
- `reviews`/`rating` empty or real (no invented data).
- GBP live (done before or together with the flip), website = `https://lvlupzone.in/` (UTM-tagged), Instagram linked, photos, same hours.
- Schema `image` = a real lounge photo (owner photos), `sameAs` += GBP (+ WhatsApp).
- v1 (`lvlupwebsite` repo): confirm whether it is served anywhere; if yes, noindex it or 301 it to lvlupzone.in first (duplicate copy).

**3c. Flip (own change, off-peak):**
1. Set `SITE_INDEXABLE=true` in Hostinger env → rebuild.
2. **Purge Hostinger CDN cache** (stale `noindex` HTML otherwise served under `stale-while-revalidate`).
3. Cold-request checks: `robots.txt` allows `/`, disallows `/admin`, lists sitemap; `/` meta robots `index,follow`; `/admin` `X-Robots-Tag: noindex`.
4. Search Console: Domain property (DNS TXT), submit sitemap, URL Inspection → request indexing, check Google-selected canonical = apex. Bing Webmaster Tools (import from Search Console).
5. **Rollback for the flip:** unset `SITE_INDEXABLE` in Hostinger panel → rebuild (~7 min) → purge CDN → re-check `robots.txt`. **Risk:** any future deploy built without the env var silently de-indexes the site → `robots.txt` check is in every deploy checklist (§7).

Later (not in scope): a second indexable page (games list / parties).

## 7. Verification checklist (every deploy)

**Build & visual**
- [ ] `npx tsc --noEmit` clean; local `npm run build:hostinger` passes with `cpus: 1`
- [ ] Hostinger build `completed`; live asset URLs 200
- [ ] Desktop + 390 px screenshots of hero (incl. any H1 change); all chapters scroll; console model forms; still→canvas crossfade clean on low and desktop handoff unchanged
- [ ] Reduced-motion, save-data and no-WebGL paths show the still

**Performance**
- [ ] Lighthouse mobile + desktop on live `/`, 3 runs median, vs baseline and stage target; LCP not worse
- [ ] Real mid-range Android: time to 3D after first touch, steady FPS ≥ 50, INP of the first tap during scene start ≤ 200 ms
- [ ] After 28 days: Search Console Core Web Vitals / CrUX field data (once indexed)

**Admin & auth (Phase 2 deploys, and any deploy touching `app/admin`, `lib/admin`, `middleware.ts`)**
- [ ] Signing-key type recorded, and which path §5.1 took
- [ ] Sign in → floor, start/end a session, day, stations, access, sign out
- [ ] Signed-out visit to each console URL lands on `/admin/login`; login/forgot/reset show no skeleton
- [ ] Idle tab past access-token expiry (> 1 h), then navigate + run an action: works without re-login (rotation)
- [ ] Deactivate a signed-in user: next page load and next action blocked; no realtime rows delivered
- [ ] Signed-in account with no staff row: sees nothing, redirected to login
- [ ] Password reset link still works
- [ ] Staff-role account cannot see manager/owner controls on stations or day
- [ ] `npm run test:db` passes
- [ ] Supabase round trips per screen counted (dev logs) ≤ 2 sequential

**SEO (every deploy)**
- [ ] `robots.txt` = expected state (closed until flip; open + sitemap after)
- [ ] `<meta robots>` on `/` as expected; `X-Robots-Tag: noindex` on `/admin`
- [ ] Canonical `https://lvlupzone.in/`; www/http variants 301/308 to it
- [ ] `/sitemap.xml` 200 and valid; OG image URL 200
- [ ] Rich Results Test passes on live URL (after 3a)

**Rollback**
- [ ] Commit SHA to revert recorded; env-var rollback steps at hand if the deploy touched env

## 8. Order and effort

| Step | Effort | Depends on | Deploy |
|---|---|---|---|
| 0 Profile | 1 h | — | none |
| 1 Homepage mobile, stage A (items 1–3) | ~½ day | Phase 0, owner OK on interaction start | own |
| 1 stage B (items 4–7) | ~½–1 day | stage A measured | own |
| 2 Admin | ~½ day | signing-key check | own |
| 3a SEO quick fixes (www 301, H1, schema) | ~1 h | — | own |
| 3b/3c Indexing | ~1 h + Google verification | owner data + GBP | own (env change) |

Phases 1, 2 and 3a are independent and can be built in parallel, but deploy one at a time with the §7 checks in between.
