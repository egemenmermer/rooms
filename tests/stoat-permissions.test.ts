import { describe, it, expect } from 'vitest';
import {
  stoatChannelPermissions,
  stoatCommunityAdmin,
  StoatPermissions as P,
} from '../apps/services/access/stoat-permissions';
import { ulidTimestamp, validateInstanceUrl } from '@rooms/stoat';
const base = {
  _id: 'server',
  owner: 'owner',
  default_permissions: String(P.VIEW_CHANNEL | P.CONNECT | P.SPEAK | P.VIDEO | P.LISTEN),
  roles: {},
};
const channel = { _id: 'channel', server: 'server', channel_type: 'TextChannel', voice: {} };
const member = { _id: { server: 'server', user: 'friend' }, roles: [] };
describe('Stoat permission boundaries', () => {
  it('requires exact server and member identity even for owner', () => {
    expect(stoatChannelPermissions(base, { ...channel, server: 'other' }, member, 'owner')).toBe(
      0n,
    );
    expect(stoatChannelPermissions(base, channel, member, 'stranger')).toBe(0n);
  });
  it('uses ranked Stoat role overrides, with smaller ranks taking precedence', () => {
    const s = {
      ...base,
      roles: {
        low: { rank: 10, permissions: { d: String(P.SPEAK) } },
        high: { rank: 1, permissions: { a: String(P.SPEAK) } },
      },
    };
    expect(
      stoatChannelPermissions(s, channel, { ...member, roles: ['high', 'low'] }, 'friend') &
        P.SPEAK,
    ).toBe(P.SPEAK);
  });
  it('applies channel roles after server roles and removes all on view denial', () => {
    const s = { ...base, roles: { role: { rank: 1, permissions: { a: String(P.SPEAK) } } } };
    expect(
      stoatChannelPermissions(
        s,
        { ...channel, role_permissions: { role: { d: String(P.SPEAK) } } },
        { ...member, roles: ['role'] },
        'friend',
      ) & P.SPEAK,
    ).toBe(0n);
    expect(
      stoatChannelPermissions(
        base,
        { ...channel, default_permissions: { d: String(P.VIEW_CHANNEL) } },
        member,
        'friend',
      ),
    ).toBe(0n);
  });
  it('fails closed when equal-ranked roles conflict regardless of member role order', () => {
    const server = {
      ...base,
      roles: {
        allow: { rank: 1, permissions: { a: String(P.SPEAK) } },
        deny: { rank: 1, permissions: { d: String(P.SPEAK) } },
      },
    };
    for (const roles of [
      ['allow', 'deny'],
      ['deny', 'allow'],
    ])
      expect(
        stoatChannelPermissions(server, channel, { ...member, roles }, 'friend') & P.SPEAK,
      ).toBe(0n);
  });
  it('enforces moderator mute, deafen and timeout', () => {
    const muted = stoatChannelPermissions(
      base,
      channel,
      { ...member, can_publish: false, can_receive: false },
      'friend',
    );
    expect(muted & (P.SPEAK | P.VIDEO | P.LISTEN)).toBe(0n);
    const timed = stoatChannelPermissions(
      base,
      channel,
      { ...member, timeout: new Date(Date.now() + 60000).toISOString() },
      'friend',
    );
    expect(timed & P.CONNECT).toBe(0n);
  });
  it('rejects unsafe numerical permission precision', () => {
    expect(() =>
      stoatChannelPermissions(
        { ...base, default_permissions: Number.MAX_SAFE_INTEGER + 1 },
        channel,
        member,
        'friend',
      ),
    ).toThrow();
  });
});
describe('Stoat opaque IDs and origin policy', () => {
  it('derives message time from real ULID without invented timestamps', () => {
    expect(ulidTimestamp('01ARZ3NDEKTSV4RRFFQ69G5FAV')).toBe('2016-07-30T23:54:10.259Z');
    expect(() => ulidTimestamp('12345')).toThrow();
  });
  it('allows official self-host API prefix and denies credentials, cleartext public origins and arbitrary paths', () => {
    expect(validateInstanceUrl('https://rooms.example/api/')).toBe('https://rooms.example/api');
    expect(validateInstanceUrl('http://127.0.0.1:3021')).toBe('http://127.0.0.1:3021');
    for (const url of [
      'http://example.com',
      'https://a:b@example.com/api',
      'https://example.com/private',
      'https://example.com?token=secret',
    ])
      expect(() => validateInstanceUrl(url)).toThrow();
  });
});

