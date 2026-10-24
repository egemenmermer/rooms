import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { SocialChannelPermissions, SocialPermissionValues } from '@rooms/social';
import { ChannelPermissions, type ChannelPermissionSnapshot } from './CommunitySettings';
import { useCommunity } from './community';
import { useRealtime } from './realtime';
import { SystemState } from './SystemState';
import { t, uiError } from './i18n';

const project = (state: SocialChannelPermissions): ChannelPermissionSnapshot => ({
  channelId: state.channelId,
  subjects: state.subjects.map((subject) => ({ ...subject, values: { ...subject.values } })),
});
/** No invented member overrides, global private flag, revision or multi-subject transaction. */
export function ChannelPermissionsSurface({ channelId }: { channelId: string | null }) {
  const c = useCommunity(),
    voice = useRealtime(),
    navigate = useNavigate();
  const [snapshot, setSnapshot] = useState<SocialChannelPermissions | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [refresh, setRefresh] = useState(0);
  const epoch = useRef(0);
  const projected = useMemo(() => (snapshot ? project(snapshot) : undefined), [snapshot]);
  const fixture = !!(import.meta.env.DEV && new URLSearchParams(location.search).has('fixture'));
  useEffect(() => {
    const request = ++epoch.current;
    setSnapshot(null);
    setError('');
    setLoading(true);
    if (!channelId || !window.rooms || fixture) {
      setLoading(false);
      return;
    }
    void window.rooms.social
      .channelPermissions(channelId)
      .then(async (value) => {
        if (request === epoch.current) {
          setSnapshot(value);
          if (value.access === 'allowed') await useCommunity.getState().refresh();
          if (request === epoch.current) setLoading(false);
        }
      })
      .catch((e) => {
        if (request === epoch.current) {
          setError(uiError(e));
          setLoading(false);
        }
      });
    return () => {
      epoch.current++;
    };
  }, [channelId, c.user?.id, c.serverUrl, refresh, fixture]);
  useEffect(() => {
    const invalid = (event: Event) => {
      if (
        (event as CustomEvent<{ channelIds: string[] }>).detail.channelIds.includes(channelId ?? '')
      ) {
        epoch.current++;
        setSnapshot(null);
        setRefresh((value) => value + 1);
      }
    };
    window.addEventListener('rooms:channel-access-invalidated', invalid);
    return () => window.removeEventListener('rooms:channel-access-invalidated', invalid);
  }, [channelId]);
  const channel = c.channels.find((ch) => ch.id === channelId);
  const back = () => navigate('/chat');
  if (loading) return <SystemState kind="loading" />;
  if (error)
    return (
      <SystemState
        kind="unavailable"
        error={error}
        onRetry={() => setRefresh((v) => v + 1)}
        onReturn={back}
      />
    );
  if (!channelId || fixture)
    return (
      <div className="rcs-page">
        <p>
          {fixture
            ? t('Yerel örnek durum; gerçek kanal izinleri okunmaz.')
            : t('Kanal menüsünden İzinler’i seç.')}
        </p>
        <button className="button secondary" onClick={back}>
          {t('Sohbete dön')}
        </button>
      </div>
    );
  const access =
    snapshot?.access === 'allowed' && snapshot.effective.managePermissions
      ? 'allowed'
      : snapshot?.access === 'denied' || snapshot?.access === 'allowed'
        ? 'denied'
        : 'unknown';
  const save = async (draft: ChannelPermissionSnapshot) => {
    if (!snapshot || !snapshot.effective.managePermissions || draft.channelId !== channelId)
      throw new Error(t('Kanal yetkisi değişti. Yeniden aç.'));
    const changed = draft.subjects.filter((subject) => {
      const previous = snapshot.subjects.find(
        (item) => item.id === subject.id && item.kind === subject.kind,
      );
      return !previous || JSON.stringify(previous.values) !== JSON.stringify(subject.values);
    });
    if (changed.length !== 1)
      throw new Error(t('Bir rolün değişikliklerini kaydedip sonraki role geç.'));
    const subject = changed[0]!;
    const previous = snapshot.subjects.find(
      (item) => item.id === subject.id && item.kind === subject.kind,
    );
    if (!previous?.editable || subject.kind === 'member')
      throw new Error(t('Bu izin türü desteklenmiyor veya rol yetkisi yok.'));
    const identity = c.user?.id,
      serverUrl = c.serverUrl;
    const result = await window.rooms!.social.setChannelPermissions({
      channelId,
      subject: { kind: subject.kind, id: subject.id },
      values: subject.values as SocialPermissionValues,
    });
    if (
      useCommunity.getState().user?.id !== identity ||
      useCommunity.getState().serverUrl !== serverUrl
    )
      throw new Error(t('Topluluk oturumu değişti.'));
    setSnapshot(result);
    await useCommunity.getState().refresh();
    return project(result);
  };
  return (
    <>
      <ChannelPermissions
        spaceName={c.spaces.find((space) => space.id === snapshot?.spaceId)?.name}
        channel={access === 'allowed' ? channel : undefined}
        access={access}
        snapshot={projected}
        canEdit={!!snapshot?.effective.managePermissions}
        onSave={save}
        onReturn={back}
        voiceConnected={voice.status === 'connected'}
        voiceRoomName={voice.roomName ?? undefined}
      />
      {access === 'allowed' && (
        <p className="rcs-hint">
          {t(
            'İzinler rol bazında kaydedilir. Kişiye özel izin ve eşzamanlı değişiklik koruması bu sunucu sürümünde bulunmuyor.',
          )}
        </p>
      )}
    </>
  );
}
