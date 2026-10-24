import { defaultServer } from './default-server';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  ChevronRight,
  Mail,
  Mic,
  Monitor,
  Users,
  Video,
} from 'lucide-react';
import { inviteAppLink, inviteShareLink, parseInviteLink, type SocialInvite } from '@rooms/social';
import type { SocialBridge, SocialPasswordRecoveryCapabilities } from '@rooms/contracts';
import { PasswordResetPane } from './PasswordResetPane';
import { ConnectionPane, sameInviteServer } from './ConnectionPane';
import { SelfHostSteps } from './SelfHostSteps';
import { START_PANEL_ID, StartTabs, startTabId } from './StartTabs';
import { VoiceAvatar } from './VoiceAvatar';
import { useCommunity } from './community';
import { useRooms } from './store';
import { t, uiError } from './i18n';
import './reference-onboarding.css';

export type ReferenceOnboardingMode =
  'welcome' | 'signin' | 'register' | 'selfhost' | 'recovery' | 'invite' | 'profile' | 'devices';

export const SESSION_EXPIRED_MESSAGE = t('Oturumunun süresi doldu. Çıkış yapıp yeniden giriş yap.');

/**
 * Tab the start screen opens on: an invitation always means signing up; someone who has used a
 * server before (or whose session expired) most likely wants to sign in again.
 */
export function defaultStartTab(params: URLSearchParams): 'register' | 'signin' {
  if (params.get('invite')) return 'register';
  const c = useCommunity.getState();
  const expired = !c.user && c.status === 'error' && c.error === SESSION_EXPIRED_MESSAGE;
  return expired || useRooms.getState().preferences.serverUrl.trim() ? 'signin' : 'register';
}
export interface ReferenceOnboardingProps {
  mode: ReferenceOnboardingMode;
  onNavigate(mode: ReferenceOnboardingMode): void;
  onComplete?(): void;
  onOpenSettings?(tab: 'profile' | 'audio'): void;
}

