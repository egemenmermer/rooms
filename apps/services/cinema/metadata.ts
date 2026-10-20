import { limitedText, privateFetch } from '../../../packages/personal-media/src/network';
import { CinemaError } from './importer';

type Fetcher = (
  url: string,
  init: { headers: Record<string, string>; signal: AbortSignal },
) => Promise<Response>;

const TMDB = 'https://api.themoviedb.org/3';
const WIKIDATA = 'https://query.wikidata.org/sparql';
const MB = 1024 * 1024;
const DAY_MS = 86_400_000;
const MISS_MS = 5 * 60_000;
const CACHE_MAX = 2000;

/** A TMDB v3 API key (32 hex) or a v4 read access token (a JWT). */
export const TMDB_KEY_PATTERN = /^[A-Za-z0-9._-]{20,1024}$/;
const IMDB_ID = /^tt\d{5,10}$/;

export type NextAiring = {
  season: number;
  episode: number;
  title: string | null;
  /** The air day at 12:00 UTC. */
  airDate: number;
};

const fail = (code: string): never => {
  throw new CinemaError(code);
};

/**
 * Title facts the IPTV panel lacks, fetched only when someone needs them: the IMDb id behind a
 * TMDB id (TMDB with the owner's own key, otherwise Wikidata, which needs none) and, with a
 * key, when a series' next episode airs. Keys never reach logs or clients; every request goes
 * through privateFetch.
 */
export class TitleMetadata {
  private readonly fetcher: Fetcher;
  private readonly cache = new Map<string, { value: unknown; until: number }>();

  constructor(
    private readonly options: { userAgent: string; fetch?: Fetcher; now?: () => number },
  ) {
    this.fetcher = options.fetch ?? ((url, init) => privateFetch(url, init));
  }

  private now() {
    return this.options.now?.() ?? Date.now();
  }

  private async remember<T>(key: string, hitMs: number, read: () => Promise<T | null>) {
    const hit = this.cache.get(key);
    if (hit && hit.until > this.now()) return hit.value as T | null;
    const value = await read();
    this.cache.delete(key);
    this.cache.set(key, { value, until: this.now() + (value === null ? MISS_MS : hitMs) });
    while (this.cache.size > CACHE_MAX) this.cache.delete(this.cache.keys().next().value!);
    return value;
  }

  private async json(url: string, headers: Record<string, string> = {}) {
    let response: Response;
    try {
      response = await this.fetcher(url, {
        headers: { 'User-Agent': this.options.userAgent, Accept: 'application/json', ...headers },
        signal: AbortSignal.timeout(8000),
      });
    } catch {
      return fail('CINEMA_METADATA_UNAVAILABLE');
    }
    if (response.status === 401) {
      await response.body?.cancel();
      return fail('CINEMA_METADATA_KEY_INVALID');
    }
    if (response.status === 404) {
      await response.body?.cancel();
      return null;
    }
    if (!response.ok) {
      await response.body?.cancel();
      return fail('CINEMA_METADATA_UNAVAILABLE');
    }
    try {
      return JSON.parse(await limitedText(response, 2 * MB)) as Record<string, unknown>;
    } catch {
      return fail('CINEMA_METADATA_UNAVAILABLE');
    }
  }

  private tmdb(key: string, path: string) {
    const url = new URL(`${TMDB}${path}`);
    // A v4 token goes in the header; a v3 key in the query.
    const bearer = key.includes('.');
    if (!bearer) url.searchParams.set('api_key', key);
    return this.json(url.href, bearer ? { Authorization: `Bearer ${key}` } : {});
  }

  /** Throws CINEMA_METADATA_KEY_INVALID for a key TMDB refuses. */
  async verify(key: string) {
    if (!TMDB_KEY_PATTERN.test(key)) fail('CINEMA_METADATA_KEY_INVALID');
    await this.tmdb(key, '/configuration');
  }

  /** The IMDb id (`tt…`) of a film or series, or null when no source knows it. */
  imdbId(kind: 'movie' | 'series', tmdbId: number, key: string | null) {
    return this.remember(`imdb:${kind}:${tmdbId}:${key ? 'k' : '-'}`, DAY_MS, async () => {
      if (key) {
        const ids = await this.tmdb(
          key,
          `/${kind === 'movie' ? 'movie' : 'tv'}/${tmdbId}/external_ids`,
        ).catch(() => null);
        const id = ids?.imdb_id;
        if (typeof id === 'string' && IMDB_ID.test(id)) return id;
      }
      // Wikidata: P4947 = TMDB movie id, P4983 = TMDB TV series id, P345 = IMDb id.
      const property = kind === 'movie' ? 'P4947' : 'P4983';
      const query = `SELECT ?imdb WHERE { ?item wdt:${property} "${tmdbId}"; wdt:P345 ?imdb } LIMIT 1`;
      const body = await this.json(`${WIKIDATA}?format=json&query=${encodeURIComponent(query)}`, {
        Accept: 'application/sparql-results+json',
      });
      const bindings = (
        body?.results as { bindings?: { imdb?: { value?: unknown } }[] } | undefined
      )?.bindings;
      const id = bindings?.[0]?.imdb?.value;
      return typeof id === 'string' && IMDB_ID.test(id) ? id : null;
    });
  }

  /** With a key: a series' next announced episode, while its air date is ahead. */
  async nextAiring(tmdbId: number, key: string): Promise<NextAiring | null> {
    const value = await this.remember(`next:${tmdbId}`, 12 * 3_600_000, async () => {
      const show = await this.tmdb(key, `/tv/${tmdbId}`);
      const next = show?.next_episode_to_air as Record<string, unknown> | null | undefined;
      const match =
        typeof next?.air_date === 'string' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(next.air_date) : null;
      const season = Number(next?.season_number);
      const episode = Number(next?.episode_number);
      if (!match || !Number.isInteger(season) || !Number.isInteger(episode) || episode < 1)
        return null;
      return {
        season,
        episode,
        title:
          typeof next?.name === 'string' && next.name.trim()
            ? next.name.trim().slice(0, 300)
            : null,
        airDate: Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12),
      };
    });
    return value && value.airDate > this.now() - DAY_MS ? value : null;
  }
}
