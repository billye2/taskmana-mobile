import { test, expect, writeStateAndReload, localDate } from './fixtures';

// Deterministic state so screenshots are stable; the date line is masked
// because it changes daily.
function seed(state: any) {
  const mk = (text: string, over: Record<string, unknown> = {}) => ({
    id: `id-${text.replace(/\s+/g, '-')}`,
    text,
    createdAt: 1750000000000,
    status: 'inbox',
    order: null,
    migrationCount: 0,
    ackMigrations: 0,
    completedAt: null,
    completedOn: null,
    ...over,
  });
  state.tasks = [
    mk('Ship the quarterly report', { status: 'today', order: 0 }),
    mk('Call the dentist', { status: 'done', order: 1, completedAt: 1750000001000, completedOn: localDate() }),
    mk('Review the PR backlog', { status: 'today', order: 2, migrationCount: 1 }),
    mk('Renew passport', { status: 'today', order: 3, migrationCount: 5 }),
    mk('Email accountant about Q3'),
    mk('Learn watercolor painting', { status: 'someday' }),
    // yesterday's done: shows the collapsed "Previous days" footer disclosure
    mk('Fix the garage shelf', { status: 'done', completedAt: 1749900000000, completedOn: localDate(1) }),
  ];
  state.tomorrowQueue = [];
  state.lastReviewDate = localDate();
}

for (const scheme of ['light', 'dark'] as const) {
  test(`new tab visual — ${scheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await writeStateAndReload(page, seed);
    await expect(page.locator('#today-list .task')).toHaveCount(4);
    await expect(page).toHaveScreenshot(`newtab-${scheme}.png`, {
      fullPage: true,
      mask: [page.locator('#date-line')],
    });
  });
}

test('plan-tomorrow dialog visual', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await writeStateAndReload(page, seed);
  await page.getByRole('button', { name: 'Plan tomorrow' }).click();
  await page.getByRole('button', { name: 'Add to tomorrow: Email accountant about Q3' }).click();
  await expect(page.locator('#plan-count')).toHaveText('1/6 picked');
  await expect(page).toHaveScreenshot('plan-dialog.png', {
    mask: [page.locator('#date-line')],
  });
});
