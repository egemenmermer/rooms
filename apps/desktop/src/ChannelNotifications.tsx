import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Toggle } from '@rooms/design';
import { useCommunity } from './community';
import type { DesktopBridge } from '@rooms/contracts';
import { t, uiError } from './i18n';

/** Device-local preferences, fenced against late receipts from a previous account. */
export function ChannelNotifications({ bridge }: { bridge?: DesktopBridge['notifications'] }) {
  const community = useCommunity(),
    [params] = useSearchParams();
  const channels = [...community.channels, ...community.dms].filter(
    (channel) => channel.type !== 2,
  );
  const requested = params.get('channel') ?? community.activeChannelId ?? '';
  const [selected, setSelected] = useState(requested),
    [muted, setMuted] = useState<boolean | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const epoch = useRef(0);
  useEffect(() => {
    setSelected(requested);
  }, [requested]);
  const channelId = channels.some((channel) => channel.id === selected)
    ? selected
    : (channels[0]?.id ?? '');
  const scope = community.user
    ? { serverUrl: community.serverUrl, userId: community.user.id, channelId }
    : null;
  const current = () => {
    const state = useCommunity.getState();
    return state.user?.id === scope?.userId && state.serverUrl === scope?.serverUrl;
  };
  const fixture = import.meta.env.DEV && new URLSearchParams(location.search).has('fixture');
  const api = bridge ?? (!fixture ? window.rooms?.notifications : undefined);
  useEffect(() => {
    const generation = ++epoch.current;
    setMuted(null);
    setError('');
    setBusy(false);
    if (!scope || !channelId || !api) return;
    void api
      .channelStatus(scope)
      .then((result) => {
        if (generation === epoch.current && current()) setMuted(result.muted);
      })
      .catch((reason) => {
        if (generation === epoch.current && current()) setError(uiError(reason));
      });
    return () => {
      epoch.current++;
    };
  }, [community.serverUrl, community.user?.id, channelId, api]);
  return (
    <section className="ref-settings-section">
      <h2>{t('Bu oda')}</h2>
      <div className="settings-row">
        <div>
          <select
            aria-label={t('Bildirim kanalı')}
            value={channelId}
            disabled={busy || !channels.length}
            onChange={(event) => setSelected(event.target.value)}
          >
            {!channels.length && <option value="">{t('Kanal yok')}</option>}
            {channels.map((channel) => (
              <option key={channel.id} value={channel.id}>
                {channel.name || t('Özel mesaj')}
              </option>
            ))}
          </select>
          <p>
            {!scope
              ? t('Önce giriş yap.')
              : fixture && !bridge
                ? t('Geliştirme görünümünde hesap tercihleri değiştirilemez.')
                : !api
                  ? t('Masaüstü uygulamasını gerektirir.')
                  : t('Bu cihazdaki masaüstü bildirimlerini durdurur.')}
          </p>
        </div>
        <Toggle
          label={t('Bu kanalı sessize al')}
          value={muted ?? false}
          disabled={busy || muted === null || !scope || !channelId || !api}
          onChange={async (value) => {
            if (!scope || !api) return;
            const generation = epoch.current;
            setBusy(true);
            setError('');
            try {
              const result = await api.setChannelMuted({ ...scope, muted: value });
              if (generation === epoch.current && current()) setMuted(result.muted);
            } catch (reason) {
              if (generation === epoch.current && current()) setError(uiError(reason));
            } finally {
              if (generation === epoch.current && current()) setBusy(false);
            }
          }}
        />
      </div>
      {error && (
        <div className="ref-settings-callout error" role="alert">
          {error}
        </div>
      )}
    </section>
  );
}
