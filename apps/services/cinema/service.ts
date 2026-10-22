import { createHash } from 'node:crypto';
import { join } from 'node:path';
import {
  directsSession,
  playbackPosition,
  type ActivityResponse,
} from '../../../packages/activity-protocol/src/index';
import { maskServer } from '../../../packages/community-cinema/src/mask';
import { detectXtreamExport } from '../../../packages/community-cinema/src/m3u';
import { normalizeForSearch } from '../../../packages/community-cinema/src/normalize';
import { cleanEpisodeTitle, cleanVodTitle } from '../../../packages/community-cinema/src/titles';
import {
  liveExtension,
  xtreamUrls,
  type XtreamAccount,
} from '../../../packages/community-cinema/src/xtream';
import type {
  CinemaContinueItem,
  CinemaVideoInfo,
  CinemaTitleLinks,
  CinemaDetails,
  CinemaExternalSubtitles,
  CinemaImportProgress,
  CinemaStatus,
  CinemaSubtitleTrack,
  CinemaWatch,
  RmdbPerson,
  RmdbReviewInput,
  RmdbWorkDetails,
} from '../../../packages/community-cinema/src/types';
import {
  Catalog,
  emptySnapshot,
  programmesOf,
  publicItem,
  type CatalogSnapshot,
  type StoredItem,
} from './catalog';
import {
  sourceSchema,
  type CinemaSource,
  type CommunityConfig,
  type ConfigStore,
} from './config-store';
import { CinemaError, safeError, type Importer } from './importer';
import { tmdbOf, type Rmdb, type RmdbMeta, type StoredWork } from './rmdb';
import type { SubtitleCandidate, SubtitleQuery } from './subtitles';
import type { TitleMetadata } from './metadata';
import type { SecureFiles } from './secure-file';
import { StremioCinema, type StremioFetch } from './stremio';

/** Cards in a "Devam et" row. */
const CONTINUE_LIMIT = 20;
export type RelaySource = { url: string; headers: Record<string, string>; live: boolean };
export type RelayInfo = {
  session: string;
  live: boolean;
  offsetSec: number;
  epoch: number;
  durationSec: number | null;
  producedSec?: number;
  /** PROGRAM-DATE-TIME of output time 0 (epoch ms), once the first playlist exists. */
  originPdtMs?: number | null;
  windowStartSec?: number;
  audioTracks?: { index: number; label: string }[];
  audioTrack?: number | null;
  subtitleTracks?: CinemaSubtitleTrack[];
  video?: CinemaVideoInfo | null;
};

/** The part of the relay manager the service drives. */
export interface RelayPort {
  acquire(input: {
    communityId: string;
    key: string;
    source: RelaySource;
    startSec?: number;
    slots: number;
    audio?: number | null;
    original?: boolean;
  }): Promise<RelayInfo>;
  sessionsOf(communityId: string): RelayInfo[];
  stop(session: string): Promise<void>;
  stopCommunity(communityId: string): Promise<void>;
}

/** The part of the SubDL client the service drives. */
export interface SubtitlePort {
  verify(key: string): Promise<void>;
  search(key: string, query: SubtitleQuery): Promise<SubtitleCandidate[]>;
  download(id: string, episode?: { season: number; episode: number }): Promise<string>;
}

export type TicketIssuer = (claims: { session: string; userId: string; hallId: string }) => {
  ticket: string;
  expiresAt: number;
};

const fail = (code: string): never => {
  throw new CinemaError(code);
};

/** Catalog snapshots, encrypted and gzipped, one per community; loaded on first use. */
export class CatalogStore {
  private readonly loaded = new Map<string, Catalog>();
  private readonly pending = new Map<string, NodeJS.Timeout>();
  constructor(
    private readonly directory: string,
    private readonly files: SecureFiles,
  ) {}
  private path(communityId: string) {
    return join(this.directory, 'catalogs', `${communityId}.enc`);
  }
  get(communityId: string) {
    let catalog = this.loaded.get(communityId);
    if (!catalog) {
      catalog = new Catalog(
        this.files.read<CatalogSnapshot>(this.path(communityId), true) ?? emptySnapshot(),
      );
      this.loaded.set(communityId, catalog);
    }
    return catalog;
  }
  put(communityId: string, snapshot: CatalogSnapshot) {
    const catalog = new Catalog(snapshot);
    void this.write(communityId, snapshot);
    this.loaded.set(communityId, catalog);
    return catalog;
  }
  save(communityId: string) {
    const timer = this.pending.get(communityId);
    if (timer) clearTimeout(timer);
    this.pending.delete(communityId);
    const catalog = this.loaded.get(communityId);
    if (catalog) void this.write(communityId, catalog.snapshot);
  }
  /** Writes are queued per community so an older snapshot never lands after a newer one. */
  private readonly writes = new Map<string, Promise<void>>();
  private write(communityId: string, snapshot: CatalogSnapshot) {
    const previous = this.writes.get(communityId) ?? Promise.resolve();
    const next = previous
      .then(() => this.files.writeAsync(this.path(communityId), snapshot, true))
      .catch(() => {});
    this.writes.set(communityId, next);
    return next;
  }
  /** Waits for queued writes (shutdown, tests). */
  async settled() {
    await Promise.all(this.writes.values());
  }
  /** Loads every given community's catalog now instead of on the first request. */
  preload(communityIds: string[]) {
    for (const communityId of communityIds) this.get(communityId);
  }
  /** Lazily fetched details are worth keeping, but not worth a 30 MB write per click. */
  saveSoon(communityId: string) {
    if (this.pending.has(communityId)) return;
    const timer = setTimeout(() => this.save(communityId), 30_000);
    timer.unref();
    this.pending.set(communityId, timer);
  }
  flush() {
    for (const communityId of [...this.pending.keys()]) this.save(communityId);
  }
  /** Drops the catalog; a write still in flight lands first, then the file goes. */
  async remove(communityId: string) {
    clearTimeout(this.pending.get(communityId));
    this.pending.delete(communityId);
    this.loaded.delete(communityId);
    await this.writes.get(communityId);
    this.writes.delete(communityId);
    this.files.remove(this.path(communityId));
  }
}

type Job = { progress: CinemaImportProgress; abort: AbortController };

export type CinemaServiceOptions = {
  configs: ConfigStore;
  catalogs: CatalogStore;
  importer: Importer;
  relays: RelayPort;
  tickets: TicketIssuer;
  /** Reads the hall activity with the member's own token. */
  activity(token: string, hallId: string): Promise<ActivityResponse>;
  /** Fetches provider artwork (size and type checked). */
  image(url: string): Promise<{ body: Buffer; type: string }>;
  /** Subtitle search with the owner's key; absent, films only offer their own subtitles. */
  subtitles?: SubtitlePort;
  /** IMDb ids and air dates; absent, the IMDb link stays off and no air dates come from TMDB. */
  metadata?: TitleMetadata;
  /** The community's record of what the hall watched; absent, nothing is recorded. */
  rmdb?: Rmdb;
  maxRelays?: number;
  /** Stremio's API and add-ons; absent, the hall cannot link a Stremio account. */
  stremio?: StremioFetch;
  /** User agent and network policy for Stremio subtitle downloads. */
  stremioNetwork?: { userAgent: string; allowPrivateNetwork?: boolean };
  log?: (line: string) => void;
  now?: () => number;
};

