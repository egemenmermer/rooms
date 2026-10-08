import { uiError } from './i18n';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ActivityCommand, ActivityResponse, RoomSnapshot } from '../../../packages/activity-protocol/src/index';

type ActivityStatus = 'idle' | 'loading' | 'connected' | 'error';
const nativeActivity = () => { if (!window.rooms?.activity) throw new Error('Ortak etkinlikler masaüstü uygulaması ve yapılandırılmış sunucu gerektirir.'); return window.rooms.activity; };
const errorText = (error: unknown) => uiError(error);
/** Native IPC owns authentication. Renderer only receives bounded public room state. */
export function useActivityRoom(roomId: string | null) {
  const [room, setRoom] = useState<RoomSnapshot | null>(null);
  const [status, setStatus] = useState<ActivityStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [serverOffsetMs, setServerOffsetMs] = useState(0);
  const current = useRef<RoomSnapshot | null>(null);
  const generation = useRef(0);
  const pending = useRef<Promise<void>>(Promise.resolve());
  const accept = useCallback((value: ActivityResponse, epoch: number) => {
    if (generation.current !== epoch) return;
    if (current.current && value.room.roomId === current.current.roomId && value.room.revision < current.current.revision) return;
    current.current = value.room; setRoom(value.room); setServerOffsetMs(value.serverTimeMs - Date.now()); setStatus('connected'); setError(null);
  }, []);
  const refresh = useCallback(async () => {
    if (!roomId) return; const epoch = generation.current;
    try { accept(await nativeActivity().snapshot(roomId, current.current?.revision ?? 0), epoch); }
    catch (failure) { if (generation.current === epoch) { setError(errorText(failure)); setStatus('error'); } }
  }, [roomId, accept]);
  useEffect(() => {
    const epoch = ++generation.current; current.current = null; setRoom(null); setError(null); setBusy(false);
    if (!roomId) { setStatus('idle'); return; }
    setStatus('loading'); let stopped = false; let timer: ReturnType<typeof setTimeout> | undefined;
    const observe = async () => {
      try { const result = await nativeActivity().snapshot(roomId, current.current?.revision ?? 0); if (!stopped) accept(result, epoch); }
      catch (failure) { if (!stopped && generation.current === epoch) { setError(errorText(failure)); setStatus('error'); } }
      if (!stopped) timer = setTimeout(observe, 3000);
    };
    void observe();
    return () => { stopped = true; clearTimeout(timer); if (generation.current === epoch) generation.current++; };
  }, [roomId, accept]);
  const send = useCallback(async (command: ActivityCommand) => {
    if (!roomId) throw new Error('Önce bir oda seçin.');
    const epoch = generation.current;
    const task = pending.current.catch(() => {}).then(async () => {
      if (generation.current !== epoch) return;
      setBusy(true); setError(null);
      try {
        let state = current.current;
        if (!state) { const result = await nativeActivity().snapshot(roomId); accept(result, epoch); state = result.room; }
        // Joining is explicit and authoritative, not a decorative local participant.
        const selfId = window.rooms ? (await window.rooms.social.session()).user?.id : null;
        if (command.type !== 'join' && command.type !== 'leave' && !state.participants.some(p => p.userId === selfId)) {
          const joined = await nativeActivity().command(roomId, { protocolVersion: 1, commandId: crypto.randomUUID(), expectedRevision: state.revision, command: { type: 'join' } });
          accept(joined, epoch); state = joined.room;
        }
        accept(await nativeActivity().command(roomId, { protocolVersion: 1, commandId: crypto.randomUUID(), expectedRevision: state.revision, command }), epoch);
      } catch (failure) {
        if (generation.current === epoch) { setError(errorText(failure)); await refresh(); setError(errorText(failure)); }
        throw failure;
      } finally { if (generation.current === epoch) setBusy(false); }
    });
    pending.current = task; await task;
  }, [roomId, accept, refresh]);
  return { room, status, error, busy, send, refresh, serverOffsetMs };
}
