import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { limitedText, privateFetch } from '../../../packages/personal-media/src/network';
import {
  decodeSubtitle,
  formatVtt,
  subtitleCues,
} from '../../../packages/community-cinema/src/webvtt';
import type {
  CinemaDetails,
  CinemaExternalSubtitles,
  StremioDetails,
  StremioHome,
  StremioLinkCode,
  StremioPicked,
  StremioStreams,
  StremioTitle,
  StremioType,
} from '../../../packages/community-cinema/src/types';
import { CinemaError } from './importer';

// Stremio's own endpoints, as stremio-core calls them (types/api/request.rs, constants.rs).
export const STREMIO_API = 'https://api.strem.io/api/';
export const STREMIO_LINK_API = 'https://link.stremio.com/api/v2/';
export const CINEMETA = 'https://v3-cinemeta.strem.io';

const fail = (code: string): never => {
  throw new CinemaError(code);
};

/** The owner's linked Stremio session. The auth key never leaves the service. */
export type StremioAccount = {
  authKey: string;
  email: string | null;
  linkedBy: string;
  linkedAt: number;
};

/**
 * A stream a member chose for the hall, kept in the community's encrypted config so the
 * queue item still plays after a restart. `url` often carries the owner's debrid key (the
 * add-on puts it in the path); only this service ever reads it.
 */
export type StremioPick = {
  ref: string;
  url: string;
  headers: Record<string, string>;
  title: string;
  type: StremioType;
  metaId: string;
  videoId: string;
  season: number | null;
  episode: number | null;
  poster: string | null;
  background: string | null;
  plot: string | null;
  genre: string | null;
  cast: string | null;
  director: string | null;
  year: number | null;
  at: number;
};

export const STREMIO_ID = /^[A-Za-z0-9:._%-]{1,160}$/;
export const STREMIO_TYPE = z.enum(['movie', 'series']);
const MAX_PICKS = 300;
const ADDONS_MS = 5 * 60_000;
const OFFER_MS = 2 * 3600_000;
const MAX_OFFERS = 4000;
const MAX_ART = 20_000;

const resource = z.union([
  z.string(),
  z
    .object({
      name: z.string(),
      types: z.array(z.string()).optional(),
      idPrefixes: z.array(z.string()).nullish(),
    })
    .passthrough(),
]);
const descriptor = z
  .object({
    transportUrl: z.string().max(4096),
    manifest: z
      .object({
        id: z.string().max(200),
        name: z.string().max(200),
        resources: z.array(resource).catch([]),
        types: z.array(z.string()).catch([]),
        idPrefixes: z.array(z.string()).nullish().catch(null),
      })
      .passthrough(),
  })
  .passthrough();
type Addon = z.infer<typeof descriptor>;

const text = (value: unknown, max = 2000) =>
  typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null;
const list = (value: unknown) =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
const httpUrl = (value: unknown) => {
  if (typeof value !== 'string' || value.length > 4096) return null;
  try {
    const url = new URL(value);
    return (url.protocol === 'https:' || url.protocol === 'http:') && !url.username
      ? url.href
      : null;
  } catch {
    return null;
  }
};
const yearOf = (value: unknown) => {
  const match = typeof value === 'string' ? /\d{4}/.exec(value) : null;
  return match ? Number(match[0]) : typeof value === 'number' ? value : null;
};

/** Which add-on answers `resource` for this type and id (stremio-core's `is_resource_supported`). */
export function supports(addon: Addon, name: string, type: string, id: string) {
  const { manifest } = addon;
  for (const entry of manifest.resources) {
    const short = typeof entry === 'string';
    if ((short ? entry : entry.name) !== name) continue;
    const types = (short ? null : entry.types) ?? manifest.types;
    const prefixes = (short ? null : entry.idPrefixes) ?? manifest.idPrefixes;
    if (!types.includes(type)) continue;
    if (prefixes && !prefixes.some((prefix) => id.startsWith(prefix))) continue;
    return true;
  }
  return false;
}

