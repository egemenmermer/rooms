import { createHash } from 'node:crypto';
import { compareNames } from '../../../packages/community-cinema/src/collation';
import { normalizeForSearch, searchTerms } from '../../../packages/community-cinema/src/normalize';
import type {
  CatalogKind,
  CinemaCategory,
  CinemaEpisode,
  CinemaItem,
  CinemaProgramme,
} from '../../../packages/community-cinema/src/types';

/** Server-only fields stay here; `publicItem` strips them before anything leaves the service. */
export type StoredItem = CinemaItem & {
  providerId: string;
  /** XMLTV channel id the guide is keyed by (matched at guide import). */
  epgId: string | null;
  tvgId: string | null;
  /** Xtream container extension (VOD). */
  ext: string | null;
  /** M3U entries only; may carry credentials. */
  url: string | null;
  userAgent: string | null;
  referrer: string | null;
  plot: string | null;
  genre: string | null;
  cast: string | null;
  director: string | null;
  durationSec: number | null;
  backdrop: string | null;
  /**
   * TMDB id from the provider, for subtitle search. Absent: not known yet (older snapshots,
   * rows without one); null: the provider has none.
   */
  tmdbId?: string | null;
};

export type StoredEpisode = CinemaEpisode & {
  providerId: string;
  ext: string | null;
  url: string | null;
};

export type CatalogSnapshot = {
  version: 1;
  importedAt: number | null;
  guideImportedAt: number | null;
  /** M3U `url-tvg`; may carry credentials, so it stays in the encrypted snapshot. */
  providerGuideUrl: string | null;
  categories: CinemaCategory[];
  items: StoredItem[];
  /** Series ref → episodes (M3U at import; Xtream filled lazily). */
  episodes: Record<string, StoredEpisode[]>;
  /** Artwork id → provider URL. */
  art: Record<string, string>;
  /** XMLTV channel id → programmes sorted by start. */
  programmes: Record<string, CinemaProgramme[]>;
};

/** XMLTV ids come from the provider: `constructor` or `__proto__` must not reach Object's own members. */
export const programmesOf = (record: Record<string, CinemaProgramme[]>, id: string) =>
  Object.hasOwn(record, id) ? record[id] : undefined;

export const emptySnapshot = (): CatalogSnapshot => ({
  version: 1,
  importedAt: null,
  guideImportedAt: null,
  providerGuideUrl: null,
  categories: [],
  items: [],
  episodes: {},
  art: {},
  programmes: {},
});

/** Opaque, stable artwork id for a provider image URL. */
export function artId(url: string) {
  return createHash('sha256').update(url).digest('hex').slice(0, 24);
}

export function publicItem(item: StoredItem): CinemaItem {
  return {
    ref: item.ref,
    kind: item.kind,
    title: item.title,
    badges: item.badges,
    categoryId: item.categoryId,
    number: item.number,
    art: item.art,
    year: item.year,
    rating: item.rating,
    addedAt: item.addedAt,
    hasGuide: item.hasGuide,
  };
}

const kindOrder: Record<CatalogKind, number> = { live: 0, movie: 1, series: 2 };

export type ListQuery = {
  kind: CatalogKind;
  categoryId?: string | null;
  sort?: 'default' | 'name' | 'added' | 'rating';
  offset?: number;
  limit?: number;
};

/**
 * One community's catalog, held in memory. A large provider (20k channels,
 * 60k movies, 8k series) fits in well under 200 MB; searches scan
 * pre-normalized words, which takes a few milliseconds.
 */
export class Catalog {
  private readonly byRef = new Map<string, StoredItem>();
  private readonly byKind: Record<CatalogKind, StoredItem[]> = { live: [], movie: [], series: [] };
  private readonly words = new Map<string, string[]>();
  private readonly programmeWords = new Map<CinemaProgramme, string[]>();
  private episodeIndex: Map<string, { seriesRef: string; episode: StoredEpisode }> | null = null;
  private versionIndex: Map<string, StoredItem[]> | null = null;

  constructor(private readonly data: CatalogSnapshot) {
    for (const item of data.items) {
      this.byRef.set(item.ref, item);
      this.byKind[item.kind].push(item);
      this.words.set(item.ref, normalizeForSearch(item.title).split(' ').filter(Boolean));
    }
  }

  get snapshot() {
    return this.data;
  }

  counts() {
    let programmes = 0;
    for (const list of Object.values(this.data.programmes)) programmes += list.length;
    return {
      live: this.byKind.live.length,
      movies: this.byKind.movie.length,
      series: this.byKind.series.length,
      programmes,
    };
  }

  categories(kind: CatalogKind) {
    return this.data.categories.filter((category) => category.kind === kind);
  }

  item(ref: string) {
    return this.byRef.get(ref) ?? null;
  }

  /**
   * The same film or series listed again in another quality: same kind, same title once
   * quality words are gone, and the same year when both have one.
   */
  versions(ref: string) {
    const item = this.byRef.get(ref);
    if (!item || item.kind === 'live') return [];
    const key = (value: StoredItem) => `${value.kind}\n${normalizeForSearch(value.title)}`;
    if (!this.versionIndex) {
      this.versionIndex = new Map();
      for (const value of [...this.byKind.movie, ...this.byKind.series]) {
        const list = this.versionIndex.get(key(value));
        if (list) list.push(value);
        else this.versionIndex.set(key(value), [value]);
      }
    }
    return (this.versionIndex.get(key(item)) ?? [])
      .filter(
        (other) =>
          other.ref !== ref &&
          (other.year === null || item.year === null || other.year === item.year),
      )
      .slice(0, 8);
  }

