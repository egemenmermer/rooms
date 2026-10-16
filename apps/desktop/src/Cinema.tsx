import './cozy-cinema.css';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Modal } from '@rooms/design';
import {
  Crown,
  Film,
  FolderOpen,
  Gamepad2,
  Headphones,
  ListVideo,
  LoaderCircle,
  Lock,
  MicOff,
  Monitor,
  MonitorUp,
  Play,
  Plus,
  Popcorn,
  Tv,
  UserRoundCheck,
  UserRoundX,
  Users,
} from 'lucide-react';
import {
  directsSession,
  type ActivityCommand,
  type QueueItem,
  type RoomSnapshot,
  type SessionControlMode,
} from '../../../packages/activity-protocol/src';
import { VoiceAvatar } from './VoiceAvatar';
import { useCommunity } from './community';
import { useActivityRoom } from './activity';
import { useCurrentRoom } from './Agent';
import { CommunityInvite } from './RealSocial';
import { chooseCinemaMedia, useCinemaSession } from './cinema-session';
import { uiError } from './i18n';
import { stopScreen, useRealtime } from './realtime';
import { activityBridge } from './runtime-sources';
import { CinemaYouTubeStage } from './CinemaYouTubeStage';
import { CinemaShareView } from './CinemaShareView';
import { CinemaQueue, YouTubeAddBox, type YouTubeChoice } from './CinemaQueue';
import { queueProgress, youtubeThumbnail } from './cinema-youtube';

type YouTubeItem = QueueItem & { media: { kind: 'youtube'; videoId: string; title: string } };
type Primary = NonNullable<RoomSnapshot['primary']>;
const QUEUE_KEY = 'rooms.cinema.queue-open';
const activityName: Record<Primary['activity'], string> = {
  youtube: 'YouTube',
  cinema: 'kişisel dosya oturumu',
  screen: 'ekran paylaşımı',
  holdem: 'Hold’em masası',
  blackjack: 'Blackjack masası',
  batak: 'Batak masası',
  '101': '101 Okey masası',
};
const playerActivity = (primary: Primary | null) =>
  !!primary && ['youtube', 'cinema', 'screen'].includes(primary.activity);

/** Remembered choice; without one the queue starts open only where it fits beside the screen. */
function readQueueOpen() {
  const wide = typeof window === 'undefined' || window.innerWidth >= 1180;
  try {
    const stored = localStorage.getItem(QUEUE_KEY);
    return stored === null ? wide : stored === 'true';
  } catch {
    return wide;
  }
}

/** Closes a popover on outside pointer or Escape. */
function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const pointer = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) close();
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    document.addEventListener('pointerdown', pointer, true);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('pointerdown', pointer, true);
      document.removeEventListener('keydown', key);
    };
  }, [open, close]);
  return ref;
}