const GUIDE_REFRESH_MS = 12 * 3600_000;
const CATALOG_REFRESH_MS = 24 * 3600_000;
const SUBTITLE_LIST_MS = 12 * 3600_000;
// A search that found nothing is asked again sooner: SubDL may simply not have it yet.
const SUBTITLE_EMPTY_MS = 10 * 60_000;
const SUBTITLE_LISTS = 500;
const SUBTITLE_FILE_BYTES = 16 * 1024 * 1024;

export class CinemaService {
  private readonly jobs = new Map<string, Job>();
  private readonly lastJobs = new Map<string, CinemaImportProgress>();
  /** Relay session → the catalog ref it plays, for VOD reuse; pruned as relays stop. */
  private readonly sessionRefs = new Map<
    string,
    { communityId: string; ref: string; audio: number | null }
  >();
  /** The hall's audio stream per item (`communityId\nref`); everyone hears the same one. */
  private readonly audioChoices = new Map<string, number>();
  private readonly art = new Map<string, { body: Buffer; type: string }>();
  private artBytes = 0;
  private readonly artLoads = new Map<string, Promise<{ body: Buffer; type: string }>>();
  /** `communityId\nref` → the last subtitle search; downloads must come from it. */
  private readonly subtitleLists = new Map<string, { at: number; list: SubtitleCandidate[] }>();
  private readonly subtitleSearches = new Map<string, Promise<SubtitleCandidate[]>>();
  /** `communityId\nref\nid` → WebVTT, least recently used first (about 16 MB). */
  private readonly subtitleFiles = new Map<string, string>();
  private readonly subtitleLoads = new Map<string, Promise<string>>();
  private subtitleBytes = 0;

  readonly stremio: StremioCinema;

  constructor(private readonly options: CinemaServiceOptions) {
    const { configs } = options;
    this.stremio = new StremioCinema({
      fetch: options.stremio ?? (() => Promise.reject(new Error('Stremio is not configured'))),
      account: (communityId) => configs.get(communityId).stremio ?? null,
      picks: (communityId) => configs.get(communityId).stremioPicks ?? [],
      savePicks: (communityId, picks) =>
        configs.update(communityId, (config) => ({ ...config, stremioPicks: picks })),
      saveAccount: (communityId, account) =>
        configs.update(communityId, (config) => ({ ...config, stremio: account })),
      userAgent: options.stremioNetwork?.userAgent,
      allowPrivateNetwork: options.stremioNetwork?.allowPrivateNetwork,
      now: options.now,
    });
  }

  /** Owner: forgets Stremio and stops whatever the hall plays from it. */
  async stremioUnlink(communityId: string) {
    this.stremio.unlink(communityId);
    await this.serial(communityId, async () => {
      for (const [session, entry] of this.sessionRefs)
        if (entry.communityId === communityId && entry.ref.startsWith('x-')) {
          this.sessionRefs.delete(session);
          await this.options.relays.stop(session);
        }
    });
  }

  private now() {
    return this.options.now?.() ?? Date.now();
  }

  private log(line: string) {
    this.options.log?.(line);
  }

  status(communityId: string, isOwner: boolean): CinemaStatus {
    const config = this.options.configs.get(communityId);
    const catalog = config.source ? this.options.catalogs.get(communityId) : null;
    const counts = catalog?.counts() ?? { live: 0, movies: 0, series: 0, programmes: 0 };
    return {
      communityId,
      hallChannelId: config.hallChannelId,
      isOwner,
      connected: !!config.source,
      // Only the owner learns anything about the provider account.
      source:
        config.source && isOwner
          ? {
              kind: config.source.kind,
              label: isOwner
                ? maskServer(
                    config.source.kind === 'xtream' ? config.source.server : config.source.url,
                  )
                : null,
              hasCustomGuide: !!config.source.guideUrl,
            }
          : null,
      account:
        config.account && isOwner
          ? {
              status: config.account.status,
              expiresAt: config.account.expiresAt,
              maxConnections: config.account.maxConnections,
            }
          : null,
      catalog: {
        ...counts,
        importedAt: catalog?.snapshot.importedAt ?? null,
        guideImportedAt: catalog?.snapshot.guideImportedAt ?? null,
      },
      importing: this.jobs.get(communityId)?.progress ?? this.failedJob(communityId),
      relaySlots: this.slots(config),
      subtitleSearch: !!config.subtitleKey && !!this.options.subtitles,
      tmdb: !!config.tmdbKey && !!this.options.metadata,
      audioDefault: config.audioDefault ?? 'turkish',
      stremio: {
        linked: !!config.stremio,
        email: isOwner ? (config.stremio?.email ?? null) : null,
        linkedAt: config.stremio?.linkedAt ?? null,
      },
    };
  }

  private failedJob(communityId: string) {
    const last = this.lastJobs.get(communityId);
    return last?.step === 'failed' ? last : null;
  }

  private slots(config: CommunityConfig) {
    const cap = Math.max(1, this.options.maxRelays ?? 1);
    const account = config.account?.maxConnections ?? 1;
    return Math.max(1, Math.min(cap, account, config.relaySlots || 1));
  }

  setHall(communityId: string, channelId: string | null) {
    if (channelId) {
      const other = this.options.configs.communityOfHall(channelId);
      if (other && other !== communityId) fail('CINEMA_HALL_REQUIRED');
    }
    this.options.configs.update(communityId, (config) => ({ ...config, hallChannelId: channelId }));
  }

  /** Validates, verifies with the provider, stores and starts the import. */
  async connect(communityId: string, userId: string, input: unknown) {
    const parsed = sourceSchema.safeParse(normalizeSource(input));
    if (!parsed.success) return fail('CINEMA_SOURCE_INVALID');
    const source = parsed.data;
    const account = await this.options.importer.verify(source);
    this.jobs.get(communityId)?.abort.abort();
    this.jobs.delete(communityId);
    await this.options.relays.stopCommunity(communityId);
    await this.options.catalogs.remove(communityId);
    this.options.configs.update(communityId, (config) => ({
      ...config,
      source,
      account,
      connectedAt: this.now(),
      connectedBy: userId,
      relaySlots: Math.max(1, Math.min(this.options.maxRelays ?? 1, account?.maxConnections ?? 1)),
    }));
    this.startImport(communityId, 'all');
  }

