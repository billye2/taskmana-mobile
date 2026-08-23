// Touch-device behaviour: Chromium mobile emulation so (hover: none) matches
// and the tab bar (rather than the desktop all-sections page) is in play.
import { test, expect, devices } from '@playwright/test';

test.use({ ...devices['Pixel 7'] });

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!document.getElementById('date-line')?.textContent);
});

test('touch: actions are visible without hover and a single tap edits', async ({ page }) => {
  await page.locator('#capture-input').fill('tap target');
  await page.locator('#capture-input').press('Enter');

  // Capture always files to the Inbox, so from Today the row is on another tab.
  await page.locator('.tab[data-view="inbox"]').tap();
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
  await expect(page.locator('.edit-input')).toHaveCount(0);
});

test('touch: every action is a visible button on its row — no overflow menu', async ({ page }) => {
  // Swiping never announces itself — the actions Billy actually reaches for
  // must be real buttons on the row, with no ⋯ hiding any of them.
  await page.locator('#capture-input').fill('button row');
  await page.locator('#capture-input').press('Enter');
  await page.locator('.tab[data-view="inbox"]').tap();
  const row = page.locator('#inbox-list .task', { hasText: 'button row' });

  await expect(row.getByRole('button', { name: /Add to today/ })).toBeVisible();
  await expect(row.getByRole('button', { name: /Park in Someday/ })).toBeVisible();
  await expect(row.getByRole('button', { name: /^Drop/ })).toBeVisible();
  await expect(page.locator('.row-more')).toHaveCount(0);

  // Today rows: checkbox for done, then the move-up arrow as a visible button.
  await row.getByRole('button', { name: /Add to today/ }).tap();
  await page.locator('#capture-input').fill('second');
  await page.locator('#capture-input').press('Enter');
  await page.getByRole('button', { name: 'Add to Today' }).tap(); // toast shortcut
  await page.locator('.tab[data-view="today"]').tap();
  const todayRow = page.locator('#today-list .task', { hasText: 'second' });
  await expect(todayRow.getByRole('checkbox')).toBeVisible();
  await expect(todayRow.getByRole('button', { name: /Move up/ })).toBeVisible();

  // The arrow actually reorders.
  await todayRow.getByRole('button', { name: /Move up/ }).tap();
  await expect(page.locator('#today-list .task .text').first()).toHaveText('second');

  // Someday rows show their pair too.
  await page.locator('.tab[data-view="today"]').tap();
  const first = page.locator('#today-list .task', { hasText: 'button row' });
  await first.getByRole('button', { name: /Send back to inbox/ }).tap();
  await page.locator('.tab[data-view="inbox"]').tap();
  await page
    .locator('#inbox-list .task', { hasText: 'button row' })
    .getByRole('button', { name: /Park in Someday/ })
    .tap();
  await page.locator('.tab[data-view="someday"]').tap();
  const somedayRow = page.locator('#someday-list .task', { hasText: 'button row' });
  await expect(somedayRow.getByRole('button', { name: /Move back to inbox/ })).toBeVisible();
  await expect(somedayRow.getByRole('button', { name: /^Drop/ })).toBeVisible();
});

test('touch: the Add button captures the field', async ({ page }) => {
  await page.locator('#capture-input').fill('via button');
  await page.locator('#capture-add').tap();
  await page.locator('.tab[data-view="inbox"]').tap();
  await expect(page.locator('#inbox-list .task .text')).toHaveText('via button');
  await expect(page.locator('#capture-input')).toHaveValue('');
});

test('touch: the keyboard does not open on launch', async ({ page }) => {
  // In an installed PWA, auto-focusing capture would pop the keyboard on every
  // single launch. Desktop keeps the keyboard-first behaviour (a11y.spec).
  await expect(page.locator('#capture-input')).not.toBeFocused();
  await page.locator('#capture-input').tap();
  await expect(page.locator('#capture-input')).toBeFocused();
});

test('touch: capturing from another tab says where the task went, and can promote it', async ({
  page,
}) => {
  await page.locator('#capture-input').fill('from today');
  await page.locator('#capture-input').press('Enter');

  const toast = page.locator('#toast');
  await expect(toast).toContainText('Added to Inbox');
  await toast.getByRole('button', { name: 'Add to Today' }).tap();
  await expect(toast).toBeHidden();
  await expect(page.locator('#today-list .task .text')).toHaveText('from today');

  // no toast when the Inbox is already the visible list — it would say nothing
  await page.locator('.tab[data-view="inbox"]').tap();
  await page.locator('#capture-input').fill('from inbox');
  await page.locator('#capture-input').press('Enter');
  await expect(page.locator('#inbox-list .task .text')).toHaveText(['from inbox']);
  await expect(toast).toBeHidden();
});

test('touch: every tap target clears 44px', async ({ page }) => {
  // axe's WCAG 2.2 target-size rule allows 24px, which is too lenient for a
  // thumb. Assert the real floor instead.
  await page.locator('#capture-input').fill('sizing');
  await page.locator('#capture-input').press('Enter');

  const undersized: string[] = [];
  for (const view of ['today', 'inbox', 'someday', 'more']) {
    await page.locator(`.tab[data-view="${view}"]`).tap();
    await expect(page.locator('body')).toHaveAttribute('data-view', view);
    // Measure in one page evaluation: a :visible locator list goes stale the
    // moment a tab switch re-renders, and per-handle round trips then hang.
    undersized.push(
      ...(await page.evaluate((v) => {
        const bad: string[] = [];
        for (const node of document.querySelectorAll('button, summary')) {
          const r = node.getBoundingClientRect();
          if (r.width === 0 && r.height === 0) continue; // not rendered
          // The tab bar is a deliberate 56px-tall row of equal-width buttons;
          // its items are wide enough and are measured as a whole.
          if (r.width < 44 || r.height < 44) {
            const id = node.id || node.className || node.textContent?.trim().slice(0, 24) || '?';
            bad.push(`${v}: ${id} (${Math.round(r.width)}x${Math.round(r.height)})`);
          }
        }
        return bad;
      }, view))
    );
  }
  expect(undersized).toEqual([]);
});
