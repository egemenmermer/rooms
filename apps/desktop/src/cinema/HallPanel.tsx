import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Crown,
  Film,
  Gamepad2,
  Lock,
  MessageSquare,
  MonitorPlay,
  MoreHorizontal,
  Play,
  Trash2,
  Tv,
  UserRoundCheck,
  UserRoundX,
  Users,
  X,
} from 'lucide-react';
import type { QueueItem, SessionControlMode } from '../../../../packages/activity-protocol/src';
import { useCommunity } from '../community';
import { CommunityChat } from '../RealSocial';
import { VoiceAvatar } from '../VoiceAvatar';
import { youtubeThumbnail } from '../cinema-youtube';
import { cinemaArt } from './cinema-bridge';
import { didThis, paletteShortcut } from './hall-model';
import { useHall } from './use-hall';

export type PanelTab = 'chat' | 'queue' | 'people';

/** The hall's side panel: its channel chat, the shared queue and who is watching. */
export function HallPanel({
  tab,
  onTab,
  onClose,
  notify,
}: {
  tab: PanelTab;
  onTab(tab: PanelTab): void;
  onClose(): void;
  notify(message: string): void;
}) {
  const hall = useHall();
  const queueCount = hall.room?.queue.length ?? 0;
  const people = hall.room?.participants.length ?? 0;
  const tabs: { id: PanelTab; label: string; count?: number }[] = [
    { id: 'chat', label: 'Sohbet' },
    { id: 'queue', label: 'Sıra', count: queueCount },
    { id: 'people', label: 'İzleyenler', count: people },
  ];
  return (
    <aside className="hall-panel" aria-label="Salon paneli">
      <header className="hall-panel-head">
        <div className="hall-panel-tabs" role="tablist" aria-label="Salon paneli">
          {tabs.map((value) => (
            <button
              key={value.id}
              role="tab"
              aria-selected={tab === value.id}
              className={tab === value.id ? 'selected' : ''}
              onClick={() => onTab(value.id)}
            >
              {value.label}
              {!!value.count && <small>{value.count}</small>}
            </button>
          ))}
        </div>
        <button className="hall-icon-button" aria-label="Paneli kapat (C)" onClick={onClose}>
          <X size={16} />
        </button>
      </header>
      <div className="hall-panel-body">
        {tab === 'chat' && <HallChat notify={notify} />}
        {tab === 'queue' && <HallQueue />}
        {tab === 'people' && <HallPeople />}
      </div>
    </aside>
  );
}

/** The hall is a real channel: its messages stay after the show. */
function HallChat({ notify }: { notify(message: string): void }) {
  const hall = useHall();
  const active = useCommunity((s) => s.activeChannelId);
  const openChannel = useCommunity((s) => s.openChannel);
  const [failed, setFailed] = useState(false);
  // Showing the hall chat borrows the app-wide active channel; give it back afterwards
  // unless the member picked another channel meanwhile.
  const previous = useRef(active === hall.hallId ? null : active);
  useEffect(() => {
    const hallId = hall.hallId;
    return () => {
      const state = useCommunity.getState();
      if (previous.current && state.activeChannelId === hallId)
        void state.openChannel(previous.current).catch(() => {});
    };
  }, [hall.hallId]);
  useEffect(() => {
    if (active === hall.hallId) return;
    setFailed(false);
    void openChannel(hall.hallId).catch(() => setFailed(true));
  }, [active, hall.hallId, openChannel]);
  if (failed)
    return (
      <div className="hall-panel-empty">
        <MessageSquare size={22} />
        <p>Salon sohbeti açılamadı.</p>
        <button
          className="button secondary small"
          onClick={() => void openChannel(hall.hallId, true)}
        >
          Yeniden dene
        </button>
      </div>
    );
  if (active !== hall.hallId)
    return (
      <div className="hall-panel-empty" role="status">
        <span className="hall-spinner" />
        <p>Sohbet açılıyor…</p>
      </div>
    );
  return (
    <div className="hall-chat">
      <CommunityChat notify={notify} composerPlaceholder="Mesaj yaz" />
    </div>
  );
}

