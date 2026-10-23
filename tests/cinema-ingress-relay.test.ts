import { expect, it } from 'vitest';
import { createCinemaServer } from '../apps/services/cinema/server';

it('keeps relay files out of the per-address ingress budget', async () => {
  const server = await createCinemaServer({
    service: {} as never,
    configs: { get: () => ({ hallChannelId: null }) } as never,
    authority: { close: async () => {} } as never,
    registerRelay: (instance) => {
      instance.get('/v1/relay/*', async () => 'segment');
    },
  });
  try {
    const statuses = new Set<number>();
    for (let i = 0; i < 1300; i++)
      statuses.add(
        (
          await server.inject({
            url: `/v1/relay/ticket-${i % 20}/seg${String(i).padStart(6, '0')}.m4s`,
            headers: { 'x-forwarded-for': '203.0.113.5' },
            remoteAddress: '172.18.0.2',
          })
        ).statusCode,
      );
    expect([...statuses]).toEqual([200]);
    const health = await server.inject({
      url: '/health',
      headers: { 'x-forwarded-for': '203.0.113.5' },
      remoteAddress: '172.18.0.2',
    });
    expect(health.statusCode).toBe(200);
  } finally {
    await server.close();
  }
});
