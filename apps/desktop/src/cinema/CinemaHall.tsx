import './community-cinema.css';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { Clapperboard, Film, Plug, Popcorn, Search, Settings2, Tv } from 'lucide-react';
import { endsActivity } from '../../../../packages/activity-protocol/src';
import type {
  CinemaDetails,
  CinemaItem,
  CinemaStatus,
} from '../../../../packages/community-cinema/src/types';
import { VoiceAvatar } from '../VoiceAvatar';
import { storeVolume, storedVolume } from '../cinema-youtube';
import { CinemaArt, QualityBadges } from './CinemaArt';
import { knownItem, useBridgeRead, useItems } from './catalog-cache';
import { useCommunityCinema } from './cinema-status';
import { cachedGuide, useGuides, useNow } from './guide-cache';
import { GuideTab } from './GuideTab';
import { HallPanel, type PanelTab } from './HallPanel';
import type { PlayerControls } from './HallPlayer';
import { HallStage, type StageOsd } from './HallStage';
import {
  ARROW_ZAP_MS,
  editingTarget,
  hhmm,
  isHallItem,
  minutesLabel,
  neighbour,
  NUMBER_ZAP_MS,
  programmeAfter,
  programmeAt,
  programmeProgress,
  timeRange,
  type HallTab,
} from './hall-model';
import { LiveTab } from './LiveTab';
import { OpenPalette } from './OpenPalette';
import { HallContext, useHall, useHallState } from './use-hall';
import { VodTab, type VodView } from './VodTab';
import { YouTubeTab } from './YouTubeTab';

type View = 'stage' | HallTab;

const tabs: { id: View; label: string }[] = [
  { id: 'stage', label: 'Salon' },
  { id: 'live', label: 'Canlı TV' },
  { id: 'guide', label: 'Rehber' },
  { id: 'movies', label: 'Filmler' },
  { id: 'series', label: 'Diziler' },
  { id: 'youtube', label: 'YouTube' },
];

/** The community cinema hall: one shared screen, a catalog to open things from, and the hall's chat. */
export default function CinemaHall({ notify }: { notify(message: string): void }) {
  const cinema = useCommunityCinema();
  const navigate = useNavigate();
  if (!cinema.available)
    return (
      <HallMessage
        icon={<Clapperboard size={30} />}
        title="Sinema bu sürümde kapalı"
        detail="Sinema salonu güncel masaüstü uygulaması ve sinema hizmeti açık bir sunucu gerektirir."
      />
    );
  if (cinema.loading) return <HallSkeleton />;
  if (!cinema.status)
    return (
      <HallMessage
        icon={<Clapperboard size={30} />}
        title="Sinema salonuna ulaşılamadı"
        detail={cinema.error ?? 'Sinema hizmeti şu an yanıt vermiyor.'}
        action={
          <button className="button primary" onClick={() => void cinema.refresh()}>
            Yeniden dene
          </button>
        }
      />
    );
  if (!cinema.hallId)
    return cinema.status.isOwner ? (
      <HallMessage
        icon={<Popcorn size={30} />}
        title="Bir sinema salonu kur"
        detail="Salon, topluluğun kalıcı sinemasıdır: bir kanal seç, sunucunun IPTV hesabını bağla; herkes birlikte izlesin."
        action={
          <button className="button primary" onClick={() => navigate('/settings?tab=cinema')}>
            <Settings2 size={16} />
            Salonu ayarla
          </button>
        }
      />
    ) : (
      <HallMessage
        icon={<Popcorn size={30} />}
        title="Sinema salonu henüz açılmadı"
        detail="Topluluk sahibi bir salon kanalı seçtiğinde burası birlikte izleme yerin olacak."
      />
    );
  return <HallRoom hallId={cinema.hallId} status={cinema.status} notify={notify} />;
}

function HallRoom({
  hallId,
  status,
  notify,
}: {
  hallId: string;
  status: CinemaStatus;
  notify(message: string): void;
}) {
  const hall = useHallState({ hallId, status, notify });
  return (
    <HallContext.Provider value={hall}>
      <HallLayout />
    </HallContext.Provider>
  );
}

