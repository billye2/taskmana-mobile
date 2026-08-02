// Tab routing. Mobile emulation, because at >=768px every view is on the page
// at once and the tab bar is hidden by design.
import { test, expect, devices } from '@playwright/test';
import { rowAction } from './fixtures';

test.use({ ...devices['Pixel 7'] });

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!document.getElementById('date-line')?.textContent);
});

test('tabs switch views, mark themselves current, and write the hash', async ({ page }) => {
  await expect(page.locator('body')).toHaveAttribute('data-view', 'today');
  expect(page.url()).toMatch(/#today$/);
  await expect(page.locator('.tab[data-view="today"]')).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('#today-section')).toBeVisible();
  await expect(page.locator('#inbox-section')).toBeHidden();

  for (const view of ['inbox', 'someday', 'more'] as const) {
    await page.locator(`.tab[data-view="${view}"]`).tap();
    await expect(page.locator('body')).toHaveAttribute('data-view', view);
    expect(page.url()).toMatch(new RegExp(`#${view}$`));
    await expect(page.locator(`#${view}-section`)).toBeVisible();
    await expect(page.locator(`.tab[data-view="${view}"]`)).toHaveAttribute('aria-current', 'page');
    // exactly one tab is current at a time
    await expect(page.locator('.tab[aria-current="page"]')).toHaveCount(1);
  }
});

test('Back returns to the previous tab rather than leaving the app', async ({ page }) => {
  await page.locator('.tab[data-view="inbox"]').tap();
  await page.locator('.tab[data-view="more"]').tap();
  await expect(page.locator('body')).toHaveAttribute('data-view', 'more');

  await page.goBack();
  await expect(page.locator('body')).toHaveAttribute('data-view', 'inbox');
  await page.goBack();
  await expect(page.locator('body')).toHaveAttribute('data-view', 'today');
});

test('a deep link opens straight onto that tab', async ({ page }) => {
  await page.goto('/#someday');
  await page.waitForFunction(() => !!document.getElementById('date-line')?.textContent);
  await expect(page.locator('body')).toHaveAttribute('data-view', 'someday');
  await expect(page.locator('#someday-section')).toBeVisible();

  // an unknown hash falls back to Today rather than rendering nothing
  await page.goto('/#nonsense');
  await page.waitForFunction(() => !!document.getElementById('date-line')?.textContent);
  await expect(page.locator('body')).toHaveAttribute('data-view', 'today');
});

test('the Someday tab keeps its place when empty, showing an empty state', async ({ page }) => {
  // An inline style.display here used to beat the view CSS and blank the tab.
  await page.locator('.tab[data-view="someday"]').tap();
  await expect(page.locator('#someday-section')).toBeVisible();
  await expect(page.locator('#someday-empty')).toBeVisible();
  await expect(page.locator('#someday-list .task')).toHaveCount(0);
});

test('tab counts track the lists and the review nudge shows from any tab', async ({ page }) => {
  for (const t of ['one', 'two']) {
    await page.locator('#capture-input').fill(t);
    await page.locator('#capture-input').press('Enter');
  }
  await expect(page.locator('#tab-count-inbox')).toHaveText('2');
  await expect(page.locator('#tab-count-today')).toHaveText('0');

  await page.locator('.tab[data-view="inbox"]').tap();
  await rowAction(page, 'inbox-list', 'one', 'Add to today: one');
  await expect(page.locator('#tab-count-today')).toHaveText('1');
  await expect(page.locator('#tab-count-inbox')).toHaveText('1');

  // the review dot is mirrored onto the Inbox tab, so it's visible from Today
  await page.locator('.tab[data-view="today"]').tap();
  await expect(page.locator('#tab-dot-inbox')).toBeVisible();
});
