import { Clapperboard, Gamepad2, Hash, Home as HomeIcon, Users, Volume2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { EmptyState, LoadingView, Notice } from '@rooms/design';
import type { SocialChannel, SocialFriend } from '@rooms/social';
import type { Overlay } from './App';
import { useCommunity } from './community';
import { useRealtime, joinVoice } from './realtime';
import { useActivityRoom } from './activity';
import { openActivity } from './activity-route';
import { useCommunityCinema } from './cinema/cinema-status';
import { hallProgress } from './cinema/hall-model';
import { ConnectionPane } from './ConnectionPane';
import { useFriendList } from './FriendsPage';
import { ulidTime } from './SocialSurfaces';
import { useVoiceDirectory } from './voice-directory';
import { VoiceAvatar } from './VoiceAvatar';
import { locale, t, uiError } from './i18n';
import './reference-home.css';

const fixtureMode = () =>
  import.meta.env.DEV && new URLSearchParams(location.search).has('fixture');

/** Unread first, then the newest conversation; ULIDs sort as strings, numeric ids by length. */
const byActivity = (unread: Record<string, boolean>) => (a: SocialChannel, b: SocialChannel) => {
  const x = a.lastMessageId ?? '',
    y = b.lastMessageId ?? '';
  return (
    Number(!!unread[b.id]) - Number(!!unread[a.id]) ||
    y.length - x.length ||
    (y > x ? 1 : y < x ? -1 : 0)
  );
};

const shortTime = (ms: number) => {
  const date = new Date(ms);
  return date.toDateString() === new Date().toDateString()
    ? date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
};

/**
 * Where people land: who is in which voice room right now (one click joins and opens the voice
 * page, like the sidebar), what plays in the cinema, recent and unread chats and friends online.
 */
export function Home({
  open,
  notify,
}: {
  open(value: Overlay): void;
  notify(message: string): void;
}) {
  const c = useCommunity(),
    navigate = useNavigate();
  if (!c.user)
    return (
      <div className="home-page">
        <ConnectionPane />
      </div>
    );
  if (c.busy) return <LoadingView label={t('Aktif odalar yükleniyor…')} />;
  if (!c.spaces.length)
    return (
      <div className="home-landing">
        <EmptyState
          icon={<HomeIcon size={36} />}
          title={t('Henüz bir topluluğun yok')}
          action={
            <button className="button primary" onClick={() => navigate('/setup/invite')}>
              {t('Davet bağlantısı aç')}
            </button>
          }
          secondaryAction={
            <button className="button secondary" onClick={() => open('create-space')}>
              {t('Topluluk oluştur')}
            </button>
          }
        >
          {t(
            'Arkadaşından aldığın davet bağlantısıyla onların topluluğuna katıl ya da kendi topluluğunu kur.',
          )}
        </EmptyState>
      </div>
    );
  return <Landing open={open} notify={notify} />;
}

function Landing({ open, notify }: { open(value: Overlay): void; notify(message: string): void }) {
  const c = useCommunity(),
    r = useRealtime(),
    navigate = useNavigate(),
    friends = useFriendList();
  // The cinema hall is a voice channel too, but it has its own card and page.
  const hallId = useCommunityCinema().hallId;
  const space = c.spaces.find((s) => s.id === c.activeSpaceId);
  const voices = c.channels.filter((ch) => ch.type === 2 && ch.id !== hallId),
    texts = c.channels.filter((ch) => ch.type === 0 && ch.id !== hallId);
  const directory = useVoiceDirectory(voices.map((ch) => ch.id));
  const run = (task: Promise<unknown>) => void task.catch((e) => notify(uiError(e)));
  const joinedRoom = ['connected', 'reconnecting'].includes(r.status) ? r.channelId : null;
  // Same as the sidebar: the voice page opens at once and the room joins behind it.
  const enter = (ch: SocialChannel) => {
    navigate('/voice');
    run(c.openChannel(ch.id));
    if (joinedRoom !== ch.id) run(joinVoice(ch.id, ch.name));
  };
  const openChat = (id: string) => {
    navigate('/chat');
    run(c.openChannel(id));
  };
  const rooms = voices
    .map((ch, index) => ({
      ch,
      index,
      people: directory.rooms.find((room) => room.channelId === ch.id)?.participants ?? [],
    }))
    .sort((a, b) => b.people.length - a.people.length || a.index - b.index);
  const inVoice = rooms.reduce((sum, room) => sum + room.people.length, 0);
  const recent = [...texts].sort(byActivity(c.unread)).slice(0, 6);
  const unreadCount = texts.filter((ch) => c.unread[ch.id]).length;
  const accepted = friends.friends
    .filter((f) => f.relationship === 'friend')
    .map((f) => ({
      ...f,
      status:
        c.status === 'connected'
          ? ((c.presence[f.user.id] as SocialFriend['status']) ?? f.status)
          : ('unknown' as const),
    }));
  const online = accepted.filter((f) => ['online', 'idle', 'dnd'].includes(f.status));
  // A new member: nobody to see yet, so the page says what to do first.
  const newMember =
    !friends.loading &&
    !directory.loading &&
    !accepted.length &&
    !inVoice &&
    !unreadCount &&
    !joinedRoom;
  const date = (fixtureMode() ? new Date('2026-10-10T18:00:00Z') : new Date()).toLocaleDateString(
    locale,
    { weekday: 'long', day: 'numeric', month: 'long' },
  );

  if (!space)
    return (
      <div className="home-landing">
        <EmptyState icon={<HomeIcon size={36} />} title={t('Bir topluluk seç')}>
          <span className="home-space-picker">
            {c.spaces.map((s) => (
              <button
                key={s.id}
                className="button secondary"
                onClick={() => run(c.openSpace(s.id))}
              >
                {s.name}
              </button>
            ))}
          </span>
        </EmptyState>
      </div>
    );

  return (
    <div className="home-landing">
      <header className="home-header">
        <div>
          <small>{date}</small>
          <h1>{space.name}</h1>
        </div>
        <button className="button secondary" onClick={() => open('invite')}>
          {t('Davet et')}
        </button>
      </header>

      {!c.channels.length ? (
        <EmptyState
          size="inline"
          icon={<Hash size={32} />}
          title={t('Bu toplulukta henüz kanal yok')}
          action={
            <button className="button primary" onClick={() => open('invite')}>
              {t('Arkadaşını davet et')}
            </button>
          }
        >
          {t('Bir yönetici kanal açınca burada görünür.')}
        </EmptyState>
      ) : (
        <>
          {newMember && (
            <EmptyState
              size="inline"
              className="home-welcome"
              icon={<Users size={32} />}
              title={t('Tayfana hoş geldin')}
              action={
                voices[0] ? (
                  <button className="button primary" onClick={() => enter(voices[0]!)}>
                    {t('Bir ses odasına katıl')}
                  </button>
                ) : texts[0] ? (
                  <button className="button primary" onClick={() => openChat(texts[0]!.id)}>
                    {t('Sohbete katıl')}
                  </button>
                ) : undefined
              }
              secondaryAction={
                <button className="button secondary" onClick={() => open('invite')}>
                  {t('Arkadaşını davet et')}
                </button>
              }
            >
              {t('Arkadaşlarını çağır ya da bir odaya gir; kim nerede, burada görünür.')}
            </EmptyState>
          )}

          {hallId && <CinemaNow hallId={hallId} onOpen={() => navigate('/cinema')} />}

          {voices.length > 0 && (
            <section className="home-section" aria-labelledby="home-voice-heading">
              <div className="home-section-heading">
                <h2 id="home-voice-heading">{t('Ses odaları')}</h2>
                {inVoice > 0 && <span>{t('{count} kişi seste', { count: inVoice })}</span>}
              </div>
              {directory.error && (
                <Notice kind="warning">{t('Ses odalarında kimin olduğu şu an alınamadı.')}</Notice>
              )}
              <ul className="home-voice-grid">
                {rooms.map(({ ch, people }) => {
                  const joined = joinedRoom === ch.id;
                  return (
                    <li key={ch.id} className={`home-voice-room ${people.length ? 'active' : ''}`}>
                      <button
                        className="home-voice-open"
                        aria-current={joined ? 'true' : undefined}
                        onClick={() => enter(ch)}
                      >
                        <span className="home-voice-icon" aria-hidden="true">
                          <Volume2 size={17} />
                        </span>
                        <span className="home-voice-text">
                          <strong>{ch.name}</strong>
                          <small>
                            {directory.loading
                              ? t('Bakılıyor…')
                              : people.length
                                ? t('{count} kişi', { count: people.length })
                                : t('Boş')}
                          </small>
                        </span>
                        {people.length > 0 && (
                          <span
                            className="home-voice-people"
                            title={people.map((p) => p.name).join(', ')}
                          >
                            {people.slice(0, 4).map((p) => (
                              <VoiceAvatar key={p.id} id={p.id} name={p.name} />
                            ))}
                            {people.length > 4 && <small>+{people.length - 4}</small>}
                          </span>
                        )}
                        <span className="home-voice-action">
                          {joined ? t('Odaya dön') : t('Katıl')}
                        </span>
                      </button>
                      {joined && <JoinedActivity roomId={ch.id} />}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {recent.length > 0 && (
            <section className="home-section" aria-labelledby="home-chat-heading">
              <div className="home-section-heading">
                <h2 id="home-chat-heading">{t('Sohbetler')}</h2>
                {unreadCount > 0 && <span>{t('{count} okunmamış', { count: unreadCount })}</span>}
              </div>
              <ul className="home-chat-list">
                {recent.map((ch) => {
                  const unread = !!c.unread[ch.id],
                    mentions = c.readStates[ch.id]?.mentionMessageIds?.length ?? 0,
                    time = ulidTime(ch.lastMessageId);
                  return (
                    <li key={ch.id}>
                      <button
                        className={`home-chat-row ${unread ? 'unread' : ''}`}
                        onClick={() => openChat(ch.id)}
                      >
                        <Hash size={15} aria-hidden="true" />
                        <span className="home-chat-name">{ch.name}</span>
                        {time !== undefined && (
                          <time dateTime={new Date(time).toISOString()}>{shortTime(time)}</time>
                        )}
                        {mentions > 0 ? (
                          <span
                            className="home-chat-mentions"
                            role="img"
                            aria-label={t('{count} bahsetme', { count: mentions })}
                          >
                            {mentions}
                          </span>
                        ) : (
                          unread && (
                            <i
                              className="home-chat-unread"
                              role="img"
                              aria-label={t('Okunmamış mesaj var')}
                            />
                          )
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </>
      )}

      <section className="home-section" aria-labelledby="home-friends-heading">
        <div className="home-section-heading">
          <h2 id="home-friends-heading">{t('Çevrimiçi arkadaşlar')}</h2>
          <button className="button ghost small" onClick={() => navigate('/friends')}>
            {t('Arkadaşlar')}
          </button>
        </div>
        {friends.loading ? (
          <LoadingView size="inline" />
        ) : friends.error ? (
          <Notice kind="warning">{friends.error}</Notice>
        ) : online.length ? (
          <ul className="home-friends">
            {online.map((f) => (
              <li key={f.user.id}>
                <span className="home-friend-photo">
                  <VoiceAvatar id={f.user.id} name={f.user.displayName} />
                  <i className={`home-friend-presence ${f.status}`} aria-hidden="true" />
                </span>
                <span>{f.user.displayName}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="home-muted">
            {accepted.length
              ? t('Şu an çevrimiçi arkadaşın yok.')
              : t('Arkadaş ekleyince kimin çevrimiçi olduğunu burada görürsün.')}
          </p>
        )}
      </section>
    </div>
  );
}

/** What plays in the community cinema; nothing while the hall is idle (the sidebar row stays). */
function CinemaNow({ hallId, onOpen }: { hallId: string; onOpen(): void }) {
  const activity = useActivityRoom(hallId);
  const room = activity.status === 'connected' ? activity.room : null;
  const { current } = hallProgress(room);
  if (!current || !room) return null;
  return (
    <section className="home-cinema" aria-label={t('Sinema')}>
      <span className="home-cinema-icon" aria-hidden="true">
        <Clapperboard size={20} />
      </span>
      <span className="home-cinema-text">
        <small>{t('Sinemada şimdi')}</small>
        <strong>{current.media.title}</strong>
        <span>{t('{count} kişi izliyor', { count: room.participants.length })}</span>
      </span>
      <button className="button primary" onClick={onOpen}>
        {t('Sinemaya git')}
      </button>
    </section>
  );
}

/** A game table or shared activity running in the room the user is in. */
function JoinedActivity({ roomId }: { roomId: string }) {
  const activity = useActivityRoom(roomId),
    navigate = useNavigate();
  const primary = activity.status === 'connected' ? activity.room?.primary : null;
  if (!primary) return null;
  return (
    <button
      className="home-voice-activity"
      onClick={() => openActivity(primary.activity, navigate)}
    >
      <Gamepad2 size={14} aria-hidden="true" />
      <span>{t('Odada: {title}', { title: primary.title })}</span>
      <small>{t('Aç')}</small>
    </button>
  );
}
