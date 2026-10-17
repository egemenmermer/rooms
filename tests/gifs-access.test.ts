import Fastify from 'fastify';
import { expect, it, vi } from 'vitest';
import { StoatError } from '@rooms/stoat';
import { registerGifs } from '../apps/services/access/gifs';

const gif = (id: number, host = 'static.klipy.com') => ({
  id,
  slug: `gif-${id}`,
  title: `GIF ${id}`,
  file: {
    sm: { webp: { url: `https://${host}/sm/${id}.webp`, width: 220, height: 160, size: 9 } },
    md: { gif: { url: `https://${host}/md/${id}.gif`, width: 498, height: 360, size: 99 } },
  },
});
async function service(key?: string) {
  const request = vi.fn(async (_url: URL) =>
    Response.json({
      result: true,
      data: { data: [gif(1), gif(2, 'evil.example'), { broken: true }], has_next: true },
    }),
  );
  const server = Fastify();
  server.setErrorHandler((error, _req, reply) =>
    error instanceof StoatError
      ? reply.code(error.status).send({ error: error.code })
      : reply.code(400).send({ error: 'INVALID_INPUT' }),
  );
  registerGifs(server, {
    key,
    request: request as unknown as typeof fetch,
    user: async (authorization) => {
      if (authorization !== 'session') throw new StoatError(401, 'SIGN_IN_REQUIRED');
      return 'user-1';
    },
  });
  return { server, request };
}

it('searches KLIPY with the server key and passes only its own CDN media', async () => {
  const { server, request } = await service('server-key');
  const result = await server.inject({
    url: '/v1/gifs?q=merhaba',
    headers: { authorization: 'session' },
  });
  expect(result.json()).toEqual({
    items: [
      {
        id: '1',
        title: 'GIF 1',
        preview: { url: 'https://static.klipy.com/sm/1.webp', width: 220, height: 160 },
        gif: { url: 'https://static.klipy.com/md/1.gif', width: 498, height: 360 },
      },
    ],
    more: true,
  });
  const url = request.mock.calls[0]![0];
  expect(url.pathname).toBe('/api/v1/server-key/gifs/search');
  expect(url.searchParams.get('q')).toBe('merhaba');
  // A stable hashed customer id, never the account id.
  expect(url.searchParams.get('customer_id')).toMatch(/^[a-f0-9]{32}$/);
  expect(url.href).not.toContain('user-1');
  expect(JSON.stringify(result.json())).not.toContain('server-key');
  // Repeating the same query is served from the cache.
  await server.inject({ url: '/v1/gifs?q=MERHABA', headers: { authorization: 'session' } });
  expect(request).toHaveBeenCalledTimes(1);
  await server.inject({ url: '/v1/gifs', headers: { authorization: 'session' } });
  expect(request.mock.calls[1]![0].pathname).toBe('/api/v1/server-key/gifs/trending');
});

it('needs a session, and says so when no KLIPY key is configured', async () => {
  const unconfigured = await service();
  expect((await unconfigured.server.inject({ url: '/v1/gifs' })).statusCode).toBe(401);
  const result = await unconfigured.server.inject({
    url: '/v1/gifs',
    headers: { authorization: 'session' },
  });
  expect(result.json()).toEqual({ error: 'GIFS_NOT_CONFIGURED' });
  expect(unconfigured.request).not.toHaveBeenCalled();
  const configured = await service('k');
  expect(
    (
      await configured.server.inject({
        url: '/v1/gifs?page=99',
        headers: { authorization: 'session' },
      })
    ).statusCode,
  ).toBe(400);
});
