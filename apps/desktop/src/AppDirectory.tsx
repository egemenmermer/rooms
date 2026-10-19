import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  BarChart3,
  Bot,
  MonitorUp,
  Music2,
  PenTool,
  Popcorn,
  Search,
  type LucideIcon,
} from 'lucide-react';
import { GameArt, gameCatalog, gameNames } from './Kiraathane';
import { openMusicDJ, openRoomActivity } from './MusicDJ';
import { useRealtime } from './realtime';
import { useCommunity } from './community';
import { useActivityRoom } from './activity';
import { activityRoute } from './Activities';
import './app-directory.css';

type Section = 'Uygulamalar' | 'Birlikte izle' | 'Kart oyunları' | 'Masa oyunları' | 'Araçlar';
interface DirectoryItem {
  id: string;
  name: string;
  detail: string;
  section: Section;
  keywords: string;
  /** Lucide icon on a tinted tile, or the drawn game pieces. */
  icon: LucideIcon | 'game';
  tint: string;
  /** Needs a joined voice room; otherwise the reason is shown. */
  voice?: boolean;
  run(open: (path: string) => void): void;
}
const games = gameCatalog.map((game): DirectoryItem => ({
  id: game.kind,
  name: gameNames[game.kind],
  detail: `${game.detail} ${game.players}.`,
  section: game.kind === '101' ? 'Masa oyunları' : 'Kart oyunları',
  keywords: `oyun masa kart kıraathane ${game.kind}`,
  icon: 'game',
  tint: '#1f4a3b',
  run: (open) => open(`/games?create=${encodeURIComponent(game.kind)}`),
}));
export const directoryItems: DirectoryItem[] = [
  {
    id: 'dj',
    name: 'DJ Recep',
    detail: 'Odaya müzik aç: YouTube, Spotify listeleri ve sıra.',
    section: 'Uygulamalar',
    keywords: 'müzik şarkı spotify youtube bot',
    icon: Music2,
    tint: '#d9467f',
    run: () => openMusicDJ(),
  },
  {
    id: 'agent',
    name: 'Asistan',
    detail: 'Soru sor, özet çıkar, görev ver.',
    section: 'Uygulamalar',
    keywords: 'claude yapay zeka ai bot',
    icon: Bot,
    tint: '#6b5bd6',
    run: (open) => open('/agent'),
  },
  {
    id: 'cinema',
    name: 'Sinema',
    detail: 'YouTube videolarını birlikte izle, sıraya ekle.',
    section: 'Birlikte izle',
    keywords: 'youtube film video izle sinema',
    icon: Popcorn,
    tint: '#c2593a',
    run: (open) => open('/cinema/room'),
  },
  {
    id: 'screen',
    name: 'Ekran paylaş',
    detail: 'Pencere, oyun ya da tarayıcı; Instagram ve diğer siteler.',
    section: 'Birlikte izle',
    keywords: 'yayın pencere stremio iptv instagram reels',
    icon: MonitorUp,
    tint: '#2f7fb8',
    voice: true,
    run: () => window.dispatchEvent(new Event('rooms:choose-capture')),
  },
  ...games,
  {
    id: 'board',
    name: 'Beyaz tahta',
    detail: 'Birlikte çiz, yaz; imleçler canlı görünür.',
    section: 'Araçlar',
    keywords: 'whiteboard çizim tahta',
    icon: PenTool,
    tint: '#2f8f6b',
    run: (open) => open('/together?tab=board'),
  },
  {
    id: 'poll',
    name: 'Anket',
    detail: 'Odaya soru sor, oyları canlı gör.',
    section: 'Araçlar',
    keywords: 'oylama anket soru',
    icon: BarChart3,
    tint: '#b98a2c',
    run: (open) => open('/together?tab=polls'),
  },
];
/** Highlight order; the first four a surface offers fill the two-by-two grid. */
const featured = ['cinema', 'holdem', '101', 'board', 'poll'];
const sections: Section[] = [
  'Uygulamalar',
  'Birlikte izle',
  'Kart oyunları',
  'Masa oyunları',
  'Araçlar',
];
const fold = (value: string) => value.toLocaleLowerCase('tr').normalize('NFD');

function Tile({ item, large = false }: { item: DirectoryItem; large?: boolean }) {
  return (
    <span
      className={`appdir-tile ${large ? 'large' : ''} ${item.icon === 'game' ? 'felt' : ''}`}
      style={{ '--tile': item.tint } as CSSProperties}
      aria-hidden="true"
    >
      {item.icon === 'game' ? (
        <GameArt kind={item.id as Parameters<typeof GameArt>[0]['kind']} />
      ) : (
        <item.icon size={large ? 40 : 20} />
      )}
    </span>
  );
}

