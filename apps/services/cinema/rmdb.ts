import { randomBytes } from 'node:crypto';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { normalizeForSearch } from '../../../packages/community-cinema/src/normalize';
import {
  RMDB_REVIEW_MAX,
  type RmdbDiaryEntry,
  type RmdbEpisodeProgress,
  type RmdbEpisodeRef,
  type RmdbPerson,
  type RmdbProgress,
  type RmdbReview,
  type RmdbReviewInput,
  type RmdbWorkDetails,
  type RmdbWorkSummary,
} from '../../../packages/community-cinema/src/types';
import { CinemaError } from './importer';
import type { SecureFiles } from './secure-file';

/** What RMDB copies from the catalog when a work enters, so the entry outlives the account. */
export type RmdbMeta = {
  kind: 'movie' | 'series';
  title: string;
  year: number | null;
  genre: string | null;
  plot: string | null;
  director: string | null;
  cast: string | null;
  /** Films only. */
  durationSec: number | null;
  tmdbId: string | null;
  art: string | null;
  backdrop: string | null;
};

type StoredReview = RmdbReview;

export type StoredWork = RmdbMeta & {
  id: string;
  /** The catalog ref it last came from and the account then; never sent to members. */
  source: { ref: string; account: string } | null;
  addedAt: number;
  addedBy: RmdbPerson | null;
  /** Latest activity of any kind, for ordering. */
  touchedAt: number;
  progress: RmdbProgress | null;
  episodes: RmdbEpisodeProgress[];
  diary: RmdbDiaryEntry[];
  reviews: StoredReview[];
  watchlist: { by: RmdbPerson; at: number } | null;
};

type RmdbFile = { version: 1; works: StoredWork[] };

/** One look at the hall, from the activity timeline the service read itself. */
export type RmdbSample = {
  communityId: string;
  /** The hall's queue entry: queuing a title again starts a new watch. */
  itemId: string;
  /** The film, or the series an episode belongs to. */
  workRef: string;
  playing: boolean;
  positionSec: number;
  durationSec: number | null;
  episode: RmdbEpisodeRef | null;
  viewer: RmdbPerson;
  /** Fingerprint of the IPTV account that plays it. */
  account: string;
  /** Catalog data for a work RMDB does not have yet; read only then. */
  meta: () => RmdbMeta | null;
  at: number;
};

/** Seconds the hall must really play a title (seeks do not count) before it enters. */
export const RMDB_LOG_AFTER_SEC = 300;
/** Share of the length after which a watch counts as finished. */
export const RMDB_FINISHED_SHARE = 0.9;
const MAX_WORKS = 5000;
const MAX_DIARY = 200;
/** Poster and backdrop copies per community; past the soft limit only posters are kept. */
const ART_SOFT_BYTES = 256 * 1024 * 1024;
const ART_HARD_BYTES = 512 * 1024 * 1024;
const COMMUNITY = /^[A-Za-z0-9_-]{1,128}$/;
const ART = /^[a-f0-9]{16,64}$/;
export const RMDB_WORK_ID = /^w-[A-Za-z0-9_-]{8,40}$/;
export const RMDB_DIARY_ID = /^d-[A-Za-z0-9_-]{8,40}$/;

const fail = (code: string): never => {
  throw new CinemaError(code);
};

const newId = (prefix: 'w' | 'd') => `${prefix}-${randomBytes(12).toString('base64url')}`;

/** Providers write "0" or "" for a missing TMDB id. */
export const tmdbOf = (value: string | null | undefined) =>
  value && value !== '0' ? String(value) : null;

/** Encrypted RMDB files: one JSON document per community plus its artwork copies. */
export class RmdbStore {
  private readonly loaded = new Map<string, RmdbFile>();
  private readonly pending = new Map<string, NodeJS.Timeout>();
  private readonly writing = new Map<string, Promise<void>>();
  private readonly artBytes = new Map<string, number>();

  constructor(
    private readonly root: string,
    private readonly files: SecureFiles,
  ) {}

  private dir(communityId: string) {
    if (!COMMUNITY.test(communityId)) fail('CINEMA_RMDB_INVALID');
    return join(this.root, 'rmdb');
  }

  private artPath(communityId: string, id: string) {
    if (!ART.test(id)) fail('CINEMA_RMDB_INVALID');
    return join(this.dir(communityId), communityId, 'art', `${id}.enc`);
  }