  async disconnect(communityId: string) {
    this.forgetSubtitles(communityId);
    this.jobs.get(communityId)?.abort.abort();
    this.jobs.delete(communityId);
    this.lastJobs.delete(communityId);
    for (const key of this.audioChoices.keys())
      if (key.startsWith(`${communityId}\n`)) this.audioChoices.delete(key);
    await this.options.relays.stopCommunity(communityId);
    await this.options.catalogs.remove(communityId);
    this.options.configs.update(communityId, (config) => ({
      ...config,
      source: null,
      account: null,
      connectedAt: null,
      connectedBy: null,
    }));
  }

  /** Owner: verifies and stores (or removes) the community's SubDL API key. */
  async setSubtitleKey(communityId: string, key: string | null) {
    const subtitles = this.options.subtitles ?? fail('CINEMA_SUBTITLE_UNAVAILABLE');
    if (key) await subtitles.verify(key);
    this.options.configs.update(communityId, (config) => ({ ...config, subtitleKey: key }));
    this.forgetSubtitles(communityId);
  }

  /** Owner: whether films start with a Turkish dub when there is one, or their own language. */
  setAudioDefault(communityId: string, value: 'turkish' | 'original') {
    this.options.configs.update(communityId, (config) => ({ ...config, audioDefault: value }));
  }

  /** Owner: verifies and stores (or removes) the community's TMDB key. */
  async setTmdbKey(communityId: string, key: string | null) {
    const metadata = this.options.metadata ?? fail('CINEMA_METADATA_UNAVAILABLE');
    if (key) await metadata.verify(key);
    this.options.configs.update(communityId, (config) => ({ ...config, tmdbKey: key }));
  }

  /** IMDb and TMDB ids of a film or series; an episode answers for its series. */
  async titleLinks(communityId: string, ref: string): Promise<CinemaTitleLinks> {
    if (ref.startsWith('x-')) {
      const found = this.stremio.imdbOf(communityId, ref) ?? fail('CINEMA_ITEM_NOT_FOUND');
      return { kind: found.kind, tmdbId: null, imdbId: found.imdbId };
    }
    const catalog = this.catalog(communityId);
    const item = ref.startsWith('e-') ? catalog.episode(ref)?.series : catalog.item(ref);
    if (!item || item.kind === 'live') return fail('CINEMA_ITEM_NOT_FOUND');
    const kind = item.kind === 'series' ? 'series' : 'movie';
    // The provider gives the TMDB id with the details; fetch them once if needed.
    if (item.tmdbId === undefined || item.tmdbId === null)
      await this.details(communityId, item.ref).catch(() => null);
    const tmdbId = Number(tmdbOf(item.tmdbId)) || null;
    const key = this.options.configs.get(communityId).tmdbKey ?? null;
    const imdbId =
      tmdbId && this.options.metadata
        ? await this.options.metadata.imdbId(kind, tmdbId, key).catch(() => null)
        : null;
    return { kind, tmdbId, imdbId };
  }

  private forgetSubtitles(communityId: string) {
    const prefix = `${communityId}\n`;
    for (const key of this.subtitleLists.keys())
      if (key.startsWith(prefix)) this.subtitleLists.delete(key);
    for (const [key, text] of this.subtitleFiles)
      if (key.startsWith(prefix)) {
        this.subtitleFiles.delete(key);
        this.subtitleBytes -= text.length;
      }
  }

  /** Subtitles found online for a film or episode of the hall's catalog. */
  async externalSubtitles(communityId: string, ref: string): Promise<CinemaExternalSubtitles> {
    if (ref.startsWith('x-')) return this.stremio.subtitles(communityId, ref);
    const key = this.options.configs.get(communityId).subtitleKey;
    this.catalog(communityId);
    if (!key || !this.options.subtitles) return { available: false, subtitles: [] };
    const list = await this.subtitleList(communityId, ref, key);
    return {
      available: true,
      subtitles: list.map(({ id, label, language, hearingImpaired }) => ({
        id,
        label,
        language,
        hearingImpaired,
      })),
    };
  }

  /** One subtitle from the item's last search, as WebVTT on the work's timeline. */
  async subtitleFile(communityId: string, ref: string, id: string) {
    if (ref.startsWith('x-')) return this.stremio.subtitleFile(communityId, ref, id);
    const key = this.options.configs.get(communityId).subtitleKey;
    const subtitles = this.options.subtitles;
    if (!key || !subtitles) return fail('CINEMA_SUBTITLE_UNAVAILABLE');
    const list = await this.subtitleList(communityId, ref, key);
    if (!list.some((candidate) => candidate.id === id)) fail('CINEMA_ITEM_NOT_FOUND');
    const cacheKey = `${communityId}\n${ref}\n${id}`;
    const cached = this.subtitleFiles.get(cacheKey);
    if (cached !== undefined) {
      this.subtitleFiles.delete(cacheKey);
      this.subtitleFiles.set(cacheKey, cached);
      return cached;
    }
    let load = this.subtitleLoads.get(cacheKey);
    if (!load) {
      const episode = this.catalog(communityId).episode(ref)?.episode;
      load = subtitles
        .download(id, episode ? { season: episode.season, episode: episode.episode } : undefined)
        .finally(() => this.subtitleLoads.delete(cacheKey));
      this.subtitleLoads.set(cacheKey, load);
    }
    const text = await load;
    if (!this.subtitleFiles.has(cacheKey)) {
      this.subtitleFiles.set(cacheKey, text);
      this.subtitleBytes += text.length;
      for (const [oldKey, old] of this.subtitleFiles) {
        if (this.subtitleBytes <= SUBTITLE_FILE_BYTES) break;
        this.subtitleFiles.delete(oldKey);
        this.subtitleBytes -= old.length;
      }
    }
    return text;
  }

  private async subtitleList(communityId: string, ref: string, key: string) {
    const cacheKey = `${communityId}\n${ref}`;
    const cached = this.subtitleLists.get(cacheKey);
    const ttl = cached?.list.length ? SUBTITLE_LIST_MS : SUBTITLE_EMPTY_MS;
    if (cached && this.now() - cached.at < ttl) return cached.list;
    let search = this.subtitleSearches.get(cacheKey);
    if (!search) {
      search = this.subtitleQuery(communityId, ref)
        .then(async (query) => {
          const via = query.tmdbId ? 'tmdb' : 'name';
          try {
            const found = await this.options.subtitles!.search(key, query);
            this.log(`subtitles ${ref}: ${found.length} found by ${via}`);
            return found;
          } catch (error) {
            this.log(`subtitles ${ref}: search by ${via} failed (${safeError(error)})`);
            throw error;
          }
        })
        .finally(() => this.subtitleSearches.delete(cacheKey));
      this.subtitleSearches.set(cacheKey, search);
    }
    const list = await search;
    this.subtitleLists.delete(cacheKey);
    this.subtitleLists.set(cacheKey, { at: this.now(), list });
    for (const oldKey of this.subtitleLists.keys()) {
      if (this.subtitleLists.size <= SUBTITLE_LISTS) break;
      this.subtitleLists.delete(oldKey);
    }
    return list;
  }

