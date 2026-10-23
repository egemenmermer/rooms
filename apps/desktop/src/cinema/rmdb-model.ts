// RMDB, the community's own film diary: pure helpers for ratings, lists and the details page.
// Ratings are half-star steps (1 = ½★ … 10 = ★★★★★); the UI shows them out of five.
import { compareNames } from '../../../../packages/community-cinema/src/collation';
import { normalizeForSearch } from '../../../../packages/community-cinema/src/normalize';
import type {
  CinemaItem,
  RmdbDiaryEntry,
  RmdbEpisodeProgress,
  RmdbPerson,
  RmdbProgress,
  RmdbRating,
  RmdbReview,
  RmdbReviewInput,
  RmdbWorkDetails,
  RmdbWorkSummary,
} from '../../../../packages/community-cinema/src/types';
import { locale, t } from '../i18n';

export type RmdbKindFilter = 'all' | 'movie' | 'series';
export type RmdbSort = 'watched' | 'rating' | 'title' | 'year' | 'added';
export type RmdbGridView = { mode: 'grid'; kind: RmdbKindFilter; sort: RmdbSort; text: string };
export type RmdbView =
  { mode: 'home' } | RmdbGridView | { mode: 'details'; workId: string; back?: RmdbGridView };

export const RMDB_GRID: RmdbGridView = { mode: 'grid', kind: 'all', sort: 'watched', text: '' };

export const rmdbSorts: { id: RmdbSort; label: string }[] = [
  { id: 'watched', label: t('Son izlenen') },
  { id: 'rating', label: t('Puan') },
  { id: 'title', label: t('Ad') },
  { id: 'year', label: t('Yıl') },
  { id: 'added', label: t('Eklenme') },
];

const oneDecimal = new Intl.NumberFormat(locale, {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const upToOneDecimal = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });

export const isRating = (value: unknown): value is RmdbRating =>
  typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 10;

/** `3,5` for 7, `4` for 8. */
export const starsText = (rating: RmdbRating) => upToOneDecimal.format(rating / 2);

/** What a screen reader hears: `yarım yıldız`, `3,5 yıldız`. */
export const starsLabel = (rating: RmdbRating) =>
  rating === 1
    ? t('yarım yıldız')
    : t('{rating} yıldız', { rating: starsText(rating), count: rating / 2 });

/** Reads `3,5`, `3.5`, `4`, `½` or `3½` back into a rating; null when it is not a half step. */
export function parseStars(text: string): RmdbRating | null {
  const value = text.trim().replace('½', '.5').replace(',', '.');
  if (!/^\d*(\.\d+)?$/.test(value) || value === '' || value === '.') return null;
  const stars = Number(value.startsWith('.') ? `0${value}` : value);
  const rating = stars * 2;
  return isRating(rating) ? rating : null;
}

/** The community average (1–10) out of five, always with one decimal: `4,2`. */
export const averageText = (average: number) => oneDecimal.format(average / 2);

/** `★ 4,2 / 5`, or null without ratings. */
export const communityRating = (work: Pick<RmdbWorkSummary, 'averageRating'>) =>
  work.averageRating === null ? null : `★ ${averageText(work.averageRating)} / 5`;

/** Mean of the given ratings, rounded like the service (one decimal), or null. */
export function averageOf(ratings: readonly (RmdbRating | null)[]): number | null {
  const values = ratings.filter(isRating);
  if (!values.length) return null;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
}

/** How many members gave each half step: index 0 is ½★, index 9 is ★★★★★. */
export function ratingHistogram(reviews: readonly Pick<RmdbReview, 'rating'>[]): number[] {
  const counts = Array.from({ length: 10 }, () => 0);
  for (const review of reviews) if (isRating(review.rating)) counts[review.rating - 1]!++;
  return counts;
}

/** The summary numbers a list of reviews implies (what the service computes). */
export function reviewStats(reviews: readonly RmdbReview[]) {
  return {
    averageRating: averageOf(reviews.map((review) => review.rating)),
    ratingCount: reviews.filter((review) => isRating(review.rating)).length,
    reviewCount: reviews.filter((review) => review.text.trim()).length,
    likeCount: reviews.filter((review) => review.liked).length,
  };
}

