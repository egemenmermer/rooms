import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type MutableRefObject,
  type ReactNode,
} from 'react';
import {
  Captions,
  Check,
  ChevronDown,
  ChevronUp,
  Eye,
  FileUp,
  Languages,
  Maximize,
  Maximize2,
  Minimize,
  Minus,
  PanelRightClose,
  PanelRightOpen,
  Pause,
  Play,
  Plus,
  RotateCcw,
  SkipForward,
  Volume1,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type { QueueItem } from '../../../../packages/activity-protocol/src';
import '../cozy-cinema.css';
import { CinemaYouTubeStage } from '../CinemaYouTubeStage';
import { clock, expectedPosition } from '../cinema-youtube';
import { cinemaErrorCopy, cinemaErrorText, getCinemaBridge } from './cinema-bridge';
import { knownItem } from './catalog-cache';
import { QualityBadges } from './CinemaArt';
import {
  HallPlayer,
  type PlayerControls,
  type PlayerSnapshot,
  type SubtitleOption,
} from './HallPlayer';
import { isHallItem, viewerLabel } from './hall-model';
import { useHall } from './use-hall';

type YouTubeItem = QueueItem & { media: { kind: 'youtube'; videoId: string; title: string } };

export interface StageOsd {
  key: number;
  number: number | null;
  title: string;
  detail: string | null;
  /** A message instead of a channel, e.g. "Kumanda ev sahibinde". */
  note?: string;
}

const IDLE_MS = 2500;
const SWITCH_NOTICE_MS = 400;

export function HallStage({
  mode,
  fullscreen,
  panelOpen,
  osd,
  audio,
  onAudio,
  welcome,
  controls,
  onToggleFullscreen,
  onTogglePanel,
  onExpand,
  onZap,
}: {
  mode: 'stage' | 'mini';
  fullscreen: boolean;
  panelOpen: boolean;
  osd: StageOsd | null;
  /** This viewer's volume; never shared with the hall. */
  audio: { volume: number; muted: boolean };
  onAudio(value: { volume: number; muted: boolean }): void;
  /** Shown on the screen when nothing is playing. */
  welcome: ReactNode;
  controls: MutableRefObject<PlayerControls | null>;
  onToggleFullscreen(): void;
  onTogglePanel(): void;
  onExpand(): void;
  onZap(step: 1 | -1): void;
}) {
  const hall = useHall();
  const { current, room, activity, canDirect, directReason } = hall;
  const timeline = room?.timeline;
  const [player, setPlayer] = useState<PlayerSnapshot | null>(null);
  const [idle, setIdle] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [seekDraft, setSeekDraft] = useState<number | null>(null);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hallItem = isHallItem(current) ? current : null;
  const youtube = current?.media.kind === 'youtube' ? (current as YouTubeItem) : null;
  const info = knownItem(hallItem?.media.ref);
  const live = !!hallItem?.media.live;
  const viewers = room?.participants.length ?? 0;

  const setVolume = onAudio;
  const wake = useCallback(() => {
    setIdle(false);
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => setIdle(true), IDLE_MS);
  }, []);
  useEffect(() => {
    wake();
    return () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
  }, [wake, current?.id]);

  // "Kanal değişiyor…" only when a switch takes long enough to be noticed.
  const loading = !player || player.phase === 'loading';
  useEffect(() => {
    if (!hallItem || !loading) {
      setSwitching(false);
      return;
    }
    const timer = setTimeout(() => setSwitching(true), SWITCH_NOTICE_MS);
    return () => clearTimeout(timer);
  }, [hallItem?.id, loading]);
  useEffect(() => setPlayer(null), [hallItem?.id]);

  const onEnded = useCallback(
    (itemId: string) => hall.quiet({ type: 'queue.next', fromItemId: itemId, reason: 'ended' }),
    [hall.quiet],
  );
  const durationSec = player?.durationSec ?? null;
  const positionSec =
    hallItem && !live && timeline
      ? (seekDraft ??
        Math.max(
          0,
          player?.positionSec || expectedPosition(timeline, Date.now(), activity.serverOffsetMs),
        ))
      : 0;
  const shared = (playing: boolean, position = positionSec) =>
    hall.run({ type: 'playback', playing, positionSec: Math.max(0, position), rate: 1 });
  const error = player?.phase === 'error' ? player.code : null;
  const paused = live ? player?.phase === 'paused' : !timeline?.playing;
  const pinned = paused || !!error || seekDraft !== null || mode === 'mini';
  const VolumeIcon =
    audio.muted || audio.volume === 0 ? VolumeX : audio.volume < 50 ? Volume1 : Volume2;

  return (
    <div
      className={`hall-screen ${mode} ${idle && !pinned ? 'idle' : ''} ${live ? 'live' : ''}`}
      onPointerMove={wake}
      onPointerDown={wake}
      onFocusCapture={wake}
    >
      {hallItem && timeline ? (
        <HallPlayer
          hallId={hall.hallId}
          item={hallItem}
          timeline={timeline}
          serverOffsetMs={activity.serverOffsetMs}
          volume={audio.volume}
          muted={audio.muted}
          controls={controls}
          onSnapshot={setPlayer}
          onEnded={onEnded}
        />
      ) : youtube && timeline ? (
        <div className="hall-youtube">
          <CinemaYouTubeStage
            item={youtube}
            timeline={timeline}
            serverOffsetMs={activity.serverOffsetMs}
            next={hall.upcoming[0] ?? null}
            canDirect={canDirect}
            directReason={directReason}
            connected={hall.connected}
            addedBy={hall.nameOf(youtube.addedBy)}
            fullscreen={fullscreen}
            send={hall.run}
            quiet={hall.quiet}
            onToggleFullscreen={onToggleFullscreen}
            onEnded={onEnded}
            onOpenSource={() =>
              window.open(`https://www.youtube.com/watch?v=${youtube.media.videoId}`)
            }
          />
        </div>
      ) : (
        <div className="hall-screen-welcome">{welcome}</div>
      )}

      {hallItem && (
        <>
          <div className="hall-screen-top">
            <div className="hall-screen-pills">
              {live && (
                <span className="hall-live-pill">
                  <i />
                  CANLI
                </span>
              )}
              {info && <QualityBadges badges={info.badges} max={3} />}
            </div>
            {viewers > 0 && (
              <span className="hall-viewers-pill" title={viewerLabel(viewers)}>
                <Eye size={14} />
                {viewers}
              </span>
            )}
          </div>
          {osd && (
            <div key={osd.key} className="hall-osd" role="status">
              {osd.note ? (
                <strong>{osd.note}</strong>
              ) : (
                <>
                  {osd.number !== null && <span className="hall-osd-number">{osd.number}</span>}
                  <span>
                    <strong>{osd.title}</strong>
                    {osd.detail && <small>{osd.detail}</small>}
                  </span>
                </>
              )}
            </div>
          )}
          {switching && !error && (
            <div className="hall-switching" role="status">
              <span className="hall-spinner" />
              {live ? 'Kanal değişiyor…' : 'Açılıyor…'}
            </div>
          )}
          {error && (
            <div className="hall-error-card" role="alert">
              <strong>Bu yayın şu an açılamadı</strong>
              <p>{cinemaErrorCopy[error]}</p>
              <div>
                <button className="button primary small" onClick={() => controls.current?.retry()}>
                  <RotateCcw size={15} />
                  Yeniden dene
                </button>
                {live && canDirect && (
                  <button className="button secondary small" onClick={() => onZap(1)}>
                    Sonraki kanal
                  </button>
                )}
              </div>
            </div>
          )}
          {player?.behindLive && live && player.phase !== 'paused' && (
            <button className="hall-golive" onClick={() => controls.current?.goLive()}>
              Canlıya dön
            </button>
          )}
        </>
      )}

      {mode === 'mini' && current && (
        <button className="hall-mini-expand" aria-label="Sahneyi büyüt" onClick={onExpand}>
          <span>
            {live && <i className="hall-live-dot" />}
            {current.media.title}
          </span>
          <Maximize2 size={15} />
        </button>
      )}

      {mode === 'stage' && hallItem && (
        <div className="hall-controls" onPointerEnter={wake}>
          {!live && durationSec ? (
            <div className="hall-seek">
              <span className="hall-time">{clock(positionSec)}</span>
              <input
                type="range"
                min={0}
                max={durationSec}
                step={1}
                value={Math.min(durationSec, positionSec)}
                disabled={!canDirect}
                title={canDirect ? undefined : directReason}
                aria-label="Konum"
                aria-valuetext={`${clock(positionSec)} / ${clock(durationSec)}`}
                style={
                  {
                    '--fill': `${(Math.min(durationSec, positionSec) / durationSec) * 100}%`,
                  } as CSSProperties
                }
                onChange={(event) => setSeekDraft(Number(event.target.value))}
                onPointerUp={() => {
                  if (seekDraft !== null) shared(!!timeline?.playing, seekDraft);
                  setSeekDraft(null);
                }}
                onKeyUp={() => {
                  if (seekDraft !== null) shared(!!timeline?.playing, seekDraft);
                  setSeekDraft(null);
                }}
              />
              <span className="hall-time">{clock(durationSec)}</span>
            </div>
          ) : null}
          <div className="hall-control-row">
            {live ? (
              <>
                <ControlButton
                  label={paused ? 'Yayına devam et' : 'Bende duraklat'}
                  onClick={() => controls.current?.toggleLocalPause()}
                >
                  {paused ? <Play size={18} /> : <Pause size={18} />}
                </ControlButton>
                <ControlButton
                  label={canDirect ? 'Önceki kanal (↑)' : directReason}
                  disabled={!canDirect}
                  onClick={() => onZap(-1)}
                >
                  <ChevronUp size={18} />
                </ControlButton>
                <ControlButton
                  label={canDirect ? 'Sonraki kanal (↓)' : directReason}
                  disabled={!canDirect}
                  onClick={() => onZap(1)}
                >
                  <ChevronDown size={18} />
                </ControlButton>
              </>
            ) : (
              <>
                <ControlButton
                  label={
                    canDirect
                      ? timeline?.playing
                        ? 'Herkes için duraklat'
                        : 'Herkes için oynat'
                      : directReason
                  }
                  disabled={!canDirect}
                  primary
                  onClick={() => shared(!timeline?.playing)}
                >
                  {timeline?.playing ? <Pause size={18} /> : <Play size={18} />}
                </ControlButton>
                <ControlButton
                  label={canDirect ? 'Sıradakine geç' : directReason}
                  disabled={!canDirect || !hall.upcoming.length}
                  onClick={() =>
                    current &&
                    hall.run({ type: 'queue.next', fromItemId: current.id, reason: 'skip' })
                  }
                >
                  <SkipForward size={17} />
                </ControlButton>
              </>
            )}
            <div className="hall-volume">
              <ControlButton
                label={audio.muted ? 'Sesi aç (M)' : 'Sesi kapat (M)'}
                onClick={() => setVolume({ ...audio, muted: !audio.muted })}
              >
                <VolumeIcon size={18} />
              </ControlButton>
              <input
                type="range"
                min={0}
                max={100}
                value={audio.muted ? 0 : audio.volume}
                aria-label="Ses düzeyi (yalnızca sende)"
                style={{ '--fill': `${audio.muted ? 0 : audio.volume}%` } as CSSProperties}
                onChange={(event) =>
                  setVolume({ volume: Number(event.target.value), muted: false })
                }
              />
            </div>
            <span className="hall-control-title">
              {live ? (
                <span className="hall-live-label">
                  <i className="hall-live-dot" />
                  Canlı · herkes aynı anda izliyor
                </span>
              ) : (
                <span>{viewers > 1 ? viewerLabel(viewers) : 'Herkes aynı sahnede'}</span>
              )}
            </span>
            {hallItem && player && player.audioTracks.length > 1 && (
              <AudioMenu
                tracks={player.audioTracks}
                selected={player.audioTrack}
                disabledReason={canDirect ? null : directReason}
                onPick={(track) => {
                  const bridge = getCinemaBridge();
                  if (!bridge || track === player.audioTrack) return;
                  void bridge
                    .setAudio(hall.hallId, hallItem.media.ref, track)
                    .catch((error) => hall.notify(cinemaErrorText(error)));
                }}
              />
            )}
            {hallItem && player && !live && (
              <SubtitleMenu
                player={player}
                onPick={(key) => controls.current?.setSubtitle(key)}
                onOffset={(seconds) => controls.current?.setSubtitleOffset(seconds)}
                onFile={() =>
                  void controls.current
                    ?.chooseSubtitleFile()
                    .catch(() =>
                      hall.notify(
                        'Altyazı dosyası okunamadı. En fazla 2 MB boyutunda bir SRT, VTT ya da ASS dosyası seç.',
                      ),
                    )
                }
              />
            )}
            <ControlButton
              label={panelOpen ? 'Paneli gizle (C)' : 'Paneli göster (C)'}
              onClick={onTogglePanel}
            >
              {panelOpen ? <PanelRightClose size={18} /> : <PanelRightOpen size={18} />}
            </ControlButton>
            <ControlButton
              label={fullscreen ? 'Tam ekrandan çık (F)' : 'Tam ekran (F)'}
              onClick={onToggleFullscreen}
            >
              {fullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
            </ControlButton>
          </div>
        </div>
      )}
    </div>
  );
}

/** The hall's audio language; changing it restarts the relay for everyone. */
function AudioMenu({
  tracks,
  selected,
  disabledReason,
  onPick,
}: {
  tracks: { index: number; label: string }[];
  selected: number | null;
  disabledReason: string | null;
  onPick(track: number): void;
}) {
  const [open, setOpen] = useState(false);
  const current = tracks.find((t) => t.index === selected);
  return (
    <span
      className="hall-audio-menu"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <button
        className="hall-control hall-audio-trigger"
        aria-label={`Ses dili: ${current?.label ?? 'seçilmedi'}`}
        aria-expanded={open}
        title={disabledReason ?? 'Ses dili (herkes için)'}
        onClick={() => setOpen((value) => !value)}
      >
        <Languages size={17} />
        <span>{current?.label.split(' · ')[0] ?? 'Ses'}</span>
      </button>
      {open && (
        <span className="hall-audio-list" role="menu">
          <small>{disabledReason ?? 'Herkes için değişir'}</small>
          {tracks.map((track) => (
            <button
              key={track.index}
              role="menuitemradio"
              aria-checked={track.index === selected}
              disabled={!!disabledReason}
              onClick={() => {
                setOpen(false);
                onPick(track.index);
              }}
            >
              <Check size={14} style={{ opacity: track.index === selected ? 1 : 0 }} />
              {track.label}
            </button>
          ))}
        </span>
      )}
    </span>
  );
}

const onlineNote: Record<PlayerSnapshot['onlineSubtitles'], string | null> = {
  idle: null,
  loading: 'Çevrimiçi altyazı aranıyor…',
  ready: null,
  unavailable: 'Çevrimiçi altyazı için topluluk sahibinin SubDL anahtarı gerekiyor.',
  error: 'Çevrimiçi altyazı şu an alınamadı. Biraz sonra yeniden dene.',
};

const seconds = (value: number) =>
  `${value > 0 ? '+' : ''}${value.toLocaleString('tr-TR', { maximumFractionDigits: 1 })} sn`;

/** This viewer's subtitles; nobody else's screen changes. */
function SubtitleMenu({
  player,
  onPick,
  onOffset,
  onFile,
}: {
  player: PlayerSnapshot;
  onPick(key: string | null): void;
  onOffset(seconds: number): void;
  onFile(): void;
}) {
  const [open, setOpen] = useState(false);
  const tracks = player.subtitleTracks;
  const current = tracks.find((t) => t.key === player.subtitle);
  const group = (origin: SubtitleOption['origin']) => tracks.filter((t) => t.origin === origin);
  const note =
    onlineNote[player.onlineSubtitles] ??
    (player.onlineSubtitles === 'ready' && !group('online').length
      ? 'Çevrimiçi altyazı bulunamadı.'
      : null);
  const option = (track: { key: string | null; label: string }) => (
    <button
      key={track.key ?? 'off'}
      role="menuitemradio"
      aria-checked={track.key === player.subtitle}
      onClick={() => {
        setOpen(false);
        onPick(track.key);
      }}
    >
      <Check size={14} style={{ opacity: track.key === player.subtitle ? 1 : 0 }} />
      {track.label}
    </button>
  );
  return (
    <span
      className="hall-audio-menu"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <button
        className="hall-control hall-audio-trigger"
        aria-label={`Altyazı: ${current?.label ?? 'kapalı'}`}
        aria-expanded={open}
        title="Altyazı (yalnızca sende)"
        data-active={current ? 'true' : undefined}
        onClick={() => setOpen((value) => !value)}
      >
        <Captions size={17} />
        <span>{current ? current.label.split(' · ')[0] : 'Kapalı'}</span>
      </button>
      {open && (
        <span className="hall-audio-list hall-subtitle-list" role="menu">
          <small>Yalnızca sende değişir</small>
          {option({ key: null, label: 'Kapalı' })}
          {group('embedded').length > 0 && <small>Filmin altyazıları</small>}
          {group('embedded').map(option)}
          {group('online').length > 0 && <small>SubDL'den</small>}
          {group('online').map(option)}
          {group('file').map(option)}
          {note && <small className="hall-subtitle-note">{note}</small>}
          <button
            onClick={() => {
              setOpen(false);
              onFile();
            }}
          >
            <FileUp size={14} />
            Dosyadan yükle…
          </button>
          <span className="hall-subtitle-timing" role="group" aria-label="Altyazı zamanlaması">
            <span>Zamanlama</span>
            <button
              aria-label="Altyazıyı yarım saniye erkene al"
              disabled={!current}
              onClick={() => onOffset(player.subtitleOffset - 0.5)}
            >
              <Minus size={13} />
            </button>
            <output aria-live="polite">{seconds(player.subtitleOffset)}</output>
            <button
              aria-label="Altyazıyı yarım saniye geciktir"
              disabled={!current}
              onClick={() => onOffset(player.subtitleOffset + 0.5)}
            >
              <Plus size={13} />
            </button>
            {player.subtitleOffset !== 0 && (
              <button aria-label="Zamanlamayı sıfırla" onClick={() => onOffset(0)}>
                <RotateCcw size={13} />
              </button>
            )}
          </span>
        </span>
      )}
    </span>
  );
}

function ControlButton({
  label,
  disabled,
  primary,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  primary?: boolean;
  onClick(): void;
  children: ReactNode;
}) {
  return (
    <button
      className={`hall-control ${primary ? 'primary' : ''}`}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
