import { useEffect } from 'react';
import { create } from 'zustand';
import type { CinemaStatus } from '../../../../packages/community-cinema/src/types';
import { useCommunity } from '../community';
import { cinemaErrorText, getCinemaBridge } from './cinema-bridge';

interface Entry {
  status: CinemaStatus | null;
  error: string | null;
  loading: boolean;
  fetchedAt: number;
}
interface StatusStore {
  entries: Record<string, Entry>;
  put(communityId: string, entry: Partial<Entry>): void;
}

const blank: Entry = { status: null, error: null, loading: false, fetchedAt: 0 };
const useStatusStore = create<StatusStore>((set) => ({
  entries: {},
  put: (communityId, entry) =>
    set((state) => ({
      entries: {
        ...state.entries,
        [communityId]: { ...(state.entries[communityId] ?? blank), ...entry },
      },
    })),
}));

const inflight = new Map<string, Promise<CinemaStatus | null>>();

/** Reads the community's cinema status once; concurrent callers share the request. */
export function refreshCinemaStatus(communityId: string): Promise<CinemaStatus | null> {
  const bridge = getCinemaBridge();
  const store = useStatusStore.getState();
  if (!bridge) {
    store.put(communityId, { status: null, error: null, loading: false, fetchedAt: Date.now() });
    return Promise.resolve(null);
  }
  const running = inflight.get(communityId);
  if (running) return running;
  store.put(communityId, { loading: true });
  const task = bridge
    .status(communityId)
    .then((status) => {
      useStatusStore
        .getState()
        .put(communityId, { status, error: null, loading: false, fetchedAt: Date.now() });
      return status;
    })
    .catch((error) => {
      useStatusStore.getState().put(communityId, {
        error: cinemaErrorText(error),
        loading: false,
        fetchedAt: Date.now(),
      });
      return null;
    })
    .finally(() => inflight.delete(communityId));
  inflight.set(communityId, task);
  return task;
}

/** Applies a status a mutation returned, so every view updates at once. */
export function acceptCinemaStatus(status: CinemaStatus) {
  useStatusStore
    .getState()
    .put(status.communityId, { status, error: null, loading: false, fetchedAt: Date.now() });
}

/**
 * The active community's cinema: its hall channel, whether a source is connected and whether
 * the current user owns it. Refreshes on mount, every `everyMs` (faster while importing).
 */
export function useCommunityCinema(everyMs = 60_000) {
  const communityId = useCommunity((s) => s.activeSpaceId);
  const entry = useStatusStore((s) => (communityId ? s.entries[communityId] : undefined)) ?? blank;
  const importing = !!entry.status?.importing && !entry.status.importing.finishedAt;
  useEffect(() => {
    if (!communityId) return;
    void refreshCinemaStatus(communityId);
    const timer = setInterval(
      () => void refreshCinemaStatus(communityId),
      importing ? 2000 : everyMs,
    );
    return () => clearInterval(timer);
  }, [communityId, everyMs, importing]);
  return {
    communityId,
    hallId: entry.status?.hallChannelId ?? null,
    status: entry.status,
    error: entry.error,
    loading: entry.loading && !entry.status,
    available: !!getCinemaBridge(),
    refresh: () => (communityId ? refreshCinemaStatus(communityId) : Promise.resolve(null)),
  };
}