export const addonBase = (transportUrl: string) => {
  const url = httpUrl(transportUrl);
  return url && /\/manifest\.json$/.test(url) ? url.replace(/\/manifest\.json$/, '') : null;
};

/** Torrentio-style labels: `[RD+]` is in the debrid cache, `[RD download]` is not yet. */
export function streamFacts(name: string, title: string) {
  const all = `${name}\n${title}`;
  const cached = /\[[A-Z]{2,3}\+\]/.test(name) ? true : /download\]/i.test(name) ? false : null;
  const resolution = /\b(2160p|4k|uhd)\b/i.test(all)
    ? '4K'
    : /\b1080p\b/i.test(all)
      ? '1080p'
      : /\b720p\b/i.test(all)
        ? '720p'
        : /\b(480p|576p|sd)\b/i.test(all)
          ? 'SD'
          : null;
  const size = /([\d.,]+\s?[GM]B)\b/.exec(all)?.[1] ?? null;
  return { cached, resolution, size };
}

const safeHeaders = (value: unknown) => {
  const out: Record<string, string> = {};
  if (!value || typeof value !== 'object') return out;
  for (const [key, raw] of Object.entries(value as Record<string, unknown>))
    if (
      /^(user-agent|referer|origin)$/i.test(key) &&
      typeof raw === 'string' &&
      raw.length < 512 &&
      !/[\r\n]/.test(raw)
    )
      out[key] = raw;
  return out;
};

export type StremioFetch = (
  url: string,
  init?: { method?: 'GET' | 'POST'; body?: unknown; timeoutMs?: number },
) => Promise<unknown>;

