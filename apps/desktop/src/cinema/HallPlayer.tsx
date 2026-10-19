import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MutableRefObject,
} from 'react';
import Hls from 'hls.js';
import type { Timeline } from '../../../../packages/activity-protocol/src';
import type {
  CinemaErrorCode,
  CinemaExternalSubtitleSource,
  CinemaWatchSource,
} from '../../../../packages/community-cinema/src/bridge';
import type { CinemaAudioTrack } from '../../../../packages/community-cinema/src/types';
import {
  cueText,
  parseVtt,
  type SubtitleCue,
} from '../../../../packages/community-cinema/src/webvtt';
import { expectedPosition } from '../cinema-youtube';
import { cinemaErrorCode, getCinemaBridge } from './cinema-bridge';
import type { HallItem } from './hall-model';

/** Live channels play this many relay segments behind the relay's live edge. */
const LIVE_SYNC_SEGMENTS = 3;
const SYNC_EVERY_MS = 1000;
const SUBTITLE_POLL_MS = 5000;
const SUBTITLE_TICK_MS = 250;
const SUBTITLE_PREFERENCE = 'rooms.cinema.subtitles';

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
  /** The relayed source's audio streams and the one the hall hears. */
  audioTracks: CinemaAudioTrack[];
  audioTrack: number | null;
  /** VOD subtitles this viewer can pick and their choice (null: off). Never shared. */
  subtitleTracks: SubtitleOption[];
  subtitle: string | null;
  /** Seconds this viewer moves the subtitles by (positive: later). */
  subtitleOffset: number;
  /** Subtitles found online: still looking, found, no SubDL key, or the search failed. */
  onlineSubtitles: 'idle' | 'loading' | 'ready' | 'unavailable' | 'error';
}

/** A subtitle a viewer can pick: from the film itself, found online, or their own file. */
export type SubtitleOption = {
  key: string;
  label: string;
  language: string | null;
  forced: boolean;
  origin: 'embedded' | 'online' | 'file';
};

type SubtitleSource = SubtitleOption & { src: string; growing: boolean };

export interface PlayerControls {
  /** Live: catch up with the hall. */
  goLive(): void;
  /** Live only: pause or resume for this viewer. */
  toggleLocalPause(): void;
  retry(): void;
  /** This viewer's subtitles; null turns them off. */
  setSubtitle(key: string | null): void;
  /** This viewer's subtitle timing, in seconds (positive: later). */
  setSubtitleOffset(seconds: number): void;
  /** Opens a subtitle file from disk for this viewer and shows it. */
  chooseSubtitleFile(): Promise<void>;
}

/** The seekable window of the video element, or null before it has one. */
function seekRange(element: HTMLVideoElement) {
  if (!element.seekable.length) return null;
  return {
    start: element.seekable.start(0),
    end: element.seekable.end(element.seekable.length - 1),
  };
}

const turkish = (track: { language: string | null; label: string }) =>
  track.language === 'tur' || track.language === 'tr' || track.label.startsWith('Türkçe');

function subtitlesOff() {
  try {
    return localStorage.getItem(SUBTITLE_PREFERENCE) === 'off';
  } catch {
    return false;
  }
}

function rememberSubtitles(on: boolean) {
  try {
    localStorage.setItem(SUBTITLE_PREFERENCE, on ? 'auto' : 'off');
  } catch {
    // Private storage: the choice still holds for this film.
  }
}

/**
 * The subtitles a viewer starts with: Turkish when the hall hears another language (the
 * film's own first, then one found online), only Turkish forced subtitles over Turkish
 * audio, nothing once the viewer turned them off.
 */
export function autoSubtitle(
  tracks: Pick<SubtitleOption, 'key' | 'label' | 'language' | 'forced' | 'origin'>[],
  audioLabel: string | null,
  off = subtitlesOff(),
): string | null {
  if (off) return null;
  const candidates = tracks.filter((t) => t.origin !== 'file' && turkish(t));
  if (audioLabel?.startsWith('Türkçe')) return candidates.find((t) => t.forced)?.key ?? null;
  const embedded = candidates.filter((t) => t.origin === 'embedded');
  const pool = embedded.length ? embedded : candidates;
  return (pool.find((t) => !t.forced) ?? pool[0])?.key ?? null;
}

const embeddedKey = (index: number) => `e${index}`;

