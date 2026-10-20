import { useId } from 'react';
import {
  Check,
  Clock3,
  ExternalLink,
  Film,
  Link2,
  RefreshCw,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import './reference-rd-connection.css';

export interface ReferenceRDConnectionProps {
  state: 'initial' | 'waiting' | 'connected' | 'expired' | 'cancelled' | 'error';
  grant: { userCode: string; verificationUrl: string; expiresAt: string } | null;
  busy: boolean;
  available: boolean;
  canCancel: boolean;
  error: string | null;
  onStart(): void;
  onCancel(): void;
  onClose(): void;
  onOpenLibrary(): void;
  onRemove(): void;
}

const unavailableReason = 'Real-Debrid bağlantısı için güncel masaüstü uygulaması gerekli.';
const busyReason = 'Devam eden işlemin tamamlanması bekleniyor.';

function PersonalConnectionDetails() {
  return (
    <ul className="ref-rd-checks">
      <li>
        <Check size={15} aria-hidden="true" />
        Yalnızca senin kişisel hesabın
      </li>
      <li>
        <Check size={15} aria-hidden="true" />
        Kütüphanen ortak sohbetten ayrı
      </li>
      <li>
        <Check size={15} aria-hidden="true" />
        Bağlantıyı bu cihazdan kaldırabilirsin
      </li>
    </ul>
  );
}

/** Presentational only: the parent owns native authorization, expiry and cancellation. */
export function ReferenceRDConnection({
  state,
  grant,
  busy,
  available,
  canCancel,
  error,
  onStart,
  onCancel,
  onClose,
  onOpenLibrary,
  onRemove,
}: ReferenceRDConnectionProps) {
  const id = useId();
  const operationReason = busy ? busyReason : !available ? unavailableReason : undefined;
  const cancelReason =
    operationReason ??
    (!canCancel ? 'Bu uygulama sürümü bağlantı denemesini iptal edemiyor.' : undefined);
  const validGrant =
    state === 'waiting' &&
    grant !== null &&
    grant.userCode.trim().length > 0 &&
    grant.userCode.length <= 128 &&
    Number.isFinite(Date.parse(grant.expiresAt));
  // Match the native device-grant contract exactly; fixtures and arbitrary URLs cannot escape it.
  const verificationUrl =
    validGrant && grant?.verificationUrl === 'https://real-debrid.com/device'
      ? grant.verificationUrl
      : null;
  const linkReason =
    operationReason ??
    (!verificationUrl ? 'Geçerli sağlayıcı yetkilendirme adresi alınamadı.' : undefined);
  const retryLabel =
    state === 'initial'
      ? 'Bağlantıyı başlat'
      : state === 'cancelled'
        ? 'Tekrar başlat'
        : 'Kendi hesabımla yenile';

  return (
    <div className={`ref-rd-connection state-${state}`} aria-busy={busy}>
      <div className="ref-rd-body">
        {state === 'initial' && (
          <>
            <div className="ref-rd-account-card">
              <span className="ref-rd-provider-icon">
                <Link2 size={25} aria-hidden="true" />
              </span>
              <div>
                <h3>Kendi Real-Debrid hesabını bağla</h3>
                <p>Tarayıcıda sağlayıcının giriş sayfasında onay ver.</p>
              </div>
            </div>
            <p className="ref-rd-description">
              Bağlantıyı başlattığında sağlayıcının sayfası açılır. Parolanı yalnızca Real-Debrid'e
              gir.
            </p>
            <PersonalConnectionDetails />
          </>
        )}

        {state === 'waiting' && (
          <>
            {validGrant ? (
              <>
                <ol className="ref-rd-stepper" aria-label="Bağlantı adımları">
                  <li className="complete">
                    <span>
                      <Check size={12} aria-hidden="true" />
                    </span>
                    Başlatıldı
                  </li>
                  <li className="current" aria-current="step">
                    <span>2</span>Tarayıcıda onayla
                  </li>
                  <li>
                    <span>3</span>Tamamlanması bekleniyor
                  </li>
                </ol>
                <div className="ref-rd-code ref-media-code" aria-label="Cihaz doğrulama kodu">
                  <code>{grant!.userCode}</code>
                </div>
                <p className="ref-rd-description">
                  Sağlayıcının sayfasında kendi hesabına giriş yap ve bu kodu onayla.
                </p>
                <div className="ref-rd-notice pending" role="status">
                  <Clock3 size={17} aria-hidden="true" />
                  <div>
                    <strong>Onay bekleniyor.</strong> Kodun son geçerlilik zamanı:{' '}
                    <time dateTime={grant!.expiresAt}>
                      {new Date(grant!.expiresAt).toLocaleString('tr-TR', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </time>
                    .
                  </div>
                </div>
              </>
            ) : (
              <div className="ref-rd-notice warning" role="alert">
                <TriangleAlert size={18} aria-hidden="true" />
                <div>
                  <strong>Bağlantı kodu alınamadı.</strong> Bu denemeyi iptal edip yeniden başlat.
                </div>
              </div>
            )}
            {verificationUrl && !linkReason ? (
              <a
                className="button secondary ref-rd-verify"
                href={verificationUrl}
                target="_blank"
                rel="noopener noreferrer"
                tabIndex={0}
              >
                <ExternalLink size={16} aria-hidden="true" />
                Yetkilendirme sayfasını aç
              </a>
            ) : (
              <>
                <button
                  type="button"
                  className="button secondary ref-rd-verify"
                  disabled
                  title={linkReason}
                  aria-describedby={`${id}-link-reason`}
                >
                  <ExternalLink size={16} aria-hidden="true" />
                  Yetkilendirme sayfasını aç
                </button>
                <p className="ref-rd-reason" id={`${id}-link-reason`}>
                  {linkReason}
                </p>
              </>
            )}
            <p className="ref-rd-note">
              İptal etmek Tayfa'nın bu denemeyi tamamlamasını durdurur. Kod, sağlayıcıda süresi
              dolana kadar geçerli kalabilir.
            </p>
          </>
        )}

        {state === 'connected' && (
          <>
            <div className="ref-rd-account-card connected" role="status">
              <Check size={24} aria-hidden="true" />
              <div>
                <h3>Real-Debrid bağlandı</h3>
                <p>Kişisel bağlantın</p>
              </div>
              <span className="ref-rd-badge">Bağlı</span>
            </div>
            <PersonalConnectionDetails />
            <p className="ref-rd-description">
              Bağlantı bilgilerin ve kişisel oynatma adreslerin diğer kullanıcılarla paylaşılmaz.
            </p>
          </>
        )}

        {state === 'cancelled' && (
          <div className="ref-rd-cancelled" role="status">
            <Link2 size={38} aria-hidden="true" />
            <h3>Onay kontrolü durduruldu.</h3>
            <p>
              Tayfa bu denemeyi tamamlamayacak. Kod, sağlayıcıda süresi dolana kadar geçerli
              kalabilir.
            </p>
          </div>
        )}

        {(state === 'expired' || state === 'error') && (
          <>
            <div className="ref-rd-notice warning" role="alert">
              <TriangleAlert size={18} aria-hidden="true" />
              <div>
                <strong>
                  {state === 'expired'
                    ? 'Yetkilendirme kodunun süresi doldu.'
                    : 'Yetkilendirme tamamlanamadı.'}
                </strong>{' '}
                {state === 'expired'
                  ? 'Kendi hesabında yeniden onay vererek bağlantıyı başlat.'
                  : error || 'Bağlantı sonucu doğrulanamadı. Yeniden deneyebilirsin.'}
              </div>
            </div>
            <PersonalConnectionDetails />
          </>
        )}
        {error && state !== 'error' && (
          <div className="ref-rd-notice warning" role="alert">
            <TriangleAlert size={18} aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}
        {operationReason && (
          <p className="ref-rd-reason" id={`${id}-operation-reason`} role="status">
            {operationReason}
          </p>
        )}
        {state === 'waiting' && !operationReason && cancelReason && (
          <p className="ref-rd-reason" id={`${id}-cancel-reason`}>
            {cancelReason}
          </p>
        )}
      </div>
      <div className="ref-media-modal-footer ref-rd-footer">
        {state === 'connected' ? (
          <>
            <button
              type="button"
              className="ref-rd-remove"
              disabled={!!operationReason}
              title={operationReason}
              aria-describedby={operationReason ? `${id}-operation-reason` : undefined}
              onClick={onRemove}
            >
              <Trash2 size={15} aria-hidden="true" />
              Bağlantıyı kaldır
            </button>
            <button
              type="button"
              className="button primary"
              disabled={!!operationReason}
              title={operationReason}
              aria-describedby={operationReason ? `${id}-operation-reason` : undefined}
              onClick={onOpenLibrary}
            >
              <Film size={16} aria-hidden="true" />
              Kütüphanemi aç
            </button>
          </>
        ) : state === 'waiting' ? (
          <button
            type="button"
            className="button secondary"
            disabled={!!cancelReason}
            title={cancelReason}
            aria-describedby={
              cancelReason ? `${id}-${operationReason ? 'operation' : 'cancel'}-reason` : undefined
            }
            onClick={onCancel}
          >
            Onay kontrolünü durdur
          </button>
        ) : (
          <>
            <button
              type="button"
              className="button secondary"
              disabled={busy}
              title={busy ? busyReason : undefined}
              aria-describedby={busy ? `${id}-operation-reason` : undefined}
              onClick={onClose}
            >
              {state === 'initial'
                ? 'Şimdi değil'
                : state === 'cancelled'
                  ? 'Kişisel medyama dön'
                  : 'Şimdilik kapat'}
            </button>
            <button
              type="button"
              className="button primary"
              disabled={!!operationReason}
              title={operationReason}
              aria-describedby={operationReason ? `${id}-operation-reason` : undefined}
              onClick={onStart}
            >
              {state === 'initial' ? (
                <ExternalLink size={16} aria-hidden="true" />
              ) : (
                <RefreshCw size={16} aria-hidden="true" />
              )}
              {retryLabel}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