  /** TMDB id when the provider gave one (asking for it once on older catalogs), else name. */
  private async subtitleQuery(communityId: string, ref: string): Promise<SubtitleQuery> {
    const catalog = this.catalog(communityId);
    const hit = ref.startsWith('e-') ? catalog.episode(ref) : null;
    // Titles often end in the year, which goes to SubDL on its own.
    const name = (title: string) => title.replace(/\s*\(\d{4}\)\s*$/, '');
    if (hit)
      return {
        kind: 'tv',
        tmdbId: hit.series.tmdbId ?? null,
        name: name(hit.series.title),
        year: hit.series.year,
        season: hit.episode.season,
        episode: hit.episode.episode,
      };
    const item = catalog.item(ref);
    if (item?.kind !== 'movie') return fail('CINEMA_ITEM_NOT_FOUND');
    const source = this.options.configs.get(communityId).source;
    if (item.tmdbId === undefined && source?.kind === 'xtream') {
      const info = await this.options.importer.vodInfo(source, item).catch(() => null);
      item.tmdbId = info?.tmdbId ?? null;
      this.options.catalogs.saveSoon(communityId);
    }
    return { kind: 'movie', tmdbId: item.tmdbId ?? null, name: name(item.title), year: item.year };
  }

  reload(communityId: string, scope: 'all' | 'guide') {
    if (!this.options.configs.get(communityId).source) fail('CINEMA_NOT_CONNECTED');
    if (this.jobs.has(communityId)) fail('CINEMA_IMPORT_RUNNING');
    this.startImport(communityId, scope);
  }

  /** Background refresh: guide every 12 h, catalog every 24 h. */
  refreshDue() {
    for (const config of this.options.configs.all()) {
      if (!config.source || this.jobs.has(config.communityId)) continue;
      const catalog = this.options.catalogs.get(config.communityId).snapshot;
      const now = this.now();
      // After a failure, wait an hour instead of hitting the provider every 10 minutes.
      const last = this.lastJobs.get(config.communityId);
      if (last?.step === 'failed' && now - (last.finishedAt ?? 0) < 3600_000) continue;
      if (!catalog.importedAt || now - catalog.importedAt > CATALOG_REFRESH_MS)
        this.startImport(config.communityId, 'all');
      else if (!catalog.guideImportedAt || now - catalog.guideImportedAt > GUIDE_REFRESH_MS)
        this.startImport(config.communityId, 'guide');
    }
  }

  private startImport(communityId: string, scope: 'all' | 'guide') {
    const abort = new AbortController();
    const job: Job = {
      abort,
      progress: {
        step: 'connecting',
        counts: { live: 0, movies: 0, series: 0, programmes: 0 },
        error: null,
        startedAt: this.now(),
        finishedAt: null,
      },
    };
    this.jobs.set(communityId, job);
    const update = (change: Partial<CinemaImportProgress>) => {
      job.progress = {
        ...job.progress,
        ...change,
        counts: { ...job.progress.counts, ...change.counts },
      };
    };
    void (async () => {
      const source = this.options.configs.get(communityId).source;
      if (!source) return;
      const { importer, catalogs } = this.options;
      let catalog = catalogs.get(communityId);
      if (scope === 'all') {
        const snapshot = await importer.importCatalog(source, update, abort.signal);
        const previous = catalog.snapshot;
        // A provider that answers with nothing is treated as down, not as an empty catalog.
        if (!snapshot.items.length && previous.items.length)
          throw new CinemaError('CINEMA_PROVIDER_UNREACHABLE');
        // Keep the current guide until the new one arrives.
        snapshot.programmes = previous.programmes;
        snapshot.guideImportedAt = previous.guideImportedAt;
        if (abort.signal.aborted) return;
        // Channels that survive the reload keep their guide match until the next guide import.
        const matched = new Map(previous.items.map((item) => [item.ref, item.epgId]));
        for (const item of snapshot.items) {
          item.epgId = matched.get(item.ref) ?? null;
          item.hasGuide = !!item.epgId && !!programmesOf(snapshot.programmes, item.epgId)?.length;
        }
        catalog = catalogs.put(communityId, snapshot);
      }
      const url = importer.guideUrl(source, catalog.snapshot);
      if (url) {
        try {
          const guide = await importer.importGuide(
            url,
            catalog.snapshot.items,
            update,
            abort.signal,
          );
          if (abort.signal.aborted) return;
          if (!guide.count && Object.keys(catalog.snapshot.programmes).length)
            throw new CinemaError('CINEMA_PROVIDER_UNREACHABLE');
          catalog.setGuide(guide.programmes, guide.matches, this.now());
          catalogs.save(communityId);
          update({ counts: { ...job.progress.counts, programmes: guide.count } });
        } catch (error) {
          // Many providers serve no XMLTV; the catalog is already saved, so only a
          // guide-only reload reports the guide as failed.
          if (scope === 'guide') throw error;
          this.log(`cinema guide import skipped for ${communityId}: ${safeError(error)}`);
        }
      }
      update({ step: 'completed', finishedAt: this.now() });
    })()
      .catch((error: unknown) => {
        if (abort.signal.aborted) return;
        const code = error instanceof CinemaError ? error.message : 'CINEMA_PROVIDER_UNREACHABLE';
        this.log(`cinema import failed for ${communityId}: ${safeError(error)}`);
        update({ step: 'failed', error: code, finishedAt: this.now() });
      })
      .finally(() => {
        if (this.jobs.get(communityId) === job) {
          this.jobs.delete(communityId);
          this.lastJobs.set(communityId, job.progress);
        }
      });
  }

  catalog(communityId: string) {
    if (!this.options.configs.get(communityId).source) fail('CINEMA_NOT_CONNECTED');
    return this.options.catalogs.get(communityId);
  }

