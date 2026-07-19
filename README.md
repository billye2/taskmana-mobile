# Taskmana

A personal task system that lives on your Chrome new tab page, so it's in your face every time you open a tab. No accounts, no server, no build step — your data stays in this browser.

It combines four pen-and-paper systems into one page (tap the `?` chip to show/hide in-app hints explaining each):

- **Brain dump** (David Allen, *Getting Things Done*) — the capture box at the top. Type, hit Enter, it's out of your head and into the Inbox.
- **Daily top-3 + ordered queue** (Ivy Lee Method, 1918) — Today holds up to 6 ordered tasks; the first 3 are visually "today's win." Toggle **Focus** to enforce Ivy Lee strictness: only the first unfinished task is actionable.
- **Migration** (Ryder Carroll, Bullet Journal) — unfinished Today tasks carry over each day and earn a `›` mark. After 5 carries, the task asks you: *still worth doing?* Keep / Someday / Drop.
- **Weekly review** (GTD) — the **Review** button walks through your inbox, someday list, and stale tasks one at a time (a red dot nudges you when it's been 7+ days).
- **Plan tomorrow** (Ivy Lee's evening ritual) — pick and order up to 6 tasks for tomorrow; they become Today at the next day's first open.

Theme: the **Auto / Light / Dark** chip forces a scheme or follows your system appearance.

## Install

1. Open `chrome://extensions` in Chrome.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and select this folder (the one containing `manifest.json`).
4. Open a **new** tab (Cmd+T) — reloading an existing tab isn't enough.

If the new tab doesn't change: check that Taskmana appears in `chrome://extensions`, is toggled on, and shows no red **Errors** button; and that no other installed extension also overrides the new tab page (only one override wins).

## Development

No build step: the extension runs the files in this folder as-is, and `newtab.html` can also be opened directly in any browser (it falls back to `localStorage` there, separate from the extension's data). The scripts are classic (non-module) scripts on purpose — ES module imports are blocked on `file://` pages.

Dev tooling (tests + types only):

```sh
npm install
npm run typecheck   # TypeScript strict mode over the JS source (checkJs + JSDoc)
npm run test:unit   # node:test unit tests for the model logic
npm run test:e2e    # Playwright: loads the real extension; e2e + axe a11y + visual regression
npm test            # all of the above
```

Visual regression baselines live in `tests/e2e/visual.spec.ts-snapshots/`; after an intentional UI change, refresh them with `npx playwright test --update-snapshots`.

## Data & backups

State lives in `chrome.storage.local` under the key `taskmana-state`. It survives browser restarts and extension reloads, but is deleted if you **remove** the extension, and an unpacked extension loaded from a **moved or renamed folder** counts as a new extension with empty storage.

Use the **Export** button in the footer to download a dated JSON backup (`taskmana-backup-YYYY-MM-DD.json`), and **Import** to restore one — it validates the file and asks before replacing your current tasks.
