/** Local pinned-protocol fixtures; no deployed account or remote mutations. */
import { afterEach, expect, it, vi } from 'vitest';
import { StoatClient } from '@rooms/stoat';
import { SOCIAL_ROLE_PERMISSION_KEYS, type SocialRolePermissionValues } from '@rooms/social';
const inherited = () =>
  Object.fromEntries(
    SOCIAL_ROLE_PERMISSION_KEYS.map((key) => [key, 'inherit']),
  ) as SocialRolePermissionValues;
afterEach(() => vi.unstubAllGlobals());
function fixture(
  options: {
    self?: string;
    bits?: number;
    timeout?: string;
    writeDenied?: boolean;
    roles?: Record<string, unknown>;
    pauseMembers?: () => Promise<void>;
  } = {},
) {
  const calls: { path: string; method: string; body: any }[] = [];
  const server = {
    _id: 'space',
    owner: 'owner',
    name: 'Private community',
    default_permissions: 0,
    roles: options.roles ?? {
      manager: {
        name: 'Actual manager',
        rank: 1,
        permissions: { a: options.bits ?? 512 + 64, d: 0 },
      },
      member: { name: 'Actual member', rank: 10, permissions: { a: 0, d: 0 } },
      higher: { name: 'Higher role', rank: 0, permissions: { a: 0, d: 0 } },
    },
  };
  const members: any[] = [
    { _id: { server: 'space', user: 'owner' }, roles: [] },
    {
      _id: { server: 'space', user: 'manager' },
      roles: ['manager'],
      ...(options.timeout ? { timeout: options.timeout } : {}),
    },
    { _id: { server: 'space', user: 'member' }, roles: ['member'] },
    { _id: { server: 'space', user: 'peer' }, roles: ['manager'] },
  ];
  const users = members.map((m) => ({
    _id: m._id.user,
    username: m._id.user,
    private_token: 'DO_NOT_EXPOSE',
  }));
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      const path = new URL(url).pathname,
        method = init.method ?? 'GET',
        body = init.body ? JSON.parse(String(init.body)) : null;
      calls.push({ path, method, body });
      let value: any = {},
        status = 200;
      if (method !== 'GET') {
        if (options.writeDenied) {
          status = 403;
          value = { type: 'NotElevated' };
        } else {
          const user = path.split('/').at(-1);
          if (path.includes('/roles') || path.includes('/permissions/')) {
            const roles = server.roles as Record<string, any>;
            if (method === 'POST') {
              roles.created = { name: body.name, rank: 100, permissions: { a: 0, d: 0 } };
              return new Response(JSON.stringify({ id: 'created', role: roles.created }));
            } else if (method === 'PATCH') {
              Object.assign(roles[user!], { name: body.name, colour: body.colour });
            } else if (method === 'PUT')
              roles[user!].permissions = { a: body.permissions.allow, d: body.permissions.deny };
            else delete roles[user!];
          } else if (method === 'PATCH') {
            members.find((m) => m._id.user === user).roles = body.roles;
          } else
            members.splice(
              members.findIndex((m) => m._id.user === user),
              1,
            );
          value = {};
        }
      } else if (path === '/api/users/@me')
        value = { _id: options.self ?? 'manager', username: 'Viewer' };
      else if (path === '/api/servers/space') value = server;
      else if (path === '/api/servers/space/members') {
        await options.pauseMembers?.();
        value = { users, members };
      } else if (path.startsWith('/api/servers/space/members/')) {
        value = members.find((m) => m._id.user === path.split('/').at(-1));
        if (!value) {
          status = 404;
          value = { type: 'NotFound' };
        }
      } else throw new Error('Unexpected request ' + path);
      return new Response(JSON.stringify(value), { status });
    }),
  );
  return {
    client: new StoatClient('http://127.0.0.1:9999', 'local-fixture-secret'),
    calls,
    members,
    server,
  };
}
it('projects real role names/member hierarchy without private credentials or any upstream invite request', async () => {
  const { client, calls } = fixture();
  const result = await client.communityManagement('space');
  expect(result).toMatchObject({
    access: 'allowed',
    capabilities: { assignRoles: true, kickMembers: true, manageServer: false },
    invites: { source: 'rooms-broker', state: 'unsupported', managementSupported: false },
  });
  expect(result.roles.find((r) => r.id === 'member')).toMatchObject({
    name: 'Actual member',
    assignable: true,
  });
  expect(result.roles.find((r) => r.id === 'higher')!.assignable).toBe(false);
  expect(result.members.find((m) => m.user.id === 'member')).toMatchObject({
    canAssignRoles: true,
    canRemove: true,
  });
  expect(result.members.find((m) => m.user.id === 'peer')).toMatchObject({
    canAssignRoles: false,
    canRemove: false,
  });
  expect(result.members.find((m) => m.user.id === 'manager')).toMatchObject({
    canAssignRoles: true,
    canRemove: false,
  });
  expect(result.members.find((m) => m.user.id === 'owner')).toMatchObject({
    canAssignRoles: false,
    canRemove: false,
  });
  expect(JSON.stringify(result)).not.toMatch(/DO_NOT_EXPOSE|local-fixture-secret/);
  expect(calls.every((c) => !c.path.includes('invites'))).toBe(true);
});
it.each([{ bits: 0 }, { timeout: '2999-01-01T00:00:00Z' }])(
  'returns no management roster and makes no roster request when permissions disallow it: %j',
  async (options) => {
    const { client, calls } = fixture(options);
    expect(await client.communityManagement('space')).toMatchObject({
      access: 'denied',
      members: [],
      roles: [],
    });
    expect(calls.some((c) => c.path === '/api/servers/space/members')).toBe(false);
  },
);
it('uses server roles despite absent ViewChannel and conservatively denies conflicting equal-rank allowance', async () => {
  const f = fixture({
    roles: {
      manager: { name: 'Manager', rank: 1, permissions: { a: 512, d: 0 } },
      member: { name: 'Member', rank: 1, permissions: { a: 0, d: 512 } },
    },
  });
  f.members.find((m) => m._id.user === 'manager')!.roles = ['manager', 'member'];
  expect((await f.client.communityManagement('space')).access).toBe('denied');
});
it('sends exact authorized role PATCH and member DELETE, then returns authoritative roster', async () => {
  const { client, calls } = fixture();
  const changed = await client.setCommunityMemberRoles({
    spaceId: 'space',
    userId: 'member',
    roleIds: [],
  });
  expect(changed.members.find((m) => m.user.id === 'member')!.roles).toEqual([]);
  expect(calls.find((c) => c.method === 'PATCH')).toEqual({
    path: '/api/servers/space/members/member',
    method: 'PATCH',
    body: { roles: [] },
  });
  const removed = await client.removeCommunityMember({ spaceId: 'space', userId: 'member' });
  expect(removed.members.some((m) => m.user.id === 'member')).toBe(false);
  expect(calls.find((c) => c.method === 'DELETE')!.path).toBe('/api/servers/space/members/member');
});
it('reports ban and move rights and bans only members below this account', async () => {
  const { client, calls } = fixture({ bits: 512 + 64 + 128 + 2 ** 35 });
  expect(await client.communityCapabilities('space')).toMatchObject({
    kickMembers: true,
    banMembers: true,
    moveMembers: true,
  });
  const before = await client.communityManagement('space');
  expect(before.members.find((m) => m.user.id === 'member')?.canBan).toBe(true);
  expect(before.members.find((m) => m.user.id === 'peer')?.canBan).toBe(false);
  await expect(
    client.banCommunityMember({ spaceId: 'space', userId: 'peer' }),
  ).rejects.toMatchObject({ code: 'NotElevated' });
  await expect(
    client.banCommunityMember({ spaceId: 'space', userId: 'owner' }),
  ).rejects.toMatchObject({ code: 'BAN_MEMBER_DENIED' });
  const banned = await client.banCommunityMember({ spaceId: 'space', userId: 'member' });
  expect(banned.members.some((m) => m.user.id === 'member')).toBe(false);
  expect(calls.find((c) => c.method === 'PUT')).toMatchObject({
    path: '/api/servers/space/bans/member',
    body: {},
  });
});
it('refuses to ban without the Ban Members permission', async () => {
  const { client, calls } = fixture();
  expect((await client.communityCapabilities('space')).banMembers).toBe(false);
  await expect(
    client.banCommunityMember({ spaceId: 'space', userId: 'member' }),
  ).rejects.toMatchObject({ code: 'BAN_MEMBER_DENIED' });
  expect(calls.every((c) => c.method === 'GET')).toBe(true);
});
it('blocks privilege escalation, same-rank edits, owner changes and self removal before mutation', async () => {
  const { client, calls } = fixture();
  await expect(
    client.setCommunityMemberRoles({ spaceId: 'space', userId: 'member', roleIds: ['higher'] }),
  ).rejects.toMatchObject({ code: 'NotElevated' });
  await expect(
    client.setCommunityMemberRoles({ spaceId: 'space', userId: 'peer', roleIds: [] }),
  ).rejects.toMatchObject({ code: 'NotElevated' });
  await expect(
    client.setCommunityMemberRoles({ spaceId: 'space', userId: 'owner', roleIds: [] }),
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    client.removeCommunityMember({ spaceId: 'space', userId: 'manager' }),
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    client.removeCommunityMember({ spaceId: 'space', userId: 'owner' }),
  ).rejects.toMatchObject({ status: 403 });
  expect(calls.every((c) => c.method === 'GET')).toBe(true);
});
it('preserves upstream final authorization rejection and does not emit successful mutation refresh', async () => {
  const { client } = fixture({ writeDenied: true });
  const events: any[] = [];
  client.subscribe((e) => events.push(e));
  await expect(
    client.setCommunityMemberRoles({ spaceId: 'space', userId: 'member', roleIds: [] }),
  ).rejects.toMatchObject({ status: 403, code: 'NotElevated' });
  expect(events).toEqual([]);
});
it('owner uses upstream bypass while hidden malformed member context fails closed', async () => {
  const { client, members } = fixture({ self: 'owner' });
  expect((await client.communityManagement('space')).roles.every((r) => r.assignable)).toBe(true);
  members[2].roles = 'manager';
  await expect(
    client.removeCommunityMember({ spaceId: 'space', userId: 'member' }),
  ).rejects.toMatchObject({ code: 'INVALID_MEMBER_RESPONSE' });
});
it.each(['logout', 'gateway'] as const)(
  'drops stale administrative response after %s even without cached channels',
  async (mode) => {
    let release!: () => void;
    let entered!: () => void;
    const waiting = new Promise<void>((r) => {
        release = r;
      }),
      started = new Promise<void>((r) => {
        entered = r;
      });
    const { client } = fixture({
      pauseMembers: async () => {
        entered();
        await waiting;
      },
    });
    const pending = client.communityManagement('space');
    await started;
    if (mode === 'logout') await client.disconnect();
    else
      await (client as any).processPacket({
        type: 'ServerRoleUpdate',
        id: 'space',
        role_id: 'manager',
        data: { permissions: { a: 0, d: 512 } },
      });
    release();
    await expect(pending).rejects.toMatchObject({
      code: mode === 'logout' ? 'SESSION_CHANGED' : 'ACCESS_CHANGED',
    });
  },
);

