import AxeBuilder from '@axe-core/playwright';
import { test, expect, capture } from './fixtures';

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

  test('capture input is focused on load for keyboard-first use', async ({ page }) => {
    await expect(page.locator('#capture-input')).toBeFocused();
  });
});