  get(communityId: string): RmdbFile {
    let file = this.loaded.get(communityId);
    if (!file) {
      const stored = this.files.read<RmdbFile>(
        join(this.dir(communityId), `${communityId}.enc`),
        true,
      );
      file = stored?.version === 1 ? stored : { version: 1, works: [] };
      this.loaded.set(communityId, file);
    }
    return file;
  }

  /** Writes a little later, so a burst of samples becomes one write. */
  saveSoon(communityId: string, delayMs = 3000) {
    if (this.pending.has(communityId)) return;
    const timer = setTimeout(() => {
      this.pending.delete(communityId);
      this.save(communityId);
    }, delayMs);
    timer.unref?.();
    this.pending.set(communityId, timer);
  }

  private save(communityId: string) {
    const file = this.loaded.get(communityId);
    if (!file) return;
    const previous = this.writing.get(communityId) ?? Promise.resolve();
    const next = previous
      .catch(() => {})
      .then(() =>
        this.files.writeAsync(join(this.dir(communityId), `${communityId}.enc`), file, true),
      );
    const tracked = next.finally(() => {
      if (this.writing.get(communityId) === tracked) this.writing.delete(communityId);
    });
    this.writing.set(communityId, tracked);
  }

  /** Writes everything still waiting (service shutdown). */
  flush() {
    for (const [communityId, timer] of this.pending) {
      clearTimeout(timer);
      this.save(communityId);
    }
    this.pending.clear();
  }

  async settled() {
    await Promise.allSettled([...this.writing.values()]);
  }

  hasArt(communityId: string, id: string) {
    try {
      return statSync(this.artPath(communityId, id)).isFile();
    } catch {
      return false;
    }
  }

  readArt(communityId: string, id: string): { body: Buffer; type: string } | null {
    const stored = this.files.read<{ type: string; data: string }>(this.artPath(communityId, id));
    return stored ? { body: Buffer.from(stored.data, 'base64'), type: stored.type } : null;
  }

  /** Keeps a copy of an image; false when the community's art budget is used up. */
  async writeArt(
    communityId: string,
    id: string,
    image: { body: Buffer; type: string },
    poster: boolean,
  ) {
    const used = this.usedArt(communityId);
    if (used + image.body.length > (poster ? ART_HARD_BYTES : ART_SOFT_BYTES)) return false;
    await this.files.writeAsync(this.artPath(communityId, id), {
      type: image.type,
      data: image.body.toString('base64'),
    });
    this.artBytes.set(communityId, used + image.body.length);
    return true;
  }

  removeArt(communityId: string, id: string) {
    this.files.remove(this.artPath(communityId, id));
    this.artBytes.delete(communityId);
  }

  private usedArt(communityId: string) {
    let used = this.artBytes.get(communityId);
    if (used === undefined) {
      used = 0;
      const dir = join(this.dir(communityId), communityId, 'art');
      try {
        for (const name of readdirSync(dir)) used += statSync(join(dir, name)).size;
      } catch {
        // Nothing copied yet.
      }
      this.artBytes.set(communityId, used);
    }
    return used;
  }
}

type Play = {
  ref: string;
  workId: string | null;
  diaryId: string | null;
  startedAt: number;
  lastAt: number;
  lastPos: number;
  /** Seconds the hall played forward; jumps are left out. */
  played: number;
  finished: boolean;
  viewers: Map<string, string>;
};

const sameTitle = (work: StoredWork, meta: Pick<RmdbMeta, 'kind' | 'title' | 'year'>) =>
  work.kind === meta.kind &&
  normalizeForSearch(work.title) === normalizeForSearch(meta.title) &&
  (work.year === null || meta.year === null || work.year === meta.year);

/**
 * The community's record of what the hall watched. The service feeds it samples of the
 * hall timeline (read with a member's token from the activity service, never a client's
 * claim); members add titles, ratings, reviews and diary lines.
 */
export class Rmdb {
  /** `communityId\nqueue item id` → the watch in progress. */
  private readonly plays = new Map<string, Play>();

  constructor(
    readonly store: RmdbStore,
    private readonly now: () => number = Date.now,
  ) {}

  private work(communityId: string, workId: string) {
    if (!RMDB_WORK_ID.test(workId)) fail('CINEMA_RMDB_NOT_FOUND');
    return (
      this.store.get(communityId).works.find((work) => work.id === workId) ??
      fail('CINEMA_RMDB_NOT_FOUND')
    );
  }

