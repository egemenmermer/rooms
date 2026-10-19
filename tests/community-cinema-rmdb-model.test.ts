import { describe, expect, it } from 'vitest';
import type { RoomSnapshot } from '../packages/activity-protocol/src';
import type {
  RmdbDiaryEntry,
  RmdbReview,
  RmdbWorkDetails,
  RmdbWorkSummary,
} from '../packages/community-cinema/src/types';
import { resumeCommands, resumeMedia } from '../apps/desktop/src/cinema/hall-model';
import { cinemaErrorText } from '../apps/desktop/src/cinema/cinema-bridge';
import {
  averageOf,
  averageText,
  clock,
  communityRating,
  dateInputValue,
  diaryPosition,
  filterWorks,
  matchWork,
  noResumeNote,
  parseStars,
  peopleText,
  progressLine,
  progressShare,
  ratingHistogram,
  resumeAction,
  reviewStats,
  rewatches,
  rmdbCounts,
  rmdbRows,
  seasonsOf,
  sortWorks,
  starsLabel,
  starsText,
  watchedAtFromInput,
  withMyReview,
  withWatchlist,
} from '../apps/desktop/src/cinema/rmdb-model';

const day = 86_400_000;
const me = { userId: 'me', name: 'Deniz' };

function work(id: string, change: Partial<RmdbWorkSummary> = {}): RmdbWorkSummary {
  return {
    id,
    kind: 'movie',
    title: id,
    year: 2024,
    genre: null,
    art: null,
    averageRating: null,
    ratingCount: 0,
    reviewCount: 0,
    likeCount: 0,
    progress: null,
    watchCount: 0,
    lastWatchedAt: null,
    addedAt: 0,
    onWatchlist: false,
    mine: { rating: null, liked: false },
    ...change,
  };
}

function details(change: Partial<RmdbWorkDetails> = {}): RmdbWorkDetails {
  return {
    ...work('w-1'),
    plot: null,
    director: null,
    cast: null,
    durationSec: null,
    backdrop: null,
    reviews: [],
    diary: [],
    episodes: [],
    watchlist: null,
    resume: null,
    ...change,
  };
}

const review = (userId: string, rating: number | null, text = '', liked = false): RmdbReview => ({
  author: { userId, name: userId },
  rating,
  text,
  spoiler: false,
  liked,
  createdAt: 1,
  updatedAt: 1,
});

describe('RMDB half stars', () => {
  it('formats and reads half steps the Turkish way', () => {
    expect(starsText(7)).toBe('3,5');
    expect(starsText(8)).toBe('4');
    expect(starsLabel(7)).toBe('3,5 yıldız');
    expect(starsLabel(10)).toBe('5 yıldız');
    expect(starsLabel(1)).toBe('yarım yıldız');
    expect(parseStars('3,5')).toBe(7);
    expect(parseStars('3.5')).toBe(7);
    expect(parseStars('4')).toBe(8);
    expect(parseStars('½')).toBe(1);
    expect(parseStars('2½')).toBe(5);
    expect(parseStars(' 5 ')).toBe(10);
    for (const bad of ['0', '3,2', '5,5', '6', '', 'abc', '-1', '.'])
      expect(parseStars(bad)).toBeNull();
  });

  it('averages like the service and spreads ratings over ten steps', () => {
    expect(averageOf([9, 8, 10, 7, 8, null])).toBe(8.4);
    expect(averageOf([null])).toBeNull();
    expect(averageText(8.4)).toBe('4,2');
    expect(averageText(8)).toBe('4,0');
    expect(communityRating({ averageRating: 7 })).toBe('★ 3,5 / 5');
    expect(communityRating({ averageRating: null })).toBeNull();
    expect(
      ratingHistogram([review('a', 1), review('b', 10), review('c', 10), review('d', null)]),
    ).toEqual([1, 0, 0, 0, 0, 0, 0, 0, 0, 2]);
    expect(
      reviewStats([review('a', 8, 'İyi'), review('b', null, '', true), review('c', 6, '  ')]),
    ).toEqual({ averageRating: 7, ratingCount: 2, reviewCount: 1, likeCount: 1 });
  });
});

