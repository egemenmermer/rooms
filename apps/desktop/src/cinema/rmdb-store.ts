import { useEffect } from 'react';
import { create } from 'zustand';
import type { CinemaBridge } from '../../../../packages/community-cinema/src/bridge';
import type {
  RmdbWorkDetails,
  RmdbWorkSummary,
} from '../../../../packages/community-cinema/src/types';
import { useCommunity } from '../community';
import { cinemaErrorCode, cinemaErrorText, getCinemaBridge } from './cinema-bridge';

/** What the desktop knows of one hall's RMDB; the service is the only source of truth. */
interface HallRmdb {
  works: RmdbWorkSummary[] | null;
  listError: string | null;
  listLoading: boolean;
  fetchedAt: number;
  details: Record<string, RmdbWorkDetails>;
  errors: Record<string, string>;
  /** Works the service no longer has (removed meanwhile). */
  gone: Record<string, true>;
  /** Catalog refs added by hand in this session → their RMDB work. */
  refs: Record<string, string>;
}

const blank: HallRmdb = {
  works: null,
  listError: null,
  listLoading: false,
  fetchedAt: 0,
  details: {},
  errors: {},
  gone: {},
  refs: {},
};

const useRmdbStore = create<{ halls: Record<string, HallRmdb> }>(() => ({ halls: {} }));

function patch(hallId: string, change: (hall: HallRmdb) => HallRmdb) {
  useRmdbStore.setState((state) => ({
    halls: { ...state.halls, [hallId]: change(state.halls[hallId] ?? blank) },
  }));
}

const without = <T>(record: Record<string, T>, key: string) => {
  if (!(key in record)) return record;
  const copy = { ...record };
  delete copy[key];
  return copy;
};

/** RMDB calls of the bridge; a main process without them reads as an unavailable service. */
export function rmdbBridge(): CinemaBridge {
  const bridge = getCinemaBridge();
  if (!bridge || typeof bridge.rmdb !== 'function') throw new Error('CINEMA_UNAVAILABLE');
  return bridge;
}

/** Bumped on reset, so answers for an earlier account or test are dropped. */
let generation = 0;
const inflight = new Map<string, Promise<void>>();
/** Mutations still running per work, and the chain that keeps them in order. */
const pending = new Map<string, number>();
const chains = new Map<string, Promise<unknown>>();

export function resetRmdbStore() {
  generation++;
  inflight.clear();
  pending.clear();
  chains.clear();
  useRmdbStore.setState({ halls: {} });
}

// Another account or server sees another RMDB.
useCommunity.subscribe((state, previous) => {
  if (state.user?.id !== previous.user?.id || state.serverUrl !== previous.serverUrl)
    resetRmdbStore();
});

const workKey = (hallId: string, workId: string) => `${hallId}\n${workId}`;

/** Puts a work the service returned into the details and the list (new ones go first). */
export function acceptRmdbWork(hallId: string, details: RmdbWorkDetails, front = true) {
  patch(hallId, (hall) => {
    const known = hall.works?.some((work) => work.id === details.id);
    const works = !hall.works
      ? hall.works
      : known
        ? hall.works.map((work) => (work.id === details.id ? details : work))
        : front
          ? [details, ...hall.works]
          : [...hall.works, details];
    return {
      ...hall,
      works,
      details: { ...hall.details, [details.id]: details },
      errors: without(hall.errors, details.id),
      gone: without(hall.gone, details.id),
    };
  });
}

/** Drops a work everywhere and remembers that it is gone. */
export function forgetRmdbWork(hallId: string, workId: string) {
  patch(hallId, (hall) => ({
    ...hall,
    works: hall.works?.filter((work) => work.id !== workId) ?? null,
    details: without(hall.details, workId),
    gone: { ...hall.gone, [workId]: true },
    refs: Object.fromEntries(Object.entries(hall.refs).filter(([, id]) => id !== workId)),
  }));
}

export function loadRmdbList(hallId: string): Promise<void> {
  const key = `${hallId}\nlist`;
  const running = inflight.get(key);
  if (running) return running;
  const started = generation;
  patch(hallId, (hall) => ({ ...hall, listLoading: true }));
  const task = (async () => {
    try {
      const works = await rmdbBridge().rmdb(hallId);
      if (started !== generation) return;
      patch(hallId, (hall) => ({
        ...hall,
        // A work with a change still on its way keeps what this viewer already sees.
        works: works.map((work) =>
          pending.get(workKey(hallId, work.id)) && hall.details[work.id]
            ? hall.details[work.id]!
            : work,
        ),
        listError: null,
        listLoading: false,
        fetchedAt: Date.now(),
      }));
    } catch (error) {
      if (started !== generation) return;
      patch(hallId, (hall) => ({
        ...hall,
        listError: cinemaErrorText(error),
        listLoading: false,
        fetchedAt: Date.now(),
      }));
    }
  })().finally(() => inflight.delete(key));
  inflight.set(key, task);
  return task;
}

