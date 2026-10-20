import { useEffect, useSyncExternalStore } from 'react';
import { cinemaErrorText, getCinemaBridge } from './cinema-bridge';

/** The live category that lists this member's starred channels. */
export const FAVORITES = 'favorites';

// This member's favourite channels per hall, kept on the server and mirrored here.
const lists = new Map<string, string[]>();
const loading = new Set<string>();
const listeners = new Set<() => void>();
const emit = () => {
  for (const listener of listeners) listener();
};
const EMPTY: string[] = [];

function load(hallId: string) {
  const bridge = getCinemaBridge();
  if (!bridge?.favorites || lists.has(hallId) || loading.has(hallId)) return;
  loading.add(hallId);
  bridge
    .favorites(hallId)
    .then((refs) => lists.set(hallId, refs))
    .catch(() => lists.set(hallId, []))
    .finally(() => {
      loading.delete(hallId);
      emit();
    });
}

export function useFavorites(hallId: string) {
  useEffect(() => load(hallId), [hallId]);
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => lists.get(hallId) ?? EMPTY,
  );
}

/** Stars or unstars at once; the server's answer replaces the list, a failure puts it back. */
export async function toggleFavorite(
  hallId: string,
  ref: string,
  on: boolean,
  notify: (message: string) => void,
) {
  const bridge = getCinemaBridge();
  if (!bridge?.setFavorite) return;
  const before = lists.get(hallId) ?? [];
  lists.set(
    hallId,
    on
      ? [...before.filter((value) => value !== ref), ref]
      : before.filter((value) => value !== ref),
  );
  emit();
  try {
    lists.set(hallId, await bridge.setFavorite(hallId, ref, on));
  } catch (error) {
    lists.set(hallId, before);
    notify(cinemaErrorText(error));
  }
  emit();
}
