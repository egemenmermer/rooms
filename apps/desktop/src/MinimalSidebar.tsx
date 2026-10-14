import { SoundboardButton } from './Soundboard';
import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Headphones,
  Mic,
  MicOff,
  PhoneOff,
  Settings,
  Hash,
  Volume2,
  Search,
  Video,
  MonitorUp,
  Gamepad2,
  PartyPopper,
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
import { useVoiceDirectory } from './voice-directory';
import { VoiceAvatar } from './VoiceAvatar';
import { QuietMenu } from './QuietMenu';
import { ChannelTools } from './ChannelTools';
import { UserProfileDialog } from './SocialSurfaces';
import type { SocialUser } from '@rooms/social';
import { uiError } from './i18n';
export function MinimalSidebar({
  notify,
  invite,
  createSpace,
  editSpace,
  search,
  help,
}: {
  notify(message: string): void;
  invite(): void;
  createSpace(): void;
  editSpace(): void;
  search(): void;
  help(): void;
}) {
  const c = useCommunity(),
    r = useRealtime(),
    navigate = useNavigate(),
    location = useLocation();

  const [person, setPerson] = useState<SocialUser | null>(null);
  const space = c.spaces.find((s) => s.id === c.activeSpaceId),
    voices = c.channels.filter((ch) => ch.type === 2);
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
          <QuietMenu label={space?.name ?? 'ROOMS'}>
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
            <button
              disabled={space?.ownerId !== c.user?.id}
              title={
                space?.ownerId !== c.user?.id
                  ? 'Yalnızca topluluk sahibi düzenleyebilir.'
                  : undefined
              }
              onClick={editSpace}
            >
              Topluluğu düzenle
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
          <div className="minimal-section" data-channel-type="text" tabIndex={0}>
            Sohbetler
          </div>
          {c.channels
            .filter((ch) => ch.type === 0)
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
          </div>
          {voices.map((ch) => {
            const occupants =
              r.channelId === ch.id && r.status === 'connected'
                ? r.participants
                : (directory.rooms.find((room) => room.channelId === ch.id)?.participants ?? []);
            return (
              <div key={ch.id}>
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
                {occupants.map((p) => (
                  <button
                    data-voice-participant-id={p.id}
                    key={p.id}
                    className={`minimal-occupant ${'speaking' in p && p.speaking && !p.muted ? 'speaking' : ''}`}
                    onClick={() =>
                      setPerson({ id: p.id, username: p.name, displayName: p.name, avatar: null })
                    }
                  >
                    <VoiceAvatar id={p.id} name={p.name} />
                    <span>{p.name}</span>
                    {'screen' in p && p.screen === true && (
                      <MonitorUp size={13} aria-label="Ekran paylaşıyor" />
                    )}
                    {p.muted && <MicOff size={12} />}
                  </button>
                ))}
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
            <IconButton label="Ayarlar" onClick={() => navigate('/settings')}>
              <Settings size={17} />
            </IconButton>
          </div>
          {(r.channelId || r.busy) && (
            <div className="minimal-voice-controls">
              <IconButton
                label={r.muted ? 'Mikrofonu aç' : 'Mikrofonu kapat'}
                disabled={r.status !== 'connected' || r.busy}
                onClick={() => run(toggleMic())}
              >
                {r.muted ? <MicOff size={17} /> : <Mic size={17} />}
              </IconButton>
              <IconButton
                label={r.deafened ? 'Sesi aç' : 'Sağırlaştır'}
                disabled={r.status !== 'connected' || r.busy}
                onClick={() => run(toggleDeafen())}
              >
                <Headphones size={17} />
              </IconButton>
              <IconButton label="Sesten ayrıl" onClick={() => run(leaveVoice())}>
                <PhoneOff size={17} />
              </IconButton>
            </div>
          )}
        </div>
      </aside>
      <SoundboardButton showTrigger={false} />
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
