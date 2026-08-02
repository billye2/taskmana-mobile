// Bottom sheets. Mobile emulation — at >=768px these present as centred
// modals and the keyboard behaviour below doesn't apply.
import { test, expect, devices } from '@playwright/test';

test.use({ ...devices['iPhone 14'], defaultBrowserType: 'chromium' });

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!document.getElementById('date-line')?.textContent);
});

/** Wait out the slide-up (or the keyboard lift) before measuring anything. */
async function settle(locator: import('@playwright/test').Locator) {
  await locator.evaluate(async (n) => {
    await Promise.all(n.getAnimations().map((a) => a.finished.catch(() => {})));
  });
}

async function openSync(page: import('@playwright/test').Page) {
  await page.locator('.tab[data-view="more"]').tap();
  await expect(page.locator('body')).toHaveAttribute('data-view', 'more');
  await page.locator('#sync-btn').tap();
  await expect(page.locator('#sync-dialog')).toBeVisible();
  await settle(page.locator('#sync-dialog'));
}

/**
 * Playwright can't raise a soft keyboard, so drive the variable js/viewport.js
 * would publish. That's the whole contract between the two.
 */
async function fakeKeyboard(page: import('@playwright/test').Page, px: number) {
  await page.evaluate((v) => {
    document.documentElement.style.setProperty('--kb-inset', `${v}px`);
    document.body.classList.toggle('kb-open', v > 120);
  }, px);
}

test('sheet form fields stay above the keyboard', async ({ page }) => {
  await openSync(page);
  const field = page.locator('#sync-email');
  const viewportH = page.viewportSize()!.height;

  const before = (await field.boundingBox())!;
  expect(before.y + before.height).toBeLessThan(viewportH);

  // A typical iPhone keyboard. Without the sheet lifting, the field sits
  // behind it — the sheet is bottom-anchored and iOS never shrinks the
  // layout viewport for the keyboard.
  const kb = 300;
  await fakeKeyboard(page, kb);
  await settle(page.locator('#sync-dialog'));

  const after = (await field.boundingBox())!;
  expect(after.y + after.height).toBeLessThanOrEqual(viewportH - kb);

  // and the sheet must not have been pushed off the top to achieve it
  const sheet = (await page.locator('#sync-dialog').boundingBox())!;
  expect(sheet.y).toBeGreaterThanOrEqual(0);
});

test('the dock also clears the keyboard, and hides the tab bar for room', async ({ page }) => {
  const viewportH = page.viewportSize()!.height;
  await fakeKeyboard(page, 300);
  await settle(page.locator('.bottom-dock'));

  const input = (await page.locator('#capture-input').boundingBox())!;
  expect(input.y + input.height).toBeLessThanOrEqual(viewportH - 300);
  await expect(page.locator('.tabbar')).toBeHidden();
});

test('Escape, the close button, and a backdrop tap all dismiss a sheet', async ({ page }) => {
  const dlg = page.locator('#sync-dialog');

  await openSync(page);
  await page.keyboard.press('Escape');
  await expect(dlg).toBeHidden();

  await page.locator('#sync-btn').tap();
  await expect(dlg).toBeVisible();
  await dlg.locator('.sheet-close').tap();
  await expect(dlg).toBeHidden();

  // Backdrop: a <dialog> doesn't do this natively, so it's hand-rolled.
  await page.locator('#sync-btn').tap();
  await expect(dlg).toBeVisible();
  const box = (await dlg.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, Math.max(4, box.y - 60));
  await expect(dlg).toBeHidden();
});

test('a long sheet scrolls its own body, not the page behind it', async ({ page }) => {
  for (const t of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']) {
    await page.locator('#capture-input').fill(t);
    await page.locator('#capture-input').press('Enter');
  }
  await page.locator('.tab[data-view="today"]').tap();
  await page.getByRole('button', { name: 'Plan', exact: true }).tap();

  const body = page.locator('#plan-dialog .sheet-body');
  await expect(body).toBeVisible();
  const scrollable = await body.evaluate((n) => n.scrollHeight > n.clientHeight);
  expect(scrollable).toBe(true);

  // the page behind is locked while a sheet is open
  await expect(page.locator('body')).toHaveCSS('overflow', 'hidden');
});