/** Account-neutral recovery request; reset link ingress is a separate main-only operation. */
export function PasswordRecoveryPane({
  serverUrl,
  onBack,
  onReset,
  bridge,
}: {
  serverUrl: string;
  onBack(): void;
  onReset?(): void;
  bridge?: Pick<SocialBridge, 'passwordRecoveryCapabilities' | 'requestPasswordRecovery'> | null;
}) {
  const social = bridge === undefined ? window.rooms?.social : bridge;
  const [email, setEmail] = useState('');
  const [capabilities, setCapabilities] = useState<SocialPasswordRecoveryCapabilities | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState('');
  const generation = useRef(0);
  const notice = useRef<HTMLDivElement>(null);
  const load = async () => {
    const epoch = ++generation.current;
    setLoading(true);
    setCapabilities(null);
    setError('');
    setAccepted(false);
    setBusy(false);
    if (!serverUrl.trim()) {
      setLoading(false);
      setError(t('Giriş ekranından sunucu adresini seç.'));
      return;
    }
    try {
      if (!social?.passwordRecoveryCapabilities)
        throw new Error(t('Kurtarma isteği yalnızca masaüstü uygulamasında kullanılabilir.'));
      const result = await social.passwordRecoveryCapabilities(serverUrl);
      if (epoch === generation.current) setCapabilities(result);
    } catch {
      if (epoch === generation.current)
        setError(
          t(
            'Sunucunun kurtarma ayarları alınamadı. Bağlantını ve giriş ekranındaki sunucu adresini kontrol et.',
          ),
        );
    } finally {
      if (epoch === generation.current) setLoading(false);
    }
  };
  useEffect(() => {
    setEmail('');
    void load();
    return () => {
      generation.current++;
    };
  }, [serverUrl, social]);
  useEffect(() => {
    if (accepted || error) notice.current?.focus();
  }, [accepted, error]);
  const reason = loading
    ? t('Sunucu ayarları alınıyor…')
    : !social?.requestPasswordRecovery
      ? t('Kurtarma isteği yalnızca masaüstü uygulamasında kullanılabilir.')
      : !capabilities
        ? t('Sunucunun kurtarma ayarları doğrulanamadı.')
        : !capabilities.emailEnabled
          ? t('Sunucuda kurtarma e-postası yapılandırılmamış.')
          : capabilities.captcha.required
            ? t('Sunucu hCaptcha doğrulaması istiyor. Kurtarmayı Stoat web uygulamasından başlat.')
            : null;
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (reason || busy || !email.trim() || !social) return;
    const epoch = ++generation.current;
    setBusy(true);
    setError('');
    try {
      await social.requestPasswordRecovery({ serverUrl, email: email.trim() });
      if (epoch === generation.current) {
        setEmail('');
        setAccepted(true);
      }
    } catch {
      if (epoch === generation.current)
        setError(t('Kurtarma isteği tamamlanamadı. Biraz bekleyip yeniden dene.'));
    } finally {
      if (epoch === generation.current) setBusy(false);
    }
  };
  return (
    <div className="ref-auth-recovery" aria-busy={loading || busy}>
      <h2>{t('Şifre kurtarma')}</h2>
      {accepted ? (
        <div className="ref-auth-notice recovery-accepted" role="status" tabIndex={-1} ref={notice}>
          <Mail size={18} />
          <span>
            {t(
              'İstek kabul edildi. Hesap uygunsa sunucunun e-posta kurtarma bağlantısıyla devam edebilirsin.',
            )}
          </span>
        </div>
      ) : (
        <>
          <p className="ref-auth-help">{t('Kayıtlı e-posta adresi')}</p>
          <form onSubmit={(event) => void submit(event)}>
            <label className="field-label">
              {t('E-posta adresi')}
              <input
                required
                type="email"
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
                maxLength={254}
                value={email}
                disabled={busy}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
            {reason && (
              <div className="ref-auth-notice" role="status">
                <Mail size={17} />
                <span>{reason}</span>
              </div>
            )}
            <button
              className="button primary full"
              disabled={!!reason || busy || !email.trim()}
              title={reason ?? undefined}
            >
              {busy ? t('İstek gönderiliyor…') : t('Kurtarma isteği gönder')}
              <ArrowRight size={16} />
            </button>
          </form>
          {error && (
            <div className="ref-auth-notice error" role="alert" tabIndex={-1} ref={notice}>
              {error}
            </div>
          )}
          {!loading && !capabilities && (
            <button className="button secondary full" onClick={() => void load()}>
              {t('Yeniden bağlan')}
            </button>
          )}
        </>
      )}
      {onReset && (
        <button className="button secondary full" disabled={busy} onClick={onReset}>
          {t('Kurtarma bağlantım var')}
        </button>
      )}
      <button className="ref-auth-back" onClick={onBack}>
        <ArrowLeft size={14} />
        {t('Giriş ekranına dön')}
      </button>
    </div>
  );
}

export function ReferenceAuthFrame({
  mode,
  children,
}: {
  mode: ReferenceOnboardingMode;
  children: React.ReactNode;
}) {
  return (
    <main className={`ref-onboarding mode-${mode}`}>
      <div className="ref-auth-content">
        <aside className="ref-auth-art" aria-label="Tayfa">
          <div className="ref-auth-wordmark">
            <img src="./reference-brand/brand/logo-symbol-lilac.svg" alt="" />
            Tayfa
          </div>
          <div className="ref-auth-sculpture" aria-hidden="true">
            <div className="ref-auth-portal" />
          </div>
        </aside>
        <div className="ref-auth-panel">{children}</div>
      </div>
    </main>
  );
}

