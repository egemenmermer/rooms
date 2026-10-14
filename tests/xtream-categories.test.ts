import { expect, it } from 'vitest';
import { xtreamCategories, xtreamGroup } from '../packages/personal-media/src/xtream';
it('resolves wrapped and keyed provider categories with normalized numeric IDs', () => {
  for (const source of [
    [{ category_id: '007', category_name: 'Türkiye · Spor' }],
    { data: [{ category_id: 7, category_name: 'Türkiye · Spor' }] },
    { categories: [{ category_id: '7', category_name: 'Türkiye · Spor' }] },
    { '7': { category_name: 'Türkiye · Spor' } },
  ])
    expect(xtreamGroup({ category_id: 7 }, xtreamCategories(source))).toBe('Türkiye · Spor');
});
it('uses inline names without inventing names from missing or numeric metadata', () => {
  expect(xtreamGroup({ category_id: 7, category_name: 'Haber' }, new Map())).toBe('Haber');
  expect(xtreamGroup({ category_id: 7, category_name: '7' }, new Map())).toBe(
    'Kategori adı alınamadı',
  );
  expect(
    xtreamCategories(Array.from({ length: 10001 }, () => ({ category_id: 7, category_name: 'X' })))
      .size,
  ).toBe(0);
});