  async details(communityId: string, ref: string): Promise<CinemaDetails> {
    if (ref.startsWith('x-')) return this.stremio.pickDetails(communityId, ref);
    const catalog = this.catalog(communityId);
    if (ref.startsWith('e-')) {
      // An episode answers with its series; the episode itself is in `seasons`.
      const hit = catalog.episode(ref) ?? fail('CINEMA_ITEM_NOT_FOUND');
      const series = await this.details(communityId, hit.series.ref);
      return {
        ...series,
        plot: hit.episode.plot ?? series.plot,
        durationSec: hit.episode.durationSec,
      };
    }
    const source = this.options.configs.get(communityId).source!;
    const item = catalog.item(ref) ?? fail('CINEMA_ITEM_NOT_FOUND');
    let changed = false;
    if (item.kind === 'series' && !catalog.episodes(ref)) {
      const info = await this.options.importer.seriesInfo(source, item);
      if (info) {
        catalog.setEpisodes(ref, info.episodes, info.art);
        item.plot ??= info.plot;
        item.genre ??= info.genre;
        item.cast ??= info.cast;
        item.director ??= info.director;
        item.tmdbId ??= info.tmdbId;
        changed = true;
      }
    }
    if (
      item.kind === 'movie' &&
      source.kind === 'xtream' &&
      item.plot === null &&
      item.durationSec === null
    ) {
      const info = await this.options.importer.vodInfo(source, item).catch(() => null);
      if (info) {
        item.plot = info.plot ?? '';
        item.genre ??= info.genre;
        item.cast ??= info.cast;
        item.director ??= info.director;
        item.tmdbId ??= info.tmdbId;
        item.durationSec = info.durationSec;
        if (info.backdrop) {
          const id = catalog.registerArt(info.backdrop);
          item.backdrop ??= id;
        }
        changed = true;
      }
    }
    if (changed) this.options.catalogs.saveSoon(communityId);
    const seasons = new Map<number, CinemaDetails['seasons'][number]['episodes']>();
    for (const episode of catalog.episodes(ref) ?? [])
      seasons.set(episode.season, [
        ...(seasons.get(episode.season) ?? []),
        {
          ref: episode.ref,
          season: episode.season,
          episode: episode.episode,
          title: episode.title,
          plot: episode.plot,
          durationSec: episode.durationSec,
          art: episode.art,
          airDate: episode.airDate ?? null,
        },
      ]);
    return {
      item: publicItem(item),
      plot: item.plot || null,
      genre: item.genre,
      cast: item.cast,
      director: item.director,
      durationSec: item.durationSec,
      backdrop: item.backdrop,
      seasons: [...seasons]
        .sort((a, b) => a[0] - b[0])
        .map(([season, episodes]) => ({ season, episodes })),
      tmdbId: Number(tmdbOf(item.tmdbId)) || null,
      versions: catalog.versions(ref).map((other) => ({ ref: other.ref, badges: other.badges })),
    };
  }

  /**
   * Provider artwork through the service, cached in memory (about 48 MB). RMDB's own copies
   * come first: they outlive the account and its catalog.
   */
  async image(communityId: string, id: string) {
    const key = `${communityId}:${id}`;
    const cached = this.art.get(key);
    if (cached) {
      this.art.delete(key);
      this.art.set(key, cached);
      return cached;
    }
    const store = this.options.rmdb?.store;
    const kept = store?.hasArt(communityId, id) ? store.readArt(communityId, id) : null;
    if (kept) return this.remember(key, kept);
    const url =
      this.stremio.artUrl(communityId, id) ??
      this.catalog(communityId).artUrl(id) ??
      fail('CINEMA_ITEM_NOT_FOUND');
    let load = this.artLoads.get(key);
    if (!load) {
      load = this.options.image(url).finally(() => this.artLoads.delete(key));
      this.artLoads.set(key, load);
    }
    const image = await load;
    if (this.art.has(key)) return image;
    return this.remember(key, image);
  }

  private remember(key: string, image: { body: Buffer; type: string }) {
    this.art.set(key, image);
    this.artBytes += image.body.length;
    for (const [oldKey, old] of this.art) {
      if (this.artBytes <= 48 * 1024 * 1024) break;
      this.art.delete(oldKey);
      this.artBytes -= old.body.length;
    }
    return image;
  }

  private forgetImage(key: string) {
    const image = this.art.get(key);
    if (!image) return;
    this.art.delete(key);
    this.artBytes -= image.body.length;
  }

  private relaySource(
    source: CinemaSource,
    account: XtreamAccount | null,
    item: StoredItem | null,
    episode: ReturnType<Catalog['episode']>,
  ): RelaySource {
    const headers = (userAgent: string | null, referrer: string | null) => ({
      ...(userAgent ? { 'User-Agent': userAgent } : {}),
      ...(referrer ? { Referer: referrer } : {}),
    });
    if (episode) {
      const { episode: entry } = episode;
      if (entry.url) return { url: entry.url, headers: {}, live: false };
      if (source.kind !== 'xtream') return fail('CINEMA_ITEM_NOT_FOUND');
      const urls = xtreamUrls(source.server, source.username, source.password);
      return { url: urls.episode(entry.providerId, entry.ext ?? 'mp4'), headers: {}, live: false };
    }
    if (!item || item.kind === 'series') return fail('CINEMA_ITEM_NOT_FOUND');
    const live = item.kind === 'live';
    if (item.url) return { url: item.url, headers: headers(item.userAgent, item.referrer), live };
    if (source.kind !== 'xtream') return fail('CINEMA_ITEM_NOT_FOUND');
    const urls = xtreamUrls(source.server, source.username, source.password);
    return {
      url: live
        ? urls.live(item.providerId, liveExtension(account))
        : urls.movie(item.providerId, item.ext ?? 'mp4'),
      headers: {},
      live,
    };
  }

  /**
   * Relays the hall's current item. Only the activity's selected item can be
   * relayed, so changing what the server's one connection plays requires the
   * hall's remote control.
   */
  private readonly locks = new Map<string, Promise<unknown>>();

  private serial<T>(key: string, run: () => Promise<T>): Promise<T> {
    const next = (this.locks.get(key) ?? Promise.resolve()).catch(() => {}).then(run);
    const tracked = next.finally(() => {
      if (this.locks.get(key) === tracked) this.locks.delete(key);
    });
    this.locks.set(key, tracked);
    return next;
  }

  /**
   * A fresh ticket for a running relay session, without acquiring or restarting
   * anything: the session must still play the hall's current item.
   */
  async renew(
    token: string,
    hallId: string,
    communityId: string,
    userId: string,
    session: string,
    name = userId,
  ) {
    const config = this.options.configs.get(communityId);
    if (!config.source && !config.stremio) fail('CINEMA_NOT_CONNECTED');
    if (config.hallChannelId !== hallId) fail('CINEMA_HALL_REQUIRED');
    const entry = this.sessionRefs.get(session);
    const relay = this.options.relays.sessionsOf(communityId).find((r) => r.session === session);
    if (!entry || entry.communityId !== communityId || !relay) fail('CINEMA_SESSION_ENDED');
    const response = await this.options.activity(token, hallId);
    const room = response.room;
    const current = room.queue.find((item) => item.id === room.timeline.itemId)?.media;
    if (current?.kind !== 'community-media' || current.ref !== entry!.ref)
      return fail('CINEMA_SESSION_ENDED');
    // A renewal means this member's player is still fetching: one more look for RMDB.
    if (!relay!.live)
      this.record(communityId, response, current.ref, { userId, name }, relay!.durationSec);
    const ticket = this.options.tickets({ session, userId, hallId });
    return { ...ticket, ttlMs: Math.max(0, ticket.expiresAt - Date.now()) };
  }