function ControlModeChip({
  primary,
  isHost,
  onChange,
}: {
  primary: Primary;
  isHost: boolean;
  onChange(mode: SessionControlMode): void;
}) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const ref = useDismiss(open, close);
  const mode = primary.controlMode ?? 'everyone';
  const options: { mode: SessionControlMode; title: string; detail: string }[] = [
    {
      mode: 'everyone',
      title: 'Herkes yönetebilir',
      detail: 'Odadaki herkes oynatır, durdurur, sıradakine geçer.',
    },
    {
      mode: 'host',
      title: 'Yalnızca ben ve izin verdiklerim',
      detail: 'Diğerleri sıraya öneri ekler. Koltuğa tıklayıp kumanda verebilirsin.',
    },
  ];
  return (
    <div className="cozy-anchor" ref={ref}>
      <button
        className={`cozy-chip ${mode === 'host' ? 'locked' : ''}`}
        aria-haspopup={isHost ? 'menu' : undefined}
        aria-expanded={isHost ? open : undefined}
        disabled={!isHost}
        title={
          isHost
            ? 'Oynatmayı kimin yönetebileceğini seç'
            : mode === 'host'
              ? 'Oynatmayı host ve izin verdiği kişiler yönetiyor.'
              : 'Odadaki herkes oynatmayı yönetebilir.'
        }
        onClick={() => setOpen(!open)}
      >
        {mode === 'host' ? <Lock size={13} /> : <Users size={13} />}
        {mode === 'host' ? 'Kumanda hostta' : 'Kumanda herkeste'}
      </button>
      {open && (
        <div className="cozy-popover" role="menu" aria-label="Kumanda">
          {options.map((option) => (
            <button
              key={option.mode}
              role="menuitemradio"
              aria-checked={mode === option.mode}
              onClick={() => {
                setOpen(false);
                if (mode !== option.mode) onChange(option.mode);
              }}
            >
              <strong>{option.title}</strong>
              <small>{option.detail}</small>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

interface Seat {
  id: string;
  name: string;
  joined: boolean;
  canControl: boolean;
}
function SeatRow({
  seats,
  me,
  primary,
  isHost,
  run,
  onInvite,
}: {
  seats: Seat[];
  me: string | null;
  primary: Primary | null;
  isHost: boolean;
  run(command: ActivityCommand): void;
  onInvite(): void;
}) {
  const voice = useRealtime();
  const [menu, setMenu] = useState<string | null>(null);
  const close = useCallback(() => setMenu(null), []);
  const ref = useDismiss(menu !== null, close);
  const mode = primary?.controlMode ?? 'everyone';
  const controllers = primary?.controllers ?? [];
  return (
    <div className="cozy-seats" ref={ref} role="list" aria-label="Salondakiler">
      {seats.map((seat) => {
        const person = voice.participants.find((value) => value.id === seat.id);
        const host = primary?.hostUserId === seat.id;
        const remote = !host && mode === 'host' && controllers.includes(seat.id);
        const manageable = isHost && playerActivity(primary) && seat.id !== me;
        return (
          <div
            key={seat.id}
            role="listitem"
            className={`cozy-seat ${person?.speaking ? 'speaking' : ''} ${seat.joined ? '' : 'away'}`}
          >
            <button
              className="cozy-seat-button"
              aria-haspopup={manageable ? 'menu' : undefined}
              aria-expanded={manageable ? menu === seat.id : undefined}
              title={
                host
                  ? `${seat.name} · host`
                  : remote
                    ? `${seat.name} · kumanda verildi`
                    : seat.joined
                      ? seat.name
                      : `${seat.name} · sesli odada, sinemayı açmadı`
              }
              onClick={manageable ? () => setMenu(menu === seat.id ? null : seat.id) : undefined}
            >
              <span className="cozy-seat-avatar">
                <VoiceAvatar id={seat.id} name={seat.name} />
                {host && (
                  <span className="cozy-seat-badge host" aria-label="Host">
                    <Crown size={11} />
                  </span>
                )}
                {remote && (
                  <span className="cozy-seat-badge remote" aria-label="Kumanda verildi">
                    <Gamepad2 size={11} />
                  </span>
                )}
                {person?.muted && (
                  <span className="cozy-seat-badge muted" aria-label="Mikrofon kapalı">
                    <MicOff size={10} />
                  </span>
                )}
              </span>
              <span className="cozy-seat-name">{seat.id === me ? 'Sen' : seat.name}</span>
            </button>
            {menu === seat.id && (
              <div className="cozy-popover seat" role="menu" aria-label={seat.name}>
                {mode === 'host' ? (
                  <button
                    role="menuitem"
                    disabled={!seat.joined}
                    title={!seat.joined ? 'Henüz sinemayı açmadı.' : undefined}
                    onClick={() => {
                      close();
                      run({ type: 'session.permit', userId: seat.id, allowed: !remote });
                    }}
                  >
                    {remote ? <UserRoundX size={15} /> : <UserRoundCheck size={15} />}
                    <span>
                      <strong>{remote ? 'Kumandayı geri al' : 'Kumandayı ver'}</strong>
                      <small>
                        {remote
                          ? 'Yalnızca sıraya öneri ekleyebilir.'
                          : 'Oynatabilir, durdurabilir, sırayı yönetebilir.'}
                      </small>
                    </span>
                  </button>
                ) : (
                  <button
                    role="menuitem"
                    onClick={() => {
                      close();
                      run({ type: 'session.control', mode: 'host' });
                    }}
                  >
                    <Lock size={15} />
                    <span>
                      <strong>Kumandayı topla</strong>
                      <small>Şu an herkes yönetiyor. Önce kumandayı hostta topla.</small>
                    </span>
                  </button>
                )}
                <button
                  role="menuitem"
                  disabled={!seat.joined || !seat.canControl}
                  title={
                    !seat.joined
                      ? 'Henüz sinemayı açmadı.'
                      : !seat.canControl
                        ? 'Bu kişinin odada etkinlik yönetme izni yok.'
                        : undefined
                  }
                  onClick={() => {
                    close();
                    run({ type: 'session.host', userId: seat.id });
                  }}
                >
                  <Crown size={15} />
                  <span>
                    <strong>Hostu devret</strong>
                    <small>Kumanda ayarları ona geçer; sen kumandayı korursun.</small>
                  </span>
                </button>
              </div>
            )}
          </div>
        );
      })}
      <div role="listitem" className="cozy-seat invite">
        <button className="cozy-seat-button" onClick={onInvite} title="Arkadaşını davet et">
          <span className="cozy-seat-avatar">
            <Plus size={18} />
          </span>
          <span className="cozy-seat-name">Davet et</span>
        </button>
      </div>
    </div>
  );
}

function SourceTile({
  icon,
  title,
  detail,
  disabled,
  reason,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  detail: string;
  disabled?: boolean;
  reason?: string;
  onClick(): void;
}) {
  return (
    <button
      className="cozy-tile"
      disabled={disabled}
      title={disabled ? reason : undefined}
      onClick={onClick}
    >
      <span className="cozy-tile-icon">{icon}</span>
      <span>
        <strong>{title}</strong>
        <small>{disabled && reason ? reason : detail}</small>
      </span>
    </button>
  );
}

export default function Cinema({ notify }: { notify(message: string): void }) {
  const navigate = useNavigate(),
    location = useLocation(),
    realtime = useRealtime(),
    community = useCommunity();
  const roomId = useCurrentRoom(),
    activity = useActivityRoom(roomId);
  const view = new URLSearchParams(location.search).get('view');
  const media = useCinemaSession((state) => state.media);
  const me = community.user?.id ?? null;
  const room = activity.room,
    primary = room?.primary ?? null;
  const connected = activity.status === 'connected';
  const self = room?.participants.find((p) => p.userId === me);
  const roleControl = self ? self.canControl : true;
  const roleCreate = self ? self.canCreate !== false : true;
  const canDirect = connected && directsSession(primary, me, roleControl);
  const isHost = !!me && primary?.hostUserId === me;
  const { current, next } = queueProgress(room);
  const nameOf = useCallback(
    (id: string) =>
      room?.participants.find((p) => p.userId === id)?.displayName ??
      realtime.participants.find((p) => p.id === id)?.name ??
      'Katılımcı',
    [room?.participants, realtime.participants],
  );
  const hostName = primary ? (isHost ? 'Sen' : nameOf(primary.hostUserId)) : null;
  const directReason = !connected
    ? 'Etkinlik hizmeti bağlı değil.'
    : !roleControl
      ? 'Bu odada etkinlik yönetme iznin yok.'
      : 'Kumanda hostta. Oynatmayı host ve izin verdiği kişiler yönetiyor.';

  const [picker, setPicker] = useState(false),
    [personal, setPersonal] = useState(false),
    [inviting, setInviting] = useState(false),
    [queueOpen, setQueueOpen] = useState(() => view === 'queue' || readQueueOpen()),
    [endedItem, setEndedItem] = useState<string | null>(null),
    [titleDraft, setTitleDraft] = useState(''),
    [personalTitle, setPersonalTitle] = useState(''),
    [personalBusy, setPersonalBusy] = useState(false),
    [personalError, setPersonalError] = useState('');
  const toggleQueue = (open = !queueOpen) => {
    setQueueOpen(open);
    try {
      localStorage.setItem(QUEUE_KEY, String(open));
    } catch {
      /* Storage is a convenience only. */
    }
  };
  useEffect(() => {
    if (view === 'queue') setQueueOpen(true);
  }, [view]);

  const run = useCallback(
    (command: ActivityCommand) =>
      void activity.send(command).catch((error) => notify(uiError(error))),
    [activity.send, notify],
  );
  const quiet = useCallback(
    (command: ActivityCommand) => void activity.send(command).catch(() => activity.clearError()),
    [activity.send, activity.clearError],
  );
  const joined = !!self;
  useEffect(() => {
    if (connected && me && !joined) quiet({ type: 'join' });
  }, [connected, me, joined, quiet]);

  // What is on the screen: the newest source wins until someone picks another one locally.
  const screens = realtime.tracks.filter(
    (track) => track.source === 'screen_share' && track.kind === 'video' && !track.muted,
  );
  const youtubeItem =
    primary?.activity === 'youtube' && current?.media.kind === 'youtube'
      ? (current as YouTubeItem)
      : null;
  const sources = [
    ...(youtubeItem ? [{ key: 'youtube', label: 'YouTube' }] : []),
    ...screens.map((track) => ({
      key: `screen:${track.id}`,
      label: track.local ? 'Senin ekranın' : `${nameOf(track.participantId)} ekranı`,
    })),
  ];
  const [pick, setPick] = useState<string | null>(view === 'screen' ? 'screen' : null),
    [latest, setLatest] = useState<string | null>(null);
  const seenScreens = useRef(new Set<string>());
  const screenIds = screens.map((track) => track.id).join(',');
  useEffect(() => {
    for (const id of screenIds ? screenIds.split(',') : [])
      if (!seenScreens.current.has(id)) {
        seenScreens.current.add(id);
        setLatest(`screen:${id}`);
        setPick(null);
      }
  }, [screenIds]);
  useEffect(() => {
    if (!youtubeItem) return;
    setLatest('youtube');
    setPick(null);
  }, [youtubeItem?.id]);
  const keys = sources.map((source) => source.key);
  const shown =
    (pick === 'screen' ? keys.find((key) => key.startsWith('screen:')) : null) ??
    (pick && keys.includes(pick) ? pick : null) ??
    (latest && keys.includes(latest) ? latest : null) ??
    keys[0] ??
    null;
  const shownScreen = shown?.startsWith('screen:')
    ? screens.find((track) => `screen:${track.id}` === shown)
    : undefined;

  // The whole screen frame goes fullscreen, so every source keeps the same controls.
  const stage = useRef<HTMLDivElement>(null);
  const [fullscreen, setFullscreen] = useState(false),
    [windowFill, setWindowFill] = useState(false);
  useEffect(() => {
    const update = () => setFullscreen(document.fullscreenElement === stage.current);
    document.addEventListener('fullscreenchange', update);
    return () => {
      document.removeEventListener('fullscreenchange', update);
      if (document.fullscreenElement?.classList.contains('cozy-stage'))
        void document.exitFullscreen().catch(() => {});
    };
  }, []);
  const filled = fullscreen || windowFill;
  useEffect(() => {
    if (filled) document.documentElement.dataset.roomPlayerFullscreen = 'true';
    else delete document.documentElement.dataset.roomPlayerFullscreen;
    return () => {
      delete document.documentElement.dataset.roomPlayerFullscreen;
    };
  }, [filled]);
  const toggleFullscreen = useCallback(async () => {
    try {
      if (windowFill) {
        setWindowFill(false);
        await window.rooms?.windowAction('fullscreen');
      } else if (document.fullscreenElement) await document.exitFullscreen();
      else await stage.current!.requestFullscreen({ navigationUI: 'hide' });
    } catch {
      // Some window managers refuse element fullscreen; fill the window instead.
      if (window.rooms && !windowFill) {
        setWindowFill(true);
        await window.rooms.windowAction('fullscreen').catch(() => {});
      } else notify('Tam ekran açılamadı.');
    }
  }, [windowFill, notify]);
  useEffect(() => {
    if (!windowFill) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') void toggleFullscreen();
    };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [windowFill, toggleFullscreen]);
  const toggle = useCallback(() => void toggleFullscreen(), [toggleFullscreen]);
  const hasScreen = !!shown;
  useEffect(() => {
    if (!hasScreen) return;
    const key = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        event.key.toLowerCase() !== 'f' ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        target?.closest('input,textarea,select,[contenteditable="true"],[role="dialog"]')
      )
        return;
      event.preventDefault();
      toggle();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [hasScreen, toggle]);

  const idle = !current || (endedItem === current.id && !next);
  const blocking = primary && primary.activity !== 'youtube' ? primary : null;
  const switchReason = blocking
    ? canDirect
      ? `Şu an ${activityName[blocking.activity]} açık; açtığında kapanır.`
      : `Şu an ${activityName[blocking.activity]} açık. Host kapattığında açabilirsin.`
    : undefined;
  const startReason = !roleCreate
    ? 'Bu odada etkinlik başlatma iznin yok.'
    : !canDirect && primary
      ? directReason
      : undefined;

  const endFor = async (target: Primary['activity']) => {
    if (!primary || primary.activity === target) return false;
    if (!canDirect) throw new Error(switchReason ?? directReason);
    if (primary.activity === 'screen' && realtime.sharing) await stopScreen();
    await activity.send({ type: 'end' });
    return true;
  };
  const addYouTube = async (choice: YouTubeChoice, mode: 'queue' | 'now') => {
    if (!roomId) throw new Error('Önce bir odaya katıl.');
    const replaced = await endFor('youtube');
    if (!primary || replaced)
      await activity.send({ type: 'start', activity: 'youtube', title: 'Birlikte izle' });
    const direct = !primary || replaced || canDirect;
    await activity.send({
      type: 'queue.add',
      itemId: crypto.randomUUID(),
      media: { kind: 'youtube', videoId: choice.videoId, title: choice.title },
      start: direct && (mode === 'now' || replaced || !primary || idle),
    });
    setPicker(false);
    setQueueOpen((open) => open || mode === 'queue');
    if (!direct && mode === 'now') notify('Sıraya eklendi. Host oynattığında başlar.');
  };
  const addBox = (autoFocus = false) => (
    <YouTubeAddBox
      channelId={realtime.channelId ?? roomId}
      disabled={!connected || !!(blocking && !canDirect) || (!primary && !roleCreate)}
      disabledReason={
        !connected
          ? 'Etkinlik hizmeti bağlı değil.'
          : !primary && !roleCreate
            ? 'Bu odada etkinlik başlatma iznin yok.'
            : switchReason
      }
      canStartNow={!startReason}
      startReason={startReason}
      autoFocus={autoFocus}
      onAdd={addYouTube}
    />
  );

  const chooseScreen = () => {
    if (realtime.status !== 'connected') {
      notify('Ekran paylaşmak için önce ses odasına katıl.');
      return;
    }
    setPicker(false);
    window.dispatchEvent(new Event('rooms:choose-capture'));
  };
  const choosePersonal = async (shared: boolean) => {
    if (personalBusy) return;
    setPersonalBusy(true);
    setPersonalError('');
    try {
      let binding: Parameters<typeof chooseCinemaMedia>[0];
      if (shared) {
        if (!roomId || !connected) throw new Error('Etkinlik bağlantısı gerekli.');
        const replaced = await endFor('cinema');
        let snapshot = await activityBridge().snapshot(roomId);
        let selected = snapshot.room.queue.find(
          (item) => item.id === snapshot.room.timeline.itemId,
        );
        if (replaced || !selected || selected.media.kind !== 'independent-source') {
          const title = personalTitle.trim();
          if (!title || /:\/\/|^[/\\]|^[A-Za-z]:[/\\]/.test(title))
            throw new Error('İçerik adı gir. Kaynak adresi veya dosya yolu ekleme.');
          if (!snapshot.room.primary)
            await activity.send({ type: 'start', activity: 'cinema', title });
          const itemId = crypto.randomUUID();
          await activity.send({
            type: 'queue.add',
            itemId,
            media: { kind: 'independent-source', referenceId: crypto.randomUUID(), title },
            start: true,
          });
          snapshot = await activityBridge().snapshot(roomId);
          selected = snapshot.room.queue.find((item) => item.id === snapshot.room.timeline.itemId);
        }
        if (
          snapshot.room.primary?.activity !== 'cinema' ||
          selected?.media.kind !== 'independent-source'
        )
          throw new Error('Ortak içerik değişti. Sırayı kontrol et.');
        binding = {
          roomId,
          itemId: selected.id,
          referenceId: selected.media.referenceId,
          timelineEpoch: snapshot.room.timeline.epoch,
          title: selected.media.title,
        };
      }
      if (await chooseCinemaMedia(binding)) {
        setPersonal(false);
        setPicker(false);
        navigate('/cinema?view=personal');
      }
    } catch (error) {
      setPersonalError(uiError(error));
    } finally {
      setPersonalBusy(false);
    }
  };
  const addTitle = () => {
    const title = titleDraft.trim();
    if (!title) return;
    if (/:\/\/|^[/\\]|^[A-Za-z]:[/\\]/.test(title)) {
      notify('Yalnızca içerik adı gir. Kaynak adresi veya dosya yolu ekleme.');
      return;
    }
    run({
      type: 'queue.add',
      itemId: crypto.randomUUID(),
      media: { kind: 'independent-source', referenceId: crypto.randomUUID(), title },
    });
    setTitleDraft('');
  };

  const seats = useMemo(() => {
    const list: Seat[] = (room?.participants ?? []).map((p) => ({
      id: p.userId,
      name: p.displayName,
      joined: true,
      canControl: p.canControl,
    }));
    for (const person of realtime.participants)
      if (!person.id.startsWith('rooms-music-') && !list.some((seat) => seat.id === person.id))
        list.push({ id: person.id, name: person.name, joined: false, canControl: false });
    const rank = (seat: Seat) =>
      seat.id === primary?.hostUserId ? 0 : seat.id === me ? 1 : seat.joined ? 2 : 3;
    return list.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name, 'tr'));
  }, [room?.participants, realtime.participants, primary?.hostUserId, me]);

  // The personal player owns /cinema while a private file is bound (queue/status/screen stay here).
  if (media && !['queue', 'status', 'screen'].includes(view ?? '')) return null;

  const playing = !!room?.timeline.playing && shown === 'youtube';
  const ambient = youtubeItem ? youtubeThumbnail(youtubeItem.media.videoId, 'hq') : null;
  const sharedQueue = primary?.activity === 'youtube' || primary?.activity === 'cinema' || !primary;
  const queueCount = sharedQueue ? (room?.queue.length ?? 0) : 0;

  let screen: ReactNode;
  if (!roomId)
    screen = (
      <div className="cozy-curtain">
        <Headphones size={34} />
        <h3>Önce bir odaya gir</h3>
        <p>Sinema, içinde bulunduğun sesli odayla birlikte açılır.</p>
        <button className="button primary" onClick={() => navigate('/voice')}>
          Odaya git
        </button>
      </div>
    );
  else if (activity.status === 'idle' || (activity.status === 'loading' && !room))
    screen = (
      <div className="cozy-curtain" role="status">
        <LoaderCircle size={30} className="spin" />
        <p>Salon hazırlanıyor…</p>
      </div>
    );
  else if (activity.status === 'error' && !room)
    screen = (
      <div className="cozy-curtain" role="alert">
        <h3>Etkinlik hizmetine ulaşılamadı</h3>
        <p>{activity.error ?? 'Bağlantını kontrol edip yeniden dene.'}</p>
        <button className="button primary" onClick={() => void activity.refresh()}>
          Yeniden dene
        </button>
      </div>
    );
  else if (shown === 'youtube' && youtubeItem && room)
    screen = (
      <CinemaYouTubeStage
        key={youtubeItem.id}
        item={youtubeItem}
        timeline={room.timeline}
        serverOffsetMs={activity.serverOffsetMs}
        next={next}
        canDirect={canDirect}
        directReason={directReason}
        connected={connected}
        addedBy={youtubeItem.addedBy === me ? 'Sen' : nameOf(youtubeItem.addedBy)}
        fullscreen={filled}
        send={run}
        quiet={quiet}
        onToggleFullscreen={toggle}
        onEnded={setEndedItem}
        onOpenSource={() => setPicker(true)}
      />
    );
  else if (shownScreen)
    screen = (
      <CinemaShareView
        key={shownScreen.id}
        trackId={shownScreen.id}
        participantId={shownScreen.participantId}
        fullscreen={filled}
        notify={notify}
        onToggleFullscreen={toggle}
      />
    );
  else if (primary?.activity === 'youtube')
    screen = (
      <div className="cozy-curtain">
        <Popcorn size={34} />
        {room?.queue.length ? (
          <>
            <h3>Sırada {room.queue.length} video var</h3>
            <button
              className="button primary"
              disabled={!canDirect}
              title={canDirect ? undefined : directReason}
              onClick={() => run({ type: 'queue.select', itemId: room.queue[0]!.id, play: true })}
            >
              <Play size={16} />
              Başlat
            </button>
          </>
        ) : (
          <>
            <h3>Sıra boş</h3>
            <p>Bir YouTube bağlantısı yapıştır ya da ara.</p>
            {addBox(true)}
          </>
        )}
      </div>
    );
  else if (primary?.activity === 'cinema')
    screen = (
      <div className="cozy-curtain">
        <Film size={34} />
        <h3>{current?.media.title ?? 'Kendi dosyanla izleme'}</h3>
        <p>
          Herkes aynı filmi kendi bilgisayarından açar; oynatma, durdurma ve sarma birlikte ilerler.
          Dosyan paylaşılmaz.
        </p>
        <div className="button-row">
          <button className="button primary" onClick={() => setPersonal(true)}>
            <FolderOpen size={16} />
            Dosyamı seç
          </button>
          {canDirect && (
            <button className="button secondary" onClick={() => run({ type: 'end' })}>
              Oturumu kapat
            </button>
          )}
        </div>
      </div>
    );
  else if (primary?.activity === 'screen')
    screen = (
      <div className="cozy-curtain">
        <Monitor size={34} />
        <h3>Ekran paylaşımı bekleniyor</h3>
        <p>{hostName} bir pencere seçince burada görünür.</p>
        <button className="button primary" onClick={chooseScreen}>
          <MonitorUp size={16} />
          Ekranımı paylaş
        </button>
      </div>
    );
  else if (primary)
    screen = (
      <div className="cozy-curtain">
        <Gamepad2 size={34} />
        <h3>Odada {activityName[primary.activity]} açık</h3>
        <p>Bitince buradan film ya da video açabilirsiniz.</p>
        <div className="button-row">
          <button className="button primary" onClick={() => navigate('/games')}>
            Masaya git
          </button>
          {canDirect && (
            <button className="button secondary" onClick={() => run({ type: 'end' })}>
              Masayı kapat
            </button>
          )}
        </div>
      </div>
    );
  else
    screen = (
      <div className="cozy-curtain welcome">
        <span className="cozy-curtain-mark">
          <Popcorn size={30} />
        </span>
        <h3>Bugün ne izliyoruz?</h3>
        <p>Bir YouTube bağlantısı yapıştır, ara ya da ekranındaki herhangi bir şeyi aç.</p>
        {addBox()}
        <div className="cozy-tiles">
          <SourceTile
            icon={<MonitorUp size={20} />}
            title="Pencere paylaş"
            detail="Stremio, tarayıcı, IPTV ya da oyun"
            disabled={realtime.status !== 'connected'}
            reason="Önce ses odasına katıl."
            onClick={chooseScreen}
          />
          <SourceTile
            icon={<FolderOpen size={20} />}
            title="Kendi dosyamla"
            detail="Herkes kendi kopyasıyla, senkron"
            disabled={!window.rooms}
            reason="Masaüstü uygulaması gerekli."
            onClick={() => setPersonal(true)}
          />
          <SourceTile
            icon={<Tv size={20} />}
            title="Medyam ve IPTV"
            detail="Kişisel bağlantılarını aç"
            onClick={() => navigate('/media')}
          />
        </div>
      </div>
    );

  return (
    <div className={`cozy-cinema page-enter ${playing ? 'lights-down' : ''}`}>
      {ambient && <div className="cozy-ambient" style={{ backgroundImage: `url("${ambient}")` }} />}
      <header className="cozy-header">
        <div className="cozy-heading">
          <span className="cozy-mark">
            <Popcorn size={19} />
          </span>
          <div>
            <h2>Sinema</h2>
            <p>
              {realtime.roomName ?? 'Oda'} · {seats.length} kişi
              {hostName && playerActivity(primary) ? ` · Host: ${hostName}` : ''}
            </p>
          </div>
        </div>
        <div className="cozy-header-actions">
          {primary && playerActivity(primary) && (
            <ControlModeChip
              primary={primary}
              isHost={isHost}
              onChange={(mode) => run({ type: 'session.control', mode })}
            />
          )}
          <button className="button primary" onClick={() => setPicker(true)}>
            <Plus size={16} />
            Bir şey aç
          </button>
          <button
            className={`cozy-toggle ${queueOpen ? 'active' : ''}`}
            aria-pressed={queueOpen}
            onClick={() => toggleQueue()}
            title={queueOpen ? 'Sırayı gizle' : 'Sırayı göster'}
          >
            <ListVideo size={17} />
            Sıra
            {queueCount > 0 && <span className="cozy-count">{queueCount}</span>}
          </button>
        </div>
      </header>
      <div className={`cozy-body ${queueOpen ? 'with-queue' : ''}`}>
        <section className="cozy-theater">
          <div className="cozy-screen-box">
            <div
              ref={stage}
              className={`cozy-stage ${windowFill ? 'window-fill' : ''} ${filled ? 'filled' : ''}`}
            >
              {sources.length > 1 && (
                <div className="cozy-sources" role="tablist" aria-label="Perdede ne gösterilsin">
                  {sources.map((source) => (
                    <button
                      key={source.key}
                      role="tab"
                      aria-selected={shown === source.key}
                      onClick={() => setPick(source.key)}
                    >
                      {source.key === 'youtube' ? <Play size={12} /> : <Monitor size={12} />}
                      {source.label}
                    </button>
                  ))}
                </div>
              )}
              {screen}
            </div>
          </div>
          <SeatRow
            seats={seats}
            me={me}
            primary={primary}
            isHost={isHost}
            run={run}
            onInvite={() => setInviting(true)}
          />
        </section>
        {queueOpen && (
          <CinemaQueue
            room={sharedQueue ? room : null}
            me={me}
            canDirect={canDirect}
            canSuggest={connected && roleControl}
            directReason={directReason}
            busy={activity.busy}
            nameOf={(id) => nameOf(id)}
            run={run}
            onClose={() => toggleQueue(false)}
            addBox={
              primary?.activity === 'cinema' ? (
                <form
                  className="cozy-add-row"
                  onSubmit={(event) => {
                    event.preventDefault();
                    addTitle();
                  }}
                >
                  <label>
                    <Film size={16} />
                    <input
                      aria-label="Sıraya eklenecek içerik adı"
                      placeholder="Film ya da bölüm adı ekle"
                      value={titleDraft}
                      maxLength={240}
                      onChange={(event) => setTitleDraft(event.target.value)}
                    />
                  </label>
                  <button
                    className="button primary"
                    disabled={!connected || !roleControl || !titleDraft.trim()}
                  >
                    Ekle
                  </button>
                </form>
              ) : sharedQueue ? (
                addBox()
              ) : (
                <p className="cozy-muted">
                  Şu an {primary ? activityName[primary.activity] : 'bir etkinlik'} açık. Sıra,
                  YouTube ya da dosya oturumunda kullanılır.
                </p>
              )
            }
          />
        )}
      </div>
      {activity.status === 'error' && room && (
        <div className="cozy-banner" role="alert">
          Bağlantı koptu; yeniden bağlanılıyor.
          <button className="button secondary small" onClick={() => void activity.refresh()}>
            Şimdi dene
          </button>
        </div>
      )}
      {picker && (
        <Modal title="Bir şey aç" onClose={() => setPicker(false)} className="cozy-picker">
          <p className="cozy-picker-lead">
            Açtığın şey herkesin perdesinde görünür. YouTube ve dosya oturumları birlikte oynar.
          </p>
          <section className="cozy-picker-section">
            <h4>
              <Play size={15} /> YouTube
            </h4>
            {addBox(true)}
            {switchReason && <p className="cozy-muted">{switchReason}</p>}
          </section>
          <div className="cozy-tiles">
            <SourceTile
              icon={<MonitorUp size={20} />}
              title="Ekranı ya da pencereyi paylaş"
              detail="Stremio, tarayıcı, IPTV oynatıcı, oyun; ne açıksa."
              disabled={realtime.status !== 'connected'}
              reason="Önce ses odasına katıl."
              onClick={chooseScreen}
            />
            <SourceTile
              icon={<FolderOpen size={20} />}
              title="Kendi dosyamla senkron"
              detail="Herkes kendi kopyasını açar, oynatma birlikte ilerler."
              disabled={!window.rooms}
              reason="Masaüstü uygulaması gerekli."
              onClick={() => {
                setPicker(false);
                setPersonal(true);
              }}
            />
            <SourceTile
              icon={<Tv size={20} />}
              title="Medyam ve IPTV"
              detail="Kişisel bağlantını aç, sonra pencereni paylaş."
              onClick={() => {
                setPicker(false);
                navigate('/media');
              }}
            />
          </div>
        </Modal>
      )}
      {personal && (
        <Modal
          title="Kendi dosyanla izle"
          onClose={() => setPersonal(false)}
          className="cozy-picker"
        >
          {current?.media.kind === 'independent-source' && primary?.activity === 'cinema' ? (
            <p className="cozy-picker-lead">
              Ortak içerik: <strong>{current.media.title}</strong>. Aynı filmi kendi bilgisayarından
              seç; süreler eşleşince odaya katılırsın.
            </p>
          ) : (
            <label className="cozy-field">
              İçerik adı
              <input
                aria-label="Ortak içerik adı"
                placeholder="ör. Yüzüklerin Efendisi 1"
                value={personalTitle}
                maxLength={240}
                onChange={(event) => setPersonalTitle(event.target.value)}
              />
            </label>
          )}
          {switchReason && primary?.activity !== 'cinema' && (
            <p className="cozy-muted">{switchReason}</p>
          )}
          <div className="cozy-tiles">
            <SourceTile
              icon={<Users size={20} />}
              title={personalBusy ? 'Hazırlanıyor…' : 'Odayla senkron izle'}
              detail="Dosya bu cihazda oynar; yalnızca içerik adı paylaşılır."
              disabled={
                personalBusy ||
                !connected ||
                (primary?.activity !== 'cinema' && !personalTitle.trim()) ||
                (!!primary && primary.activity !== 'cinema' && !canDirect)
              }
              reason={
                !connected
                  ? 'Etkinlik bağlantısı gerekli.'
                  : primary && primary.activity !== 'cinema' && !canDirect
                    ? switchReason
                    : 'Önce içerik adını yaz.'
              }
              onClick={() => void choosePersonal(true)}
            />
            <SourceTile
              icon={<FolderOpen size={20} />}
              title="Yalnızca ben izleyeceğim"
              detail="Odayla eşitlenmez."
              disabled={personalBusy || !window.rooms}
              reason="Masaüstü uygulaması gerekli."
              onClick={() => void choosePersonal(false)}
            />
          </div>
          {personalError && (
            <p className="cozy-add-error" role="alert">
              {personalError}
            </p>
          )}
        </Modal>
      )}
      {inviting && <CommunityInvite onClose={() => setInviting(false)} notify={notify} />}
    </div>
  );
}
