import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { createGunzip } from 'node:zlib';
import { limitedText, privateFetch } from '../../../packages/personal-media/src/network';
import { EpgMatcher, type EpgChannelRef } from '../../../packages/community-cinema/src/epg-matcher';
import { parseCategoryFlag } from '../../../packages/community-cinema/src/flags';
import { maskText } from '../../../packages/community-cinema/src/mask';
import { parseM3u, type M3uEntry } from '../../../packages/community-cinema/src/m3u';
import { normalizeForSearch } from '../../../packages/community-cinema/src/normalize';
import { parseQuality } from '../../../packages/community-cinema/src/quality';
import type {
  CatalogKind,
  CinemaCategory,
  CinemaImportProgress,
  CinemaProgramme,
} from '../../../packages/community-cinema/src/types';
import { parseXmltv, type XmltvProgramme } from '../../../packages/community-cinema/src/xmltv';
import {
  asId,
  asInt,
  asNumber,
  asPositiveInt,
  asRecord,
  asRows,
  asString,
  containerExtension,
  xtreamAccount,
  xtreamUrls,
  type XtreamAccount,
} from '../../../packages/community-cinema/src/xtream';
import {
  artId,
  emptySnapshot,
  type CatalogSnapshot,
  type StoredEpisode,
  type StoredItem,
} from './catalog';
import type { CinemaSource } from './config-store';

export type ImportOptions = {
  userAgent: string;
  /** Dev only: lets a local mock provider on 127.0.0.1 through. */
  allowPrivateNetwork?: boolean;
  /** Guide window around now. */
  guidePastMs?: number;
  guideFutureMs?: number;
  maxProgrammes?: number;
  now?: () => number;
};

export class CinemaError extends Error {}

const fail = (code: string): never => {
  throw new CinemaError(code);
};

const MB = 1024 * 1024;
/**
 * Largest stream list or playlist read. The body is buffered, decoded and parsed at once,
 * which peaks at about four times its size; 96 MB (roughly 150k movies) stays well inside
 * the service's 1 GB.
 */
const MAX_LIST = 96 * MB;

type Progress = (progress: Partial<CinemaImportProgress>) => void;

/** Provider ids that are safe inside an opaque ref; anything else is hashed. */
function refId(raw: string) {
  return /^[A-Za-z0-9_-]{1,100}$/.test(raw)
    ? raw
    : createHash('sha256').update(raw).digest('hex').slice(0, 24);
}

function yearOf(...values: unknown[]) {
  for (const value of values) {
    const text = asString(value);
    const match = text ? /(?:^|\D)((?:19|20)\d{2})(?:\D|$)/.exec(text) : null;
    if (match) return Number(match[1]);
  }
  return null;
}

function ratingOf(row: Record<string, unknown>) {
  const ten = asNumber(row.rating);
  if (ten !== null && ten > 0 && ten <= 10) return Math.round(ten * 10) / 10;
  const five = asNumber(row.rating_5based);
  return five !== null && five > 0 && five <= 5 ? Math.round(five * 20) / 10 : null;
}

export class Importer {
  constructor(private readonly options: ImportOptions) {}

  private now() {
    return this.options.now?.() ?? Date.now();
  }

  private async request(url: string, signal?: AbortSignal) {
    const headers = { 'User-Agent': this.options.userAgent, Accept: '*/*' };
    let response: Response;
    try {
      response = this.options.allowPrivateNetwork
        ? await fetch(url, { headers, signal, redirect: 'follow' })
        : await privateFetch(url, { headers, signal });
    } catch {
      return fail('CINEMA_PROVIDER_UNREACHABLE');
    }
    if (response.status === 401 || response.status === 403) {
      await response.body?.cancel();
      fail('CINEMA_PROVIDER_DENIED');
    }
    if (!response.ok) {
      await response.body?.cancel();
      fail('CINEMA_PROVIDER_UNREACHABLE');
    }
    return response;
  }

  private async text(url: string, max: number, signal?: AbortSignal) {
    const response = await this.request(url, signal);
    try {
      return await limitedText(response, max);
    } catch {
      return fail('CINEMA_SOURCE_INVALID');
    }
  }

  private async json(url: string, max: number, signal?: AbortSignal): Promise<unknown> {
    const text = await this.text(url, max, signal);
    try {
      return JSON.parse(text);
    } catch {
      return fail('CINEMA_SOURCE_INVALID');
    }
  }

