import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  RMDB_LOG_AFTER_SEC,
  Rmdb,
  RmdbStore,
  type RmdbMeta,
  type RmdbSample,
} from '../apps/services/cinema/rmdb';
import { SecureFiles } from '../apps/services/cinema/secure-file';
import { RMDB_REVIEW_MAX } from '../packages/community-cinema/src/types';

const C = 'community1';
const film: RmdbMeta = {
  kind: 'movie',
  title: 'Kış Uykusu',
  year: 2014,
  genre: 'Dram',
  plot: null,
  director: 'Nuri Bilge Ceylan',
  cast: null,
  durationSec: 11_760,
  tmdbId: '1001001',
  art: 'a'.repeat(24),
  backdrop: 'b'.repeat(24),
};
const egemen = { userId: 'egemen', name: 'egemen' };
const sems = { userId: 'sems', name: 'sems' };

describe('RMDB', () => {
  let dir: string;
  let files: SecureFiles;
  let clock: number;
  let rmdb: Rmdb;

  const sample = (patch: Partial<RmdbSample>): RmdbSample => ({
    communityId: C,
    itemId: 'q1',
    workRef: 'm-3001',
    playing: true,
    positionSec: 0,
    durationSec: 6000,
    episode: null,
    viewer: egemen,
    account: 'acc1',
    meta: () => film,
    at: clock,
    ...patch,
  });
  /** The hall plays on for `seconds`, seen by `viewer`. */
  const playFor = (seconds: number, patch: Partial<RmdbSample> & { from: number }) => {
    clock += seconds * 1000;
    return rmdb.observe(sample({ ...patch, positionSec: patch.from + seconds }));
  };

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rooms-rmdb-'));
    files = new SecureFiles(randomBytes(32));
    clock = Date.UTC(2026, 9, 19, 20);
    rmdb = new Rmdb(new RmdbStore(dir, files), () => clock);
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('logs a title only after five minutes of real playback; jumps do not count', () => {
    expect(rmdb.observe(sample({ positionSec: 0 }))).toBeNull();
    // A ten-minute jump in one second is a seek, not watching.
    clock += 1000;
    expect(rmdb.observe(sample({ positionSec: 600 }))).toBeNull();
    expect(playFor(RMDB_LOG_AFTER_SEC - 20, { from: 600 })).toBeNull();
    expect(rmdb.list(C, 'egemen')).toEqual([]);
    const created = playFor(30, { from: 600 + RMDB_LOG_AFTER_SEC - 20, viewer: sems });
    expect(created).toMatchObject({
      title: 'Kış Uykusu',
      tmdbId: '1001001',
      source: { ref: 'm-3001' },
    });
    const [work] = rmdb.list(C, 'egemen');
    expect(work).toMatchObject({
      kind: 'movie',
      watchCount: 1,
      progress: { positionSec: 910, durationSec: 6000, finished: false, episode: null },
    });
    const details = rmdb.details(C, work.id, 'egemen');
    expect(details.diary[0]).toMatchObject({
      source: 'hall',
      finished: false,
      positionSec: 910,
      loggedBy: null,
    });
    expect(details.diary[0].viewers.map((v) => v.userId).sort()).toEqual(['egemen', 'sems']);
    expect(details.diary[0].watchedAt).toBe(Date.UTC(2026, 9, 19, 20));
  });

  it('finishes at 90 %, keeps one diary line per queue entry and counts rewatches', () => {
    rmdb.observe(sample({ positionSec: 0 }));
    playFor(400, { from: 0 });
    playFor(5000, { from: 400 });
    let [work] = rmdb.list(C, 'egemen');
    expect(work.progress?.finished).toBe(true);
    expect(work.watchCount).toBe(1);
    // Queued again later: a new watch, unfinished until it gets far enough.
    rmdb.observe(sample({ itemId: 'q2', positionSec: 0 }));
    [work] = rmdb.list(C, 'egemen');
    expect(work.progress).toMatchObject({ finished: false, positionSec: 0 });
    expect(work.watchCount).toBe(1);
    playFor(400, { itemId: 'q2', from: 0 });
    [work] = rmdb.list(C, 'egemen');
    expect(work.watchCount).toBe(2);
    expect(rmdb.details(C, work.id, 'egemen').diary.map((line) => line.finished)).toEqual([
      false,
      true,
    ]);
  });

  it('updates a title it already has from the first sample', () => {
    const { work } = rmdb.add(C, film, { ref: 'm-3001', account: 'acc1' }, egemen, true);
    rmdb.observe(sample({ positionSec: 1200 }));
    playFor(60, { from: 1200 });
    const summary = rmdb.list(C, 'egemen')[0];
    expect(summary).toMatchObject({ id: work.id, onWatchlist: true, watchCount: 0 });
    expect(summary.progress?.positionSec).toBe(1260);
  });

  it('records series progress per episode', () => {
    const series: RmdbMeta = {
      ...film,
      kind: 'series',
      title: 'Sıcak Kafa',
      tmdbId: '5005005',
      durationSec: null,
    };
    const episode = { season: 1, episode: 2, title: 'Bölüm 2' };
    const common = { workRef: 's-5001', episode, durationSec: 2400, meta: () => series };
    rmdb.observe(sample({ ...common, positionSec: 0 }));
    playFor(400, { ...common, from: 0 });
    const [work] = rmdb.list(C, 'egemen');
    expect(work).toMatchObject({ kind: 'series', progress: { episode, positionSec: 400 } });
    expect(rmdb.details(C, work.id, 'egemen').episodes).toEqual([
      expect.objectContaining({ season: 1, episode: 2, positionSec: 400, finished: false }),
    ]);
  });

  it('knows a title again by TMDB id, or by name and year', () => {
    const { work } = rmdb.add(C, film, { ref: 'm-3001', account: 'acc1' }, egemen, false);
    expect(rmdb.find(C, { ...film, title: 'KIŞ UYKUSU', tmdbId: null })?.id).toBe(work.id);
    expect(rmdb.find(C, { ...film, title: 'Winter Sleep', tmdbId: '1001001' })?.id).toBe(work.id);
    expect(rmdb.find(C, { ...film, year: null, tmdbId: null })?.id).toBe(work.id);
    expect(rmdb.find(C, { ...film, year: 1999, tmdbId: null })).toBeNull();
    expect(rmdb.find(C, { ...film, tmdbId: '42' })).toBeNull();
    expect(rmdb.find(C, { ...film, kind: 'series', tmdbId: null })).toBeNull();
    const again = rmdb.add(
      C,
      { ...film, tmdbId: null },
      { ref: 'm-9', account: 'acc2' },
      sems,
      false,
    );
    expect(again.created).toBe(false);
    expect(again.work.id).toBe(work.id);
  });

  it('keeps one review per member and averages ratings', () => {
    const { work } = rmdb.add(C, film, { ref: 'm-3001', account: 'acc1' }, egemen, false);
    rmdb.review(C, work.id, egemen, { rating: 9, text: ' Çok iyi ', spoiler: true, liked: true });
    clock += 1000;
    rmdb.review(C, work.id, sems, { rating: 6, text: '', spoiler: true, liked: false });
    const created = rmdb
      .details(C, work.id, 'egemen')
      .reviews.find((r) => r.author.userId === 'egemen')!.createdAt;
    clock += 1000;
    rmdb.review(C, work.id, egemen, {
      rating: 8,
      text: 'Yine izledim',
      spoiler: false,
      liked: true,
    });
    const details = rmdb.details(C, work.id, 'egemen');
    expect(details).toMatchObject({
      averageRating: 7,
      ratingCount: 2,
      reviewCount: 1,
      likeCount: 1,
      mine: { rating: 8, liked: true },
    });
    const own = details.reviews.find((r) => r.author.userId === 'egemen')!;
    expect(own).toMatchObject({ text: 'Yine izledim', createdAt: created });
    // A spoiler flag needs text.
    expect(details.reviews.find((r) => r.author.userId === 'sems')?.spoiler).toBe(false);
    // Nothing left removes the review; the owner removes someone else's.
    rmdb.review(C, work.id, sems, { rating: null, text: ' ', spoiler: false, liked: false });
    expect(rmdb.details(C, work.id, 'egemen').ratingCount).toBe(1);
    rmdb.removeReview(C, work.id, 'egemen');
    expect(rmdb.details(C, work.id, 'egemen').reviews).toEqual([]);
    expect(() => rmdb.removeReview(C, work.id, 'egemen')).toThrow('CINEMA_RMDB_NOT_FOUND');
  });

  it('rejects ratings and texts it cannot keep', () => {
    const { work } = rmdb.add(C, film, { ref: 'm-3001', account: 'acc1' }, egemen, false);
    for (const rating of [0, 11, 4.5])
      expect(() =>
        rmdb.review(C, work.id, egemen, { rating, text: '', spoiler: false, liked: false }),
      ).toThrow('CINEMA_RMDB_INVALID');
    expect(() =>
      rmdb.review(C, work.id, egemen, {
        rating: 5,
        text: 'x'.repeat(RMDB_REVIEW_MAX + 1),
        spoiler: false,
        liked: false,
      }),
    ).toThrow('CINEMA_RMDB_INVALID');
    expect(() => rmdb.details(C, 'w-doesnotexist', 'egemen')).toThrow('CINEMA_RMDB_NOT_FOUND');
    expect(() => rmdb.details(C, '../etc', 'egemen')).toThrow('CINEMA_RMDB_NOT_FOUND');
  });

  it('lets members log watches by hand and only the author or the owner remove them', () => {
    const { work } = rmdb.add(C, film, { ref: 'm-3001', account: 'acc1' }, egemen, false);
    expect(() => rmdb.log(C, work.id, sems, clock + 3600_000)).toThrow('CINEMA_RMDB_INVALID');
    rmdb.log(C, work.id, sems, clock - 86_400_000);
    const line = rmdb.details(C, work.id, 'sems').diary[0];
    expect(line).toMatchObject({
      source: 'manual',
      finished: true,
      viewers: [sems],
      loggedBy: sems,
    });
    expect(() => rmdb.removeLog(C, work.id, line.id, egemen, false)).toThrow(
      'CINEMA_ACCESS_DENIED',
    );
    rmdb.removeLog(C, work.id, line.id, sems, false);
    rmdb.log(C, work.id, sems);
    const second = rmdb.details(C, work.id, 'sems').diary[0];
    rmdb.removeLog(C, work.id, second.id, egemen, true);
    expect(rmdb.details(C, work.id, 'sems').diary).toEqual([]);
  });

  it('shares İzlenecekler and removes a work with the art only it uses', () => {
    const one = rmdb.add(C, film, { ref: 'm-3001', account: 'acc1' }, egemen, false).work;
    rmdb.watchlist(C, one.id, sems, true);
    expect(rmdb.details(C, one.id, 'egemen').watchlist?.by).toEqual(sems);
    rmdb.watchlist(C, one.id, egemen, false);
    expect(rmdb.list(C, 'egemen')[0].onWatchlist).toBe(false);
    const other = rmdb.add(
      C,
      { ...film, title: 'Babam ve Oğlum', year: 2005, tmdbId: null, backdrop: null },
      { ref: 'm-3002', account: 'acc1' },
      egemen,
      false,
    ).work;
    // Both show the same poster; only the backdrop is unused once the first goes.
    expect(rmdb.remove(C, one.id)).toEqual(['b'.repeat(24)]);
    expect(rmdb.list(C, 'egemen').map((w) => w.id)).toEqual([other.id]);
  });

  it('stores everything encrypted and reads it back after a restart', async () => {
    const { work } = rmdb.add(C, film, { ref: 'm-3001', account: 'acc1' }, egemen, true);
    rmdb.review(C, work.id, egemen, { rating: 10, text: 'Başyapıt', spoiler: false, liked: true });
    await rmdb.store.writeArt(
      C,
      'a'.repeat(24),
      { body: Buffer.from('poster'), type: 'image/jpeg' },
      true,
    );
    rmdb.store.flush();
    await rmdb.store.settled();
    const raw = readFileSync(join(dir, 'rmdb', `${C}.enc`));
    expect(raw.toString('latin1')).not.toContain('Başyapıt');
    expect(raw.toString('latin1')).not.toContain('Kış');
    expect(readdirSync(join(dir, 'rmdb', C, 'art'))).toEqual([`${'a'.repeat(24)}.enc`]);
    const restarted = new Rmdb(new RmdbStore(dir, files), () => clock);
    expect(restarted.details(C, work.id, 'egemen')).toMatchObject({
      title: 'Kış Uykusu',
      onWatchlist: true,
      mine: { rating: 10, liked: true },
    });
    expect(restarted.store.readArt(C, 'a'.repeat(24))).toEqual({
      body: Buffer.from('poster'),
      type: 'image/jpeg',
    });
  });
});
