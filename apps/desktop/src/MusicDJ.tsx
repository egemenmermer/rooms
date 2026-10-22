import { MusicLyrics } from './MusicLyrics';
import { useCommunityBranding } from './use-community-branding';
import { SharedPlaylists, playlistsKey } from './SharedPlaylists';
import { musicPlaybackError } from './music-errors';
import { DJCharacter } from './DJCharacter';
import { useNavigate } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import {
  Music2,
  X,
  Plus,
  Search,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Trash2,
  Square,
  Volume2,
  VolumeX,
  History,
  ArrowUp,
  ArrowDown,
  SlidersHorizontal,
} from 'lucide-react';
import { create } from 'zustand';
import { useQuery } from '@tanstack/react-query';
import { queryClient } from './query-client';
import { useCommunity } from './community';
import { useRealtime, setParticipantVolume, musicEqualizer, setMusicEqualizer } from './realtime';
import type { MusicEqualizer } from '@rooms/media';
import { useActivityRoom } from './activity';
import { uiError } from './i18n';
import {
  musicSearchQuerySchema,
  type MusicCommand,
  type MusicSearchResult,
} from '../../../packages/shared-contracts/src/music';
import './music-dj.css';
const useDJ = create<{ open: boolean; show(): void; hide(): void }>((set) => ({
  open: false,
  show: () => set({ open: true }),
  hide: () => set({ open: false }),
}));
export const openMusicDJ = () => useDJ.getState().show();
export function openRoomActivity(path: string, navigate: (path: string) => void) {
  if (path === '/youtube') openMusicDJ();
  else navigate(path);
}
export function MusicDJEntry({ returnTo = '/home' }: { returnTo?: string }) {
  const navigate = useNavigate();
  useEffect(() => {
    openMusicDJ();
    navigate(returnTo, { replace: true });
  }, [navigate, returnTo]);
  return null;
}
export function MusicDJ({ showTrigger = true }: { showTrigger?: boolean }) {
  const community = useCommunity(),
    voice = useRealtime(),
    dj = useDJ(),
    branding = useCommunityBranding();
  if (!community.user) return null;
  return (
    <>
      {showTrigger && !dj.open && (
        <button className="dj-launch" onClick={dj.show} title={branding.name}>
          <Music2 size={20} />
          <span>DJ</span>
        </button>
      )}
      {dj.open && (
        <DJPanel
          key={`${community.serverUrl}:${community.user.id}:${voice.channelId ?? 'none'}`}
          channelId={voice.channelId}
          onClose={dj.hide}
        />
      )}
    </>
  );
}
const clock = (v: number) => `${Math.floor(v / 60)}:${String(Math.floor(v % 60)).padStart(2, '0')}`;
/** Smooth only between confirmed playing snapshots; stop estimating after a missed poll. */
export function MusicPlaybackClock({
  position,
  duration,
  playing,
  receivedAt,
}: {
  position: number;
  duration: number;
  playing: boolean;
  receivedAt: number;
}) {
  const [anchor] = useState(() => ({
    time: performance.now(),
    age: Math.max(0, (Date.now() - receivedAt) / 1000),
  }));
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => setElapsed((performance.now() - anchor.time) / 1000), 250);
    return () => clearInterval(timer);
  }, [playing, anchor]);
  const estimate = position + (playing ? Math.min(6, anchor.age + elapsed) : 0);
  return (
    <small aria-label="Parça süresi">
      {clock(Math.max(0, Math.min(duration, estimate)))} / {clock(duration)}
    </small>
  );
}
export function MusicSeekControl({
  id,
  position,
  duration,
  disabled,
  onSeek,
}: {
  id: string;
  position: number;
  duration: number;
  disabled: boolean;
  onSeek(command: MusicCommand): void;
}) {
  const [draft, setDraft] = useState<number | null>(null),
    pending = useRef<number | null>(null);
  const commit = () => {
    const value = pending.current;
    if (value === null) return;
    pending.current = null;
    setDraft(null);
    onSeek({ type: 'seek', id, positionSec: value });
  };
  return (
    <input
      className="dj-seek"
      type="range"
      aria-label="Parçada konum"
      aria-valuetext={clock(draft ?? position)}
      min={0}
      max={Math.max(0, duration - 0.1)}
      step={0.1}
      value={draft ?? Math.min(position, Math.max(0, duration - 0.1))}
      disabled={disabled || duration <= 0}
      onChange={(event) => {
        pending.current = Number(event.target.value);
        setDraft(pending.current);
      }}
      onPointerUp={commit}
      onKeyUp={(event) => {
        if (
          [
            'ArrowLeft',
            'ArrowRight',
            'ArrowUp',
            'ArrowDown',
            'Home',
            'End',
            'PageUp',
            'PageDown',
          ].includes(event.key)
        )
          commit();
      }}
      onBlur={commit}
      onPointerCancel={() => {
        pending.current = null;
        setDraft(null);
      }}
    />
  );
}
function DJPanel({ channelId, onClose }: { channelId: string | null; onClose(): void }) {
  const branding = useCommunityBranding();
  const community = useCommunity(),
    voice = useRealtime(),
    legacy = useActivityRoom(channelId);
  const [input, setInput] = useState(''),
    [error, setError] = useState(''),
    [info, setInfo] = useState(''),
    [busy, setBusy] = useState(false),
    [placement, setPlacement] = useState<{ x: number; y: number } | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [equalizer, setEqualizer] = useState<MusicEqualizer | null>(() => musicEqualizer()),
    [equalizerOpen, setEqualizerOpen] = useState(false);
  const flat = (eq: MusicEqualizer) => !eq.bass && !eq.mid && !eq.treble;
  const changeEqualizer = (next: MusicEqualizer) => {
    try {
      setMusicEqualizer(next);
      setEqualizer(musicEqualizer());
    } catch (e) {
      setError(uiError(e));
    }
  };
  const [listsOpen, setListsOpen] = useState(false);
  // "Temizle" asks once: a second click within a few seconds empties the queue.
  const [clearing, setClearing] = useState(false);
  useEffect(() => {
    if (!clearing) return;
    const timer = setTimeout(() => setClearing(false), 4000);
    return () => clearTimeout(timer);
  }, [clearing]);
  const [results, setResults] = useState<MusicSearchResult[] | null>(null);
  const panel = useRef<HTMLElement>(null),
    alive = useRef(false),
    drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const key = ['room-music', community.serverUrl, community.user?.id, channelId];
  const fixture = import.meta.env.DEV && new URLSearchParams(location.search).has('fixture');
  const query = useQuery(
    {
      queryKey: key,
      enabled: !!channelId && !fixture && !!window.rooms?.music && !busy,
      staleTime: 3000,
      refetchInterval: busy ? false : 5000,
      retry: 1,
      queryFn: async () => {
        const server = community.serverUrl,
          user = community.user?.id;
        const value = await window.rooms!.music.snapshot(channelId!);
        if (
          useCommunity.getState().serverUrl !== server ||
          useCommunity.getState().user?.id !== user
        )
          throw new Error('Oturum değişti.');
        return value;
      },
    },
    queryClient,
  );
  const historyKey = ['room-music-history', community.serverUrl, community.user?.id, channelId];
  const history = useQuery(
    {
      queryKey: historyKey,
      enabled: historyOpen && !!channelId && !fixture && !!window.rooms?.music,
      staleTime: 10000,
      refetchInterval: 30000,
      retry: 1,
      queryFn: () => window.rooms!.music.history(channelId!),
    },
    queryClient,
  );
  const snapshot = query.data,
    active = snapshot?.queue.find((item) => item.id === snapshot.currentId),
    index = snapshot?.queue.findIndex((item) => item.id === snapshot.currentId) ?? -1;
  const bot = voice.participants.find((p) => p.id === snapshot?.identity);
  const restoreVolume = useRef(1);
  useEffect(() => {
    if (bot && bot.volume > 0) restoreVolume.current = bot.volume;
  }, [bot?.id, bot?.volume]);
  const available =
    !!channelId && voice.status === 'connected' && !fixture && !!window.rooms?.music;
  const run = async (command: MusicCommand) => {
    if (busy || !available) return;
    setBusy(true);
    setError('');
    setInfo('');
    try {
      await queryClient.cancelQueries({ queryKey: key, exact: true });
      if (!alive.current) return;
      // Retire only the obsolete DJ-authored YouTube session on an explicit MP3 add action.
      // Only its host may end it; for anyone else the DJ add still goes ahead.
      if (
        command.type === 'add' &&
        legacy.room?.primary?.activity === 'youtube' &&
        legacy.room.primary.title === 'DJ Recep'
      )
        await legacy.send({ type: 'end' }).catch(() => legacy.clearError());
      const value = await window.rooms!.music.command(channelId!, command);
      if (alive.current) {
        queryClient.setQueryData(key, value);
        void queryClient.invalidateQueries({ queryKey: historyKey, exact: true });
        if (command.type === 'add') {
          if (value.matchCandidates) {
            setResults(value.matchCandidates.candidates);
            setError(
              'Tam eşleşme bulunamadı. Doğru parça bunlardan biri mi? Seçmeden kuyruğa eklenmez.',
            );
          } else {
            setInput('');
            setResults(null);
            const n = value.importNotice;
            if (n)
              setInfo(
                `${n.added} şarkı eklendi.` +
                  (n.truncated
                    ? ' Spotify herkese açık görünümde en fazla 100 parça gösterir; listenin devamı eklenmedi.'
                    : '') +
                  (n.queueFull ? ' Kuyrukta yer kalmadığı için listenin kalanı eklenmedi.' : '') +
                  (n.skipped ? ` ${n.skipped} kayıt (bölüm/yerel dosya) atlandı.` : ''),
              );
          }
        }
      }
    } catch (e) {
      if (alive.current) setError(uiError(e));
    } finally {
      if (alive.current) setBusy(false);
    }
  };
  useEffect(() => {
    alive.current = true;
    panel.current?.focus();
    const resize = () => {
      const rect = panel.current?.getBoundingClientRect();
      if (rect)
        setPlacement((value) =>
          value
            ? {
                x: Math.max(8, Math.min(innerWidth - rect.width - 8, value.x)),
                y: Math.max(40, Math.min(innerHeight - rect.height - 8, value.y)),
              }
            : null,
        );
    };
    window.addEventListener('resize', resize);
    return () => {
      alive.current = false;
      window.removeEventListener('resize', resize);
    };
  }, []);
  const validLink = () => {
    try {
      const url = new URL(input.trim());
      return url.protocol === 'https:' && !url.username && !url.password;
    } catch {
      return false;
    }
  };
  const validSearch = () =>
    !/^\w+:|^www\./i.test(input.trim()) && musicSearchQuerySchema.safeParse(input).success;
  const search = async () => {
    if (busy || !available || !validSearch()) return;
    setBusy(true);
    setError('');
    setInfo('');
    setResults(null);
    try {
      const found = await window.rooms!.music.search(channelId!, input.trim());
      if (alive.current) setResults(found);
    } catch (e) {
      if (alive.current) setError(uiError(e));
    } finally {
      if (alive.current) setBusy(false);
    }
  };
  return (
    <section
      ref={panel}
      className="music-dj"
      style={placement ? { left: placement.x, top: placement.y, right: 'auto' } : undefined}
      role="dialog"
      tabIndex={-1}
      aria-label={branding.name}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <header
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest('button')) return;
          const rect = panel.current!.getBoundingClientRect();
          drag.current = { x: e.clientX, y: e.clientY, left: rect.left, top: rect.top };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const start = drag.current;
          if (!start) return;
          const rect = panel.current!.getBoundingClientRect();
          setPlacement({
            x: Math.max(8, Math.min(innerWidth - rect.width - 8, start.left + e.clientX - start.x)),
            y: Math.max(
              40,
              Math.min(innerHeight - rect.height - 8, start.top + e.clientY - start.y),
            ),
          });
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
      >
        <span>
          <Music2 size={15} />
          {branding.name}
          <small>{voice.roomName ?? ''}</small>
        </span>
        <button aria-label="DJ panelini kapat" onClick={onClose}>
          <X size={18} />
        </button>
      </header>
      <DJCharacter key={`${branding.poster}:${branding.animation}`} branding={branding} />
      <div className="dj-content">
        <form
          className="dj-add"
          onSubmit={(e) => {
            e.preventDefault();
            if (validLink()) void run({ type: 'add', url: input.trim(), offerCandidates: true });
            else void search();
          }}
        >
          <input
            aria-label="YouTube, Spotify, SoundCloud veya ses bağlantısı"
            placeholder="Şarkı adı veya şarkı/liste bağlantısı"
            maxLength={2048}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              setResults(null);
            }}
            disabled={!available || busy}
            required
          />
          <button
            type="submit"
            aria-label={validSearch() ? 'Şarkı ara' : 'Kuyruğa ekle'}
            disabled={!available || busy || (!validLink() && !validSearch())}
          >
            {busy ? '…' : validSearch() ? <Search size={18} /> : <Plus size={18} />}
          </button>
        </form>
        {validLink() && (
          <button
            className="dj-play-now"
            disabled={!available || busy}
            onClick={() =>
              void run({ type: 'add', url: input.trim(), playNow: true, offerCandidates: true })
            }
          >
            <Play size={15} /> Şimdi çal
          </button>
        )}
        {results && (
          <div className="dj-search-results" role="region" aria-label="YouTube arama sonuçları">
            {results.length === 0 ? (
              <p>Parça bulunamadı.</p>
            ) : (
              results.map((item) => (
                <div key={item.id} className="dj-search-result">
                  <button
                    aria-label={`Kuyruğa ekle: ${item.title}`}
                    disabled={!available || busy}
                    onClick={() =>
                      void run({ type: 'add', url: `https://www.youtube.com/watch?v=${item.id}` })
                    }
                  >
                    <span>{item.title}</span>
                    <small>{item.durationSec > 0 ? clock(item.durationSec) : 'YouTube'}</small>
                    <Plus size={14} />
                  </button>
                  <button
                    aria-label={`${item.title} — Şimdi çal`}
                    disabled={!available || busy}
                    onClick={() =>
                      void run({
                        type: 'add',
                        url: `https://www.youtube.com/watch?v=${item.id}`,
                        playNow: true,
                      })
                    }
                  >
                    <Play size={15} />
                  </button>
                </div>
              ))
            )}
          </div>
        )}
        <div className="dj-track">
          <strong>{active?.title ?? (query.isLoading ? 'Yükleniyor…' : 'Kuyruk boş')}</strong>
          {active && (
            <MusicPlaybackClock
              key={`${snapshot?.currentId}:${query.dataUpdatedAt}:${snapshot?.status}:${!!query.error}`}
              position={snapshot?.positionSec ?? 0}
              duration={active.durationSec}
              playing={
                snapshot?.status === 'playing' && !query.error && voice.status === 'connected'
              }
              receivedAt={query.dataUpdatedAt}
            />
          )}
        </div>
        {active && (
          <MusicSeekControl
            key={`seek:${active.id}`}
            id={active.id}
            position={snapshot?.positionSec ?? 0}
            duration={active.durationSec}
            disabled={!available || busy || snapshot?.status === 'connecting'}
            onSeek={(command) => void run(command)}
          />
        )}
        <div className="dj-transport">
          <button
            aria-label="Önceki parça"
            disabled={!available || busy || index < 0}
            onClick={() => void run({ type: 'previous' })}
          >
            <SkipBack size={21} />
          </button>
          <button
            className="dj-play"
            aria-label={snapshot?.status === 'playing' ? 'Duraklat' : 'Oynat'}
            disabled={!available || busy || !active}
            onClick={() => void run({ type: snapshot?.status === 'playing' ? 'pause' : 'play' })}
          >
            {snapshot?.status === 'playing' ? <Pause size={24} /> : <Play size={24} />}
          </button>
          <button
            aria-label="Sonraki parça"
            disabled={
              !available || busy || index < 0 || index === (snapshot?.queue.length ?? 0) - 1
            }
            onClick={() => void run({ type: 'next' })}
          >
            <SkipForward size={21} />
          </button>
          <button
            aria-label="Botu odadan çıkar"
            disabled={!available || busy || !snapshot || snapshot.status === 'disconnected'}
            onClick={() => void run({ type: 'stop' })}
          >
            <Square size={17} />
          </button>
        </div>
        <div className="dj-volume">
          <button
            aria-label={bot?.volume === 0 ? 'Botun sesini aç' : 'Botun sesini kapat'}
            disabled={!bot}
            onClick={() =>
              bot && setParticipantVolume(bot.id, bot.volume === 0 ? restoreVolume.current : 0)
            }
          >
            {bot?.volume === 0 ? <VolumeX size={17} /> : <Volume2 size={17} />}
          </button>
          <input
            type="range"
            aria-label="Botun ses seviyesi"
            min={0}
            max={1}
            step={0.01}
            value={bot?.volume ?? 1}
            disabled={!bot}
            onChange={(e) => bot && setParticipantVolume(bot.id, Number(e.target.value))}
          />
          <small>{Math.round((bot?.volume ?? 1) * 100)}%</small>
          <button
            aria-label="Ekolayzır"
            aria-expanded={equalizerOpen}
            className={equalizer && !flat(equalizer) ? 'dj-eq-on' : undefined}
            disabled={!equalizer}
            title={equalizer ? 'Yalnızca senin duyduğun bas, orta ve tiz' : undefined}
            onClick={() => setEqualizerOpen((value) => !value)}
          >
            <SlidersHorizontal size={16} />
          </button>
        </div>
        {equalizerOpen && equalizer && (
          <div className="dj-equalizer" role="group" aria-label="Ekolayzır">
            {(
              [
                ['bass', 'Bas'],
                ['mid', 'Orta'],
                ['treble', 'Tiz'],
              ] as const
            ).map(([key, label]) => (
              <label key={key}>
                <span>{label}</span>
                <input
                  type="range"
                  min={-12}
                  max={12}
                  step={1}
                  value={equalizer[key]}
                  aria-valuetext={`${equalizer[key] > 0 ? '+' : ''}${equalizer[key]} dB`}
                  onChange={(e) => changeEqualizer({ ...equalizer, [key]: Number(e.target.value) })}
                />
                <small>
                  {equalizer[key] > 0 ? '+' : ''}
                  {equalizer[key]} dB
                </small>
              </label>
            ))}
            <p>
              Yalnızca senin duyduğun sesi değiştirir.
              <button
                disabled={flat(equalizer)}
                onClick={() => changeEqualizer({ bass: 0, mid: 0, treble: 0 })}
              >
                Sıfırla
              </button>
            </p>
          </div>
        )}
        {active && channelId && !fixture && (
          <MusicLyrics
            key={`lyrics:${active.id}`}
            channelId={channelId}
            trackId={active.id}
            position={snapshot?.positionSec ?? 0}
            playing={snapshot?.status === 'playing' && !query.error && voice.status === 'connected'}
            receivedAt={query.dataUpdatedAt}
          />
        )}
        <div className="dj-queue-heading">
          <span>Kuyruk</span>
          <button
            aria-expanded={listsOpen}
            onClick={() => setListsOpen((value) => !value)}
            disabled={!window.rooms?.music.playlists || !window.rooms?.music.changePlaylist}
            title={
              !window.rooms?.music.playlists
                ? 'Ortak listeler için güncel masaüstü uygulaması gerekiyor.'
                : undefined
            }
          >
            Listeler
          </button>
          <button aria-expanded={historyOpen} onClick={() => setHistoryOpen((value) => !value)}>
            <History size={14} />
            Geçmiş
          </button>
          {((snapshot?.queue.length ?? 0) > 1 ||
            (snapshot?.status === 'error' && !!snapshot.queue.length)) && (
            <button
              className={clearing ? 'danger' : undefined}
              disabled={!available || busy}
              title="Çalan parça dışında kuyruğu boşaltır"
              onClick={() => {
                if (!clearing) return setClearing(true);
                setClearing(false);
                void run({ type: 'clear' });
              }}
            >
              <Trash2 size={13} />
              {clearing
                ? `${(snapshot?.queue.length ?? 1) - (active && snapshot?.status !== 'error' ? 1 : 0)} parçayı kaldır`
                : 'Temizle'}
            </button>
          )}
        </div>
        <ol className="dj-queue">
          {snapshot?.queue.map((item, i) => {
            const move = (target: number) => {
              const ids = snapshot.queue.map((track) => track.id);
              ids.splice(i, 1);
              ids.splice(target, 0, item.id);
              void run({ type: 'reorder', ids });
            };
            return (
              <li
                key={item.id}
                draggable={available && !busy}
                className={item.id === active?.id ? 'current' : ''}
                onDragStart={(event) => {
                  event.dataTransfer.setData('application/x-rooms-music-id', item.id);
                  event.dataTransfer.effectAllowed = 'move';
                }}
                onDragOver={(event) => {
                  if (
                    available &&
                    !busy &&
                    event.dataTransfer.types.includes('application/x-rooms-music-id')
                  )
                    event.preventDefault();
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  const source = event.dataTransfer.getData('application/x-rooms-music-id');
                  const ids = snapshot.queue.map((track) => track.id),
                    from = ids.indexOf(source);
                  if (from < 0 || from === i) return;
                  ids.splice(from, 1);
                  ids.splice(i, 0, source);
                  void run({ type: 'reorder', ids });
                }}
              >
                <span>{i + 1}</span>
                <button
                  className="dj-queue-title"
                  title={item.title}
                  disabled={!available || busy}
                  aria-label={`${item.title} parçasını çal`}
                  onClick={() => void run({ type: 'select', id: item.id })}
                >
                  {item.title}
                </button>
                <small>{clock(item.durationSec)}</small>
                <div className="dj-order-controls">
                  <button
                    aria-label={`${item.title} yukarı taşı`}
                    disabled={!available || busy || i === 0}
                    onClick={() => move(i - 1)}
                  >
                    <ArrowUp size={12} />
                  </button>
                  <button
                    aria-label={`${item.title} aşağı taşı`}
                    disabled={!available || busy || i === snapshot.queue.length - 1}
                    onClick={() => move(i + 1)}
                  >
                    <ArrowDown size={12} />
                  </button>
                </div>
                <button
                  aria-label={`${item.title} sıradan kaldır`}
                  disabled={
                    !available ||
                    busy ||
                    (item.id === active?.id &&
                      snapshot.status !== 'error' &&
                      snapshot.status !== 'paused')
                  }
                  onClick={() => void run({ type: 'remove', id: item.id })}
                >
                  <Trash2 size={14} />
                </button>
              </li>
            );
          })}
        </ol>
        {historyOpen && (
          <div className="dj-history" aria-label="DJ oturum geçmişi">
            {history.isLoading ? (
              <p>Geçmiş yükleniyor…</p>
            ) : history.error ? (
              <p role="alert">
                {uiError(history.error)}
                <button onClick={() => void history.refetch()}>Yeniden dene</button>
              </p>
            ) : !history.data?.length ? (
              <p>Henüz kayıtlı liste yok.</p>
            ) : (
              history.data.map((session) => (
                <details key={session.id}>
                  <summary>
                    {new Date(session.startedAt).toLocaleString('tr-TR', {
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                    <small>{session.tracks.length} parça</small>
                  </summary>
                  <ol>
                    {session.tracks.map((track) => (
                      <li key={track.id}>
                        <button
                          disabled={!available || busy}
                          aria-label={`${track.title} geçmişten çal`}
                          onClick={() =>
                            void run({ type: 'restore', sessionId: session.id, trackId: track.id })
                          }
                        >
                          {track.title}
                        </button>
                        <small>{track.played ? 'Çalındı' : 'Kuyrukta'}</small>
                      </li>
                    ))}
                  </ol>
                  <button
                    disabled={!available || busy}
                    onClick={() => void run({ type: 'restore', sessionId: session.id })}
                  >
                    <Play size={13} />
                    Kuyruğa ekle ve çal
                  </button>
                  <button
                    disabled={!available || busy || !window.rooms?.music.changePlaylist}
                    onClick={() => {
                      setBusy(true);
                      setError('');
                      void window
                        .rooms!.music.changePlaylist(channelId!, {
                          op: 'saveQueue',
                          name: `Dinleme ${new Date(session.startedAt).toLocaleDateString('tr-TR')}`,
                          sessionId: session.id,
                        })
                        .then((value) => {
                          if (alive.current) {
                            queryClient.setQueryData(
                              playlistsKey(community.serverUrl, community.user?.id, channelId!),
                              value,
                            );
                            setListsOpen(true);
                          }
                        })
                        .catch((e) => {
                          if (alive.current) setError(uiError(e));
                        })
                        .finally(() => {
                          if (alive.current) setBusy(false);
                        });
                    }}
                  >
                    Ortak listeye kaydet
                  </button>
                </details>
              ))
            )}
          </div>
        )}

        {listsOpen && channelId && (
          <SharedPlaylists
            key={`${community.serverUrl}:${community.user?.id}:${channelId}`}
            channelId={channelId}
            canPlay={available && !busy}
            play={run}
          />
        )}
        {!channelId && (
          <p className="dj-error" role="status">
            Önce ses odasına katıl.
          </p>
        )}
        {fixture && (
          <p className="dj-error" role="status">
            Yerel görünüm örneği; bot bağlantısı yok.
          </p>
        )}
        {info && !error && (
          <p className="dj-info" role="status">
            {info}
          </p>
        )}
        {(error || query.error || snapshot?.error) && (
          <p className="dj-error" role="alert">
            {error ||
              (query.error
                ? uiError(query.error)
                : snapshot?.error
                  ? musicPlaybackError(snapshot.error, active?.title)
                  : null)}
          </p>
        )}
      </div>
    </section>
  );
}
