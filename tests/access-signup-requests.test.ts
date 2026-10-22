import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// `<id>-token` signs in as `<id>`; `owner` owns `space`, `member` belongs to it. Every upstream
// call the broker makes is recorded so tests can prove that nothing happens before approval.
const stoat = vi.hoisted(() => ({
  calls: [] as string[],
  registered: [] as { email: string; inviteCode: string; accountInviteCode: string }[],
  upstreamInvites: new Set<string>(),
  deleted: [] as string[],
}));
vi.mock('@rooms/stoat', async () => {
  const real = await vi.importActual<any>('@rooms/stoat');
  return {
    ...real,
    StoatClient: class {
      constructor(
        _url: string,
        private token?: string,
      ) {}
      async getCurrentUser() {
        if (!this.token) throw new real.StoatError(401, 'AUTH_REQUIRED');
        const id = this.token.replace(/-token$/, '');
        return { id, username: id, displayName: id, avatar: null };
      }
      async getServer(spaceId: string) {
        if (!['space', 'other'].includes(spaceId)) throw new real.StoatError(404, 'NotFound');
        return {
          _id: spaceId,
          name: 'Tayfa',
          owner: 'owner',
          default_permissions: '0',
          roles: {},
          channels: ['general', 'voice'],
        };
      }
      async getMember(server: string, user: string) {
        if (user !== 'member') throw new real.StoatError(404, 'NotFound');
        return { _id: { server, user }, roles: [] };
      }
      async createUpstreamInvite(channelId: string) {
        stoat.calls.push(`createUpstreamInvite ${channelId}`);
        const code = `up${stoat.upstreamInvites.size + stoat.deleted.length + 1}`;
        stoat.upstreamInvites.add(code);
        return { code, space: { id: 'space', name: 'Tayfa' }, channel: null, expiresAt: null };
      }
      async deleteUpstreamInvite(code: string) {
        stoat.upstreamInvites.delete(code);
        stoat.deleted.push(code);
      }
      async inspectUpstreamInvite(code: string) {
        if (!stoat.upstreamInvites.has(code)) throw new real.StoatError(404, 'NotFound');
        return { code, space: { id: 'space', name: 'Tayfa' }, channel: null, expiresAt: null };
      }
      async registerUpstream(input: {
        email: string;
        inviteCode: string;
        accountInviteCode: string;
      }) {
        stoat.calls.push('registerUpstream');
        if (input.email === 'taken@example.com') {
          const hooks = arguments[1] as { onStage?(stage: string): void } | undefined;
          hooks?.onStage?.('account-create');
          // What the adapter reports for Stoat's 500 OperationFailed on an existing email.
          throw new real.StoatError(409, 'OperationFailed');
        }
        stoat.registered.push(input);
        this.token = 'new-token';
      }
      getToken() {
        return this.token;
      }
    },
  };
});
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAccessServer } from '../apps/services/access/server';
import { SignupRequestStore, WindowLimiter } from '../apps/services/access/signup-requests';

let directory: string;
let seeded: string[];
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'rooms-signup-requests-'));
  seeded = [];
  Object.assign(stoat, { calls: [], registered: [], upstreamInvites: new Set(), deleted: [] });
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});
type Server = Awaited<ReturnType<typeof createAccessServer>>;
async function access(extra: Record<string, unknown> = {}) {
  return createAccessServer({
    stoatUrl: 'http://127.0.0.1:1',
    livekitUrl: 'http://127.0.0.1:1',
    publicLivekitUrl: 'ws://127.0.0.1:1',
    apiKey: 'test',
    apiSecret: 'test-secret-key-at-least-32-characters',
    registrationInvitesFile: join(directory, 'invites.json'),
    signupRequestsFile: join(directory, 'signup-requests.json'),
    accountInviteSink: { insert: async (code: string) => void seeded.push(code) },
    signupSpaceId: 'space',
    ...extra,
  });
}
const bearer = (user: string) => ({ authorization: `Bearer ${user}-token` });
let address = 0;
const ask = (server: Server, n = 1, overrides: Record<string, unknown> = {}, ip?: string) =>
  server.inject({
    method: 'POST',
    url: '/v1/auth/signup-requests',
    remoteAddress: ip ?? `203.0.113.${++address % 250}`,
    payload: { email: `friend${n}@example.com`, username: `friend${n}`, ...overrides },
  });