  /** Provider artwork: images only, at most 3 MB. */
  async image(url: string) {
    const response = await this.request(url, AbortSignal.timeout(15_000));
    const type = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() ?? '';
    if (!/^image\/(png|jpe?g|webp|gif|avif)$/.test(type)) {
      await response.body?.cancel();
      return fail('CINEMA_ITEM_NOT_FOUND');
    }
    const chunks: Uint8Array[] = [];
    let total = 0;
    for await (const chunk of Readable.fromWeb(
      response.body as import('node:stream/web').ReadableStream,
    ) as AsyncIterable<Uint8Array>) {
      total += chunk.length;
      if (total > 3 * MB) return fail('CINEMA_ITEM_NOT_FOUND');
      chunks.push(chunk);
    }
    return { body: Buffer.concat(chunks), type };
  }

  /** Checks the account before it is stored. Xtream returns its user info; M3U returns null. */
  async verify(source: CinemaSource, signal?: AbortSignal): Promise<XtreamAccount | null> {
    if (source.kind === 'm3u') {
      const head = await this.text(source.url, MAX_LIST, signal);
      try {
        parseM3u(head, source.url);
      } catch {
        fail('CINEMA_SOURCE_INVALID');
      }
      return null;
    }
    const urls = xtreamUrls(source.server, source.username, source.password);
    const json = await this.json(urls.api(), MB, signal);
    if (asInt(asRecord(asRecord(json).user_info).auth) !== 1) fail('CINEMA_PROVIDER_DENIED');
    const account = xtreamAccount(json);
    if (!account.active || (account.expiresAt !== null && account.expiresAt < this.now()))
      fail('CINEMA_ACCOUNT_EXPIRED');
    return account;
  }

  /** Imports channels, movies and series. The guide is a separate step ({@link importGuide}). */
  async importCatalog(source: CinemaSource, progress: Progress, signal?: AbortSignal) {
    return source.kind === 'xtream'
      ? this.importXtream(source, progress, signal)
      : this.importM3u(source, progress, signal);
  }

  private async importXtream(
    source: Extract<CinemaSource, { kind: 'xtream' }>,
    progress: Progress,
    signal?: AbortSignal,
  ) {
    const urls = xtreamUrls(source.server, source.username, source.password);
    const snapshot = emptySnapshot();
    const counts = { live: 0, movies: 0, series: 0, programmes: 0 };
    const sections: {
      kind: CatalogKind;
      categories: string;
      streams: string;
      step: 'live' | 'movies' | 'series';
    }[] = [
      {
        kind: 'live',
        categories: 'get_live_categories',
        streams: 'get_live_streams',
        step: 'live',
      },
      {
        kind: 'movie',
        categories: 'get_vod_categories',
        streams: 'get_vod_streams',
        step: 'movies',
      },
      {
        kind: 'series',
        categories: 'get_series_categories',
        streams: 'get_series',
        step: 'series',
      },
    ];
    for (const section of sections) {
      progress({ step: section.step, counts: { ...counts } });
      const categoryRows = asRows(
        await this.json(urls.api({ action: section.categories }), 10 * MB, signal),
      );
      const rows = asRows(await this.json(urls.api({ action: section.streams }), MAX_LIST, signal));
      const names = new Map<string, string>();
      for (const row of categoryRows) {
        const id = asId(row.category_id);
        const name = asString(row.category_name);
        if (id && name && !name.includes('://')) names.set(id, name.slice(0, 200));
      }
      const used = new Map<string, number>();
      for (const row of rows) {
        const item = this.xtreamItem(section.kind, row, snapshot.art);
        if (!item) continue;
        const providerCategory = asId(row.category_id) ?? asId(asRows(row.category_ids)[0]);
        if (providerCategory && names.has(providerCategory)) {
          item.categoryId = `${section.kind[0]}${refId(providerCategory)}`;
          used.set(providerCategory, (used.get(providerCategory) ?? 0) + 1);
        }
        snapshot.items.push(item);
      }
      for (const [id, name] of names) {
        const count = used.get(id);
        if (count)
          snapshot.categories.push(
            category(section.kind, `${section.kind[0]}${refId(id)}`, name, count),
          );
      }
      if (section.kind === 'live') counts.live = rows.length;
      if (section.kind === 'movie') counts.movies = rows.length;
      if (section.kind === 'series') counts.series = rows.length;
    }
    snapshot.importedAt = this.now();
    progress({ counts });
    return snapshot;
  }