  async watch(
    token: string,
    hallId: string,
    communityId: string,
    userId: string,
    name = userId,
  ): Promise<CinemaWatch> {
    const config = this.options.configs.get(communityId);
    if (!config.source && !config.stremio) fail('CINEMA_NOT_CONNECTED');
    if (config.hallChannelId !== hallId) fail('CINEMA_HALL_REQUIRED');
    const response = await this.options.activity(token, hallId);
    const fetchedAt = Date.now();
    const room = response.room;
    const current = room.queue.find((entry) => entry.id === room.timeline.itemId)?.media;
    if (room.primary?.activity !== 'hall' || current?.kind !== 'community-media')
      return fail('CINEMA_NOTHING_SELECTED');
    const stremio = current.ref.startsWith('x-');
    const catalog = stremio ? null : this.catalog(communityId);
    const item = catalog?.item(current.ref) ?? null;
    const episode = item || !catalog ? null : catalog.episode(current.ref);
    const source = stremio
      ? this.stremio.relaySource(communityId, current.ref)
      : this.relaySource(config.source!, config.account, item, episode);
    const slots = this.slots(config);
    const audio = this.audioChoices.get(`${communityId}\n${current.ref}`) ?? null;
    const original = config.audioDefault === 'original';
    const audioKey = audio === null ? (original ? '#o' : '') : `#a${audio}`;
    // One relay decision at a time per community: viewers who press play together share it.
    const info = await this.serial(communityId, async () => {
      let chosen: RelayInfo;
      if (source.live) {
        chosen = await this.options.relays.acquire({
          communityId,
          key: `${communityId}:${current.ref}${audioKey}`,
          source,
          slots,
          audio,
          original,
        });
      } else {
        const position = playbackPosition(
          room.timeline,
          // The lock may have waited; advance the server clock by that much.
          response.serverTimeMs + (Date.now() - fetchedAt),
        );
        const reusable = this.options.relays
          .sessionsOf(communityId)
          .find(
            (session) =>
              this.sessionRefs.get(session.session)?.ref === current.ref &&
              this.sessionRefs.get(session.session)?.audio === audio &&
              position >= session.offsetSec + (session.windowStartSec ?? 0) - 5 &&
              position <= session.offsetSec + (session.producedSec ?? 0) + 30,
          );
        const startSec = Math.max(0, Math.floor(position) - 2);
        chosen =
          reusable ??
          (await this.options.relays.acquire({
            communityId,
            key: `${communityId}:${current.ref}@${startSec}${audioKey}`,
            source,
            startSec,
            slots,
            audio,
            original,
          }));
      }
      const running = new Set(this.options.relays.sessionsOf(communityId).map((r) => r.session));
      for (const [session, entry] of this.sessionRefs)
        if (entry.communityId === communityId && !running.has(session))
          this.sessionRefs.delete(session);
      this.sessionRefs.set(chosen.session, { communityId, ref: current.ref, audio });
      return chosen;
    });
    if (!info.live)
      this.record(communityId, response, current.ref, { userId, name }, info.durationSec);
    const ticket = this.options.tickets({ session: info.session, userId, hallId });
    return {
      session: info.session,
      ticket: ticket.ticket,
      expiresAt: ticket.expiresAt,
      itemRef: current.ref,
      live: info.live,
      durationSec: info.durationSec ?? item?.durationSec ?? episode?.episode.durationSec ?? null,
      offsetSec: info.offsetSec,
      epoch: info.epoch,
      ttlMs: Math.max(0, ticket.expiresAt - Date.now()),
      originPdtMs: info.originPdtMs ?? null,
      audioTracks: info.audioTracks ?? [],
      audioTrack: info.audioTrack ?? null,
      subtitleTracks: info.subtitleTracks ?? [],
      video: info.video ?? null,
    };
  }

  /**
   * Whoever holds the hall's remote picks the audio stream of the playing item. Its
   * relays stop; every player gets 404/410, watches again and hears the new stream.
   */
  async setAudio(
    token: string,
    hallId: string,
    communityId: string,
    userId: string,
    ref: string,
    track: number,
  ) {
    const config = this.options.configs.get(communityId);
    if (!config.source && !config.stremio) fail('CINEMA_NOT_CONNECTED');
    if (config.hallChannelId !== hallId) fail('CINEMA_HALL_REQUIRED');
    const room = (await this.options.activity(token, hallId)).room;
    const current = room.queue.find((entry) => entry.id === room.timeline.itemId)?.media;
    if (current?.kind !== 'community-media' || current.ref !== ref) fail('CINEMA_NOTHING_SELECTED');
    const self = room.participants.find((p) => p.userId === userId);
    if (!directsSession(room.primary, userId, self?.canControl === true))
      fail('CINEMA_ACCESS_DENIED');
    const key = `${communityId}\n${ref}`;
    if (this.audioChoices.get(key) === track) return { audioTrack: track };
    this.audioChoices.set(key, track);
    await this.serial(communityId, async () => {
      for (const [session, entry] of this.sessionRefs)
        if (entry.communityId === communityId && entry.ref === ref && entry.audio !== track) {
          this.sessionRefs.delete(session);
          await this.options.relays.stop(session);
        }
    });
    return { audioTrack: track };
  }

  /**
   * Gives RMDB one look at the hall: the timeline the service read from the activity
   * service with a member's token, so no client claims its own progress. Films and
   * episodes only; live channels are not recorded.
   */
  private record(
    communityId: string,
    response: ActivityResponse,
    ref: string,
    viewer: RmdbPerson,
    durationSec: number | null,
  ) {
    const rmdb = this.options.rmdb;
    const source = this.options.configs.get(communityId).source;
    const timeline = response.room.timeline;
    if (!rmdb || !source || !timeline.itemId) return;
    try {
      const catalog = this.options.catalogs.get(communityId);
      const item = catalog.item(ref);
      const hit = item ? null : catalog.episode(ref);
      const work = item ?? hit?.series;
      if (!work || work.kind === 'live') return;
      const created = rmdb.observe({
        communityId,
        itemId: timeline.itemId,
        workRef: work.ref,
        playing: timeline.playing,
        positionSec: playbackPosition(timeline, response.serverTimeMs),
        durationSec: durationSec ?? item?.durationSec ?? hit?.episode.durationSec ?? null,
        episode: hit
          ? {
              season: hit.episode.season,
              episode: hit.episode.episode,
              title: hit.episode.title || null,
            }
          : null,
        viewer,
        account: accountOf(source),
        meta: () => metaOf(work),
        at: this.now(),
      });
      if (created) void this.keepWork(communityId, created.id, work.ref);
    } catch (error) {
      this.log(`rmdb record failed: ${safeError(error)}`);
    }
  }