  /** The entry for this title, by TMDB id first, then by name and year. */
  find(communityId: string, meta: Pick<RmdbMeta, 'kind' | 'title' | 'year' | 'tmdbId'>) {
    const works = this.store.get(communityId).works;
    const tmdb = tmdbOf(meta.tmdbId);
    if (tmdb) {
      const hit = works.find((work) => work.kind === meta.kind && work.tmdbId === tmdb);
      if (hit) return hit;
    }
    return (
      works.find(
        (work) => sameTitle(work, meta) && !(tmdb && work.tmdbId && work.tmdbId !== tmdb),
      ) ?? null
    );
  }

  private create(
    communityId: string,
    meta: RmdbMeta,
    source: StoredWork['source'],
    by: RmdbPerson | null,
  ) {
    const data = this.store.get(communityId);
    if (data.works.length >= MAX_WORKS) fail('CINEMA_RMDB_INVALID');
    const at = this.now();
    const work: StoredWork = {
      ...meta,
      tmdbId: tmdbOf(meta.tmdbId),
      id: newId('w'),
      source,
      addedAt: at,
      addedBy: by,
      touchedAt: at,
      progress: null,
      episodes: [],
      diary: [],
      reviews: [],
      watchlist: null,
    };
    data.works.push(work);
    return work;
  }

  /** Fills fields the catalog only learned later (plot, TMDB id…); never overwrites. */
  enrich(communityId: string, workId: string, meta: Partial<RmdbMeta>) {
    const work = this.store.get(communityId).works.find((entry) => entry.id === workId);
    if (!work) return null;
    let changed = false;
    for (const key of [
      'year',
      'genre',
      'plot',
      'director',
      'cast',
      'durationSec',
      'tmdbId',
      'art',
      'backdrop',
    ] as const) {
      const value = key === 'tmdbId' ? tmdbOf(meta.tmdbId) : meta[key];
      if ((work[key] === null || work[key] === '') && value !== null && value !== undefined) {
        Object.assign(work, { [key]: value });
        changed = true;
      }
    }
    if (changed) this.store.saveSoon(communityId);
    return work;
  }

  /**
   * One sample of the hall. A title enters after {@link RMDB_LOG_AFTER_SEC} of real
   * playback; one already in RMDB keeps its progress from the first sample. Returns the
   * work when this sample created it.
   */
  observe(sample: RmdbSample): StoredWork | null {
    const key = `${sample.communityId}\n${sample.itemId}`;
    let play = this.plays.get(key);
    if (!play || play.ref !== sample.workRef) {
      play = {
        ref: sample.workRef,
        workId: null,
        diaryId: null,
        startedAt: sample.at,
        lastAt: sample.at,
        lastPos: sample.positionSec,
        played: 0,
        finished: false,
        viewers: new Map(),
      };
      this.plays.set(key, play);
      this.prune(sample.at);
    } else {
      const forward = sample.positionSec - play.lastPos;
      if (forward > 0 && forward <= (sample.at - play.lastAt) / 1000 + 5) play.played += forward;
      play.lastAt = sample.at;
      play.lastPos = sample.positionSec;
    }
    play.viewers.set(sample.viewer.userId, sample.viewer.name);
    if (sample.durationSec && sample.positionSec >= sample.durationSec * RMDB_FINISHED_SHARE)
      play.finished = true;

    const data = this.store.get(sample.communityId);
    let work = play.workId ? (data.works.find((entry) => entry.id === play.workId) ?? null) : null;
    let created: StoredWork | null = null;
    if (!work) {
      const meta = sample.meta();
      if (!meta) return null;
      work = this.find(sample.communityId, meta);
      if (!work && play.played < RMDB_LOG_AFTER_SEC) return null;
      if (!work) {
        if (data.works.length >= MAX_WORKS) return null;
        work = created = this.create(sample.communityId, meta, null, null);
      }
      play.workId = work.id;
    }
    work.source = { ref: sample.workRef, account: sample.account };
    work.touchedAt = sample.at;
    work.progress = {
      positionSec: Math.max(0, Math.floor(sample.positionSec)),
      durationSec: sample.durationSec,
      finished: play.finished,
      episode: sample.episode,
      updatedAt: sample.at,
    };
    if (sample.episode) this.episodeProgress(work, sample, play.finished);
    if (play.played >= RMDB_LOG_AFTER_SEC || play.diaryId) this.diaryLine(work, play, sample);
    this.store.saveSoon(sample.communityId);
    return created;
  }