  list(query: ListQuery) {
    let items = this.byKind[query.kind];
    if (query.categoryId) items = items.filter((item) => item.categoryId === query.categoryId);
    const sort = query.sort ?? 'default';
    if (sort === 'name') items = [...items].sort((a, b) => compareNames(a.title, b.title));
    else if (sort === 'added')
      items = [...items].sort((a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0));
    else if (sort === 'rating')
      items = [...items].sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1));
    const offset = Math.max(0, query.offset ?? 0);
    const limit = Math.min(1000, Math.max(1, query.limit ?? 60));
    return { items: items.slice(offset, offset + limit).map(publicItem), total: items.length };
  }

  /**
   * Every term must prefix a word of the title (Turkish-folded). Live
   * channels whose current or next programme matches follow the direct hits.
   */
  search(
    text: string,
    kinds: CatalogKind[] = ['live', 'movie', 'series'],
    limit = 40,
    now = Date.now(),
  ) {
    const terms = searchTerms(text);
    if (!terms.length) return [];
    const hits: { item: StoredItem; score: number }[] = [];
    for (const kind of kinds)
      for (const item of this.byKind[kind]) {
        const score = matchScore(this.words.get(item.ref)!, terms);
        if (score > 0) hits.push({ item, score });
      }
    hits.sort(
      (a, b) =>
        b.score - a.score ||
        kindOrder[a.item.kind] - kindOrder[b.item.kind] ||
        compareNames(a.item.title, b.item.title),
    );
    const out = hits.slice(0, limit).map((hit) => hit.item);
    if (out.length < limit && kinds.includes('live')) {
      const seen = new Set(out.map((item) => item.ref));
      for (const item of this.byKind.live) {
        if (out.length >= limit) break;
        if (seen.has(item.ref) || !item.epgId) continue;
        const upcoming = (programmesOf(this.data.programmes, item.epgId) ?? []).filter(
          (p) => p.stop > now && p.start < now + 12 * 3600_000,
        );
        if (upcoming.slice(0, 2).some((p) => matchScore(this.titleWords(p), terms) > 0))
          out.push(item);
      }
    }
    return out.map(publicItem);
  }

  private titleWords(programme: CinemaProgramme) {
    let words = this.programmeWords.get(programme);
    if (!words) {
      words = normalizeForSearch(programme.title).split(' ').filter(Boolean);
      this.programmeWords.set(programme, words);
    }
    return words;
  }

  guide(refs: string[], from: number, to: number) {
    const out: Record<string, CinemaProgramme[]> = {};
    for (const ref of refs.slice(0, 200)) {
      const item = this.byRef.get(ref);
      if (!item || item.kind !== 'live' || !item.epgId) continue;
      const list = programmesOf(this.data.programmes, item.epgId) ?? [];
      out[ref] = list.filter((p) => p.stop > from && p.start < to).slice(0, 200);
    }
    return out;
  }

  episodes(seriesRef: string) {
    return this.data.episodes[seriesRef] ?? null;
  }

  setEpisodes(seriesRef: string, episodes: StoredEpisode[], art: Record<string, string>) {
    this.data.episodes[seriesRef] = episodes;
    Object.assign(this.data.art, art);
    this.episodeIndex = null;
  }

  episode(ref: string): { series: StoredItem; episode: StoredEpisode } | null {
    if (!this.episodeIndex) {
      this.episodeIndex = new Map();
      for (const [seriesRef, list] of Object.entries(this.data.episodes))
        for (const entry of list) this.episodeIndex.set(entry.ref, { seriesRef, episode: entry });
    }
    const hit = this.episodeIndex.get(ref);
    const series = hit ? this.byRef.get(hit.seriesRef) : undefined;
    return hit && series ? { series, episode: hit.episode } : null;
  }

  artUrl(id: string) {
    return this.data.art[id] ?? null;
  }

  registerArt(url: string) {
    const id = artId(url);
    this.data.art[id] = url;
    return id;
  }

  /** Replaces the guide; items whose channel has programmes get `hasGuide`. */
  setGuide(
    programmes: Record<string, CinemaProgramme[]>,
    matches: Map<string, string>,
    at: number,
  ) {
    this.data.programmes = programmes;
    this.data.guideImportedAt = at;
    this.programmeWords.clear();
    for (const item of this.byKind.live) {
      item.epgId = matches.get(item.ref) ?? null;
      item.hasGuide = !!item.epgId && !!programmesOf(programmes, item.epgId)?.length;
    }
  }
}

function matchScore(words: string[], terms: string[]) {
  let score = 0;
  for (const term of terms) {
    let best = 0;
    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      if (!word.startsWith(term)) continue;
      const value = (word === term ? 3 : 2) + (i === 0 ? 1 : 0);
      if (value > best) best = value;
    }
    if (!best) return 0;
    score += best;
  }
  return score + (words.length === terms.length ? 1 : 0);
}
