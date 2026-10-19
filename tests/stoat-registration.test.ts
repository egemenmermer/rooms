import { mkdtemp, readFile, rm, stat, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  InviteClaimReleased,
  RegistrationGate,
  inviteDigest,
  inviteId,
} from '../apps/services/access/registration';

let directory: string | undefined;
afterEach(async () => {
  if (directory) await rm(directory, { recursive: true, force: true });
  directory = undefined;
});
async function ledgerPath() {
  directory = await mkdtemp(join(tmpdir(), 'rooms-registration-fixture-'));
  return join(directory, 'invites.json');
}
/** A single-use ledger exactly as the previous broker wrote it. */
async function legacyGate(state = 'available', expired = false) {
  const path = await ledgerPath();
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
          state,
        },
      },
    }),
    { mode: 0o600 },
  );
  return new RegistrationGate(path);
}
async function issued(maxUses = 10) {
  const gate = new RegistrationGate(await ledgerPath());
  const link = await gate.issue({
    communityInviteCode: 'community-1',
    spaceId: 'space-1',
    createdBy: 'owner-1',
    source: 'app',
    upstreamOwned: true,
    maxUses,
  });
  return { gate, link };
}
const ok = async () => true;

describe('ROOMS multi-use registration links (fixture tests, no upstream claims)', () => {
  it('issues a 64-hex token valid for 7 days and 10 people by default', async () => {
    const { gate, link } = await issued();
    expect(link.code).toMatch(/^[a-f0-9]{64}$/);
    expect(link.id).toBe(inviteId(inviteDigest(link.code)));
    expect(link.maxUses).toBe(10);
    expect(Date.parse(link.expiresAt) - Date.now()).toBeGreaterThan(6.9 * 86400 * 1000);
    const raw = await readFile(gate.path, 'utf8');
    expect(raw).not.toContain(link.code);
    expect((await stat(gate.path)).mode & 0o777).toBe(0o600);
  });

  it('accepts exactly maxUses signups and rejects the next one', async () => {
    const { gate, link } = await issued(10);
    for (let i = 0; i < 10; i++) await gate.consume(link.code, ok);
    await expect(
      gate.consume(link.code, async () => {
        throw new Error('Must not be called');
      }),
    ).rejects.toMatchObject({ code: 'INVITE_ALREADY_CLAIMED' });
    expect((await gate.list('space-1'))[0]).toMatchObject({ uses: 10, state: 'full' });
  });

  it('lets exactly maxUses concurrent signups reach the upstream', async () => {
    const { gate, link } = await issued(10);
    let externalCalls = 0;
    const results = await Promise.allSettled(
      Array.from({ length: 12 }, () =>
        gate.consume(link.code, async () => {
          externalCalls++;
          await new Promise((resolve) => setTimeout(resolve, 5));
          return true;
        }),
      ),
    );
    expect(externalCalls).toBe(10);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(10);
  });

  it('returns released uses and keeps uncertain ones counted', async () => {
    const { gate, link } = await issued(1);
    await expect(
      gate.consume(link.code, async () => {
        throw new InviteClaimReleased(new Error('Username taken before account creation'));
      }),
    ).rejects.toThrow('Username taken before account creation');
    await expect(gate.consume(link.code, async () => 'second')).resolves.toBe('second');

    const other = await issued(1);
    await expect(
      other.gate.consume(other.link.code, async () => {
        throw new Error('Network outcome unknown');
      }),
    ).rejects.toThrow('Network outcome unknown');
    await expect(
      new RegistrationGate(other.gate.path).consume(other.link.code, ok),
    ).rejects.toMatchObject({ code: 'INVITE_ALREADY_CLAIMED' });
  });

  it('never consumes a use on inspection', async () => {
    const { gate, link } = await issued(1);
    const before = await readFile(gate.path, 'utf8');
    for (let i = 0; i < 5; i++)
      expect(await gate.inspect(link.code)).toMatchObject({
        communityInviteCode: 'community-1',
        spaceId: 'space-1',
      });
    expect(await readFile(gate.path, 'utf8')).toBe(before);
  });

  it('revokes a link for its own space only and reports whether the upstream invite is free', async () => {
    const { gate, link } = await issued();
    await expect(gate.revoke('space-2', link.id)).rejects.toMatchObject({
      code: 'INVITE_NOT_FOUND',
    });
    await expect(gate.revoke('space-1', link.id)).resolves.toEqual({
      communityInviteCode: 'community-1',
      releaseUpstream: true,
    });
    await expect(gate.inspect(link.code)).rejects.toMatchObject({ code: 'INVITE_REVOKED' });
    await expect(gate.consume(link.code, ok)).rejects.toMatchObject({ code: 'INVITE_REVOKED' });
    expect(await gate.list('space-1')).toEqual([]);
  });

  it('caps active links per space', async () => {
    const gate = new RegistrationGate(await ledgerPath());
    const input = {
      communityInviteCode: 'community-1',
      spaceId: 'space-1',
      source: 'app' as const,
    };
    for (let i = 0; i < 2; i++) await gate.issue({ ...input, maxActivePerSpace: 2 });
    await expect(gate.issue({ ...input, maxActivePerSpace: 2 })).rejects.toMatchObject({
      code: 'INVITE_LIMIT_REACHED',
    });
  });

  it('rejects unknown and expired links before external calls', async () => {
    let now = Date.now();
    const gate = new RegistrationGate(await ledgerPath(), { now: () => now });
    const link = await gate.issue({
      communityInviteCode: 'community-1',
      source: 'admin',
      seconds: 60,
    });
    now += 61000;
    for (const [code, error] of [
      [link.code, 'INVITE_EXPIRED'],
      ['unknown', 'INVITE_NOT_FOUND'],
    ])
      await expect(
        gate.consume(code, async () => {
          throw new Error('Must not be called');
        }),
      ).rejects.toMatchObject({ code: error });
  });

  it('keeps the upstream invitation while a signup is in flight and ages out stale claims', async () => {
    let now = Date.now();
    const gate = new RegistrationGate(await ledgerPath(), { now: () => now });
    const link = await gate.issue({
      communityInviteCode: 'community-1',
      spaceId: 'space',
      source: 'app',
      upstreamOwned: true,
    });
    let finish!: () => void;
    const running = gate.consume(
      link.code,
      () => new Promise<void>((resolve) => (finish = resolve)),
    );
    await vi.waitFor(async () => expect((await gate.list('space'))[0]?.pending).toBe(1));
    expect(await gate.revoke('space', link.id)).toMatchObject({ releaseUpstream: false });
    finish();
    await running;

    const second = await gate.issue({
      communityInviteCode: 'community-2',
      spaceId: 'space',
      source: 'app',
    });
    void gate.consume(second.code, () => new Promise(() => {}));
    await vi.waitFor(async () => expect((await gate.list('space'))[0]?.pending).toBe(1));
    now += 11 * 60 * 1000;
    expect((await gate.list('space'))[0]).toMatchObject({ pending: 0, uses: 1 });
  });

  it('migrates a single-use ledger once and keeps a backup', async () => {
    const g = await legacyGate();
    const value = await g.consume('fixture-code', async (grant) => {
      expect(grant.accountInviteCode).toBe('official-account-ticket');
      expect(grant.communityInviteCode).toBe('official-community-ticket');
      return 'ok';
    });
    expect(value).toBe('ok');
    await expect(g.consume('fixture-code', ok)).rejects.toMatchObject({
      code: 'INVITE_ALREADY_CLAIMED',
    });
    const backup = JSON.parse(await readFile(`${g.path}.v1.bak`, 'utf8'));
    expect(backup.version).toBe(1);
    const ledger = JSON.parse(await readFile(g.path, 'utf8'));
    expect(ledger.version).toBe(2);
    expect(ledger.invites[inviteDigest('fixture-code')]).toMatchObject({
      maxUses: 1,
      source: 'legacy',
    });
  });

  it('keeps used and failed single-use tickets closed after migration', async () => {
    for (const state of ['used', 'failed', 'claiming']) {
      const g = await legacyGate(state);
      await expect(g.consume('fixture-code', ok)).rejects.toMatchObject({
        code: 'INVITE_ALREADY_CLAIMED',
      });
      await rm(directory!, { recursive: true, force: true });
    }
  });

  it('recovers a stale lock and reports a busy one', async () => {
    const { gate, link } = await issued();
    await writeFile(`${gate.path}.lock`, '');
    const old = new Date(Date.now() - 60000);
    await utimes(`${gate.path}.lock`, old, old);
    await expect(gate.consume(link.code, ok)).resolves.toBe(true);

    await writeFile(`${gate.path}.lock`, '');
    const busy = new RegistrationGate(gate.path, { lockWaitMs: 120 });
    await expect(busy.consume(link.code, ok)).rejects.toMatchObject({ code: 'REGISTRATION_BUSY' });
  });

  it('prunes links that expired long ago', async () => {
    let now = Date.now();
    const gate = new RegistrationGate(await ledgerPath(), { now: () => now });
    const old = await gate.issue({
      communityInviteCode: 'community-1',
      source: 'admin',
      seconds: 60,
    });
    now += 31 * 86400 * 1000;
    await gate.issue({ communityInviteCode: 'community-1', source: 'admin' });
    const ledger = JSON.parse(await readFile(gate.path, 'utf8'));
    expect(ledger.invites[inviteDigest(old.code)]).toBeUndefined();
    expect(Object.keys(ledger.invites)).toHaveLength(1);
  });
});