  private episodeProgress(work: StoredWork, sample: RmdbSample, finished: boolean) {
    const at = sample.episode!;
    const entry: RmdbEpisodeProgress = {
      season: at.season,
      episode: at.episode,
      title: at.title,
      positionSec: Math.max(0, Math.floor(sample.positionSec)),
      durationSec: sample.durationSec,
      finished,
      watchedAt: sample.at,
    };
    const index = work.episodes.findIndex(
      (e) => e.season === at.season && e.episode === at.episode,
    );
    if (index >= 0) work.episodes[index] = entry;
    else {
      work.episodes.push(entry);
      work.episodes.sort((a, b) => a.season - b.season || a.episode - b.episode);
    }
  }

  private diaryLine(work: StoredWork, play: Play, sample: RmdbSample) {
    const viewers = [...play.viewers].map(([userId, name]) => ({ userId, name }));
    const line = play.diaryId ? work.diary.find((entry) => entry.id === play.diaryId) : null;
    const positionSec = Math.max(0, Math.floor(sample.positionSec));
    if (line) {
      line.viewers = viewers;
      line.finished = play.finished;
      line.episode = sample.episode;
      line.positionSec = positionSec;
      return;
    }
    play.diaryId = newId('d');
    work.diary.unshift({
      id: play.diaryId,
      watchedAt: play.startedAt,
      viewers,
      episode: sample.episode,
      finished: play.finished,
      positionSec,
      source: 'hall',
      loggedBy: null,
    });
    work.diary.splice(MAX_DIARY);
  }

  private prune(now: number) {
    for (const [key, play] of this.plays)
      if (now - play.lastAt > 24 * 3600_000) this.plays.delete(key);
  }

  /** A member adds a catalog title by hand; a title RMDB already has is returned as it is. */
  add(
    communityId: string,
    meta: RmdbMeta,
    source: { ref: string; account: string },
    by: RmdbPerson,
    watchlist: boolean,
  ) {
    let work = this.find(communityId, meta);
    const created = !work;
    work ??= this.create(communityId, meta, source, by);
    work.source ??= source;
    if (watchlist && !work.watchlist) work.watchlist = { by, at: this.now() };
    work.touchedAt = this.now();
    this.store.saveSoon(communityId);
    return { work, created };
  }

  /** This member's rating, review and heart; null (or nothing left) removes them. */
  review(communityId: string, workId: string, author: RmdbPerson, input: RmdbReviewInput | null) {
    const work = this.work(communityId, workId);
    const index = work.reviews.findIndex((review) => review.author.userId === author.userId);
    const text = input?.text.trim() ?? '';
    if (input) {
      if (
        input.rating !== null &&
        !(Number.isInteger(input.rating) && input.rating >= 1 && input.rating <= 10)
      )
        fail('CINEMA_RMDB_INVALID');
      if (input.text.length > RMDB_REVIEW_MAX) fail('CINEMA_RMDB_INVALID');
    }
    if (!input || (input.rating === null && !text && !input.liked)) {
      if (index >= 0) work.reviews.splice(index, 1);
    } else {
      const at = this.now();
      const review: StoredReview = {
        author,
        rating: input.rating,
        text,
        spoiler: !!text && input.spoiler,
        liked: input.liked,
        createdAt: index >= 0 ? work.reviews[index].createdAt : at,
        updatedAt: at,
      };
      if (index >= 0) work.reviews[index] = review;
      else work.reviews.push(review);
      work.touchedAt = at;
    }
    this.store.saveSoon(communityId);
    return work;
  }

  removeReview(communityId: string, workId: string, userId: string) {
    const work = this.work(communityId, workId);
    const index = work.reviews.findIndex((review) => review.author.userId === userId);
    if (index < 0) fail('CINEMA_RMDB_NOT_FOUND');
    work.reviews.splice(index, 1);
    this.store.saveSoon(communityId);
    return work;
  }

  watchlist(communityId: string, workId: string, by: RmdbPerson, on: boolean) {
    const work = this.work(communityId, workId);
    if (on && !work.watchlist) work.watchlist = { by, at: this.now() };
    if (!on) work.watchlist = null;
    work.touchedAt = this.now();
    this.store.saveSoon(communityId);
    return work;
  }