const request = async (server: Server, n = 1) => {
  const response = await ask(server, n);
  expect(response.statusCode).toBe(200);
  return response.json() as { requestId: string; pollSecret: string };
};
const poll = (server: Server, item: { requestId: string; pollSecret: string }) =>
  server.inject({
    url: `/v1/auth/signup-requests/${item.requestId}`,
    headers: { authorization: `Bearer ${item.pollSecret}` },
  });
const decide = (server: Server, id: string, decision: 'approve' | 'reject', by = 'owner') =>
  server.inject({
    method: 'POST',
    url: `/v1/spaces/space/signup-requests/${id}/${decision}`,
    headers: bearer(by),
  });
const register = (server: Server, inviteCode: string, email = 'friend1@example.com') =>
  server.inject({
    method: 'POST',
    url: '/v1/auth/register',
    payload: { email, password: 'correct horse battery', username: 'friend1', inviteCode },
  });

describe('approved sign-up without an invitation link', () => {
  it('stays off until the operator names a community', async () => {
    const server = await access({ signupSpaceId: undefined });
    try {
      expect((await server.inject({ url: '/v1/auth/signup' })).json()).toEqual({ enabled: false });
      const response = await ask(server);
      expect(response.statusCode).toBe(501);
      expect(response.json().error).toBe('SIGNUP_UNAVAILABLE');
    } finally {
      await server.close();
    }
  });

  it('creates no account, session or invitation for a request, and takes no password', async () => {
    const server = await access();
    try {
      expect((await server.inject({ url: '/v1/auth/signup' })).json()).toEqual({ enabled: true });
      const withPassword = await ask(server, 1, { password: 'correct horse battery' });
      expect(withPassword.statusCode).toBe(400);
      const item = await request(server);
      expect(Object.keys(item).sort()).toEqual(['pollSecret', 'requestId', 'status']);
      expect(item.requestId).toMatch(/^[a-f0-9]{32}$/);
      expect(stoat.calls).toEqual([]);
      expect(seeded).toEqual([]);
      expect((await poll(server, item)).json()).toMatchObject({
        status: 'pending',
        inviteCode: null,
      });
      // Only a hash of the email and of the poll secret are stored.
      const stored = await readFile(join(directory, 'signup-requests.json'), 'utf8');
      expect(stored).toContain('friend1');
      expect(stored).not.toContain('friend1@example.com');
      expect(stored).not.toContain(item.pollSecret);
    } finally {
      await server.close();
    }
  });

  it('answers only the holder of the poll secret', async () => {
    const server = await access();
    try {
      const item = await request(server);
      const other = await request(server, 2);
      expect((await poll(server, { ...item, pollSecret: other.pollSecret })).statusCode).toBe(404);
      expect((await poll(server, { ...item, pollSecret: 'x' })).statusCode).toBe(404);
      expect(
        (await server.inject({ url: `/v1/auth/signup-requests/${item.requestId}` })).statusCode,
      ).toBe(404);
    } finally {
      await server.close();
    }
  });

  it('lets only owners and admins see and decide requests', async () => {
    const server = await access();
    try {
      const item = await request(server);
      const list = await server.inject({
        url: '/v1/spaces/space/signup-requests',
        headers: bearer('owner'),
      });
      expect(list.json()).toEqual({
        enabled: true,
        requests: [expect.objectContaining({ id: item.requestId, username: 'friend1' })],
      });
      expect(JSON.stringify(list.json())).not.toContain('example.com');
      const denied = await server.inject({
        url: '/v1/spaces/space/signup-requests',
        headers: bearer('member'),
      });
      expect(denied.statusCode).toBe(403);
      expect((await decide(server, item.requestId, 'approve', 'member')).statusCode).toBe(403);
      const other = await server.inject({
        url: '/v1/spaces/other/signup-requests',
        headers: bearer('owner'),
      });
      expect(other.json()).toEqual({ enabled: false, requests: [] });
    } finally {
      await server.close();
    }
  });

  it('never creates an account for a rejected request', async () => {
    const server = await access();
    try {
      const item = await request(server);
      expect((await decide(server, item.requestId, 'reject')).json()).toEqual({
        state: 'rejected',
      });
      expect((await poll(server, item)).json()).toMatchObject({
        status: 'rejected',
        inviteCode: null,
      });
      expect((await decide(server, item.requestId, 'approve')).statusCode).toBe(404);
      expect(stoat.calls).toEqual([]);
      expect(stoat.registered).toEqual([]);
    } finally {
      await server.close();
    }
  });

  it('hands out a single-use code once on approval that the existing registration consumes', async () => {
    const server = await access();
    try {
      const item = await request(server);
      expect((await decide(server, item.requestId, 'approve')).json()).toEqual({
        state: 'approved',
      });
      expect(stoat.calls).toEqual(['createUpstreamInvite general']);
      // The link is an ordinary one-use invitation link of the community.
      const links = (
        await server.inject({ url: '/v1/spaces/space/invites', headers: bearer('owner') })
      ).json().invites;
      expect(links).toEqual([expect.objectContaining({ maxUses: 1, uses: 0, source: 'admin' })]);
      const first = (await poll(server, item)).json();
      expect(first).toMatchObject({ status: 'approved' });
      expect(first.inviteCode).toMatch(/^[a-f0-9]{64}$/);
      // Exactly once: the broker forgets the code after handing it out.
      expect((await poll(server, item)).json()).toMatchObject({
        status: 'issued',
        inviteCode: null,
      });
      expect(await readFile(join(directory, 'signup-requests.json'), 'utf8')).not.toContain(
        first.inviteCode,
      );
      const created = await register(server, first.inviteCode);
      expect(created.statusCode).toBe(200);
      expect(created.json()).toEqual({ token: 'new-token' });
      expect(stoat.registered).toEqual([
        expect.objectContaining({ inviteCode: 'up1', accountInviteCode: seeded[0] }),
      ]);
      const again = await register(server, first.inviteCode, 'second@example.com');
      expect(again.statusCode).toBe(409);
      expect(again.json().error).toBe('INVITE_ALREADY_CLAIMED');
    } finally {
      await server.close();
    }
  });

  it('keeps the code usable when the email already has an account', async () => {
    const server = await access();
    try {
      const item = await request(server);
      await decide(server, item.requestId, 'approve');
      const { inviteCode } = (await poll(server, item)).json();
      const taken = await register(server, inviteCode, 'taken@example.com');
      expect(taken.statusCode).toBe(409);
      expect(taken.json().error).toBe('OperationFailed');
      expect((await register(server, inviteCode)).statusCode).toBe(200);
    } finally {
      await server.close();
    }
  });

  it('closes an unfetched link when the request is rejected, re-approved or withdrawn', async () => {
    const server = await access();
    try {
      const rejected = await request(server, 1);
      await decide(server, rejected.requestId, 'approve');
      await decide(server, rejected.requestId, 'reject');
      expect(stoat.deleted).toEqual(['up1']);
      expect((await poll(server, rejected)).json()).toMatchObject({ status: 'rejected' });

      const twice = await request(server, 2);
      await decide(server, twice.requestId, 'approve');
      await decide(server, twice.requestId, 'approve');
      expect(stoat.deleted).toEqual(['up1', 'up2']);
      const { inviteCode } = (await poll(server, twice)).json();
      expect((await register(server, inviteCode)).statusCode).toBe(200);

      const withdrawn = await request(server, 3);
      await decide(server, withdrawn.requestId, 'approve');
      const cancelled = await server.inject({
        method: 'DELETE',
        url: `/v1/auth/signup-requests/${withdrawn.requestId}`,
        headers: { authorization: `Bearer ${withdrawn.pollSecret}` },
      });
      expect(cancelled.json()).toEqual({ cancelled: true });
      expect((await poll(server, withdrawn)).statusCode).toBe(404);
      const links = (
        await server.inject({ url: '/v1/spaces/space/invites', headers: bearer('owner') })
      ).json().invites as { state: string }[];
      // Only the link that was used remains listed (full); none is left open.
      expect(links.map((link) => link.state)).toEqual(['full']);
    } finally {
      await server.close();
    }
  });

  it('limits requests per address, across the server, by the queue and by email', async () => {
    const perIp = await access();
    try {
      for (let n = 1; n <= 3; n++)
        expect((await ask(perIp, n, {}, '198.51.100.7')).statusCode).toBe(200);
      expect((await ask(perIp, 4, {}, '198.51.100.7')).statusCode).toBe(429);
      const duplicate = await ask(perIp, 1, { email: 'FRIEND1@example.com ' });
      expect(duplicate.statusCode).toBe(409);
      expect(duplicate.json().error).toBe('SIGNUP_ALREADY_REQUESTED');
    } finally {
      await perIp.close();
    }
    await rm(join(directory, 'signup-requests.json'));
    const global = await access({ signupLimits: { globalPerHour: 2 } });
    try {
      expect((await ask(global, 11)).statusCode).toBe(200);
      expect((await ask(global, 12)).statusCode).toBe(200);
      const busy = await ask(global, 13);
      expect(busy.statusCode).toBe(429);
      expect(busy.json().error).toBe('SIGNUP_BUSY');
    } finally {
      await global.close();
    }
    const full = await access({ signupLimits: { maxPending: 2 } });
    try {
      const refused = await ask(full, 21);
      expect(refused.statusCode).toBe(503);
      expect(refused.json().error).toBe('SIGNUP_QUEUE_FULL');
    } finally {
      await full.close();
    }
  });

  it('validates the form', async () => {
    const server = await access();
    try {
      for (const overrides of [
        { username: 'a' },
        { username: 'has space' },
        { email: 'not-an-email' },
        { inviteCode: 'extra-field' },
      ])
        expect((await ask(server, 1, overrides)).statusCode).toBe(400);
    } finally {
      await server.close();
    }
  });
});