it('creates, renames/colors and deletes a role using pinned upstream routes', async () => {
  const { client, calls } = fixture({ self: 'owner' });
  const created = await client.changeCommunityRole({
    action: 'create',
    spaceId: 'space',
    name: 'Kanka',
  });
  expect(created.roleId).toBe('created');
  expect(created.management.roles.find((r) => r.id === 'created')).toMatchObject({
    name: 'Kanka',
    editable: true,
    permissionsEditable: true,
  });
  const edited = await client.changeCommunityRole({
    action: 'appearance',
    spaceId: 'space',
    roleId: created.roleId,
    name: 'Gece tayfası',
    color: '#9b8afb',
  });
  expect(edited.management.roles.find((r) => r.id === 'created')).toMatchObject({
    name: 'Gece tayfası',
    color: '#9b8afb',
  });
  const deleted = await client.changeCommunityRole({
    action: 'delete',
    spaceId: 'space',
    roleId: 'created',
  });
  expect(deleted.management.roles.some((r) => r.id === 'created')).toBe(false);
  expect(calls.filter((c) => c.method !== 'GET')).toEqual([
    { path: '/api/servers/space/roles', method: 'POST', body: { name: 'Kanka' } },
    {
      path: '/api/servers/space/roles/created',
      method: 'PATCH',
      body: { name: 'Gece tayfası', colour: '#9b8afb' },
    },
    { path: '/api/servers/space/roles/created', method: 'DELETE', body: null },
  ]);
});
it('saves allow/deny/inherit without truncating video or overwriting unexposed permission bits', async () => {
  const { client, server, calls } = fixture({ self: 'owner' });
  const extra = 2 ** 36,
    extraDeny = 2 ** 29;
  (server.roles as any).member.permissions = { a: extra + 2 ** 22, d: extraDeny + 2 ** 27 };
  const values = { ...inherited(), video: 'allow', send: 'deny' } as SocialRolePermissionValues;
  const result = await client.changeCommunityRole({
    action: 'permissions',
    spaceId: 'space',
    roleId: 'member',
    values,
  });
  expect(calls.find((c) => c.method === 'PUT')).toEqual({
    path: '/api/servers/space/permissions/member',
    method: 'PUT',
    body: { permissions: { allow: extra + 2 ** 32, deny: extraDeny + 2 ** 22 } },
  });
  expect(result.management.roles.find((r) => r.id === 'member')!.permissions).toEqual(values);
});
it('separates role appearance management from granting permissions and blocks rank escalation', async () => {
  const { client, calls } = fixture({ bits: 8 });
  await client.changeCommunityRole({ action: 'create', spaceId: 'space', name: 'Kanka' });
  await client.changeCommunityRole({
    action: 'appearance',
    spaceId: 'space',
    roleId: 'member',
    name: 'Kanka',
    color: null,
  });
  await expect(
    client.changeCommunityRole({
      action: 'permissions',
      spaceId: 'space',
      roleId: 'member',
      values: inherited(),
    }),
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    client.changeCommunityRole({ action: 'delete', spaceId: 'space', roleId: 'manager' }),
  ).rejects.toMatchObject({ code: 'NotElevated' });
  await expect(
    client.changeCommunityRole({
      action: 'appearance',
      spaceId: 'space',
      roleId: 'higher',
      name: 'Owner',
      color: null,
    }),
  ).rejects.toMatchObject({ code: 'NotElevated' });
  expect(calls.filter((c) => c.method !== 'GET')).toHaveLength(2);
});
it('cannot grant an unowned permission or clear a denial it cannot manage', async () => {
  const { client, calls, server } = fixture({ bits: 4 });
  await expect(
    client.changeCommunityRole({
      action: 'permissions',
      spaceId: 'space',
      roleId: 'member',
      values: { ...inherited(), manageRoles: 'allow' },
    }),
  ).rejects.toMatchObject({ code: 'CANNOT_GRANT_ROLE_PERMISSION' });
  (server.roles as any).member.permissions = { a: 0, d: 8 };
  await expect(
    client.changeCommunityRole({
      action: 'permissions',
      spaceId: 'space',
      roleId: 'member',
      values: inherited(),
    }),
  ).rejects.toMatchObject({ code: 'CANNOT_GRANT_ROLE_PERMISSION' });
  expect(calls.every((c) => c.method === 'GET')).toBe(true);
});
it.each([
  { action: 'create', spaceId: 'space', name: ' ' },
  { action: 'create', spaceId: 'space', name: 'x'.repeat(33) },
  {
    action: 'appearance',
    spaceId: 'space',
    roleId: 'member',
    name: 'Kanka',
    color: 'url(https://bad.example)',
  },
  {
    action: 'permissions',
    spaceId: 'space',
    roleId: 'member',
    values: { ...inherited(), invented: 'allow' },
  },
  { action: 'delete', spaceId: 'space', roleId: '../owner' },
])('validates role inputs before any request: %j', async (change) => {
  const { client, calls } = fixture({ self: 'owner' });
  await expect(client.changeCommunityRole(change as any)).rejects.toMatchObject({ status: 400 });
  expect(calls).toEqual([]);
});
it('preserves upstream refusal and does not report a role mutation as successful', async () => {
  const { client } = fixture({ self: 'owner', writeDenied: true });
  const events: unknown[] = [];
  client.subscribe((event) => events.push(event));
  await expect(
    client.changeCommunityRole({ action: 'create', spaceId: 'space', name: 'Kanka' }),
  ).rejects.toMatchObject({ status: 403 });
  expect(events).toEqual([]);
});
it('reports a successful write followed by a failed refresh without repeating the write', async () => {
  const { client, calls } = fixture({
    self: 'owner',
    pauseMembers: async () => {
      throw new Error('Read interrupted');
    },
  });
  await expect(
    client.changeCommunityRole({ action: 'create', spaceId: 'space', name: 'Kanka' }),
  ).rejects.toMatchObject({ code: 'ROLE_SAVED_REFRESH_FAILED' });
  expect(calls.filter((call) => call.method === 'POST')).toHaveLength(1);
});
it('retries the post-write read when its own gateway echo arrives mid-refresh', async () => {
  let client!: StoatClient;
  let echoed = false;
  const setup = fixture({
    self: 'owner',
    pauseMembers: async () => {
      if (echoed) return;
      echoed = true;
      await (client as any).processPacket({
        type: 'ServerRoleUpdate',
        id: 'space',
        role_id: 'member',
        data: { permissions: { a: 1, d: 0 } },
      });
    },
  });
  client = setup.client;
  const result = await client.changeCommunityRole({
    action: 'permissions',
    spaceId: 'space',
    roleId: 'member',
    values: { ...inherited(), view: 'allow' },
  });
  expect(result.management.access).toBe('allowed');
  expect(setup.calls.filter((call) => call.method === 'PUT')).toHaveLength(1);
});
it('asks the app to refresh only after the post-write read completes', async () => {
  const { client, calls } = fixture({ self: 'owner' });
  const order: string[] = [];
  client.subscribe((event) => {
    if (event.type === 'SOCIAL_REFRESH') order.push(`refresh after ${calls.length} requests`);
  });
  await client.setCommunityMemberRoles({ spaceId: 'space', userId: 'member', roleIds: [] });
  const lastMembersRead = calls.map((call) => call.path).lastIndexOf('/api/servers/space/members');
  expect(order).toEqual([`refresh after ${calls.length} requests`]);
  expect(lastMembersRead).toBe(calls.length - 1);
});
