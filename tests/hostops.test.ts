import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { HostOpsStore } from '../apps/services/hostops/store';
import { LinuxCollector, emptySupplement } from '../apps/services/hostops/collector';
import { TerminalHub, type TerminalDriver } from '../apps/services/hostops/terminals';
import { createHostOpsServer } from '../apps/services/hostops/server';
import { communityOwnership } from '../apps/services/hostops/authorization';
import { StoatError } from '@rooms/stoat';
import type { HostSample, TerminalEvent } from '../packages/shared-contracts/src/hostops';
const temp: string[] = [];
afterEach(() => {
  for (const p of temp.splice(0)) rmSync(p, { recursive: true, force: true });
});
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'rooms-ops-test-'));
  temp.push(dir);
  const alive = new Set<string>();
  const writes: string[] = [];
  const outputs = new Map<string, (s: string) => void>();
  const driver: TerminalDriver = {
    exists: (id) => alive.has(id),
    create: (id) => {
      alive.add(id);
    },
    close: (id) => {
      alive.delete(id);
    },
    attach: (id, _p, onData) => {
      outputs.set(id, onData);
      return { write: (s) => writes.push(s), resize: vi.fn(), detach: vi.fn() };
    },
  };
  let now = 100000;
  const profiles = [{ id: 'operator', user: 'rooms-operator', directory: '/srv/operator' }];
  const hub = new TerminalHub(join(dir, 'state.json'), profiles, driver, () => now);
  return {
    hub,
    driver,
    writes,
    outputs,
    alive,
    profiles,
    file: join(dir, 'state.json'),
    advance: (ms: number) => {
      now += ms;
    },
  };
}
function sample(at: number, cpuPercent = 10): HostSample {
  return {
    hostId: 'core',
    at,
    cpuPercent,
    cores: 2,
    perCorePercent: [cpuPercent, cpuPercent],
    load: [0, 0, 0],
    memory: { total: 4e9, available: 2e9, swapTotal: 0, swapUsed: 0 },
    disk: { total: 20e9, free: 10e9, readBps: null, writeBps: null },
    network: { receiveBps: null, sendBps: null, receivedBytes: null, sentBytes: null },
    temperatureC: null,
    ...emptySupplement(),
    lastBackupAt: at,
  };
}
describe('HostOps telemetry and authority', () => {
  it('does not fabricate first CPU/rate measurements and handles interface counter reset', async () => {
    let tick = 0;
    const collector = new LinuxCollector('core', {
      now: () => (tick ? 5000 : 0),
      read: async (path) => {
        if (path === '/proc/stat')
          return tick
            ? 'cpu 200 0 0 150 0 0 0 0\ncpu0 100 0 0 75 0 0 0 0\ncpu1 100 0 0 75 0 0 0 0'
            : 'cpu 100 0 0 100 0 0 0 0\ncpu0 50 0 0 50 0 0 0 0\ncpu1 50 0 0 50 0 0 0 0';
        if (path === '/proc/meminfo')
          return 'MemTotal: 4096 kB\nMemAvailable: 2048 kB\nSwapTotal: 100 kB\nSwapFree: 40 kB';
        if (path === '/proc/net/dev')
          return `eth0: ${tick ? 50 : 100} 0 0 0 0 0 0 0 100 0 0 0 0 0 0 0\nlo: 100000 0 0 0 0 0 0 0 100000 0 0 0 0 0 0 0`;
        return '';
      },
    });
    const first = await collector.sample();
    expect(first.cpuPercent).toBeNull();
    expect(first.network.receiveBps).toBeNull();
    tick = 1;
    const next = await collector.sample();
    expect(next.cpuPercent).toBeCloseTo(66.666);
    expect(next.network.receiveBps).toBeNull();
    expect(next.memory.available).toBe(2048 * 1024);
    expect(next.memory.swapUsed).toBe(60 * 1024);
    expect(next.temperatureC).toBeNull();
  });
  it('deduplicates sustained CPU alerts, resets on collection failure and retains pending delivery', () => {
    let now = 100000;
    const store = new HostOpsStore(':memory:', () => now);
    store.sample(sample(now, 95));
    now += 60000;
    store.sample(sample(now, 95));
    const cpu = store.alerts('core', 'owner').filter((a) => a.kind === 'cpu');
    expect(cpu).toHaveLength(1);
    expect(cpu[0].delivery).toBe('pending');
    store.sample(sample((now += 5000), 95));
    expect(store.alerts('core', 'owner').filter((a) => a.kind === 'cpu')).toHaveLength(1);
    store.acknowledge('other', 'owner', [cpu[0].id]);
    expect(store.alerts('core', 'owner')[0].delivery).toBe('pending');
    store.acknowledge('core', 'owner', [cpu[0].id]);
    expect(store.alerts('core', 'owner').find((a) => a.id === cpu[0].id)?.delivery).toBe(
      'delivered',
    );
    expect(store.alerts('core', 'another').find((a) => a.id === cpu[0].id)?.delivery).toBe(
      'pending',
    );
    store.collectorFailed('core');
    store.sample(sample((now += 5000), 95));
    expect(store.alerts('core', 'owner').find((a) => a.kind === 'cpu')?.resolvedAt).not.toBeNull();
    store.close();
  });
  it('retains long history after raw expiry without leaking other hosts', () => {
    let now = 0;
    const store = new HostOpsStore(':memory:', () => now);
    store.sample(sample(now));
    now = 2 * 86400000;
    store.sample(sample(now));
    expect(store.history('core', 'day')).toHaveLength(1);
    expect(store.history('core', 'week')).toHaveLength(2);
    expect(store.history('other', 'month')).toEqual([]);
    store.close();
  });
  it('reports an unreachable membership store as an outage instead of no permission', async () => {
    const store = new HostOpsStore(':memory:');
    const app = createHostOpsServer({
      store,
      hosts: [
        {
          id: 'core',
          label: 'Core',
          physicalHostId: 'primary',
          mode: 'shared',
          communityId: 'space',
          ownerProfileId: null,
          agentAvailable: false,
        },
      ],
      identify: async (token) => {
        if (token === 'stranger') throw Object.assign(Error('denied'), { status: 403 });
        if (token === 'signed-out') throw Error('SIGN_IN_REQUIRED');
        throw Error('connect ECONNREFUSED 172.18.0.3:27017');
      },
    });
    try {
      for (const token of ['stranger', 'signed-out'])
        expect(
          (await app.inject({ url: '/v1/hosts', headers: { authorization: token } })).json(),
        ).toEqual({ hosts: [] });
      const outage = await app.inject({ url: '/v1/hosts', headers: { authorization: 'owner' } });
      expect(outage.statusCode).toBe(503);
      expect(outage.json()).toEqual({ error: 'HOSTOPS_UNAVAILABLE' });
    } finally {
      await app.close();
    }
  });
  it('enforces owner grants and separates monitor from terminal/agent privileges', async () => {
    const store = new HostOpsStore(':memory:');
    const app = createHostOpsServer({
      store,
      hosts: [
        {
          id: 'core',
          label: 'Core',
          physicalHostId: 'primary',
          mode: 'shared',
          communityId: 'space',
          ownerProfileId: null,
          agentAvailable: false,
        },
      ],
      identify: async (token) => {
        if (!['owner', 'member', 'viewer'].includes(token)) throw Error('SIGN_IN_REQUIRED');
        return { userId: token, owner: token === 'owner' };
      },
    });
    try {
      expect(
        (await app.inject({ url: '/v1/hosts', headers: { authorization: 'member' } })).json(),
      ).toEqual({ hosts: [] });
      expect(
        (await app.inject({ url: '/v1/hosts/core/snapshot', headers: { authorization: 'member' } }))
          .statusCode,
      ).toBe(403);
      expect(
        (
          await app.inject({
            method: 'PUT',
            url: '/v1/hosts/core/operators',
            headers: { authorization: 'member' },
            payload: { userId: 'viewer', permissions: ['monitor'], profileId: null },
          })
        ).statusCode,
      ).toBe(403);
      expect(
        (
          await app.inject({
            method: 'PUT',
            url: '/v1/hosts/core/operators',
            headers: { authorization: 'owner' },
            payload: { userId: 'viewer', permissions: ['monitor'], profileId: null },
          })
        ).statusCode,
      ).toBe(200);
      expect(
        (
          await app.inject({ url: '/v1/hosts/core/snapshot', headers: { authorization: 'viewer' } })
        ).json().stale,
      ).toBe(true);
      expect(
        (
          await app.inject({
            url: '/v1/hosts/core/terminals',
            headers: { authorization: 'viewer' },
          })
        ).statusCode,
      ).toBe(403);
      expect(
        (
          await app.inject({
            url: '/v1/hosts/core/operators',
            headers: { authorization: 'viewer' },
          })
        ).statusCode,
      ).toBe(403);
      await app.inject({
        method: 'PUT',
        url: '/v1/hosts/core/operators',
        headers: { authorization: 'owner' },
        payload: { userId: 'viewer', permissions: [], profileId: null },
      });
      expect(
        (await app.inject({ url: '/v1/hosts/core/snapshot', headers: { authorization: 'viewer' } }))
          .statusCode,
      ).toBe(403);
    } finally {
      await app.close();
    }
  });
});
describe('operator terminal lifecycle', () => {
  it('lets owner-equivalent admins open terminals on the shared owner profile', () => {
    const f = fixture();
    const owner = f.hub.create('core', 'owner', 'operator', undefined, { sharedProfile: true });
    f.hub.attach('core', owner.id, 'owner', () => {}).detach();
    // An operator with their own grant still cannot use someone else's profile.
    expect(() => f.hub.create('core', 'ops', 'operator')).toThrow('TERMINAL_PROFILE_IN_USE');
    const admin = f.hub.create('core', 'osman', 'operator', undefined, { sharedProfile: true });
    expect(admin.ownerId).toBe('osman');
    expect(f.hub.list('core', 'owner').map((t) => t.id)).toEqual([owner.id]);
  });
  it('keeps detached processes, resumes after broker restart and expires at 24h', () => {
    const f = fixture();
    const t = f.hub.create('core', 'owner', 'operator');
    const connection = f.hub.attach('core', t.id, 'owner', () => {});
    connection.input({ type: 'input', data: 'echo hello\r', sequence: 0 });
    connection.detach();
    f.hub.shutdown();
    expect(f.alive.has(t.id)).toBe(true);
    let restoredNow = 100000;
    const restored = new TerminalHub(f.file, f.profiles, f.driver, () => restoredNow);
    expect(restored.list('core', 'owner')[0].state).toBe('detached');
    restoredNow += 86400000;
    restored.expire();
    expect(f.alive.has(t.id)).toBe(false);
  });
  it('limits sessions, rejects replay, enforces one writer and shared read-only access', () => {
    const f = fixture();
    const t = f.hub.create('core', 'owner', 'operator');
    f.hub.create('core', 'owner', 'operator');
    f.hub.create('core', 'owner', 'operator');
    expect(() => f.hub.create('core', 'owner', 'operator')).toThrow('TERMINAL_LIMIT');
    expect(f.hub.list('core', 'toString')).toEqual([]);
    expect(() => f.hub.attach('core', t.id, 'constructor', () => {})).toThrow(
      'TERMINAL_ACCESS_DENIED',
    );
    const a = f.hub.attach('core', t.id, 'owner', () => {});
    const second = f.hub.attach('core', t.id, 'owner', () => {});
    expect(() => second.input({ type: 'input', data: 'second window', sequence: 0 })).toThrow(
      'TERMINAL_VIEW_ONLY',
    );
    a.input({ type: 'input', data: 'one', sequence: 1 });
    expect(() => a.input({ type: 'input', data: 'replay', sequence: 1 })).toThrow(
      'TERMINAL_STALE_INPUT',
    );
    f.hub.action('core', t.id, 'owner', 'share', { userId: 'viewer', access: 'view' });
    const b = f.hub.attach('core', t.id, 'viewer', () => {});
    expect(() => b.input({ type: 'input', data: 'bad', sequence: 0 })).toThrow(
      'TERMINAL_VIEW_ONLY',
    );
    f.hub.action('core', t.id, 'owner', 'share', { userId: 'viewer', access: 'control' });
    expect(() => f.hub.action('core', t.id, 'viewer', 'take')).toThrow('TERMINAL_WRITER_BUSY');
    f.hub.action('core', t.id, 'owner', 'release');
    f.hub.action('core', t.id, 'viewer', 'take');
    b.input({ type: 'input', data: 'two', sequence: 0 });
    expect(() => a.input({ type: 'input', data: 'bad', sequence: 2 })).toThrow(
      'TERMINAL_VIEW_ONLY',
    );
    expect(f.writes).toEqual(['one', 'two']);
    expect(() => f.hub.check('other', t.id, 'owner')).toThrow('TERMINAL_ACCESS_DENIED');
  });
  it('revokes only the selected shared session and clears writer rights immediately', () => {
    const f = fixture(),
      events: TerminalEvent[] = [];
    const a = f.hub.create('core', 'owner', 'operator'),
      b = f.hub.create('core', 'owner', 'operator');
    for (const t of [a, b])
      f.hub.action('core', t.id, 'owner', 'share', { userId: 'viewer', access: 'control' });
    const x = f.hub.attach('core', a.id, 'viewer', (e) => events.push(e));
    const y = f.hub.attach('core', b.id, 'viewer', () => {});
    f.hub.action('core', b.id, 'viewer', 'take');
    f.hub.action('core', a.id, 'owner', 'share', { userId: 'viewer', access: 'none' });
    expect(() => x.input({ type: 'input', sequence: 0, data: 'bad' })).toThrow();
    y.input({ type: 'input', sequence: 0, data: 'ok' });
    expect(events.some((e) => e.type === 'error')).toBe(true);
    expect(f.writes).toEqual(['ok']);
  });
  it('closes owned sessions and removes old shares when operator access is revoked', () => {
    const f = fixture();
    const own = f.hub.create('core', 'op', 'operator');
    const input = f.hub.attach('core', own.id, 'op', () => {});
    f.hub.revokeUser('core', 'op');
    expect(f.alive.has(own.id)).toBe(false);
    expect(() => input.input({ type: 'input', sequence: 0, data: 'bad' })).toThrow();
  });
  it('rejects WebSocket input after grant revocation and reconnects without replaying commands', async () => {
    const f = fixture(),
      store = new HostOpsStore(':memory:');
    store.setGrant('core', { userId: 'op', permissions: ['terminal'], profileId: 'operator' });
    const app = createHostOpsServer({
      store,
      terminals: f.hub,
      hosts: [
        {
          id: 'core',
          label: 'Core',
          physicalHostId: 'primary',
          mode: 'shared',
          communityId: 'space',
          ownerProfileId: 'operator',
          agentAvailable: false,
        },
      ],
      identify: async (token) => ({ userId: token, owner: token === 'owner' }),
    });
    await app.listen({ port: 0, host: '127.0.0.1' });
    const address = app.server.address();
    if (!address || typeof address === 'string') throw Error('address');
    const t = f.hub.create('core', 'op', 'operator');
    const socket = new WebSocket(
      `ws://127.0.0.1:${address.port}/v1/hosts/core/terminals/${t.id}/stream`,
      { headers: { authorization: 'op' } },
    );
    try {
      await once(socket, 'open');
      store.setGrant('core', { userId: 'op', permissions: [], profileId: null });
      const closed = once(socket, 'close');
      socket.send(JSON.stringify({ type: 'input', sequence: 0, data: 'must not execute' }));
      await closed;
      expect(f.writes).toEqual([]);
      expect(f.alive.has(t.id)).toBe(true);
    } finally {
      socket.terminate();
      await app.close();
    }
  });
});