  private xtreamItem(
    kind: CatalogKind,
    row: Record<string, unknown>,
    art: Record<string, string>,
  ): StoredItem | null {
    const providerId = asId(kind === 'series' ? row.series_id : row.stream_id);
    if (!providerId) return null;
    // Panels do ship nameless entries; a name holding a URL could leak one, so neither is shown.
    const given = asString(row.name);
    const fallback = { live: 'Kanal', movie: 'Film', series: 'Dizi' }[kind];
    const rawName =
      given && !given.includes('://')
        ? given
        : `${fallback} ${asPositiveInt(row.num) ?? providerId}`;
    const quality = parseQuality(rawName);
    const image = imageUrl(kind === 'series' ? row.cover : row.stream_icon);
    const backdropRow = Array.isArray(row.backdrop_path) ? row.backdrop_path[0] : row.backdrop_path;
    const backdrop = imageUrl(backdropRow);
    if (image) art[artId(image)] = image;
    if (backdrop) art[artId(backdrop)] = backdrop;
    const runtime = asPositiveInt(row.episode_run_time);
    return {
      ref: `${kind[0]}-${refId(providerId)}`,
      kind,
      title: quality.displayName.slice(0, 300),
      badges: quality.badges,
      categoryId: null,
      number: kind === 'live' ? asPositiveInt(row.num) : null,
      art: image ? artId(image) : null,
      year: kind === 'live' ? null : yearOf(row.year, row.releaseDate, row.release_date, rawName),
      rating: kind === 'live' ? null : ratingOf(row),
      addedAt:
        (asPositiveInt(kind === 'series' ? row.last_modified : row.added) ?? 0) * 1000 || null,
      hasGuide: false,
      providerId,
      epgId: null,
      tvgId: kind === 'live' ? asString(row.epg_channel_id) : null,
      ext: kind === 'movie' ? containerExtension(row.container_extension, 'mp4') : null,
      url: null,
      userAgent: null,
      referrer: null,
      plot: clip(asString(row.plot), 2000),
      genre: clip(asString(row.genre), 200),
      cast: clip(asString(row.cast), 500),
      director: clip(asString(row.director), 200),
      durationSec: runtime ? runtime * 60 : null,
      backdrop: backdrop ? artId(backdrop) : null,
    };
  }

  private async importM3u(
    source: Extract<CinemaSource, { kind: 'm3u' }>,
    progress: Progress,
    signal?: AbortSignal,
  ) {
    progress({ step: 'live' });
    let entries: M3uEntry[];
    let guideUrls: string[];
    try {
      const parsed = parseM3u(await this.text(source.url, MAX_LIST, signal), source.url);
      entries = parsed.entries;
      guideUrls = parsed.header.tvgUrls;
    } catch (error) {
      if (error instanceof CinemaError) throw error;
      return fail('CINEMA_SOURCE_INVALID');
    }
    const snapshot = emptySnapshot();
    snapshot.providerGuideUrl = guideUrls[0] ?? null;
    const groups = new Map<string, { kind: CatalogKind; label: string; count: number }>();
    const series = new Map<string, StoredItem>();
    const groupId = (kind: CatalogKind, label: string) => {
      const id = `${kind[0]}${createHash('sha256').update(label).digest('hex').slice(0, 12)}`;
      const group = groups.get(id) ?? { kind, label, count: 0 };
      group.count++;
      groups.set(id, group);
      return id;
    };
    for (const entry of entries) {
      const quality = parseQuality(entry.name);
      if (entry.logo) snapshot.art[artId(entry.logo)] = entry.logo;
      const art = entry.logo ? artId(entry.logo) : null;
      if (entry.kind === 'episode') {
        const seriesName = entry.seriesName ?? entry.name;
        const key = normalizeForSearch(seriesName) || seriesName;
        const ref = `s-${createHash('sha256').update(key).digest('hex').slice(0, 24)}`;
        let show = series.get(ref);
        if (!show) {
          show = baseItem('series', ref, parseQuality(seriesName).displayName, [], art);
          show.categoryId = entry.group ? groupId('series', entry.group) : null;
          show.providerId = ref.slice(2);
          series.set(ref, show);
          snapshot.items.push(show);
        }
        (snapshot.episodes[ref] ??= []).push({
          ref: `e-${entry.id}`,
          season: entry.season ?? 1,
          episode: entry.episode ?? (snapshot.episodes[ref]?.length ?? 0) + 1,
          title: quality.displayName,
          plot: null,
          durationSec: null,
          art,
          providerId: entry.id,
          ext: null,
          url: entry.url,
        });
        continue;
      }
      const kind: CatalogKind = entry.kind === 'movie' ? 'movie' : 'live';
      const item = baseItem(
        kind,
        `${kind[0]}-${entry.id}`,
        quality.displayName,
        quality.badges,
        art,
      );
      item.providerId = entry.id;
      item.categoryId = entry.group ? groupId(kind, entry.group) : null;
      item.number = kind === 'live' ? entry.number : null;
      item.year = kind === 'movie' ? yearOf(entry.name) : null;
      item.tvgId = entry.tvgId;
      item.url = entry.url;
      item.userAgent = entry.userAgent;
      item.referrer = entry.referrer;
      snapshot.items.push(item);
    }
    for (const list of Object.values(snapshot.episodes))
      list.sort((a, b) => a.season - b.season || a.episode - b.episode);
    for (const [id, group] of groups)
      snapshot.categories.push(category(group.kind, id, group.label, group.count));
    snapshot.importedAt = this.now();
    const count = (kind: CatalogKind) => snapshot.items.filter((item) => item.kind === kind).length;
    progress({
      counts: {
        live: count('live'),
        movies: count('movie'),
        series: count('series'),
        programmes: 0,
      },
    });
    return snapshot;
  }

