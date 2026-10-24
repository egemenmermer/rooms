import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCommunity } from './community';
import { useRealtime } from './realtime';
import { ReferenceIcon } from './ReferenceIcon';
import { locale, t, uiError } from './i18n';
import './reference-system.css';

export type SystemStateKind =
  | 'connected'
  | 'offline'
  | 'reconnect'
  | 'loading'
  | 'empty'
  | 'session_expired'
  | 'unavailable'
  | 'permission_denied'
  | 'unsupported';
const descriptions: Record<SystemStateKind, [string, string, string]> = {
  connected: [t('Bağlısın'), t('Topluluk bağlantısı açık.'), t('Sohbete dön')],
  offline: [
    t('Çevrimdışısın'),
    t(
      'İnternet bağlantın kesildi. Daha önce yüklenen mesajları okuyabilirsin; yeni mesaj ve işlemler bağlantı geldiğinde gönderilebilir.',
    ),
    t('Yeniden bağlan'),
  ],
  reconnect: [
    t('Odaya yeniden bağlanıyoruz'),
    t(
      'Mesajların ve odadaki etkinliğin son durumu kontrol ediliyor. Bağlantı kurulana kadar yeni işlem başlatılmıyor.',
    ),
    t('Tekrar dene'),
  ],
  loading: [t('Odan hazırlanıyor'), t('Mesajlar ve üyeler yükleniyor.'), ''],
  empty: [
    t('Henüz burada bir şey yok'),
    t('Bu alana ilk mesajı veya dosyayı ekleyerek birlikte başlayabilirsiniz.'),
    t('Sohbete dön'),
  ],
  session_expired: [
    t('Yeniden giriş yapman gerekiyor'),
    t('Özel topluluğuna devam etmek için hesabınla tekrar giriş yap.'),
    t('Giriş yap'),
  ],
  unavailable: [
    t('Şu anda bağlanamıyoruz'),
    t('Topluluk hizmetine ulaşılamıyor. Mesajların bu ekranda yeniden gönderilmeyecek.'),
    t('Yeniden dene'),
  ],
  permission_denied: [
    t('Bu alan için iznin yok'),
    t(
      'Bu içeriği görüntülemek için erişim gerekiyor. Kanalın özel içeriği ve önizlemesi gösterilmez.',
    ),
    t('Genel kanala dön'),
  ],
  unsupported: [
    t('Sistem sesi burada kullanılamıyor'),
    t(
      'Bu cihaz ve paylaşım yöntemi için sistem sesi desteği doğrulanmadı. Ekranını sistem sesi olmadan paylaşabilirsin.',
    ),
    t('Ekran seçimine dön'),
  ],
};