describe('community ownership for host operations', () => {
  const api = (owner: string) => ({
    getServer: vi.fn(async () => ({ owner })),
    getMember: vi.fn(async () => ({})),
  });
  it('asks the Stoat API when the membership store cannot be reached', async () => {
    const reader = {
      community: vi.fn(async () => {
        throw Error('connect ECONNREFUSED 172.18.0.3:27017');
      }),
    };
    const client = api('owner');
    expect(await communityOwnership(reader as never, client, 'space', 'owner')).toBe(true);
    expect(client.getServer).toHaveBeenCalledWith('space');
    expect(client.getMember).not.toHaveBeenCalled();
    // A non-owner still has to be a member.
    const other = api('owner');
    expect(await communityOwnership(reader as never, other, 'space', 'member')).toBe(false);
    expect(other.getMember).toHaveBeenCalledWith('space', 'member');
  });
  it('counts a member whose roles grant every permission as the owner', async () => {
    const full = String((1n << 52n) - 1n);
    const server = {
      _id: 'space',
      owner: 'owner',
      default_permissions: '0',
      roles: { developer: { rank: 0, permissions: { a: full, d: '0' } } },
    };
    const developer = { _id: { server: 'space', user: 'dev' }, roles: ['developer'] };
    const reader = { community: vi.fn(async () => ({ server, member: developer })) };
    expect(await communityOwnership(reader as never, api('owner'), 'space', 'dev')).toBe(true);
    const down = {
      community: vi.fn(async () => {
        throw Error('connect ECONNREFUSED 172.18.0.3:27017');
      }),
    };
    const client = {
      getServer: vi.fn(async () => server),
      getMember: vi.fn(async () => developer),
    };
    expect(await communityOwnership(down as never, client, 'space', 'dev')).toBe(true);
    const plain = { _id: { server: 'space', user: 'dev' }, roles: [] };
    reader.community.mockResolvedValueOnce({ server, member: plain });
    expect(await communityOwnership(reader as never, api('owner'), 'space', 'dev')).toBe(false);
  });
  it('keeps a refusal from the store as a refusal', async () => {
    const reader = {
      community: vi.fn(async () => {
        throw new StoatError(403, 'ROOM_ACCESS_DENIED');
      }),
    };
    const client = api('stranger');
    await expect(communityOwnership(reader as never, client, 'space', 'x')).rejects.toMatchObject({
      status: 403,
    });
    expect(client.getServer).not.toHaveBeenCalled();
  });
});
describe('operator grants', () => {
  it('revokes a grant whose terminal profile was removed from the machine', async () => {
    const store = new HostOpsStore(':memory:');
    const revoked: string[] = [];
    const app = createHostOpsServer({
      store,
      hosts: [
        {
          id: 'core',
          label: 'Core',
          physicalHostId: 'primary',
          mode: 'shared',
          communityId: 'space',
          ownerProfileId: null,
          agentAvailable: false,
        },
      ],
      terminals: {
        hasProfile: () => false,
        revokeUser: (_host: string, user: string) => revoked.push(user),
        detachAll: () => {},
        expire: () => {},
        shutdown: () => {},
      } as never,
      identify: async (token) => ({ userId: token, owner: token === 'owner' }),
    });
    try {
      store.setGrant('core', {
        userId: 'ops',
        permissions: ['monitor', 'terminal'],
        profileId: 'gone',
      });
      const put = (payload: unknown) =>
        app.inject({
          method: 'PUT',
          url: '/v1/hosts/core/operators',
          headers: { authorization: 'owner' },
          payload: payload as object,
        });
      expect(
        (await put({ userId: 'ops', permissions: ['terminal'], profileId: 'gone' })).json(),
      ).toEqual({ error: 'TERMINAL_PROFILE_UNAVAILABLE' });
      expect((await put({ userId: 'ops', permissions: [], profileId: 'gone' })).statusCode).toBe(
        200,
      );
      expect(store.grant('core', 'ops')?.permissions ?? []).toEqual([]);
      expect(revoked).toContain('ops');
    } finally {
      await app.close();
    }
  });
});
describe('admins who lose the role', () => {
  it('closes their terminals on the owner profile, and only on a definite answer', async () => {
    vi.useFakeTimers();
    const f = fixture();
    const store = new HostOpsStore(':memory:');
    const owners: Record<string, boolean | 'error'> = { owner: true, osman: true, ece: 'error' };
    const app = createHostOpsServer({
      store,
      terminals: f.hub,
      hosts: [
        {
          id: 'core',
          label: 'Core',
          physicalHostId: 'primary',
          mode: 'shared',
          communityId: 'space',
          ownerProfileId: 'operator',
          agentAvailable: false,
        },
      ],
      identify: async (token) => ({ userId: token, owner: true }),
      stillOwner: async (user) => {
        if (owners[user] === 'error') throw new Error('store unreachable');
        return owners[user] === true;
      },
    });
    try {
      await app.ready();
      const osman = f.hub.create('core', 'osman', 'operator', undefined, { sharedProfile: true });
      const ece = f.hub.create('core', 'ece', 'operator', undefined, { sharedProfile: true });
      await vi.advanceTimersByTimeAsync(60_000);
      expect(f.alive.has(osman.id)).toBe(true);
      owners.osman = false;
      await vi.advanceTimersByTimeAsync(60_000);
      expect(f.alive.has(osman.id)).toBe(false);
      // A failed read of the membership store closes nothing.
      expect(f.alive.has(ece.id)).toBe(true);
    } finally {
      await app.close();
      vi.useRealTimers();
    }
  });
});