  /** "İzledim": a finished watch by this member alone. */
  log(communityId: string, workId: string, by: RmdbPerson, watchedAt = this.now()) {
    const work = this.work(communityId, workId);
    if (
      !Number.isFinite(watchedAt) ||
      watchedAt > this.now() + 60_000 ||
      watchedAt < Date.UTC(1900, 0)
    )
      fail('CINEMA_RMDB_INVALID');
    work.diary.push({
      id: newId('d'),
      watchedAt,
      viewers: [by],
      episode: null,
      finished: true,
      positionSec: null,
      source: 'manual',
      loggedBy: by,
    });
    work.diary.sort((a, b) => b.watchedAt - a.watchedAt);
    work.diary.splice(MAX_DIARY);
    work.touchedAt = this.now();
    this.store.saveSoon(communityId);
    return work;
  }

  /** Hand logs go with their author; the owner may remove any line. */
  removeLog(
    communityId: string,
    workId: string,
    entryId: string,
    by: RmdbPerson,
    isOwner: boolean,
  ) {
    const work = this.work(communityId, workId);
    const index = RMDB_DIARY_ID.test(entryId)
      ? work.diary.findIndex((entry) => entry.id === entryId)
      : -1;
    if (index < 0) fail('CINEMA_RMDB_NOT_FOUND');
    const entry = work.diary[index];
    if (!isOwner && !(entry.source === 'manual' && entry.loggedBy?.userId === by.userId))
      fail('CINEMA_ACCESS_DENIED');
    work.diary.splice(index, 1);
    this.store.saveSoon(communityId);
    return work;
  }

  /** Owner: the work and its art copies go; returns the art ids no other work uses. */
  remove(communityId: string, workId: string) {
    const data = this.store.get(communityId);
    const work = this.work(communityId, workId);
    data.works.splice(data.works.indexOf(work), 1);
    for (const play of this.plays.values()) if (play.workId === workId) play.workId = null;
    this.store.saveSoon(communityId);
    const inUse = new Set(data.works.flatMap((other) => [other.art, other.backdrop]));
    return [work.art, work.backdrop].filter((id): id is string => !!id && !inUse.has(id));
  }

  /** Whether a work in this community shows this art id (posters survive the account). */
  usesArt(communityId: string, artId: string) {
    return this.store
      .get(communityId)
      .works.some((work) => work.art === artId || work.backdrop === artId);
  }

  list(communityId: string, viewerId: string): RmdbWorkSummary[] {
    return [...this.store.get(communityId).works]
      .sort((a, b) => b.touchedAt - a.touchedAt)
      .map((work) => summary(work, viewerId));
  }

  details(
    communityId: string,
    workId: string,
    viewerId: string,
    resume: RmdbWorkDetails['resume'] = null,
  ): RmdbWorkDetails {
    return detailsOf(this.work(communityId, workId), viewerId, resume);
  }

  /** The stored work, for the service (resume lookup, art). */
  get(communityId: string, workId: string) {
    return this.work(communityId, workId);
  }
}

export function summary(work: StoredWork, viewerId: string): RmdbWorkSummary {
  const ratings = work.reviews.map((r) => r.rating).filter((r): r is number => r !== null);
  const mine = work.reviews.find((review) => review.author.userId === viewerId);
  return {
    id: work.id,
    kind: work.kind,
    title: work.title,
    year: work.year,
    genre: work.genre,
    art: work.art,
    averageRating: ratings.length
      ? Math.round((ratings.reduce((sum, r) => sum + r, 0) / ratings.length) * 10) / 10
      : null,
    ratingCount: ratings.length,
    reviewCount: work.reviews.filter((review) => review.text).length,
    likeCount: work.reviews.filter((review) => review.liked).length,
    progress: work.progress,
    watchCount: work.diary.length,
    lastWatchedAt: work.diary.reduce<number | null>(
      (latest, entry) => (latest === null || entry.watchedAt > latest ? entry.watchedAt : latest),
      null,
    ),
    addedAt: work.addedAt,
    onWatchlist: !!work.watchlist,
    mine: { rating: mine?.rating ?? null, liked: mine?.liked ?? false },
  };
}

export function detailsOf(
  work: StoredWork,
  viewerId: string,
  resume: RmdbWorkDetails['resume'],
): RmdbWorkDetails {
  return {
    ...summary(work, viewerId),
    plot: work.plot,
    director: work.director,
    cast: work.cast,
    durationSec: work.durationSec,
    backdrop: work.backdrop,
    reviews: [...work.reviews].sort((a, b) => b.updatedAt - a.updatedAt),
    diary: [...work.diary].sort((a, b) => b.watchedAt - a.watchedAt),
    episodes: work.episodes,
    watchlist: work.watchlist,
    resume,
  };
}