  /** Lazily loads a series' seasons and episodes (Xtream `get_series_info`). */
  async seriesInfo(source: CinemaSource, item: StoredItem, signal?: AbortSignal) {
    if (source.kind !== 'xtream') return null;
    const urls = xtreamUrls(source.server, source.username, source.password);
    const json = asRecord(
      await this.json(
        urls.api({ action: 'get_series_info', series_id: item.providerId }),
        20 * MB,
        signal,
      ),
    );
    const info = asRecord(json.info);
    const art: Record<string, string> = {};
    const episodes: StoredEpisode[] = [];
    const groups = asRecord(json.episodes);
    for (const [seasonKey, list] of Object.entries(groups))
      for (const row of asRows(list)) {
        const id = asId(row.id);
        if (!id) continue;
        const detail = asRecord(row.info);
        const image = imageUrl(detail.movie_image ?? detail.cover_big);
        if (image) art[artId(image)] = image;
        episodes.push({
          ref: `e-${refId(id)}`,
          season: asPositiveInt(row.season) ?? asPositiveInt(seasonKey) ?? 1,
          episode: asPositiveInt(row.episode_num) ?? episodes.length + 1,
          title:
            clip(asString(row.title), 300) ??
            `Bölüm ${asPositiveInt(row.episode_num) ?? episodes.length + 1}`,
          plot: clip(asString(detail.plot), 2000),
          durationSec: asPositiveInt(detail.duration_secs),
          art: image ? artId(image) : null,
          providerId: id,
          ext: containerExtension(row.container_extension, 'mp4'),
          url: null,
        });
      }
    episodes.sort((a, b) => a.season - b.season || a.episode - b.episode);
    return {
      episodes,
      art,
      plot: clip(asString(info.plot), 2000),
      genre: clip(asString(info.genre), 200),
      cast: clip(asString(info.cast), 500),
      director: clip(asString(info.director), 200),
    };
  }

  /** Lazily loads a movie's plot, credits and duration (Xtream `get_vod_info`). */
  async vodInfo(source: CinemaSource, item: StoredItem, signal?: AbortSignal) {
    if (source.kind !== 'xtream') return null;
    const urls = xtreamUrls(source.server, source.username, source.password);
    const info = asRecord(
      asRecord(
        await this.json(
          urls.api({ action: 'get_vod_info', vod_id: item.providerId }),
          5 * MB,
          signal,
        ),
      ).info,
    );
    const backdropRow = Array.isArray(info.backdrop_path)
      ? info.backdrop_path[0]
      : info.backdrop_path;
    const backdrop = imageUrl(backdropRow);
    return {
      plot: clip(asString(info.plot ?? info.description), 2000),
      genre: clip(asString(info.genre), 200),
      cast: clip(asString(info.cast ?? info.actors), 500),
      director: clip(asString(info.director), 200),
      durationSec: asPositiveInt(info.duration_secs),
      backdrop,
    };
  }

  /** The guide URL to use: '' disables it; null means the provider's own. */
  guideUrl(source: CinemaSource, snapshot: CatalogSnapshot) {
    if (source.guideUrl === '') return null;
    if (source.guideUrl) return source.guideUrl;
    if (source.kind === 'xtream')
      return xtreamUrls(source.server, source.username, source.password).xmltv();
    return snapshot.providerGuideUrl ?? null;
  }

