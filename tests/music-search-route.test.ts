import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { registerMusicSearch } from '../apps/services/music/search-route';

describe('music service search HTTP contract', () => {
  it('accepts the actual client query without requiring unrelated error metadata', async () => {
    const server = Fastify();
    const results = [{ id: 'abcdefghijk', title: 'Example recording', durationSec: 180 }];
    const search = vi.fn(async () => results);
    registerMusicSearch(server, search);
    try {
      const result = await server.inject({
        method: 'POST',
        url: '/v1/search',
        payload: { query: 'Example recording' },
      });
      expect(result.statusCode).toBe(200);
      expect(result.json()).toEqual(results);
      expect(search).toHaveBeenCalledWith('Example recording');
      const invalid = await server.inject({
        method: 'POST',
        url: '/v1/search',
        payload: { query: 'Example', unexpected: true },
      });
      expect(invalid.statusCode).toBe(400);
      expect(search).toHaveBeenCalledTimes(1);
    } finally {
      await server.close();
    }
  });
  it('retains a classified provider failure without exposing raw diagnostics', async () => {
    const server = Fastify();
    registerMusicSearch(server, async () => {
      throw new Error('MUSIC_SOURCE_ACCESS_RESTRICTED');
    });
    try {
      const result = await server.inject({
        method: 'POST',
        url: '/v1/search',
        payload: { query: 'Example recording' },
      });
      expect(result.statusCode).toBe(400);
      expect(result.json()).toEqual({ error: 'MUSIC_SOURCE_ACCESS_RESTRICTED' });
    } finally {
      await server.close();
    }
  });
});
