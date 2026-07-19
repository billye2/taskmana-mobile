# Taskmana

A personal task system that lives on your Chrome new tab page, so it's in your face every time you open a tab. No accounts, no server, no build step — your data stays in this browser.

It combines four pen-and-paper systems into one page. The `?` chip toggles in-app hints that explain each method and credit its author, each with cyclable (`↻`) real-world examples for extra motivation:

- **Brain dump** (David Allen, *Getting Things Done*) — the capture box at the top. Type, hit Enter, it's out of your head and into the Inbox.
- **Daily top-3 + ordered queue** (Ivy Lee Method, 1918) — Today holds up to 6 ordered tasks; the first 3 are visually "today's win." Toggle **Focus** to enforce Ivy Lee strictness: only the first unfinished task is actionable.
- **Migration** (Ryder Carroll, Bullet Journal) — unfinished Today tasks carry over each day and earn a `›` mark. After 5 carries, the task asks you: *still worth doing?* Keep / Someday / Drop.
- **Weekly review** (GTD) — the **Review** button walks through your inbox, someday list, and stale tasks one at a time (a red dot nudges you when it's been 7+ days). Finishing a review offers a one-click **Export backup** while the list is at its cleanest.
- **Plan tomorrow** (Ivy Lee's evening ritual) — pick and order up to 6 tasks for tomorrow; they become Today at the next day's first open. A live preview in the dialog shows exactly what tomorrow's list will be: your picks first, carried-over tasks after, overflow back to the inbox.

Theme: the **Auto / Light / Dark** chip forces a scheme or follows your system appearance.

## Install

1. Open `chrome://extensions` in Chrome.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and select this folder (the one containing `manifest.json`).
4. Open a **new** tab (Cmd+T) — reloading an existing tab isn't enough.

If the new tab doesn't change: check that Taskmana appears in `chrome://extensions`, is toggled on, and shows no red **Errors** button; and that no other installed extension also overrides the new tab page (only one override wins).

## iPhone / web app

The same files deploy to Vercel as an installable web app (`vercel.json` rewrites `/` to `newtab.html`; `manifest.webmanifest` + `sw.js` make it a PWA with an offline app shell). On the phone: open the Vercel URL in Safari → Share → **Add to Home Screen**. Touch devices get always-visible row actions, larger tap targets, and tap-to-edit (desktop keeps double-click) via an `@media (hover: none)` block. The service worker is only registered on the web deployment — never inside the extension. `scripts/bump-version.mjs` keeps the service-worker cache key in step with the release version.

## Sync (optional)

Signed out, the app is local-only exactly as before. With a Supabase project configured, the footer **Sync** button signs you in by email one-time code (no password, no redirect URLs — works from both the extension and the PWA) and keeps devices in step: local-first (every device renders from its own storage instantly and works offline), background pull/merge on open, debounced push on change with optimistic concurrency on a `revision` column. Conflicts are merged per task — the copy with the newer `modifiedAt` wins — so a capture on the phone can't be clobbered by a desktop save.

One-time Supabase setup:

1. Create a project, then in the SQL editor:
   ```sql
   create table public.states (
     user_id uuid primary key references auth.users (id) on delete cascade,
     state jsonb not null,
     revision bigint not null default 1,
     updated_at timestamptz not null default now());
   alter table public.states enable row level security;
   create policy "select own" on public.states for select using (auth.uid() = user_id);
   create policy "insert own" on public.states for insert with check (auth.uid() = user_id);
   create policy "update own" on public.states for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
   ```
2. Auth → Email templates → **Magic Link**: include `{{ .Token }}` in the body (e.g. "Your Taskmana code: {{ .Token }}") so the email carries the 6-digit code.
3. Copy the project URL and anon key into `js/config.js`. The anon key is publishable; RLS is the security boundary.
4. After your own first sign-in, turn **off** "Allow new users to sign up" (Auth → Providers → Email) so strangers with the anon key can't fill your project's quota.

Gotchas: Supabase free-tier projects pause after ~a week of inactivity (sync quietly stops; local keeps working; restore the project to resume). The vendored `js/vendor/supabase.js` is lazy-loaded only when a session exists or the Sync dialog opens, so normal new-tab opens don't pay its parse cost.

## Data & backups

State lives in `chrome.storage.local` under the key `taskmana-state`. It survives browser restarts and extension reloads, but is deleted if you **remove** the extension, and an unpacked extension loaded from a **moved or renamed folder** counts as a new extension with empty storage.

The footer shows today's completed tasks, with a collapsed **Previous days** log beneath it — the last 14 days of finished tasks, grouped by day, like flipping back through a bullet journal. Completed tasks are never deleted; older days just aren't shown.

Use the **Export** button in the footer (or the nudge after finishing a weekly review) to download a dated JSON backup (`taskmana-backup-YYYY-MM-DD.json`), and **Import** to restore one — it validates the file and asks before replacing your current tasks.

## Development

No build step: the extension runs the files in this folder as-is, and `newtab.html` can also be opened directly in any browser (it falls back to `localStorage` there, separate from the extension's data). The scripts are classic (non-module) scripts on purpose — ES module imports are blocked on `file://` pages, and top-level `const` namespaces (`TaskmanaStore`, `TaskmanaModel`) are shared across files.

Dev tooling (tests + types only):

```sh
npm install
npm run typecheck   # TypeScript strict mode over the JS source (checkJs + JSDoc)
npm run test:unit   # node:test unit tests for model logic + sync merge (42 tests)
npm run test:e2e    # Playwright: real extension + touch emulation; e2e + axe a11y + visual regression (23 tests)
npm test            # all of the above
```

CI (GitHub Actions) runs typecheck + unit + e2e on every push to `main` and uploads a versioned `taskmana-<version>.zip` artifact built from just the runtime files. Releases follow a 0–9-per-segment scheme (`1.0.1 … 1.0.9 → 1.1.0`); `npm run bump` advances `manifest.json` + `package.json` together and `npm run package` builds the zip locally into `dist/`. Stored state carries a schema `version`; `TaskmanaModel.migrateState` upgrades older shapes (and old backup files on import) stepwise — when changing the `State` shape, bump `STATE_VERSION` and add a migration entry.

The e2e suite launches Chromium with the extension actually loaded (`chrome://newtab` → the override page), so capture, `chrome.storage` persistence, day rollover, review, planning, theme, hints, and export/import are all exercised end-to-end. Accessibility tests run axe (WCAG 2.1 AA) on the main page in both color schemes and on both dialogs. Visual regression baselines live in `tests/e2e/visual.spec.ts-snapshots/`; after an intentional UI change, refresh them with `npx playwright test --update-snapshots`.

Gotchas learned the hard way (preserved here so they aren't relearned):

- Branded Google Chrome ≥137 ignores `--load-extension`; use Chromium / Chrome for Testing for automated runs (Playwright's `channel: 'chromium'` handles this).
- A button's visible text beats its `title` in accessible-name computation — icon buttons need `aria-label`.
- An author `display: flex` overrides the UA's `[hidden] { display: none }`; the reset includes `[hidden] { display: none !important; }`.
- The `* { margin: 0 }` reset removes the `margin: auto` that centers native `<dialog>`s — `.dialog` restores it.