/** Render only a supplied authoritative state; retry never sends queued chat messages. */
export function SystemState({
  kind,
  onRetry,
  onReturn,
  onSignIn,
  onCapture,
  voiceStatus,
  busy = false,
  error,
  checkedAt,
}: {
  kind: SystemStateKind;
  onRetry?(): void;
  onReturn?(): void;
  onSignIn?(): void;
  onCapture?(): void;
  voiceStatus?: string;
  busy?: boolean;
  error?: string;
  checkedAt?: number;
}) {
  const [title, description, action] = descriptions[kind];
  const icon = ['empty', 'connected'].includes(kind)
    ? 'check'
    : ['loading', 'reconnect'].includes(kind)
      ? 'clock'
      : ['permission_denied', 'session_expired', 'unsupported'].includes(kind)
        ? 'lock'
        : 'wifi-off';
  const primary =
    kind === 'session_expired'
      ? onSignIn
      : kind === 'unsupported'
        ? onCapture
        : ['empty', 'connected', 'permission_denied'].includes(kind)
          ? onReturn
          : onRetry;
  return (
    <section
      className={`reference-system system-${kind}`}
      aria-live="polite"
      aria-busy={busy || kind === 'loading'}
    >
      <div className="system-illustration" aria-hidden="true">
        <div className="system-door" />
        <span className={`system-indicator ${icon}`}>
          <ReferenceIcon name={icon} size={20} />
        </span>
      </div>
      <h1>{title}</h1>
      <p>{description}</p>
      {kind === 'loading' && (
        <div className="system-skeleton" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <div key={i}>
              <i />
              <span>
                <b />
                <b />
              </span>
            </div>
          ))}
        </div>
      )}
      {kind === 'reconnect' && (
        <div className="system-detail">
          <strong>
            <span className="system-spinner" />
            {t('Bağlantı kontrol ediliyor')}
          </strong>
          <p>
            {t('Ses odası: {status}', { status: voiceStatus ?? t('bağlı değil') })}
            <br />
            {t('Etkinlik: bağlantı sonrası güncellenecek')}
          </p>
        </div>
      )}
      {kind === 'unsupported' && (
        <div className="system-detail">
          <strong>{t('Sistem sesi')}</strong>
          <div className="system-audio">
            <span>{t('Bu cihazda kullanılamıyor')}</span>
            <button
              role="switch"
              aria-label={t('Sistem sesi kullanılamıyor')}
              aria-checked={false}
              disabled
            />
          </div>
          <p>{t('Paylaşım kaynağını ve mikrofonunu ayrı seçebilirsin.')}</p>
        </div>
      )}
      {action && (
        <div className="system-actions">
          <button className="button primary" disabled={busy || !primary} onClick={primary}>
            {['offline', 'reconnect', 'unavailable'].includes(kind) && (
              <ReferenceIcon name="refresh-cw" size={17} />
            )}{' '}
            {busy ? t('Kontrol ediliyor…') : action}
          </button>
          {['offline', 'reconnect', 'unavailable'].includes(kind) && (
            <button className="button secondary" disabled={!onReturn} onClick={onReturn}>
              {t('Yüklenen mesajlara dön')}
            </button>
          )}
        </div>
      )}
      {error && (
        <p className="system-error" role="alert">
          {error}
        </p>
      )}
      <small>
        {kind === 'permission_denied'
          ? t('Erişim değişiklikleri topluluk yöneticileri tarafından yapılır.')
          : kind === 'unsupported'
            ? t('Sistem izni vermek, desteklenmeyen bir özelliği etkinleştirmez.')
            : checkedAt
              ? t('Son kontrol: {date}', {
                  date: new Date(checkedAt).toLocaleString(locale, {
                    day: 'numeric',
                    month: 'long',
                    hour: '2-digit',
                    minute: '2-digit',
                  }),
                })
              : null}
      </small>
    </section>
  );
}

export default function ConnectionStatusSurface() {
  const community = useCommunity(),
    media = useRealtime(),
    navigate = useNavigate();
  const [online, setOnline] = useState(navigator.onLine),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [checkedAt, setCheckedAt] = useState<number>();
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  const [fixtureState, setFixtureState] = useState<SystemStateKind | 'splash' | null>(null);
  useEffect(() => {
    let active = true;
    if (import.meta.env.DEV && new URLSearchParams(location.search).get('fixture') === 'S72')
      void import('./dev/reference-fixtures').then((f) => {
        if (active) setFixtureState(f.getReferenceSystemState());
      });
    return () => {
      active = false;
    };
  }, []);
  const kind: SystemStateKind =
    fixtureState && fixtureState !== 'splash'
      ? fixtureState
      : !community.user
        ? 'session_expired'
        : !online
          ? 'offline'
          : community.status === 'reconnecting'
            ? 'reconnect'
            : community.status === 'connecting'
              ? 'loading'
              : community.error || community.status === 'error'
                ? 'unavailable'
                : 'connected';
  const retry = async () => {
    setBusy(true);
    setError('');
    try {
      await community.refresh();
    } catch (e) {
      setError(uiError(e));
    } finally {
      setCheckedAt(Date.now());
      setBusy(false);
    }
  };
  if (fixtureState === 'splash') return <StartupSplash />;
  return (
    <SystemState
      kind={kind}
      busy={busy}
      error={error}
      checkedAt={checkedAt}
      voiceStatus={
        media.status === 'connected'
          ? t('bağlı')
          : media.status === 'reconnecting'
            ? t('yeniden bağlanıyor')
            : t('bağlı değil')
      }
      onRetry={() => void retry()}
      onReturn={() => navigate('/chat')}
      onSignIn={() => navigate('/setup/signin')}
    />
  );
}

export function StartupSplash() {
  return (
    <div className="reference-splash" role="status">
      <div>
        <img src="./reference-brand/brand/logo-lockup-lilac.svg" alt="Tayfa" />
        <h1>{t('Aynı yere dönmek güzel.')}</h1>
        <p>{t('Odan hazırlanıyor.')}</p>
        <progress aria-label={t('Uygulama açılıyor')} />
      </div>
    </div>
  );
}
