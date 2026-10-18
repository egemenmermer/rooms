import { limitedText, privateFetch } from '../../../packages/personal-media/src/network';
import {
  decodeSubtitle,
  formatVtt,
  subtitleCues,
} from '../../../packages/community-cinema/src/webvtt';
import { CinemaError } from './importer';
import { zipEntries } from './zip';

/** What to look subtitles up for: a film, or one episode of a series. */
export type SubtitleQuery = {
  kind: 'movie' | 'tv';
  tmdbId: string | null;
  name: string;
  year: number | null;
  season?: number;
  episode?: number;
};

export type SubtitleCandidate = {
  /** SubDL's download id (`<n_id>-<file id>`), opaque to clients. */
  id: string;
  label: string;
  language: 'tur' | 'eng';
  release: string | null;
  hearingImpaired: boolean;
};

type Fetcher = (
  url: string,
  init: { headers: Record<string, string>; signal: AbortSignal },
) => Promise<Response>;

const API = 'https://api.subdl.com/api/v1/subtitles';
const DOWNLOAD = 'https://dl.subdl.com/subtitle/';
const ID = /^[A-Za-z0-9_-]{1,64}$/;
const MB = 1024 * 1024;
const PER_LANGUAGE = 5;
const LANGUAGES: Record<string, { code: 'tur' | 'eng'; name: string }> = {
  tr: { code: 'tur', name: 'Türkçe' },
  turkish: { code: 'tur', name: 'Türkçe' },
  en: { code: 'eng', name: 'İngilizce' },
  english: { code: 'eng', name: 'İngilizce' },
};

const fail = (code: string): never => {
  throw new CinemaError(code);
};

const clean = (value: unknown, max: number) =>
  typeof value === 'string' && value.trim() && !value.includes('://')
    ? value
        .replace(/[\u0000-\u001f\u007f]/g, '')
        .trim()
        .slice(0, max)
    : null;

/**
 * SubDL subtitle search for the community cinema, with the owner's own API key
 * (SubDL's terms let each user bring their key). Searches by TMDB id, else by name and
 * year; downloads are zip archives that become WebVTT here. Keys never reach logs or
 * clients, and every request goes through privateFetch.
 */
export class SubtitleSearch {
  private readonly fetcher: Fetcher;

  constructor(private readonly options: { userAgent: string; fetch?: Fetcher }) {
    this.fetcher = options.fetch ?? ((url, init) => privateFetch(url, init));
  }