  /**
   * Streams the XMLTV and keeps programmes of matched live channels inside
   * the guide window. Returns programmes per XMLTV id and item ref → id.
   */
  async importGuide(url: string, items: StoredItem[], progress: Progress, signal?: AbortSignal) {
    progress({ step: 'guide' });
    const now = this.now();
    const from = now - (this.options.guidePastMs ?? 6 * 3600_000);
    const to = now + (this.options.guideFutureMs ?? 48 * 3600_000);
    const max = this.options.maxProgrammes ?? 300_000;
    const live = items.filter((item) => item.kind === 'live');
    const declared: EpgChannelRef[] = [];
    let matches: Map<string, string> | null = null;
    let wanted = new Set<string>();
    const resolve = () => {
      const matcher = new EpgMatcher(declared);
      const result = new Map<string, string>();
      for (const item of live) {
        const id = matcher.match({ tvgId: item.tvgId, name: item.title }) ?? item.tvgId;
        if (id) result.set(item.ref, id);
      }
      matches = result;
      wanted = new Set(result.values());
    };
    const programmes: Record<string, CinemaProgramme[]> = {};
    let kept = 0;
    let seen = 0;
    const response = await this.request(url, signal);
    try {
      for await (const event of parseXmltv(decodedChunks(response, 400 * MB))) {
        if (event.type === 'channel') {
          if (declared.length < 50_000)
            declared.push({ id: event.id, displayNames: event.displayNames });
          continue;
        }
        if (!matches) resolve();
        seen++;
        if (seen % 20_000 === 0)
          progress({ counts: { live: live.length, movies: 0, series: 0, programmes: kept } });
        if (!wanted.has(event.channelId) || event.stop <= from || event.start >= to || kept >= max)
          continue;
        (programmes[event.channelId] ??= []).push(publicProgramme(event));
        kept++;
      }
    } catch (error) {
      if (error instanceof CinemaError) throw error;
      fail('CINEMA_SOURCE_INVALID');
    }
    if (!matches) resolve();
    for (const list of Object.values(programmes)) {
      list.sort((a, b) => a.start - b.start);
      for (let i = 0; i < list.length - 1; i++)
        if (list[i].stop <= list[i].start) list[i].stop = list[i + 1].start;
    }
    return { programmes, matches: matches! as Map<string, string>, count: kept };
  }
}

/** Response body → decoded text chunks; gunzips by magic bytes; stops at `max` bytes. */
async function* decodedChunks(response: Response, max: number): AsyncGenerator<string> {
  if (!response.body) return;
  const body = Readable.fromWeb(response.body as import('node:stream/web').ReadableStream);
  let total = 0;
  const limited = (async function* () {
    for await (const chunk of body as AsyncIterable<Uint8Array>) {
      total += chunk.length;
      if (total > max) throw new CinemaError('CINEMA_SOURCE_INVALID');
      yield chunk;
    }
  })();
  const first = await limited.next();
  if (first.done) return;
  const all = (async function* () {
    yield first.value;
    yield* limited;
  })();
  let bytes: AsyncIterable<Uint8Array> = all;
  if (first.value[0] === 0x1f && first.value[1] === 0x8b) {
    const gunzip = createGunzip();
    const input = Readable.from(all);
    input.on('error', (error) => gunzip.destroy(error));
    bytes = input.pipe(gunzip);
  }
  const decoder = new TextDecoder();
  let unpacked = 0;
  for await (const chunk of bytes) {
    unpacked += chunk.length;
    if (unpacked > max * 4) throw new CinemaError('CINEMA_SOURCE_INVALID');
    yield decoder.decode(chunk, { stream: true });
  }
  yield decoder.decode();
}

function publicProgramme(event: XmltvProgramme): CinemaProgramme {
  return {
    start: event.start,
    stop: event.stop,
    title: event.title,
    subTitle: event.subTitle,
    description: event.description,
    category: event.category,
  };
}

function category(kind: CatalogKind, id: string, name: string, count: number): CinemaCategory {
  const flag = parseCategoryFlag(name);
  return { id, kind, label: flag.label || name, flag: flag.flag, count };
}

function baseItem(
  kind: CatalogKind,
  ref: string,
  title: string,
  badges: string[],
  art: string | null,
): StoredItem {
  return {
    ref,
    kind,
    title: title.slice(0, 300),
    badges,
    categoryId: null,
    number: null,
    art,
    year: null,
    rating: null,
    addedAt: null,
    hasGuide: false,
    providerId: '',
    epgId: null,
    tvgId: null,
    ext: null,
    url: null,
    userAgent: null,
    referrer: null,
    plot: null,
    genre: null,
    cast: null,
    director: null,
    durationSec: null,
    backdrop: null,
  };
}

function imageUrl(value: unknown) {
  const text = asString(value);
  if (!text || text.length > 2048) return null;
  try {
    const url = new URL(text);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

const clip = (value: string | null, max: number) => (value ? value.slice(0, max) : null);

/** For logs: never prints a provider URL or credential. */
export const safeError = (error: unknown) =>
  error instanceof CinemaError
    ? error.message
    : maskText(error instanceof Error ? error.message : 'unknown');