/** JSON over the private-network-checked fetch every cinema upstream uses. */
export function stremioFetch(options: {
  userAgent: string;
  allowPrivateNetwork?: boolean;
}): StremioFetch {
  return async (url, init = {}) => {
    const response = await privateFetch(url, {
      method: init.method ?? 'GET',
      headers: {
        'User-Agent': options.userAgent,
        Accept: 'application/json',
        ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      allowedProtocols: ['https:', 'http:'],
      allowPrivateNetwork: options.allowPrivateNetwork,
      signal: AbortSignal.timeout(init.timeoutMs ?? 12_000),
    });
    return JSON.parse(await limitedText(response, 8_000_000)) as unknown;
  };
}

/**
 * The hall's Stremio: the owner links an account with Stremio's own link code (no password
 * passes through ROOMS), members browse Cinemeta and the account's library, list the
 * streams its add-ons offer and pick one. The pick becomes an opaque `x-` ref the relay
 * plays like any catalog film. Torrent-only streams are left out: the server only plays
 * HTTP links (debrid services resolve them), it never joins a swarm.
 */
export class StremioCinema {
  private readonly pending = new Map<string, { code: string; at: number }>();
  private readonly addons = new Map<string, { at: number; list: Promise<Addon[]> }>();
  private readonly offers = new Map<
    string,
    { communityId: string; at: number; pick: Omit<StremioPick, 'ref' | 'at'> }
  >();
  private readonly art = new Map<string, string>();
  private readonly subtitleLists = new Map<
    string,
    { at: number; list: { id: string; url: string; lang: string }[] }
  >();

  constructor(
    private readonly options: {
      fetch: StremioFetch;
      account(communityId: string): StremioAccount | null;
      picks(communityId: string): StremioPick[];
      savePicks(communityId: string, picks: StremioPick[]): void;
      saveAccount(communityId: string, account: StremioAccount | null): void;
      now?: () => number;
    },
  ) {}

  private now() {
    return this.options.now?.() ?? Date.now();
  }

  private api(method: string, body: Record<string, unknown>) {
    return this.options.fetch(`${STREMIO_API}${method}`, { method: 'POST', body }).then((value) => {
      const parsed = value as { result?: unknown; error?: { code?: number } };
      if (parsed?.error) {
        // Code 1 is "Session does not exist": the owner logged out or changed password.
        if (parsed.error.code === 1) fail('CINEMA_STREMIO_LOGGED_OUT');
        fail('CINEMA_STREMIO_UNAVAILABLE');
      }
      return parsed?.result;
    });
  }

  private session(communityId: string) {
    return this.options.account(communityId) ?? fail('CINEMA_STREMIO_NOT_LINKED');
  }

  /** Owner: a fresh code to approve at link.stremio.com. */
  async linkStart(communityId: string): Promise<StremioLinkCode> {
    let value: unknown;
    try {
      value = await this.options.fetch(`${STREMIO_LINK_API}create?type=Create`);
    } catch {
      return fail('CINEMA_STREMIO_UNAVAILABLE');
    }
    const result = z
      .object({ code: z.string().regex(/^[A-Za-z0-9]{3,16}$/), link: z.string() })
      .safeParse((value as { result?: unknown })?.result);
    if (!result.success) return fail('CINEMA_STREMIO_UNAVAILABLE');
    const link = `https://link.stremio.com/${encodeURIComponent(result.data.code)}`;
    this.pending.set(communityId, { code: result.data.code, at: this.now() });
    return { code: result.data.code, link };
  }

  /**
   * Owner: whether the code was approved. Stremio answers an unapproved and an expired code
   * the same way, so a code is given up after 15 minutes.
   */
  async linkPoll(communityId: string, userId: string): Promise<boolean> {
    const pending = this.pending.get(communityId);
    if (!pending || this.now() - pending.at > 15 * 60_000) {
      this.pending.delete(communityId);
      return fail('CINEMA_STREMIO_LINK_EXPIRED');
    }
    let value: unknown;
    try {
      value = await this.options.fetch(
        `${STREMIO_LINK_API}read?type=Read&code=${encodeURIComponent(pending.code)}`,
      );
    } catch {
      return false;
    }
    const authKey = text((value as { result?: { authKey?: unknown } })?.result?.authKey, 512);
    if (!authKey) return false;
    this.pending.delete(communityId);
    const user = (await this.api('getUser', { type: 'GetUser', authKey }).catch(() => null)) as {
      email?: unknown;
    } | null;
    this.addons.delete(communityId);
    this.options.saveAccount(communityId, {
      authKey,
      email: text(user?.email, 320),
      linkedBy: userId,
      linkedAt: this.now(),
    });
    return true;
  }

  /** Owner: forgets the session and every pick (their links may carry the debrid key). */
  unlink(communityId: string) {
    this.pending.delete(communityId);
    this.addons.delete(communityId);
    for (const [id, offer] of this.offers)
      if (offer.communityId === communityId) this.offers.delete(id);
    for (const key of this.subtitleLists.keys())
      if (key.startsWith(`${communityId}\n`)) this.subtitleLists.delete(key);
    this.options.saveAccount(communityId, null);
    this.options.savePicks(communityId, []);
  }

  private collection(communityId: string): Promise<Addon[]> {
    const cached = this.addons.get(communityId);
    if (cached && this.now() - cached.at < ADDONS_MS) return cached.list;
    const { authKey } = this.session(communityId);
    const load = this.api('addonCollectionGet', {
      type: 'AddonCollectionGet',
      authKey,
      update: true,
    }).then((result) => {
      const raw = (result as { addons?: unknown })?.addons;
      return (Array.isArray(raw) ? raw : [])
        .map((entry) => descriptor.safeParse(entry))
        .flatMap((entry) =>
          entry.success && addonBase(entry.data.transportUrl) ? [entry.data] : [],
        );
    });
    load.catch(() => this.addons.delete(communityId));
    this.addons.set(communityId, { at: this.now(), list: load });
    return load;
  }

  /** An opaque id for an artwork URL, served by the hall's `/art/:id` like catalog art. */
  artId(url: unknown) {
    const href = httpUrl(url);
    if (!href) return null;
    const id = createHash('sha256').update(`stremio\n${href}`).digest('hex').slice(0, 32);
    if (!this.art.has(id)) {
      this.art.set(id, href);
      for (const key of this.art.keys()) {
        if (this.art.size <= MAX_ART) break;
        this.art.delete(key);
      }
    }
    return id;
  }

  artUrl(communityId: string, id: string) {
    const known = this.art.get(id);
    if (known) return known;
    for (const pick of this.options.picks(communityId))
      for (const url of [pick.poster, pick.background])
        if (url && this.artId(url) === id) return url;
    return null;
  }

  private title(meta: Record<string, unknown>, type: StremioType): StremioTitle | null {
    const id = text(meta.id, 160);
    const name = text(meta.name, 300);
    if (!id || !STREMIO_ID.test(id) || !name) return null;
    return {
      type,
      id,
      name,
      year: text(meta.releaseInfo, 20) ?? (yearOf(meta.year) ? String(yearOf(meta.year)) : null),
      art: this.artId(meta.poster),
    };
  }

  private async catalog(type: StremioType, path: string) {
    const value = (await this.options.fetch(`${CINEMETA}/catalog/${type}/${path}.json`)) as {
      metas?: unknown;
    };
    return (Array.isArray(value?.metas) ? value.metas : [])
      .flatMap((meta) => {
        const title =
          meta && typeof meta === 'object'
            ? this.title(meta as Record<string, unknown>, type)
            : null;
        return title ? [title] : [];
      })
      .slice(0, 60);
  }

  /** Continue watching and the library of the linked account, and what is popular now. */
  async home(communityId: string): Promise<StremioHome> {
    const { authKey } = this.session(communityId);
    const [library, movie, series] = await Promise.all([
      this.api('datastoreGet', { authKey, collection: 'libraryItem', ids: [], all: true }).catch(
        (error) => {
          if (error instanceof CinemaError && error.message === 'CINEMA_STREMIO_LOGGED_OUT')
            throw error;
          return [];
        },
      ),
      this.catalog('movie', 'top').catch(() => []),
      this.catalog('series', 'top').catch(() => []),
    ]);
    type Item = {
      _id?: unknown;
      name?: unknown;
      type?: unknown;
      poster?: unknown;
      removed?: unknown;
      temp?: unknown;
      _mtime?: unknown;
      state?: {
        timeOffset?: unknown;
        duration?: unknown;
        video_id?: unknown;
        lastWatched?: unknown;
        season?: unknown;
        episode?: unknown;
      };
    };
    const items = (Array.isArray(library) ? (library as Item[]) : []).filter(
      (item) => item && (item.type === 'movie' || item.type === 'series'),
    );
    const time = (value: unknown) => (typeof value === 'string' ? Date.parse(value) || 0 : 0);
    const num = (value: unknown) =>
      typeof value === 'number' && Number.isFinite(value) ? value : null;
    const continueRow = items
      .filter((item) => (num(item.state?.timeOffset) ?? 0) > 0 && (!item.removed || item.temp))
      .sort((a, b) => time(b.state?.lastWatched) - time(a.state?.lastWatched))
      .slice(0, 20)
      .flatMap((item) => {
        const title = this.title(
          { id: item._id, name: item.name, poster: item.poster },
          item.type as StremioType,
        );
        if (!title) return [];
        const offset = num(item.state?.timeOffset) ?? 0;
        const duration = num(item.state?.duration);
        const videoId = text(item.state?.video_id, 160);
        return [
          {
            ...title,
            videoId: videoId && STREMIO_ID.test(videoId) ? videoId : null,
            season: num(item.state?.season) || null,
            episode: num(item.state?.episode) || null,
            progress: duration ? Math.min(1, offset / duration) : null,
            watchedAt: time(item.state?.lastWatched) || null,
          },
        ];
      });
    const saved = items
      .filter((item) => !item.removed && !item.temp)
      .sort((a, b) => time(b._mtime) - time(a._mtime))
      .slice(0, 60)
      .flatMap((item) => {
        const title = this.title(
          { id: item._id, name: item.name, poster: item.poster },
          item.type as StremioType,
        );
        return title ? [title] : [];
      });
    return { continue: continueRow, library: saved, popular: { movie, series } };
  }

  async search(communityId: string, query: string): Promise<StremioTitle[]> {
    this.session(communityId);
    const q = encodeURIComponent(query.trim().slice(0, 120));
    if (!q) return [];
    const [movie, series] = await Promise.all([
      this.catalog('movie', `top/search=${q}`).catch(() => []),
      this.catalog('series', `top/search=${q}`).catch(() => []),
    ]);
    return [...movie.slice(0, 30), ...series.slice(0, 30)];
  }

  private async metaOf(communityId: string, type: StremioType, id: string) {
    const addons = await this.collection(communityId);
    const bases = [
      ...(id.startsWith('tt') ? [CINEMETA] : []),
      ...addons
        .filter((addon) => supports(addon, 'meta', type, id))
        .map((addon) => addonBase(addon.transportUrl)!),
    ];
    for (const base of [...new Set(bases)]) {
      try {
        const value = (await this.options.fetch(
          `${base}/meta/${type}/${encodeURIComponent(id)}.json`,
        )) as { meta?: Record<string, unknown> };
        if (value?.meta && typeof value.meta === 'object') return value.meta;
      } catch {
        // The next add-on may know it.
      }
    }
    return fail('CINEMA_ITEM_NOT_FOUND');
  }

  async details(communityId: string, type: StremioType, id: string): Promise<StremioDetails> {
    const meta = await this.metaOf(communityId, type, id);
    const title = this.title({ ...meta, id }, type) ?? fail('CINEMA_ITEM_NOT_FOUND');
    const videos = (Array.isArray(meta.videos) ? (meta.videos as Record<string, unknown>[]) : [])
      .flatMap((video) => {
        const videoId = text(video?.id, 160);
        const season = typeof video?.season === 'number' ? video.season : null;
        const episode =
          typeof video?.episode === 'number'
            ? video.episode
            : typeof video?.number === 'number'
              ? video.number
              : null;
        if (!videoId || !STREMIO_ID.test(videoId) || season === null || episode === null) return [];
        return [
          {
            id: videoId,
            season,
            episode,
            title: text(video.name, 300) ?? text(video.title, 300) ?? `${episode}. Bölüm`,
            plot: text(video.overview) ?? text(video.description),
            released: text(video.released, 40)
              ? Date.parse(video.released as string) || null
              : null,
            art: this.artId(video.thumbnail),
          },
        ];
      })
      .sort((a, b) => a.season - b.season || a.episode - b.episode)
      .slice(0, 3000);
    return {
      ...title,
      plot: text(meta.description),
      genres: list(meta.genres ?? meta.genre).slice(0, 8),
      runtime: text(meta.runtime, 40),
      rating: text(meta.imdbRating, 10),
      backdrop: this.artId(meta.background),
      cast: list(meta.cast).slice(0, 12),
      director: list(meta.director).slice(0, 4),
      videos,
    };
  }

  /**
   * The streams the account's add-ons offer for a film or an episode. Each comes back with
   * an opaque id; its URL stays here until a member picks it.
   */
  async streams(
    communityId: string,
    type: StremioType,
    metaId: string,
    videoId: string,
  ): Promise<StremioStreams> {
    const addons = (await this.collection(communityId)).filter((addon) =>
      supports(addon, 'stream', type, videoId),
    );
    const details = await this.details(communityId, type, metaId).catch(() => null);
    const video = details?.videos.find((entry) => entry.id === videoId) ?? null;
    let skippedTorrents = 0;
    const failedAddons: string[] = [];
    const answers = await Promise.all(
      addons.map(async (addon) => {
        try {
          const value = (await this.options.fetch(
            `${addonBase(addon.transportUrl)}/stream/${type}/${encodeURIComponent(videoId)}.json`,
            { timeoutMs: 20_000 },
          )) as { streams?: unknown };
          return { addon, streams: Array.isArray(value?.streams) ? value.streams : [] };
        } catch {
          failedAddons.push(addon.manifest.name);
          return { addon, streams: [] };
        }
      }),
    );
    const streams: StremioStreams['streams'] = [];
    const seen = new Set<string>();
    for (const { addon, streams: raw } of answers)
      for (const entry of raw as Record<string, unknown>[]) {
        if (!entry || typeof entry !== 'object') continue;
        const url = httpUrl(entry.url);
        if (!url) {
          if (typeof entry.infoHash === 'string') skippedTorrents++;
          continue;
        }
        if (seen.has(url)) continue;
        seen.add(url);
        const name = text(entry.name, 200) ?? addon.manifest.name;
        const title = text(entry.title, 600) ?? text(entry.description, 600) ?? '';
        const hints = (entry.behaviorHints ?? {}) as { proxyHeaders?: { request?: unknown } };
        const id = randomBytes(12).toString('base64url');
        const workTitle = details?.name ?? metaId;
        this.offers.set(id, {
          communityId,
          at: this.now(),
          pick: {
            url,
            headers: safeHeaders(hints.proxyHeaders?.request),
            title: video
              ? `${workTitle} · ${video.season}. Sezon ${video.episode}. Bölüm`
              : workTitle,
            type,
            metaId,
            videoId,
            season: video?.season ?? null,
            episode: video?.episode ?? null,
            poster: details?.art ? (this.art.get(details.art) ?? null) : null,
            background: details?.backdrop ? (this.art.get(details.backdrop) ?? null) : null,
            plot: video?.plot ?? details?.plot ?? null,
            genre: details?.genres.join(', ') || null,
            cast: details?.cast.join(', ') || null,
            director: details?.director.join(', ') || null,
            year: yearOf(details?.year),
          },
        });
        streams.push({ id, addon: addon.manifest.name, name, title, ...streamFacts(name, title) });
        if (streams.length >= 200) break;
      }
    this.pruneOffers();
    return { streams, skippedTorrents, failedAddons };
  }

  private pruneOffers() {
    const now = this.now();
    for (const [id, offer] of this.offers)
      if (now - offer.at > OFFER_MS || this.offers.size > MAX_OFFERS) this.offers.delete(id);
  }

  /** A member's choice: the stream becomes a hall ref (the same link reuses its ref). */
  pick(communityId: string, streamId: string): StremioPicked {
    this.session(communityId);
    const offer = this.offers.get(streamId);
    if (!offer || offer.communityId !== communityId || this.now() - offer.at > OFFER_MS)
      return fail('CINEMA_STREMIO_STREAM_EXPIRED');
    const picks = this.options.picks(communityId);
    const existing = picks.find((pick) => pick.url === offer.pick.url);
    const pick: StremioPick = existing
      ? { ...existing, at: this.now() }
      : { ...offer.pick, ref: `x-${randomBytes(16).toString('base64url')}`, at: this.now() };
    const next = [pick, ...picks.filter((other) => other.ref !== pick.ref)]
      .sort((a, b) => b.at - a.at)
      .slice(0, MAX_PICKS);
    this.options.savePicks(communityId, next);
    return { ref: pick.ref, title: pick.title, art: this.artId(pick.poster) };
  }

  find(communityId: string, ref: string) {
    return this.options.picks(communityId).find((pick) => pick.ref === ref) ?? null;
  }

  relaySource(communityId: string, ref: string) {
    const pick = this.find(communityId, ref) ?? fail('CINEMA_ITEM_NOT_FOUND');
    return { url: pick.url, headers: pick.headers, live: false };
  }

  /** What the stage shows for a picked stream, in the catalog's details shape. */
  pickDetails(communityId: string, ref: string): CinemaDetails {
    const pick = this.find(communityId, ref) ?? fail('CINEMA_ITEM_NOT_FOUND');
    return {
      item: {
        ref,
        kind: 'movie',
        title: pick.title,
        badges: [],
        categoryId: null,
        number: null,
        art: this.artId(pick.poster),
        year: pick.year,
        rating: null,
        addedAt: null,
        hasGuide: false,
      },
      plot: pick.plot,
      genre: pick.genre,
      cast: pick.cast,
      director: pick.director,
      durationSec: null,
      backdrop: this.artId(pick.background),
      seasons: [],
      tmdbId: null,
    };
  }

  imdbOf(communityId: string, ref: string) {
    const pick = this.find(communityId, ref);
    return pick && /^tt\d{5,10}$/.test(pick.metaId)
      ? { kind: pick.type, imdbId: pick.metaId }
      : null;
  }

  /** Turkish and English subtitles from the account's subtitle add-ons (OpenSubtitles). */
  async subtitles(communityId: string, ref: string): Promise<CinemaExternalSubtitles> {
    const list = await this.subtitleList(communityId, ref);
    return {
      available: true,
      subtitles: list.map((entry, index) => ({
        id: entry.id,
        label: `${entry.lang === 'tur' ? 'Türkçe' : 'İngilizce'} ${index + 1}`,
        language: entry.lang as 'tur' | 'eng',
        hearingImpaired: false,
      })),
    };
  }

  private async subtitleList(communityId: string, ref: string) {
    const key = `${communityId}\n${ref}`;
    const cached = this.subtitleLists.get(key);
    if (cached && this.now() - cached.at < 6 * 3600_000) return cached.list;
    const pick = this.find(communityId, ref) ?? fail('CINEMA_ITEM_NOT_FOUND');
    const addons = (await this.collection(communityId)).filter((addon) =>
      supports(addon, 'subtitles', pick.type, pick.videoId),
    );
    const found: { id: string; url: string; lang: string }[] = [];
    await Promise.all(
      addons.map(async (addon) => {
        try {
          const value = (await this.options.fetch(
            `${addonBase(addon.transportUrl)}/subtitles/${pick.type}/${encodeURIComponent(pick.videoId)}.json`,
          )) as { subtitles?: unknown };
          for (const entry of (Array.isArray(value?.subtitles) ? value.subtitles : []) as Record<
            string,
            unknown
          >[]) {
            const url = httpUrl(entry?.url);
            const lang = typeof entry?.lang === 'string' ? entry.lang.toLowerCase() : '';
            const code = /^(tur|tr)/.test(lang) ? 'tur' : /^(eng|en)/.test(lang) ? 'eng' : null;
            if (url && code)
              found.push({ id: randomBytes(9).toString('base64url'), url, lang: code });
          }
        } catch {
          // A subtitle add-on that fails leaves the others.
        }
      }),
    );
    const sorted = [
      ...found.filter((entry) => entry.lang === 'tur').slice(0, 12),
      ...found.filter((entry) => entry.lang === 'eng').slice(0, 6),
    ];
    this.subtitleLists.set(key, { at: this.now(), list: sorted });
    return sorted;
  }

  async subtitleFile(communityId: string, ref: string, id: string) {
    const entry =
      (await this.subtitleList(communityId, ref)).find((candidate) => candidate.id === id) ??
      fail('CINEMA_ITEM_NOT_FOUND');
    let body: string;
    try {
      const value = await privateFetch(entry.url, {
        allowedProtocols: ['https:', 'http:'],
        signal: AbortSignal.timeout(20_000),
      });
      if (!value.ok) throw new Error('subtitle');
      const bytes = new Uint8Array(await value.arrayBuffer());
      if (bytes.length > 4 * 1024 * 1024) throw new Error('subtitle');
      body = decodeSubtitle(bytes);
    } catch {
      return fail('CINEMA_SUBTITLE_UNAVAILABLE');
    }
    const cues = subtitleCues(body);
    if (!cues.length) return fail('CINEMA_SUBTITLE_UNAVAILABLE');
    return formatVtt(cues);
  }
}