/** Whether a review input says nothing at all (saving it removes the review). */
export const emptyReview = (input: RmdbReviewInput) =>
  input.rating === null && !input.text.trim() && !input.liked;

/**
 * The details as they will look once the service saved this member's review: used to show a
 * change at once, then replaced by what the service returns.
 */
export function withMyReview(
  details: RmdbWorkDetails,
  me: RmdbPerson,
  input: RmdbReviewInput | null,
  now: number,
): RmdbWorkDetails {
  const previous = details.reviews.find((review) => review.author.userId === me.userId);
  const others = details.reviews.filter((review) => review.author.userId !== me.userId);
  const keep = input && !emptyReview(input);
  const text = input?.text.trim() ?? '';
  const reviews: RmdbReview[] = keep
    ? [
        {
          author: me,
          rating: input.rating,
          text,
          spoiler: !!text && input.spoiler,
          liked: input.liked,
          createdAt: previous?.createdAt ?? now,
          updatedAt: now,
        },
        ...others,
      ]
    : others;
  return {
    ...details,
    ...reviewStats(reviews),
    reviews,
    mine: { rating: keep ? input.rating : null, liked: keep ? input.liked : false },
  };
}

/** The details with İzlenecekler switched on or off by `me`. */
export function withWatchlist(
  details: RmdbWorkDetails,
  me: RmdbPerson,
  on: boolean,
  now: number,
): RmdbWorkDetails {
  return {
    ...details,
    onWatchlist: on,
    watchlist: on ? (details.watchlist ?? { by: me, at: now }) : null,
  };
}

/** This member's review input as it is saved now (a heart alone counts). */
export function reviewInputOf(review: RmdbReview | null | undefined): RmdbReviewInput {
  return {
    rating: review?.rating ?? null,
    text: review?.text ?? '',
    spoiler: review?.spoiler ?? false,
    liked: review?.liked ?? false,
  };
}

const pad = (value: number) => String(value).padStart(2, '0');

/** `42:10`, `1:02:05`. */
export function clock(seconds: number) {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600),
    minutes = Math.floor((total % 3600) / 60),
    rest = total % 60;
  return hours ? `${hours}:${pad(minutes)}:${pad(rest)}` : `${minutes}:${pad(rest)}`;
}

/** How far along, 0–1; finished is full and an unknown length is empty. */
export function progressShare(
  progress: Pick<RmdbProgress, 'positionSec' | 'durationSec' | 'finished'> | null,
) {
  if (!progress) return 0;
  if (progress.finished) return 1;
  if (!progress.durationSec || progress.durationSec <= 0) return 0;
  return Math.min(1, Math.max(0, progress.positionSec / progress.durationSec));
}

export const unfinished = (work: Pick<RmdbWorkSummary, 'progress'>) =>
  !!work.progress && !work.progress.finished;

/** `S1 B4`. */
export const episodeShort = (episode: { season: number; episode: number }) =>
  t('S{season} B{episode}', { season: episode.season, episode: episode.episode });

/** `1. Sezon 3. Bölüm`. */
export const episodeLong = (episode: { season: number; episode: number }) =>
  t('{season}. Sezon {episode}. Bölüm', { season: episode.season, episode: episode.episode });

/** `S2 B3 · 36 dk kaldı` style line for a "Devam et" card. */
export function progressLine(progress: RmdbProgress) {
  const left =
    progress.durationSec && progress.durationSec > progress.positionSec
      ? Math.max(1, Math.round((progress.durationSec - progress.positionSec) / 60))
      : null;
  return [
    progress.episode ? episodeShort(progress.episode) : null,
    left !== null ? t('{minutes} dk kaldı', { minutes: left }) : clock(progress.positionSec),
  ]
    .filter(Boolean)
    .join(' · ');
}

export type ResumeAction = {
  kind: 'continue' | 'restart' | 'next' | 'play';
  label: string;
  /** Where the hall should start, in seconds of the target. */
  positionSec: number;
};