const keyboardInput = () =>
  document.documentElement.dataset.input === 'keyboard' ||
  document.documentElement.dataset.motion === 'reduce' ||
  matchMedia('(prefers-reduced-motion: reduce)').matches;

function HallLayout() {
  const hall = useHall();
  const connected = hall.status.connected;
  const [view, setView] = useState<View>('stage');
  const [liveCategory, setLiveCategory] = useState<string | null>(null);
  const [guideFocus, setGuideFocus] = useState<string | null>(null);
  const [vod, setVod] = useState<{ movies: VodView; series: VodView }>({
    movies: { mode: 'home' },
    series: { mode: 'home' },
  });
  const [panel, setPanel] = useState<{ open: boolean; tab: PanelTab }>(() => ({
    open: readPanel(),
    tab: 'chat',
  }));
  const [palette, setPalette] = useState(false);
  const [osd, setOsd] = useState<StageOsd | null>(null);
  const [audio, setAudioState] = useState(storedVolume);
  const controls = useRef<PlayerControls | null>(null);
  const allLive = useItems(hall.hallId, 'live', null);
  const [zapList, setZapList] = useState<CinemaItem[]>([]);
  const zapItems = zapList.length ? zapList : (allLive.data?.items ?? []);
  const currentRef = hall.current?.media.kind === 'community-media' ? hall.current.media.ref : null;
  const live = isHallItem(hall.current) && hall.current.media.live;
  // The channels a zap reaches first, so their OSD can name what is on without waiting.
  const nearby = useMemo(() => {
    const index = zapItems.findIndex((item) => item.ref === currentRef);
    if (index < 0 || !live) return [];
    return [-3, -2, -1, 1, 2, 3]
      .map((step) => zapItems[(index + step + zapItems.length) % zapItems.length]!)
      .filter((item) => item.hasGuide)
      .map((item) => item.ref);
  }, [zapItems, currentRef, live]);
  useGuides(hall.hallId, nearby);

  const setAudio = useCallback((value: { volume: number; muted: boolean }) => {
    setAudioState(value);
    storeVolume(value);
  }, []);
  const togglePanel = useCallback((open?: boolean) => {
    setPanel((value) => {
      const next = { ...value, open: open ?? !value.open };
      try {
        localStorage.setItem(PANEL_KEY, String(next.open));
      } catch {
        /* Storage is a convenience only. */
      }
      return next;
    });
  }, []);

  // Watching means taking a seat: join while something plays, leave with the page.
  const joined = useRef(false);
  joined.current = hall.joined;
  useEffect(() => {
    if (hall.connected && hall.primary && !hall.joined) hall.quiet({ type: 'join' });
  }, [hall.connected, hall.primary, hall.joined, hall.quiet]);
  useEffect(
    () => () => {
      if (joined.current) hall.quiet({ type: 'leave' });
    },
    // Leave once, when the hall closes.
    [],
  );

  // OSD fades after a few seconds; a new zap restarts it.
  useEffect(() => {
    if (!osd) return;
    const timer = setTimeout(() => setOsd(null), 3000);
    return () => clearTimeout(timer);
  }, [osd]);
  const show = useCallback(
    (value: Omit<StageOsd, 'key'>) => setOsd({ ...value, key: Date.now() }),
    [],
  );

  const pendingZap = useRef<{ target: CinemaItem; timer: ReturnType<typeof setTimeout> } | null>(
    null,
  );
  const digits = useRef<{ text: string; timer: ReturnType<typeof setTimeout> } | null>(null);
  const describe = useCallback(
    (item: CinemaItem) => {
      // The OSD shows whatever guide is already cached; it never waits for one.
      const onAir = programmeAt(cachedGuide(hall.hallId, item.ref), Date.now());
      return onAir ? `${onAir.title} · ${timeRange(onAir)}` : null;
    },
    [hall.hallId],
  );
  const zap = useCallback(
    (step: 1 | -1) => {
      if (!hall.canDirect) {
        show({ number: null, title: '', detail: null, note: 'Kumanda ev sahibinde' });
        return;
      }
      const base = pendingZap.current?.target.ref ?? currentRef;
      const target = neighbour(zapItems, base, step);
      if (!target) {
        show({ number: null, title: '', detail: null, note: 'Kanal listesi yükleniyor…' });
        return;
      }
      show({ number: target.number, title: target.title, detail: describe(target) });
      if (pendingZap.current) clearTimeout(pendingZap.current.timer);
      pendingZap.current = {
        target,
        timer: setTimeout(() => {
          pendingZap.current = null;
          void hall.openItem(target);
        }, ARROW_ZAP_MS),
      };
    },
    [hall, currentRef, zapItems, show, describe],
  );
  const typeDigit = useCallback(
    (digit: string) => {
      if (!hall.canDirect) {
        show({ number: null, title: '', detail: null, note: 'Kumanda ev sahibinde' });
        return;
      }
      if (digits.current) clearTimeout(digits.current.timer);
      const text = `${digits.current?.text ?? ''}${digit}`.slice(-4);
      show({ number: Number(text), title: `${text}_`, detail: null });
      digits.current = {
        text,
        timer: setTimeout(() => {
          digits.current = null;
          const target = zapItems.find((item) => item.number === Number(text));
          if (target) {
            show({ number: target.number, title: target.title, detail: describe(target) });
            void hall.openItem(target);
          } else
            show({ number: null, title: '', detail: null, note: `${text} numaralı kanal yok` });
        }, NUMBER_ZAP_MS),
      };
    },
    [hall, zapItems, show, describe],
  );
  useEffect(
    () => () => {
      if (pendingZap.current) clearTimeout(pendingZap.current.timer);
      if (digits.current) clearTimeout(digits.current.timer);
    },
    [],
  );

  // Fullscreen covers the screen element, with every control drawn over the video.
  const host = useRef<HTMLDivElement>(null);
  const [fullscreen, setFullscreen] = useState(false);
  useEffect(() => {
    const update = () => setFullscreen(document.fullscreenElement === host.current);
    document.addEventListener('fullscreenchange', update);
    return () => {
      document.removeEventListener('fullscreenchange', update);
      if (document.fullscreenElement === host.current)
        void document.exitFullscreen().catch(() => {});
    };
  }, []);
  useEffect(() => {
    if (fullscreen) document.documentElement.dataset.roomPlayerFullscreen = 'true';
    else delete document.documentElement.dataset.roomPlayerFullscreen;
    return () => {
      delete document.documentElement.dataset.roomPlayerFullscreen;
    };
  }, [fullscreen]);
  const toggleFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await host.current?.requestFullscreen({ navigationUI: 'hide' });
    } catch {
      hall.notify('Tam ekran açılamadı.');
    }
  }, [hall]);

  const goTo = useCallback((next: View) => {
    setView(next);
    setPalette(false);
  }, []);
  const vodKey = view === 'movies' || view === 'series' ? view : null;
  const shared = (playing: boolean, positionSec: number) =>
    hall.run({ type: 'playback', playing, positionSec: Math.max(0, positionSec), rate: 1 });

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPalette((value) => !value);
        return;
      }
      if (palette || event.metaKey || event.ctrlKey || event.altKey || editingTarget(event.target))
        return;
      if (document.querySelector('.modal-backdrop')) return;
      const stage = view === 'stage';
      const timeline = hall.room?.timeline;
      switch (event.key) {
        case 'Escape':
          if (vodKey && vod[vodKey].mode !== 'home') {
            event.preventDefault();
            setVod((value) => ({ ...value, [vodKey]: { mode: 'home' } }));
          } else if (!stage && hall.current) {
            event.preventDefault();
            setView('stage');
          }
          return;
        case 'f':
        case 'F':
          if (!hall.current) return;
          event.preventDefault();
          void toggleFullscreen();
          return;
        case 'm':
        case 'M':
          event.preventDefault();
          setAudio({ ...audio, muted: !audio.muted });
          show({
            number: null,
            title: '',
            detail: null,
            note: audio.muted ? 'Ses açıldı' : 'Ses kapalı',
          });
          return;
        case 'c':
        case 'C':
          event.preventDefault();
          togglePanel();
          return;
        case 'g':
        case 'G':
          if (!connected) return;
          event.preventDefault();
          setView((value) => (value === 'guide' ? (hall.current ? 'stage' : 'live') : 'guide'));
          return;
      }
      if (!stage) return;
      if (live && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
        event.preventDefault();
        zap(event.key === 'ArrowDown' ? 1 : -1);
      } else if (live && /^[0-9]$/.test(event.key)) {
        event.preventDefault();
        typeDigit(event.key);
      } else if (event.key === ' ' && isHallItem(hall.current)) {
        event.preventDefault();
        if (live) controls.current?.toggleLocalPause();
        else if (hall.canDirect && timeline) shared(!timeline.playing, currentPosition(hall));
      } else if (
        !live &&
        isHallItem(hall.current) &&
        (event.key === 'ArrowLeft' || event.key === 'ArrowRight') &&
        hall.canDirect &&
        timeline
      ) {
        event.preventDefault();
        shared(timeline.playing, currentPosition(hall) + (event.key === 'ArrowRight' ? 10 : -10));
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  });

  // The screen is one element for the whole page: it fills the stage slot, or shrinks to an
  // in-page mini player while browsing, so the stream never reloads.
  const main = useRef<HTMLDivElement>(null);
  const slot = useRef<HTMLDivElement>(null);
  const mode: 'stage' | 'mini' = view === 'stage' ? 'stage' : 'mini';
  const showScreen = view === 'stage' || !!hall.current;
  const [rect, setRect] = useState<{
    top: number;
    left: number;
    width: number;
    height: number;
  } | null>(null);
  const measure = useCallback(() => {
    const container = main.current;
    if (!container) return;
    if (mode === 'stage') {
      const target = slot.current;
      if (!target) return;
      const outer = container.getBoundingClientRect(),
        inner = target.getBoundingClientRect();
      setRect({
        top: inner.top - outer.top,
        left: inner.left - outer.left,
        width: inner.width,
        height: inner.height,
      });
    } else {
      const width = container.clientWidth < 760 ? 240 : 320;
      const height = Math.round((width * 9) / 16);
      setRect({
        top: container.clientHeight - height - 20,
        left: container.clientWidth - width - 20,
        width,
        height,
      });
    }
  }, [mode]);
  useLayoutEffect(() => {
    measure();
    const observer = new ResizeObserver(measure);
    if (main.current) observer.observe(main.current);
    if (slot.current) observer.observe(slot.current);
    return () => observer.disconnect();
  }, [measure, view]);
  // FLIP between the stage and the mini player; instant from the keyboard or with reduced motion.
  const previous = useRef<typeof rect>(null);
  const previousMode = useRef(mode);
  useLayoutEffect(() => {
    const element = host.current;
    const before = previous.current;
    previous.current = rect;
    const changed = previousMode.current !== mode;
    previousMode.current = mode;
    if (!element || !rect || !before || !changed || keyboardInput()) return;
    const dx = before.left - rect.left,
      dy = before.top - rect.top,
      sx = before.width / rect.width,
      sy = before.height / rect.height;
    element.style.transition = 'none';
    element.style.transform = `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`;
    void element.offsetWidth;
    element.style.transition = 'transform 240ms var(--motion-ease-in-out)';
    element.style.transform = '';
    const done = () => {
      element.style.transition = '';
    };
    element.addEventListener('transitionend', done, { once: true });
  }, [rect, mode]);

  return (
    <div className={`hall ${panel.open ? 'with-panel' : ''}`} data-view={view}>
      <header className="hall-bar">
        <nav className="hall-tabs" role="tablist" aria-label="Sinema">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={view === tab.id}
              className={view === tab.id ? 'selected' : ''}
              onClick={() => {
                if (tab.id === view && vodKey === tab.id)
                  setVod((value) => ({ ...value, [tab.id]: { mode: 'home' } }));
                goTo(tab.id);
              }}
            >
              {tab.label}
              {tab.id === 'stage' && hall.current && live && (
                <i className="hall-live-dot" aria-label="Canlı yayın açık" />
              )}
            </button>
          ))}
        </nav>
        <button
          className="hall-open"
          onClick={() => setPalette(true)}
          aria-keyshortcuts="Meta+K Control+K"
        >
          <Search size={15} />
          <span>Aç…</span>
          <kbd>⌘K</kbd>
        </button>
      </header>
      <div className="hall-body">
        <div className="hall-main" ref={main}>
          {view === 'stage' ? (
            <div className="hall-theater">
              <div className="hall-screen-slot" ref={slot} />
              <NowBar onGuide={() => goTo('guide')} />
            </div>
          ) : (
            <div className={`hall-browse ${hall.current ? 'with-mini' : ''}`}>
              {!connected && view !== 'youtube' ? (
                <NotConnected />
              ) : view === 'live' ? (
                <LiveTab
                  categoryId={liveCategory}
                  onCategory={setLiveCategory}
                  onZapList={setZapList}
                  onGuide={(ref) => {
                    setGuideFocus(ref);
                    goTo('guide');
                  }}
                />
              ) : view === 'guide' ? (
                <GuideTab categoryId={liveCategory} focusRef={guideFocus} />
              ) : view === 'movies' || view === 'series' ? (
                <VodTab
                  kind={view === 'movies' ? 'movie' : 'series'}
                  view={vod[view]}
                  onView={(value) => setVod((current) => ({ ...current, [view]: value }))}
                />
              ) : (
                <YouTubeTab />
              )}
            </div>
          )}
          {showScreen && rect && (
            <div
              ref={host}
              className={`hall-screen-host ${mode}`}
              style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }}
            >
              <HallStage
                mode={mode}
                fullscreen={fullscreen}
                panelOpen={panel.open}
                osd={osd}
                audio={audio}
                onAudio={setAudio}
                controls={controls}
                welcome={<Welcome onBrowse={goTo} onOpen={() => setPalette(true)} />}
                onToggleFullscreen={() => void toggleFullscreen()}
                onTogglePanel={() => togglePanel()}
                onExpand={() => goTo('stage')}
                onZap={zap}
              />
            </div>
          )}
        </div>
        {panel.open && (
          <HallPanel
            tab={panel.tab}
            onTab={(tab) => setPanel((value) => ({ ...value, tab }))}
            onClose={() => togglePanel(false)}
            notify={hall.notify}
          />
        )}
      </div>
      {palette && (
        <OpenPalette
          onClose={() => setPalette(false)}
          onSeries={(ref) => {
            setVod((value) => ({ ...value, series: { mode: 'details', ref } }));
            setView('series');
          }}
        />
      )}
      {!hall.connected && hall.activity.status === 'error' && (
        <div className="hall-banner" role="status">
          Salon hizmetine bağlanılamıyor. {hall.activity.error ?? ''}
          <button className="hall-text-button" onClick={() => void hall.activity.refresh()}>
            Yeniden dene
          </button>
        </div>
      )}
    </div>
  );
}

