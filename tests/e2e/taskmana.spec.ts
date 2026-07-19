import { test, expect, capture, readState, writeStateAndReload, localDate } from './fixtures';

test('new tab override loads and captured tasks persist across reload', async ({ page }) => {
  expect(page.url()).toMatch(/^chrome-extension:/);
  await capture(page, 'buy milk');
  await capture(page, 'call mom');
  await page.reload();
  await expect(page.locator('#inbox-list .task .text')).toHaveText(['call mom', 'buy milk']);
  const state = await readState(page);
  expect(state.tasks).toHaveLength(2);
});

test('promote to today, complete, reorder, and focus mode locking', async ({ page }) => {
  for (const t of ['one', 'two', 'three', 'four']) await capture(page, t);
  for (const t of ['one', 'two', 'three', 'four']) {
    await page
      .locator('#inbox-list .task', { hasText: t })
      .getByRole('button', { name: `Add to today: ${t}` })
      .click();
  }
  await expect(page.locator('#today-list .task .text')).toHaveText(['one', 'two', 'three', 'four']);
  await expect(page.locator('#today-list .bonus-divider')).toBeVisible();

  // complete the first task
  await page.getByRole('checkbox', { name: 'Mark done: one' }).check();
  await expect(page.locator('#today-list .task.done-row .text')).toHaveText('one');
  await expect(page.locator('#done-toggle')).toHaveText('✓ 1 done today');

  // move "four" up one slot
  await page
    .locator('#today-list .task', { hasText: 'four' })
    .getByRole('button', { name: 'Move up: four' })
    .click();
  await expect(page.locator('#today-list .task .text')).toHaveText(['one', 'two', 'four', 'three']);

  // focus mode locks everything but the first unfinished task
  await page.getByRole('button', { name: 'Focus' }).click();
  await expect(page.locator('#today-list .task.locked .text')).toHaveText(['four', 'three']);
  await expect(page.locator('#today-list .task', { hasText: 'two' })).not.toHaveClass(/locked/);
});

test('plan tomorrow queue promotes in order at day rollover with migration marks', async ({ page }) => {
  for (const t of ['carried', 'planned A', 'planned B']) await capture(page, t);
  await page
    .locator('#inbox-list .task', { hasText: 'carried' })
    .getByRole('button', { name: 'Add to today: carried' })
    .click();

  await page.getByRole('button', { name: 'Plan tomorrow' }).click();
  await page.getByRole('button', { name: 'Add to tomorrow: planned A' }).click();
  await page.getByRole('button', { name: 'Add to tomorrow: planned B' }).click();
  await expect(page.locator('#plan-count')).toHaveText('2/6 picked');
  await page.locator('#plan-save').click();
  await expect(page.locator('#tomorrow-note')).toHaveText('Tomorrow is planned: 2 tasks queued.');

  // simulate the next morning
  await writeStateAndReload(page, (s) => {
    s.lastRolloverDate = localDate(1);
  });
  await expect(page.locator('#today-list .task .text')).toHaveText([
    'planned A',
    'planned B',
    'carried',
  ]);
  await expect(
    page.locator('#today-list .task', { hasText: 'carried' }).locator('.migrations')
  ).toHaveText('›');
});

