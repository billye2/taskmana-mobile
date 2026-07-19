// Fixtures that load the real unpacked extension into Chromium and open its
// new-tab page — the same path a user exercises, chrome.storage included.
import { test as base, chromium, type BrowserContext } from '@playwright/test';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

const EXT_PATH = path.resolve(__dirname, '../..');

export const test = base.extend<{ context: BrowserContext }>({
  context: async ({}, use) => {
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'taskmana-e2e-'));
    const context = await chromium.launchPersistentContext(userDataDir, {
      channel: 'chromium',
      args: [
        `--disable-extensions-except=${EXT_PATH}`,
        `--load-extension=${EXT_PATH}`,
      ],
    });
    await use(context);
    await context.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
  },
  page: async ({ context }, use) => {
    const page = await context.newPage();
    await page.goto('chrome://newtab/');
    await page.waitForURL(/^chrome-extension:.*newtab\.html$/);
    // The DOM exists before the app's async init; wait for the first render
    // (the date line is only filled in then) before interacting.
    await page.waitForFunction(() => !!document.getElementById('date-line')?.textContent);
    await use(page);
  },
});

export const expect = test.expect;

/** Capture a task through the UI. */
export async function capture(page: import('@playwright/test').Page, text: string) {
  await page.locator('#capture-input').fill(text);
  await page.locator('#capture-input').press('Enter');
  await expect(page.locator('#inbox-list .task .text').first()).toHaveText(text);
}

/** Read the persisted state straight from chrome.storage. */
export function readState(page: import('@playwright/test').Page): Promise<any> {
  return page.evaluate(
    () =>
      new Promise((resolve) =>
        chrome.storage.local.get('taskmana-state', (s: Record<string, unknown>) =>
          resolve(s['taskmana-state'])
        )
      )
  );
}

/** Overwrite persisted state and reload so the app boots from it. */
export async function writeStateAndReload(
  page: import('@playwright/test').Page,
  mutate: (state: any) => void
) {
  // Nothing is persisted until the first user action, so fall back to a fresh
  // initial state built by the app's own model (a page global).
  // Top-level `const` in a classic script is a global lexical binding, not a
  // window property — so reference it by name via a string evaluation.
  const state =
    (await readState(page)) ??
    (await page.evaluate('TaskmanaModel.initialState(TaskmanaModel.todayStr())'));
  mutate(state);
  await page.evaluate(
    (s) => new Promise<void>((resolve) => chrome.storage.local.set({ 'taskmana-state': s }, resolve)),
    state
  );
  await page.reload();
  await page.locator('#capture-input').waitFor();
}

/** YYYY-MM-DD for `daysAgo` days before now (local time, matches the app). */
export function localDate(daysAgo = 0): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
