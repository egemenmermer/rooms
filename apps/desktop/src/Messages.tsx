import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Modal } from '@rooms/design';
import type { SocialUser } from '@rooms/social';
import { useCommunity } from './community';
import { VoiceAvatar } from './VoiceAvatar';
import { locale, t, uiError } from './i18n';
import { directMessageFailed } from './FriendRequiredDialog';
export function Messages({ notify }: { notify(message: string): void }) {
  const c = useCommunity(),
    navigate = useNavigate(),
    [creating, setCreating] = useState(false);
  return (
    <div className="minimal-messages">
      <button
        className="text-button"
        disabled={!c.user || !window.rooms}
        title={
          !c.user
            ? t('Önce giriş yap.')
            : !window.rooms
              ? t('Masaüstü uygulamasını aç.')
              : undefined
        }
        onClick={() => setCreating(true)}
      >
        {t('Yeni özel mesaj')}
      </button>
      {c.dms.map((dm) => {
        const p = dm.recipients?.find((u) => u.id !== c.user?.id);
        return (
          <button
            key={dm.id}
            onClick={() => {
              navigate('/chat');
              void c.openChannel(dm.id).catch((e) => notify(uiError(e)));
            }}
          >
            {p && <VoiceAvatar id={p.id} name={p.displayName} />}
            <span>{p?.displayName ?? dm.name}</span>
            {c.unread[dm.id] && <i className="nav-dot" />}
          </button>
        );
      })}
      {!c.dms.length && <p>{t('Henüz konuşma yok.')}</p>}
      <button className="text-button" onClick={() => navigate('/friends')}>
        {t('Arkadaşlar')}
      </button>
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
      <div className="minimal-messages">
        {people
          .filter((u) =>
            `${u.displayName} ${u.username}`
              .toLocaleLowerCase(locale)
              .includes(query.toLocaleLowerCase(locale)),
          )
          .map((u) => (
            <button key={u.id} disabled={busy} onClick={() => void select(u)}>
              <VoiceAvatar id={u.id} name={u.displayName} />
              <span>{u.displayName}</span>
            </button>
          ))}
      </div>
      {loading && <p role="status">{t('Kişiler yükleniyor…')}</p>}
      {!loading && !people.length && <p>{t('Mesajlaşmak için bir arkadaş ekle.')}</p>}
      {error && <p role="alert">{error}</p>}
    </Modal>
  );
}
