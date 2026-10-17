import { useEffect, useState } from 'react';
import type { CinemaBridge } from '../../../../packages/community-cinema/src/bridge';
import type {
  CatalogKind,
  CinemaCategory,
  CinemaItem,
} from '../../../../packages/community-cinema/src/types';
import { cinemaErrorText, getCinemaBridge } from './cinema-bridge';

/** Items seen in any list, so the stage can show a channel's number and badges. */
const known = new Map<string, CinemaItem>();
export const rememberItems = (items: readonly CinemaItem[]) => {
  for (const item of items) known.set(item.ref, item);
};
export const knownItem = (ref: string | null | undefined) => (ref ? known.get(ref) : undefined);

type Load<T> = { data: T | null; error: string | null; loading: boolean };

/** One bridge read keyed by `key`; stale results from an older key are dropped. */
export function useBridgeRead<T>(
  key: string | null,
  read: (bridge: CinemaBridge) => Promise<T>,
): Load<T> & { reload(): void } {
  const [state, setState] = useState<Load<T>>({ data: null, error: null, loading: !!key });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const bridge = getCinemaBridge();
    if (!key || !bridge) {
      setState({ data: null, error: null, loading: false });
      return;
    }
    let active = true;
    setState((current) => ({ data: current.data, error: null, loading: true }));
    read(bridge)
      .then((data) => active && setState({ data, error: null, loading: false }))
      .catch(
        (error) =>
          active && setState({ data: null, error: cinemaErrorText(error), loading: false }),
      );
    return () => {
      active = false;
    };
    // `read` is recreated every render; the key names what it reads.
  }, [key, attempt]);
  return { ...state, reload: () => setAttempt((value) => value + 1) };
}

export function useCategories(hallId: string, kind: CatalogKind) {
  return useBridgeRead<CinemaCategory[]>(`${hallId}:${kind}:categories`, (bridge) =>
    bridge.categories(hallId, kind),
  );
}

/** A page of items, remembered for the stage and zapping. */
export function useItems(
  hallId: string,
  kind: CatalogKind,
  categoryId: string | null,
  sort: 'default' | 'name' | 'added' | 'rating' = 'default',
  limit = 500,
) {
  return useBridgeRead(`${hallId}:${kind}:${categoryId ?? '*'}:${sort}:${limit}`, (bridge) =>
    bridge.items(hallId, { kind, categoryId, sort, limit }).then((page) => {
      rememberItems(page.items);
      return page;
    }),
  );
}

/** Most items a whole-list read pulls (twenty pages). */
const ALL_LIMIT = 20_000;
const PAGE = 1000;

/**
 * Every item of a list, read page by page; for the live channel lists, which are
 * virtualized. Very large providers stop at {@link ALL_LIMIT}; `total` still says how many exist.
 */
export function useAllItems(hallId: string, kind: CatalogKind, categoryId: string | null) {
  return useBridgeRead(`${hallId}:${kind}:${categoryId ?? '*'}:all`, async (bridge) => {
    const first = await bridge.items(hallId, { kind, categoryId, limit: PAGE });
    const items = [...first.items];
    while (items.length < Math.min(first.total, ALL_LIMIT)) {
      const page = await bridge.items(hallId, {
        kind,
        categoryId,
        offset: items.length,
        limit: PAGE,
      });
      if (!page.items.length) break;
      items.push(...page.items);
    }
    rememberItems(items);
    return { items, total: first.total };
  });
}