/** What the hall's relay and SubDL offer, plus this viewer's own file, as one list. */
function subtitleSources(
  source: CinemaWatchSource | null,
  online: CinemaExternalSubtitleSource[],
  file: { name: string; src: string } | null,
): SubtitleSource[] {
  return [
    ...(source?.subtitles ?? []).map((t) => ({
      key: embeddedKey(t.index),
      label: t.label,
      language: t.language,
      forced: t.forced,
      origin: 'embedded' as const,
      src: t.src,
      growing: true,
    })),
    ...online.map((t) => ({
      key: `o${t.id}`,
      label: t.label,
      language: t.language,
      forced: false,
      origin: 'online' as const,
      src: t.src,
      growing: false,
    })),
    ...(file
      ? [
          {
            key: 'file',
            label: `Dosya · ${file.name}`,
            language: null,
            forced: false,
            origin: 'file' as const,
            src: file.src,
            growing: false,
          },
        ]
      : []),
  ];
}

/** The cues of a subtitle source; DEV fixtures and local files carry theirs as a data URL. */
async function readSubtitles(source: SubtitleSource) {
  if (source.src.startsWith('data:'))
    return decodeURIComponent(source.src.slice(source.src.indexOf(',') + 1));
  const response = await fetch(source.src, { cache: 'no-store' });
  return response.ok ? response.text() : null;
}

/** VOD: where playback is in the work, wherever hls.js started its own timeline. */
function workPosition(element: HTMLVideoElement, source: CinemaWatchSource, hls: Hls | null) {
  // PROGRAM-DATE-TIME pins the relay's output time 0 (late joiners, remounts).
  const date = hls?.playingDate?.getTime();
  return source.originPdtMs !== null && date
    ? source.offsetSec + (date - source.originPdtMs) / 1000
    : source.offsetSec + element.currentTime;
}

/**
 * Live drift in seconds (positive: this viewer is behind the hall). The hall's moment is
 * hls.js `liveSyncPosition`: the relay's live edge minus the sync latency. Every viewer reads
 * the same relay playlist, so it lands everyone within about a segment, and it always lies
 * inside the relay's window. The wall clock is not used: the relay stamps PROGRAM-DATE-TIME
 * from the media it received, which runs ahead of the clock after a provider's connect burst.
 */
export function liveDrift(currentTime: number, syncPosition: number) {
  return syncPosition - currentTime;
}

/** The playback rate that closes a live drift gently, or null to jump. */
export function liveRate(drift: number): number | null {
  if (Math.abs(drift) > 3) return null;
  if (drift > 0.5) return 1.05;
  if (drift < -0.5) return 0.95;
  return 1;
}

/**
 * One live tick: where to jump (when `canSeek`), the rate to play at, and whether the viewer
 * fell behind. Live never jumps back: after an upstream stall the sync position drops a few
 * seconds behind a viewer waiting at the edge, and jumping back there would replay those
 * seconds on every stall. Playing slightly slower brings that viewer back to the hall instead.
 */
export function liveStep(currentTime: number, syncPosition: number, canSeek: boolean) {
  const drift = liveDrift(currentTime, syncPosition);
  if (drift < -0.5) return { seekTo: null, rate: 0.95, behindLive: false };
  const rate = liveRate(drift);
  return {
    seekTo: rate === null && canSeek ? syncPosition : null,
    rate: rate ?? 1,
    behindLive: drift > 6,
  };
}

