import { defineConfig } from '@playwright/test';

// Real ROOMS desktop clients against the disposable local stack (`pnpm e2e:stack up`).
// One worker: several Electron processes per test already share the machine and the stack.
export default defineConfig({
  testDir: './specs',
  outputDir: '../../.local/e2e/test-results',
  globalSetup: './support/global-setup.ts',
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 120000,
  expect: { timeout: 15000 },
  reporter: [
    ['list'],
    ['html', { outputFolder: '../../.local/e2e/report', open: 'never' }],
    ['json', { outputFile: '../../.local/e2e/results.json' }],
  ],
});
