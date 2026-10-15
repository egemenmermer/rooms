import { useEffect, useRef, useState } from 'react';
import { create } from 'zustand';
import type { MediaTrack } from '@rooms/media';
import {
  remoteInputSchema,
  type RemoteInput,
  type RemoteState,
} from '../../../packages/shared-contracts/src/remote-control';
import { useCommunity } from './community';
import { useRealtime, useVoiceContext } from './realtime';
import { mediaProvider } from './runtime-sources';
const initial = { value: null as RemoteState | null, error: '', reason: '', busy: false };
const fixture = () => import.meta.env.DEV && new URLSearchParams(location.search).has('fixture');
export const useRemoteControl = create<typeof initial>(() => initial);
const errorText = (e: unknown) =>
  e instanceof Error
    ? e.message.replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/, '')
    : 'Kontrol işlemi tamamlanamadı.';

/** Route independent: leaving a room, reconnecting or losing the source revokes control. */
export function RemoteControlRuntime() {
  const room = useVoiceContext((s) => s.channelId),
    media = useRealtime();
  const user = useCommunity((s) => s.user?.id),
    server = useCommunity((s) => s.serverUrl);
  const track = media.tracks.find((t) => t.local && t.source === 'screen_share');
  const hasScreen = media.tracks.some((t) => t.source === 'screen_share');
  useEffect(() => {
    if (fixture()) return;
    const api = window.rooms?.remoteControl;
    useRemoteControl.setState(initial);
    if (!api) return;
    if (!room || !user || media.status !== 'connected' || !hasScreen) {
      void api.revoke().catch(() => {});
      return;
    }
    const provider = mediaProvider();
    let stopped = false,
      polling = false,
      registered = false;
    let lastPoll = 0;
    const poll = async () => {
      if (stopped || polling) return;
      const current = useRemoteControl.getState().value;
      if (Date.now() - lastPoll < (current?.lease || current?.requests.length ? 900 : 2900)) return;
      lastPoll = Date.now();
      polling = true;
      try {
        if (track && !registered) {
          const registration = await api.register(room, track.id);
          if (stopped) return;
          registered = registration.supported;
          useRemoteControl.setState({ reason: registration.reason ?? '' });
        }
        const value = await api.state(room);
        if (!stopped) {
          useRemoteControl.setState({ value, error: '' });
          if (
            track &&
            registered &&
            !value.sources.some((s) => s.publisherId === user && s.trackId === track.id)
          )
            registered = false;
          if (value.lease?.controllerId === user && provider.publishControl) {
            const packet = await api.frame(
              { type: 'ping', nonce: crypto.randomUUID() },
              value.lease.leaseId,
            );
            if (!stopped)
              await provider.publishControl(packet.payload, packet.destination, packet.reliable);
          }
        }
      } catch (error) {
        if (!stopped) {
          useRemoteControl.setState({ value: null, error: errorText(error) });
          void api.revoke().catch(() => {});
        }
      } finally {
        polling = false;
      }
    };
    const unsubscribe =
      provider.onControl?.((payload) => {
        if (!stopped)
          void api
            .receive(payload)
            .then((reply) => {
              if (!stopped && reply && provider.publishControl)
                return provider.publishControl(reply.payload, reply.destination, reply.reliable);
            })
            .catch(() => {
              void api.revoke().catch(() => {});
            });
      }) ?? (() => {});
    const timer = setInterval(() => void poll(), 1000);
    void poll();
    return () => {
      stopped = true;
      clearInterval(timer);
      unsubscribe();
      void api.revoke().catch(() => {});
      useRemoteControl.setState(initial);
    };
  }, [room, user, server, media.status, track?.id, hasScreen]);
  return null;
}
async function action(operation: () => Promise<void>) {
  const identity = useCommunity.getState(),
    room = useVoiceContext.getState().channelId;
  const current = () =>
    useCommunity.getState().user?.id === identity.user?.id &&
    useCommunity.getState().serverUrl === identity.serverUrl &&
    useVoiceContext.getState().channelId === room;
  if (useRemoteControl.getState().busy) return;
  useRemoteControl.setState({ busy: true, error: '' });
  try {
    await operation();
    if (current() && room && window.rooms?.remoteControl)
      useRemoteControl.setState({ value: await window.rooms.remoteControl.state(room) });
  } catch (error) {
    if (current()) useRemoteControl.setState({ error: errorText(error) });
  } finally {
    if (current()) useRemoteControl.setState({ busy: false });
  }
}
export function RemoteControlActions({ track }: { track?: MediaTrack }) {
  const { value, error, reason, busy } = useRemoteControl();
  const user = useCommunity((s) => s.user?.id),
    room = useVoiceContext((s) => s.channelId);
  const api = window.rooms?.remoteControl;
  if (fixture() || !api || !user || !room || !track) return null;
  const source = value?.sources.find(
    (s) => s.trackId === track.id && s.publisherId === track.participantId,
  );
  const lease = value?.lease;
  const pending = value?.requests.find((r) => r.source.publisherId === user);
  const ownRequest = value?.requests.some((r) => r.controllerId === user);
  return (
    <div className="remote-control-actions">
      {lease && (
        <>
          {value?.latencyMs != null && <span>Gidiş dönüş: {Math.round(value.latencyMs)} ms</span>}
          <span role="status">
            {lease.source.publisherId === user
              ? `${lease.controllerId} kontrol ediyor · kendi fare/klavyenle anında geri al`
              : 'Kontrol sende · başka pencereye geçince bırakılır'}
          </span>
          <button onClick={() => void action(() => api.revoke())} disabled={busy}>
            Kontrolü bırak
          </button>
        </>
      )}
      {pending && !lease && (
        <>
          <span>{pending.controllerId} kontrol istiyor</span>
          <button
            disabled={busy}
            onClick={() => void action(() => api.decide(room, pending.id, false))}
          >
            Reddet
          </button>
          <button
            disabled={busy}
            onClick={() => void action(() => api.decide(room, pending.id, true))}
          >
            Kontrol ver…
          </button>
        </>
      )}
      {!track.local && source && !lease && (
        <button
          disabled={busy || ownRequest}
          onClick={() => void action(() => api.request(room, source.publisherId, source.epoch))}
        >
          {ownRequest ? 'Kontrol onayı bekleniyor' : 'Kontrol iste'}
        </button>
      )}
      {track.local && reason && <span>{reason}</span>}
      {error && <span role="alert">{error}</span>}
    </div>
  );
}
export function RemoteViewerInput({
  track,
  videoRoot,
}: {
  track?: MediaTrack;
  videoRoot: React.RefObject<HTMLDivElement | null>;
}) {
  const lease = useRemoteControl((s) => s.value?.lease),
    user = useCommunity((s) => s.user?.id);
  const root = useRef<HTMLDivElement>(null),
    sequence = useRef(Promise.resolve()),
    motion = useRef<RemoteInput | null>(null);
  const [ready, setReady] = useState(false);
  const enabled =
    !fixture() &&
    !!user &&
    !!lease &&
    !!track &&
    !track.local &&
    lease.controllerId === user &&
    lease.source.trackId === track.id;
  const send = (input: RemoteInput, reliable = true) => {
    const api = window.rooms?.remoteControl,
      provider = mediaProvider();
    if (!api || !provider.publishControl) return;
    const targetLease = lease?.leaseId;
    if (!targetLease) return;
    const run = async () => {
      const packet = await api.frame(input, targetLease);
      await provider.publishControl!(packet.payload, packet.destination, packet.reliable);
    };
    if (reliable)
      sequence.current = sequence.current.then(run).catch(() => {
        if (useRemoteControl.getState().value?.lease?.leaseId === targetLease)
          void api.revoke().catch(() => {});
      });
    else void run().catch(() => {});
  };
  useEffect(() => {
    if (!enabled) {
      setReady(false);
      return;
    }
    setReady(true);
    root.current?.focus();
    let frame = 0,
      stopped = false;
    const tick = () => {
      if (stopped) return;
      const next = motion.current;
      motion.current = null;
      if (next) send(next, false);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    const blur = () => {
      if (useRemoteControl.getState().value?.lease?.leaseId === lease?.leaseId)
        void window.rooms?.remoteControl?.revoke().catch(() => {});
    };
    window.addEventListener('blur', blur);
    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      motion.current = null;
      window.removeEventListener('blur', blur);
      blur();
    };
  }, [enabled, lease?.leaseId]);
  if (!enabled) return null;
  const point = (event: { clientX: number; clientY: number }) => {
    const video = videoRoot.current?.querySelector('video');
    if (!video?.videoWidth || !video.videoHeight) return null;
    const box = video.getBoundingClientRect(),
      scale = Math.min(box.width / video.videoWidth, box.height / video.videoHeight);
    const width = video.videoWidth * scale,
      height = video.videoHeight * scale;
    const x = (event.clientX - box.left - (box.width - width) / 2) / width,
      y = (event.clientY - box.top - (box.height - height) / 2) / height;
    return x >= 0 && x <= 1 && y >= 0 && y <= 1 ? { x, y } : null;
  };
  return (
    <div
      className="remote-viewer-input"
      ref={root}
      tabIndex={0}
      role="application"
      aria-label="Onaylanmış ekran kontrolü"
      data-ready={ready}
      onBlur={() => send({ type: 'release' })}
      onContextMenu={(e) => e.preventDefault()}
      onPointerMove={(e) => {
        const p = point(e);
        if (p) motion.current = { type: 'move', ...p };
      }}
      onPointerDown={(e) => {
        const p = point(e);
        if (!p || e.button > 2) return;
        e.preventDefault();
        root.current?.focus();
        root.current?.setPointerCapture(e.pointerId);
        send({
          type: 'button',
          button: e.button === 0 ? 'left' : e.button === 1 ? 'middle' : 'right',
          down: true,
          ...p,
        });
      }}
      onPointerUp={(e) => {
        const p = point(e);
        if (!p || e.button > 2) {
          send({ type: 'release' });
          return;
        }
        send({
          type: 'button',
          button: e.button === 0 ? 'left' : e.button === 1 ? 'middle' : 'right',
          down: false,
          ...p,
        });
      }}
      onPointerCancel={() => send({ type: 'release' })}
      onKeyDown={(e) => {
        e.preventDefault();
        const value = remoteInputSchema.safeParse({ type: 'key', code: e.code, down: true });
        if (value.success) send(value.data);
      }}
      onKeyUp={(e) => {
        e.preventDefault();
        const value = remoteInputSchema.safeParse({ type: 'key', code: e.code, down: false });
        if (value.success) send(value.data);
      }}
      onWheel={(e) => {
        e.preventDefault();
        send({
          type: 'scroll',
          dx: Math.max(-1200, Math.min(1200, e.deltaX)),
          dy: Math.max(-1200, Math.min(1200, e.deltaY)),
        });
      }}
    />
  );
}
