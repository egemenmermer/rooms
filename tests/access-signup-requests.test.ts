import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// `<id>-token` signs in as `<id>`; `owner` owns `space`. New accounts get the id `new-<n>`.
// `stoat.members` tracks who belongs to `space`; `stoat.create` steers account creation.
const stoat = vi.hoisted(() => ({
  create: 'ok' as 'ok' | 'email-taken' | 'after-create',
  created: [] as { email: string; username: string; accountInviteCode: string }[],
  members: new Set<string>(['owner', 'member']),
  upstreamInvites: new Set<string>(),
  createdInvites: [] as string[],
  accepted: [] as { user: string; code: string }[],
  nextUser: 0,
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
        if (!stoat.members.has(user)) throw new real.StoatError(404, 'NotFound');
        return { _id: { server, user }, roles: [] };
      }
      async createUpstreamInvite(channelId: string) {
        const code = `up-${channelId}-${stoat.createdInvites.length + 1}`;
        stoat.createdInvites.push(code);
        stoat.upstreamInvites.add(code);
        return { code, space: { id: 'space', name: 'Tayfa' }, channel: null, expiresAt: null };
      }
      async inspectUpstreamInvite(code: string) {
        if (!stoat.upstreamInvites.has(code)) throw new real.StoatError(404, 'NotFound');
        return { code, space: { id: 'space', name: 'Tayfa' }, channel: null, expiresAt: null };
      }
      async acceptInvite(code: string) {
        const user = this.token!.replace(/-token$/, '');
        if (!stoat.upstreamInvites.has(code)) throw new real.StoatError(404, 'NotFound');
        stoat.accepted.push({ user, code });
        stoat.members.add(user);
        return { code, space: { id: 'space', name: 'Tayfa' }, channel: null, expiresAt: null };
      }
      async createUpstreamAccount(
        input: { email: string; username: string; accountInviteCode: string },
        hooks: { onStage?(stage: string): void } = {},
      ) {
        hooks.onStage?.('account-create');
        if (stoat.create === 'email-taken') throw new real.StoatError(409, 'EmailInUse');
        hooks.onStage?.('account-created');
        if (stoat.create === 'after-create') throw new real.StoatError(503, 'NETWORK_UNAVAILABLE');
        stoat.created.push(input);
        this.token = `new-${++stoat.nextUser}-token`;
        return this.getCurrentUser();
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
  Object.assign(stoat, {
    create: 'ok',
    created: [],
    members: new Set(['owner', 'member']),
    upstreamInvites: new Set(),
    createdInvites: [],
    accepted: [],
    nextUser: 0,
  });
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
const signup = (server: Server, n = 1, overrides: Record<string, unknown> = {}, ip?: string) =>
  server.inject({
    method: 'POST',
    url: '/v1/auth/signup-requests',
    remoteAddress: ip ?? `203.0.113.${++address % 250}`,
    payload: {
      email: `friend${n}@example.com`,
      password: 'correct horse battery',
      username: `friend${n}`,
      ...overrides,
    },
  });
const status = async (server: Server, user: string) =>
  (await server.inject({ url: '/v1/auth/signup-requests/me', headers: bearer(user) })).json();
const decide = (server: Server, user: string, decision: 'approve' | 'reject', by = 'owner') =>
  server.inject({
    method: 'POST',
    url: `/v1/spaces/space/signup-requests/${user}/${decision}`,
    headers: bearer(by),
  });

describe('approved sign-up without an invitation link', () => {
  it('stays off until the operator names a community', async () => {
    const server = await access({ signupSpaceId: undefined });
    try {
      expect((await server.inject({ url: '/v1/auth/signup' })).json()).toEqual({ enabled: false });
      const response = await signup(server);
      expect(response.statusCode).toBe(501);
      expect(response.json().error).toBe('SIGNUP_UNAVAILABLE');
      expect(stoat.created).toEqual([]);
    } finally {
      await server.close();
    }
  });

  it('creates the account through the broker and queues it without joining', async () => {
    const server = await access();
    try {
      expect((await server.inject({ url: '/v1/auth/signup' })).json()).toEqual({ enabled: true });
      const response = await signup(server);
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ token: 'new-1-token', status: 'pending' });
      expect(stoat.created).toEqual([
        expect.objectContaining({ email: 'friend1@example.com', accountInviteCode: seeded[0] }),
      ]);
      expect(stoat.accepted).toEqual([]);
      expect(await status(server, 'new-1')).toMatchObject({ status: 'pending', enabled: true });
      // Only the user id, chosen name and decision are kept; never the email or password.
      const stored = await readFile(join(directory, 'signup-requests.json'), 'utf8');
      expect(stored).toContain('friend1');
      expect(stored).not.toContain('friend1@example.com');
      expect(stored).not.toContain('correct horse battery');
    } finally {
      await server.close();
    }
  });

  it('lets only owners and admins see and decide requests', async () => {
    const server = await access();
    try {
      await signup(server);
      const list = await server.inject({
        url: '/v1/spaces/space/signup-requests',
        headers: bearer('owner'),
      });
      expect(list.json()).toEqual({
        enabled: true,
        requests: [expect.objectContaining({ userId: 'new-1', username: 'friend1' })],
      });
      const denied = await server.inject({
        url: '/v1/spaces/space/signup-requests',
        headers: bearer('member'),
      });
      expect(denied.statusCode).toBe(403);
      expect((await decide(server, 'new-1', 'approve', 'member')).statusCode).toBe(403);
      // A community that is not the configured one says so instead of listing anything.
      const other = await server.inject({
        url: '/v1/spaces/other/signup-requests',
        headers: bearer('owner'),
      });
      expect(other.json()).toEqual({ enabled: false, requests: [] });
    } finally {
      await server.close();
    }
  });

  it('joins an approved person on their next status check through one broker invitation', async () => {
    const server = await access();
    try {
      await signup(server, 1);
      await signup(server, 2);
      expect((await decide(server, 'new-1', 'approve')).json()).toEqual({ state: 'approved' });
      expect(stoat.createdInvites).toEqual(['up-general-1']);
      expect(await status(server, 'new-1')).toMatchObject({
        status: 'joined',
        space: { id: 'space', name: 'Tayfa' },
      });
      expect(stoat.accepted).toEqual([{ user: 'new-1', code: 'up-general-1' }]);
      // The second approval reuses the same upstream invitation, which never leaves the broker.
      await decide(server, 'new-2', 'approve');
      expect(stoat.createdInvites).toEqual(['up-general-1']);
      const joined = await status(server, 'new-2');
      expect(JSON.stringify(joined)).not.toContain('up-general');
      expect(joined.status).toBe('joined');
      // Joined people leave the admin list; checking again does not join twice.
      expect(await status(server, 'new-1')).toMatchObject({ status: 'joined' });
      expect(stoat.accepted).toHaveLength(2);
      const list = await server.inject({
        url: '/v1/spaces/space/signup-requests',
        headers: bearer('owner'),
      });
      expect(list.json().requests).toEqual([]);
    } finally {
      await server.close();
    }
  });

  it('replaces a broker invitation that was removed upstream at the next approval', async () => {
    const server = await access();
    try {
      await signup(server, 1);
      await decide(server, 'new-1', 'approve');
      stoat.upstreamInvites.clear();
      const failed = await server.inject({
        url: '/v1/auth/signup-requests/me',
        headers: bearer('new-1'),
      });
      expect(failed.statusCode).toBe(409);
      expect(failed.json().error).toBe('SIGNUP_JOIN_FAILED');
      expect((await decide(server, 'new-1', 'approve')).statusCode).toBe(200);
      expect(stoat.createdInvites).toEqual(['up-general-1', 'up-general-2']);
      expect(await status(server, 'new-1')).toMatchObject({ status: 'joined' });
    } finally {
      await server.close();
    }
  });

  it('tells a rejected person plainly and does not let them queue again at once', async () => {
    const server = await access();
    try {
      await signup(server);
      expect((await decide(server, 'new-1', 'reject')).json()).toEqual({ state: 'rejected' });
      expect(await status(server, 'new-1')).toMatchObject({ status: 'rejected' });
      expect(stoat.accepted).toEqual([]);
      const again = await server.inject({
        method: 'POST',
        url: '/v1/auth/signup-requests/me',
        headers: bearer('new-1'),
      });
      expect(again.statusCode).toBe(409);
      expect((await decide(server, 'new-1', 'approve')).statusCode).toBe(404);
    } finally {
      await server.close();
    }
  });

  it('validates the form before creating anything', async () => {
    const server = await access();
    try {
      for (const overrides of [
        { password: 'short' },
        { username: 'a' },
        { username: 'has space' },
        { email: 'not-an-email' },
        { inviteCode: 'extra-field' },
      ])
        expect((await signup(server, 1, overrides)).statusCode).toBe(400);
      expect(stoat.created).toEqual([]);
      expect(seeded).toEqual([]);
    } finally {
      await server.close();
    }
  });

  it('limits sign-ups per address, across the server and by the pending queue', async () => {
    const perIp = await access();
    try {
      for (let n = 1; n <= 3; n++)
        expect((await signup(perIp, n, {}, '198.51.100.7')).statusCode).toBe(200);
      expect((await signup(perIp, 4, {}, '198.51.100.7')).statusCode).toBe(429);
    } finally {
      await perIp.close();
    }
    await rm(join(directory, 'signup-requests.json'));
    const global = await access({ signupLimits: { globalPerHour: 2 } });
    try {
      expect((await signup(global, 11)).statusCode).toBe(200);
      expect((await signup(global, 12)).statusCode).toBe(200);
      const busy = await signup(global, 13);
      expect(busy.statusCode).toBe(429);
      expect(busy.json().error).toBe('SIGNUP_BUSY');
    } finally {
      await global.close();
    }
    const created = stoat.created.length;
    const full = await access({ signupLimits: { maxPending: 2 } });
    try {
      const refused = await signup(full, 21);
      expect(refused.statusCode).toBe(503);
      expect(refused.json().error).toBe('SIGNUP_QUEUE_FULL');
      // The queue refuses before any account invitation or upstream account is created.
      expect(stoat.created.length).toBe(created);
    } finally {
      await full.close();
    }
  });

  it('keeps definite refusals and uncertain account creation apart', async () => {
    const server = await access();
    try {
      stoat.create = 'email-taken';
      const taken = await signup(server, 1);
      expect(taken.statusCode).toBe(409);
      expect(taken.json().error).toBe('EmailInUse');
      stoat.create = 'after-create';
      const uncertain = await signup(server, 2);
      expect(uncertain.statusCode).toBe(502);
      expect(uncertain.json().error).toBe('REGISTRATION_UNCERTAIN');
    } finally {
      await server.close();
    }
  });

  it('lets an existing account without a request ask again, but not a member', async () => {
    const server = await access();
    try {
      const ask = (user: string) =>
        server.inject({
          method: 'POST',
          url: '/v1/auth/signup-requests/me',
          headers: bearer(user),
        });
      expect(await status(server, 'lonely')).toMatchObject({ status: 'none' });
      expect((await ask('lonely')).json()).toEqual({ status: 'pending', enabled: true });
      expect(await status(server, 'lonely')).toMatchObject({ status: 'pending' });
      expect((await ask('member')).json().error).toBe('SIGNUP_ALREADY_MEMBER');
    } finally {
      await server.close();
    }
  });

  it('keeps invitation-link sign-up unchanged next to it', async () => {
    const server = await access();
    try {
      const response = await server.inject({
        method: 'POST',
        url: '/v1/auth/register',
        payload: {
          email: 'x@example.com',
          password: 'correct horse battery',
          username: 'x1',
          inviteCode: 'a'.repeat(64),
        },
      });
      expect(response.statusCode).toBe(403);
      expect(response.json().error).toBe('INVITE_UNAVAILABLE');
    } finally {
      await server.close();
    }
  });
});

describe('signup request store', () => {
  it('expires undecided requests so they free the queue and may be sent again', async () => {
    let now = Date.parse('2026-10-01T00:00:00Z');
    const store = new SignupRequestStore(join(directory, 'store.json'), { now: () => now });
    await store.add('u1', 'space', 'u1');
    await expect(store.assertCapacity(1)).rejects.toThrow();
    now += 15 * 86400 * 1000;
    expect((await store.status('u1')).status).toBe('expired');
    await expect(store.assertCapacity(1)).resolves.toBeUndefined();
    expect(await store.list('space')).toEqual([]);
    await store.add('u1', 'space', 'u1', 1);
    expect((await store.status('u1')).status).toBe('pending');
  });

  it('prunes decided requests after a month', async () => {
    let now = Date.parse('2026-10-01T00:00:00Z');
    const path = join(directory, 'prune.json');
    const store = new SignupRequestStore(path, { now: () => now });
    await store.add('u1', 'space', 'u1');
    await store.add('u2', 'space', 'u2');
    await store.decide('space', 'u1', 'rejected', 'owner');
    now += 31 * 86400 * 1000;
    await store.decide('space', 'u2', 'approved', 'owner').catch(() => {});
    await store.add('u3', 'space', 'u3');
    expect((await store.status('u1')).status).toBe('none');
  });

  it('counts a rolling window', () => {
    let now = 0;
    const limiter = new WindowLimiter(2, 1000, () => now);
    expect([limiter.take(), limiter.take(), limiter.take()]).toEqual([true, true, false]);
    now = 1000;
    expect(limiter.take()).toBe(true);
  });
});
