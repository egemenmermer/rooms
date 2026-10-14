import { useEffect, useRef, useState } from 'react';
import { Toggle } from '@rooms/design';
import type { DesktopWindowPreferences, DesktopBridge } from '@rooms/contracts';
import { uiError } from './i18n';

export function DesktopWindowSettings({ bridge }: { bridge?: DesktopBridge['desktopWindow'] }) {
  const [preferences, setPreferences] = useState<DesktopWindowPreferences | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const epoch = useRef(0);
  const fixture = import.meta.env.DEV && new URLSearchParams(location.search).has('fixture');
  const api = bridge ?? (!fixture ? window.rooms?.desktopWindow : undefined);
  useEffect(() => {
    const generation = ++epoch.current;
    void api
      ?.status()
      .then((result) => {
        if (generation === epoch.current) setPreferences(result);
      })
      .catch((reason) => {
        if (generation === epoch.current) setError(uiError(reason));
      });
    return () => {
      epoch.current++;
    };
  }, [api]);
  async function change(key: 'keepOpenOnClose' | 'warnOnVoiceClose', value: boolean) {
    if (!api || busy) return;
    const generation = ++epoch.current;
    setBusy(true);
    setError('');
    try {
      const result = await api.setPreference(key, value);
      if (generation === epoch.current) setPreferences(result);
    } catch (reason) {
      if (generation === epoch.current) setError(uiError(reason));
    } finally {
      if (generation === epoch.current) setBusy(false);
    }
  }
  const unavailable =
    fixture && !bridge
      ? 'Geliştirme görünümünde değiştirilemez.'
      : !api
        ? 'Masaüstü uygulamasını gerektirir.'
        : !preferences
          ? 'Pencere tercihleri alınamadı.'
          : '';
  return (
    <>
      <div className="settings-row">
        <div>
          <h4>Pencereyi kapatınca menü çubuğunda açık tut</h4>
          <p>
            {unavailable ||
              (!preferences?.trayAvailable
                ? 'Sistem tepsisi kullanılamıyor.'
                : 'Pencere gizlenir; ses bağlantısı devam eder. Menüden yeniden açabilirsin.')}
          </p>
        </div>
        <Toggle
          label="Pencereyi kapatınca menü çubuğunda açık tut"
          value={preferences?.keepOpenOnClose ?? false}
          disabled={busy || !preferences?.trayAvailable || !api}
          onChange={(value) => void change('keepOpenOnClose', value)}
        />
      </div>
      <div className="settings-row">
        <div>
          <h4>Kapatırken ses bağlantısını hatırlat</h4>
          <p>{unavailable || 'Pencereyi kapatıp ses bağlantısından ayrılmadan önce onay ister.'}</p>
        </div>
        <Toggle
          label="Kapatırken ses bağlantısını hatırlat"
          value={preferences?.warnOnVoiceClose ?? true}
          disabled={busy || !preferences || !api}
          onChange={(value) => void change('warnOnVoiceClose', value)}
        />
      </div>
      {error && (
        <div className="ref-settings-callout error" role="alert">
          {error}
        </div>
      )}
    </>
  );
}
