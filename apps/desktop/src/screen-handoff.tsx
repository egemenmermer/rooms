import { create } from 'zustand';
import { useCallback, useEffect, useRef } from 'react';
import { ReferenceIcon } from './ReferenceIcon';
import { mediaBridge } from './runtime-sources';
import { useCommunity } from './community';
import { stopScreen, useRealtime, useVoiceContext } from './realtime';
import { uiError } from './i18n';
import type { ScreenPresenterState } from '@rooms/contracts';

interface ScreenHandoffStore {
  channelId: string | null;
  value: ScreenPresenterState | null;
  loading: boolean;
  busy: boolean;
  error: string | null;
  setChannel(channelId: string | null): void;
  update(value: ScreenPresenterState): void;
  setLoading(value: boolean): void;
  setBusy(value: boolean): void;
  setError(value: string | null): void;
}

const useScreenHandoffStore = create<ScreenHandoffStore>(set => ({
  channelId: null, value: null, loading: false, busy: false, error: null,
  setChannel: channelId => set({ channelId, value: null, loading: Boolean(channelId), busy: false, error: null }),
  update: value => set({ value, loading: false, error: null }),
  setLoading: loading => set({ loading }),
  setBusy: busy => set({ busy }),
  setError: error => set({ error, loading: false }),
}));

export const useScreenHandoff = useScreenHandoffStore;

/** Polls the native media lease independently of screen routes so voice handoff survives navigation. */
export function ScreenHandoffRuntime() {
  const channelId = useVoiceContext(state => state.channelId);
  const identity = useCommunity(state => state.user?.id ?? null);
  const realtime = useRealtime();
  const serverUrl = useCommunity(state => state.serverUrl);
  const connected = realtime.status === 'connected';
  const value = useScreenHandoffStore(state => state.value);
  const stoppedRequest = useRef<string | null>(null);

  useEffect(() => {
    useScreenHandoffStore.getState().setChannel(channelId);
    if (!channelId || !identity || !connected) return;
    let stopped = false;
    let running = false;
    let timer: number | undefined;
    let retryDelay = 0;
    const refresh = async () => {
      if (stopped || running) return;
      running = true;
      try {
        const result = await mediaBridge().screenState(channelId);
        if (!stopped && useScreenHandoffStore.getState().channelId === channelId) { useScreenHandoffStore.getState().update(result); retryDelay = 0; }
      } catch (error) {
        retryDelay = Math.min(60000, Math.max(10000, retryDelay * 2));
        if (!stopped && useScreenHandoffStore.getState().channelId === channelId) useScreenHandoffStore.getState().setError(uiError(error));
      } finally {
        running = false;
        if (!stopped) {
          const reservation = useScreenHandoffStore.getState().value?.reservation;
          const interval = reservation && reservation.expiresAt > Date.now() ? 2000 : 5000;
          timer = window.setTimeout(() => void refresh(), Math.max(interval, retryDelay));
        }
      }
    };
    void refresh();
    return () => { stopped = true; window.clearTimeout(timer); };
  }, [channelId, identity, serverUrl, connected]);

  useEffect(() => {
    const reservation = value?.reservation;
    if (!channelId || !identity || !realtime.sharing || !reservation || reservation.released || reservation.userId === identity || stoppedRequest.current === reservation.requestId) return;
    stoppedRequest.current = reservation.requestId;
    void stopScreen().then(() => useScreenHandoffStore.getState().setError(null)).catch(error => {
      useScreenHandoffStore.getState().setError(`Paylaşım durdurulamadı: ${uiError(error)}`);
    });
  }, [channelId, identity, realtime.sharing, value?.reservation]);

  useEffect(() => {
    if (!value?.reservation) stoppedRequest.current = null;
  }, [value?.reservation]);
  return null;
}

async function runHandoffAction(operation: (channelId: string, state: ScreenPresenterState) => Promise<void>) {
  const store = useScreenHandoffStore.getState();
  if (!store.channelId || !store.value) throw new Error('Sunum durumu henüz yüklenmedi.');
  if (store.busy) return;
  store.setBusy(true); store.setError(null);
  try {
    await operation(store.channelId, store.value);
    const updated = await mediaBridge().screenState(store.channelId);
    if (useScreenHandoffStore.getState().channelId === store.channelId) useScreenHandoffStore.getState().update(updated);
  } catch (error) {
    useScreenHandoffStore.getState().setError(uiError(error));
    throw error;
  } finally { useScreenHandoffStore.getState().setBusy(false); }
}

export function requestScreenHandoff() {
  return runHandoffAction(async (channelId, state) => {
    if (!state.presenter) throw new Error('Etkin bir ekran paylaşımı bulunmuyor.');
    await mediaBridge().requestScreen(channelId, state.presenter.leaseId, crypto.randomUUID());
  });
}