/**
 * The main button of a details page, from what the catalog can open (`resume`): continue where
 * the hall stopped, watch a finished film again, or the episode after a finished one.
 */
export function resumeAction(
  details: Pick<RmdbWorkDetails, 'kind' | 'progress' | 'resume'>,
): ResumeAction | null {
  const target = details.resume;
  if (!target) return null;
  const progress = details.progress;
  const mark = target.episode ? episodeShort(target.episode) : null;
  if (progress && !progress.finished && target.positionSec > 0) {
    const at = progress.positionSec > 0 ? progress.positionSec : target.positionSec;
    return {
      kind: 'continue',
      label: [t('Devam et'), mark, clock(at)].filter(Boolean).join(' · '),
      positionSec: target.positionSec,
    };
  }
  if (progress?.finished)
    return details.kind === 'movie'
      ? { kind: 'restart', label: t('Baştan izle'), positionSec: 0 }
      : {
          kind: 'next',
          label: mark ? t('Sonraki bölüm · {mark}', { mark }) : t('Sonraki bölüm'),
          positionSec: 0,
        };
  return {
    kind: 'play',
    label: mark ? t('Oynat · {mark}', { mark }) : t('Salonda oynat'),
    positionSec: target.positionSec,
  };
}

/** Why a details page has nothing to open. */
export function noResumeNote(
  details: Pick<RmdbWorkDetails, 'kind' | 'progress'>,
  connected: boolean,
) {
  if (!connected)
    return t(
      'Sunucuya bağlı bir IPTV hesabı yok; salonda açılamaz. Kayıt, puanlar ve yorumlar burada kalıyor.',
    );
  if (details.kind === 'series' && details.progress?.finished)
    return t('Salon son bölüme kadar izledi; katalogda sıradaki bölüm yok.');
  return details.kind === 'movie'
    ? t('Bu film şu an katalogda yok. Kayıt, puanlar ve yorumlar burada kalıyor.')
    : t('Bu dizi şu an katalogda yok. Kayıt, puanlar ve yorumlar burada kalıyor.');
}

/** The rows of the RMDB home page. */
export function rmdbRows(works: readonly RmdbWorkSummary[]) {
  const continuing = works
    .filter(unfinished)
    .sort((a, b) => b.progress!.updatedAt - a.progress!.updatedAt);
  const watchlist = works.filter((work) => work.onWatchlist);
  const recent = works
    .filter((work) => work.lastWatchedAt !== null)
    .sort((a, b) => b.lastWatchedAt! - a.lastWatchedAt!);
  const favourites = works
    .filter((work) => work.ratingCount > 0 && work.averageRating !== null)
    .sort(
      (a, b) =>
        b.averageRating! - a.averageRating! ||
        b.ratingCount - a.ratingCount ||
        compareNames(a.title, b.title),
    );
  return { continuing, watchlist, recent, favourites };
}

/** Films, series and written reviews, for the header. */
export function rmdbCounts(works: readonly RmdbWorkSummary[]) {
  return {
    films: works.filter((work) => work.kind === 'movie').length,
    series: works.filter((work) => work.kind === 'series').length,
    reviews: works.reduce((sum, work) => sum + work.reviewCount, 0),
  };
}

/** `13 film · 5 dizi · 21 yorum`. */
export function countsLine(counts: ReturnType<typeof rmdbCounts>) {
  return [
    t('{count} film', { count: counts.films }),
    t('{count} dizi', { count: counts.series }),
    t('{count} yorum', { count: counts.reviews }),
  ].join(' · ');
}

/** Kind and title filter; every word of `text` must appear in the title (Turkish-folded). */
export function filterWorks(
  works: readonly RmdbWorkSummary[],
  kind: RmdbKindFilter,
  text: string,
): RmdbWorkSummary[] {
  const terms = normalizeForSearch(text).split(' ').filter(Boolean);
  return works.filter((work) => {
    if (kind !== 'all' && work.kind !== kind) return false;
    if (!terms.length) return true;
    const title = normalizeForSearch(work.title);
    return terms.every((term) => title.includes(term));
  });
}

