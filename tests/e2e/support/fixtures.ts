import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { test as base, expect } from '@playwright/test';
import { ClientPool, type RoomsClient } from './client';
import { runsDir } from './env';
import { newRunId, seedRun, type RunFixture } from './seed';

interface Fixtures {
  /** Opens additional real clients; all are closed and cleaned up after the test. */
  clients: ClientPool;
  /** Signed-in community owner. */
  owner: RoomsClient;
  /** Signed-in community member. */
  guest: RoomsClient;
}

export const test = base.extend<Fixtures, { run: RunFixture }>({
  // One community and account set per worker: parallel workers never share rooms, members,
  // relationships or upstream rate-limit buckets, and every run starts from fresh data.
  run: [
    async ({}, use, workerInfo) => {
      const run = await seedRun(
        `${process.env.ROOMS_E2E_RUN_ID ?? newRunId()}${workerInfo.parallelIndex}`,
      );
      await mkdir(runsDir, { recursive: true, mode: 0o700 });
      // Disposable passwords and session tokens for the local stack only; ignored by Git.
      await writeFile(
        resolve(runsDir, `worker-${workerInfo.parallelIndex}.json`),
        JSON.stringify(run, null, 2) + '\n',
        { mode: 0o600 },
      );
      await use(run);
    },
    { scope: 'worker' },
  ],
  clients: async ({}, use, testInfo) => {
    const pool = new ClientPool(testInfo);
    await use(pool);
    await pool.closeAll();
  },
  owner: async ({ clients, run }, use) => {
    await use(await clients.signedIn('owner', run.owner));
  },
  guest: async ({ clients, run }, use) => {
    await use(await clients.signedIn('guest', run.guest));
  },
});

export { expect };
