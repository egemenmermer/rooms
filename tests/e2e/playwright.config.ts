import { defineConfig } from '@playwright/test';

// Real ROOMS desktop clients against the disposable local stack (`pnpm e2e:stack up`).
// Spec files run in parallel workers; each worker seeds its own community (fixtures.ts) and
// tests inside a file stay in order. A test opens 1-4 Electron processes, so keep the worker
// count modest: ROOMS_E2E_WORKERS overrides the default of 4.
export default defineConfig({
  testDir: './specs',
  outputDir: '../../.local/e2e/test-results',
  globalSetup: './support/global-setup.ts',
  workers: Number(process.env.ROOMS_E2E_WORKERS ?? 4),
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
