// Fixtures that open the app over http and drive its real localStorage — the
// same path a user on the deployed URL exercises.
import { test as base } from '@playwright/test';

const KEY = 'taskmana-state';

export const test = base.extend({
  page: async ({ page }, use) => {
    await page.goto('/');
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

/**
 * Invoke a row action by its accessible name, whichever surface is showing.
 *
 * Desktop renders the inline button row; touch hides it and puts the same
 * actions behind a per-row `⋯` sheet. Both use the identical accessible name
 * (they're built from one descriptor list), so tests can be written once.
 */
export async function rowAction(
  page: import('@playwright/test').Page,
  listId: string,
  taskText: string,
  actionName: string
) {
  const row = page.locator(`#${listId} .task`, { hasText: taskText });
  const inline = row.getByRole('button', { name: actionName });
  if (await inline.isVisible()) {
    await inline.click();
    return;
  }
  await row.locator('.row-more').click();
  const sheet = page.locator('#row-actions-dialog');
  await expect(sheet).toBeVisible();
  await sheet.getByRole('button', { name: actionName }).click();
  await expect(sheet).toBeHidden();
}

/** Read the persisted state straight from localStorage. */
export function readState(page: import('@playwright/test').Page): Promise<any> {
  return page.evaluate((k) => {
    const raw = localStorage.getItem(k);
    return raw ? JSON.parse(raw) : null;
  }, KEY);
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
  await page.evaluate(([k, s]) => localStorage.setItem(k as string, JSON.stringify(s)), [
    KEY,
    state,
  ] as const);
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