  /** Completes a work the hall just added from the catalog and keeps its artwork. */
  private async keepWork(communityId: string, workId: string, ref: string) {
    try {
      await this.details(communityId, ref);
      const item = this.options.catalogs.get(communityId).item(ref);
      if (item) this.options.rmdb!.enrich(communityId, workId, metaOf(item));
    } catch {
      // The provider did not answer: the entry keeps what the catalog listed.
    }
    await this.keepArt(communityId, workId);
  }

  /** Copies a work's poster and backdrop into RMDB while the catalog can still fetch them. */
  private async keepArt(communityId: string, workId: string) {
    const rmdb = this.options.rmdb!;
    try {
      const work = rmdb.get(communityId, workId);
      for (const [id, poster] of [
        [work.art, true],
        [work.backdrop, false],
      ] as const)
        if (id && !rmdb.store.hasArt(communityId, id))
          await rmdb.store.writeArt(communityId, id, await this.image(communityId, id), poster);
    } catch (error) {
      this.log(`rmdb artwork copy failed: ${safeError(error)}`);
    }
  }

  /**
   * What the current catalog can open for a work, or null: the stored ref when the same
   * account still lists the same title, otherwise the same title by name and year (a
   * reconnected or different account).
   */
  private async resumeOf(communityId: string, work: StoredWork) {
    return (await this.continueOf(communityId, work))?.resume ?? null;
  }

  /**
   * Where a work goes on in the current catalog: the stored ref when the same account still
   * lists the same title, otherwise the same title by name and year (a reconnected or
   * different account). Unfinished: where the hall stopped. Finished film: from the start.
   * Finished episode: the next one from the start, or, while that one has not aired, its
   * air date and nothing to open. Null when the catalog has nothing to go on with.
   */
  private async continueOf(communityId: string, work: StoredWork) {
    const source = this.options.configs.get(communityId).source;
    if (!source) return null;
    const catalog = this.options.catalogs.get(communityId);
    let item = work.source?.account === accountOf(source) ? catalog.item(work.source.ref) : null;
    // Another panel can reuse a ref for a different title.
    if (
      item &&
      (item.kind !== work.kind || normalizeForSearch(item.title) !== normalizeForSearch(work.title))
    )
      item = null;
    item ??= catalog.findTitle(work.kind, work.title, work.year);
    if (!item) return null;
    const progress = work.progress;
    // A few seconds of context before the point where the hall stopped.
    const resumeAt = (seconds: number) => Math.max(0, Math.floor(seconds) - 5);
    if (work.kind === 'movie')
      return {
        resume: {
          ref: item.ref,
          title: item.title,
          positionSec: progress && !progress.finished ? resumeAt(progress.positionSec) : 0,
          art: item.art,
          episode: null,
        },
        ref: item.ref,
        still: null,
        upcomingAt: null,
        next: false,
        episode: null,
      };
    if (!catalog.episodes(item.ref)) await this.details(communityId, item.ref).catch(() => null);
    const episodes = [...(catalog.episodes(item.ref) ?? [])].sort(
      (a, b) => a.season - b.season || a.episode - b.episode,
    );
    const at = progress?.episode ?? null;
    const index = at
      ? episodes.findIndex((e) => e.season === at.season && e.episode === at.episode)
      : 0;
    if (index < 0) return null;
    const next = !!at && progress!.finished;
    const target = episodes[next ? index + 1 : index];
    if (!target) {
      // The provider has nothing after the last watched episode: TMDB may know when it airs.
      const key = this.options.configs.get(communityId).tmdbKey;
      const tmdbId = Number(tmdbOf(item.tmdbId ?? work.tmdbId)) || null;
      const airing =
        next && at && key && tmdbId && this.options.metadata
          ? await this.options.metadata.nextAiring(tmdbId, key).catch(() => null)
          : null;
      if (
        !airing ||
        !(
          airing.season > at!.season ||
          (airing.season === at!.season && airing.episode > at!.episode)
        )
      )
        return null;
      return {
        resume: null,
        ref: item.ref,
        still: null,
        upcomingAt: airing.airDate,
        next: true,
        episode: { season: airing.season, episode: airing.episode, title: airing.title },
      };
    }
    const episode = {
      season: target.season,
      episode: target.episode,
      title: cleanEpisodeTitle(target.title, item.title, target.season, target.episode) || null,
    };
    // Providers may list an episode before it airs; it cannot be opened yet.
    const upcomingAt =
      target.airDate && target.airDate > this.now() + 12 * 3600_000 ? target.airDate : null;
    return {
      resume: upcomingAt
        ? null
        : {
            ref: target.ref,
            title: `${item.title} · ${target.season}. Sezon ${target.episode}. Bölüm`.slice(0, 240),
            positionSec: at && !next ? resumeAt(progress!.positionSec) : 0,
            art: target.art ?? item.art,
            episode: {
              season: target.season,
              episode: target.episode,
              title: target.title || null,
            },
          },
      ref: item.ref,
      still: target.art,
      upcomingAt,
      next,
      episode,
    };
  }