/**
 * Plays the relayed hall stream. The room timeline is the authority for VOD; live channels
 * align on the relay's live edge so every viewer sees the same moment.
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
    audioTracks: [],
    audioTrack: null,
    subtitleTracks: [],
    subtitle: null,
    subtitleOffset: 0,
    onlineSubtitles: 'idle',
  });
  const [cues, setCues] = useState<SubtitleCue[]>([]);
  const [caption, setCaption] = useState('');
  const [online, setOnline] = useState<CinemaExternalSubtitleSource[]>([]);
  const [file, setFile] = useState<{ name: string; src: string } | null>(null);
  /** The viewer's own pick for an item; it survives relay restarts (seeks, audio). */
  const subtitleChoice = useRef<{ ref: string; key: string | null } | null>(null);
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
        update({
          durationSec: value.durationSec,
          live: value.live,
          audioTracks: value.audioTracks,
          audioTrack: value.audioTrack,
        });
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
        liveSyncDurationCount: LIVE_SYNC_SEGMENTS,
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
        const sync = hls.current?.liveSyncPosition;
        if (sync != null) {
          const step = liveStep(element.currentTime, sync, Date.now() > seekAt.current);
          if (step.seekTo !== null) {
            seekAt.current = Date.now() + 3000;
            element.currentTime = step.seekTo;
          }
          element.playbackRate = step.rate;
          update({ behindLive: step.behindLive });
        } else update({ behindLive: false });
        if (element.paused && element.readyState > 2) void element.play().catch(() => {});
        return;
      }
      const target = expectedPosition(shared, Date.now(), offset);
      const work = workPosition(element, current, hls.current);
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

  // A new item starts with nothing found online, no file and no timing shift.
  useEffect(() => {
    let active = true;
    setOnline([]);
    setFile(null);
    update({ subtitle: null, subtitleTracks: [], subtitleOffset: 0, onlineSubtitles: 'idle' });
    const bridge = getCinemaBridge();
    if (item.media.live || !bridge?.subtitles) return;
    update({ onlineSubtitles: 'loading' });
    bridge
      .subtitles(hallId, item.media.ref)
      .then((result) => {
        if (!active) return;
        setOnline(result.subtitles);
        update({ onlineSubtitles: result.available ? 'ready' : 'unavailable' });
      })
      .catch(() => active && update({ onlineSubtitles: 'error' }));
    return () => {
      active = false;
    };
  }, [hallId, item.id, item.media.ref, item.media.live, update]);

  const sources = useMemo(() => subtitleSources(source, online, file), [source, online, file]);
  // Keep the viewer's pick while it exists; otherwise the automatic choice, which may
  // change as online results arrive.
  useEffect(() => {
    const chosen = subtitleChoice.current;
    const audio = source?.audioTracks.find((t) => t.index === source.audioTrack)?.label ?? null;
    update({
      subtitleTracks: sources.map(({ src: _src, growing: _growing, ...option }) => option),
      subtitle:
        chosen?.ref === item.media.ref &&
        (chosen.key === null || sources.some((t) => t.key === chosen.key))
          ? chosen.key
          : autoSubtitle(sources, audio),
    });
  }, [sources, source, item.media.ref, update]);

  // The relay keeps appending cues as it reads ahead; re-read its file while it grows.
  const subtitleSource = sources.find((t) => t.key === snapshot.subtitle) ?? null;
  useEffect(() => {
    setCues([]);
    if (!subtitleSource) return;
    let active = true;
    let size = -1;
    const load = async () => {
      try {
        const text = await readSubtitles(subtitleSource);
        // An online subtitle that cannot be fetched (key removed, daily limit): say so.
        if (active && text === null && subtitleSource.origin === 'online')
          update({ onlineSubtitles: 'error' });
        if (!active || text === null || text.length === size) return;
        size = text.length;
        setCues(parseVtt(text));
      } catch {
        // The relay restarted or the hall moved on; the player reconnects on its own.
      }
    };
    void load();
    const timer = subtitleSource.growing
      ? setInterval(() => void load(), SUBTITLE_POLL_MS)
      : undefined;
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [subtitleSource, update]);

  const subtitleOffset = snapshot.subtitleOffset;
  useEffect(() => {
    setCaption('');
    if (!cues.length) return;
    const tick = () => {
      const { timeline: shared, serverOffsetMs: offset, source: current } = latest.current;
      const element = video.current;
      if (!current) return;
      let position = fixture
        ? expectedPosition(shared, Date.now(), offset)
        : element
          ? workPosition(element, current, hls.current)
          : null;
      if (position === null) return;
      // A positive offset shows every cue later.
      position -= subtitleOffset;
      setCaption(
        cues
          .filter((cue) => cue.start <= position && position < cue.end)
          .map((cue) => cueText(cue.text))
          .filter(Boolean)
          .join('\n'),
      );
    };
    tick();
    const timer = setInterval(tick, SUBTITLE_TICK_MS);
    return () => clearInterval(timer);
  }, [cues, fixture, subtitleOffset]);

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
      setSubtitle: (key) => {
        subtitleChoice.current = { ref: latest.current.item.media.ref, key };
        rememberSubtitles(key !== null);
        update({ subtitle: key });
      },
      setSubtitleOffset: (seconds) =>
        update({ subtitleOffset: Math.round(Math.max(-600, Math.min(600, seconds)) * 10) / 10 }),
      chooseSubtitleFile: async () => {
        const picked = await getCinemaBridge()?.chooseSubtitleFile();
        if (!picked) return;
        setFile({
          name: picked.name,
          src: `data:text/vtt;charset=utf-8,${encodeURIComponent(picked.content)}`,
        });
        subtitleChoice.current = { ref: latest.current.item.media.ref, key: 'file' };
        rememberSubtitles(true);
        update({ subtitle: 'file' });
      },
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
      {caption && (
        <div className="hall-subtitle">
          <span>{caption}</span>
        </div>
      )}
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