it('applies channel default before server role allows, and channel role denial last', () => {
  const s = {
    ...base,
    roles: { member: { rank: 1, permissions: { a: String(P.VIEW_CHANNEL | P.CONNECT) } } },
  };
  const m = { ...member, roles: ['member'] };
  const c = { ...channel, default_permissions: { d: String(P.VIEW_CHANNEL | P.CONNECT) } };
  expect(stoatChannelPermissions(s, c, m, 'friend') & (P.VIEW_CHANNEL | P.CONNECT)).toBe(
    P.VIEW_CHANNEL | P.CONNECT,
  );
  expect(
    stoatChannelPermissions(
      s,
      { ...c, role_permissions: { member: { d: String(P.VIEW_CHANNEL) } } },
      m,
      'friend',
    ),
  ).toBe(0n);
});
it('does not interpret ManageRole or untrusted privileged fields as administrator bypass', () => {
  const s = { ...base, default_permissions: '8' };
  expect(
    stoatChannelPermissions(s, channel, { ...member, privileged: true } as any, 'friend'),
  ).toBe(0n);
  expect(
    stoatChannelPermissions(
      base,
      channel,
      { ...member, _id: { server: 'server', user: 'owner' } },
      'owner',
    ),
  ).toBe(P.ALL);
  expect(
    stoatChannelPermissions(base, { ...channel, channel_type: 'Group' }, member, 'friend'),
  ).toBe(0n);
});
it('rejects malformed permissions and moderation metadata rather than broadening a grant', () => {
  for (const value of ['', ' ', '-1', '0x100000', '1e6', String(1n << 52n), -1, NaN, true])
    expect(() =>
      stoatChannelPermissions(
        { ...base, default_permissions: value } as any,
        channel,
        member,
        'friend',
      ),
    ).toThrow();
  for (const patch of [
    { roles: 'role' },
    { roles: [3] },
    { timeout: 'not-a-date' },
    { can_publish: 'false' },
    { can_receive: 0 },
  ])
    expect(() =>
      stoatChannelPermissions(base, channel, { ...member, ...patch } as any, 'friend'),
    ).toThrow();
});
it('equal-rank channel conflicts fail closed for both response object orders', () => {
  const roles = { allow: { rank: 1, permissions: {} }, deny: { rank: 1, permissions: {} } };
  const s = { ...base, roles };
  const m = { ...member, roles: ['allow', 'deny'] };
  for (const overrides of [
    { allow: { a: String(P.CONNECT) }, deny: { d: String(P.CONNECT) } },
    { deny: { d: String(P.CONNECT) }, allow: { a: String(P.CONNECT) } },
  ])
    expect(
      stoatChannelPermissions(s, { ...channel, role_permissions: overrides }, m, 'friend') &
        P.CONNECT,
    ).toBe(0n);
});

it('classifies malformed authorization as an explicit denial for existing SFU sweep removal', () => {
  try {
    stoatChannelPermissions({ ...base, default_permissions: 'invalid' }, channel, member, 'friend');
    throw new Error('expected rejection');
  } catch (error) {
    expect(error).toMatchObject({ status: 403, code: 'INVALID_PERMISSION_CONTEXT' });
  }
});

it('classifies malformed nested override and role objects as typed denial', () => {
  for (const patch of [{ default_permissions: 'invalid' }, { role_permissions: { r: [] } }]) {
    const server = { ...base, roles: { r: { rank: 1, permissions: {} } } };
    try {
      stoatChannelPermissions(
        server,
        { ...channel, ...patch } as any,
        { ...member, roles: ['r'] },
        'friend',
      );
      throw new Error('expected denial');
    } catch (error) {
      expect(error).toMatchObject({ status: 403 });
    }
  }
});

describe('owner-equivalent community admins', () => {
  const server = {
    ...base,
    roles: {
      developer: { rank: 0, permissions: { a: String(P.ALL), d: '0' } },
      moderator: { rank: 1, permissions: { a: String(P.ALL & ~P.MOVE_MEMBERS), d: '0' } },
      muted: { rank: 0, permissions: { a: '0', d: String(P.SPEAK) } },
    },
  };
  const as = (roles: string[], extra = {}) => ({ ...member, roles, ...extra });
  it('counts the owner and a member whose roles grant every permission', () => {
    expect(stoatCommunityAdmin(server, null, 'owner')).toBe(true);
    expect(stoatCommunityAdmin(server, as(['developer']), 'friend')).toBe(true);
  });
  it('refuses anything short of every permission', () => {
    expect(stoatCommunityAdmin(server, as([]), 'friend')).toBe(false);
    expect(stoatCommunityAdmin(server, as(['moderator']), 'friend')).toBe(false);
    // An equal-ranked denial wins, as in channel permissions.
    expect(stoatCommunityAdmin(server, as(['developer', 'muted']), 'friend')).toBe(false);
  });
  it('refuses timed-out, mismatched or malformed memberships', () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    expect(stoatCommunityAdmin(server, as(['developer'], { timeout: future }), 'friend')).toBe(
      false,
    );
    expect(stoatCommunityAdmin(server, as(['developer']), 'stranger')).toBe(false);
    expect(stoatCommunityAdmin({ ...server, _id: 'other' }, as(['developer']), 'friend')).toBe(
      false,
    );
    expect(
      stoatCommunityAdmin(
        { ...server, roles: { developer: { rank: 0, permissions: { a: '-1' } } } },
        as(['developer']),
        'friend',
      ),
    ).toBe(false);
    expect(stoatCommunityAdmin(server, null, 'friend')).toBe(false);
  });
});
