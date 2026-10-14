import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { RegistrationGate, inviteDigest } from '../apps/services/access/registration';
let directory: string | undefined;
afterEach(async () => {
  if (directory) await rm(directory, { recursive: true, force: true });
  directory = undefined;
});
async function gate(expired = false) {
  directory = await mkdtemp(join(tmpdir(), 'rooms-registration-fixture-'));
  const path = join(directory, 'invites.json');
  await writeFile(
    path,
    JSON.stringify({
      version: 1,
      invites: {
        [inviteDigest('fixture-code')]: {
          accountInviteCode: 'official-account-ticket',
          communityInviteCode: 'official-community-ticket',
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + (expired ? -60000 : 60000)).toISOString(),
          state: 'available',
        },
      },
    }),
    { mode: 0o600 },
  );
  return new RegistrationGate(path);
}
describe('ROOMS durable registration gate (fixture tests, no upstream claims)', () => {
  it('consumes only a valid scoped invitation and persists one-use state', async () => {
    const g = await gate();
    const value = await g.consume('fixture-code', async (i) => {
      expect(i.accountInviteCode).toBe('official-account-ticket');
      return 'ok';
    });
    expect(value).toBe('ok');
    await expect(
      g.consume('fixture-code', async () => {
        throw new Error('Must not be called');
      }),
    ).rejects.toMatchObject({ code: 'INVITE_ALREADY_CLAIMED' });
    expect(
      JSON.parse(await readFile(g.path, 'utf8')).invites[inviteDigest('fixture-code')].state,
    ).toBe('used');
  });
  it('rejects unknown and expired tickets before external calls', async () => {
    const g = await gate(true);
    for (const code of ['fixture-code', 'unknown'])
      await expect(
        g.consume(code, async () => {
          throw new Error('Must not be called');
        }),
      ).rejects.toMatchObject({ code: 'INVITE_EXPIRED' });
  });
  it('allows only one winner when concurrent requests race', async () => {
    const g = await gate();
    let externalCalls = 0;
    const results = await Promise.allSettled([
      g.consume('fixture-code', async () => {
        externalCalls++;
        await new Promise((r) => setTimeout(r, 20));
        return true;
      }),
      g.consume('fixture-code', async () => {
        externalCalls++;
        return true;
      }),
    ]);
    expect(externalCalls).toBe(1);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  });
  it('never retries an uncertain upstream side effect using the same ticket after restart', async () => {
    const g = await gate();
    await expect(
      g.consume('fixture-code', async () => {
        throw new Error('Network outcome unknown');
      }),
    ).rejects.toThrow('Network outcome unknown');
    await expect(
      new RegistrationGate(g.path).consume('fixture-code', async () => true),
    ).rejects.toMatchObject({ code: 'INVITE_ALREADY_CLAIMED' });
  });
});