export function loadRmdbWork(hallId: string, workId: string): Promise<void> {
  const key = workKey(hallId, workId);
  const running = inflight.get(key);
  if (running) return running;
  const started = generation;
  const task = (async () => {
    try {
      const details = await rmdbBridge().rmdbWork(hallId, workId);
      if (started !== generation || pending.get(key)) return;
      acceptRmdbWork(hallId, details, false);
    } catch (error) {
      if (started !== generation) return;
      if (cinemaErrorCode(error) === 'CINEMA_RMDB_NOT_FOUND') forgetRmdbWork(hallId, workId);
      else
        patch(hallId, (hall) => ({
          ...hall,
          errors: { ...hall.errors, [workId]: cinemaErrorText(error) },
        }));
    }
  })().finally(() => inflight.delete(key));
  inflight.set(key, task);
  return task;
}

/**
 * A change to one work: shown at once through `change` (when the details are loaded), sent in
 * order after the work's earlier changes, and settled by what the service returns. A failure
 * reads the work again, so the page never keeps a change the service refused.
 */
export async function mutateRmdbWork(
  hallId: string,
  workId: string,
  change: ((details: RmdbWorkDetails) => RmdbWorkDetails) | null,
  call: (bridge: CinemaBridge) => Promise<RmdbWorkDetails>,
): Promise<RmdbWorkDetails> {
  const key = workKey(hallId, workId);
  const started = generation;
  const current = useRmdbStore.getState().halls[hallId]?.details[workId];
  if (change && current) acceptRmdbWork(hallId, change(current), false);
  pending.set(key, (pending.get(key) ?? 0) + 1);
  const settle = () => {
    const left = (pending.get(key) ?? 1) - 1;
    if (left > 0) pending.set(key, left);
    else pending.delete(key);
    return left;
  };
  const run = (chains.get(key) ?? Promise.resolve()).catch(() => {}).then(() => call(rmdbBridge()));
  chains.set(key, run);
  try {
    const result = await run;
    if (started === generation && settle() === 0) acceptRmdbWork(hallId, result, false);
    return result;
  } catch (error) {
    if (started === generation) {
      const left = settle();
      if (cinemaErrorCode(error) === 'CINEMA_RMDB_NOT_FOUND') forgetRmdbWork(hallId, workId);
      else if (left === 0) void loadRmdbWork(hallId, workId);
    }
    throw error;
  } finally {
    if (chains.get(key) === run) chains.delete(key);
  }
}

/** Adds a catalog film or series by hand; the entry goes to the front of the list. */
export async function addToRmdb(hallId: string, ref: string, watchlist: boolean) {
  const details = await rmdbBridge().rmdbAdd(hallId, ref, watchlist);
  acceptRmdbWork(hallId, details);
  patch(hallId, (hall) => ({ ...hall, refs: { ...hall.refs, [ref]: details.id } }));
  return details;
}

/** Owner: removes a work with everything in it. */
export async function removeFromRmdb(hallId: string, workId: string) {
  await rmdbBridge().rmdbRemove(hallId, workId);
  forgetRmdbWork(hallId, workId);
}

/**
 * The hall's RMDB list. It is read again when a view opens with an older copy than `maxAgeMs`
 * and every minute while a view shows it, since the hall keeps adding to it.
 */
export function useRmdbList(hallId: string, maxAgeMs = 0) {
  const hall = useRmdbStore((state) => state.halls[hallId]) ?? blank;
  useEffect(() => {
    const state = useRmdbStore.getState().halls[hallId];
    if (!state?.works || Date.now() - state.fetchedAt > maxAgeMs) void loadRmdbList(hallId);
    const timer = setInterval(() => void loadRmdbList(hallId), 60_000);
    return () => clearInterval(timer);
  }, [hallId, maxAgeMs]);
  return {
    works: hall.works,
    error: hall.works ? null : hall.listError,
    loading: !hall.works && !hall.listError,
    refs: hall.refs,
    reload: () => void loadRmdbList(hallId),
  };
}

/**
 * One work's details, read again whenever the page opens (the catalog may have changed) and
 * every half minute while it stays open, since the hall may be watching it.
 */
export function useRmdbWork(hallId: string, workId: string) {
  const details = useRmdbStore((state) => state.halls[hallId]?.details[workId]) ?? null;
  const error = useRmdbStore((state) => state.halls[hallId]?.errors[workId]) ?? null;
  const gone = useRmdbStore((state) => !!state.halls[hallId]?.gone[workId]);
  useEffect(() => {
    void loadRmdbWork(hallId, workId);
    const timer = setInterval(() => void loadRmdbWork(hallId, workId), 30_000);
    return () => clearInterval(timer);
  }, [hallId, workId]);
  return {
    details,
    error: details ? null : error,
    gone,
    reload: () => void loadRmdbWork(hallId, workId),
  };
}
