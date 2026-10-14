import { describe, it, expect } from 'vitest';
import { effectivePermissions, Permissions } from '../apps/services/access/permissions';
import { createAccessServer } from '../apps/services/access/server';
describe('room authorization', () => {
  const base = {
    userId: 'user',
    guildId: 'guild',
    ownerId: 'owner',
    memberRoles: ['member'],
    roles: [
      { id: 'guild', permissions: String(Permissions.VIEW_CHANNEL | Permissions.CONNECT) },
      { id: 'member', permissions: String(Permissions.SPEAK) },
    ],
    overwrites: [],
  };
  it('applies role denies then explicit member allowance', () => {
    const permissions = effectivePermissions({
      ...base,
      overwrites: [
        { id: 'member', type: 0, allow: '0', deny: String(Permissions.CONNECT) },
        {
          id: 'user',
          type: 1,
          allow: String(Permissions.CONNECT),
          deny: String(Permissions.SPEAK),
        },
      ],
    });
    expect(permissions & Permissions.CONNECT).not.toBe(0n);
    expect(permissions & Permissions.SPEAK).toBe(0n);
  });
  it('honors channel-wide view denial and owner override', () => {
    const denied = {
      ...base,
      overwrites: [{ id: 'guild', type: 0, allow: '0', deny: String(Permissions.VIEW_CHANNEL) }],
    };
    expect(effectivePermissions(denied) & Permissions.VIEW_CHANNEL).toBe(0n);
    expect(
      effectivePermissions({ ...denied, userId: 'owner' }) & Permissions.VIEW_CHANNEL,
    ).not.toBe(0n);
  });
  it('rejects missing credentials and malformed IDs before upstream calls', async () => {
    const server = await createAccessServer({
      spacebarUrl: 'http://127.0.0.1:3999',
      livekitUrl: 'http://127.0.0.1:7999',
      publicLivekitUrl: 'ws://127.0.0.1:7999',
      apiKey: 'test',
      apiSecret: 'test-secret-key-at-least-32-characters',
    });
    try {
      const noAuth = await server.inject({
        method: 'POST',
        url: '/v1/media/grant',
        payload: { channelId: '123456' },
      });
      expect(noAuth.statusCode).toBe(401);
      const arbitrary = await server.inject({
        method: 'POST',
        url: '/v1/media/grant',
        headers: { authorization: 'no-secret' },
        payload: { channelId: '../../secret' },
      });
      expect(arbitrary.statusCode).toBe(400);
      const openRegistration = await server.inject({
        method: 'POST',
        url: '/api/v9/auth/register',
        payload: {
          email: 'local@example.test',
          password: 'safe-test-password',
          username: 'local',
          consent: true,
        },
      });
      expect(openRegistration.statusCode).toBe(400);
    } finally {
      await server.close();
    }
  });
});
