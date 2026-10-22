import { describe, it, expect } from 'vitest';
import { createActivityServer } from '../apps/services/activities/server';
import { MemoryActivityRepository } from '../apps/services/activities/repository';
import { ActivityError } from '../apps/services/activities/engine';
import { StoatError } from '@rooms/stoat';

describe('Activity proxy and authenticated-user rate boundaries', () => {
  it('preserves upstream authorization rejection without leaking details or reporting a service outage', async () => {
    const app = await createActivityServer({
      repository: new MemoryActivityRepository(),
      authorize: async (token) => {
        throw new StoatError(Number(token), 'DO_NOT_LEAK_PRIVATE_DETAIL');
      },
    });
    try {
      for (const [status, code] of [
        [401, 'SESSION_EXPIRED'],
        [403, 'ROOM_ACCESS_DENIED'],
        [404, 'ROOM_UNAVAILABLE'],
        [429, 'RATE_LIMITED'],
        [500, 'ACTIVITY_SERVICE_UNAVAILABLE'],
      ] as const) {
        const r = await app.inject({
          url: '/v1/rooms/private/activity',
          headers: { authorization: `Bearer ${status}` },
        });
        expect(r.statusCode).toBe(status === 500 ? 503 : status);
        expect(r.json()).toEqual({ error: code });
      }
    } finally {
      await app.close();
    }
  });
  it('isolates users sharing the proxy but aggregates rooms and rotated sessions of the same user', async () => {
    const app = await createActivityServer({
      repository: new MemoryActivityRepository(),
      rateLimits: { ingressPerMinute: 20, identityPerMinute: 2 },
      authorize: async (token) => ({
        userId: token.startsWith('alice') ? 'alice' : 'bob',
        displayName: 'QA',
        canControl: true,
        canCreate: true,
      }),
    });
    const read = (token: string, room = 'first') =>
      app.inject({
        url: `/v1/rooms/${room}/activity`,
        headers: {
          authorization: `Bearer ${token}`,
          'x-forwarded-for': '203.0.113.1',
          'x-user-id': 'spoofed',
        },
      });
    try {
      expect((await read('alice-one')).statusCode).toBe(200);
      expect((await read('alice-two', 'second')).statusCode).toBe(200);
      expect((await read('alice-three', 'third')).statusCode).toBe(429);
      expect((await read('bob-one')).statusCode).toBe(200);
      expect((await read('bob-two')).statusCode).toBe(200);
      expect((await read('bob-three')).statusCode).toBe(429);
    } finally {
      await app.close();
    }
  });
  it('bounds unauthenticated ingress despite changing bearer and forwarded headers, without charging an authorized identity', async () => {
    let checks = 0;
    const app = await createActivityServer({
      repository: new MemoryActivityRepository(),
      rateLimits: { ingressPerMinute: 3, identityPerMinute: 1 },
      authorize: async (token) => {
        checks++;
        if (token !== 'valid') throw new ActivityError(403, 'ROOM_ACCESS_DENIED');
        return { userId: 'alice', displayName: 'QA', canControl: true, canCreate: true };
      },
    });
    // A client that is not the reverse proxy: its forwarded header must not pick the bucket.
    const read = (token: string) =>
      app.inject({
        url: '/v1/rooms/private/activity',
        remoteAddress: '203.0.113.5',
        headers: {
          authorization: `Bearer ${token}`,
          'x-forwarded-for': token,
          'x-user-id': 'alice',
        },
      });
    try {
      expect((await read('invalid-one')).statusCode).toBe(403);
      expect((await read('valid')).statusCode).toBe(200);
      expect((await read('invalid-two')).statusCode).toBe(403);
      expect((await read('invalid-three')).statusCode).toBe(429);
      expect(checks).toBe(3);
    } finally {
      await app.close();
    }
  });
});
