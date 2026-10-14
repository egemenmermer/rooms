import { useCallback, useEffect, useState } from 'react';
import { ArrowDownToLine, RefreshCw, ShieldCheck } from 'lucide-react';
import { Toggle } from '@rooms/design';
import { tr, uiError } from './i18n';
type UpdateStatus = Awaited<ReturnType<NonNullable<Window['rooms']>['updates']['status']>>;
const names: Record<UpdateStatus['state'], string> = {
  unavailable: 'Dağıtım bekleniyor',
  idle: 'Denetlemeye hazır',
  checking: 'Güncelleme aranıyor',
  available: 'Yeni sürüm hazır',
  downloading: 'İndiriliyor',
  verifying: 'İmza doğrulanıyor',
  ready: 'Yüklemeye hazır',
  error: 'Güncelleme tamamlanamadı',
};
export function DesktopUpdates() {
  const [status, setStatus] = useState<UpdateStatus | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => {
    if (window.rooms?.updates) setStatus(await window.rooms.updates.status());
  }, []);
  useEffect(() => {
    void refresh().catch((e) => setError(uiError(e)));
    const timer = setInterval(() => void refresh().catch((e) => setError(uiError(e))), 2500);
    return () => clearInterval(timer);
  }, [refresh]);
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try {
      await action();
      await refresh();
    } catch (e) {
      setError(uiError(e));
    } finally {
      setBusy(false);
    }
  };
  const working = busy || ['checking', 'downloading', 'verifying'].includes(status?.state ?? '');
  return (
    <section className="desktop-updates">
      <div className="settings-row">
        <div>
          <h4>{tr('İmzalı güncellemeler')}</h4>
          <p>
            {tr('Yeni sürümleri isteğinle denetle; kurulumdan önce yayıncı imzası doğrulanır.')}
          </p>
        </div>
        <Toggle
          value={status?.enabled ?? false}
          disabled={!status?.configured || working}
          label={tr('İmzalı güncellemeleri etkinleştir')}
          onChange={(value) => void run(() => window.rooms!.updates.setOptIn(value))}
        />
      </div>
      <div className="settings-note">
        <ShieldCheck size={19} />
        <div>
          <strong>
            {tr(names[status?.state ?? 'unavailable'])}
            {status?.version ? ` · ${status.version}` : ''}
          </strong>
          <p>
            {status?.reason
              ? uiError(status.reason)
              : !status?.enabled
                ? tr('Denetlemek için imzalı güncellemeleri etkinleştir.')
                : tr('Güncelleme kurulumu açık uygulamayı yeniden başlatır.')}
          </p>
          {status?.state === 'downloading' && (
            <progress max={100} value={status.progress} aria-label={tr('İndirme ilerlemesi')} />
          )}
        </div>
      </div>
      <div className="button-row">
        <button
          className="button secondary small"
          disabled={!status?.configured || !status.enabled || working}
          title={
            !status?.configured
              ? tr('İmzalı dağıtım ve güncelleme adresi yapılandırılmalı.')
              : undefined
          }
          onClick={() => void run(() => window.rooms!.updates.check())}
        >
          <RefreshCw size={15} />
          {tr('Güncellemeleri denetle')}
        </button>
        {status?.state === 'available' && (
          <button
            className="button primary small"
            disabled={working || !status.enabled}
            onClick={() => void run(() => window.rooms!.updates.download())}
          >
            <ArrowDownToLine size={15} />
            {tr('Güncellemeyi indir')}
          </button>
        )}
        {status?.state === 'ready' && (
          <button
            className="button primary small"
            disabled={busy || !status.enabled}
            onClick={() => void run(() => window.rooms!.updates.install())}
          >
            {tr('Yükle ve yeniden başlat')}
          </button>
        )}
      </div>
      {error && (
        <div role="alert" className="error-pane">
          {error}
        </div>
      )}
    </section>
  );
}
