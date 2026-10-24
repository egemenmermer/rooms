import { useCommunity } from './community';
import { t, uiError } from './i18n';
import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { activityBridge, developmentActivityState } from './runtime-sources';
import type {
  ActivityCommand,
  ActivityResponse,
  RoomSnapshot,
} from '../../../packages/activity-protocol/src/index';

type ActivityStatus = 'idle' | 'loading' | 'connected' | 'error';
interface View {
  room: RoomSnapshot | null;
  status: ActivityStatus;
  error: string | null;
  busy: boolean;
  serverOffsetMs: number;
}
const idle: View = { room: null, status: 'idle', error: null, busy: false, serverOffsetMs: 0 };
interface Entry {
  scope: string;
  roomId: string;
  view: View;
  listeners: Set<() => void>;
  pending: Promise<void>;
  request: Promise<void> | null;
  timer?: ReturnType<typeof setTimeout>;
  generation: number;
  stopped: boolean;
  users: number;
  observerEpoch: number;
}
const entries = new Map<string, Entry>();
const scope = () => {
  const s = useCommunity.getState();
  return JSON.stringify([s.serverUrl, s.user?.id ?? null]);
};
function patch(entry: Entry, value: Partial<View>) {
  entry.view = { ...entry.view, ...value };
  entry.listeners.forEach((listener) => listener());
}
function valid(entry: Entry, generation: number) {
  return entry.generation === generation && entry.scope === scope() && !entry.stopped;
}
function accept(entry: Entry, result: ActivityResponse, generation: number) {
  if (!valid(entry, generation) || result.room.roomId !== entry.roomId) return;
  if (entry.view.room && result.room.revision < entry.view.room.revision) return;
  patch(entry, {
    room: result.room,
    status: 'connected',
    error: null,
    serverOffsetMs: result.serverTimeMs - Date.now(),
  });
}
function entryFor(roomId: string | null) {
  if (!roomId) return null;
  const key = JSON.stringify([scope(), roomId]);
  let entry = entries.get(key);
  if (!entry) {
    entry = {
      scope: scope(),
      roomId,
      view: { ...idle, status: 'loading' },
      listeners: new Set(),
      pending: Promise.resolve(),
      request: null,
      generation: 0,
      stopped: false,
      users: 0,
      observerEpoch: 0,
    };
    entries.set(key, entry);
    if (entries.size > 20)
      for (const [id, candidate] of entries) {
        if (!candidate.users && candidate !== entry) {
          clearTimeout(candidate.timer);
          candidate.stopped = true;
          candidate.generation++;
          entries.delete(id);
          break;
        }
      }
  }
  return entry;
}
function refreshEntry(entry: Entry, immediate = false): Promise<void> {
  if (entry.request && !immediate) return entry.request;
  const generation = entry.generation;
  const request = (async () => {
    const fixture = developmentActivityState(entry.roomId);
    if (fixture) {
      if (valid(entry, generation))
        patch(entry, {
          room: fixture.room,
          status: fixture.status,
          error: fixture.error,
          serverOffsetMs: fixture.serverTimeMs - Date.now(),
        });
      return;
    }
    try {
      accept(
        entry,
        // Without a known revision there is nothing to wait for: a never-used room is at
        // revision 0, so `afterRevision=0` would hold the first load for the whole long poll.
        await activityBridge().snapshot(
          entry.roomId,
          immediate || !entry.view.room ? undefined : entry.view.room.revision,
        ),
        generation,
      );
    } catch (error) {
      if (valid(entry, generation)) patch(entry, { error: uiError(error), status: 'error' });
    }
  })();
  entry.request = request;
  void request.finally(() => {
    if (entry.request === request) entry.request = null;
  });
  return request;
}
function observe(entry: Entry, observerEpoch = entry.observerEpoch) {
  clearTimeout(entry.timer);
  if (entry.stopped || !entry.users || observerEpoch !== entry.observerEpoch) return;
  void refreshEntry(entry).then(() => {
    if (entry.users && !entry.stopped && observerEpoch === entry.observerEpoch)
      entry.timer = setTimeout(
        () => observe(entry, observerEpoch),
        entry.view.status === 'error' ? 10000 : 3000,
      );
  });
}
useCommunity.subscribe((state, previous) => {
  if (state.user?.id === previous.user?.id && state.serverUrl === previous.serverUrl) return;
  for (const entry of entries.values()) {
    entry.stopped = true;
    entry.generation++;
    clearTimeout(entry.timer);
    patch(entry, { ...idle });
  }
  entries.clear();
});
window.addEventListener('rooms:channel-access-invalidated', (event) => {
  const ids = new Set((event as CustomEvent<{ channelIds: string[] }>).detail?.channelIds ?? []);
  for (const entry of entries.values())
    if (ids.has(entry.roomId)) {
      entry.generation++;
      entry.observerEpoch++;
      clearTimeout(entry.timer);
      entry.request = null;
      patch(entry, { ...idle, status: 'loading' });
      if (entry.users) observe(entry);
    }
});
/** One cache, observer and command queue per account/room, independent of screen mounts. */
export function useActivityRoom(roomId: string | null) {
  const accountScope = useCommunity((s) => JSON.stringify([s.serverUrl, s.user?.id ?? null]));
  const entry = entryFor(roomId);
  const subscribe = useCallback(
    (listener: () => void) => {
      if (!entry) return () => {};
      entry.listeners.add(listener);
      return () => {
        entry.listeners.delete(listener);
      };
    },
    [entry],
  );
  const getSnapshot = useCallback(() => entry?.view ?? idle, [entry]);
  const view = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  useEffect(() => {
    if (!entry) return;
    entry.users++;
    if (entry.users === 1) {
      entry.observerEpoch++;
      observe(entry);
    }
    return () => {
      entry.users--;
      if (!entry.users) {
        entry.observerEpoch++;
        clearTimeout(entry.timer);
      }
    };
  }, [entry, accountScope]);
  const refresh = useCallback(
    () => (entry ? refreshEntry(entry, true) : Promise.resolve()),
    [entry],
  );
  const send = useCallback(
    async (command: ActivityCommand) => {
      if (!entry) throw new Error(t('Önce bir oda seçin.'));
      const generation = entry.generation;
      const task = entry.pending
        .catch(() => {})
        .then(async () => {
          if (!valid(entry, generation)) throw new Error(t('Oturum değişti. Yeniden dene.'));
          patch(entry, { busy: true, error: null });
          try {
            let state = entry.view.room;
            if (!state) {
              const response = await activityBridge().snapshot(entry.roomId);
              accept(entry, response, generation);
              state = response.room;
            }
            if (!valid(entry, generation)) throw new Error(t('Oturum değişti. Yeniden dene.'));
            const selfId = useCommunity.getState().user?.id ?? null;
            if (
              command.type !== 'join' &&
              command.type !== 'leave' &&
              !state.participants.some((p) => p.userId === selfId)
            ) {
              const result = await activityBridge().command(entry.roomId, {
                protocolVersion: 1,
                commandId: crypto.randomUUID(),
                expectedRevision: state.revision,
                command: { type: 'join' },
              });
              accept(entry, result, generation);
              state = result.room;
            }
            if (!valid(entry, generation)) throw new Error(t('Oturum değişti. Yeniden dene.'));
            accept(
              entry,
              await activityBridge().command(entry.roomId, {
                protocolVersion: 1,
                commandId: crypto.randomUUID(),
                expectedRevision: state.revision,
                command,
              }),
              generation,
            );
          } catch (error) {
            if (valid(entry, generation)) {
              await refreshEntry(entry, true);
              if (valid(entry, generation)) patch(entry, { error: uiError(error) });
            }
            throw error;
          } finally {
            if (valid(entry, generation)) patch(entry, { busy: false });
          }
        });
      entry.pending = task;
      await task;
    },
    [entry],
  );
  const clearError = useCallback(() => {
    if (entry) patch(entry, { error: null });
  }, [entry]);
  return { ...view, send, refresh, clearError };
}