/**
 * Discord-style catalogue of what can be opened in this room: apps, watch-together, games and
 * tools, searchable. `apps` adds the bots that also have their own buttons (DJ, Asistan).
 * `roomCinema` offers the older per-room cinema (`/cinema/room`); the header launcher leaves it
 * out because the community Sinema hall replaced it there.
 */
export function AppDirectory({
  onClose,
  apps = true,
  roomCinema = true,
  header,
}: {
  onClose(): void;
  apps?: boolean;
  roomCinema?: boolean;
  header?: ReactNode;
}) {
  const navigate = useNavigate(),
    voice = useRealtime(),
    community = useCommunity();
  const roomId = voice.channelId ?? community.activeChannelId;
  const activity = useActivityRoom(roomId);
  const primary = activity.room?.primary;
  const [query, setQuery] = useState('');
  const items = useMemo(
    () =>
      directoryItems.filter(
        (item) => (apps || item.section !== 'Uygulamalar') && (roomCinema || item.id !== 'cinema'),
      ),
    [apps, roomCinema],
  );
  const highlights = useMemo(
    () =>
      featured
        .map((id) => items.find((item) => item.id === id))
        .filter((item): item is DirectoryItem => !!item)
        .slice(0, 4),
    [items],
  );
  const matches = useMemo(() => {
    const words = fold(query.trim()).split(/\s+/).filter(Boolean);
    if (!words.length) return null;
    return items.filter((item) => {
      const text = fold(`${item.name} ${item.detail} ${item.section} ${item.keywords}`);
      return words.every((word) => text.includes(word));
    });
  }, [items, query]);
  const open = (path: string) => openRoomActivity(path, navigate);
  const launch = (item: DirectoryItem) => {
    if (item.voice && voice.status !== 'connected') return;
    item.run(open);
    onClose();
  };
  const row = (item: DirectoryItem) => {
    const blocked = item.voice && voice.status !== 'connected';
    return (
      <button
        key={item.id}
        className="appdir-row"
        disabled={blocked}
        title={blocked ? 'Önce bir ses odasına katıl.' : undefined}
        onClick={() => launch(item)}
      >
        <Tile item={item} />
        <span>
          <strong>{item.name}</strong>
          <small>{blocked ? 'Önce bir ses odasına katıl.' : item.detail}</small>
        </span>
      </button>
    );
  };
  return (
    <div className="appdir" role="dialog" aria-label="Uygulamalar ve etkinlikler">
      {header}
      <label className="appdir-search">
        <Search size={17} aria-hidden="true" />
        <input
          autoFocus
          aria-label="Uygulama ve etkinlik ara"
          placeholder="Uygulama ve etkinlik ara"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.stopPropagation();
              onClose();
            }
            if (event.key === 'Enter' && matches?.[0]) launch(matches[0]);
          }}
        />
      </label>
      <div className="appdir-scroll">
        {primary && !matches && (
          <button
            className="appdir-live"
            onClick={() => {
              open(activityRoute(primary.activity));
              onClose();
            }}
          >
            <i aria-hidden="true" />
            <span>
              <small>Şu an odada</small>
              <strong>
                {(gameNames as Record<string, string>)[primary.title] ?? primary.title}
              </strong>
            </span>
            <em>
              Katıl <ArrowRight size={14} />
            </em>
          </button>
        )}
        {matches ? (
          matches.length ? (
            <div className="appdir-list">{matches.map(row)}</div>
          ) : (
            <p className="appdir-empty">“{query.trim()}” için bir şey bulunamadı.</p>
          )
        ) : (
          <>
            <h3>Öne çıkanlar</h3>
            <div className="appdir-featured">
              {highlights.map((item) => (
                <button key={item.id} className="appdir-card" onClick={() => launch(item)}>
                  <Tile item={item} large />
                  <span>
                    <strong>{item.name}</strong>
                    <small>{item.detail}</small>
                  </span>
                </button>
              ))}
            </div>
            {sections.map((section) => {
              const list = items.filter((item) => item.section === section);
              return list.length ? (
                <section key={section}>
                  <h3>{section}</h3>
                  <div className="appdir-list">{list.map(row)}</div>
                </section>
              ) : null;
            })}
          </>
        )}
      </div>
    </div>
  );
}
