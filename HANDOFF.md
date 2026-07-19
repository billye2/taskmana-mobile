# Handoff — iPhone port status (2026-07-19)

Where the iPhone/sync work stands and exactly what's left. Delete this file once
everything below is done.

## Done (commit `264e6d1`, pushed to main, full test gate green)

All code for the port is complete and merged into `main`:

- **PWA + touch** — `vercel.json`, `.vercelignore`, `manifest.webmanifest`,
  `sw.js` (version-keyed cache, auto-bumped by `npm run bump`), icons
  180/192/512, `@media (hover: none)` ergonomics, tap-to-edit on touch,
  web-only service-worker registration.
- **Schema v2 + merge** — per-task `modifiedAt`, `mergeStates()` in model.js
  (task-level newest-wins, commutative, idempotent; existing data migrates on
  first load).
- **Supabase sync** — `js/sync.js` engine + Sync dialog in the footer; email
  OTP code auth; lazy-loaded vendored client (`js/vendor/supabase.js`).
  Signed out (or with empty config), the app is exactly the old local-only app.
- **Tests** — 42 unit + 23 e2e (`npm test`); visual baselines refreshed.

Two earlier features rode along in the same commit: the footer "Previous days"
history log and the Plan-tomorrow live preview.

## Remaining steps (in order)

### 1. Deploy to Vercel  — blocked on interactive login

```sh
vercel login          # interactive; the stored token was expired
vercel --prod --yes   # first run creates + links the project
```

The deploy was otherwise preflighted (CLI 54.14.0 installed, repo committed).
Optional afterwards: connect the repo in the Vercel dashboard for
deploy-on-push so `git push` is the whole release flow.

### 2. iPhone install (works immediately, standalone data)

Safari → open the production URL → Share → **Add to Home Screen**.
Seed the phone once via Export (desktop) → Import (phone), or skip and wait
for sync in step 3.

### 3. Supabase project wiring (enables sync)

Follow README "Sync (optional)" — summary:

1. SQL editor: create the `states` table + 3 RLS policies (SQL is in README).
2. Auth → Email templates → Magic Link: add `{{ .Token }}` so the email
   contains the 6-digit code (the app uses `verifyOtp`, not the link).
3. Put the project URL + anon key into `js/config.js`, commit, redeploy
   (`vercel --prod`), and rebuild the extension zip (`npm run package`) /
   reload the unpacked extension so desktop gets the config too.
4. Sign in once on each device (footer **Sync** button → email → code).
5. After the first sign-in: Auth → Providers → Email → turn **off**
   "Allow new users to sign up" (anyone with the anon key could otherwise
   create accounts and use the project's quota; your data is RLS-protected
   regardless).

### 4. Verify sync end-to-end

- Desktop: add a task → row appears in Supabase Table Editor ~2s later,
  `revision` increments per push.
- Phone: sign in → desktop tasks appear; add a phone task → shows on the next
  desktop new tab.
- Conflict drill: airplane-mode the phone, edit the same task on both devices,
  reconnect → newer edit wins, nothing lost.
- Offline drill: phone in airplane mode → app fully usable; back online →
  pushes on the next action.

## Gotchas to remember

- **Supabase free tier pauses projects after ~1 week idle** — sync quietly
  stops (local-first keeps working); restore the project in the dashboard.
- iOS can evict *Safari-tab* storage after ~7 days unused; the installed
  home-screen PWA is much more durable, and sync is the real safety net.
- A device unused past refresh-token validity silently signs out of sync —
  local data untouched; re-enter a code.
- When bumping `STATE_VERSION` in future: `npm run bump` already rewrites the
  `sw.js` cache key, which keeps a stale phone from running old code against
  new state.
