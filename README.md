# Taskmana

A calm personal task system as an installable web app — mobile-first, offline-capable, no build step. Live at **https://taskmana-nine.vercel.app**.

It combines four pen-and-paper systems into one page. The `?` chip toggles in-app hints that explain each method and credit its author, each with cyclable (`↻`) real-world examples for extra motivation:

- **Brain dump** (David Allen, *Getting Things Done*) — the capture box at the top. Type, hit Enter, it's out of your head and into the Inbox.
- **Daily top-3 + ordered queue** (Ivy Lee Method, 1918) — Today holds up to 6 ordered tasks; the first 3 are visually "today's win." Toggle **Focus** to enforce Ivy Lee strictness: only the first unfinished task is actionable.
- **Migration** (Ryder Carroll, Bullet Journal) — unfinished Today tasks carry over each day and earn a `›` mark. After 5 carries, the task asks you: *still worth doing?* Keep / Someday / Drop.
- **Weekly review** (GTD) — the **Review** button walks through your inbox, someday list, and stale tasks one at a time (a red dot nudges you when it's been 7+ days). Finishing a review offers a one-click **Export backup** while the list is at its cleanest.
- **Plan tomorrow** (Ivy Lee's evening ritual) — pick and order up to 6 tasks for tomorrow; they become Today at the next day's first open. A live preview in the dialog shows exactly what tomorrow's list will be: your picks first, carried-over tasks after, overflow back to the inbox.

Theme: the **Auto / Light / Dark** chip forces a scheme or follows your system appearance.

## Install

Open the URL in Safari (iPhone) or Chrome (Android/desktop) → Share / menu → **Add to Home Screen**. That installs it as a standalone app with an offline app shell, and — unlike a plain browser tab, whose storage iOS evicts after ~7 days unused — durable storage.

`manifest.webmanifest` + `sw.js` make it a PWA. The service worker precaches every script `index.html` loads; if you add one, add it to `ASSETS` in `sw.js` or an offline cold start will boot into a blank page. `scripts/bump-version.mjs` keeps the service-worker cache key in step with the release version, so each release invalidates the installed copy.

## Deploying

The repo is linked to the Vercel project `taskmana` and connected to GitHub, so pushes to `main` deploy automatically. To deploy by hand: `vercel --prod` from the repo root. There's no build step and no `vercel.json` — Vercel serves the root `index.html` at `/` natively, and `.vercelignore` keeps tests and tooling out of the upload.

## Sync (optional)

Signed out, the app is local-only. With a Supabase project configured, the footer **Sync** button signs you in by email one-time code (no password, no redirect URLs) and keeps devices in step: local-first (every device renders from its own storage instantly and works offline), background pull/merge on open, debounced push on change with optimistic concurrency on a `revision` column. Conflicts are merged per task — the copy with the newer `modifiedAt` wins — so a capture on the phone can't be clobbered by a desktop save.

One-time Supabase setup:

1. Create a project, then in the SQL editor. The `taskmana_` prefix matters: this Supabase project hosts several apps, and a bare `states` table is a collision waiting to happen.
   ```sql
   create table public.taskmana_states (
     user_id uuid primary key references auth.users (id) on delete cascade,
     state jsonb not null,
     revision bigint not null default 1,
     updated_at timestamptz not null default now());
   alter table public.taskmana_states enable row level security;
   create policy "select own" on public.taskmana_states for select using (auth.uid() = user_id);
   create policy "insert own" on public.taskmana_states for insert with check (auth.uid() = user_id);
   create policy "update own" on public.taskmana_states for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
   ```
2. Auth → Email templates → **Magic Link**: include `{{ .Token }}` in the body (e.g. "Your Taskmana code: {{ .Token }}") so the email carries the 6-digit code.
3. Copy the project URL and anon key into `js/config.js`. The anon key is publishable; RLS is the security boundary.
Note that `auth.users` is shared across the whole Supabase project, so anyone signed up for another app in it can sign into Taskmana — RLS still scopes them to their own (empty) row. For the same reason, do **not** disable "Allow new users to sign up": it's a project-wide setting and would break signup for the other apps. Use an email allowlist in the RLS policies if you want to lock this one down.

Gotchas: Supabase free-tier projects pause after ~a week of inactivity (sync quietly stops; local keeps working; restore the project to resume). The vendored `js/vendor/supabase.js` is lazy-loaded only when a session exists or the Sync dialog opens, so a normal open doesn't pay its parse cost.

## Data & backups

State lives in `localStorage` under the key `taskmana-state`, and the app asks for persistent storage on boot. Installed as a home-screen app that's durable; in a plain iOS Safari tab it is not — iOS evicts unused tab storage after ~7 days. Install it, or configure sync, or both.

The footer shows today's completed tasks, with a collapsed **Previous days** log beneath it — the last 14 days of finished tasks, grouped by day, like flipping back through a bullet journal. Completed tasks are never deleted; older days just aren't shown.

Dropped tasks aren't gone immediately either: they sit in a collapsed **Recycle bin** section for 30 days (each row shows when it expires), where one click restores them to the Inbox. After 30 days the daily rollover prunes them for good.

Use the **Export** button in the footer (or the nudge after finishing a weekly review) to download a dated JSON backup (`taskmana-backup-YYYY-MM-DD.json`), and **Import** to restore one — it validates the file and asks before replacing your current tasks. In an installed app Export goes through the system share sheet, because an `<a download>` click is unreliable in a standalone iOS PWA.

## Development

No build step: the files in this folder are served as-is. The scripts are classic (non-module) scripts on purpose — top-level `const` namespaces (`TaskmanaStore`, `TaskmanaModel`, `TaskmanaSync`, `TaskmanaConfig`) are the cross-file sharing mechanism, and load order in `index.html` is therefore load-bearing.\n\n`npm run serve` starts a dependency-free static server on http://localhost:4173 (`scripts/serve.mjs`); Playwright starts the same one automatically.

Dev tooling (tests + types only):

```sh
npm install
npm run typecheck   # TypeScript strict mode over the JS source (checkJs + JSDoc)
npm run test:unit   # node:test unit tests for model logic + sync merge (46 tests)
npm run test:e2e    # Playwright over http + touch emulation; e2e + axe a11y + visual regression (24 tests)
npm test            # all of the above
```

CI (GitHub Actions) runs typecheck + unit + e2e on every push to `main`. Releases follow a 0–9-per-segment scheme (`1.0.1 … 1.0.9 → 1.1.0`); `npm run bump` advances `package.json` and the `sw.js` cache key together. Stored state carries a schema `version`; `TaskmanaModel.migrateState` upgrades older shapes (and old backup files on import) stepwise — when changing the `State` shape, bump `STATE_VERSION` and add a migration entry.

The e2e suite drives the app over http against real `localStorage`, so capture, persistence, day rollover, review, planning, theme, hints, and export/import are all exercised end-to-end. Accessibility tests run axe (WCAG 2.1 AA) on the main page in both color schemes and on both dialogs. Visual regression baselines live in `tests/e2e/visual.spec.ts-snapshots/`; after an intentional UI change, refresh them with `npx playwright test --update-snapshots`.

Gotchas learned the hard way (preserved here so they aren't relearned):

- A button's visible text beats its `title` in accessible-name computation — icon buttons need `aria-label`.
- An author `display: flex` overrides the UA's `[hidden] { display: none }`; the reset includes `[hidden] { display: none !important; }`.
- The `* { margin: 0 }` reset removes the `margin: auto` that centers native `<dialog>`s — `.dialog` restores it.
- `cache.addAll()` in a service worker is all-or-nothing: one bad path aborts the install and the app is silently never offline-capable. `sw.js` uses `Promise.allSettled` over individual `cache.add()` calls.
