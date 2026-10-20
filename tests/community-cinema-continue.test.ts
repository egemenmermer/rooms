import { describe, expect, it } from 'vitest';
import type { CinemaContinueItem } from '../packages/community-cinema/src/types';
import { cleanEpisodeTitle, cleanVodTitle } from '../packages/community-cinema/src/titles';
import {
  airDateLabel,
  continueLine,
  daysUntil,
  visibleContinue,
} from '../apps/desktop/src/cinema/continue-model';

const card = (patch: Partial<CinemaContinueItem>): CinemaContinueItem => ({
  workId: 'w-aaaaaaaaaa',
  kind: 'series',
  ref: 's-1',
  title: 'Dizi',
  art: null,
  resume: null,
  episode: null,
  progress: 0,
  remainingSec: null,
  upcomingAt: null,
  updatedAt: 1_000,
  ...patch,
});

describe('Devam et row', () => {
  it('writes the episode code and name only, never the series again', () => {
    expect(continueLine(card({ episode: { season: 1, episode: 2, title: 'Kırmızı Işık' } }))).toBe(
      'S1 B2 · Kırmızı Işık',
    );
    expect(continueLine(card({ episode: { season: 3, episode: 10, title: null } }))).toBe('S3 B10');
    expect(continueLine(card({ kind: 'movie', remainingSec: 47 * 60 }))).toBe('47 dk kaldı');
  });

  it('dates announced episodes by calendar day and counts down under 60 days', () => {
    const now = new Date(2026, 9, 20, 23, 30).getTime();
    expect(airDateLabel(Date.UTC(2026, 11, 8, 12))).toBe('08.12.2026');
    expect(daysUntil(Date.UTC(2026, 11, 8, 12), now)).toBe(49);
    expect(daysUntil(Date.UTC(2026, 9, 21, 12), now)).toBe(1);
    expect(daysUntil(Date.UTC(2026, 11, 19, 12), now)).toBe(null);
  });

  it('keeps a hidden card away until the hall watches the work again', () => {
    const items = [
      card({ workId: 'w-a', updatedAt: 100 }),
      card({ workId: 'w-b', updatedAt: 500 }),
    ];
    const hidden = { 'h:w-a': 200, 'h:w-b': 200 };
    expect(visibleContinue('h', items, hidden).map((item) => item.workId)).toEqual(['w-b']);
    expect(visibleContinue('other', items, hidden)).toHaveLength(2);
  });
});

describe('catalog titles', () => {
  it('drops platform and quality decorations at the edges only', () => {
    expect(cleanVodTitle('(Netflix) Squid Game [2021]')).toBe('Squid Game');
    expect(cleanVodTitle('TR: Kuzey Güney HD')).toBe('Kuzey Güney');
    expect(cleanVodTitle('Mad Max: Fury Road')).toBe('Mad Max: Fury Road');
    expect(cleanVodTitle('Gibi - Exxen')).toBe('Gibi');
  });

  it("keeps an episode's own name", () => {
    expect(cleanEpisodeTitle('Squid Game - S01E02 - Hell', 'Squid Game (2021)', 1, 2)).toBe('Hell');
    expect(cleanEpisodeTitle('Gibi (EXXEN) - S01E03', 'Gibi', 1, 3)).toBe('');
    expect(cleanEpisodeTitle('Bölüm 4', 'Gibi', 1, 4)).toBe('');
    expect(cleanEpisodeTitle('1. Sezon 5. Bölüm - Düğün', 'Gibi', 1, 5)).toBe('Düğün');
    expect(cleanEpisodeTitle('Pilot', 'Lost', 1, 1)).toBe('Pilot');
  });
});

describe('next episode', () => {
  const ep = (season: number, episode: number, airDate: number | null = null) => ({
    ref: `e-${season}${episode}`,
    season,
    episode,
    title: '',
    plot: null,
    durationSec: 2700,
    art: null,
    airDate,
  });
  it('follows across seasons, never into an episode that has not aired', async () => {
    const { nextEpisode, outroSec, nextItemId } =
      await import('../apps/desktop/src/cinema/hall-model');
    const seasons = [
      { season: 2, episodes: [ep(2, 1, Date.now() + 40 * 86_400_000)] },
      { season: 1, episodes: [ep(1, 2), ep(1, 1)] },
    ];
    expect(nextEpisode({ seasons }, 'e-11')?.ref).toBe('e-12');
    expect(nextEpisode({ seasons }, 'e-12')).toBeNull();
    expect(
      nextEpisode({ seasons: [{ season: 2, episodes: [ep(2, 1)] }, ...seasons.slice(1)] }, 'e-12')
        ?.ref,
    ).toBe('e-21');
    expect(nextEpisode(null, 'e-11')).toBeNull();
    expect(outroSec(1200)).toBe(60);
    expect(outroSec(3000)).toBe(120);
    expect(nextItemId('abc')).toBe('next-abc');
  });
});
