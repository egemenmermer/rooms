import { expect, it } from 'vitest';
import Fastify from 'fastify';
import { registerYouTubePlayer } from '../apps/services/activities/youtube-player';
const nonce = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
it('serves a visible official playlist player with bounded results and nonce commands', async () => {
  const server = Fastify();
  registerYouTubePlayer(server);
  try {
    const response = await server.inject(`/player/youtube?playlistId=PLabcdefgh123&nonce=${nonce}`);
    expect(response.statusCode).toBe(200);
    expect(response.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(response.body).toContain('player.cuePlaylist');
    expect(response.body).toContain('ids.slice(0,101)');
    expect(response.body).toContain('event.source!==parent');
    expect(response.body).toContain('data.nonce!==nonce');
    expect(response.body).toContain('player.setVolume');
  } finally {
    await server.close();
  }
});
it('keeps existing video URLs compatible and rejects mixed or invalid requests', async () => {
  const server = Fastify();
  registerYouTubePlayer(server);
  try {
    expect(
      (await server.inject(`/player/youtube?videoId=PgHzDZJwGW8&nonce=${nonce}`)).statusCode,
    ).toBe(200);
    for (const query of [
      `videoId=PgHzDZJwGW8&playlistId=PLabcdefgh123&nonce=${nonce}`,
      `playlistId=https://private.test&nonce=${nonce}`,
      `nonce=${nonce}`,
    ])
      expect((await server.inject('/player/youtube?' + query)).statusCode).toBe(400);
  } finally {
    await server.close();
  }
});
