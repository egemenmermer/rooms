// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { CinemaBridge } from '../packages/community-cinema/src/bridge';
import { installCinemaFixture } from '../apps/desktop/src/cinema/cinema-bridge';
import { usePagedItems } from '../apps/desktop/src/cinema/catalog-cache';

let restore = () => {};
afterEach(() => restore());

const item = (index: number) => ({
  ref: `m-${index}`,
  kind: 'movie' as const,
  title: `Film ${index}`,
  badges: [],
  categoryId: null,
  number: null,
  art: null,
  year: null,
  rating: null,
  addedAt: null,
  hasGuide: false,
});

it('pages a large grid with offsets and keeps it when a page fails', async () => {
  const items = vi.fn(async (_hall: string, query: { offset?: number; limit?: number }) => {
    if ((query.offset ?? 0) === 1080) throw new Error('CINEMA_UNAVAILABLE');
    const offset = query.offset ?? 0;
    return {
      items: Array.from({ length: query.limit! }, (_, i) => item(offset + i)),
      total: 2000,
    };
  });
  restore = installCinemaFixture({ bridge: { items } as unknown as CinemaBridge, art: () => null });
  const { result } = renderHook(() => usePagedItems('hall', 'movie', null, 'added'));
  await waitFor(() => expect(result.current.items).toHaveLength(60));
  for (let page = 1; page <= 18; page++) {
    await act(async () => result.current.more());
    await waitFor(() => expect(result.current.loading).toBe(false));
  }
  // Every read asks for one page; none goes past the service's 1000-item cap.
  expect(items.mock.calls.every(([, query]) => query.limit === 60)).toBe(true);
  expect(result.current.items).toHaveLength(1080);
  expect(result.current.error).toBe(
    'Sinema servisi şu an yanıt vermiyor. Biraz sonra yeniden dene.',
  );
});