  /**
   * The "Devam et" row of Filmler or Diziler: works the hall left unfinished, series whose
   * next episode is out or announced, newest first. Each viewer hides cards on their own.
   */
  async rmdbContinue(communityId: string, kind: 'movie' | 'series'): Promise<CinemaContinueItem[]> {
    const rmdb = this.rmdb();
    if (!this.options.configs.get(communityId).source) return [];
    const out: CinemaContinueItem[] = [];
    for (const summary of rmdb.list(communityId, '')) {
      if (out.length >= CONTINUE_LIMIT) break;
      const progress = summary.progress;
      if (summary.kind !== kind || !progress) continue;
      if (kind === 'movie' && progress.finished) continue;
      const work = rmdb.get(communityId, summary.id);
      const value = await this.continueOf(communityId, work).catch(() => null);
      if (!value || (!value.resume && !value.upcomingAt)) continue;
      out.push({
        workId: work.id,
        kind,
        title: cleanVodTitle(work.title) || work.title,
        art: value.still ?? work.backdrop ?? work.art,
        resume: value.resume,
        episode: kind === 'series' ? (value.episode ?? null) : null,
        ref: value.ref,
        progress:
          value.next || value.upcomingAt
            ? 0
            : progress.durationSec
              ? Math.min(1, Math.max(0, progress.positionSec / progress.durationSec))
              : 0,
        remainingSec:
          !value.next && !value.upcomingAt && progress.durationSec
            ? Math.max(0, Math.round(progress.durationSec - progress.positionSec))
            : null,
        upcomingAt: value.upcomingAt,
        updatedAt: progress.updatedAt,
      });
    }
    return out.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  private rmdb() {
    return this.options.rmdb ?? fail('CINEMA_UNAVAILABLE');
  }

  rmdbList(communityId: string, viewerId: string) {
    return this.rmdb().list(communityId, viewerId);
  }

  async rmdbWork(communityId: string, workId: string, viewerId: string) {
    const rmdb = this.rmdb();
    const resume = await this.resumeOf(communityId, rmdb.get(communityId, workId)).catch(
      () => null,
    );
    return rmdb.details(communityId, workId, viewerId, resume);
  }

  /** A member adds a catalog film or series by hand. */
  async rmdbAdd(communityId: string, ref: string, by: RmdbPerson, watchlist: boolean) {
    const rmdb = this.rmdb();
    const catalog = this.catalog(communityId);
    const found = catalog.item(ref);
    if (!found || found.kind === 'live') return fail('CINEMA_ITEM_NOT_FOUND');
    // Plot, TMDB id and episodes are fetched on first details; RMDB keeps them.
    await this.details(communityId, ref).catch(() => null);
    const item = catalog.item(ref) ?? found;
    const source = this.options.configs.get(communityId).source!;
    const { work, created } = rmdb.add(
      communityId,
      metaOf(item),
      { ref, account: accountOf(source) },
      by,
      watchlist,
    );
    if (!created) rmdb.enrich(communityId, work.id, metaOf(item));
    await this.keepArt(communityId, work.id);
    return this.rmdbWork(communityId, work.id, by.userId);
  }

  /** This member's favourite live channels that the current catalog still lists. */
  favorites(communityId: string, userId: string) {
    const catalog = this.catalog(communityId);
    return this.rmdb()
      .favorites(communityId, userId)
      .filter((ref) => catalog.item(ref)?.kind === 'live');
  }

  setFavorite(communityId: string, userId: string, ref: string, on: boolean) {
    const item = this.catalog(communityId).item(ref);
    if (on && item?.kind !== 'live') return fail('CINEMA_ITEM_NOT_FOUND');
    this.rmdb().setFavorite(communityId, userId, ref, on);
    return this.favorites(communityId, userId);
  }

  /** The hall's watched episodes of a catalog series, for its details page. */
  rmdbEpisodes(communityId: string, seriesRef: string) {
    const rmdb = this.rmdb();
    const item = this.catalog(communityId).item(seriesRef);
    if (!item || item.kind !== 'series') return fail('CINEMA_ITEM_NOT_FOUND');
    const work = rmdb.find(communityId, metaOf(item));
    return { workId: work?.id ?? null, episodes: work?.episodes ?? [] };
  }

  /** A member marks an episode watched or not; a series RMDB does not have yet is added. */
  async rmdbMarkEpisode(communityId: string, ref: string, watched: boolean, by: RmdbPerson) {
    const rmdb = this.rmdb();
    const catalog = this.catalog(communityId);
    const hit = catalog.episode(ref) ?? fail('CINEMA_ITEM_NOT_FOUND');
    const series = hit.series;
    let work = rmdb.find(communityId, metaOf(series));
    if (!work && !watched) return this.rmdbEpisodes(communityId, series.ref);
    if (!work) {
      const source = this.options.configs.get(communityId).source!;
      work = rmdb.add(
        communityId,
        metaOf(series),
        { ref: series.ref, account: accountOf(source) },
        by,
        false,
      ).work;
      void this.keepArt(communityId, work.id);
    }
    const episode = hit.episode;
    rmdb.markEpisode(
      communityId,
      work.id,
      {
        season: episode.season,
        episode: episode.episode,
        title:
          cleanEpisodeTitle(episode.title, series.title, episode.season, episode.episode) || null,
      },
      watched,
      episode.durationSec,
    );
    return this.rmdbEpisodes(communityId, series.ref);
  }

  rmdbReview(
    communityId: string,
    workId: string,
    author: RmdbPerson,
    input: RmdbReviewInput | null,
  ): Promise<RmdbWorkDetails> {
    this.rmdb().review(communityId, workId, author, input);
    return this.rmdbWork(communityId, workId, author.userId);
  }

  rmdbRemoveReview(communityId: string, workId: string, userId: string, viewerId: string) {
    this.rmdb().removeReview(communityId, workId, userId);
    return this.rmdbWork(communityId, workId, viewerId);
  }

  rmdbWatchlist(communityId: string, workId: string, by: RmdbPerson, on: boolean) {
    this.rmdb().watchlist(communityId, workId, by, on);
    return this.rmdbWork(communityId, workId, by.userId);
  }

  rmdbLog(communityId: string, workId: string, by: RmdbPerson, watchedAt?: number) {
    this.rmdb().log(communityId, workId, by, watchedAt ?? this.now());
    return this.rmdbWork(communityId, workId, by.userId);
  }

  rmdbRemoveLog(
    communityId: string,
    workId: string,
    entryId: string,
    by: RmdbPerson,
    isOwner: boolean,
  ) {
    this.rmdb().removeLog(communityId, workId, entryId, by, isOwner);
    return this.rmdbWork(communityId, workId, by.userId);
  }

  /** Owner: a work goes with its reviews, diary and artwork copies. */
  rmdbRemove(communityId: string, workId: string) {
    const rmdb = this.rmdb();
    for (const id of rmdb.remove(communityId, workId)) {
      rmdb.store.removeArt(communityId, id);
      this.forgetImage(`${communityId}:${id}`);
    }
  }
}

/** Which IPTV account plays a title. RMDB compares it and never sends it anywhere. */
export function accountOf(source: CinemaSource) {
  const identity =
    source.kind === 'xtream'
      ? [source.kind, source.server, source.username]
      : [source.kind, source.url];
  return createHash('sha256').update(JSON.stringify(identity)).digest('hex').slice(0, 16);
}

/** The catalog's facts about a film or series, as RMDB keeps them. */
function metaOf(item: StoredItem): RmdbMeta {
  return {
    kind: item.kind === 'series' ? 'series' : 'movie',
    title: item.title,
    year: item.year,
    genre: item.genre,
    plot: item.plot || null,
    director: item.director,
    cast: item.cast,
    durationSec: item.kind === 'movie' ? item.durationSec : null,
    tmdbId: tmdbOf(item.tmdbId),
    art: item.art,
    backdrop: item.backdrop,
  };
}

/** Accepts the bridge input; an M3U `get.php?username=…` export becomes an Xtream source. */
function normalizeSource(input: unknown) {
  if (!input || typeof input !== 'object') return input;
  const value = input as Record<string, unknown>;
  const trim = (v: unknown) => (typeof v === 'string' ? v.trim() : v);
  if (value.kind === 'm3u' && typeof value.url === 'string') {
    const xtream = detectXtreamExport(value.url.trim());
    if (xtream) return { kind: 'xtream', ...xtream, guideUrl: trim(value.guideUrl) ?? null };
    return { kind: 'm3u', url: trim(value.url), guideUrl: trim(value.guideUrl) ?? null };
  }
  if (value.kind === 'xtream')
    return {
      kind: 'xtream',
      server:
        typeof value.server === 'string' ? value.server.trim().replace(/\/+$/, '') : value.server,
      username: trim(value.username),
      password: value.password,
      guideUrl: trim(value.guideUrl) ?? null,
    };
  return input;
}
