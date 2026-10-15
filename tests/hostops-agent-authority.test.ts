import { expect, it } from 'vitest';
import { createHostOpsServer } from '../apps/services/hostops/server';
import { HostOpsStore } from '../apps/services/hostops/store';
it('requires server credentials, a current member and a distinct host Agent grant', async () => {
  const store = new HostOpsStore(':memory:');
  let member = true;
  let roomVisible = true;
  const key = 'a'.repeat(64);
  const app = createHostOpsServer({
    hosts: [
      {
        id: 'core',
        physicalHostId: 'primary',
        label: 'Core',
        mode: 'shared',
        communityId: 'space',
        ownerProfileId: null,
        agentAvailable: false,
      },
    ],
    store,
    identify: async (token) => ({ userId: token, owner: token === 'owner' }),
    internalAgent: {
      key,
      visibleRooms: async () => (roomVisible ? ['room', 'unrequested'] : []),
      identifyUser: async (userId) => {
        if (!member) throw Error('Membership revoked');
        return { userId, owner: userId === 'owner' };
      },
    },
  });
  const check = (userId: string, token = key) =>
    app.inject({
      method: 'POST',
      url: '/internal/agent-authority',
      headers: { authorization: `Bearer ${token}` },
      payload: { hostId: 'core', userId, roomIds: ['room'] },
    });
  try {
    expect((await check('owner', 'renderer-token')).statusCode).toBe(403);
    expect((await check('owner')).json()).toEqual({ allowed: true, roomIds: ['room'] });
    expect((await check('operator')).json()).toEqual({ allowed: false, roomIds: [] });
    await app.inject({
      method: 'PUT',
      url: '/v1/hosts/core/operators',
      headers: { authorization: 'owner' },
      payload: { userId: 'operator', permissions: ['monitor'], profileId: null },
    });
    expect((await check('operator')).json()).toEqual({ allowed: false, roomIds: [] });
    await app.inject({
      method: 'PUT',
      url: '/v1/hosts/core/operators',
      headers: { authorization: 'owner' },
      payload: { userId: 'operator', permissions: ['agent'], profileId: null },
    });
    expect((await check('operator')).json()).toEqual({ allowed: true, roomIds: ['room'] });
    roomVisible = false;
    expect((await check('operator')).json()).toEqual({ allowed: true, roomIds: [] });
    member = false;
    expect((await check('operator')).statusCode).not.toBe(200);
  } finally {
    await app.close();
  }
});
