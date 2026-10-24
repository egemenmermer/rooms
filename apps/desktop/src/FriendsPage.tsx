import { useQuery } from '@tanstack/react-query';
import { queryClient } from './query-client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { EmptyState, IconButton, LoadingView, Modal, Notice } from '@rooms/design';
import type { SocialFriend } from '@rooms/social';
import { Copy } from 'lucide-react';
import { useCommunity } from './community';
import { dmCallFailure, dmCallUnavailable, startDmCall, useDmCall } from './dm-call';
import { VoiceAvatar } from './VoiceAvatar';
import { ReferenceIcon } from './ReferenceIcon';
import { t, uiError } from './i18n';
import './reference-home.css';
import './reference-social.css';

/** WAI-ARIA tabs with automatic activation and a roving tabindex (the StartTabs pattern). */
export function RovingTabs({
  tabs,
  active,
  onSelect,
  label,
  idPrefix,
  className,
}: {
  tabs: [key: string, label: string][];
  active: string;
  onSelect(key: string): void;
  label: string;
  idPrefix: string;
  className: string;
}) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  return (
    <div className={className} role="tablist" aria-label={label}>
      {tabs.map(([key, text], index) => (
        <button
          key={key}
          ref={(element) => {
            buttons.current[index] = element;
          }}
          id={`${idPrefix}-tab-${key}`}
          type="button"
          role="tab"
          aria-selected={active === key}
          aria-controls={`${idPrefix}-panel`}
          tabIndex={active === key ? 0 : -1}
          onClick={() => onSelect(key)}
          onKeyDown={(e) => {
            const target =
              e.key === 'ArrowRight'
                ? index + 1
                : e.key === 'ArrowLeft'
                  ? index - 1
                  : e.key === 'Home'
                    ? 0
                    : e.key === 'End'
                      ? tabs.length - 1
                      : null;
            if (target === null) return;
            e.preventDefault();
            const next = (target + tabs.length) % tabs.length;
            buttons.current[next]?.focus();
            onSelect(tabs[next]![0]);
          }}
        >
          {text}
        </button>
      ))}
    </div>
  );
}
/** The panel a RovingTabs list controls. */
export const tabPanelProps = (idPrefix: string, active: string) => ({
  id: `${idPrefix}-panel`,
  role: 'tabpanel',
  'aria-labelledby': `${idPrefix}-tab-${active}`,
});

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
      retry: (count, error) => error.message !== t('Oturum değişti.') && count < 1,
      queryFn: async () => {
        if (fixture) return (await import('./dev/reference-fixtures')).getReferenceFriends();
        if (
          useCommunity.getState().user?.id !== userId ||
          useCommunity.getState().serverUrl !== serverUrl
        )
          throw new Error(t('Oturum değişti.'));
        const value = await window.rooms!.social.friends();
        if (
          useCommunity.getState().user?.id !== userId ||
          useCommunity.getState().serverUrl !== serverUrl
        )
          throw new Error(t('Oturum değişti.'));
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
  online: t('Çevrimiçi'),
  idle: t('Uzakta'),
  dnd: t('Rahatsız etmeyin'),
  invisible: t('Çevrimdışı'),
  unknown: t('Durum bilinmiyor'),
};
export function FriendsPage({ notify }: { notify(message: string): void }) {
  const c = useCommunity(),
    navigate = useNavigate(),
    list = useFriendList();
  useDmCall(); // re-render when the call state changes callReason below
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
        t(
          'Bu yerel görsel veri seti arkadaşlık servisine yazmaz. Gerçek hesabınla masaüstü uygulamasında kullan.',
        ),
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
  /* Opens (or creates) the DM, then rings from it; the DM is found by recipient, never by focus. */
  const callReason = dmCallUnavailable();
  const call = async (f: SocialFriend) => {
    try {
      native();
      const session = { user: c.user?.id, server: c.serverUrl };
      await c.createDM(f.user.id);
      const state = useCommunity.getState();
      const dm = state.dms.find(
        (item) => item.type === 1 && item.recipients?.some((u) => u.id === f.user.id),
      );
      if (!dm || state.user?.id !== session.user || state.serverUrl !== session.server) return;
      await startDmCall(dm.id, 'audio');
      navigate('/dm-call');
    } catch (failure) {
      notify(dmCallFailure(failure));
    }
  };
  const ownTag = c.user
    ? `${c.user.username}${c.user.discriminator ? '#' + c.user.discriminator : ''}`
    : '';
  return (
    <section className="reference-friends">
      <div className="reference-page-heading">
        <div>
          <h1>{t('Arkadaşlar')}</h1>
          {ownTag && (
            <button
              className="ss-own-tag"
              title={t('Arkadaşların seni bu etiketle ekler.')}
              aria-label={t('Kullanıcı etiketini kopyala: {tag}', { tag: ownTag })}
              onClick={() =>
                void navigator.clipboard
                  .writeText(ownTag)
                  .then(() => notify(t('Kullanıcı adı kopyalandı.')))
                  .catch(() => notify(t('Kullanıcı adı kopyalanamadı.')))
              }
            >
              <span>{ownTag}</span>
              <Copy size={14} aria-hidden="true" />
            </button>
          )}
        </div>
        <button className="button primary" onClick={() => setAdding(true)}>
          <ReferenceIcon name="plus" size={18} />
          {t('Arkadaş ekle')}
        </button>
      </div>
      <RovingTabs
        className="reference-friend-tabs"
        label={t('Arkadaş listesi')}
        idPrefix="friends"
        active={tab}
        tabs={[
          ['online', t('Çevrimiçi · {count}', { count: online.length })],
          ['all', t('Tümü · {count}', { count: accepted.length })],
          ['requests', t('İstekler · {count}', { count: requests.length })],
          ['blocked', t('Engellenenler')],
        ]}
        onSelect={(key) => {
          const next = new URLSearchParams(params);
          next.set('tab', key);
          setParams(next);
        }}
      />
      <div {...tabPanelProps('friends', tab)}>
        {list.loading ? (
          <LoadingView size="inline" label={t('Arkadaşlar yükleniyor…')} />
        ) : shown.length ? (
          <div className="reference-friends-table">
            {shown.map((f, index) => (
              <div key={f.user.id}>
                {tab === 'requests' &&
                  (index === 0 || shown[index - 1]?.relationship !== f.relationship) && (
                    <h3>
                      {f.relationship === 'incoming'
                        ? t('Gelen istekler')
                        : t('Gönderilen istekler')}
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
                        ? t('Sana arkadaşlık isteği gönderdi.')
                        : f.relationship === 'outgoing'
                          ? t('Yanıt bekleniyor')
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
                        {t('Kabul et')}
                      </button>
                      <button
                        className="button ghost"
                        disabled={busy}
                        onClick={() => void run(() => native().removeFriend(f.user.id))}
                      >
                        {t('Reddet')}
                      </button>
                    </>
                  ) : f.relationship === 'outgoing' ? (
                    <button
                      className="button ghost"
                      disabled={busy}
                      onClick={() => void run(() => native().removeFriend(f.user.id))}
                    >
                      {t('İsteği geri çek')}
                    </button>
                  ) : f.relationship === 'blocked' ? (
                    <button
                      className="button secondary"
                      disabled={busy}
                      onClick={() => void run(() => native().unblockUser(f.user.id))}
                    >
                      {t('Engeli kaldır')}
                    </button>
                  ) : (
                    <>
                      <IconButton
                        label={t('{name} ile sohbet aç', { name: f.user.displayName })}
                        onClick={() => message(f)}
                      >
                        <ReferenceIcon name="message" size={20} />
                      </IconButton>
                      {window.rooms?.dmCalls && (
                        <IconButton
                          label={
                            callReason ?? t('{name} ile sesli ara', { name: f.user.displayName })
                          }
                          disabled={!!callReason}
                          onClick={() => void call(f)}
                        >
                          <ReferenceIcon name="phone" size={20} />
                        </IconButton>
                      )}
                      <IconButton
                        label={t('{name} seçenekleri', { name: f.user.displayName })}
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
          <EmptyState
            icon={<ReferenceIcon name="users" size={38} />}
            title={
              tab === 'blocked'
                ? t('Engellenen kimse yok.')
                : tab === 'requests'
                  ? t('Bekleyen istek yok.')
                  : accepted.length
                    ? t('Çevrimiçi arkadaş yok.')
                    : t('İlk arkadaşını ekle.')
            }
            action={
              <button className="button primary" onClick={() => setAdding(true)}>
                {t('Arkadaş ekle')}
              </button>
            }
          >
            {tab === 'blocked'
              ? t('Engellediğin kişiler bu listede görünür.')
              : tab === 'requests'
                ? t('Yeni istekler burada görünür.')
                : t('Kullanıcı adıyla arkadaş ekleyebilirsin.')}
          </EmptyState>
        )}
      </div>
      {(error || list.error) && !adding && !menu && (
        <Notice kind="error" className="friends-error">
          {error || list.error}
        </Notice>
      )}
      {adding && (
        <Modal title={t('Arkadaş ekle')} onClose={closeAdd} className="reference-add-friend">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!/^.{2,32}#[0-9]{4}$/.test(username.trim())) {
                setError(t('Kullanıcı adını numarasıyla birlikte gir: ad#1234'));
                return;
              }
              void run(
                () => native().addFriend(username.trim()),
                () => {
                  setUsername('');
                  closeAdd();
                  notify(t('Arkadaşlık isteği gönderildi.'));
                },
              );
            }}
          >
            <p>{t('Arkadaşının kullanıcı etiketi: ad#1234')}</p>
            <label className="field-label">
              {t('Kullanıcı adı')}
              <input
                autoFocus
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                required
                maxLength={37}
                placeholder={t('kullanıcıadı#1234')}
                autoComplete="off"
              />
            </label>
            {error && <p role="alert">{error}</p>}
            <footer>
              <button className="button primary" disabled={busy || !username.trim()}>
                {busy ? t('Gönderiliyor…') : t('İstek gönder')}
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
                  ? t('Bu kişiyi engellemek istiyor musun?')
                  : t('Arkadaşlığını kaldırmak istiyor musun?')}
              </p>
              <div className="button-row">
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() => setConfirm(null)}
                >
                  {t('İptal')}
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
                  {busy ? t('Kaydediliyor…') : t('Onayla')}
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
                {t('Mesaj gönder')}
              </button>
              <button onClick={() => setConfirm('remove')}>{t('Arkadaşlığı kaldır')}</button>
              <button onClick={() => setConfirm('block')}>{t('Engelle')}</button>
            </>
          )}
          {error && <p role="alert">{error}</p>}
        </Modal>
      )}
    </section>
  );
}
