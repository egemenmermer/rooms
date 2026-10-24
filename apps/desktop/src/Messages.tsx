import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserPlus } from 'lucide-react';
import { EmptyState, LoadingView, Modal, Notice } from '@rooms/design';
import type { SocialUser } from '@rooms/social';
import { useCommunity } from './community';
import { DirectMessageList } from './SocialSurfaces';
import { VoiceAvatar } from './VoiceAvatar';
import { locale, t, uiError } from './i18n';
import { directMessageFailed } from './FriendRequiredDialog';
import './reference-home.css';
/**
 * The direct message inbox: the shared conversation list (avatar, last message, time, unread)
 * with the "new message" person picker above it.
 */
export function Messages({ notify }: { notify(message: string): void }) {
  const c = useCommunity(),
    navigate = useNavigate(),
    [creating, setCreating] = useState(false);
  const unavailable = !c.user
    ? t('Önce giriş yap.')
    : !window.rooms
      ? t('Masaüstü uygulamasını aç.')
      : undefined;
  return (
    <div className="home-messages">
      <div className="home-messages-actions">
        <button
          className="button primary small"
          disabled={!!unavailable}
          title={unavailable}
          onClick={() => setCreating(true)}
        >
          {t('Yeni özel mesaj')}
        </button>
      </div>
      <DirectMessageList
        onOpen={(id) => {
          navigate('/chat');
          void c.openChannel(id).catch((e) => notify(uiError(e)));
        }}
      />
      {creating && (
        <NewMessage
          key={`${c.serverUrl}:${c.user?.id}:${c.activeSpaceId}`}
          onClose={() => setCreating(false)}
          notify={notify}
        />
      )}
    </div>
  );
}
function NewMessage({ onClose, notify }: { onClose(): void; notify(message: string): void }) {
  const alive = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const c = useCommunity(),
    navigate = useNavigate(),
    [people, setPeople] = useState<SocialUser[]>([]),
    [query, setQuery] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    void Promise.allSettled([
      window.rooms!.social.friends(),
      c.activeSpaceId ? window.rooms!.social.members(c.activeSpaceId) : Promise.resolve([]),
    ]).then(([friends, members]) => {
      if (!alive) return;
      const blocked = new Set(
        friends.status === 'fulfilled'
          ? friends.value.filter((f) => f.relationship === 'blocked').map((f) => f.user.id)
          : [],
      );
      const users = [
        ...(friends.status === 'fulfilled'
          ? friends.value.filter((f) => f.relationship === 'friend').map((f) => f.user)
          : []),
        ...(members.status === 'fulfilled' ? members.value.map((m) => m.user) : []),
      ];
      setPeople([
        ...new Map(
          users
            .filter((u) => u.id !== c.user?.id && !u.bot && !blocked.has(u.id))
            .map((u) => [u.id, u]),
        ).values(),
      ]);
      if (friends.status === 'rejected' && members.status === 'rejected')
        setError(t('Kişiler alınamadı.'));
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [c.activeSpaceId, c.user?.id]);
  const needle = query.toLocaleLowerCase(locale),
    shown = people.filter((u) =>
      `${u.displayName} ${u.username}`.toLocaleLowerCase(locale).includes(needle),
    );
  const select = async (user: SocialUser) => {
    if (busy) return;
    setBusy(true);
    setError('');
    const server = c.serverUrl,
      owner = c.user?.id;
    try {
      const channel = await window.rooms!.social.createDM(user.id);
      if (
        !alive.current ||
        useCommunity.getState().serverUrl !== server ||
        useCommunity.getState().user?.id !== owner
      )
        return;
      useCommunity.setState((state) => ({
        dms: [...state.dms.filter((dm) => dm.id !== channel.id), channel],
      }));
      onClose();
      await c.openChannel(channel.id);
      if (
        useCommunity.getState().serverUrl === server &&
        useCommunity.getState().user?.id === owner &&
        useCommunity.getState().activeChannelId === channel.id
      ) {
        navigate('/chat');
        onClose();
      }
    } catch (e) {
      if (
        useCommunity.getState().serverUrl === server &&
        useCommunity.getState().user?.id === owner
      ) {
        if (!alive.current) directMessageFailed(e, user, notify);
        else {
          setBusy(false);
          if (directMessageFailed(e, user, setError)) onClose();
        }
      }
    }
  };
  return (
    <Modal title={t('Yeni özel mesaj')} onClose={onClose}>
      <input
        className="full"
        aria-label={t('Kişi ara')}
        placeholder={t('Kişi ara')}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {loading ? (
        <LoadingView size="inline" label={t('Kişiler yükleniyor…')} />
      ) : people.length ? (
        <ul className="home-people-picker">
          {shown.map((u) => (
            <li key={u.id}>
              <button disabled={busy} onClick={() => void select(u)}>
                <VoiceAvatar id={u.id} name={u.displayName} />
                <span>{u.displayName}</span>
                <small>@{u.username}</small>
              </button>
            </li>
          ))}
          {!shown.length && <li className="home-muted">{t('Eşleşen kişi yok.')}</li>}
        </ul>
      ) : (
        !error && (
          <EmptyState
            size="inline"
            icon={<UserPlus size={28} />}
            title={t('Mesajlaşmak için bir arkadaş ekle.')}
            action={
              <button
                className="button secondary"
                onClick={() => {
                  onClose();
                  navigate('/friends');
                }}
              >
                {t('Arkadaşlarını aç')}
              </button>
            }
          />
        )
      )}
      {error && <Notice kind="error">{error}</Notice>}
    </Modal>
  );
}
