import { create } from 'zustand';
import type { DmCallSession } from '../../../packages/shared-contracts/src/dm-call';
import { useCommunity } from './community';
import { mediaProvider } from './runtime-sources';
import { leaveVoice, useVoiceContext } from './realtime';
import { useRooms } from './store';
import { t, uiError } from './i18n';

interface DmCallState {
  call: DmCallSession | null;
  busy: boolean;
  error: string | null;
  connected: boolean;
  signalingError: string | null;
}
export const useDmCall = create<DmCallState>(() => ({
  call: null,
  busy: false,
  error: null,
  connected: false,
  signalingError: null,
}));
const fixture = () => import.meta.env.DEV && new URLSearchParams(location.search).has('fixture');
const bridge = () => {
  if (fixture()) throw new Error(t('Örnek görünümde gerçek arama başlatılamaz.'));
  if (!window.rooms?.dmCalls) throw new Error(t('Özel arama için masaüstü uygulamasını aç.'));
  return window.rooms.dmCalls;
};
let identity = '',
  epoch = 0,
  consent: { callId: string; camera: boolean } | null = null;
let connecting: Promise<void> | null = null;
let stopped = new Set<string>();
let pollFailures = 0,
  nextPollAt = 0;
const account = () => {
  const state = useCommunity.getState();
  return state.user ? `${state.serverUrl}:${state.user.id}` : '';
};
const active = (call: DmCallSession | null) => !!call && call.state !== 'ended';
export function dmCallUnavailable() {
  if (fixture()) return t('Örnek görünümde gerçek arama başlatılamaz.');
  if (!useCommunity.getState().user) return t('Önce giriş yap.');
  if (useDmCall.getState().signalingError) return useDmCall.getState().signalingError;
  if (useDmCall.getState().busy || connecting) return t('Arama işlemi sürüyor.');
  if (active(useDmCall.getState().call)) return t('Önce mevcut özel görüşmeyi bitir.');
  if (useVoiceContext.getState().busy) return t('Ses bağlantısı değişiyor. Biraz bekle.');
  return null;
}
export const dmCallFailure = (error: unknown) => {
  const message = uiError(error);
  return /token|jwt|https?:|wss?:/i.test(message)
    ? t('Arama bağlantısı kurulamadı. Yeniden dene.')
    : message;
};
const failure = dmCallFailure;
export async function startDmCall(dmId: string, mode: 'audio' | 'video') {
  const reason = dmCallUnavailable();
  if (reason) throw new Error(reason);
  identity = account();
  const generation = ++epoch;
  useDmCall.setState({ busy: true, error: null });
  try {
    const call = await bridge().start(dmId, mode);
    if (generation !== epoch || identity !== account()) {
      await bridge()
        .respond(call.id, 'end')
        .catch(() => {});
      return;
    }
    consent = { callId: call.id, camera: mode === 'video' };
    useDmCall.setState({ call, connected: false });
  } catch (error) {
    if (generation === epoch) useDmCall.setState({ error: failure(error) });
    throw error;
  } finally {
    if (generation === epoch) useDmCall.setState({ busy: false });
  }
}
export async function acceptDmCall(camera = false) {
  const call = useDmCall.getState().call;
  if (!call || call.state !== 'ringing' || call.calleeId !== useCommunity.getState().user?.id)
    return;
  if (useDmCall.getState().busy || connecting) return;
  if (useVoiceContext.getState().busy) throw new Error(t('Ses bağlantısı değişiyor. Biraz bekle.'));
  const generation = epoch;
  identity = account();
  useDmCall.setState({ busy: true, error: null });
  try {
    const next = await bridge().respond(call.id, 'accept');
    if (generation !== epoch || identity !== account()) return;
    consent = { callId: next.id, camera };
    useDmCall.setState({ call: next });
    await connectAccepted();
  } catch (error) {
    useDmCall.setState({ error: failure(error) });
    throw error;
  } finally {
    if (generation === epoch) useDmCall.setState({ busy: false });
  }
}
export async function joinAcceptedDmCall(camera = false) {
  const call = useDmCall.getState().call;
  if (!call || call.state !== 'accepted' || connecting || useDmCall.getState().busy) return;
  if (useVoiceContext.getState().busy) throw new Error(t('Ses bağlantısı değişiyor. Biraz bekle.'));
  consent = { callId: call.id, camera };
  identity = account();
  await connectAccepted();
}
async function connectAccepted() {
  const state = useDmCall.getState(),
    call = state.call;
  if (
    !call ||
    call.state !== 'accepted' ||
    consent?.callId !== call.id ||
    state.connected ||
    connecting
  )
    return;
  const generation = epoch,
    wantsCamera = consent.camera;
  const valid = () =>
    generation === epoch &&
    identity === account() &&
    useDmCall.getState().call?.id === call.id &&
    useDmCall.getState().call?.state === 'accepted';
  useDmCall.setState({ busy: true });
  const work = (async () => {
    // Like Discord, a private call takes over the voice connection: the room is left first.
    if (useVoiceContext.getState().channelId || mediaProvider().snapshot().roomId)
      await leaveVoice();
    if (!valid()) return;
    const grant = await bridge().grant(call.id);
    if (!valid()) return;
    await mediaProvider().connectRoom(grant.roomName, grant.token, grant.serverUrl);
    if (!valid()) {
      await mediaProvider().disconnect();
      return;
    }
    useDmCall.setState({ connected: true });
    await mediaProvider().setNoiseSuppression(
      useRooms.getState().preferences.noiseSuppression,
      useRooms.getState().preferences.noiseSuppressionMode,
    );
    if (!valid()) return;
    await mediaProvider().deviceSelection(
      useRooms.getState().preferences.inputId,
      useRooms.getState().preferences.outputId,
    );
    if (!valid()) return;
    // Start/accept is explicit microphone consent. Camera consent is local and separate for each participant.
    try {
      await mediaProvider().publishMic(useRooms.getState().preferences.inputId || undefined);
    } catch {
      if (valid())
        useDmCall.setState({
          error: t('Mikrofon açılamadı. Görüşme bağlı; mikrofon iznini kontrol et.'),
        });
    }
    if (!valid()) return;
    if (wantsCamera)
      try {
        await mediaProvider().publishCamera(true);
      } catch {
        if (valid())
          useDmCall.setState({ error: t('Kamera açılamadı. Sesli görüşme devam ediyor.') });
      }
  })();
  connecting = work;
  try {
    await work;
  } catch (error) {
    if (valid()) {
      await bridge()
        .respond(call.id, 'end')
        .catch(() => {});
      await mediaProvider().disconnect();
      consent = null;
      stopped.add(call.id);
      useDmCall.setState({ call: null, connected: false, error: failure(error) });
    }
  } finally {
    if (connecting === work) connecting = null;
    if (generation === epoch) useDmCall.setState({ busy: false });
  }
}
export async function endDmCall(action: 'reject' | 'end' = 'end') {
  const { call, connected } = useDmCall.getState();
  ++epoch;
  consent = null;
  if (call) stopped.add(call.id);
  useDmCall.setState({ call: null, busy: true, connected: false, error: null });
  const signal = call
    ? bridge()
        .respond(call.id, action)
        .catch(() => {})
    : Promise.resolve();
  try {
    if (connected || connecting) await mediaProvider().disconnect();
    await connecting?.catch(() => {});
    await signal;
  } finally {
    useDmCall.setState({ busy: false });
  }
}
export async function refreshDmCall() {
  if (fixture()) return;
  if (account() !== identity) {
    await resetDmCalls();
    identity = account();
  }
  if (!identity || !window.rooms?.dmCalls) return;
  if (Date.now() < nextPollAt) return;
  const generation = epoch,
    currentAccount = identity;
  try {
    const { call } = await bridge().poll();
    if (generation !== epoch || currentAccount !== account()) return;
    pollFailures = 0;
    nextPollAt = 0;
    useDmCall.setState({ signalingError: null });
    if (call?.state === 'ended' || !call) {
      const previous = useDmCall.getState().call;
      if (previous && (!call || previous.id === call.id)) {
        const message =
          call?.reason === 'rejected'
            ? t('Arama reddedildi.')
            : call?.reason === 'missed'
              ? t('Arama yanıtlanmadı.')
              : call?.reason === 'access-lost'
                ? t('Özel görüşme erişimi sona erdi.')
                : call?.reason === 'disconnected'
                  ? t('Karşı tarafın arama bağlantısı kesildi.')
                  : t('Görüşme sona erdi.');
        await endDmCall();
        useDmCall.setState({ error: message });
      }
      return;
    }
    if (stopped.has(call.id)) return;
    const previous = useDmCall.getState().call;
    if (previous && previous.id !== call.id) await endDmCall();
    useDmCall.setState({ call });
    await connectAccepted();
  } catch (error) {
    if (generation === epoch && currentAccount === account()) {
      // An idle background capability failure is not a user action or a failed voice-room connection.
      pollFailures++;
      nextPollAt = Date.now() + Math.min(60000, 3000 * 2 ** Math.min(pollFailures, 5));
      useDmCall.setState({ signalingError: failure(error) });
    }
  }
}
export async function resetDmCalls() {
  const previous = identity;
  identity = '';
  pollFailures = 0;
  nextPollAt = 0;
  useDmCall.setState({ signalingError: null });
  await endDmCall();
  stopped = new Set();
  if (previous !== account()) useDmCall.setState({ error: null });
}
export function dismissDmCallError() {
  useDmCall.setState({ error: null });
}
