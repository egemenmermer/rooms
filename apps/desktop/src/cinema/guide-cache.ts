import { useEffect, useState } from 'react';
import type { CinemaProgramme } from '../../../../packages/community-cinema/src/types';
import { getCinemaBridge } from './cinema-bridge';

/** Programmes are fetched per channel for this window around now and kept for ten minutes. */
const BEFORE = 3 * 3_600_000,
  AFTER = 26 * 3_600_000,
  FRESH = 10 * 60_000,
  BATCH = 40;

type Entry = { list: CinemaProgramme[]; fetchedAt: number };
const cache = new Map<string, Entry>();
const pending = new Map<string, Promise<void>>();
const listeners = new Set<() => void>();
let version = 0;

const key = (hallId: string, ref: string) => `${hallId}\n${ref}`;

function notify() {
  version++;
  listeners.forEach((listener) => listener());
}

async function load(hallId: string, refs: string[]) {
  const bridge = getCinemaBridge();
  if (!bridge || !refs.length) return;
  const now = Date.now();
  for (let i = 0; i < refs.length; i += BATCH) {
    const batch = refs.slice(i, i + BATCH);
    try {
      const result = await bridge.guide(hallId, batch, now - BEFORE, now + AFTER);
      for (const ref of batch)
        cache.set(key(hallId, ref), {
          list: [...(result[ref] ?? [])].sort((a, b) => a.start - b.start),
          fetchedAt: Date.now(),
        });
    } catch {
      // A missing guide is shown as "Rehber yok"; keep the stale entry if there is one.
      for (const ref of batch)
        if (!cache.has(key(hallId, ref)))
          cache.set(key(hallId, ref), { list: [], fetchedAt: Date.now() });
    }
  }
  notify();
}

/** Starts loading guides for `refs` that are missing or stale. */
export function requestGuides(hallId: string | null, refs: readonly string[]) {
  if (!hallId) return;
  const now = Date.now();
  const missing = refs.filter((ref) => {
    const entry = cache.get(key(hallId, ref));
    return (!entry || now - entry.fetchedAt > FRESH) && !pending.has(key(hallId, ref));
  });
  if (!missing.length) return;
  const task = load(hallId, missing).finally(() => {
    for (const ref of missing) pending.delete(key(hallId, ref));
  });
  for (const ref of missing) pending.set(key(hallId, ref), task);
}

export function cachedGuide(hallId: string | null, ref: string) {
  return hallId ? cache.get(key(hallId, ref))?.list : undefined;
}

/** Guides for the given live refs; re-renders when any guide arrives. */
export function useGuides(hallId: string | null, refs: readonly string[]) {
  const [, setVersion] = useState(version);
  const joined = refs.join(',');
  useEffect(() => {
    const listener = () => setVersion(version);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);
  useEffect(() => {
    requestGuides(hallId, joined ? joined.split(',') : []);
    const timer = setInterval(
      () => requestGuides(hallId, joined ? joined.split(',') : []),
      FRESH / 2,
    );
    return () => clearInterval(timer);
  }, [hallId, joined]);
  const result: Record<string, CinemaProgramme[] | undefined> = {};
  for (const ref of refs) result[ref] = cachedGuide(hallId, ref);
  return result;
}

/** A clock that ticks every `everyMs`, for progress bars and "now" lines. */
export function useNow(everyMs = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(timer);
  }, [everyMs]);
  return now;
}

/** Test hook: forget every cached guide. */
export function resetGuideCache() {
  cache.clear();
  pending.clear();
  notify();
}
