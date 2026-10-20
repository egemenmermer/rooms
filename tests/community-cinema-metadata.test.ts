import { describe, expect, it, vi } from 'vitest';
import { TitleMetadata } from '../apps/services/cinema/metadata';

const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });

function setup(routes: (url: URL, headers: Record<string, string>) => Response) {
  const calls: { url: URL; headers: Record<string, string> }[] = [];
  const fetch = vi.fn(async (url: string, init: { headers: Record<string, string> }) => {
    const parsed = new URL(url);
    calls.push({ url: parsed, headers: init.headers });
    return routes(parsed, init.headers);
  });
  let now = Date.UTC(2026, 9, 20, 9);
  const metadata = new TitleMetadata({ userAgent: 'test', fetch, now: () => now });
  return { metadata, calls, advance: (ms: number) => (now += ms) };
}

describe('title metadata', () => {
  it('finds IMDb ids through Wikidata without a key and remembers them', async () => {
    const s = setup((url) => {
      expect(url.host).toBe('query.wikidata.org');
      const query = url.searchParams.get('query')!;
      if (query.includes('P4947 "550"'))
        return json({ results: { bindings: [{ imdb: { value: 'tt0137523' } }] } });
      if (query.includes('P4983 "1396"'))
        return json({ results: { bindings: [{ imdb: { value: 'tt0903747' } }] } });
      return json({ results: { bindings: [] } });
    });
    expect(await s.metadata.imdbId('movie', 550, null)).toBe('tt0137523');
    expect(await s.metadata.imdbId('series', 1396, null)).toBe('tt0903747');
    expect(await s.metadata.imdbId('movie', 9, null)).toBeNull();
    await s.metadata.imdbId('movie', 550, null);
    expect(s.calls).toHaveLength(3);
  });

  it('asks TMDB first with a key (v3 in the query, v4 as a bearer token)', async () => {
    const s = setup((url) => {
      if (url.host === 'api.themoviedb.org' && url.pathname === '/3/tv/1396/external_ids')
        return json({ imdb_id: 'tt0903747' });
      if (url.pathname === '/3/movie/550/external_ids') return json({ imdb_id: null });
      return json({ results: { bindings: [{ imdb: { value: 'tt0137523' } }] } });
    });
    expect(await s.metadata.imdbId('series', 1396, 'a'.repeat(32))).toBe('tt0903747');
    expect(s.calls[0]!.url.searchParams.get('api_key')).toBe('a'.repeat(32));
    // TMDB without an IMDb id: Wikidata may still have it.
    expect(await s.metadata.imdbId('movie', 550, 'eyJhbGciOi.payload.signature')).toBe('tt0137523');
    expect(s.calls[1]!.headers.Authorization).toBe('Bearer eyJhbGciOi.payload.signature');
    expect(s.calls[1]!.url.searchParams.has('api_key')).toBe(false);
  });

  it('rejects a key TMDB refuses and reads the next episode while it is ahead', async () => {
    const s = setup((url) => {
      if (url.pathname === '/3/configuration')
        return url.searchParams.get('api_key') === 'b'.repeat(32) ? json({}) : json({}, 401);
      if (url.pathname === '/3/tv/77')
        return json({
          next_episode_to_air: {
            air_date: '2026-12-08',
            season_number: 2,
            episode_number: 1,
            name: 'Dönüş',
          },
        });
      return json({ next_episode_to_air: null });
    });
    await expect(s.metadata.verify('c'.repeat(32))).rejects.toThrow('CINEMA_METADATA_KEY_INVALID');
    await expect(s.metadata.verify('kısa')).rejects.toThrow('CINEMA_METADATA_KEY_INVALID');
    await s.metadata.verify('b'.repeat(32));
    expect(await s.metadata.nextAiring(77, 'b'.repeat(32))).toEqual({
      season: 2,
      episode: 1,
      title: 'Dönüş',
      airDate: Date.UTC(2026, 11, 8, 12),
    });
    expect(await s.metadata.nextAiring(78, 'b'.repeat(32))).toBeNull();
    // Long past the air date, without a new answer, it is no longer announced.
    s.advance(60 * 86_400_000);
    expect(await s.metadata.nextAiring(77, 'b'.repeat(32))).toBeNull();
  });
});
