import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { IconButton } from '@rooms/design';
import { useCommunity } from './community';
import { useRealtime, leaveVoice, toggleMic, toggleDeafen } from './realtime';
import { VoiceAvatar } from './VoiceAvatar';
import { ReferenceIcon } from './ReferenceIcon';
import { preserveReferenceFixtureRoute } from './dev/fixture-navigation';
import { t, uiError } from './i18n';
import { places } from './dev/sample';
import './reference-home.css';

export function PersonalSidebar({
  path,
  notify,
  invite,
}: {
  path: string;
  notify(message: string): void;
  invite(): void;
}) {
  const c = useCommunity(),
    r = useRealtime(),
    navigate = useNavigate();
  const localVoiceFixture =
    import.meta.env.DEV && new URLSearchParams(location.search).get('fixture') === 'S12';
  const [incomingRequests, setIncomingRequests] = useState<number | null>(null),
    [unreadNotifications, setUnreadNotifications] = useState<number | null>(null),
    [fixtureDmCounts, setFixtureDmCounts] = useState<Record<string, number>>({});
  useEffect(() => {
    let active = true;
    const params = import.meta.env.DEV ? new URLSearchParams(location.search) : null;
    const fixtureId = params?.get('fixture')?.toUpperCase();
    if (fixtureId === 'S12' || fixtureId === 'S16') {
      void import('./dev/social-detail-fixture')
        .then((module) => {
          const fixture = module.getSocialDetailFixture(
            fixtureId,
            params?.get('variant') || 'default',
          );
          if (!active) return;
          setIncomingRequests(
            fixture.sidebarBadges?.friends ??
              fixture.friends.filter((friend) => friend.relationship === 'incoming').length,
          );
          setUnreadNotifications(
            fixture.sidebarBadges?.notifications ??
              (fixture.ui.surface === 'notifications'
                ? fixture.ui.items.filter((item) => item.unread).length
                : null),
          );
          setFixtureDmCounts(fixture.sidebarBadges?.dmUnread ?? {});
        })
        .catch(() => {
          if (active) {
            setIncomingRequests(null);
            setUnreadNotifications(null);
          }
        });
      return () => {
        active = false;
      };
    }
    setIncomingRequests(null);
    setUnreadNotifications(null);
    setFixtureDmCounts({});
    if (!c.user || c.status !== 'connected' || !window.rooms)
      return () => {
        active = false;
      };
    const bridge = window.rooms.social,
      userId = c.user.id,
      serverUrl = c.serverUrl;
    void bridge
      .friends()
      .then((friends) => {
        if (
          active &&
          useCommunity.getState().user?.id === userId &&
          useCommunity.getState().serverUrl === serverUrl &&
          window.rooms?.social === bridge
        )
          setIncomingRequests(
            friends.filter((friend) => friend.relationship === 'incoming').length,
          );
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [c.user?.id, c.serverUrl, c.status]);
  const run = (work: Promise<unknown>) => void work.catch((error) => notify(uiError(error)));
  const openDm = (channelId: string) => {
    if (import.meta.env.DEV && new URLSearchParams(location.search).has('fixture')) {
      const current = useCommunity.getState();
      useCommunity.setState({
        activeSpaceId: null,
        activeChannelId: channelId,
        messages: current.messages.filter((message) => message.channelId === channelId),
        loadingMessages: false,
        hasOlder: false,
        error: null,
      });
    } else run(c.openChannel(channelId));
    navigate(preserveReferenceFixtureRoute('/chat'));
  };
  return (
    <aside className="voice-channel-sidebar personal-sidebar">
      <header>
        <strong>{t('Senin alanın')}</strong>
        <IconButton
          label={t('Toplulukları aç')}
          onClick={() => navigate(preserveReferenceFixtureRoute('/spaces'))}
        >
          <ReferenceIcon name="chevron-down" size={17} />
        </IconButton>
      </header>
      <div className="personal-scroll">
        <button
          className={`room-channel ${path === '/home' ? 'selected' : ''}`}
          onClick={() => navigate(preserveReferenceFixtureRoute('/home'))}
        >
          <ReferenceIcon name="home" size={19} />
          <span>{t('Ana sayfa')}</span>
        </button>
        <button
          className={`room-channel ${path === '/friends' ? 'selected' : ''}`}
          onClick={() => navigate(preserveReferenceFixtureRoute('/friends'))}
        >
          <ReferenceIcon name="users" size={19} />
          <span>{t('Arkadaşlar')}</span>
          {incomingRequests !== null && incomingRequests > 0 && (
            <span
              className="personal-count"
              aria-label={t('{count} yeni arkadaşlık isteği', { count: incomingRequests })}
            >
              {incomingRequests}
            </span>
          )}
        </button>
        <button
          className={`room-channel ${path === '/notifications' ? 'selected' : ''}`}
          onClick={() => navigate(preserveReferenceFixtureRoute('/notifications'))}
        >
          <ReferenceIcon name="bell" size={19} />
          <span>{t('Bildirimler')}</span>
          {unreadNotifications !== null && unreadNotifications > 0 && (
            <span
              className="personal-count"
              aria-label={t('{count} okunmamış bildirim', { count: unreadNotifications })}
            >
              {unreadNotifications}
            </span>
          )}
        </button>
        <div className="section-label">
          {t('ÖZEL MESAJLAR')}
          <IconButton
            label={t('Arkadaş listesini aç')}
            onClick={() => navigate(preserveReferenceFixtureRoute('/friends'))}
          >
            <ReferenceIcon name="plus" size={14} />
          </IconButton>
        </div>
        {c.dms.map((dm) => {
          const user = dm.recipients?.find((user) => user.id !== c.user?.id),
            count = fixtureDmCounts[dm.id];
          return (
            <button
              className={`room-channel personal-dm ${c.activeChannelId === dm.id ? 'selected' : ''}`}
              key={dm.id}
              onClick={() => openDm(dm.id)}
            >
              {user ? (
                <VoiceAvatar id={user.id} name={user.displayName} />
              ) : (
                <ReferenceIcon name="message" size={23} />
              )}
              <span>{user?.displayName || dm.name}</span>
              {count !== undefined ? (
                <span
                  className="personal-count"
                  aria-label={t('{count} okunmamış mesaj', { count })}
                >
                  {count}
                </span>
              ) : (
                c.unread[dm.id] && <i className="nav-dot" />
              )}
            </button>
          );
        })}
        <div className="section-label">{t('KİŞİSEL')}</div>
        <button
          className="room-channel"
          onClick={() => navigate(preserveReferenceFixtureRoute('/media'))}
        >
          <ReferenceIcon name="film" size={19} />
          <span>{t('Medyam')}</span>
        </button>
        <button
          className="room-channel"
          onClick={() => navigate(preserveReferenceFixtureRoute('/agent?tab=schedules'))}
        >
          <ReferenceIcon name="calendar" size={19} />
          <span>{t('Planlanan görevler')}</span>
        </button>
        {!c.spaces.length && (
          <button className="room-channel" onClick={() => navigate('/setup/invite')}>
            <ReferenceIcon name="plus" size={19} />
            <span>{t('Davet bağlantısı aç')}</span>
          </button>
        )}
      </div>
      {r.channelId ? (
        <div className="sidebar-call">
          <div>
            <ReferenceIcon name="wifi" size={18} />
            <span>
              <strong>
                {r.status === 'connected'
                  ? t('Ses bağlı')
                  : r.status === 'reconnecting'
                    ? t('Yeniden bağlanıyor')
                    : t('Bağlantı kesildi')}
              </strong>
              <small>
                {r.roomName} / {c.spaces.find((s) => s.id === c.activeSpaceId)?.name}
              </small>
            </span>
            <IconButton label={t('Sesten ayrıl')} onClick={() => run(leaveVoice())}>
              <ReferenceIcon name="logout" size={17} />
            </IconButton>
          </div>
          <div className="sidebar-call-actions">
            <button
              disabled={r.status !== 'connected'}
              onClick={() => navigate(preserveReferenceFixtureRoute('/voice?view=video'))}
            >
              <ReferenceIcon name="video" size={14} />
              Video
            </button>
            <button
              disabled={r.status !== 'connected'}
              onClick={() => navigate(preserveReferenceFixtureRoute('/voice?view=share&choose=1'))}
            >
              <ReferenceIcon name="monitor" size={14} />
              {t('Ekran')}
            </button>
          </div>
        </div>
      ) : (
        localVoiceFixture && (
          <div
            className="sidebar-call local-voice-fixture"
            aria-label={t('Yerel ses odası örneği')}
          >
            <div>
              <ReferenceIcon name="wifi" size={18} />
              <span>
                <strong>{t('Ses bağlı')}</strong>
                <small>
                  {places.lounge} / {places.community}
                </small>
              </span>
              <IconButton
                label={t('Yerel örnekte ses bağlantısı yok')}
                disabled
                title={t('Bu ekran yerel bir görsel örnektir; gerçek ses bağlantısı yok.')}
              >
                <ReferenceIcon name="logout" size={17} />
              </IconButton>
            </div>
            <div className="sidebar-call-actions">
              <button
                disabled
                title={t('Bu ekran yerel bir görsel örnektir; gerçek arama başlatılmaz.')}
              >
                <ReferenceIcon name="video" size={14} />
                Video
              </button>
              <button
                disabled
                title={t('Bu ekran yerel bir görsel örnektir; gerçek ekran paylaşımı başlatılmaz.')}
              >
                <ReferenceIcon name="monitor" size={14} />
                {t('Ekran')}
              </button>
            </div>
          </div>
        )
      )}
      <footer>
        <button
          className="sidebar-self"
          onClick={() => navigate(preserveReferenceFixtureRoute('/settings?tab=profile'))}
        >
          {c.user && <VoiceAvatar id={c.user.id} name={c.user.displayName} />}
          <strong>{c.user?.displayName || c.user?.username}</strong>
        </button>
        <IconButton
          label={r.muted ? t('Mikrofonu aç') : t('Mikrofonu kapat')}
          disabled={r.status !== 'connected'}
          onClick={() => run(toggleMic())}
        >
          <ReferenceIcon name={r.muted ? 'mic-off' : 'mic'} size={17} />
        </IconButton>
        <IconButton
          label={r.deafened ? t('Sesi aç') : t('Sağırlaştır')}
          disabled={r.status !== 'connected'}
          onClick={() => run(toggleDeafen())}
        >
          <ReferenceIcon name="headphones" size={17} />
        </IconButton>
        <IconButton
          label={t('Ayarlar')}
          onClick={() => navigate(preserveReferenceFixtureRoute('/settings'))}
        >
          <ReferenceIcon name="settings" size={17} />
        </IconButton>
      </footer>
    </aside>
  );
}