describe('RMDB optimistic changes', () => {
  it("puts this member's review first and recomputes the numbers", () => {
    const before = details({
      reviews: [review('ece', 9, 'Çok iyi', true)],
      averageRating: 9,
      ratingCount: 1,
      reviewCount: 1,
      likeCount: 1,
    });
    const after = withMyReview(
      before,
      me,
      { rating: 7, text: ' Sonu şaşırtıcı ', spoiler: true, liked: true },
      100,
    );
    expect(after.reviews[0]).toMatchObject({
      author: me,
      rating: 7,
      text: 'Sonu şaşırtıcı',
      spoiler: true,
      liked: true,
      createdAt: 100,
      updatedAt: 100,
    });
    expect(after).toMatchObject({
      averageRating: 8,
      ratingCount: 2,
      reviewCount: 2,
      likeCount: 2,
      mine: { rating: 7, liked: true },
    });
    // A spoiler mark without words is dropped; an empty input removes the review.
    expect(
      withMyReview(after, me, { rating: 4, text: '', spoiler: true, liked: false }, 200).reviews[0],
    ).toMatchObject({ rating: 4, spoiler: false, createdAt: 100, updatedAt: 200 });
    const removed = withMyReview(
      after,
      me,
      { rating: null, text: '', spoiler: false, liked: false },
      300,
    );
    expect(removed.reviews.map((r) => r.author.userId)).toEqual(['ece']);
    expect(removed.mine).toEqual({ rating: null, liked: false });
    expect(withMyReview(after, me, null, 300).ratingCount).toBe(1);
  });

  it('switches İzlenecekler on and off, keeping who added it', () => {
    const on = withWatchlist(details(), me, true, 50);
    expect(on).toMatchObject({ onWatchlist: true, watchlist: { by: me, at: 50 } });
    expect(withWatchlist(on, { userId: 'x', name: 'X' }, true, 90).watchlist?.by).toEqual(me);
    expect(withWatchlist(on, me, false, 60)).toMatchObject({ onWatchlist: false, watchlist: null });
  });
});

