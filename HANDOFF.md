# Handoff — mobile-first port

Status as of 2026-08-24 (v2.3.4). Latest: per-task "why" (schema v3),
shipped in step with the extension; model.js is byte-identical again. Active again after the 2026-08-02 park
(v2.2.3, "this project is good for now"). Sync verified working on Billy's
phone; dialogs, row buttons, capture, and both layouts confirmed on-device.
The items below are the non-urgent remainder; start there next session.
Delete this file once they're done; everything durable belongs in
`README.md`, not here.

Live: **https://taskmana-nine.vercel.app** (`taskmana.vercel.app` was taken).
Repo: `billye2/taskmana-mobile` (private). Vercel project `taskmana`, connected
to that repo, so pushes to `main` deploy automatically.

## Done

- **Extension dropped.** `manifest.json`, the packaging script, the
  `chrome.storage` branch, `@types/chrome` and the extension Playwright fixture
  are gone. `newtab.html` → `index.html`; `vercel.json` deleted. The old repo
  `billye2/taskmana` is untouched and keeps the extension's history — and its
  new-tab design is the canonical **desktop** layout (Billy's explicit call
  after a three-column redesign flopped).
- **Mobile-first shell.** Touch is the base layout; `@media (min-width: 768px)`
  is the only width breakpoint and reproduces the extension's new-tab page
  (masthead, capture at top via flex `order`, one 640px column, settings behind
  a ⚙ masthead chip as a popover). Phone: four tabs over a fixed dock, hash
  routing, capture bar with an Add button, dialogs as floating popup cards
  pinned near the top, every row action an always-visible button (no overflow
  menu; swipe kept as an accelerator with Undo), in-app toast and confirm.
- **The crushed-dialog saga** (four releases, worth reading as a case study):
  bottom sheets under the keyboard → phantom `visualViewport` insets from iOS
  zoom → an older-WebKit `flex: 1` column collapse that no current local engine
  reproduces. Fixes: top-anchored cards, `measure()` zoom guard +
  `applyInset()` clamp + CSS `max()` floor, `flex: 1 1 auto`. Each layer has a
  regression test; the mobile specs now also run on real WebKit
  (`mobile-webkit` Playwright project).
- **Sync verified end-to-end on real devices.** The shared Supabase project had
  disabled legacy API keys (2026-06-03) — `config.js` now carries the
  `sb_publishable_…` key — and the Magic Link email template now includes
  `{{ .Token }}` so the 6-digit code flow works. Billy signed in from his
  phone: "email token works."
- **Self-updating shell.** `registration.update()` on every return to the
  foreground (iOS restores from memory, no navigation → no native check) plus
  the existing `controllerchange` reload. A stamped version line at the bottom
  of settings says what a device is actually running — stale-cache ambiguity
  poisoned a whole debugging round before it existed.
- Tests 24 → 47 unit + 70 e2e across two engine projects, all passing.
- **2026-08-19/20 session (v2.2.4 → v2.3.0):** security audit of tree + full
  git history came back clean (no secret ever committed; the historical anon
  JWT is inert — legacy keys confirmed disabled in the dashboard). Fixes:
  plan-dialog rows got their own `display: flex` (no `.swipe-fg` wrapper
  there; checkboxes had stacked above their text), rollover guard became
  `<=` (port of the extension's v1.0.2 timezone-split fix, flagged by the
  extension repo's session), the recycle bin's 30-day notice is pinned
  visible with hints off, its summary row centres title + count, and the
  icons are the extension's orange T tile — generated from `icons/icon.svg`
  via `npm run gen:icons`, source shared verbatim with the extension.

## Open

1. **The sync merge drill.** Sign-in works; the conflict path is still only
   unit-tested. Edit the same task on phone and laptop while offline,
   reconnect, confirm the newer `modifiedAt` wins and nothing is lost.

2. **Rescue the extension's data, then uninstall it.** Its tasks live in
   `chrome.storage.local` and die with the extension. Export a JSON backup from
   the installed extension first, then import it here (settings → Import
   backup). Do this before removing it from Chrome.

3. **Verify Export on a real iPhone in standalone mode.** An `<a download>`
   click is unreliable in an installed iOS PWA, so `exportBackup()` routes
   through the share sheet when `display-mode: standalone` matches. That branch
   has only been reasoned about, not run on hardware.

4. **Maskable icon.** `manifest.webmanifest` deliberately declares only
   `purpose: "any"`. Pointing `purpose: "maskable"` at the current
   `icons/icon512.png` would make Android crop the logo — it has no safe-area
   padding. Now that the icons are generated from `icons/icon.svg`
   (`npm run gen:icons`), this is a small variant SVG (T inside the central
   80%, full-bleed background) plus one more line in the generator.

5. **Re-add the home-screen icon on the iPhone.** iOS snapshots the
   apple-touch-icon at install time, so the v2.2.9 orange T won't appear
   until the app is removed from the home screen and re-added from Safari.
   While at it, check the tile's transparent rounded corners — iOS fills
   them black; if it looks bad, generate a full-bleed square 180px variant.

## Judgement calls worth revisiting

- **Hints default off on touch** (`state.settings.showHints ??= !coarsePointer`
  in `js/app.js`). They're good teaching text but were half the first phone
  screen. One line to flip; the toggle is under settings → Method hints.
- **Boot auto-focus is desktop-only.** On touch it popped the keyboard on every
  single launch of the installed app. Post-submit focus is still unconditional,
  which is right for a brain-dump run.
- **The 768px branch means two layouts to maintain forever.** Worth it — Billy
  wants the extension look on a monitor and the app shell on a phone — but
  it's a standing cost, and the ⚙ popover added a little JS to that ledger.
- **Today rows carry three visible controls** (checkbox, ↑, Inbox) inside
  44px tap targets with deliberately overlapped dead edges. Fine at 390pt; if
  a smaller device ever matters, the squeeze in `css/style.css` is where to
  look.

## Not kept

A throwaway reachability audit (scroll every view and sheet to its end with a
simulated keyboard, then flag anything still underneath it) was used to find
the keyboard bugs and then deleted. `sheets.spec.ts` covers the specific cases
it found — including hostile-input tests for `measure()` itself, which the
original audit never covered and which turned out to be where the real bug
lived. Worth rebuilding if the layout changes substantially.