function mediaIcon(item: QueueItem) {
  if (item.media.kind === 'youtube') return <MonitorPlay size={14} />;
  if (item.media.kind === 'community-media')
    return item.media.live ? <Tv size={14} /> : <Film size={14} />;
  return <Film size={14} />;
}

function QueueThumb({ item }: { item: QueueItem }) {
  const hall = useHall();
  const src =
    item.media.kind === 'youtube'
      ? youtubeThumbnail(item.media.videoId)
      : item.media.kind === 'community-media'
        ? cinemaArt(hall.hallId, item.media.art)
        : null;
  return (
    <span className="hall-queue-thumb">
      {src ? <img src={src} alt="" loading="lazy" draggable={false} /> : mediaIcon(item)}
    </span>
  );
}

function HallQueue() {
  const hall = useHall();
  const queue = hall.room?.queue ?? [];
  const current = hall.current;
  const currentIndex = queue.findIndex((item) => item.id === current?.id);
  const move = (index: number, direction: number) => {
    const ids = queue.map((item) => item.id),
      other = index + direction;
    if (
      other < 0 ||
      other >= ids.length ||
      ids[index] === current?.id ||
      ids[other] === current?.id
    )
      return;
    [ids[index], ids[other]] = [ids[other]!, ids[index]!];
    hall.run({ type: 'queue.reorder', itemIds: ids });
  };
  if (!queue.length)
    return (
      <div className="hall-panel-empty">
        <Film size={22} />
        <p>Sıra boş. {paletteShortcut} ile bir kanal, film ya da YouTube videosu ekle.</p>
      </div>
    );
  return (
    <ol className="hall-queue">
      {queue.map((item, index) => {
        const playing = item.id === current?.id;
        const watched = currentIndex >= 0 && index < currentIndex;
        const own = item.addedBy === hall.me;
        return (
          <li key={item.id} className={`${playing ? 'playing' : ''} ${watched ? 'watched' : ''}`}>
            <button
              className="hall-queue-open"
              disabled={playing || !hall.canDirect}
              title={playing ? 'Şu an oynuyor' : hall.canDirect ? 'Şimdi aç' : hall.directReason}
              onClick={() => hall.run({ type: 'queue.select', itemId: item.id, play: true })}
            >
              <QueueThumb item={item} />
              <span className="hall-queue-text">
                <strong>{item.media.title}</strong>
                <small>
                  {playing ? (
                    <span className="hall-now-label">
                      {item.media.kind === 'community-media' && item.media.live && (
                        <i className="hall-live-dot" />
                      )}
                      Şimdi oynuyor
                    </span>
                  ) : (
                    didThis(hall.nameOf(item.addedBy), 'ekledi')
                  )}
                </small>
              </span>
              {!playing && hall.canDirect && <Play size={14} className="hall-queue-play" />}
            </button>
            {!playing && (
              <span className="hall-queue-tools">
                {hall.canDirect && (
                  <>
                    <button
                      aria-label="Yukarı taşı"
                      disabled={index === 0 || index - 1 === currentIndex}
                      onClick={() => move(index, -1)}
                    >
                      <ArrowUp size={13} />
                    </button>
                    <button
                      aria-label="Aşağı taşı"
                      disabled={index === queue.length - 1}
                      onClick={() => move(index, 1)}
                    >
                      <ArrowDown size={13} />
                    </button>
                  </>
                )}
                {(own || hall.canDirect) && (
                  <button
                    aria-label="Sıradan kaldır"
                    onClick={() => hall.run({ type: 'queue.remove', itemId: item.id })}
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

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

function HallPeople() {
  const hall = useHall();
  const primary = hall.primary;
  const mode: SessionControlMode = primary?.controlMode ?? 'everyone';
  const controllers = primary?.controllers ?? [];
  const [menu, setMenu] = useState<string | null>(null);
  const close = useCallback(() => setMenu(null), []);
  const ref = useDismiss(menu !== null, close);
  const people = hall.room?.participants ?? [];
  if (!primary || !people.length)
    return (
      <div className="hall-panel-empty">
        <Users size={22} />
        <p>Salonda şu an kimse yok. Bir şey açtığında burada görünürler.</p>
      </div>
    );
  return (
    <div className="hall-people" ref={ref}>
      <div className="hall-control-mode" role="radiogroup" aria-label="Kumanda">
        {(
          [
            { value: 'everyone', label: 'Herkes yönetir', icon: <Users size={14} /> },
            { value: 'host', label: 'Ev sahibi yönetir', icon: <Lock size={14} /> },
          ] as const
        ).map((option) => (
          <button
            key={option.value}
            role="radio"
            aria-checked={mode === option.value}
            className={mode === option.value ? 'selected' : ''}
            disabled={!hall.isHost}
            title={hall.isHost ? undefined : 'Kumanda ayarını yalnızca ev sahibi değiştirir.'}
            onClick={() =>
              mode !== option.value && hall.run({ type: 'session.control', mode: option.value })
            }
          >
            {option.icon}
            {option.label}
          </button>
        ))}
      </div>
      <p className="hall-people-note">
        {mode === 'host'
          ? 'Oynatmayı ev sahibi ve kumanda verdikleri yönetir. Diğerleri sıraya öneri ekler.'
          : 'Salondaki herkes kanal değiştirebilir, oynatıp durdurabilir.'}
      </p>
      <ul>
        {people.map((person) => {
          const host = primary.hostUserId === person.userId;
          const remote = !host && mode === 'host' && controllers.includes(person.userId);
          const manageable = hall.isHost && person.userId !== hall.me;
          return (
            <li key={person.userId}>
              <span className="hall-person-avatar">
                <VoiceAvatar id={person.userId} name={person.displayName} />
              </span>
              <span className="hall-person-text">
                <strong>
                  {person.userId === hall.me ? `${person.displayName} (sen)` : person.displayName}
                </strong>
                <small>
                  {host ? (
                    <>
                      <Crown size={11} /> Ev sahibi
                    </>
                  ) : remote ? (
                    <>
                      <Gamepad2 size={11} /> Kumandası var
                    </>
                  ) : (
                    'İzliyor'
                  )}
                </small>
              </span>
              {manageable && (
                <span className="hall-person-menu">
                  <button
                    className="hall-icon-button"
                    aria-label={`${person.displayName} için seçenekler`}
                    aria-haspopup="menu"
                    aria-expanded={menu === person.userId}
                    onClick={() => setMenu(menu === person.userId ? null : person.userId)}
                  >
                    <MoreHorizontal size={16} />
                  </button>
                  {menu === person.userId && (
                    <div className="hall-menu" role="menu">
                      {mode === 'host' && (
                        <button
                          role="menuitem"
                          onClick={() => {
                            close();
                            hall.run({
                              type: 'session.permit',
                              userId: person.userId,
                              allowed: !remote,
                            });
                          }}
                        >
                          {remote ? <UserRoundX size={15} /> : <UserRoundCheck size={15} />}
                          {remote ? 'Kumandayı geri al' : 'Kumandayı ver'}
                        </button>
                      )}
                      <button
                        role="menuitem"
                        disabled={!person.canControl}
                        title={
                          person.canControl ? undefined : 'Bu kişinin salonda yönetme izni yok.'
                        }
                        onClick={() => {
                          close();
                          hall.run({ type: 'session.host', userId: person.userId });
                        }}
                      >
                        <Crown size={15} />
                        Ev sahipliğini devret
                      </button>
                    </div>
                  )}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
