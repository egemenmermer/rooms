import { useEffect, useState } from 'react';
import { ArrowLeft, Clock, LoaderCircle, RefreshCw, Trash2, UserCheck, UserX } from 'lucide-react';
import { SIGNUP_POLL_MS, useSignup } from './signup-state';
import { uiError } from './i18n';

const formatTime = (iso: string | null) => {
  const time = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(time) ? new Date(time).toLocaleString('tr-TR') : null;
};

/**
 * The sign-up request this device sent, while signed out. Waiting, approved (create the
 * account), rejected and expired states; every state can be left with "Giriş ekranına dön".
 */
export function SignupPendingScreen({ onCreated }: { onCreated?(): void } = {}) {
  const signup = useSignup();
  const pending = signup.pending;
  const [email, setEmail] = useState(pending?.email ?? '');
  const [password, setPassword] = useState('');
  const [working, setWorking] = useState(false);
  const waiting = pending?.status === 'pending' || pending?.status === 'unknown';
  // Ask once when shown, then every 30 s while nobody has decided.
  useEffect(() => {
    void useSignup.getState().check();
  }, []);
  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(() => void useSignup.getState().check(), SIGNUP_POLL_MS);
    return () => clearInterval(timer);
  }, [waiting]);
  if (!pending) return null;
  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (working) return;
    setWorking(true);
    try {
      await signup.complete({ email: email.trim() || undefined, password });
      setPassword('');
      onCreated?.();
    } catch {
      // The store shows the error.
    } finally {
      setWorking(false);
    }
  };
  const back = (
    <button type="button" className="button secondary full" onClick={signup.hide}>
      <ArrowLeft size={16} />
      Giriş ekranına dön
    </button>
  );
  const forget = (label: string) => (
    <button
      type="button"
      className="button secondary full"
      disabled={working}
      onClick={() => void signup.cancel()}
    >
      <Trash2 size={16} />
      {label}
    </button>
  );
  const requested = formatTime(pending.createdAt);
  return (
    <section className="ref-auth-form ref-signup-pending" aria-busy={working || signup.checking}>
      {pending.ready ? (
        <>
          <UserCheck size={34} aria-hidden="true" />
          <h2>Onaylandın</h2>
          {signup.checking || working ? (
            <p role="status">
              <LoaderCircle size={16} className="spin" /> Hesabın oluşturuluyor…
            </p>
          ) : (
            <>
              <p>
                Topluluk yöneticisi isteğini onayladı. Hesabını oluşturmak ve topluluğa katılmak
                için şifreni gir. Şifren bu cihazda saklanmaz.
              </p>
              <form onSubmit={(e) => void create(e)}>
                <label className="field-label">
                  E-posta adresi
                  <input
                    required
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </label>
                <label className="field-label">
                  Şifre
                  <input
                    required
                    type="password"
                    autoComplete="new-password"
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="En az 8 karakter"
                  />
                </label>
                <button
                  className="button primary full"
                  type="submit"
                  disabled={working || password.length < 8}
                >
                  Hesabı oluştur ve katıl
                </button>
              </form>
            </>
          )}
          {back}
          {forget('İsteği bırak')}
        </>
      ) : pending.status === 'rejected' ? (
        <>
          <UserX size={34} aria-hidden="true" />
          <h2>Kayıt isteğin reddedildi</h2>
          <p>
            Topluluk yöneticisi bu isteği onaylamadı. Hesap oluşturulmadı. Bir yanlışlık olduğunu
            düşünüyorsan topluluktan birinden davet bağlantısı iste.
          </p>
          {forget('Tamam')}
        </>
      ) : pending.status === 'expired' || pending.status === 'issued' ? (
        <>
          <Clock size={34} aria-hidden="true" />
          <h2>
            {pending.status === 'expired' ? 'İsteğinin süresi doldu' : 'Bağlantı kullanılamıyor'}
          </h2>
          <p>
            {pending.status === 'expired'
              ? '14 gün içinde kimse karar vermediği için isteğin kapandı. İstersen yeni bir istek gönderebilirsin.'
              : 'Onay bağlantısı bu cihazda değil. Yeni bir istek gönder ya da topluluktan davet bağlantısı iste.'}
          </p>
          {forget('Yeni istek gönder')}
          {back}
        </>
      ) : (
        <>
          <span className="ref-signup-pending-icon" aria-hidden="true">
            <Clock size={30} />
          </span>
          <h2>Onay bekliyor</h2>
          <p role="status">
            {pending.username}, isteğin topluluk yöneticisine iletildi. Onaylanınca hesabın
            oluşturulur ve topluluğa katılırsın. Bu ekran kendiliğinden yenilenir; uygulamayı
            kapatırsan onaydan sonra şifreni yeniden girmen yeterli.
          </p>
          {requested && <p className="ref-auth-help">İstek zamanı: {requested}</p>}
          <button
            className="button primary full"
            disabled={signup.checking}
            onClick={() => void signup.check()}
          >
            <RefreshCw size={16} />
            {signup.checking ? 'Kontrol ediliyor…' : 'Durumu yenile'}
          </button>
          {back}
          {forget('İsteği geri çek')}
        </>
      )}
      {(signup.error || pending.error) && (
        <div className="ref-auth-notice error" role="alert">
          {signup.error || uiError(pending.error)}
        </div>
      )}
    </section>
  );
}