describe('signup request store', () => {
  it('expires undecided requests so they free the queue and may be sent again', async () => {
    let now = Date.parse('2026-10-01T00:00:00Z');
    const store = new SignupRequestStore(join(directory, 'store.json'), { now: () => now });
    const first = await store.add({ spaceId: 'space', username: 'u1', email: 'u1@x.io' }, 1);
    await expect(
      store.add({ spaceId: 'space', username: 'u2', email: 'u2@x.io' }, 1),
    ).rejects.toThrow();
    now += 15 * 86400 * 1000;
    expect((await store.poll(first.id, first.pollSecret)).status).toBe('expired');
    expect(await store.list('space')).toEqual([]);
    await store.add({ spaceId: 'space', username: 'u1', email: 'u1@x.io' }, 1);
  });

  it('prunes decided requests after a month', async () => {
    let now = Date.parse('2026-10-01T00:00:00Z');
    const store = new SignupRequestStore(join(directory, 'prune.json'), { now: () => now });
    const first = await store.add({ spaceId: 'space', username: 'u1', email: 'u1@x.io' }, 9);
    await store.reject('space', first.id, 'owner');
    now += 31 * 86400 * 1000;
    await store.add({ spaceId: 'space', username: 'u3', email: 'u3@x.io' }, 9);
    await expect(store.poll(first.id, first.pollSecret)).rejects.toThrow();
  });

  it('counts a rolling window', () => {
    let now = 0;
    const limiter = new WindowLimiter(2, 1000, () => now);
    expect([limiter.take(), limiter.take(), limiter.take()]).toEqual([true, true, false]);
    now = 1000;
    expect(limiter.take()).toBe(true);
  });
});
