import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  reporter: [['list']],
  // Baselines are rendered on macOS; on CI (Linux) run the visual tests'
  // flows but skip pixel comparison.
  ignoreSnapshots: !!process.env.CI,
  expect: {
    toHaveScreenshot: { maxDiffPixelRatio: 0.02 },
  },
  use: {
    viewport: { width: 900, height: 900 },
  },
});