export function cancelScreenHandoff() {
  return runHandoffAction(async (channelId, state) => {
    const identity = useCommunity.getState().user?.id;
    const request = state.requests.find(item => item.userId === identity);
    const reservation = state.reservation?.userId === identity ? state.reservation : null;
    const target = reservation ?? request;
    if (!target) throw new Error('İptal edilecek sunum talebin yok.');
    await mediaBridge().cancelScreenRequest(channelId, target.leaseId, target.requestId);
  });
}

export function decideScreenHandoff(requestId: string, approve: boolean) {
  return runHandoffAction(async (channelId, state) => {
    if (!state.presenter) throw new Error('Etkin sunum sahibi artık bağlı değil.');
    await mediaBridge().decideScreenRequest(channelId, state.presenter.leaseId, requestId, approve);
  });
}

export function ScreenHandoffControls({ activeShare, notify }: { activeShare: boolean; notify(message: string): void }) {
  const state = useScreenHandoffStore(value => value.value);
  const loading = useScreenHandoffStore(value => value.loading);
  const busy = useScreenHandoffStore(value => value.busy);
  const error = useScreenHandoffStore(value => value.error);
  const identity = useCommunity(value => value.user?.id ?? null);
  const realtime = useRealtime();
  const participants = realtime.participants;
  const incoming = state?.presenter?.userId === identity ? state.requests : [];
  const mine = state?.requests.find(item => item.userId === identity);
  const ownReservation = state?.reservation?.userId === identity ? state.reservation : null;
  const otherReservation = state?.reservation && state.reservation.userId !== identity ? state.reservation : null;
  const presenterName = participants.find(person => person.id === state?.presenter?.userId)?.name ?? 'Katılımcı';
  const announce = (operation: Promise<unknown>, success?: string) => void operation.then(() => success && notify(success)).catch(failure => notify(uiError(failure)));
  const choose = useCallback(() => window.dispatchEvent(new Event('rooms:choose-capture')), []);
  if (!state && loading) return <div className="reference-handoff-status" role="status">Sunum durumu yükleniyor…</div>;
  if (!state && !error) return null;
  const showPanel = incoming.length > 0 || Boolean(mine || ownReservation || otherReservation || activeShare && state?.presenter && state.presenter.userId !== identity || error);
  if (!showPanel) return null;
  return <section className="reference-handoff-panel" aria-label="Ekran paylaşımı devri">
    {incoming.map(request => {
      const name = participants.find(person => person.id === request.userId)?.name ?? 'Katılımcı';
      return <div className="reference-handoff-request" key={request.requestId}>
        <div className="reference-handoff-copy"><strong>{name} paylaşmak istiyor</strong><span>Onay, yalnızca ekran yayınını devretmeye izin verir. Yeni kaynak kendi cihazında seçilir.</span></div>
        <div className="reference-handoff-actions"><button className="button secondary small" disabled={busy} onClick={() => announce(decideScreenHandoff(request.requestId, false))}>Reddet</button><button className="button primary small" disabled={busy} onClick={() => announce(decideScreenHandoff(request.requestId, true), 'Devir onaylandı. Mevcut yayın durduruluyor.')}>Onayla ve devret</button></div>
      </div>;
    })}
    {mine && <div className="reference-handoff-notice" role="status"><ReferenceIcon name="clock" size={15}/><span>{presenterName} yanıtını bekliyorsun.</span><button className="button ghost small" disabled={busy} onClick={() => announce(cancelScreenHandoff())}>İptal et</button></div>}
    {ownReservation && <div className="reference-handoff-notice" role="status"><ReferenceIcon name={ownReservation.released ? 'monitor' : 'clock'} size={15}/><span>{ownReservation.released ? 'Sunum sırası sende. Kaynağı bu cihazda seç.' : 'Mevcut yayın durduruluyor…'}</span>{ownReservation.released&&<button className="button primary small" onClick={choose}><ReferenceIcon name="monitor" size={15}/>Kaynak seç</button>}<button className="button ghost small" disabled={busy} onClick={() => announce(cancelScreenHandoff())}>İptal et</button></div>}
    {otherReservation && <div className="reference-handoff-notice" role="status"><ReferenceIcon name="clock" size={15}/><span>{participants.find(person => person.id === otherReservation.userId)?.name ?? 'Katılımcı'} sunum sırasını bekliyor.</span></div>}
    {activeShare && state?.presenter && state.presenter.userId !== identity && !mine && !ownReservation && !otherReservation && <div className="reference-handoff-notice"><span>{presenterName} paylaşıyor.</span><button className="button secondary small" disabled={busy || loading} onClick={() => announce(requestScreenHandoff(), 'Sunum talebi gönderildi.')}>Sunum iste</button></div>}
    {error && <div className="reference-handoff-error" role="alert"><span>{error}</span><button className="button ghost small" onClick={() => { const channelId=useScreenHandoffStore.getState().channelId; if(channelId) void mediaBridge().screenState(channelId).then(useScreenHandoffStore.getState().update).catch(failure=>useScreenHandoffStore.getState().setError(uiError(failure))); }}>Yenile</button></div>}
  </section>;
}
