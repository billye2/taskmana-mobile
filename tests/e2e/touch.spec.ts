// Touch-device smoke test for the PWA path: plain page + localStorage (no
// extension fixture), Chromium mobile emulation so (hover: none) matches.
import { test, expect, devices } from '@playwright/test';
import path from 'node:path';

test.use({ ...devices['Pixel 7'] });

const PAGE_URL = 'file://' + path.resolve(__dirname, '../../newtab.html');

test('touch: actions are visible without hover and a single tap edits', async ({ page }) => {
  await page.goto(PAGE_URL);
  await page.waitForFunction(() => !!document.getElementById('date-line')?.textContent);

  // capture works on the plain-page/localStorage path
  await page.locator('#capture-input').fill('tap target');
  await page.locator('#capture-input').press('Enter');
  const row = page.locator('#inbox-list .task', { hasText: 'tap target' });
  await expect(row).toBeVisible();

  // no hover on touch — actions must be visible immediately
  await expect(row.locator('.actions')).toHaveCSS('opacity', '1');

  // a single tap on the text opens the editor (desktop needs dblclick)
  await row.locator('.text').tap();
  const editor = page.locator('.edit-input');
  await expect(editor).toBeVisible();
  await editor.fill('tapped and edited');
  await editor.press('Enter');
  await expect(page.locator('#inbox-list .task .text')).toHaveText('tapped and edited');

  // 16px inputs prevent iOS focus-zoom
  await expect(page.locator('#capture-input')).toHaveCSS('font-size', '16px');
});
