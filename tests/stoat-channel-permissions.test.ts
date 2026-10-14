/** Pinned upstream protocol fixtures, not deployed Stoat acceptance. */
import { afterEach, expect, it, vi } from 'vitest';
import { StoatClient, stoatChannelPermissionBits } from '@rooms/stoat';
const view = 2 ** 20,
  send = 2 ** 22,
  manage = 4,
  high = 2 ** 40;
const channel = {
  _id: 'channel',
  channel_type: 'TextChannel',
  server: 'space',
  name: 'Private title',
  default_permissions: { a: 0, d: 0 },
  role_permissions: { role: { a: high, d: 0 } },
};
const server = {
  _id: 'space',
  owner: 'owner',
  default_permissions: view + send,
  roles: { role: { name: 'Moderator', rank: 1, permissions: { a: manage, d: 0 } } },
};
const values = {
  view: 'deny',
  send: 'inherit',
  files: 'allow',
  manageMessages: 'inherit',
  manageChannel: 'inherit',
} as const;
afterEach(() => vi.unstubAllGlobals());
function fixture(
  options: {
    self?: string;
    denied?: boolean;
    putDenied?: boolean;
    defer?: () => Promise<void>;
  } = {},
) {
  const calls: { url: string; method: string; body: any }[] = [];
  const raw = structuredClone(channel);
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({
        url,
        method: init.method!,
        body: init.body ? JSON.parse(String(init.body)) : null,
      });
      if (options.defer) await options.defer();
      const path = new URL(url).pathname;
      let result: unknown = {};
      let status = 200;
      if (path === '/api/users/@me') result = { _id: options.self ?? 'owner', username: 'Fixture' };
      else if (path === '/api/servers/space') result = server;
      else if (path.startsWith('/api/servers/space/members/')) result = { roles: ['role'] };
      else if (path.includes('/permissions/')) {
        if (options.putDenied) {
          status = 403;
          result = { type: 'NotElevated' };
        } else {
          raw.role_permissions.role = {
            a: JSON.parse(String(init.body)).permissions.allow,
            d: JSON.parse(String(init.body)).permissions.deny,
          };
          result = raw;
        }
      } else if (path === '/api/channels/channel') {
        result = raw;
        if (options.denied) {
          status = 403;
          result = { type: 'MissingPermission' };
        }
      }
      return new Response(JSON.stringify(result), {
        status,
        headers: { 'Content-Type': 'application/json' },
      });
    }),
  );
  return { client: new StoatClient('http://127.0.0.1:9999', 'fixture-private-token'), calls, raw };
}
it('projects ranked upstream overrides, owner bypass, timeout and view gating without a Discord administrator bit', () => {
  const member = { roles: ['role'] };
  expect(
    stoatChannelPermissionBits(
      { _id: 'member' },
      server,
      { ...channel, default_permissions: { a: 0, d: view } },
      member,
    ) & BigInt(view),
  ).toBe(0n);
  const allowing = {
    ...server,
    roles: { role: { ...server.roles.role, permissions: { a: view, d: 0 } } },
  };
  expect(
    stoatChannelPermissionBits(
      { _id: 'member' },
      allowing,
      { ...channel, default_permissions: { a: 0, d: view } },
      member,
    ) & BigInt(view),
  ).toBe(BigInt(view));
  expect(
    stoatChannelPermissionBits(
      { _id: 'member' },
      allowing,
      { ...channel, role_permissions: { role: { a: 0, d: view } } },
      member,
    ),
  ).toBe(0n);
  expect(
    stoatChannelPermissionBits({ _id: 'member' }, server, channel, {
      ...member,
      timeout: '2999-01-01T00:00:00Z',
    }) & BigInt(send),
  ).toBe(0n);
  expect(stoatChannelPermissionBits({ _id: 'owner' }, server, channel, null) & BigInt(manage)).toBe(
    4n,
  );
  expect(stoatChannelPermissionBits({ _id: 'outsider' }, server, channel, null)).toBe(0n);
});
it('returns only bounded public ACL metadata and preserves high unrelated bits in official role PUT', async () => {
  const { client, calls } = fixture();
  const acl = await client.channelPermissions('channel');
  expect(acl).toMatchObject({
    access: 'allowed',
    memberOverridesSupported: false,
    concurrency: 'last-write-wins',
    effective: { managePermissions: true },
    subjects: [{ kind: 'default' }, { kind: 'role', id: 'role' }],
  });
  await client.setChannelPermissions({
    channelId: 'channel',
    subject: { kind: 'role', id: 'role' },
    values,
  });
  expect(calls.find((c) => c.method === 'PUT')).toMatchObject({
    url: 'http://127.0.0.1:9999/api/channels/channel/permissions/role',
    body: { permissions: { allow: high + 2 ** 27, deny: view } },
  });
  expect(JSON.stringify(acl)).not.toContain('fixture-private-token');
  expect(JSON.stringify(acl)).not.toContain('Private title');
});
it('rejects unsupported member overrides before sending any network request', async () => {
  const { client, calls } = fixture();
  await expect(
    client.setChannelPermissions({
      channelId: 'channel',
      subject: { kind: 'member', id: 'member' },
      values,
    } as any),
  ).rejects.toMatchObject({ status: 400 });
  expect(calls).toHaveLength(0);
});
it('enforces upstream write rejection even when local capability projection permits editing', async () => {
  const { client } = fixture({ self: 'member', putDenied: true });
  expect((await client.channelPermissions('channel')).effective.managePermissions).toBe(true);
  await expect(
    client.setChannelPermissions({
      channelId: 'channel',
      subject: { kind: 'role', id: 'role' },
      values,
    }),
  ).rejects.toMatchObject({ status: 403, code: 'NotElevated' });
});
it('denied reads contain no channel title, role names or content and invalidate cached messages', async () => {
  const { client } = fixture({ denied: true });
  const events: any[] = [];
  client.subscribe((e) => events.push(e));
  (client as any).messages.set('message', { channel: 'channel', content: 'Private body' });
  const result = await client.channelPermissions('channel');
  expect(result).toMatchObject({
    access: 'denied',
    subjects: [],
    spaceId: null,
    effective: { view: false },
  });
  expect((client as any).messages.size).toBe(0);
  expect(events).toEqual([
    {
      type: 'CHANNEL_ACCESS_INVALIDATED',
      data: { channelIds: ['channel'], reason: 'permissions-changed' },
    },
  ]);
  expect(JSON.stringify(result)).not.toMatch(/Private|Moderator/);
});
it('invalidates channel and membership updates before content and drops later unauthorized gateway previews', async () => {
  const { client } = fixture({ denied: true });
  const events: any[] = [];
  client.subscribe((e) => events.push(e));
  (client as any).channels.set('channel', channel);
  await (client as any).processPacket({
    type: 'ChannelUpdate',
    id: 'channel',
    data: { default_permissions: { a: 0, d: view } },
  });
  await (client as any).processPacket({
    type: 'Message',
    channel: 'channel',
    content: 'Private body',
  });
  await (client as any).processPacket({
    type: 'ServerMemberUpdate',
    id: { server: 'space', user: 'owner' },
    data: { roles: [] },
  });
  expect(events.filter((e) => e.type === 'MESSAGE_CREATE')).toHaveLength(0);
  expect(
    events.some(
      (e) => e.type === 'CHANNEL_ACCESS_INVALIDATED' && e.data.reason === 'membership-changed',
    ),
  ).toBe(true);
  expect(JSON.stringify(events)).not.toContain('Private body');
});
it('discards an ACL read started before native disconnection', async () => {
  let release!: () => void;
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  const { client } = fixture({ defer: () => waiting });
  const pending = client.channelPermissions('channel');
  await Promise.resolve();
  await client.disconnect();
  release();
  await expect(pending).rejects.toMatchObject({ code: 'SESSION_CHANGED' });
});