test('5x migrated task shows honesty prompt; weekly review sorts and clears the nudge', async ({ page }) => {
  await capture(page, 'stale task');
  await capture(page, 'inbox task');
  await page
    .locator('#inbox-list .task', { hasText: 'stale task' })
    .getByRole('button', { name: 'Add to today: stale task' })
    .click();
  await writeStateAndReload(page, (s) => {
    const stale = s.tasks.find((t: any) => t.text === 'stale task');
    stale.migrationCount = 5;
  });

  const prompt = page.locator('.migration-prompt');
  await expect(prompt).toContainText('Carried over 5×. Still worth doing?');

  // review nudge is due (never reviewed, candidates exist)
  await expect(page.locator('#review-badge')).toBeVisible();

  await page.getByRole('button', { name: 'Review', exact: true }).click();
  const reviewActions = page.locator('#review-actions');
  await expect(page.locator('#review-text')).toHaveText('stale task');
  await expect(page.locator('#review-meta')).toContainText('carried over 5×');
  await reviewActions.getByRole('button', { name: 'Someday' }).click();
  await expect(page.locator('#review-text')).toHaveText('inbox task');
  await reviewActions.getByRole('button', { name: 'This week' }).click();
  await expect(page.locator('#review-text')).toContainText('Review done');
  await page.locator('#review-close').click();

  await expect(page.locator('#review-badge')).toBeHidden();
  await page.locator('#someday-section summary').click();
  await expect(page.locator('#someday-list .task .text')).toHaveText(['stale task']);
});

test('method hints name their authors and can be toggled off', async ({ page }) => {
  const hints = page.locator('.hint:not(.hint-example)');
  await expect(hints).toHaveCount(3);
  await expect(hints.nth(0)).toContainText('Ivy Lee');
  await expect(hints.nth(0)).toContainText('Ryder Carroll');
  await expect(hints.nth(1)).toContainText('David Allen');
  await page.getByRole('button', { name: 'Show or hide method hints' }).click();
  await expect(hints.nth(0)).toBeHidden();
  await page.reload();
  await expect(page.locator('.hint').nth(0)).toBeHidden(); // persisted
});

test('hint examples cycle through and wrap around', async ({ page }) => {
  const todayExample = page.locator('.hint-example[data-section="today"] .example-text');
  await expect(todayExample).toContainText('(1/5)');
  await expect(todayExample).toContainText('Plan tomorrow');
  const cycle = page.getByRole('button', { name: 'Show another example for Today' });
  await cycle.click();
  await expect(todayExample).toContainText('(2/5)');
  await expect(todayExample).toContainText('Focus');
  for (let i = 0; i < 4; i++) await cycle.click();
  await expect(todayExample).toContainText('(1/5)'); // wrapped

  // every section has examples, and they hide with the hints toggle
  await expect(page.locator('.hint-example[data-section="inbox"] .example-text')).toContainText('(1/4)');
  await expect(page.locator('.hint-example[data-section="someday"] .example-text')).toContainText('(1/3)');
  await page.getByRole('button', { name: 'Show or hide method hints' }).click();
  await expect(todayExample).toBeHidden();
});

test('review and plan dialogs have cyclable examples that follow the hints toggle', async ({ page }) => {
  await page.getByRole('button', { name: 'Plan tomorrow' }).click();
  const planExample = page.locator('.hint-example[data-section="plan"] .example-text');
  await expect(planExample).toContainText('(1/4)');
  await page.getByRole('button', { name: 'Show another example for planning tomorrow' }).click();
  await expect(planExample).toContainText('Bethlehem Steel');
  await page.locator('#plan-cancel').click();

  await page.getByRole('button', { name: 'Review', exact: true }).click();
  const reviewExample = page.locator('.hint-example[data-section="review"] .example-text');
  await expect(reviewExample).toContainText('(1/4)');
  await page.getByRole('button', { name: 'Show another example for the weekly review' }).click();
  await expect(reviewExample).toContainText('(2/4)');
  await page.locator('#review-close').click();

  // hints off hides dialog examples too
  await page.getByRole('button', { name: 'Show or hide method hints' }).click();
  await page.getByRole('button', { name: 'Plan tomorrow' }).click();
  await expect(planExample).toBeHidden();
});

test('theme toggle forces light and dark regardless of system scheme', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  const themeBtn = page.locator('#theme-toggle');
  await expect(themeBtn).toHaveText('Auto');
  await themeBtn.click(); // -> Light
  await expect(themeBtn).toHaveText('Light');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(250, 250, 250)');
  await themeBtn.click(); // -> Dark
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(9, 9, 11)');
  await page.reload();
  await expect(page.locator('#theme-toggle')).toHaveText('Dark'); // persisted
});