  private async get(url: string, timeoutMs = 15_000) {
    try {
      return await this.fetcher(url, {
        headers: { 'User-Agent': this.options.userAgent, Accept: '*/*' },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      return fail('CINEMA_SUBTITLE_UNAVAILABLE');
    }
  }

  private async api(key: string, params: Record<string, string>) {
    const url = new URL(API);
    url.searchParams.set('api_key', key);
    for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
    const response = await this.get(url.href);
    if (response.status === 401 || response.status === 403) {
      await response.body?.cancel();
      fail('CINEMA_SUBTITLE_KEY_INVALID');
    }
    let body: { status?: unknown; error?: unknown; subtitles?: unknown };
    try {
      body = JSON.parse(await limitedText(response, 4 * MB));
    } catch {
      return fail('CINEMA_SUBTITLE_UNAVAILABLE');
    }
    if (body.status === false) {
      const error = typeof body.error === 'string' ? body.error : '';
      if (/key|token|unauthori[sz]ed|forbidden/i.test(error)) fail('CINEMA_SUBTITLE_KEY_INVALID');
      // "Can't find movie or tv" and similar: nothing to offer, not a failure.
      if (/find|not found|no (subtitle|result)/i.test(error)) return [];
      fail('CINEMA_SUBTITLE_UNAVAILABLE');
    }
    return Array.isArray(body.subtitles) ? (body.subtitles as Record<string, unknown>[]) : [];
  }

  /** Checks a key with a search that always has results; throws CINEMA_SUBTITLE_KEY_INVALID. */
  async verify(key: string) {
    await this.api(key, { tmdb_id: '27205', type: 'movie', languages: 'EN', subs_per_page: '1' });
  }

  /** Turkish, then English subtitles, at most five of each. */
  async search(key: string, query: SubtitleQuery): Promise<SubtitleCandidate[]> {
    const params: Record<string, string> = {
      type: query.kind,
      languages: 'TR,EN',
      subs_per_page: '30',
    };
    if (query.tmdbId) params.tmdb_id = query.tmdbId;
    else {
      params.film_name = query.name;
      if (query.year) params.year = String(query.year);
    }
    if (query.kind === 'tv' && query.season) params.season_number = String(query.season);
    if (query.kind === 'tv' && query.episode) params.episode_number = String(query.episode);
    const rows = await this.api(key, params);
    const found: SubtitleCandidate[] = [];
    for (const row of rows) {
      const id = /^\/subtitle\/([A-Za-z0-9_-]{1,64})\.zip$/.exec(String(row.url ?? ''))?.[1];
      const language =
        LANGUAGES[String(row.language ?? '').toLowerCase()] ??
        LANGUAGES[String(row.lang ?? '').toLowerCase()];
      if (!id || !language || found.some((c) => c.id === id)) continue;
      // An episode search may still return other episodes and season packs.
      if (query.kind === 'tv' && query.episode) {
        const episode = Number(row.episode ?? row.episode_from);
        const end = Number(row.episode_end ?? episode);
        if (
          Number.isFinite(episode) &&
          episode > 0 &&
          (query.episode < episode || query.episode > end)
        )
          continue;
      }
      const release = clean(row.release_name ?? row.name, 120);
      const hearingImpaired = row.hi === true || row.hi === 1;
      found.push({
        id,
        language: language.code,
        release,
        hearingImpaired,
        label: [language.name, release ?? 'SubDL', hearingImpaired ? 'İşitme engelli' : null]
          .filter(Boolean)
          .join(' · ')
          .slice(0, 78),
      });
    }
    const rank = (c: SubtitleCandidate) =>
      (c.language === 'tur' ? 0 : 2) + (c.hearingImpaired ? 1 : 0);
    const sorted = found
      .map((c, i) => ({ c, i }))
      .sort((a, b) => rank(a.c) - rank(b.c) || a.i - b.i);
    const per = new Map<string, number>();
    return sorted
      .map(({ c }) => c)
      .filter((c) => {
        const n = (per.get(c.language) ?? 0) + 1;
        per.set(c.language, n);
        return n <= PER_LANGUAGE;
      });
  }

  /**
   * Downloads one subtitle and returns it as WebVTT. SubDL serves a zip; the SubRip,
   * ASS/SSA or WebVTT file in it (for a season pack, the requested episode's) is used.
   */
  async download(id: string, episode?: { season: number; episode: number }) {
    if (!ID.test(id)) return fail('CINEMA_SUBTITLE_UNAVAILABLE');
    const response = await this.get(`${DOWNLOAD}${id}.zip`, 30_000);
    if (!response.ok) {
      await response.body?.cancel();
      fail('CINEMA_SUBTITLE_UNAVAILABLE');
    }
    const body = await this.bytes(response, 10 * MB);
    let text: string;
    if (body.subarray(0, 2).toString('latin1') === 'PK') {
      let files;
      try {
        files = zipEntries(body, 4 * MB).filter((f) => /\.(srt|ass|ssa|vtt)$/i.test(f.name));
      } catch {
        return fail('CINEMA_SUBTITLE_UNAVAILABLE');
      }
      const tag = episode
        ? new RegExp(`s0*${episode.season}[ ._-]*e0*${episode.episode}(?!\\d)`, 'i')
        : null;
      const order = (name: string) =>
        ['.srt', '.ass', '.ssa', '.vtt'].indexOf(name.slice(-4).toLowerCase());
      const pick =
        (tag && files.find((f) => tag.test(f.name))) ??
        [...files].sort((a, b) => order(a.name) - order(b.name))[0];
      if (!pick) return fail('CINEMA_SUBTITLE_UNAVAILABLE');
      try {
        text = decodeSubtitle(pick.read());
      } catch {
        return fail('CINEMA_SUBTITLE_UNAVAILABLE');
      }
    } else text = decodeSubtitle(body);
    const cues = subtitleCues(text);
    if (!cues.length) return fail('CINEMA_SUBTITLE_UNAVAILABLE');
    return formatVtt(cues);
  }

  private async bytes(response: Response, max: number) {
    const reader = response.body?.getReader();
    if (!reader) return Buffer.alloc(0);
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
      total += chunk.value.length;
      if (total > max) {
        await reader.cancel().catch(() => {});
        return fail('CINEMA_SUBTITLE_UNAVAILABLE');
      }
      chunks.push(chunk.value);
    }
    return Buffer.concat(chunks);
  }
}
