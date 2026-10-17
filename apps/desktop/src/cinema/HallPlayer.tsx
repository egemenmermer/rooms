import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type MutableRefObject,
} from 'react';
import Hls from 'hls.js';
import type { Timeline } from '../../../../packages/activity-protocol/src';
import type {
  CinemaErrorCode,
  CinemaWatchSource,
} from '../../../../packages/community-cinema/src/bridge';
import { expectedPosition } from '../cinema-youtube';
import { cinemaErrorCode, getCinemaBridge } from './cinema-bridge';
import type { HallItem } from './hall-model';

/** Everyone in the hall watches this far behind the server clock on live channels. */
export const LIVE_LATENCY_MS = 10_000;
const SYNC_EVERY_MS = 1000;

export type PlayerPhase = 'loading' | 'playing' | 'buffering' | 'paused' | 'error';

export interface PlayerSnapshot {
  phase: PlayerPhase;
  code: CinemaErrorCode | null;
  /** Live: the viewer paused or fell behind and is no longer with the hall. */
  behindLive: boolean;
  /** VOD: position in the work, in seconds. */
  positionSec: number;
  durationSec: number | null;
  live: boolean;
}

export interface PlayerControls {
  /** Live: catch up with the hall. */
  goLive(): void;
  /** Live only: pause or resume for this viewer. */
  toggleLocalPause(): void;
  retry(): void;
}

/** The seekable window of the video element, or null before it has one. */
function seekRange(element: HTMLVideoElement) {
  if (!element.seekable.length) return null;
  return {
    start: element.seekable.start(0),
    end: element.seekable.end(element.seekable.length - 1),
  };
}

/** Live drift in seconds (positive: this viewer is behind the hall's shared target). */
export function liveDrift(playingDateMs: number, nowMs: number, serverOffsetMs: number) {
  return (nowMs + serverOffsetMs - LIVE_LATENCY_MS - playingDateMs) / 1000;
}

/** The playback rate that closes a live drift gently, or null to jump. */
export function liveRate(drift: number): number | null {
  if (Math.abs(drift) > 3) return null;
  if (drift > 0.5) return 1.05;
  if (drift < -0.5) return 0.95;
  return 1;
}

/**
 * Plays the relayed hall stream. The room timeline is the authority for VOD; live channels
 * align on EXT-X-PROGRAM-DATE-TIME so every viewer sees the same moment.
 */
