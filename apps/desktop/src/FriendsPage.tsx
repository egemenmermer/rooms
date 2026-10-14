import { useQuery } from '@tanstack/react-query';
import { queryClient } from './query-client';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { IconButton, Modal } from '@rooms/design';
import type { SocialFriend } from '@rooms/social';
import { useCommunity } from './community';
import { VoiceAvatar } from './VoiceAvatar';
import { ReferenceIcon } from './ReferenceIcon';
import { uiError } from './i18n';
import './reference-home.css';

export function useFriendList() {
  const userId = useCommunity((s) => s.user?.id),
    serverUrl = useCommunity((s) => s.serverUrl);
  const fixture = import.meta.env.DEV ? new URLSearchParams(location.search).get('fixture') : null;
  const enabled = !!fixture || !!(userId && window.rooms);
  const key = ['friends', serverUrl, userId, fixture];
  const query = useQuery(
    {
      queryKey: key,
      enabled,
      staleTime: 10000,
      gcTime: 300000,
      refetchInterval: 15000,
      refetchIntervalInBackground: false,
      retry: (count, error) => error.message !== 'Oturum değişti.' && count < 1,
      queryFn: async () => {
        if (fixture) return (await import('./dev/reference-fixtures')).getReferenceFriends();
        if (
          useCommunity.getState().user?.id !== userId ||
          useCommunity.getState().serverUrl !== serverUrl
        )
          throw new Error('Oturum değişti.');
        const value = await window.rooms!.social.friends();
        if (
          useCommunity.getState().user?.id !== userId ||
          useCommunity.getState().serverUrl !== serverUrl
        )
          throw new Error('Oturum değişti.');
        return value;
      },
    },
    queryClient,
  );
  useEffect(() => {
    const changed = () => {
      void queryClient.invalidateQueries({ queryKey: key, exact: true });
    };
    window.addEventListener('rooms:friends-changed', changed);
    return () => window.removeEventListener('rooms:friends-changed', changed);
  }, [serverUrl, userId, fixture]);
  const refresh = async () => {
    const result = await query.refetch();
    if (result.isError) throw result.error;
  };
  return {
    friends: enabled ? (query.data ?? []) : [],
    loading: enabled && query.isPending,
    error: query.error ? uiError(query.error) : '',
    refresh,
  };
}
const statusLabel: Record<SocialFriend['status'], string> = {
  online: 'Çevrimiçi',
  idle: 'Uzakta',
  dnd: 'Rahatsız etmeyin',
  invisible: 'Çevrimdışı',
  unknown: 'Durum bilinmiyor',
};
export function FriendsPage({ notify }: { notify(message: string): void }) {
  const c = useCommunity(),
    navigate = useNavigate(),
    list = useFriendList();
  const [params, setParams] = useSearchParams();
  const selected = params.get('tab') ?? 'online';
  const tab = ['online', 'all', 'requests', 'blocked'].includes(selected) ? selected : 'online';
  const [adding, setAdding] = useState(false),
    [username, setUsername] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState<SocialFriend | null>(null),
    [confirm, setConfirm] = useState<'remove' | 'block' | null>(null);
  const rows = list.friends.map((f) => ({
    ...f,
    status:
      c.status === 'connected'
        ? ((c.presence[f.user.id] as SocialFriend['status']) ?? f.status)
        : ('unknown' as const),
  }));
  const accepted = rows.filter((f) => f.relationship === 'friend'),
    online = accepted.filter((f) => ['online', 'idle', 'dnd'].includes(f.status));
  const requests = rows.filter(
      (f) => f.relationship === 'incoming' || f.relationship === 'outgoing',
    ),
    blocked = rows.filter((f) => f.relationship === 'blocked');
  const shown =
    tab === 'online' ? online : tab === 'all' ? accepted : tab === 'requests' ? requests : blocked;
  const closeAdd = useCallback(() => {
      setAdding(false);
      setError('');
    }, []),
    closeMenu = useCallback(() => {
      setMenu(null);
      setConfirm(null);
      setError('');
    }, []);
  const native = () => {
    if (
      !window.rooms?.social ||
      (import.meta.env.DEV && new URLSearchParams(location.search).has('fixture'))
    )
      throw new Error(
        'Bu yerel görsel veri seti arkadaşlık servisine yazmaz. Gerçek hesabınla masaüstü uygulamasında kullan.',
      );
    return window.rooms.social;
  };
  const run = async (operation: () => Promise<unknown>, close?: () => void) => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await operation();
      await list.refresh();
      close?.();
    } catch (failure) {
      setError(uiError(failure));
    } finally {
      setBusy(false);
    }
  };
  const handle = (f: SocialFriend) =>
    `${f.user.username}${f.user.discriminator ? '#' + f.user.discriminator : ''}`;
  const message = (f: SocialFriend) => {
    try {
      native();
      void c
        .createDM(f.user.id)
        .then(() => navigate('/chat'))
        .catch((failure) => notify(uiError(failure)));
    } catch (failure) {
      notify(uiError(failure));
    }
  };
  return (
    <section className="reference-friends">
      <div className="reference-page-heading">
        <div>
          <h1>Arkadaşlar</h1>
          <button
            className="text-button"
            onClick={() => {
              const own = c.user;
              if (own)
                void navigator.clipboard
                  .writeText(`${own.username}${own.discriminator ? '#' + own.discriminator : ''}`)
                  .then(() => notify('Kullanıcı adı kopyalandı.'))
                  .catch(() => notify('Kullanıcı adı kopyalanamadı.'));
            }}
          >
            Kullanıcı adımı kopyala
          </button>
        </div>
        <button className="button primary" onClick={() => setAdding(true)}>
          <ReferenceIcon name="plus" size={18} />
          Arkadaş ekle
        </button>
      </div>
      <div className="reference-friend-tabs" role="tablist" aria-label="Arkadaş listesi">
        {[
          ['online', `Çevrimiçi · ${online.length}`],
          ['all', `Tümü · ${accepted.length}`],
          ['requests', `İstekler · ${requests.length}`],
          ['blocked', 'Engellenenler'],
        ].map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => {
              const next = new URLSearchParams(params);
              next.set('tab', key!);
              setParams(next);
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {list.loading ? (
        <p role="status">Arkadaşlar yükleniyor…</p>
      ) : shown.length ? (
        <div className="reference-friends-table">
          {shown.map((f, index) => (
            <div key={f.user.id}>
              {tab === 'requests' &&
                (index === 0 || shown[index - 1]?.relationship !== f.relationship) && (
                  <h3>
                    {f.relationship === 'incoming' ? 'Gelen istekler' : 'Gönderilen istekler'}
                  </h3>
                )}
              <div className="reference-friend-line">
                <span className="reference-friend-photo">
                  <VoiceAvatar id={f.user.id} name={f.user.displayName} />
                  <i className={`member-presence ${f.status}`} />
                </span>
                <div>
                  <strong>{f.user.displayName || f.user.username}</strong>
                  <p>
                    {f.relationship === 'incoming'
                      ? 'Sana arkadaşlık isteği gönderdi.'
                      : f.relationship === 'outgoing'
                        ? 'Yanıt bekleniyor'
                        : (statusLabel[f.status] ?? statusLabel.unknown)}
                  </p>
                </div>
                {f.relationship === 'incoming' ? (
                  <>
                    <button
                      className="button primary"
                      disabled={busy}
                      onClick={() => void run(() => native().addFriend(handle(f)))}
                    >
                      <ReferenceIcon name="check" size={17} />
                      Kabul et
                    </button>
                    <button
                      className="button ghost"
                      disabled={busy}
                      onClick={() => void run(() => native().removeFriend(f.user.id))}
                    >
                      Reddet
                    </button>
                  </>
                ) : f.relationship === 'outgoing' ? (
                  <button
                    className="button ghost"
                    disabled={busy}
                    onClick={() => void run(() => native().removeFriend(f.user.id))}
                  >
                    İsteği geri çek
                  </button>
                ) : f.relationship === 'blocked' ? (
                  <button
                    className="button secondary"
                    disabled={busy}
                    onClick={() => void run(() => native().unblockUser(f.user.id))}
                  >
                    Engeli kaldır
                  </button>
                ) : (
                  <>
                    <IconButton
                      label={`${f.user.displayName} ile sohbet aç`}
                      onClick={() => message(f)}
                    >
                      <ReferenceIcon name="message" size={20} />
                    </IconButton>
                    <IconButton
                      label="Sesli ara"
                      disabled
                      title="Özel mesaj aramaları için sunucu bağlantısı henüz eklenmedi."
                    >
                      <ReferenceIcon name="phone" size={20} />
                    </IconButton>
                    <IconButton
                      label={`${f.user.displayName} seçenekleri`}
                      onClick={() => {
                        setMenu(f);
                        setError('');
                      }}
                    >
                      <ReferenceIcon name="more" size={20} />
                    </IconButton>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="reference-social-empty">
          <span>
            <ReferenceIcon name="users" size={38} />
          </span>
          <h2>
            {tab === 'blocked'
              ? 'Engellenen kimse yok.'
              : tab === 'requests'
                ? 'Bekleyen istek yok.'
                : accepted.length
                  ? 'Çevrimiçi arkadaş yok.'
                  : 'İlk arkadaşını ekle.'}
          </h2>
          <p>
            {tab === 'blocked'
              ? 'Engellediğin kişiler bu listede görünür.'
              : tab === 'requests'
                ? 'Yeni istekler burada görünür.'
                : 'Kullanıcı adıyla arkadaş ekleyebilirsin.'}
          </p>
          <button className="button primary" onClick={() => setAdding(true)}>
            Arkadaş ekle
          </button>
        </div>
      )}
      {(error || list.error) && !adding && !menu && (
        <p role="alert" className="friends-error">
          {error || list.error}
        </p>
      )}
      {adding && (
        <Modal title="Arkadaş ekle" onClose={closeAdd} className="reference-add-friend">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!/^.{2,32}#[0-9]{4}$/.test(username.trim())) {
                setError('Kullanıcı adını numarasıyla birlikte gir: ad#1234');
                return;
              }
              void run(
                () => native().addFriend(username.trim()),
                () => {
                  setUsername('');
                  closeAdd();
                  notify('Arkadaşlık isteği gönderildi.');
                },
              );
            }}
          >
            <p>Arkadaşının kullanıcı etiketi: ad#1234</p>
            <label className="field-label">
              Kullanıcı adı
              <input
                autoFocus
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                required
                maxLength={37}
                placeholder="kullanıcıadı#1234"
                autoComplete="off"
              />
            </label>
            {error && <p role="alert">{error}</p>}
            <footer>
              <button className="button primary" disabled={busy || !username.trim()}>
                {busy ? 'Gönderiliyor…' : 'İstek gönder'}
              </button>
            </footer>
          </form>
        </Modal>
      )}
      {menu && (
        <Modal title={menu.user.displayName} onClose={closeMenu} className="reference-friend-menu">
          {confirm ? (
            <>
              <p>
                {confirm === 'block'
                  ? 'Bu kişiyi engellemek istiyor musun?'
                  : 'Arkadaşlığını kaldırmak istiyor musun?'}
              </p>
              <div className="button-row">
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() => setConfirm(null)}
                >
                  İptal
                </button>
                <button
                  className="button danger"
                  disabled={busy}
                  onClick={() =>
                    void run(
                      () =>
                        confirm === 'block'
                          ? native().blockUser(menu.user.id)
                          : native().removeFriend(menu.user.id),
                      closeMenu,
                    )
                  }
                >
                  {busy ? 'Kaydediliyor…' : 'Onayla'}
                </button>
              </div>
            </>
          ) : (
            <>
              <button
                onClick={() => {
                  message(menu);
                  closeMenu();
                }}
              >
                Mesaj gönder
              </button>
              <button onClick={() => setConfirm('remove')}>Arkadaşlığı kaldır</button>
              <button onClick={() => setConfirm('block')}>Engelle</button>
            </>
          )}
          {error && <p role="alert">{error}</p>}
        </Modal>
      )}
    </section>
  );
}
