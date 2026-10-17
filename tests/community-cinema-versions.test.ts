import { describe, expect, it } from 'vitest';
import { Catalog, type CatalogSnapshot, type StoredItem } from '../apps/services/cinema/catalog';

const item = (ref: string, title: string, year: number | null, badges: string[]): StoredItem => ({
  ref,
  kind: ref.startsWith('s-') ? 'series' : 'movie',
  title,
  badges,
  categoryId: null,
  number: null,
  art: null,
  year,
  rating: null,
  addedAt: null,
  hasGuide: false,
  providerId: ref.slice(2),
  epgId: null,
  tvgId: null,
  ext: 'mkv',
  url: null,
  userAgent: null,
  referrer: null,
  plot: null,
  genre: null,
  cast: null,
  director: null,
  durationSec: null,
  backdrop: null,
});

describe('catalog quality versions', () => {
  const catalog = new Catalog({
    version: 1,
    importedAt: null,
    guideImportedAt: null,
    providerGuideUrl: null,
    categories: [],
    items: [
      item('m-1', 'Kış Uykusu', 2014, ['FHD']),
      item('m-2', 'Kış uykusu', 2014, ['4K']),
      item('m-3', 'Kış Uykusu', 1990, ['HD']),
      item('m-4', 'Kış Uykusu', null, []),
      item('s-1', 'Kış Uykusu', 2014, ['HD']),
    ],
    episodes: {},
    art: {},
    programmes: {},
  } as unknown as CatalogSnapshot);

  it('finds the same title of the same kind and year in other qualities', () => {
    expect(catalog.versions('m-1').map((v) => v.ref)).toEqual(['m-2', 'm-4']);
    expect(catalog.versions('s-1')).toEqual([]);
    expect(catalog.versions('m-9')).toEqual([]);
  });
});
