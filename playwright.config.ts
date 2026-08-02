import { defineConfig } from '@playwright/test';

const PORT = 4173;

export default defineConfig({
  testDir: 'tests/e2e',
  reporter: [['list']],
  // Baselines are rendered on macOS; on CI (Linux) run the visual tests'
  // flows but skip pixel comparison.
  ignoreSnapshots: !!process.env.CI,
  expect: {
    toHaveScreenshot: { maxDiffPixelRatio: 0.02 },
  },
  webServer: {
    command: `node scripts/serve.mjs ${PORT}`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: !process.env.CI,
  },
  use: {
    baseURL: `http://localhost:${PORT}/`,
    viewport: { width: 900, height: 900 },
  },
});
