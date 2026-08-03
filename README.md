# Taskmana

A calm personal task system as an installable web app — mobile-first, offline-capable, no build step. Live at **https://taskmana-nine.vercel.app**.

It combines four pen-and-paper systems. **Settings → Method hints** toggles in-app explanations of each method with its author, each with cyclable (`↻`) real-world examples. Hints start on with a mouse and off on a phone, where they'd otherwise be half the first screen. (Settings live in the **More** tab on a phone and behind the masthead's **⚙** chip on desktop — every "More → …" path below means "⚙ → …" there.)

- **Brain dump** (David Allen, *Getting Things Done*) — the capture bar with its **Add** button, within thumb reach at the bottom on a phone and right under the masthead on desktop. Type, hit Add or Enter, it's out of your head and into the Inbox.
- **Daily top-3 + ordered queue** (Ivy Lee Method, 1918) — Today holds up to 6 ordered tasks; the first 3 are visually "today's win." Toggle **Focus** to enforce Ivy Lee strictness: only the first unfinished task is actionable.
- **Migration** (Ryder Carroll, Bullet Journal) — unfinished Today tasks carry over each day and earn a `›` mark. After 5 carries, the task asks you: *still worth doing?* Keep / Someday / Drop.
- **Weekly review** (GTD) — the **Review** button walks through your inbox, someday list, and stale tasks one at a time (a red dot nudges you when it's been 7+ days). Finishing a review offers a one-click **Export backup** while the list is at its cleanest.
- **Plan tomorrow** (Ivy Lee's evening ritual) — pick and order up to 6 tasks for tomorrow; they become Today at the next day's first open. A live preview in the dialog shows exactly what tomorrow's list will be: your picks first, carried-over tasks after, overflow back to the inbox.

Theme: **More → Appearance** forces Light or Dark, or follows your system appearance.

## The shell

Mobile is the base layout; the desktop column is a `@media (min-width: 768px)` enhancement — the only width breakpoint in the stylesheet.

On a phone there are four tabs — **Today · Inbox · Someday · More** — over a fixed dock holding the capture bar and the tab bar. The active tab lives in the URL hash, so Android Back and iOS edge-swipe return to the previous tab instead of leaving the app, and `#inbox` is a working deep link. Capture is always one tap away (except on More, which is settings), and files to the Inbox from anywhere — a toast says so and offers to promote to Today. Dialogs present as floating popup cards pinned near the top of the screen, where the soft keyboard can never cover them.

Every row action is a visible button on the row — no overflow menu. Inbox: **Today / Someday / ✕**, Today: **checkbox / ↑ / ↓ / Inbox**, Someday: **Inbox / ✕**, Recycle: **Restore**. Rows also swipe as an accelerator: **right is constructive, left removes**, mirroring the buttons. Anything destructive raises an Undo toast, and a test asserts every swipe action exists as a button structurally.

At ≥768px the layout is the old extension's new-tab page, faithfully: date masthead with chips, the capture bar directly under it, then a single centred 640px column of sections. Settings don't render at the page bottom there — the masthead's **⚙** chip opens the More section as a popover (outside click or Escape closes it). The tab bar disappears, dialogs become centred modals, and row actions stay visible — no hover-reveal. (The DOM stays mobile-first; flex `order` moves the capture dock up, and the More section node never moves.)

## Install

Open the URL in Safari (iPhone) or Chrome (Android/desktop) → Share / menu → **Add to Home Screen**. That installs it as a standalone app with an offline app shell, and — unlike a plain browser tab, whose storage iOS evicts after ~7 days unused — durable storage.

`manifest.webmanifest` + `sw.js` make it a PWA. The service worker precaches every script `index.html` loads; if you add one, add it to `ASSETS` in `sw.js` or an offline cold start will boot into a blank page. `scripts/bump-version.mjs` keeps the service-worker cache key, `package.json`, and the visible **version line at the bottom of settings** in step, so each release invalidates the installed copy — and that version line is how you check what a device is actually running.

Updates install themselves: the app checks for a new service worker every time it returns to the foreground (iOS restores it from memory without a navigation, so the browser's own check never fires) and reloads once the new version takes over.

## Deploying

The repo is linked to the Vercel project `taskmana` and connected to GitHub, so pushes to `main` deploy automatically. To deploy by hand: `vercel --prod` from the repo root. There's no build step and no `vercel.json` — Vercel serves the root `index.html` at `/` natively, and `.vercelignore` keeps tests and tooling out of the upload.

## Sync (optional)

Signed out, the app is local-only. With a Supabase project configured, **More → Backup & sync → Sync** signs you in by email one-time code (no password, no redirect URLs) and keeps devices in step: local-first (every device renders from its own storage instantly and works offline), background pull/merge on open, debounced push on change with optimistic concurrency on a `revision` column. Conflicts are merged per task — the copy with the newer `modifiedAt` wins — so a capture on the phone can't be clobbered by a desktop save.

This project is already wired to a Supabase project — `js/config.js` holds its URL and anon key, and the table exists. To set it up again from scratch:

1. Run `scripts/supabase-setup.sql` in the SQL editor. It's idempotent. The `taskmana_` table prefix matters: the Supabase project hosts several apps, and a bare `states` table would be a collision waiting to happen — `js/sync.js` reads `from('taskmana_states')`.
2. Auth → Email templates → **Magic Link**: include `{{ .Token }}` in the body (e.g. "Your Taskmana code: {{ .Token }}"). `js/sync.js` uses `verifyOtp` with a 6-digit code, not a redirect link, so without the token in the template there is nothing to verify against.
3. Put the project URL and API key in `js/config.js`. The key is committed on purpose — it's the *publishable* kind (`sb_publishable_…`) and RLS is the security boundary. The shared project **disabled legacy JWT-style keys on 2026-06-03**: an old `eyJ…` anon key fails every request with "Legacy API keys are disabled", which surfaces in-app as a red sync error.

Two things the single-app version of these instructions gets wrong for a **shared** Supabase project. `auth.users` is project-wide, so anyone signed up for another app in it can sign into Taskmana — RLS still scopes them to their own empty row, so it's a nuisance rather than a breach. And do **not** disable "Allow new users to sign up" as a lockdown: it's a project-wide setting that would break signup for the other apps. Use an email allowlist in the RLS policies instead.

Gotchas: Supabase free-tier projects pause after ~a week of inactivity (sync quietly stops; local keeps working; restore the project to resume). The vendored `js/vendor/supabase.js` is lazy-loaded only when a session exists or the Sync dialog opens, so a normal open doesn't pay its parse cost.

## Data & backups

State lives in `localStorage` under the key `taskmana-state`, and the app asks for persistent storage on boot. Installed as a home-screen app that's durable; in a plain iOS Safari tab it is not — iOS evicts unused tab storage after ~7 days. Install it, or configure sync, or both.

The foot of **Today** shows what you finished today — the day's reward belongs on the day's screen. **More → Done** keeps a collapsed **Previous days** log: the last 14 days of finished tasks, grouped by day, like flipping back through a bullet journal. Completed tasks are never deleted; older days just aren't shown.

Dropped tasks aren't gone immediately either: they sit in **More → Recycle bin** for 30 days (each row shows when it expires), where one tap restores them to the Inbox. After 30 days the daily rollover prunes them for good.

Use **More → Backup & sync → Export backup** (or the nudge after finishing a weekly review) to download a dated JSON backup (`taskmana-backup-YYYY-MM-DD.json`), and **Import** to restore one — it validates the file and asks before replacing your current tasks. In an installed app Export goes through the system share sheet, because an `<a download>` click is unreliable in a standalone iOS PWA.

## Development

No build step: the files in this folder are served as-is. The scripts are classic (non-module) scripts on purpose — top-level `const` namespaces (`TaskmanaStore`, `TaskmanaModel`, `TaskmanaSync`, `TaskmanaConfig`, `TaskmanaNav`, `TaskmanaUI`, `TaskmanaViewport`, `TaskmanaSwipe`) are the cross-file sharing mechanism, and the load order in `index.html` is therefore load-bearing. Note those are global *lexical* bindings, not properties of `window` — `page.evaluate(() => TaskmanaNav...)` fails where `page.evaluate('TaskmanaNav...')` works.

`npm run serve` starts a dependency-free static server on http://localhost:4173 (`scripts/serve.mjs`); Playwright starts the same one automatically.

Dev tooling (tests + types only):

```sh
npm install
npm run typecheck   # TypeScript strict mode over the JS source (checkJs + JSDoc)
npm run test:unit   # node:test unit tests for model logic + sync merge (46 tests)
npm run test:e2e    # Playwright over http: e2e, tab routing, swipe gestures,
                    # dialog cards + keyboard insets, axe a11y, 44px targets,
                    # visual regression (70 tests across two engine projects)
npm test            # all of the above
```

Playwright runs two projects: `chromium` (everything, desktop 900×900 plus per-spec device emulation) and `mobile-webkit`, which re-runs the mobile layout specs (`sheets`, `touch`) on real WebKit — the engine family of the actual phone, where a dialog-crushing flexbox bug once shipped invisibly because the suite was Blink-only.

CI (GitHub Actions) runs typecheck + unit + e2e on every push to `main`. Releases follow a 0–9-per-segment scheme (`1.0.1 … 1.0.9 → 1.1.0`); `npm run bump` advances `package.json`, the `sw.js` cache key, and the settings version line in `index.html` together. Stored state carries a schema `version`; `TaskmanaModel.migrateState` upgrades older shapes (and old backup files on import) stepwise — when changing the `State` shape, bump `STATE_VERSION` and add a migration entry.

The e2e suite drives the app over http against real `localStorage`, so capture, persistence, day rollover, review, planning, theme, hints, and export/import are all exercised end-to-end. `nav.spec.ts`, `swipe.spec.ts`, and `touch.spec.ts` run under Pixel 7 emulation; `sheets.spec.ts` under iPhone 14 — at desktop widths the tab bar is hidden.

Three testing notes worth keeping:

- Every row action is an inline button built from the one descriptor list in `rowActions()` (there is no overflow menu), so `rowAction()` in `fixtures.ts` can invoke any of them by accessible name on either layout. On desktop, controls inside settings need `openSettings()` first — the ⚙ popover closes on any outside click, so re-open it after page interactions.
- Swipes are driven with `page.mouse`, which emits `pointerType: 'mouse'`. `js/swipe.js` therefore must never filter on pointer type — doing so would make gestures untestable without CDP. Drag helpers must also start over the task *text*: a row's centre can land on an inline action button, and swipe.js rightly ignores drags that start on a button.
- Keyboard tests inject clean values into `applyInset()` — which is exactly why `measure()` itself gets hostile-input tests too (CDP page-scale zoom for phantom insets, `applyInset(2000)` for the clamp). Measuring with clean inputs once let a device-only bug ship twice.

Accessibility tests run axe (WCAG 2.1 AA) on the page in both color schemes and on the dialogs, plus an explicit ≥44px sweep over every visible control on all four tabs (axe's own WCAG 2.2 `target-size` rule allows 24px, too lenient for a thumb). Visual regression baselines live in `tests/e2e/visual.spec.ts-snapshots/`; after an intentional UI change, refresh them with `npx playwright test --update-snapshots`.

Gotchas learned the hard way (preserved here so they aren't relearned):

- A button's visible text beats its `title` in accessible-name computation — icon buttons need `aria-label`.
- An author `display: flex` overrides the UA's `[hidden] { display: none }`; the reset includes `[hidden] { display: none !important; }`.
- The `* { margin: 0 }` reset removes the `margin: auto` that centers native `<dialog>`s — `.dialog` restores it.
- `display: flex` on a `<dialog>` **must** be qualified `[open]`. Unqualified, the author rule beats the UA's `dialog:not([open]) { display: none }` and every sheet renders permanently. Same family as the `[hidden]` note above.
- An inline `style.display` beats any `body[data-view]` rule, so hiding an empty section that way blanks a whole tab. Toggle a class or `hidden` on an inner wrapper instead.
- A gesture is always followed by a `click` on whatever was under the finger. Since tapping task text opens the editor, every swipe would leave an open field behind — `js/swipe.js` swallows that click in the capture phase.
- `touch-action: pan-y` on a swipeable row (never `none`) keeps vertical scrolling on the compositor while leaving the horizontal axis to JS.
- Dismissing the iOS keyboard with its own Done/✓ key hides it **without blurring the field**, so a blur-to-commit handler never runs and an inline editor looks stuck. `js/viewport.js` treats the keyboard closing as the end of editing.
- Tearing a focused input out of the DOM fires `blur`. An editor whose Escape handler re-renders will therefore commit the edit it meant to discard — `editableText` latches commit/cancel so only the first one wins.
- iOS Safari doesn't resize the layout viewport for the keyboard, and `env(keyboard-inset-height)` is Chromium-only — `visualViewport` (`resize` **and** `scroll`) is the only way to keep a fixed bottom bar above it. Dialogs sidestep the whole problem by anchoring near the **top** of the screen (the keyboard owns the bottom); their `max-height` still subtracts `--kb-inset` so a tall card can't run under it, with a `max()` floor so a bad inset degrades to "the body scrolls", never a crushed card.
- `visualViewport` lies under zoom: iOS pinch/auto-zoom shrinks `vv.height` with no keyboard anywhere, and stale post-keyboard state persists. `measure()` returns 0 while `vv.scale > 1.05` and `applyInset()` clamps to 60% of the screen — without those guards, phantom "keyboards" crushed every dialog on-device while every emulator passed.
- Never give the dialog body `flex: 1` — its 0% flex-basis lets older WebKit collapse an auto-height column flex container to header + footer with the body squeezed to one clipped line. `flex: 1 1 auto` is the immune form; a regression test asserts the rendered body always matches its content height. Current Chromium *and* current WebKit render `flex: 1` fine, which is how this shipped invisibly.
- `cache.addAll()` in a service worker is all-or-nothing: one bad path aborts the install and the app is silently never offline-capable. `sw.js` uses `Promise.allSettled` over individual `cache.add()` calls.