const PANEL_KEY = 'rooms.cinema.hall-panel';
function readPanel() {
  const wide = typeof window === 'undefined' || window.innerWidth >= 1280;
  try {
    const stored = localStorage.getItem(PANEL_KEY);
    return stored === null ? wide : stored === 'true';
  } catch {
    return wide;
  }
}

function currentPosition(hall: ReturnType<typeof useHall>) {
  const timeline = hall.room?.timeline;
  if (!timeline) return 0;
  return (
    timeline.positionSec +
    (timeline.playing
      ? ((Date.now() + hall.activity.serverOffsetMs - timeline.effectiveServerTimeMs) / 1000) *
        timeline.rate
      : 0)
  );
}

/** Under the screen: what is on, how far along it is, and what comes next. */
function NowBar({ onGuide }: { onGuide(): void }) {
  const hall = useHall();
  const now = useNow(15_000);
  const current = hall.current;
  const item = isHallItem(current) ? current : null;
  const info = knownItem(item?.media.ref);
  const guides = useGuides(hall.hallId, item?.media.live ? [item.media.ref] : []);
  // Films and series show their poster and credits; episodes may have none.
  const details = useBridgeRead<CinemaDetails>(
    item && !item.media.live ? `${hall.hallId}:details:${item.media.ref}` : null,
    (bridge) => bridge.details(hall.hallId, item!.media.ref),
  );
  const viewers = hall.room?.participants ?? [];
  // The welcome on the screen already says what to do.
  if (!current) return <div className="hall-nowbar idle" aria-hidden="true" />;
  const list = item ? guides[item.media.ref] : undefined;
  const onAir = item?.media.live ? programmeAt(list, now) : null;
  const next = item?.media.live ? programmeAfter(list, now) : null;
  const upNext = hall.upcoming[0];
  const canEnd = hall.connected && endsActivity(hall.primary, hall.me, hall.roleControl);
  return (
    <div className="hall-nowbar">
      {item ? (
        <CinemaArt
          hallId={hall.hallId}
          art={item.media.art ?? info?.art ?? details.data?.item.art}
          title={item.media.title}
          shape={item.media.live ? 'logo' : 'poster'}
          className="hall-nowbar-art"
        />
      ) : (
        <span className="hall-art logo">
          <span className="hall-art-fallback">YT</span>
        </span>
      )}
      <div className="hall-nowbar-text">
        <div className="hall-nowbar-title">
          {info?.number != null && (
            <span className="hall-channel-number inline">{info.number}</span>
          )}
          <h2>{current.media.title}</h2>
          {info && <QualityBadges badges={info.badges} max={2} />}
        </div>
        {onAir ? (
          <>
            <p>
              <strong>{onAir.title}</strong>
              <span>
                {timeRange(onAir)} · {minutesLabel(onAir.stop - now)} kaldı
              </span>
            </p>
            <span
              className="hall-progress"
              style={{ '--progress': programmeProgress(onAir, now) } as CSSProperties}
            />
          </>
        ) : (
          <p>
            <span>
              {item?.media.live
                ? 'Canlı yayın'
                : current.media.kind === 'youtube'
                  ? `YouTube · ${hall.nameOf(current.addedBy)} açtı`
                  : [
                      details.data?.item.year,
                      details.data?.genre,
                      details.data?.durationSec
                        ? minutesLabel(details.data.durationSec * 1000)
                        : null,
                      `${hall.nameOf(current.addedBy)} açtı`,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
            </span>
          </p>
        )}
      </div>
      <div className="hall-nowbar-side">
        {next ? (
          <button className="hall-next" onClick={onGuide} title="Rehberi aç">
            <small>Sıradaki · {hhmm(next.start)}</small>
            <span>{next.title}</span>
          </button>
        ) : upNext ? (
          <div className="hall-next">
            <small>Sırada</small>
            <span>{upNext.media.title}</span>
          </div>
        ) : null}
        {viewers.length > 0 && (
          <span className="hall-viewers" title={viewers.map((p) => p.displayName).join(', ')}>
            {viewers.slice(0, 3).map((person) => (
              <VoiceAvatar key={person.userId} id={person.userId} name={person.displayName} />
            ))}
            {viewers.length > 3 && <small>+{viewers.length - 3}</small>}
          </span>
        )}
        {canEnd && (
          <button
            className="hall-text-button quiet"
            onClick={() => hall.run({ type: 'end' })}
            title="Yayını herkes için kapatır"
          >
            Salonu kapat
          </button>
        )}
      </div>
    </div>
  );
}

/** Shown on the big screen when nothing plays: what is on now, one click away. */
function Welcome({ onBrowse, onOpen }: { onBrowse(view: View): void; onOpen(): void }) {
  const hall = useHall();
  const connected = hall.status.connected;
  const channels = useItems(hall.hallId, 'live', null, 'default', 500);
  const now = useNow();
  const candidates = useMemo(
    () => (channels.data?.items ?? []).filter((item) => item.hasGuide).slice(0, 12),
    [channels.data],
  );
  const guides = useGuides(
    hall.hallId,
    candidates.map((item) => item.ref),
  );
  const picks = candidates.filter((item) => programmeAt(guides[item.ref], now)).slice(0, 6);
  return (
    <div className="hall-welcome">
      <span className="hall-welcome-mark">
        <Popcorn size={26} />
      </span>
      <h2>Bu akşam ne izliyoruz?</h2>
      <p>
        {connected
          ? 'Açtığın şey salondaki herkes için aynı anda oynar.'
          : hall.status.isOwner
            ? 'Sunucunun IPTV hesabını bağlayınca kanallar ve filmler burada olacak. YouTube şimdiden açılabilir.'
            : 'Sahip henüz bir kaynak bağlamadı. Şimdilik YouTube açabilirsin.'}
      </p>
      <div className="hall-welcome-actions">
        <button className="button primary" onClick={onOpen}>
          <Search size={16} />
          Aç…
          <kbd>⌘K</kbd>
        </button>
        {connected ? (
          <>
            <button className="button secondary" onClick={() => onBrowse('live')}>
              <Tv size={16} />
              Canlı TV
            </button>
            <button className="button secondary" onClick={() => onBrowse('movies')}>
              <Film size={16} />
              Filmler
            </button>
          </>
        ) : (
          <button className="button secondary" onClick={() => onBrowse('youtube')}>
            YouTube
          </button>
        )}
      </div>
      {connected && picks.length > 0 && (
        <section className="hall-welcome-now" aria-label="Şu an yayında">
          <span className="hall-eyebrow live">Şu an yayında</span>
          <div>
            {picks.map((item) => {
              const onAir = programmeAt(guides[item.ref], now)!;
              return (
                <button
                  key={item.ref}
                  className="hall-now-card"
                  onClick={() => void hall.openItem(item)}
                >
                  <CinemaArt hallId={hall.hallId} art={item.art} title={item.title} />
                  <span>
                    <strong>{item.title}</strong>
                    <small>{onAir.title}</small>
                    <span
                      className="hall-progress"
                      style={{ '--progress': programmeProgress(onAir, now) } as CSSProperties}
                    />
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

function NotConnected() {
  const hall = useHall();
  const navigate = useNavigate();
  return (
    <HallMessage
      icon={<Plug size={28} />}
      title={hall.status.isOwner ? 'Sunucu IPTV’sini bağla' : 'Sahip henüz bir kaynak bağlamadı'}
      detail={
        hall.status.isOwner
          ? 'Hesap sunucuda kalır, şifre hiçbir üyeye gitmez. Bağladığında kanallar, rehber, filmler ve diziler burada görünür.'
          : 'Topluluk sahibi sunucunun IPTV hesabını bağladığında kanallar ve filmler burada olacak.'
      }
      action={
        hall.status.isOwner ? (
          <button className="button primary" onClick={() => navigate('/settings?tab=cinema')}>
            <Settings2 size={16} />
            Bağlantıyı kur
          </button>
        ) : undefined
      }
    />
  );
}

function HallMessage({
  icon,
  title,
  detail,
  action,
}: {
  icon: ReactNode;
  title: string;
  detail: string;
  action?: ReactNode;
}) {
  return (
    <div className="hall-message">
      <span className="hall-message-icon">{icon}</span>
      <h2>{title}</h2>
      <p>{detail}</p>
      {action}
    </div>
  );
}

function HallSkeleton() {
  return (
    <div className="hall" role="status" aria-label="Sinema yükleniyor">
      <header className="hall-bar">
        <span className="hall-skeleton line" style={{ width: 360 }} />
      </header>
      <div className="hall-body">
        <div className="hall-main">
          <div className="hall-theater">
            <span className="hall-skeleton screen" />
          </div>
        </div>
      </div>
    </div>
  );
}
