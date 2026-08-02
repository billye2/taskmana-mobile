# Handoff — mobile-first port

Status as of 2026-08-02. Delete this file once the open items below are done;
everything durable belongs in `README.md`, not here.

Live: **https://taskmana-nine.vercel.app** (`taskmana.vercel.app` was taken).
Repo: `billye2/taskmana-mobile` (private). Vercel project `taskmana`, connected
to that repo, so pushes to `main` deploy automatically.

## Done

- **Extension dropped.** `manifest.json`, the packaging script, the
  `chrome.storage` branch, `@types/chrome` and the extension Playwright fixture
  are gone. `newtab.html` → `index.html`; `vercel.json` deleted (Vercel serves a
  root `index.html` at `/` natively). The old repo `billye2/taskmana` is
  untouched and keeps the extension's history.
- **Mobile-first shell.** Touch is the base layout; `@media (min-width: 768px)`
  is the only width breakpoint and restores the old single-page desktop column.
  Four tabs over a fixed dock, hash routing, bottom sheets, swipe rows with
  Undo, per-row `⋯` action sheet, in-app toast and confirm replacing
  `alert()`/`confirm()`.
- **Three real service-worker bugs fixed** — see the README gotchas. The worst:
  `ASSETS` omitted `js/config.js` and `js/sync.js`, so an offline cold start
  booted a blank page.
- **Keyboard handling.** Dock, sheets and the inline editor all stay clear of
  the soft keyboard via `visualViewport`.
- **Supabase.** `taskmana_states` + RLS created, `js/config.js` filled,
  `js/sync.js` pointed at the prefixed table.
- Tests 24 → 46, all passing. Visual baselines regenerated.

## Open

1. **Verify sync end-to-end on real devices.** Never actually exercised — it
   needs a code from a real inbox.
   - Open the URL → More → Backup & sync → Sync → enter your email.
   - If no code arrives, the **Magic Link** email template is still missing
     `{{ .Token }}` (Auth → Email templates). `js/sync.js` uses `verifyOtp`, so
     without the token in the body there is nothing to verify against.
   - Then the merge drill: edit the same task on phone and laptop while offline,
     reconnect, confirm the newer `modifiedAt` wins and nothing is lost.

2. **Rescue the extension's data, then uninstall it.** Its tasks live in
   `chrome.storage.local` and die with the extension. Export a JSON backup from
   the installed extension first, then import it here (More → Backup & sync →
   Import backup). Do this before removing it from Chrome.

3. **Verify Export on a real iPhone in standalone mode.** An `<a download>`
   click is unreliable in an installed iOS PWA, so `exportBackup()` routes
   through the share sheet when `display-mode: standalone` matches. That branch
   has only been reasoned about, not run on hardware.

4. **Maskable icon.** `manifest.webmanifest` deliberately declares only
   `purpose: "any"`. Pointing `purpose: "maskable"` at the current
   `icons/icon512.png` would make Android crop the logo — it has no safe-area
   padding. Needs a new `icons/maskable512.png` with the logo inside the central
   80%, full-bleed background, before the entry is added.

## Judgement calls worth revisiting

- **Hints default off on touch** (`state.settings.showHints ??= !coarsePointer`
  in `js/app.js`). They're good teaching text but were half the first phone
  screen. One line to flip; the toggle is under More → Method hints.
- **Boot auto-focus is desktop-only.** On touch it popped the keyboard on every
  single launch of the installed app. Post-submit focus is still unconditional,
  which is right for a brain-dump run.
- **The 768px branch means two layouts to maintain forever.** Worth it — the
  desktop layout was already built and tested — but it's a standing cost.

## Not kept

A throwaway reachability audit (scroll every view and sheet to its end with a
simulated keyboard, then flag anything still underneath it) was used to find the
keyboard bugs and then deleted. `sheets.spec.ts` covers the specific cases it
found. Worth rebuilding if the layout changes substantially.
