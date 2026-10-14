import { Modal } from '@rooms/design';
import { ReferenceIcon } from './ReferenceIcon';

export interface CinemaSourceReadiness {
  duration: number;
  expectedDuration: number | null;
  mediaReady: boolean;
  buffering: boolean;
  error: string;
  confirmed: boolean;
  connected: boolean;
  busy: boolean;
}

/** Duration agreement is a readiness constraint, never proof of identical content. */
export function cinemaSourceReadiness(value: CinemaSourceReadiness) {
  const validDuration = Number.isFinite(value.duration) && value.duration > 0;
  const mismatch =
    validDuration &&
    value.expectedDuration !== null &&
    Math.abs(value.expectedDuration - value.duration) > 2;
  const invalidReferenceDuration =
    value.expectedDuration !== null &&
    (!Number.isFinite(value.expectedDuration) || value.expectedDuration <= 0);
  const loading =
    !validDuration || invalidReferenceDuration || !value.mediaReady || value.buffering;
  const canJoin =
    value.connected && !value.busy && value.confirmed && !value.error && !loading && !mismatch;
  return { mismatch, loading, canJoin };
}

const formatTime = (value: number) => {
  const seconds = Math.max(0, Math.floor(Number.isFinite(value) ? value : 0));
  return `${Math.floor(seconds / 3600) ? `${Math.floor(seconds / 3600)}:` : ''}${String(Math.floor(seconds / 60) % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
};

export function CinemaSourceCheck({
  title,
  sourceName,
  position,
  readiness,
  onConfirm,
  onChoose,
  onJoin,
  onClose,
  nativeAvailable,
}: {
  title: string;
  sourceName: string;
  position: number;
  readiness: CinemaSourceReadiness;
  onConfirm(value: boolean): void;
  onChoose(): void;
  onJoin(): void;
  onClose(): void;
  nativeAvailable: boolean;
}) {
  const state = cinemaSourceReadiness(readiness);
  const late = position > 1;
  return (
    <Modal
      title={late ? 'Kaldığınız yerden katıl' : 'Kendi kaynağını seç'}
      className="reference-cinema-source-modal cinema-source-check-modal"
      onClose={onClose}
    >
      <div className="reference-cinema-source-summary">
        <span className="reference-cinema-item-mark">
          <ReferenceIcon name="film" size={26} />
        </span>
        <div>
          <strong>{title}</strong>
          <small>
            Odadaki içerik
            {readiness.expectedDuration !== null
              ? ` · ${formatTime(readiness.expectedDuration)}`
              : ''}
          </small>
        </div>
        <span className="cinema-source-check-pill">{late ? 'Devam ediyor' : 'Güncel içerik'}</span>
      </div>
      <p className="cinema-source-check-label">Kişisel kaynak</p>
      <button
        className="cinema-source-check-choice selected"
        onClick={onChoose}
        disabled={!nativeAvailable || readiness.busy}
        title={!nativeAvailable ? 'Yerel dosya seçimi masaüstü uygulaması gerektirir.' : undefined}
      >
        <span className="reference-cinema-mode-icon">
          <ReferenceIcon name="upload" size={22} />
        </span>
        <span>
          <strong>{sourceName}</strong>
          <small>Bu cihazdan seçilen dosya</small>
        </span>
        <ReferenceIcon name="check" size={18} />
      </button>
      <div className="cinema-source-check-steps" aria-live="polite">
        {readiness.error ? (
          <div className="cinema-source-check-notice error" role="alert">
            <ReferenceIcon name="alert" size={20} />
            <div>
              <strong>Kaynak okunamadı</strong>
              <p>{readiness.error}</p>
            </div>
          </div>
        ) : state.mismatch ? (
          <div className="cinema-source-check-notice warning" role="alert">
            <ReferenceIcon name="alert" size={20} />
            <div>
              <strong>Süreler farklı</strong>
              <p>
                Seçtiğin kaynak {formatTime(readiness.duration)}, odadaki içerik{' '}
                {formatTime(readiness.expectedDuration ?? 0)}. Aynı kurguya ait bir kaynak seç.
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className={state.loading ? 'pending' : 'ready'}>
              <ReferenceIcon name={state.loading ? 'refresh' : 'check'} size={16} />
              <span>{state.loading ? 'Kaynak hazırlanıyor' : 'Kaynak açılabiliyor'}</span>
              <small>
                {readiness.duration > 0 ? formatTime(readiness.duration) : 'Bekleniyor'}
              </small>
            </div>
            <div className={state.loading ? 'pending' : 'ready'}>
              <ReferenceIcon name={state.loading ? 'clock' : 'check'} size={16} />
              <span>Oda konumu</span>
              <small>{formatTime(position)}</small>
            </div>
            <div className="ready">
              <ReferenceIcon name="lock" size={16} />
              <span>Kişisel kaynak paylaşılmaz</span>
              <small>Bu cihazda</small>
            </div>
          </>
        )}
      </div>
      <label className="cinema-source-check-confirm">
        <input
          type="checkbox"
          checked={readiness.confirmed}
          onChange={(event) => onConfirm(event.target.checked)}
        />
        Dosya odadaki içerikle aynı; bu kaynağa erişimim var.
      </label>
      <p className="reference-cinema-privacy">
        <ReferenceIcon name="lock" size={15} />
        Süre benzerliği aynı içeriği doğrulamaz. Dosya yolu ve oynatma adresi odaya gönderilmez.
      </p>
      {!readiness.connected && (
        <p className="reference-cinema-reason" role="status">
          Etkinlik bağlantısı gerekli.
        </p>
      )}
      <footer className="cinema-source-check-footer">
        <button className="button secondary" onClick={onClose}>
          Geri
        </button>
        {readiness.error || state.mismatch ? (
          <button
            className="button primary"
            disabled={!nativeAvailable || readiness.busy}
            title={!nativeAvailable ? 'Masaüstü uygulaması gerekli.' : undefined}
            onClick={onChoose}
          >
            <ReferenceIcon name="refresh" size={17} />
            Başka kaynak seç
          </button>
        ) : (
          <button
            className="button primary"
            disabled={!state.canJoin}
            title={
              !readiness.confirmed
                ? 'İçeriği ve erişim yetkini onayla.'
                : state.loading
                  ? 'Kaynağın yüklenmesini bekle.'
                  : !readiness.connected
                    ? 'Etkinlik bağlantısı gerekli.'
                    : undefined
            }
            onClick={onJoin}
          >
            <ReferenceIcon name="play" size={17} />
            {readiness.busy
              ? 'Hazırlanıyor'
              : late
                ? `${formatTime(position)} konumundan katıl`
                : 'Hazırım, katıl'}
          </button>
        )}
      </footer>
    </Modal>
  );
}
