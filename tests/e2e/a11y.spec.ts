import AxeBuilder from '@axe-core/playwright';
import { test, expect, capture, writeStateAndReload, localDate } from './fixtures';

async function expectNoViolations(page: import('@playwright/test').Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(
    results.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      nodes: v.nodes.map((n) => n.target),
    }))
  ).toEqual([]);
}

test.describe('accessibility (axe, WCAG 2.1 AA)', () => {
  for (const scheme of ['light', 'dark'] as const) {
    test(`main page with tasks — ${scheme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      for (const t of ['task one', 'task two', 'task three']) await capture(page, t);
      await page
        .locator('#inbox-list .task', { hasText: 'task one' })
        .getByRole('button', { name: 'Add to today: task one' })
        .click();
      await expectNoViolations(page);
    });
  }

  test('plan-tomorrow dialog', async ({ page }) => {
    await capture(page, 'plannable');
    await page.getByRole('button', { name: 'Plan tomorrow' }).click();
    await expectNoViolations(page);
  });

  test('review dialog', async ({ page }) => {
    await capture(page, 'reviewable');
    await page.getByRole('button', { name: 'Review', exact: true }).click();
    await expectNoViolations(page);
  });

  test('sync dialog', async ({ page }) => {
    await page.locator('#sync-btn').click();
    await expect(page.locator('#sync-dialog')).toBeVisible();
    await expectNoViolations(page);
  });

  test('expanded previous-days history', async ({ page }) => {
    await writeStateAndReload(page, (s) => {
      s.tasks.push({
        id: 'hist-a11y',
        text: 'done yesterday',
        createdAt: 1750000000000,
        status: 'done',
        order: null,
        migrationCount: 0,
        ackMigrations: 0,
        completedAt: 1750000001000,
        completedOn: localDate(1),
      });
    });
    await page.locator('#history-section summary').click();
    await expect(page.locator('#history-body .task .text')).toBeVisible();
    await expectNoViolations(page);
  });

  test('capture input is focused on load for keyboard-first use', async ({ page }) => {
    await expect(page.locator('#capture-input')).toBeFocused();
  });
});
