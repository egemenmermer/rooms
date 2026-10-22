import { SoundboardButton } from './Soundboard';
import { CinemaReminders } from './cinema/CinemaReminders';
import { useState, type DragEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  HeadphoneOff,
  Headphones,
  Mic,
  MicOff,
  PhoneOff,
  Settings,
  Plus,
  Hash,
  Volume2,
  Search,
  Video,
  MonitorUp,
  Gamepad2,
  PartyPopper,
  Film,
  VolumeX,
} from 'lucide-react';
import { IconButton, Modal } from '@rooms/design';
import { useCommunity } from './community';
import {
  useRealtime,
  joinVoice,
  leaveVoice,
  toggleMic,
  toggleDeafen,
  toggleCamera,
  startRoomAudio,
  stopScreen,
} from './realtime';
import { silencedHere } from './participant-audio';
import { useActivityRoom } from './activity';
import { openActivity, retiredActivity } from './activity-route';
import { useVoiceDirectory } from './voice-directory';
import { VoiceAvatar } from './VoiceAvatar';
import { QuietMenu } from './QuietMenu';
import { ChannelTools } from './ChannelTools';
import { UserProfileDialog } from './SocialSurfaces';
import type { SocialUser } from '@rooms/social';
import { uiError } from './i18n';
import { UpdateNotice } from './UpdateNotice';
import { HallBackground } from './cinema/HallBackground';
import { HallSidebarRow } from './cinema/HallSidebarRow';
import { useCommunityCinema } from './cinema/cinema-status';
import {
  VOICE_MEMBER_DRAG,
  VoiceMemberMenu,
  moveVoiceMember,
  useModerationRights,
  type VoiceMemberTarget,
} from './VoiceModeration';
/** A running activity in the joined room, one click from the room list. */
function RoomActivityRow({
  roomId,
  onOpen,
}: {
  roomId: string;
  onOpen(kind: Parameters<typeof openActivity>[0]): void;
}) {
  const activity = useActivityRoom(roomId),
    me = useCommunity((s) => s.user?.id);
  const room = activity.status === 'connected' ? activity.room : null;
  const primary = room?.primary;
  if (!room || !primary) return null;
  const joined = room.participants.some((p) => p.userId === me);
  const count = room.participants.length;
  // An old-cinema session has no page here; the click opens the launcher that explains it.
  const action = retiredActivity(primary.activity) ? 'Eski Sinema' : joined ? 'Aç' : 'Katıl';
  return (
    <button
      className="minimal-activity"
      title={`${primary.title} · ${count} kişi`}
      aria-label={`${primary.title} sürüyor, ${count} kişi. ${action}`}
      onClick={() => onOpen(primary.activity)}
    >
      {['cinema', 'youtube', 'screen'].includes(primary.activity) ? (
        <Film size={13} />
      ) : (
        <Gamepad2 size={13} />
      )}
      <span>{primary.title}</span>
      <small>{action}</small>
    </button>
  );
}
export function MinimalSidebar({
  notify,
  invite,
  createSpace,
  search,
  help,
}: {
  notify(message: string): void;
  invite(): void;
  createSpace(): void;
  /** Kept for callers; server settings now open the settings page. */
  editSpace?(): void;
  search(): void;
  help(): void;
}) {
  const c = useCommunity(),
    r = useRealtime(),
    navigate = useNavigate(),
    location = useLocation();

  const [person, setPerson] = useState<SocialUser | null>(null);
  const [memberMenu, setMemberMenu] = useState<
      (VoiceMemberTarget & { x: number; y: number }) | null
    >(null),
    [dropRoom, setDropRoom] = useState<string | null>(null);
  const rights = useModerationRights(c.activeSpaceId);
  const moderates = rights.moveMembers || rights.kickMembers || rights.banMembers;
  const dragged = (event: DragEvent) => {
    try {
      const value = JSON.parse(event.dataTransfer.getData(VOICE_MEMBER_DRAG)) as VoiceMemberTarget;
      return typeof value?.id === 'string' && typeof value.from === 'string' ? value : null;
    } catch {
      return null;
    }
  };
  // The cinema hall is a channel too, but it lives in its own "Sinema" row.
  const hallId = useCommunityCinema().hallId;
  const space = c.spaces.find((s) => s.id === c.activeSpaceId),
    voices = c.channels.filter((ch) => ch.type === 2 && ch.id !== hallId);
  const directory = useVoiceDirectory(voices.map((ch) => ch.id));
  const run = (task: Promise<unknown>) => void task.catch((e) => notify(uiError(e)));
  const enter = (id: string, name: string) => {
    navigate('/voice');
    run(c.openChannel(id));
    run(joinVoice(id, name));
  };
  return (
    <ChannelTools>
      <aside id="rooms-navigation" className="minimal-sidebar" aria-label="Odalar ve gezinme">
        <header>
          <QuietMenu label={space?.name ?? 'Tayfa'}>
            {c.spaces.map((s) => (
              <button
                key={s.id}
                onClick={() => {
                  navigate('/chat');
                  run(c.openSpace(s.id));
                }}
              >
                {s.name}
                {s.id === space?.id ? ' ✓' : ''}
              </button>
            ))}
            <hr />
            <button onClick={createSpace}>Topluluk oluştur</button>
            <button onClick={invite}>Davet oluştur</button>
            <button disabled={!space} onClick={() => navigate('/settings?tab=server-profile')}>
              Sunucu ayarları
            </button>
            <button onClick={() => navigate('/friends')}>Arkadaşlar</button>
            <button onClick={() => navigate('/notifications')}>Bildirimler</button>
            <button onClick={() => navigate('/files')}>Dosyalar</button>
            <button onClick={() => navigate('/media')}>Medyam</button>
            <button onClick={() => navigate('/agent?tab=schedules')}>Planlanan görevler</button>
            <button onClick={help}>Klavye kısayolları</button>
          </QuietMenu>
          <IconButton label="Ara" onClick={search}>
            <Search size={17} />
          </IconButton>
        </header>
        <div className="minimal-room-list">
          <button
            className={`minimal-nav ${location.pathname === '/messages' ? 'selected' : ''}`}
            onClick={() => navigate('/messages')}
          >
            Mesajlar
            {Object.keys(c.unread).some(
              (id) => c.dms.some((dm) => dm.id === id) && c.unread[id],
            ) && <i className="nav-dot" />}
          </button>
          <HallSidebarRow
            selected={location.pathname === '/cinema'}
            onOpen={() => navigate('/cinema')}
          />
          <div className="minimal-section" data-channel-type="text" tabIndex={0}>
            Sohbetler
            <button
              data-create-type="text"
              aria-label="Sohbet kanalı oluştur"
              disabled={!c.activeSpaceId}
              title={!c.activeSpaceId ? 'Önce topluluk seç.' : undefined}
            >
              <Plus size={14} />
            </button>
          </div>
          {c.channels
            .filter((ch) => ch.type === 0 && ch.id !== hallId)
            .map((ch) => (
              <button
                data-channel-id={ch.id}
                key={ch.id}
                className={`minimal-nav ${c.activeChannelId === ch.id && location.pathname === '/chat' ? 'selected' : ''}`}
                onClick={() => {
                  navigate('/chat');
                  run(c.openChannel(ch.id));
                }}
              >
                <Hash size={15} />
                <span>{ch.name}</span>
                {c.unread[ch.id] && <i className="nav-dot" />}
              </button>
            ))}
          <div className="minimal-section" data-channel-type="voice" tabIndex={0}>
            Odalar
            <button
              data-create-type="voice"
              aria-label="Ses odası oluştur"
              disabled={!c.activeSpaceId}
              title={!c.activeSpaceId ? 'Önce topluluk seç.' : undefined}
            >
              <Plus size={14} />
            </button>
          </div>
          {voices.map((ch) => {
            const occupants =
              r.channelId === ch.id && r.status === 'connected'
                ? r.participants
                : (directory.rooms.find((room) => room.channelId === ch.id)?.participants ?? []);
            return (
              <div
                key={ch.id}
                className={dropRoom === ch.id ? 'voice-drop-target' : undefined}
                onDragOver={(event) => {
                  if (!rights.moveMembers || !event.dataTransfer.types.includes(VOICE_MEMBER_DRAG))
                    return;
                  event.preventDefault();
                  event.dataTransfer.dropEffect = 'move';
                  setDropRoom(ch.id);
                }}
                onDragLeave={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget as Node | null))
                    setDropRoom((current) => (current === ch.id ? null : current));
                }}
                onDrop={(event) => {
                  setDropRoom(null);
                  const target = dragged(event);
                  if (!target || target.from === ch.id) return;
                  event.preventDefault();
                  void moveVoiceMember(target, ch.id)
                    .then(() => notify(`${target.name}, ${ch.name} odasına taşındı.`))
                    .catch((e) => notify(uiError(e)));
                }}
              >
                <button
                  data-channel-id={ch.id}
                  className={`minimal-nav ${(r.channelId === ch.id || c.activeChannelId === ch.id) && location.pathname === '/voice' ? 'selected' : ''}`}
                  onClick={() => enter(ch.id, ch.name)}
                >
                  <Volume2 size={15} />
                  <span>{ch.name}</span>
                  {r.channelId === ch.id && r.status === 'connected' && (
                    <i className="room-connected-dot" />
                  )}
                </button>
                {occupants.map((p) => {
                  const silenced = 'volume' in p && silencedHere(p);
                  return (
                    <button
                      data-voice-participant-id={p.id}
                      key={p.id}
                      className={`minimal-occupant ${'speaking' in p && p.speaking && !p.muted && !silenced ? 'speaking' : ''}`}
                      onClick={() =>
                        setPerson({ id: p.id, username: p.name, displayName: p.name, avatar: null })
                      }
                      draggable={rights.moveMembers && p.id !== c.user?.id}
                      onDragStart={(event) => {
                        event.dataTransfer.effectAllowed = 'move';
                        event.dataTransfer.setData(
                          VOICE_MEMBER_DRAG,
                          JSON.stringify({ id: p.id, name: p.name, from: ch.id }),
                        );
                      }}
                      onDragEnd={() => setDropRoom(null)}
                      // Without moderation rights the shared volume menu opens on its own.
                      // With them, the member menu carries that volume too.
                      onContextMenu={(event) => {
                        if (!moderates || p.id === c.user?.id) return;
                        event.preventDefault();
                        event.stopPropagation();
                        setMemberMenu({
                          id: p.id,
                          name: p.name,
                          from: ch.id,
                          x: event.clientX,
                          y: event.clientY,
                        });
                      }}
                      onKeyDown={(event) => {
                        if (
                          !moderates ||
                          p.id === c.user?.id ||
                          (event.key !== 'ContextMenu' && !(event.key === 'F10' && event.shiftKey))
                        )
                          return;
                        event.preventDefault();
                        event.stopPropagation();
                        const rect = event.currentTarget.getBoundingClientRect();
                        setMemberMenu({
                          id: p.id,
                          name: p.name,
                          from: ch.id,
                          x: rect.left,
                          y: rect.bottom,
                        });
                      }}
                    >
                      <VoiceAvatar id={p.id} name={p.name} />
                      <span>{p.name}</span>
                      {'screen' in p && p.screen === true && (
                        <MonitorUp size={13} aria-label="Ekran paylaşıyor" />
                      )}
                      {silenced && (
                        <VolumeX size={12} aria-label="Sesini kapattın, yalnızca sende" />
                      )}
                      {/* Deafened people are also muted: show both, like Discord. */}
                      {(p.muted || ('deafened' in p && p.deafened)) && (
                        <MicOff size={12} aria-label="Mikrofon kapalı" />
                      )}
                      {'deafened' in p && p.deafened && (
                        <HeadphoneOff size={12} aria-label="Sağırlaştırdı" />
                      )}
                    </button>
                  );
                })}
                {r.channelId === ch.id && r.status === 'connected' && (
                  <RoomActivityRow roomId={ch.id} onOpen={(kind) => openActivity(kind, navigate)} />
                )}
                {!(r.channelId === ch.id && r.status === 'connected') &&
                  (directory.error ||
                    directory.loading ||
                    !directory.rooms.some((room) => room.channelId === ch.id)) && (
                    <small className="occupancy-unavailable">
                      {directory.loading ? 'Üyeler yükleniyor…' : 'Üyeler alınamadı'}
                    </small>
                  )}
              </div>
            );
          })}
          {!c.channels.length && (
            <p className="muted">{c.loadingMessages ? 'Odalar yükleniyor…' : 'Oda yok.'}</p>
          )}
        </div>
        <div className="minimal-self">
          {(r.channelId || r.busy || r.error) && (
            <div className="minimal-voice-status" role="status">
              <span>
                <strong>
                  {r.busy || r.status === 'connecting'
                    ? 'Bağlanıyor…'
                    : r.status === 'connected'
                      ? 'Ses bağlı'
                      : r.status === 'reconnecting'
                        ? 'Yeniden bağlanıyor…'
                        : 'Ses bağlı değil'}
                </strong>
                <small>{r.roomName}</small>
              </span>
              <QuietMenu label="Ses işlemleri" compact>
                <button
                  disabled={r.status !== 'connected'}
                  onClick={() => {
                    run(
                      toggleCamera().then(() => {
                        if (!r.camera) {
                          if (r.channelId) run(c.openChannel(r.channelId));
                          navigate('/voice?view=video');
                        }
                      }),
                    );
                  }}
                >
                  {r.camera ? 'Kamerayı kapat' : 'Kamerayı aç'}
                </button>
                <button
                  disabled={r.status !== 'connected'}
                  onClick={() => window.dispatchEvent(new Event('rooms:choose-capture'))}
                >
                  Ekran paylaş
                </button>
                {r.sharing && <button onClick={() => run(stopScreen())}>Paylaşımı durdur</button>}
                <button onClick={() => window.dispatchEvent(new Event('rooms:open-soundboard'))}>
                  Soundboard
                </button>
                <button onClick={() => navigate('/settings?tab=audio')}>Ses ayarları</button>
              </QuietMenu>
            </div>
          )}
          {r.channelId && (
            <div className="sidebar-media-actions">
              <button
                disabled={r.status !== 'connected' || r.busy}
                aria-label={r.camera ? 'Kamerayı kapat' : 'Kamerayı aç'}
                onClick={() => run(toggleCamera().then(() => navigate('/voice')))}
              >
                <Video size={17} />
              </button>
              <button
                disabled={r.status !== 'connected' || r.busy}
                aria-label={r.sharing ? 'Paylaşımı durdur' : 'Ekran paylaş'}
                onClick={() =>
                  r.sharing
                    ? run(stopScreen())
                    : window.dispatchEvent(new Event('rooms:choose-capture'))
                }
              >
                <MonitorUp size={17} />
              </button>
              <button
                aria-label="Etkinlikler"
                onClick={() => window.dispatchEvent(new Event('rooms:open-activity-launcher'))}
              >
                <Gamepad2 size={17} />
              </button>
              <button
                aria-label="Soundboard"
                onClick={() => window.dispatchEvent(new Event('rooms:open-soundboard'))}
              >
                <PartyPopper size={17} />
              </button>
            </div>
          )}
          {r.error && (
            <div className="minimal-voice-error">
              <span>{r.error}</span>
              {r.channelId && (
                <button onClick={() => run(joinVoice(r.channelId!, r.roomName ?? 'Oda'))}>
                  Yeniden dene
                </button>
              )}
            </div>
          )}
          {r.audioBlocked && (
            <button className="text-button" onClick={() => run(startRoomAudio())}>
              Oda sesini aç
            </button>
          )}
          <div className="minimal-self-row">
            <button className="minimal-profile" onClick={() => navigate('/settings?tab=profile')}>
              {c.user && <VoiceAvatar id={c.user.id} name={c.user.displayName} />}
              <span>{c.user?.displayName ?? 'Profil'}</span>
            </button>
            <UpdateNotice />
            <IconButton label="Ayarlar" onClick={() => navigate('/settings')}>
              <Settings size={17} />
            </IconButton>
          </div>
          {(r.channelId || r.busy) && (
            <div className="minimal-voice-controls">
              <IconButton
                label={r.muted ? 'Mikrofonu aç' : 'Mikrofonu kapat'}
                // While reconnecting the microphone can still be muted (not unmuted).
                disabled={
                  (r.status !== 'connected' && !(r.status === 'reconnecting' && !r.muted)) || r.busy
                }
                onClick={() => run(toggleMic())}
              >
                {r.muted ? <MicOff size={17} /> : <Mic size={17} />}
              </IconButton>
              <IconButton
                label={r.deafened ? 'Sesi aç' : 'Sağırlaştır'}
                aria-pressed={r.deafened}
                className={r.deafened ? 'muted-control' : ''}
                disabled={r.status !== 'connected' || r.busy}
                onClick={() => run(toggleDeafen())}
              >
                {r.deafened ? <HeadphoneOff size={17} /> : <Headphones size={17} />}
              </IconButton>
              <IconButton label="Sesten ayrıl" onClick={() => run(leaveVoice())}>
                <PhoneOff size={17} />
              </IconButton>
            </div>
          )}
        </div>
      </aside>
      <SoundboardButton showTrigger={false} />
      {/* Like the soundboard, the corner cinema outlives page changes (e.g. joining voice). */}
      <HallBackground notify={notify} />
      <CinemaReminders />
      {memberMenu && (
        <VoiceMemberMenu
          target={memberMenu}
          x={memberMenu.x}
          y={memberMenu.y}
          rooms={voices}
          rights={rights}
          notify={notify}
          onProfile={() =>
            setPerson({
              id: memberMenu.id,
              username: memberMenu.name,
              displayName: memberMenu.name,
              avatar: null,
            })
          }
          onClose={() => setMemberMenu(null)}
        />
      )}
      {person && (
        <UserProfileDialog
          key={`${c.serverUrl}:${c.user?.id}:${person.id}`}
          user={person}
          onClose={() => setPerson(null)}
        />
      )}
    </ChannelTools>
  );
}
