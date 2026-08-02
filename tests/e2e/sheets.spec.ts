// Top sheets. Mobile emulation — at >=768px these present as centred
// modals and the keyboard behaviour below doesn't apply.
import { test, expect, devices } from '@playwright/test';

test.use({ ...devices['iPhone 14'], defaultBrowserType: 'chromium' });

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!document.getElementById('date-line')?.textContent);
});

/** Wait out the slide-down before measuring anything. */
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
 * Playwright can't raise a soft keyboard, so call the function visualViewport
 * would have called. This drives the real code path in js/viewport.js — not a
 * simulation of it.
 */
async function fakeKeyboard(page: import('@playwright/test').Page, px: number) {
  await page.evaluate(`TaskmanaViewport.applyInset(${px})`);
}

test('sheets anchor to the top, clear of any keyboard', async ({ page }) => {
  await openSync(page);
  const field = page.locator('#sync-email');
  const viewportH = page.viewportSize()!.height;

  // Top-anchored: the keyboard owns the bottom of the screen, so the sheet
  // starts at the top edge instead of lifting itself out of the way.
  const before = (await page.locator('#sync-dialog').boundingBox())!;
  expect(before.y).toBeLessThanOrEqual(1);

  const kb = 300;
  await fakeKeyboard(page, kb);
  await settle(page.locator('#sync-dialog'));

  const after = (await field.boundingBox())!;
  expect(after.y).toBeGreaterThanOrEqual(0);
  expect(after.y + after.height).toBeLessThanOrEqual(viewportH - kb);
});

test('pinch/auto-zoom must not read as a keyboard', async ({ page, context }) => {
  // Regression: iOS auto-zoom (and pinch) shrinks visualViewport.height with
  // no keyboard on screen. measure() once turned that into a huge phantom
  // inset that outlived the zoom — sheets stayed crushed and lifted forever.
  await openSync(page);
  const client = await context.newCDPSession(page);
  await client.send('Emulation.setPageScaleFactor', { pageScaleFactor: 2 });
  await page.evaluate('TaskmanaViewport.applyInset(TaskmanaViewport.measure())');

  const inset = await page.evaluate(
    'getComputedStyle(document.documentElement).getPropertyValue("--kb-inset").trim()'
  );
  expect(inset).toBe('0px');
  await client.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 });
});

test('a garbage keyboard inset cannot crush a sheet', async ({ page }) => {
  // Regression: on-device iOS left visualViewport offset/zoomed after a
  // keyboard dismissal, measure() reported a huge phantom keyboard with none
  // on screen, and every sheet collapsed to its header — the body (and the
  // sync email form with it) was squeezed out entirely.
  await openSync(page);
  await fakeKeyboard(page, 2000); // far larger than any real keyboard
  await settle(page.locator('#sync-dialog'));

  const sheet = (await page.locator('#sync-dialog').boundingBox())!;
  expect(sheet.height).toBeGreaterThanOrEqual(240);

  // the form the user came for is still on screen and usable
  const field = (await page.locator('#sync-email').boundingBox())!;
  expect(field.y).toBeGreaterThanOrEqual(0);
  expect(field.y + field.height).toBeLessThanOrEqual(page.viewportSize()!.height);
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
  // The sheet hangs from the top, so the backdrop is the area below it.
  await page.locator('#sync-btn').tap();
  await expect(dlg).toBeVisible();
  const box = (await dlg.boundingBox())!;
  const viewportH = page.viewportSize()!.height;
  await page.mouse.click(box.x + box.width / 2, Math.min(viewportH - 4, box.y + box.height + 60));
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

test('the inline task editor scrolls out from behind the keyboard', async ({ page }) => {
  // Tapping a task low on the screen opens an editor that the keyboard would
  // otherwise cover, with nothing to scroll it into view.
  for (const t of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j']) {
    await page.locator('#capture-input').fill(t);
    await page.locator('#capture-input').press('Enter');
  }
  await page.locator('.tab[data-view="inbox"]').tap();
  await expect(page.locator('body')).toHaveAttribute('data-view', 'inbox');

  await page.locator('#inbox-list .task .text').last().tap();
  const editor = page.locator('.edit-input');
  await expect(editor).toBeVisible();
  await expect(editor).toBeFocused();

  const kb = 300;
  await fakeKeyboard(page, kb);
  await page.waitForTimeout(500); // smooth scroll

  const box = (await editor.boundingBox())!;
  expect(box.y).toBeGreaterThan(0);
  expect(box.y + box.height).toBeLessThanOrEqual(page.viewportSize()!.height - kb);
});

test('with the keyboard up, a long list can still be scrolled to its end', async ({ page }) => {
  for (const t of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l']) {
    await page.locator('#capture-input').fill(t);
    await page.locator('#capture-input').press('Enter');
  }
  await page.locator('.tab[data-view="inbox"]').tap();
  await expect(page.locator('body')).toHaveAttribute('data-view', 'inbox');

  const kb = 300;
  await fakeKeyboard(page, kb);
  await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight }));
  await page.waitForTimeout(200);

  // The dock rides up by the inset, so the page must reserve room for both or
  // the last rows are unreachable.
  const last = (await page.locator('#inbox-list .task').last().boundingBox())!;
  expect(last.y + last.height).toBeLessThanOrEqual(page.viewportSize()!.height - kb);
});

test('dismissing the keyboard commits an inline edit', async ({ page }) => {
  // iOS's keyboard Done/✓ key hides the keyboard without blurring the field,
  // so blur-to-commit never fires and the row looks stuck as a text box.
  await page.locator('#capture-input').fill('before');
  await page.locator('#capture-input').press('Enter');
  await page.locator('.tab[data-view="inbox"]').tap();
  await expect(page.locator('body')).toHaveAttribute('data-view', 'inbox');

  await page.locator('#inbox-list .task .text').first().tap();
  const editor = page.locator('.edit-input');
  await expect(editor).toBeVisible();
  await editor.fill('after');

  await fakeKeyboard(page, 300);
  await fakeKeyboard(page, 0); // the keyboard closes; focus stays on iOS

  await expect(page.locator('.edit-input')).toHaveCount(0);
  await expect(page.locator('#inbox-list .task .text')).toHaveText('after');
});

test('Escape discards an inline edit instead of saving it', async ({ page }) => {
  await page.locator('#capture-input').fill('keep this');
  await page.locator('#capture-input').press('Enter');
  await page.locator('.tab[data-view="inbox"]').tap();
  await expect(page.locator('body')).toHaveAttribute('data-view', 'inbox');

  await page.locator('#inbox-list .task .text').first().tap();
  const editor = page.locator('.edit-input');
  await editor.fill('discard me');
  await editor.press('Escape');

  // The re-render blurs the input, and blur commits — so without a latch
  // Escape would save the very edit it was meant to throw away.
  await expect(page.locator('.edit-input')).toHaveCount(0);
  await expect(page.locator('#inbox-list .task .text')).toHaveText('keep this');
});