describe('RMDB lists', () => {
  const list = [
    work('Mavi Saat', {
      averageRating: 8.4,
      ratingCount: 5,
      lastWatchedAt: 5 * day,
      addedAt: 1,
      reviewCount: 4,
    }),
    work('Gecenin Kıyısında', {
      year: 2025,
      averageRating: 8.5,
      ratingCount: 2,
      lastWatchedAt: 9 * day,
      addedAt: 9 * day,
      reviewCount: 1,
      progress: {
        positionSec: 2530,
        durationSec: 7860,
        finished: false,
        episode: null,
        updatedAt: 9 * day,
      },
    }),
    work('Mahalle', {
      kind: 'series',
      year: 2023,
      lastWatchedAt: 8 * day,
      addedAt: 2,
      progress: {
        positionSec: 730,
        durationSec: 2880,
        finished: false,
        episode: { season: 2, episode: 3, title: 'Kapı' },
        updatedAt: 8 * day,
      },
    }),
    work('Ayna', { kind: 'series', year: null, onWatchlist: true, addedAt: 3 }),
    work('Şehir Uyurken', { averageRating: 8.4, ratingCount: 1, addedAt: 4, onWatchlist: true }),
  ];

  it('builds the home rows', () => {
    const rows = rmdbRows(list);
    expect(rows.continuing.map((w) => w.id)).toEqual(['Gecenin Kıyısında', 'Mahalle']);
    expect(rows.watchlist.map((w) => w.id)).toEqual(['Ayna', 'Şehir Uyurken']);
    expect(rows.recent.map((w) => w.id)).toEqual(['Gecenin Kıyısında', 'Mahalle', 'Mavi Saat']);
    // Highest average first; a tie goes to more votes.
    expect(rows.favourites.map((w) => w.id)).toEqual([
      'Gecenin Kıyısında',
      'Mavi Saat',
      'Şehir Uyurken',
    ]);
    expect(rmdbCounts(list)).toEqual({ films: 3, series: 2, reviews: 5 });
  });

  it('filters by kind and Turkish-folded title words', () => {
    expect(filterWorks(list, 'series', '').map((w) => w.id)).toEqual(['Mahalle', 'Ayna']);
    expect(filterWorks(list, 'all', 'sehir').map((w) => w.id)).toEqual(['Şehir Uyurken']);
    expect(filterWorks(list, 'all', 'KIYI gece').map((w) => w.id)).toEqual(['Gecenin Kıyısında']);
    expect(filterWorks(list, 'movie', 'mahalle')).toEqual([]);
  });

  it('sorts by last watch, rating, title, year and when added', () => {
    const ids = (sort: Parameters<typeof sortWorks>[1]) => sortWorks(list, sort).map((w) => w.id);
    expect(ids('watched')).toEqual([
      'Gecenin Kıyısında',
      'Mahalle',
      'Mavi Saat',
      'Şehir Uyurken',
      'Ayna',
    ]);
    expect(ids('rating')).toEqual([
      'Gecenin Kıyısında',
      'Mavi Saat',
      'Şehir Uyurken',
      'Ayna',
      'Mahalle',
    ]);
    expect(ids('title')).toEqual([
      'Ayna',
      'Gecenin Kıyısında',
      'Mahalle',
      'Mavi Saat',
      'Şehir Uyurken',
    ]);
    expect(ids('year')[0]).toBe('Gecenin Kıyısında');
    expect(ids('year').at(-1)).toBe('Ayna');
    expect(ids('added')).toEqual([
      'Gecenin Kıyısında',
      'Şehir Uyurken',
      'Ayna',
      'Mahalle',
      'Mavi Saat',
    ]);
  });

  it('matches a catalog title to its entry like the service', () => {
    expect(matchWork(list, { kind: 'movie', title: 'MAVİ SAAT', year: 2024 })?.id).toBe(
      'Mavi Saat',
    );
    expect(matchWork(list, { kind: 'movie', title: 'Mavi Saat', year: 1999 })).toBeNull();
    expect(matchWork(list, { kind: 'series', title: 'Ayna', year: 2025 })?.id).toBe('Ayna');
    expect(matchWork(list, { kind: 'live', title: 'Ayna', year: null })).toBeNull();
  });
});