/** Reference geometry with real native account operations; no prototype scenario state. */
export function ReferenceOnboarding({
  mode,
  onNavigate,
  onComplete,
  onOpenSettings,
}: ReferenceOnboardingProps) {
  const c = useCommunity();
  const recoveryServer = useRooms((state) => state.preferences.serverUrl.trim() || defaultServer);
  const [recoveryView, setRecoveryView] = useState<'request' | 'reset'>('request');
  const resetBridge = window.rooms?.social;
  const resetAvailable =
    !!resetBridge &&
    [
      resetBridge.importPasswordRecoveryLink,
      resetBridge.confirmPasswordRecovery,
      resetBridge.cancelPasswordRecovery,
    ].every((method) => typeof method === 'function');
  const recoveryScope = `${c.serverUrl}:${c.user?.id ?? 'signed-out'}:${c.status}`;
  const sessionExpired = !c.user && c.status === 'error' && c.error === SESSION_EXPIRED_MESSAGE;
  const [params, setParams] = useSearchParams();
  const [link, setLink] = useState(() => {
    const code = params.get('invite') || '',
      from = params.get('server') || '';
    return (from && (inviteShareLink(from, code) ?? inviteAppLink(from, code))) || code;
  });
  const [server, setServer] = useState(
    () => params.get('server') || c.serverUrl || useRooms.getState().preferences.serverUrl,
  );
  const [invite, setInvite] = useState<SocialInvite | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState(c.user?.displayName || c.user?.username || '');
  const [status, setStatus] = useState('');
  const [permissions, setPermissions] = useState<{
    microphone: string;
    camera: string;
    screen: string;
  } | null>(null);
  const request = useRef(0);
  const errorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);
  useEffect(() => {
    setName(c.user?.displayName || c.user?.username || '');
  }, [c.user?.id, c.user?.displayName, c.user?.username]);
  useEffect(() => {
    let active = true;
    setBusy(false);
    setError('');
    setRecoveryView('request');
    if (mode === 'devices' && window.rooms)
      void window.rooms.media
        .captureStatus()
        .then((status) => {
          if (active) setPermissions(status);
        })
        .catch((e) => {
          if (active) setError(uiError(e));
        });
    return () => {
      active = false;
      request.current++;
    };
  }, [mode]);
  const inspect = async () => {
    if (busy || !link.trim()) return;
    const parsed = parseInviteLink(link, {
      fallbackServer: params.get('server') || c.serverUrl || defaultServer,
    });
    setError('');
    setInvite(null);
    if (!parsed) {
      setError(
        t(
          'Bu bir Tayfa davet bağlantısı değil. Seni davet eden kişinin gönderdiği bağlantıyı yapıştır.',
        ),
      );
      return;
    }
    const epoch = ++request.current;
    setBusy(true);
    try {
      if (!window.rooms)
        throw new Error(t('Davetler yalnızca masaüstü uygulamasında doğrulanabilir.'));
      const result = await window.rooms.social.inspectInvite(parsed.serverUrl, parsed.code);
      if (epoch !== request.current) return;
      setServer(parsed.serverUrl);
      setInvite(result);
      const next = new URLSearchParams(params);
      next.set('invite', parsed.code);
      next.set('server', parsed.serverUrl);
      setParams(next, { replace: true });
    } catch (e) {
      if (epoch === request.current) setError(uiError(e));
    } finally {
      if (epoch === request.current) setBusy(false);
    }
  };
  const join = async () => {
    if (busy || !invite || !c.user) return;
    setBusy(true);
    setError('');
    try {
      await c.acceptInvite(invite.code);
      const next = new URLSearchParams(params);
      next.delete('invite');
      setParams(next, { replace: true });
      // Someone already signed in joined another community: no first-run steps again.
      if (onComplete) onComplete();
      else onNavigate('profile');
    } catch (e) {
      setError(uiError(e));
    } finally {
      setBusy(false);
    }
  };
  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || !c.user || !name.trim()) return;
    setBusy(true);
    setError('');
    try {
      if (!window.rooms)
        throw new Error(t('Profil yalnızca masaüstü uygulamasında kaydedilebilir.'));
      const user = await window.rooms.social.updateProfile({
        displayName: name.trim(),
        ...(status.trim() ? { statusText: status.trim() } : {}),
      });
      useCommunity.setState({ user });
      onNavigate('devices');
    } catch (e) {
      setError(uiError(e));
    } finally {
      setBusy(false);
    }
  };
  const expires = invite?.expiresAt ? Date.parse(invite.expiresAt) : NaN;
  const expired = Number.isFinite(expires) && expires <= Date.now();
  const sameServer = sameInviteServer(c.serverUrl || '', server || '');
  const configure = (tab: 'profile' | 'audio') => onOpenSettings?.(tab);
  const settingsReason = onOpenSettings ? undefined : t('Ayarlar bu görünümde henüz bağlanmadı.');
  return (
    <ReferenceAuthFrame mode={mode}>
      {mode === 'signin' || mode === 'register' || mode === 'selfhost' ? (
        <div className="ref-start">
          <StartTabs active={mode} onSelect={onNavigate} />
          <div role="tabpanel" id={START_PANEL_ID} aria-labelledby={startTabId(mode)}>
            {mode === 'selfhost' ? (
              <SelfHostSteps onSignIn={() => onNavigate('signin')} />
            ) : (
              <ConnectionPane
                referenceMode={mode}
                sessionExpired={sessionExpired}
                // Profile and device steps are for a new account; signing in goes to the app.
                onAuthenticated={() =>
                  mode === 'register' || !onComplete ? onNavigate('profile') : onComplete()
                }
                onRecovery={() => onNavigate('recovery')}
              />
            )}
          </div>
        </div>
      ) : (
        <section className="ref-auth-form" aria-busy={busy}>
          {(mode === 'profile' || mode === 'devices') && (
            <div
              className="ref-auth-steps"
              aria-label={t('Kurulum: {step}. adım', { step: mode === 'profile' ? 1 : 2 })}
            >
              <i className="active" />
              <i className={mode === 'devices' ? 'active' : ''} />
            </div>
          )}
          {mode === 'recovery' &&
            (recoveryView === 'reset' ? (
              <PasswordResetPane
                key={recoveryScope + recoveryServer}
                serverUrl={recoveryServer}
                scopeKey={recoveryScope}
                bridge={resetAvailable ? resetBridge : null}
                onBack={() => onNavigate('signin')}
                onNewRequest={() => setRecoveryView('request')}
              />
            ) : (
              <PasswordRecoveryPane
                serverUrl={recoveryServer}
                onBack={() => onNavigate('signin')}
                onReset={() => setRecoveryView('reset')}
              />
            ))}
          {mode === 'invite' && (
            <>
              <h2>{expired ? t('Davetin süresi doldu') : t('Topluluk daveti')}</h2>
              <p>
                {invite
                  ? t('Topluluk davetini incele.')
                  : t('Arkadaşından gelen davet bağlantısını yapıştır.')}
              </p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void inspect();
                }}
              >
                <fieldset disabled={busy}>
                  <label className="field-label">
                    {t('Davet bağlantısı')}
                    <input
                      required
                      autoComplete="off"
                      autoCapitalize="none"
                      maxLength={4096}
                      spellCheck={false}
                      value={link}
                      placeholder="https://…/davet/…"
                      onChange={(e) => {
                        setLink(e.target.value);
                        setInvite(null);
                        setError('');
                      }}
                    />
                  </label>
                  <button className="button secondary full" disabled={busy || !link.trim()}>
                    {busy ? t('Davet açılıyor…') : t('Daveti aç')}
                    <ChevronRight size={16} />
                  </button>
                </fieldset>
              </form>
              {invite && (
                <div className="ref-auth-invite">
                  <span className="ref-auth-community-icon">
                    <Users size={25} />
                  </span>
                  <h3>{invite.space?.name || invite.channel?.name || t('Topluluk')}</h3>
                  {invite.channel?.name && <p>#{invite.channel.name}</p>}
                  {expired ? (
                    <div className="ref-auth-notice">{t('Arkadaşından yeni bir davet iste.')}</div>
                  ) : c.user ? (
                    <>
                      <button
                        className="button primary full"
                        disabled={busy || !sameServer}
                        onClick={() => void join()}
                      >
                        {t('Daveti kabul et')}
                        <ArrowRight size={16} />
                      </button>
                      {!sameServer && (
                        <>
                          <p className="ref-auth-help">
                            {t(
                              'Bu davet başka bir sunucuda. Çıkış yapınca davetle kayıt olabilir ya da o sunucudaki hesabınla giriş yapabilirsin.',
                            )}
                          </p>
                          {/* Signed out, App sends /setup/invite with these params to Kayıt ol. */}
                          <button
                            className="button secondary full"
                            disabled={busy}
                            onClick={() => {
                              setBusy(true);
                              void c
                                .logout()
                                .catch((e) => setError(uiError(e)))
                                .finally(() => setBusy(false));
                            }}
                          >
                            {t('Çıkış yap ve davetle devam et')}
                            <ArrowRight size={16} />
                          </button>
                        </>
                      )}
                    </>
                  ) : (
                    <button className="button primary full" onClick={() => onNavigate('register')}>
                      {t('Kayıt ol ve katıl')}
                      <ArrowRight size={16} />
                    </button>
                  )}
                </div>
              )}
              <button
                className="ref-auth-back"
                disabled={busy || !onComplete}
                onClick={() => onComplete?.()}
              >
                <ArrowLeft size={14} />
                {t('Geri dön')}
              </button>
            </>
          )}
          {mode === 'profile' && (
            <>
              <h2>{t('Profil')}</h2>
              {c.user ? (
                <form onSubmit={(e) => void saveProfile(e)}>
                  <fieldset disabled={busy}>
                    <div className="ref-auth-avatar">
                      <VoiceAvatar id={c.user.id} name={name || c.user.username} large />
                      <button
                        type="button"
                        className="button secondary"
                        disabled={!onOpenSettings}
                        title={settingsReason}
                        onClick={() => configure('profile')}
                      >
                        {t('Avatar seç')}
                      </button>
                    </div>
                    <label className="field-label">
                      {t('Görünen ad')}
                      <input
                        required
                        maxLength={32}
                        autoComplete="nickname"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                      />
                    </label>
                    <label className="field-label">
                      {t('Durum')}
                      <input
                        maxLength={128}
                        value={status}
                        onChange={(e) => setStatus(e.target.value)}
                      />
                    </label>
                    <p className="ref-auth-help">
                      {t('Bunları daha sonra profilinden değiştirebilirsin.')}
                    </p>
                    <button className="button primary full" disabled={busy || !name.trim()}>
                      {busy ? t('Kaydediliyor…') : t('Devam et')}
                      <ArrowRight size={16} />
                    </button>
                    <button
                      type="button"
                      className="ref-auth-back"
                      onClick={() => onNavigate('devices')}
                    >
                      {t('Şimdilik atla')}
                    </button>
                  </fieldset>
                </form>
              ) : (
                <>
                  <div className="ref-auth-notice">
                    {t('Profilini hazırlamak için önce hesabına giriş yap.')}
                  </div>
                  <button className="button primary full" onClick={() => onNavigate('signin')}>
                    {t('Giriş yap')}
                  </button>
                </>
              )}
            </>
          )}
          {mode === 'devices' && (
            <>
              <h2>{t('Cihazlar')}</h2>
              <p>{t('İzinleri yalnızca ilgili özelliği kullandığında isteyeceğiz.')}</p>
              {permissions?.microphone === 'denied' && (
                <div className="ref-auth-notice warning">
                  {t(
                    'Mikrofon izni kapalı. Ses ve video ayarlarından sistem izinlerini açabilirsin.',
                  )}
                </div>
              )}
              <div className="ref-auth-permission">
                <Mic size={22} />
                <div>
                  <strong>{t('Mikrofon')}</strong>
                  <p>
                    {permissions?.microphone === 'granted'
                      ? t('İzin verildi')
                      : permissions?.microphone === 'denied'
                        ? t('İzin kapalı')
                        : t('Sesli konuşmak için')}
                  </p>
                </div>
                <button
                  className="button secondary small"
                  disabled={!onOpenSettings}
                  title={settingsReason}
                  onClick={() => configure('audio')}
                >
                  {t('Ayarlar')}
                </button>
              </div>
              <div className="ref-auth-permission">
                <Video size={22} />
                <div>
                  <strong>{t('Kamera')}</strong>
                  <p>{t('İlk görüntülü görüşmede seçebilirsin.')}</p>
                </div>
                <span>{t('İsteğe bağlı')}</span>
              </div>
              <div className="ref-auth-permission">
                <Monitor size={22} />
                <div>
                  <strong>{t('Ekran paylaşımı')}</strong>
                  <p>{t('Paylaşımı başlatırken izin istenir.')}</p>
                </div>
                <span>{t('Sonra')}</span>
              </div>
              <div className="ref-auth-device-card">
                <span>{t('Giriş cihazı')}</span>
                <strong>{t('Ses ve video ayarlarından seç')}</strong>
                <button
                  className="button secondary full"
                  disabled={!onOpenSettings}
                  title={settingsReason}
                  onClick={() => configure('audio')}
                >
                  <Mic size={15} />
                  {t('Mikrofonu dene')}
                </button>
              </div>
              <button
                className="button primary full"
                disabled={!onComplete}
                title={
                  onComplete ? undefined : t('Topluluk bağlantısı bu görünümde henüz bağlanmadı.')
                }
                onClick={onComplete}
              >
                {t('Topluluğuma gir')}
                <ArrowRight size={16} />
              </button>
              <p className="ref-auth-footer">{t('Sistem izinleri macOS tarafından gösterilir.')}</p>
            </>
          )}
          {error && (
            <div className="ref-auth-notice error" ref={errorRef} tabIndex={-1} role="alert">
              {error}
            </div>
          )}
        </section>
      )}
    </ReferenceAuthFrame>
  );
}