it('does not re-emit invalidation forever when a revoked channel is repeatedly rechecked', async () => {
  const { client } = fixture({ denied: true });
  const events: any[] = [];
  client.subscribe((e) => events.push(e));
  await client.channelPermissions('channel');
  await client.channelPermissions('channel');
  expect(events).toHaveLength(1);
});
it('preserves safe signed permission flags and uses default route without adding a member endpoint', async () => {
  const { client, raw, calls } = fixture();
  raw.default_permissions = { a: -1, d: 0 };
  await client.setChannelPermissions({
    channelId: 'channel',
    subject: { kind: 'default', id: 'default' },
    values,
  });
  const put = calls.find((c) => c.method === 'PUT')!;
  expect(put.url).toBe('http://127.0.0.1:9999/api/channels/channel/permissions/default');
  expect(BigInt(put.body.permissions.allow) & BigInt(high)).toBe(BigInt(high));
  expect(put.body.permissions.deny).toBe(view);
});
it('does not advertise management when equal-ranked server roles disagree, regardless of response order', () => {
  for (const roles of [
    {
      allow: { rank: 1, permissions: { a: 4, d: 0 } },
      deny: { rank: 1, permissions: { a: 0, d: 4 } },
    },
    {
      deny: { rank: 1, permissions: { a: 0, d: 4 } },
      allow: { rank: 1, permissions: { a: 4, d: 0 } },
    },
  ])
    expect(
      stoatChannelPermissionBits({ _id: 'member' }, { ...server, roles }, channel, {
        roles: ['allow', 'deny'],
      }) & 4n,
    ).toBe(0n);
});
it('invalidates native previews on a direct REST channel denial without waiting for gateway delivery', async () => {
  const { client } = fixture({ denied: true });
  const events: any[] = [];
  client.subscribe((e) => events.push(e));
  await expect(client.getChannel('channel')).rejects.toMatchObject({ status: 403 });
  expect(events).toEqual([
    {
      type: 'CHANNEL_ACCESS_INVALIDATED',
      data: { channelIds: ['channel'], reason: 'permissions-changed' },
    },
  ]);
});
it('refuses late message normalization while channel access remains invalidated', async () => {
  const { client } = fixture({ denied: true });
  await client.channelPermissions('channel');
  await expect(
    (client as any).normalizeMessage({
      _id: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
      channel: 'channel',
      author: 'friend',
      user: { _id: 'friend', username: 'Friend' },
      content: 'Late secret',
    }),
  ).rejects.toMatchObject({ code: 'ACCESS_CHANGED' });
  expect((client as any).messages.size).toBe(0);
});
