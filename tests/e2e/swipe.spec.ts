// Swipe-to-action. Driven with page.mouse, which emits real pointer events —
// which is exactly why js/swipe.js must not filter on e.pointerType.
import { test, expect, devices } from '@playwright/test';
import { readState } from './fixtures';

test.use({ ...devices['Pixel 7'] });

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!document.getElementById('date-line')?.textContent);
});

async function seed(page: import('@playwright/test').Page, ...texts: string[]) {
  for (const t of texts) {
    await page.locator('#capture-input').fill(t);
    await page.locator('#capture-input').press('Enter');
  }
  await page.locator('.tab[data-view="inbox"]').tap();
  // toHaveCount alone would pass while the view is still Today and the rows
  // are display:none — the tab switch lands a tick later, via hashchange.
  await expect(page.locator('body')).toHaveAttribute('data-view', 'inbox');
  await expect(page.locator('#inbox-list .task')).toHaveCount(texts.length);

  // Capturing from Today raises an "Added to Inbox" toast. Clear it, so the
  // assertions below are about the swipe's own toast and nothing else.
  const toast = page.locator('#toast');
  if (await toast.isVisible()) {
    await toast.locator('.toast-text').click();
    await expect(toast).toBeHidden();
  }
}

/** Drag a row horizontally by `dx` px. */
async function drag(
  page: import('@playwright/test').Page,
  row: import('@playwright/test').Locator,
  dx: number,
  dy = 0
) {
  await expect(row).toBeVisible();
  const box = (await row.boundingBox())!;
  const y = box.y + box.height / 2;
  // Start over the task text: the row's centre can land on the inline action
  // buttons, and swipe.js deliberately ignores drags that start on a button.
  const x = box.x + Math.min(60, box.width / 4);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 12 });
  await page.mouse.up();
}

test('swiping past the threshold runs the action and offers Undo', async ({ page }) => {
  await seed(page, 'swipe me');
  const row = page.locator('#inbox-list .task', { hasText: 'swipe me' });

  await drag(page, row, -160); // left = drop
  await expect(page.locator('#inbox-list .task')).toHaveCount(0);

  const toast = page.locator('#toast');
  await expect(toast).toContainText('Dropped');
  await toast.getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('#inbox-list .task .text')).toHaveText('swipe me');
});

test('swiping right promotes to Today', async ({ page }) => {
  await seed(page, 'promote me');
  await drag(page, page.locator('#inbox-list .task', { hasText: 'promote me' }), 160);
  await expect(page.locator('#inbox-list .task')).toHaveCount(0);
  await page.locator('.tab[data-view="today"]').tap();
  await expect(page.locator('#today-list .task .text')).toHaveText('promote me');
});

test('a short drag springs back and changes nothing', async ({ page }) => {
  await seed(page, 'stay put');
  const row = page.locator('#inbox-list .task', { hasText: 'stay put' });

  await drag(page, row, -40); // under the threshold
  await expect(page.locator('#inbox-list .task .text')).toHaveText('stay put');
  await expect(page.locator('#toast')).toBeHidden();

  const state = await readState(page);
  expect(state.tasks.filter((t: any) => t.status === 'dropped')).toHaveLength(0);
  // and the row is back at rest, not left mid-slide
  await expect(row.locator('.swipe-fg')).not.toHaveAttribute('style', /translateX\((?!0px)/);
});

test('a vertical drag scrolls instead of swiping', async ({ page }) => {
  await seed(page, 'scroll me');
  const row = page.locator('#inbox-list .task', { hasText: 'scroll me' });

  await drag(page, row, 8, 120); // mostly vertical
  await expect(page.locator('#inbox-list .task .text')).toHaveText('scroll me');
  await expect(page.locator('#toast')).toBeHidden();
});

test('a swipe does not leave the inline editor open behind it', async ({ page }) => {
  // On touch, tapping the text opens the editor — and the browser fires a
  // click after every gesture. Without suppression, every swipe would edit.
  await seed(page, 'no editor', 'second row');
  await drag(page, page.locator('#inbox-list .task', { hasText: 'second row' }), -40);
  await expect(page.locator('.edit-input')).toHaveCount(0);
});

test('every swipe action is also reachable as a button', async ({ page }) => {
  // The structural guarantee: gestures are an accelerator, never the only way.
  // There is no overflow menu — the buttons live on the row itself.
  await seed(page, 'reachable');
  const row = page.locator('#inbox-list .task', { hasText: 'reachable' });

  const swipeLabels = await row
    .locator('.swipe-bg span')
    .evaluateAll((nodes) => nodes.map((n) => n.textContent?.trim()).filter(Boolean));
  expect(swipeLabels.length).toBeGreaterThan(0);

  // Inbox rows swipe to Today (right) and Drop (left); both are visible
  // buttons on the row, as is the non-swipe Someday action.
  await expect(row.getByRole('button', { name: /Add to today/ })).toBeVisible();
  await expect(row.getByRole('button', { name: /^Drop:/ })).toBeVisible();
  await expect(row.getByRole('button', { name: /Park in Someday/ })).toBeVisible();
});
