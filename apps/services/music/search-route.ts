import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { musicSearchQuerySchema } from '../../../packages/shared-contracts/src/music';
import { searchYouTube } from './youtube-source';

export function registerMusicSearch(
  server: FastifyInstance,
  search: typeof searchYouTube = searchYouTube,
) {
  server.post('/v1/search', async (request, reply) => {
    try {
      const body = z.object({ query: musicSearchQuerySchema }).strict().parse(request.body);
      return await search(body.query);
    } catch (error) {
      const code =
        error instanceof Error && /^MUSIC_[A-Z_]+$/.test(error.message)
          ? error.message
          : 'MUSIC_SEARCH_UNAVAILABLE';
      return reply.code(400).send({ error: code });
    }
  });
}
