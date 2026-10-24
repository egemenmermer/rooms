import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ExternalLink,
  LoaderCircle,
  Maximize,
  Minimize,
  MousePointerClick,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  SkipForward,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type { ActivityCommand, QueueItem, Timeline } from '../../../packages/activity-protocol/src';
import { activityBridge } from './runtime-sources';
import { t, uiError } from './i18n';
import {
  clock,
  expectedPosition,
  storeVolume,
  storedVolume,
  youtubeErrorText,
  youtubeThumbnail,
} from './cinema-youtube';

type Chrome = 'minimal' | 'native';
const PLAYING = 1,
  BUFFERING = 3,
  ENDED = 0;

/**
 * One official YouTube player for the selected queue item. The room timeline is the authority:
 * the player follows it locally, and only explicit control actions change it for everyone.
 */
export function CinemaYouTubeStage({
  item,
  timeline,
  serverOffsetMs,
  next,
  canDirect,
  directReason,
  connected,
  addedBy,
  fullscreen,
  send,
  quiet,
  onToggleFullscreen,
  onEnded,
  onOpenSource,
  onUnembeddable,
  keyboard = true,
}: {
  item: QueueItem & { media: { kind: 'youtube' } };
  timeline: Timeline;
  serverOffsetMs: number;
  next: QueueItem | null;
  canDirect: boolean;
  directReason: string;
  connected: boolean;
  addedBy: string;
  fullscreen: boolean;
  send(command: ActivityCommand): void;
  quiet(command: ActivityCommand): void;
  onToggleFullscreen(): void;
  onEnded(itemId: string): void;
  onOpenSource(): void;
  /** The owner keeps this video off other sites; the cinema switches to a browser share. */
  onUnembeddable?(videoId: string): void;
  /** False while another page is in front (a corner player): Space and arrows stay theirs. */
  keyboard?: boolean;
}) {
  const videoId = item.media.videoId;
  const frame = useRef<HTMLIFrameElement>(null);
  const [chrome, setChrome] = useState<Chrome>('minimal'),
    [attempt, setAttempt] = useState(0),
    [player, setPlayer] = useState<{ url: string; nonce: string } | null>(null),
    [ready, setReady] = useState(false),
    [error, setError] = useState(''),
    [state, setState] = useState(-1),
    [duration, setDuration] = useState(0),
    [seekDraft, setSeekDraft] = useState<number | null>(null),
    [audio, setAudio] = useState(storedVolume),
    [visible, setVisible] = useState(true),
    [touch, setTouch] = useState(false),
    [, setTick] = useState(0);
  const live = useRef({ timeline, serverOffsetMs, canDirect });
  live.current = { timeline, serverOffsetMs, canDirect };
  // Read synchronously by the message handler, before the duration state re-renders.
  const length = useRef(0);
  const lastSync = useRef(0),
    endedFor = useRef<string | null>(null),
    idle = useRef<ReturnType<typeof setTimeout> | null>(null),
    clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null),
    stage = useRef<HTMLDivElement>(null);

  const post = useCallback(
    (action: string, extra: Record<string, number> = {}) => {
      if (!player) return;
      frame.current?.contentWindow?.postMessage(
        { type: 'rooms-youtube-command', nonce: player.nonce, action, ...extra },
        new URL(player.url).origin,
      );
    },
    [player],
  );
  const synchronize = useCallback(() => {
    if (!ready) return;
    const { timeline: current, serverOffsetMs: offset } = live.current;
    lastSync.current = Date.now();
    post('seek', { positionSec: expectedPosition(current, Date.now(), offset) });
    post(current.playing ? 'play' : 'pause');
  }, [ready, post]);

  useEffect(() => {
    let stale = false;
    setPlayer(null);
    setReady(false);
    setError('');
    setState(-1);
    const bridge = activityBridge();
    void Promise.resolve()
      .then(() => bridge.youtubePlayer(videoId, chrome))
      .then((value) => {
        if (!stale) setPlayer(value);
      })
      .catch((failure) => {
        if (!stale) setError(uiError(failure));
      });
    return () => {
      stale = true;
    };
  }, [videoId, chrome, attempt]);

  useEffect(() => {
    if (ready || error) return;
    const timer = setTimeout(() => {
      setError(t('YouTube oynatıcısı 25 saniyede açılmadı. Bağlantını kontrol edip yeniden dene.'));
      // An older server may not know the minimal player; the retry uses YouTube's own controls.
      setChrome('native');
    }, 25000);
    return () => clearTimeout(timer);
  }, [ready, error, attempt, chrome]);

  // Report the end once per item; only the first report moves the room (the server checks the item).
  const ended = useCallback(() => {
    if (endedFor.current === item.id) return;
    const { timeline: current, serverOffsetMs: offset } = live.current;
    const expected = expectedPosition(current, Date.now(), offset);
    if (length.current && expected < length.current - 15) {
      // This player ran ahead of the room; follow the room instead of skipping for everyone.
      synchronize();
      return;
    }
    endedFor.current = item.id;
    onEnded(item.id);
    if (current.playing) quiet({ type: 'queue.next', fromItemId: item.id, reason: 'ended' });
  }, [item.id, onEnded, quiet, synchronize]);

  useEffect(() => {
    if (!player) return;
    const origin = new URL(player.url).origin;
    const listener = (event: MessageEvent) => {
      if (
        event.source !== frame.current?.contentWindow ||
        event.origin !== origin ||
        event.data?.type !== 'rooms-youtube' ||
        event.data.nonce !== player.nonce
      )
        return;
      const { event: kind, data } = event.data as {
        event: string;
        data?: Record<string, unknown>;
      };
      if (kind === 'ready') {
        setReady(true);
        setError('');
      } else if (kind === 'error') {
        const code = Number(data?.code);
        if (code === 101 || code === 150) onUnembeddable?.(videoId);
        setReady(false);
        setError(youtubeErrorText(code));
      } else if (kind === 'autoplay-blocked') {
        setChrome('native');
      } else if (kind === 'position' || kind === 'state') {
        const value = Number(data?.state);
        if (Number.isInteger(value)) setState(value);
        const reported = Number(data?.durationSec);
        if (Number.isFinite(reported) && reported > 0 && reported <= 86400) {
          length.current = reported;
          setDuration(reported);
        }
        if (value === ENDED) ended();
        else if (kind === 'position') {
          const position = Number(data?.positionSec);
          const { timeline: current, serverOffsetMs: offset } = live.current;
          const since = Date.now() - lastSync.current;
          if (!Number.isFinite(position) || since < 2500) return;
          const expected = expectedPosition(current, Date.now(), offset);
          if (current.playing && value !== BUFFERING && value !== PLAYING) synchronize();
          else if (!current.playing && value === PLAYING) synchronize();
          else if (value !== BUFFERING && Math.abs(position - expected) > 2.5 && since > 4000)
            synchronize();
        }
      }
    };
    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
  }, [player, ended, synchronize, onUnembeddable, videoId]);

  useEffect(() => {
    synchronize();
  }, [timeline.epoch, timeline.effectiveServerTimeMs, timeline.playing, synchronize]);
  useEffect(() => {
    if (!ready) return;
    post('volume', { volume: audio.muted ? 0 : audio.volume });
    const timer = setInterval(() => post('position'), 1000);
    return () => clearInterval(timer);
  }, [ready, post, audio]);
  useEffect(() => {
    if (!timeline.playing) return;
    const timer = setInterval(() => setTick((value) => value + 1), 250);
    return () => clearInterval(timer);
  }, [timeline.playing]);

  const position = Math.min(
    duration || Infinity,
    expectedPosition(timeline, Date.now(), serverOffsetMs),
  );
  const finished = state === ENDED && !timeline.playing;
  const togglePlay = useCallback(() => {
    if (!live.current.canDirect) return;
    const { timeline: current, serverOffsetMs: offset } = live.current;
    const at = expectedPosition(current, Date.now(), offset);
    const end = length.current;
    const restart = !current.playing && end > 0 && at >= end - 1;
    send({
      type: 'playback',
      playing: !current.playing,
      positionSec: restart ? 0 : Math.max(0, Math.min(end || at, at)),
      rate: 1,
    });
  }, [send]);
  const seek = useCallback(
    (seconds: number) => {
      setSeekDraft(null);
      if (!live.current.canDirect) return;
      send({
        type: 'playback',
        playing: live.current.timeline.playing,
        positionSec: Math.max(0, Math.min(length.current || seconds, seconds)),
        rate: 1,
      });
    },
    [send],
  );
  const skip = useCallback(() => {
    if (live.current.canDirect && next)
      send({ type: 'queue.next', fromItemId: item.id, reason: 'skip' });
  }, [send, next, item.id]);
  const changeAudio = (value: { volume: number; muted: boolean }) => {
    setAudio(value);
    storeVolume(value);
  };

  const reveal = useCallback(() => {
    setVisible(true);
    if (idle.current) clearTimeout(idle.current);
    idle.current = setTimeout(() => {
      if (!stage.current?.querySelector('.cozy-controls')?.contains(document.activeElement))
        setVisible(false);
    }, 2800);
  }, []);
  useEffect(
    () => () => {
      if (idle.current) clearTimeout(idle.current);
      if (clickTimer.current) clearTimeout(clickTimer.current);
    },
    [],
  );

  const keys = useRef<(event: KeyboardEvent) => void>(() => {});
  useEffect(() => {
    const listener = (event: KeyboardEvent) => keys.current(event);
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);
  // Latest handler each render; the window listener itself is installed once.
  keys.current = (event: KeyboardEvent) => {
    const target = event.target as HTMLElement | null;
    if (
      !keyboard ||
      event.metaKey ||
      event.ctrlKey ||
      event.altKey ||
      target?.closest('input,textarea,select,[contenteditable="true"],[role="dialog"]')
    )
      return;
    const at = expectedPosition(timeline, Date.now(), serverOffsetMs);
    const actions: Record<string, () => void> = {
      ' ': togglePlay,
      k: togglePlay,
      m: () => changeAudio({ ...audio, muted: !audio.muted }),
      ArrowLeft: () => seek(at - 10),
      ArrowRight: () => seek(at + 10),
      n: skip,
    };
    const action = actions[event.key.length === 1 ? event.key.toLowerCase() : event.key];
    if (!action || (target?.closest('button') && event.key === ' ')) return;
    event.preventDefault();
    reveal();
    action();
  };

  // Lets the viewer reach YouTube's own buttons (skip ad, consent) under the click shield.
  useEffect(() => {
    if (!touch) return;
    const timer = setTimeout(() => setTouch(false), 20000);
    return () => clearTimeout(timer);
  }, [touch]);
  const native = chrome === 'native';
  const controlTitle = canDirect ? undefined : directReason;
  return (
    <div
      ref={stage}
      className={`cozy-yt ${visible || touch || !timeline.playing ? 'controls-visible' : ''} ${native ? 'native-chrome' : ''} ${ready ? 'ready' : ''} ${touch ? 'touching' : ''}`}
      onMouseMove={reveal}
      onFocusCapture={reveal}
      onMouseLeave={() => timeline.playing && setVisible(false)}
    >
      <img
        className={`cozy-yt-poster ${ready && state !== -1 && state !== 5 ? 'hidden' : ''}`}
        src={youtubeThumbnail(videoId, 'hq')}
        alt=""
        draggable={false}
      />
      {player && !error && (
        <iframe
          ref={frame}
          key={player.nonce}
          src={player.url}
          title={`YouTube: ${item.media.title}`}
          allow="autoplay; encrypted-media; picture-in-picture"
          referrerPolicy="strict-origin-when-cross-origin"
        />
      )}
      {!native && !touch && (
        <div
          className="cozy-yt-shield"
          aria-hidden="true"
          onClick={() => {
            if (clickTimer.current) clearTimeout(clickTimer.current);
            clickTimer.current = setTimeout(togglePlay, 230);
          }}
          onDoubleClick={() => {
            if (clickTimer.current) clearTimeout(clickTimer.current);
            onToggleFullscreen();
          }}
        />
      )}
      <div className="cozy-yt-top">
        <div>
          <strong>{item.media.title}</strong>
          <small>{t('{name} açtı', { name: addedBy })}</small>
        </div>
        <a
          className="cozy-chip"
          href={`https://www.youtube.com/watch?v=${videoId}`}
          target="_blank"
          rel="noreferrer"
        >
          <ExternalLink size={13} />
          {t('YouTube’da aç')}
        </a>
      </div>
      {error ? (
        <div className="cozy-yt-center cozy-card" role="alert">
          <strong>{t('Bu video burada oynatılamıyor')}</strong>
          <p>{error}</p>
          <div className="button-row">
            {next && (
              <button
                className="button primary small"
                disabled={!canDirect}
                title={controlTitle}
                onClick={skip}
              >
                <SkipForward size={15} />
                {t('Sıradakine geç')}
              </button>
            )}
            <button className="button secondary small" onClick={() => setAttempt((v) => v + 1)}>
              <RotateCcw size={15} />
              {t('Yeniden dene')}
            </button>
          </div>
        </div>
      ) : !ready ? (
        <div className="cozy-yt-center" role="status">
          <LoaderCircle size={34} className="spin" />
          <span>{t('Oynatıcı hazırlanıyor…')}</span>
        </div>
      ) : finished ? (
        <div className="cozy-yt-center cozy-card" role="status">
          <strong>
            {next ? t('Sıradaki: {title}', { title: next.media.title }) : t('Liste bitti')}
          </strong>
          <p>{next ? t('Video bitti.') : t('Sırada başka video yok.')}</p>
          <div className="button-row">
            {next ? (
              <button
                className="button primary small"
                disabled={!canDirect}
                title={controlTitle}
                onClick={skip}
              >
                <SkipForward size={15} />
                {t('Sıradakine geç')}
              </button>
            ) : (
              <button className="button primary small" onClick={onOpenSource}>
                {t('Bir şey aç')}
              </button>
            )}
            <button
              className="button secondary small"
              disabled={!canDirect}
              title={controlTitle}
              onClick={() => send({ type: 'playback', playing: true, positionSec: 0, rate: 1 })}
            >
              <RotateCcw size={15} />
              {t('Baştan oynat')}
            </button>
          </div>
        </div>
      ) : !timeline.playing && !native ? (
        <button
          className="cozy-yt-bigplay"
          disabled={!canDirect}
          title={controlTitle}
          aria-label={t('Herkes için oynat')}
          onClick={togglePlay}
        >
          <Play size={34} fill="currentColor" />
          {!canDirect && <span>{t('Duraklatıldı')}</span>}
        </button>
      ) : state === BUFFERING ? (
        <div className="cozy-yt-center" role="status" aria-label={t('Yükleniyor')}>
          <LoaderCircle size={30} className="spin" />
        </div>
      ) : null}
      {native && ready && (
        <div className="cozy-yt-native-note" role="status">
          {t(
            'YouTube otomatik oynatmayı engelledi. Oynatıcıdaki ▶ düğmesine bas; odaya eşitlenir.',
          )}
        </div>
      )}
      <div className="cozy-controls" onDoubleClick={(event) => event.stopPropagation()}>
        <input
          className="cozy-seek"
          type="range"
          aria-label={t('Ortak oynatma konumu')}
          aria-valuetext={`${clock(seekDraft ?? position)} / ${clock(duration)}`}
          min={0}
          max={duration || 1}
          step={1}
          value={Math.min(duration || 1, seekDraft ?? position)}
          style={{
            ['--progress' as string]: `${duration ? (Math.min(duration, seekDraft ?? position) / duration) * 100 : 0}%`,
          }}
          disabled={!ready || !canDirect || !duration || !connected}
          title={controlTitle}
          onChange={(event) => setSeekDraft(Number(event.currentTarget.value))}
          onPointerUp={(event) => seek(Number(event.currentTarget.value))}
          onKeyUp={(event) => {
            if (seekDraft !== null) seek(Number(event.currentTarget.value));
          }}
          onBlur={() => setSeekDraft(null)}
        />
        <div className="cozy-control-row">
          <button
            className="cozy-control primary"
            aria-label={timeline.playing ? t('Herkes için duraklat') : t('Herkes için oynat')}
            title={
              controlTitle ?? (timeline.playing ? t('Duraklat (boşluk)') : t('Oynat (boşluk)'))
            }
            disabled={!ready || !canDirect || !connected}
            onClick={togglePlay}
          >
            {timeline.playing ? (
              <Pause size={20} fill="currentColor" />
            ) : (
              <Play size={20} fill="currentColor" />
            )}
          </button>
          <button
            className="cozy-control"
            aria-label={t('Sıradaki video')}
            title={
              controlTitle ??
              (next
                ? t('Sıradaki: {title} (N)', { title: next.media.title })
                : t('Sırada video yok'))
            }
            disabled={!canDirect || !next || !connected}
            onClick={skip}
          >
            <SkipForward size={19} />
          </button>
          <span className="cozy-time">
            {clock(seekDraft ?? position)} <span>/ {clock(duration)}</span>
          </span>
          <span className="cozy-grow" />
          <div className="cozy-volume">
            <button
              className="cozy-control"
              aria-label={audio.muted || !audio.volume ? t('Sesi aç') : t('Sesi kapat')}
              title={t('Yalnızca senin için (M)')}
              onClick={() => changeAudio({ ...audio, muted: !audio.muted })}
            >
              {audio.muted || !audio.volume ? <VolumeX size={19} /> : <Volume2 size={19} />}
            </button>
            <input
              type="range"
              aria-label={t('Video ses düzeyi (yalnızca senin için)')}
              min={0}
              max={100}
              step={1}
              value={audio.muted ? 0 : audio.volume}
              style={{ ['--progress' as string]: `${audio.muted ? 0 : audio.volume}%` }}
              onChange={(event) =>
                changeAudio({ volume: Number(event.currentTarget.value), muted: false })
              }
            />
          </div>
          {!native && (
            <button
              className="cozy-control"
              aria-label={t('Oynatıcıya doğrudan tıkla')}
              aria-pressed={touch}
              title={t(
                'Reklamı geçmek veya YouTube uyarısına tıklamak için 20 saniye oynatıcıya doğrudan eriş',
              )}
              disabled={!ready}
              onClick={() => setTouch(!touch)}
            >
              <MousePointerClick size={17} />
            </button>
          )}
          <button
            className="cozy-control"
            aria-label={t('Odaya yeniden eşitle')}
            title={t('Görüntün geride kaldıysa odaya yeniden eşitle')}
            disabled={!ready}
            onClick={synchronize}
          >
            <RefreshCw size={17} />
          </button>
          <button
            className="cozy-control"
            aria-label={fullscreen ? t('Tam ekrandan çık') : t('Tam ekran')}
            title={fullscreen ? t('Tam ekrandan çık (F)') : t('Tam ekran (F)')}
            onClick={onToggleFullscreen}
          >
            {fullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
          </button>
        </div>
      </div>
    </div>
  );
}