describe('RMDB progress and diary', () => {
  it('formats positions, shares and the "Devam et" line', () => {
    expect(clock(2530)).toBe('42:10');
    expect(clock(3725)).toBe('1:02:05');
    expect(clock(-3)).toBe('0:00');
    expect(progressShare({ positionSec: 30, durationSec: 120, finished: false })).toBe(0.25);
    expect(progressShare({ positionSec: 30, durationSec: null, finished: false })).toBe(0);
    expect(progressShare({ positionSec: 30, durationSec: 60, finished: true })).toBe(1);
    expect(
      progressLine({
        positionSec: 730,
        durationSec: 2880,
        finished: false,
        episode: { season: 2, episode: 3, title: null },
        updatedAt: 0,
      }),
    ).toBe('S2 B3 · 36 dk kaldı');
    expect(
      progressLine({
        positionSec: 90,
        durationSec: null,
        finished: false,
        episode: null,
        updatedAt: 0,
      }),
    ).toBe('1:30');
  });

  it('groups episodes by season and marks rewatches', () => {
    const episode = (season: number, n: number) => ({
      season,
      episode: n,
      title: null,
      positionSec: 0,
      durationSec: null,
      finished: true,
      watchedAt: 0,
    });
    expect(seasonsOf([episode(2, 1), episode(1, 2), episode(1, 1)])).toEqual([
      { season: 1, episodes: [episode(1, 1), episode(1, 2)] },
      { season: 2, episodes: [episode(2, 1)] },
    ]);
    const entry = (id: string, at: number, ep: number | null = null): RmdbDiaryEntry => ({
      id,
      watchedAt: at,
      viewers: [],
      episode: ep === null ? null : { season: 1, episode: ep, title: null },
      finished: true,
      positionSec: null,
      source: 'hall',
      loggedBy: null,
    });
    expect([...rewatches([entry('c', 3), entry('b', 2), entry('a', 1)])]).toEqual(['b', 'c']);
    expect([...rewatches([entry('b', 2, 2), entry('a', 1, 1)])]).toEqual([]);
  });

  it('shows where an unfinished diary line stopped, as the service recorded it', () => {
    const line = (finished: boolean, positionSec: number | null): RmdbDiaryEntry => ({
      id: 'd-1',
      watchedAt: 1,
      viewers: [],
      episode: { season: 1, episode: 3, title: null },
      finished,
      positionSec,
      source: 'hall',
      loggedBy: null,
    });
    expect(diaryPosition(line(false, 730))).toBe(730);
    // Finished lines and hand logs show no position.
    expect(diaryPosition(line(true, 2850))).toBeNull();
    expect(diaryPosition(line(false, null))).toBeNull();
  });

  it('lists people in Turkish', () => {
    expect(peopleText(['Ece'])).toBe('Ece');
    expect(peopleText(['Ece', 'Can'])).toBe('Ece ve Can');
    expect(peopleText(['Ece', 'Can', 'Sen'])).toBe('Ece, Can ve Sen');
    expect(peopleText(['Ece', 'Can', 'Zeynep', 'Mert', 'Sen'])).toBe('Ece, Can ve 3 kişi daha');
  });

  it('reads an "İzledim" date: today means now, earlier days are kept, later ones refused', () => {
    const now = new Date(2026, 9, 19, 22, 30).getTime();
    expect(dateInputValue(now)).toBe('2026-10-19');
    expect(watchedAtFromInput('2026-10-19', now)).toBeUndefined();
    expect(watchedAtFromInput('2026-10-12', now)).toBe(new Date(2026, 9, 12, 12).getTime());
    expect(watchedAtFromInput('2026-10-20', now)).toBeNull();
    expect(watchedAtFromInput('2026-02-30', now)).toBeNull();
    expect(watchedAtFromInput('', now)).toBeNull();
    expect(watchedAtFromInput('1899-12-31', now)).toBeNull();
  });
});

