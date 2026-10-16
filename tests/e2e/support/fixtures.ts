import { readFileSync } from 'node:fs';
import { test as base, expect } from '@playwright/test';
import { ClientPool, type RoomsClient } from './client';
import { runFile } from './env';
import type { RunFixture } from './seed';

interface Fixtures {
  /** Opens additional real clients; all are closed and cleaned up after the test. */
  clients: ClientPool;
  /** Signed-in community owner. */
  owner: RoomsClient;
  /** Signed-in community member. */
  guest: RoomsClient;
}

export const test = base.extend<Fixtures, { run: RunFixture }>({
  run: [
    async ({}, use) => {
      await use(JSON.parse(readFileSync(runFile, 'utf8')) as RunFixture);
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