const lastSeen = (work: RmdbWorkSummary) =>
  Math.max(work.lastWatchedAt ?? 0, work.progress?.updatedAt ?? 0);

export function sortWorks(works: readonly RmdbWorkSummary[], sort: RmdbSort): RmdbWorkSummary[] {
  const byTitle = (a: RmdbWorkSummary, b: RmdbWorkSummary) => compareNames(a.title, b.title);
  const list = [...works];
  switch (sort) {
    case 'watched':
      return list.sort((a, b) => lastSeen(b) - lastSeen(a) || b.addedAt - a.addedAt);
    case 'rating':
      return list.sort(
        (a, b) =>
          (b.averageRating ?? -1) - (a.averageRating ?? -1) ||
          b.ratingCount - a.ratingCount ||
          byTitle(a, b),
      );
    case 'title':
      return list.sort(byTitle);
    case 'year':
      return list.sort((a, b) => (b.year ?? -1) - (a.year ?? -1) || byTitle(a, b));
    case 'added':
      return list.sort((a, b) => b.addedAt - a.addedAt);
  }
}

/** The RMDB entry for a catalog film or series, matched like the service does (title, year). */
export function matchWork(
  works: readonly RmdbWorkSummary[],
  item: Pick<CinemaItem, 'kind' | 'title' | 'year'>,
) {
  if (item.kind === 'live') return null;
  const title = normalizeForSearch(item.title);
  return (
    works.find(
      (work) =>
        work.kind === item.kind &&
        normalizeForSearch(work.title) === title &&
        (work.year === null || item.year === null || work.year === item.year),
    ) ?? null
  );
}

/** Watched episodes grouped by season, in order. */
export function seasonsOf(episodes: readonly RmdbEpisodeProgress[]) {
  const seasons = new Map<number, RmdbEpisodeProgress[]>();
  for (const episode of [...episodes].sort((a, b) => a.season - b.season || a.episode - b.episode))
    seasons.set(episode.season, [...(seasons.get(episode.season) ?? []), episode]);
  return [...seasons].map(([season, list]) => ({ season, episodes: list }));
}

/** Ids of diary entries that are rewatches: an older entry of the same work (or episode) exists. */
export function rewatches(diary: readonly RmdbDiaryEntry[]) {
  const seen = new Set<string>();
  const result = new Set<string>();
  for (const entry of [...diary].sort((a, b) => a.watchedAt - b.watchedAt)) {
    const key = entry.episode ? `${entry.episode.season}:${entry.episode.episode}` : '*';
    if (seen.has(key)) result.add(entry.id);
    seen.add(key);
  }
  return result;
}

/** Where an unfinished diary entry stopped, as the service recorded it. */
export const diaryPosition = (entry: RmdbDiaryEntry): number | null =>
  entry.finished ? null : entry.positionSec;

const listFormat = new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' });

/** `Ece, Can ve Deniz`; longer lists end with `ve 2 kişi daha`. */
export function peopleText(names: readonly string[]) {
  if (names.length <= 3) return listFormat.format(names);
  return t('{names} ve {count} kişi daha', {
    names: names.slice(0, 2).join(', '),
    count: names.length - 2,
  });
}

const fullDate = new Intl.DateTimeFormat(locale, {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

/** `12 Ekim 2026`. */
export const dateLabel = (ms: number) => fullDate.format(ms);

/** A date input's value (`2026-10-19`) for a local day. */
export function dateInputValue(ms: number) {
  const date = new Date(ms);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * The `watchedAt` for an "İzledim" date: undefined for today (the service uses now), local noon
 * for an earlier day, null for a day ahead or an unreadable value.
 */
export function watchedAtFromInput(value: string, now: number): number | undefined | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const noon = new Date(year, month - 1, day, 12);
  if (noon.getFullYear() !== year || noon.getMonth() !== month - 1 || noon.getDate() !== day)
    return null;
  if (year < 1900) return null;
  const today = dateInputValue(now);
  if (value === today) return undefined;
  return value > today ? null : noon.getTime();
}