export function HallPlayer({
  hallId,
  item,
  timeline,
  serverOffsetMs,
  volume,
  muted,
  controls,
  onSnapshot,
  onEnded,
}: {
  hallId: string;
  item: HallItem;
  timeline: Timeline;
  serverOffsetMs: number;
  volume: number;
  muted: boolean;
  controls: MutableRefObject<PlayerControls | null>;
  onSnapshot(snapshot: PlayerSnapshot): void;
  onEnded(itemId: string): void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const curtain = useRef<HTMLCanvasElement>(null);
  const hls = useRef<Hls | null>(null);
  const [source, setSource] = useState<CinemaWatchSource | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [snapshot, setSnapshot] = useState<PlayerSnapshot>({
    phase: 'loading',
    code: null,
    behindLive: false,
    positionSec: 0,
    durationSec: null,
    live: item.media.live,
  });
  const latest = useRef({ timeline, serverOffsetMs, item, source });
  latest.current = { timeline, serverOffsetMs, item, source };
  const localPause = useRef(false);
  const rewatchAt = useRef(0);
  const rewatchDelay = useRef(4000);
  const seekAt = useRef(0);
  const endedFor = useRef<string | null>(null);
  const reconnects = useRef(0);

  const update = useCallback((patch: Partial<PlayerSnapshot>) => {
    setSnapshot((current) => {
      const next = { ...current, ...patch };
      return Object.keys(patch).every(
        (key) => current[key as keyof PlayerSnapshot] === next[key as keyof PlayerSnapshot],
      )
        ? current
        : next;
    });
  }, []);
  useEffect(() => onSnapshot(snapshot), [snapshot, onSnapshot]);

  // Before the next channel loads, freeze the last frame so the change is a soft crossfade.
  useLayoutEffect(() => {
    const element = video.current,
      canvas = curtain.current;
    if (!element || !canvas || element.readyState < 2 || !element.videoWidth) return;
    try {
      canvas.width = element.videoWidth;
      canvas.height = element.videoHeight;
      canvas.getContext('2d')?.drawImage(element, 0, 0);
      canvas.dataset.visible = 'true';
    } catch {
      delete canvas.dataset.visible;
    }
  }, [item.id]);

  const epoch = timeline.epoch;
  useEffect(() => {
    let active = true;
    const bridge = getCinemaBridge();
    setSource(null);
    localPause.current = false;
    update({
      phase: 'loading',
      code: null,
      behindLive: false,
      live: item.media.live,
      positionSec: 0,
      durationSec: null,
    });
    if (!bridge) {
      update({ phase: 'error', code: 'CINEMA_UNAVAILABLE' });
      return;
    }
    const request = async (retries: number): Promise<void> => {
      try {
        const value = await bridge.watch(hallId);
        if (!active) return;
        // The hall may have moved on, or the relay not caught up with the room yet.
        if (value.itemRef !== item.media.ref) {
          if (retries > 0) {
            await new Promise((resolve) => setTimeout(resolve, 700));
            if (active) return request(retries - 1);
          }
          return;
        }
        setSource(value);
        reconnects.current = 0;
        update({ durationSec: value.durationSec, live: value.live });
      } catch (error) {
        if (active)
          update({ phase: 'error', code: cinemaErrorCode(error) ?? 'CINEMA_STREAM_FAILED' });
      }
    };
    void request(2);
    return () => {
      active = false;
    };
  }, [hallId, item.id, item.media.ref, item.media.live, epoch, attempt, update]);

  const fixture = !!source?.src.startsWith('rooms-fixture:');
  useEffect(() => {
    const element = video.current;
    if (!source || !element || fixture) return;
    const start = () => void element.play().catch(() => update({ phase: 'paused' }));
    if (Hls.isSupported()) {
      const instance = new Hls({
        enableWorker: true,
        backBufferLength: 30,
        liveSyncDurationCount: 3,
        maxLiveSyncPlaybackRate: 1,
      });
      hls.current = instance;
      let recovered = false;
      instance.on(Hls.Events.MANIFEST_PARSED, start);
      instance.on(Hls.Events.ERROR, (_event, data) => {
        if (!data.fatal) return;
        if (data.type === Hls.ErrorTypes.MEDIA_ERROR && !recovered) {
          recovered = true;
          instance.recoverMediaError();
          return;
        }
        const status = (data.response as { code?: number } | undefined)?.code;
        // 410/404: the relay session ended (the hall moved on, or it restarted). Ask again.
        if ((status === 410 || status === 404) && reconnects.current < 5) {
          reconnects.current += 1;
          update({ phase: 'loading', code: 'CINEMA_SESSION_ENDED' });
          setTimeout(() => setAttempt((value) => value + 1), 600 * reconnects.current);
          return;
        }
        // These are failures of the ROOMS relay connection, not of the provider account.
        update({ phase: 'error', code: 'CINEMA_STREAM_FAILED' });
      });
      instance.loadSource(source.src);
      instance.attachMedia(element);
      return () => {
        instance.destroy();
        if (hls.current === instance) hls.current = null;
      };
    }
    element.src = source.src;
    start();
    return () => {
      element.removeAttribute('src');
      element.load();
    };
  }, [source, fixture, update]);

  useEffect(() => {
    const element = video.current;
    if (!element) return;
    element.volume = Math.min(1, Math.max(0, volume / 100));
    element.muted = muted;
  }, [volume, muted, source]);

  useEffect(() => {
    const element = video.current;
    if (!element || fixture) return;
    const playing = () => {
      update({ phase: 'playing', code: null });
      delete curtain.current?.dataset.visible;
    };
    const waiting = () => update({ phase: 'buffering' });
    const paused = () => update({ phase: 'paused' });
    const ended = () => {
      const { item: current, timeline: shared } = latest.current;
      // Once per time the item is opened: the epoch changes when it is selected again.
      const key = `${current.id}:${shared.epoch}`;
      if (!current.media.live && endedFor.current !== key) {
        endedFor.current = key;
        onEnded(current.id);
      }
    };
    element.addEventListener('playing', playing);
    element.addEventListener('waiting', waiting);
    element.addEventListener('pause', paused);
    element.addEventListener('ended', ended);
    return () => {
      element.removeEventListener('playing', playing);
      element.removeEventListener('waiting', waiting);
      element.removeEventListener('pause', paused);
      element.removeEventListener('ended', ended);
    };
  }, [fixture, update, onEnded]);

  // The fixture has no media: it reports a steady picture so the controls can be reviewed.
  useEffect(() => {
    if (!fixture) return;
    delete curtain.current?.dataset.visible;
    update({ phase: timeline.playing || item.media.live ? 'playing' : 'paused', code: null });
  }, [fixture, timeline.playing, item.media.live, update]);

  useEffect(() => {
    const timer = setInterval(() => {
      const element = video.current;
      const {
        timeline: shared,
        serverOffsetMs: offset,
        source: current,
        item: active,
      } = latest.current;
      if (!current) return;
      if (fixture) {
        if (!active.media.live)
          update({ positionSec: Math.floor(expectedPosition(shared, Date.now(), offset)) });
        return;
      }
      if (!element) return;
      if (current.live) {
        if (localPause.current) {
          update({ behindLive: true });
          return;
        }
        const date = hls.current?.playingDate?.getTime();
        if (date) {
          const drift = liveDrift(date, Date.now(), offset);
          const rate = liveRate(drift);
          const range = seekRange(element);
          // The shared target can fall outside what the relay holds (a fresh relay has only a
          // few seconds). Aim for the nearest playable point and never seek in a loop.
          const target = range
            ? Math.min(range.end - 1, Math.max(range.start + 0.5, element.currentTime + drift))
            : element.currentTime;
          const gap = target - element.currentTime;
          if (rate === null && Math.abs(gap) > 1 && Date.now() > seekAt.current) {
            seekAt.current = Date.now() + 3000;
            element.currentTime = target;
            element.playbackRate = 1;
          } else if (rate !== null && Math.abs(gap) > 0.25) element.playbackRate = rate;
          else element.playbackRate = 1;
          update({ behindLive: drift > 6 });
        } else {
          const edge = hls.current?.liveSyncPosition;
          if (edge && element.currentTime < edge - 4) element.currentTime = edge;
          update({ behindLive: false });
        }
        if (element.paused && element.readyState > 2) void element.play().catch(() => {});
        return;
      }
      const target = expectedPosition(shared, Date.now(), offset);
      // Where playback is in the work. PROGRAM-DATE-TIME pins the relay's output time 0, so
      // this holds wherever hls.js started its own timeline (late joiners, remounts).
      const date = hls.current?.playingDate?.getTime();
      const work =
        current.originPdtMs !== null && date
          ? current.offsetSec + (date - current.originPdtMs) / 1000
          : current.offsetSec + element.currentTime;
      update({ positionSec: Math.max(0, work) });
      const want = element.currentTime + (target - work);
      const range = seekRange(element);
      if (range && (want < range.start - 1 || want > range.end + 30)) {
        // Outside what this relay holds: ask the server for the room position, backing off so
        // a relay that is still filling is not restarted over and over.
        if (Date.now() > rewatchAt.current) {
          rewatchAt.current = Date.now() + rewatchDelay.current;
          rewatchDelay.current = Math.min(30_000, rewatchDelay.current * 2);
          setAttempt((value) => value + 1);
        }
        return;
      }
      rewatchDelay.current = 4000;
      if (range && Math.abs(target - work) > 0.75 && Date.now() > seekAt.current) {
        seekAt.current = Date.now() + 1500;
        element.currentTime = Math.min(range.end - 0.5, Math.max(range.start, want));
      }
      if (shared.playing && element.paused && element.readyState > 2)
        void element.play().catch(() => {});
      if (!shared.playing && !element.paused) element.pause();
    }, SYNC_EVERY_MS);
    return () => clearInterval(timer);
  }, [fixture, update]);

  useEffect(() => {
    controls.current = {
      goLive: () => {
        localPause.current = false;
        const element = video.current;
        const edge = hls.current?.liveSyncPosition;
        if (element && edge) element.currentTime = edge;
        void element?.play().catch(() => {});
        update({ behindLive: false });
      },
      toggleLocalPause: () => {
        const element = video.current;
        localPause.current = !localPause.current;
        if (localPause.current) element?.pause();
        else void element?.play().catch(() => {});
        update({
          behindLive: localPause.current,
          phase: localPause.current ? 'paused' : 'playing',
        });
      },
      retry: () => setAttempt((value) => value + 1),
    };
    return () => {
      controls.current = null;
    };
  }, [controls, update]);

  return (
    <div className="hall-player" data-phase={snapshot.phase}>
      {fixture ? (
        <FixtureScene title={item.media.title} live={item.media.live} hallId={hallId} />
      ) : (
        <video ref={video} playsInline disablePictureInPicture={false} />
      )}
      <canvas ref={curtain} className="hall-player-curtain" aria-hidden="true" />
    </div>
  );
}

/** DEV fixture picture: a generated dusk scene with a clear demo label. */
function FixtureScene({ title, live, hallId }: { title: string; live: boolean; hallId: string }) {
  const hue = [...title].reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) % 360, 7);
  return (
    <div
      className="hall-fixture-scene"
      data-hall={hallId}
      style={{ '--scene-hue': hue } as CSSProperties}
    >
      <span className="hall-fixture-sun" />
      <span className="hall-fixture-hill one" />
      <span className="hall-fixture-hill two" />
      <span className="hall-fixture-hill three" />
      <span className="hall-fixture-label">
        DEMO · {live ? 'Örnek canlı yayın' : 'Örnek film'} — {title}
      </span>
    </div>
  );
}