describe('RMDB resume', () => {
  const target = {
    ref: 'm-3015',
    title: 'Gecenin Kıyısında',
    positionSec: 2525,
    art: null,
    episode: null,
  };
  const unfinishedFilm = details({
    progress: {
      positionSec: 2530,
      durationSec: 7860,
      finished: false,
      episode: null,
      updatedAt: 1,
    },
    resume: target,
  });

  it('labels the main button from where the hall stopped', () => {
    expect(resumeAction(unfinishedFilm)).toEqual({
      kind: 'continue',
      label: 'Devam et · 42:10',
      positionSec: 2525,
    });
    expect(
      resumeAction({
        kind: 'movie',
        progress: { ...unfinishedFilm.progress!, finished: true },
        resume: { ...target, positionSec: 0 },
      }),
    ).toEqual({ kind: 'restart', label: 'Baştan izle', positionSec: 0 });
    expect(
      resumeAction({
        kind: 'series',
        progress: {
          positionSec: 3030,
          durationSec: 3060,
          finished: true,
          episode: { season: 1, episode: 3, title: null },
          updatedAt: 1,
        },
        resume: {
          ref: 'e-1',
          title: 'Kayıp Şehir · 1. Sezon 4. Bölüm',
          positionSec: 0,
          art: null,
          episode: { season: 1, episode: 4, title: null },
        },
      }),
    ).toEqual({ kind: 'next', label: 'Sonraki bölüm · S1 B4', positionSec: 0 });
    expect(
      resumeAction({
        kind: 'series',
        progress: {
          positionSec: 730,
          durationSec: 2880,
          finished: false,
          episode: { season: 2, episode: 3, title: null },
          updatedAt: 1,
        },
        resume: {
          ref: 'e-2',
          title: 'Mahalle · 2. Sezon 3. Bölüm',
          positionSec: 725,
          art: null,
          episode: { season: 2, episode: 3, title: null },
        },
      })?.label,
    ).toBe('Devam et · S2 B3 · 12:10');
    expect(
      resumeAction({ kind: 'movie', progress: null, resume: { ...target, positionSec: 0 } })?.label,
    ).toBe('Salonda oynat');
    expect(resumeAction({ kind: 'movie', progress: null, resume: null })).toBeNull();
  });

  it('explains calmly why nothing can open', () => {
    expect(noResumeNote({ kind: 'movie', progress: null }, false)).toContain('IPTV hesabı yok');
    expect(noResumeNote({ kind: 'movie', progress: null }, true)).toContain('katalogda yok');
    expect(
      noResumeNote(
        {
          kind: 'series',
          progress: { positionSec: 1, durationSec: 1, finished: true, episode: null, updatedAt: 1 },
        },
        true,
      ),
    ).toContain('son bölüme kadar');
  });

  const live = {
    kind: 'community-media',
    ref: 'l-1',
    title: 'TRT 1',
    live: true,
    art: null,
  } as const;
  const room = (control?: 'host'): RoomSnapshot => ({
    roomId: 'hall',
    revision: 4,
    participants: [],
    primary: {
      activity: 'hall',
      title: 'Sinema salonu',
      hostUserId: 'ece',
      startedAt: 0,
      state: 'live',
      ...(control ? { controlMode: control, controllers: [] } : {}),
    },
    timeline: {
      itemId: 'a',
      epoch: 2,
      positionSec: 0,
      playing: true,
      rate: 1,
      effectiveServerTimeMs: 0,
    },
    queue: [{ id: 'a', addedBy: 'ece', media: live }],
    polls: [],
    whiteboard: [],
  });
  const media = resumeMedia(target);

  it('opens now and then seeks when this viewer holds the remote', () => {
    expect(resumeCommands(room(), target, 'x', true)).toEqual({
      open: [
        { type: 'queue.add', itemId: 'x', media, start: true },
        { type: 'queue.remove', itemId: 'a' },
      ],
      seek: { type: 'playback', playing: true, positionSec: 2525, rate: 1 },
      suggested: false,
    });
    // Nothing runs yet: starting the hall gives the remote, so the seek follows.
    expect(resumeCommands(null, target, 'x', false)).toEqual({
      open: [
        { type: 'start', activity: 'hall', title: 'Sinema salonu' },
        { type: 'queue.add', itemId: 'x', media, start: true },
      ],
      seek: { type: 'playback', playing: true, positionSec: 2525, rate: 1 },
      suggested: false,
    });
    // From the start there is nothing to seek; positions stay inside the protocol's range.
    expect(resumeCommands(room(), { ...target, positionSec: 0 }, 'x', true).seek).toBeNull();
    expect(resumeCommands(room(), { ...target, positionSec: 1e9 }, 'x', true).seek).toMatchObject({
      positionSec: 86_400,
    });
  });

  it('only suggests, from the start, without the remote', () => {
    expect(resumeCommands(room('host'), target, 'x', false)).toEqual({
      open: [{ type: 'queue.add', itemId: 'x', media }],
      seek: null,
      suggested: true,
    });
  });

  it('keeps the queue entry within the protocol', () => {
    expect(resumeMedia({ ref: 'e-1', title: '  ', positionSec: 0, art: 'not-hex' })).toEqual({
      kind: 'community-media',
      ref: 'e-1',
      title: 'Adsız',
      live: false,
      art: null,
    });
    expect(
      resumeMedia({ ...target, art: 'ab12cd34ef567890', title: 'x'.repeat(300) }),
    ).toMatchObject({
      art: 'ab12cd34ef567890',
      title: 'x'.repeat(240),
    });
  });

  it('has Turkish copy for the RMDB errors', () => {
    expect(cinemaErrorText(new Error('CINEMA_RMDB_NOT_FOUND'))).toBe("Bu kayıt artık RMDB'de yok.");
    expect(cinemaErrorText(new Error('Error invoking remote method: CINEMA_RMDB_INVALID'))).toBe(
      'Puan veya yorum kaydedilemedi; uzunluğu ve tarihi kontrol et.',
    );
  });
});
