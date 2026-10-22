import { defaultServer } from './default-server';
import { tr, uiError } from './i18n';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, Eye, EyeOff, Globe, LoaderCircle, LogOut, Users } from 'lucide-react';
import { Avatar } from '@rooms/design';
import {
  LEGACY_INVITE_CODE_PATTERN,
  inviteOrigin,
  inviteServerUrl,
  parseInviteLink,
  type InviteLink,
  type SocialInvite,
} from '@rooms/social';
import { SERVER_UNREACHABLE_MESSAGE, useCommunity } from './community';
import { useRooms } from './store';
import './onboarding.css';
const normalizedServer = (value: string) => value.trim().replace(/\/+$/, '');
const serverHost = (value: string) => {
  try {
    return new URL(normalizedServer(value)).host;
  } catch {
    return value.trim();
  }
};
/** Two addresses name the same community server when their public origins match (`/api` aside). */
export const sameInviteServer = (a: string, b: string) => {
  const origin = inviteOrigin(normalizedServer(a));
  return !!origin && origin === inviteOrigin(normalizedServer(b));
};
/** How a new person joins: with an invitation link, or by asking an admin to approve them. */
export type SignupKind = 'invite' | 'approval';
const NOT_AN_INVITE =
  'Bu bir Tayfa davet bağlantısı değil. Seni davet eden kişinin gönderdiği bağlantıyı yapıştır.';
const formatExpiry = (iso: string | null | undefined) => {
  const time = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(time) ? new Date(time).toLocaleString('tr-TR') : null;
};
/** An invitation that arrived through `?server=…&invite=…` (deep link or landing page). */
const linkFromParams = (server: string | null, code: string | null): InviteLink | null => {
  const serverUrl = server ? inviteServerUrl(normalizedServer(server)) : null;
  return serverUrl && code && LEGACY_INVITE_CODE_PATTERN.test(code) ? { serverUrl, code } : null;
};

export function ConnectionPane({
  referenceMode,
  sessionExpired = false,
  onAuthenticated,
  onRecovery,
}: {
  sessionExpired?: boolean;
  referenceMode?: 'signin' | 'register';
  onAuthenticated?(): void;
  onRecovery?(): void;
} = {}) {
  const c = useCommunity();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const registration = referenceMode === 'register';
  const savedServer = () => useRooms.getState().preferences.serverUrl || defaultServer;
  const fromLink = linkFromParams(params.get('server'), params.get('invite'));
  const [server, setServer] = useState(() => fromLink?.serverUrl || savedServer());
  const [link, setLink] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [preview, setPreview] = useState<SocialInvite | null>(null);
  const [previewError, setPreviewError] = useState('');
  const [localError, setLocalError] = useState('');
  const [working, setWorking] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [signupKind, setSignupKind] = useState<SignupKind>('invite');
  /** Approved sign-up on the typed server: null while unknown or being checked. */
  const [approvalOpen, setApprovalOpen] = useState<boolean | null>(null);
  const [approvalCheckError, setApprovalCheckError] = useState('');
  const errorRef = useRef<HTMLDivElement>(null);
  const busy = c.busy || working;
  const error = localError || c.error;
  const pasted = link.trim() ? parseInviteLink(link, { fallbackServer: savedServer() }) : null;
  const linkInvalid = !!link.trim() && !pasted;
  const signupInvite = fromLink ?? pasted;
  const approval = registration && !fromLink && signupKind === 'approval';
  const approvalServer = normalizedServer(server);
  const approvalUrlValid = /^https?:\/\/[^/\s]+/i.test(approvalServer);
  useEffect(() => {
    setApprovalOpen(null);
    setApprovalCheckError('');
    if (!approval || !approvalUrlValid || !window.rooms?.social) return;
    let stale = false;
    const timer = setTimeout(() => {
      window.rooms!.social.signupAvailable(approvalServer).then(
        (open) => {
          if (!stale) setApprovalOpen(open);
        },
        (err) => {
          if (!stale) setApprovalCheckError(uiError(err));
        },
      );
    }, 400);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [approval, approvalServer]);
  const fromLinkKey = fromLink ? `${fromLink.serverUrl} ${fromLink.code}` : '';
  useEffect(() => {
    if (!fromLink) return;
    let stale = false;
    setServer(fromLink.serverUrl);
    setPreview(null);
    setPreviewError('');
    if (window.rooms?.social)
      window.rooms.social
        .inspectInvite(fromLink.serverUrl, fromLink.code)
        .then((value) => {
          if (!stale) setPreview(value);
        })
        .catch((err) => {
          if (!stale) setPreviewError(uiError(err));
        });
    return () => {
      stale = true;
    };
    // fromLink is rebuilt each render; its key carries the identity.
  }, [fromLinkKey]);
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);
  const clearError = () => {
    setLocalError('');
    c.clearError();
  };
  const forgetLink = () => {
    const next = new URLSearchParams(params);
    next.delete('invite');
    next.delete('server');
    next.delete('access');
    setParams(next, { replace: true });
    setPreview(null);
    setPreviewError('');
  };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    clearError();
    setWorking(true);
    try {
      if (approval) {
        await c.requestSignup({
          serverUrl: approvalServer,
          email: email.trim(),
          password,
          username: username.trim(),
        });
        if (!useCommunity.getState().user)
          throw new Error('Sunucu bir hesap oturumu döndürmedi. Yeniden giriş yap.');
        useRooms.getState().setPreference('serverUrl', approvalServer);
      } else if (registration) {
        if (!signupInvite) throw new Error(NOT_AN_INVITE);
        await c.register({
          serverUrl: signupInvite.serverUrl,
          email: email.trim(),
          password,
          username: username.trim(),
          inviteCode: signupInvite.code,
        });
        if (!useCommunity.getState().user)
          throw new Error('Sunucu bir hesap oturumu döndürmedi. Yeniden giriş yap.');
        useRooms.getState().setPreference('serverUrl', signupInvite.serverUrl);
        setLink('');
        forgetLink();
      } else {
        const serverUrl = normalizedServer(server);
        await c.connect({ serverUrl, email: email.trim(), password });
        if (!useCommunity.getState().user)
          throw new Error('Sunucu bir hesap oturumu döndürmedi. Yeniden giriş yap.');
        setPassword('');
        useRooms.getState().setPreference('serverUrl', serverUrl);
        if (fromLink && sameInviteServer(serverUrl, fromLink.serverUrl)) {
          await c.acceptInvite(fromLink.code);
          forgetLink();
        }
      }
      setPassword('');
      if (useCommunity.getState().user) onAuthenticated?.();
    } catch (err) {
      setLocalError(uiError(err));
    } finally {
      setWorking(false);
    }
  };
  const communityName = preview?.space?.name || preview?.channel?.name || null;
  const expiry = formatExpiry(preview?.expiresAt);
  if (referenceMode)
    return (
      <section className="ref-auth-form" aria-busy={busy} aria-labelledby="reference-account-title">
        <h2 id="reference-account-title">
          {registration ? 'Hesap oluştur' : sessionExpired ? 'Yeniden giriş yap' : 'Giriş yap'}
        </h2>
        {sessionExpired && !registration && (
          <p>Oturumunun süresi doldu. Hesabına yeniden giriş yap.</p>
        )}
        {!c.user && c.error === SERVER_UNREACHABLE_MESSAGE && (
          <p role="status" className="ref-auth-waiting">
            {SERVER_UNREACHABLE_MESSAGE}
          </p>
        )}
        {c.user ? (
          <>
            <div className="ref-auth-notice">
              <Avatar name={c.user.displayName || c.user.username} />
              <span>{c.user.displayName || c.user.username}</span>
            </div>
            <button
              className="button primary full"
              disabled={busy || !onAuthenticated}
              onClick={() => onAuthenticated?.()}
            >
              Devam et
              <ArrowRight size={16} />
            </button>
            <button
              className="button secondary full"
              disabled={busy}
              onClick={() => {
                clearError();
                setWorking(true);
                void c
                  .logout()
                  .catch((err) => setLocalError(uiError(err)))
                  .finally(() => setWorking(false));
              }}
            >
              Çıkış yap
            </button>
          </>
        ) : (
          <form onSubmit={(e) => void submit(e)}>
            <fieldset disabled={busy}>
              {registration &&
                (fromLink ? (
                  <div className="ref-auth-invite ref-auth-invite-compact" aria-live="polite">
                    <span className="ref-auth-community-icon">
                      <Users size={22} />
                    </span>
                    <h3>{communityName ?? 'Topluluk daveti'}</h3>
                    {previewError ? (
                      <div className="ref-auth-notice error">{previewError}</div>
                    ) : (
                      <p>
                        {communityName
                          ? 'Hesabını oluşturunca bu topluluğa katılacaksın.'
                          : 'Davet kontrol ediliyor…'}
                        {expiry && (
                          <>
                            <br />
                            Son geçerlilik: {expiry}
                          </>
                        )}
                      </p>
                    )}
                    <p className="ref-auth-invite-server">
                      <Globe size={12} />
                      {serverHost(fromLink.serverUrl)}
                    </p>
                    <button type="button" className="ref-auth-back" onClick={forgetLink}>
                      Başka bir davet bağlantısı kullan
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="ref-auth-choice" role="group" aria-label="Nasıl katılacaksın?">
                      <button
                        type="button"
                        aria-pressed={signupKind === 'invite'}
                        onClick={() => setSignupKind('invite')}
                      >
                        Davet bağlantım var
                      </button>
                      <button
                        type="button"
                        aria-pressed={signupKind === 'approval'}
                        onClick={() => setSignupKind('approval')}
                      >
                        Onay isteğiyle
                      </button>
                    </div>
                  </>
                ))}
              {approval && (
                <>
                  <label className="field-label ref-auth-field-with-help">
                    Sunucu adresi
                    <input
                      required
                      type="url"
                      autoCapitalize="none"
                      spellCheck={false}
                      value={server}
                      aria-describedby="reference-approval-help"
                      onChange={(e) => setServer(e.target.value)}
                      placeholder="https://sunucun.example"
                    />
                  </label>
                  <p
                    id="reference-approval-help"
                    className={`ref-auth-help ref-auth-field-help${approvalOpen === false || approvalCheckError ? ' invalid' : ''}`}
                    role="status"
                  >
                    {!approvalServer
                      ? 'Katılmak istediğin topluluğun sunucu adresini yaz. Davet bağlantısı gerekmez.'
                      : !approvalUrlValid
                        ? 'Adresi https:// ile başlayarak yaz.'
                        : approvalCheckError
                          ? approvalCheckError
                          : approvalOpen === null
                            ? 'Sunucu kontrol ediliyor…'
                            : approvalOpen
                              ? 'Hesabın hemen oluşur. Topluluğa, bir yönetici isteğini onaylayınca katılırsın.'
                              : 'Bu sunucu davetsiz kaydı açmamış. Topluluktan bir davet bağlantısı iste.'}
                  </p>
                </>
              )}
              {registration && !fromLink && !approval && (
                <>
                  <label className="field-label ref-auth-field-with-help">
                    Davet bağlantısı
                    <input
                      required
                      autoComplete="off"
                      autoCapitalize="none"
                      spellCheck={false}
                      maxLength={4096}
                      value={link}
                      aria-invalid={linkInvalid}
                      aria-describedby="reference-invite-help"
                      onChange={(e) => setLink(e.target.value)}
                      placeholder="https://…/davet/…"
                    />
                  </label>
                  <p
                    id="reference-invite-help"
                    className={`ref-auth-help ref-auth-field-help${linkInvalid ? ' invalid' : ''}`}
                  >
                    {linkInvalid
                      ? NOT_AN_INVITE
                      : pasted
                        ? `Sunucu: ${serverHost(pasted.serverUrl)}`
                        : 'Topluluktaki her üye davet bağlantısı oluşturabilir. Arkadaşının gönderdiği bağlantıyı buraya yapıştır.'}
                  </p>
                </>
              )}
              {registration && (
                <label className="field-label">
                  Kullanıcı adı
                  <input
                    required
                    autoComplete="nickname"
                    maxLength={32}
                    minLength={2}
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Kullanıcı adın"
                  />
                </label>
              )}
              {!registration && fromLink && (
                <div className="ref-auth-notice">
                  <Users size={15} />
                  {!sameInviteServer(server, fromLink.serverUrl)
                    ? 'Sunucu adresini değiştirdin; davet bu sunucuda geçerli değil.'
                    : communityName
                      ? `Giriş yaptıktan sonra ${communityName} topluluğuna katılacaksın.`
                      : 'Giriş yaptıktan sonra davet edildiğin topluluğa katılacaksın.'}
                </div>
              )}
              <label className="field-label">
                E-posta adresi
                <input
                  required
                  type="email"
                  autoComplete="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="sen@ornek.com"
                />
              </label>
              <label className="field-label">
                Şifre
                <span className="ref-auth-password">
                  <input
                    required
                    type={showPassword ? 'text' : 'password'}
                    autoComplete={registration ? 'new-password' : 'current-password'}
                    minLength={registration ? 8 : 1}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={registration ? 'En az 8 karakter' : 'Şifren'}
                  />
                  <button
                    type="button"
                    aria-label={showPassword ? 'Şifreyi gizle' : 'Şifreyi göster'}
                    aria-pressed={showPassword}
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </span>
              </label>
              {!registration && (
                <>
                  <div className="ref-auth-options">
                    <label title="Bu sürümde oturum, sistemin güvenli deposunda saklanır.">
                      <input type="checkbox" checked disabled />
                      Beni hatırla
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        useRooms.getState().setPreference('serverUrl', normalizedServer(server));
                        onRecovery?.();
                      }}
                      disabled={!onRecovery}
                    >
                      Şifreni mi unuttun?
                    </button>
                  </div>
                  <details className="ref-auth-server" open={!server.trim()}>
                    <summary>{server.trim() ? `Sunucu: ${serverHost(server)}` : 'Sunucu'}</summary>
                    <label className="field-label">
                      Sunucu adresi
                      <input
                        required
                        type="url"
                        autoCapitalize="none"
                        spellCheck={false}
                        value={server}
                        onChange={(e) => setServer(e.target.value)}
                        placeholder="https://sunucun.example"
                      />
                    </label>
                  </details>
                </>
              )}
              <button
                className="button primary full"
                type="submit"
                disabled={
                  busy ||
                  !email.trim() ||
                  !password ||
                  (approval
                    ? approvalOpen !== true || !username.trim()
                    : registration
                      ? !signupInvite || !username.trim()
                      : !server.trim())
                }
              >
                {busy ? (
                  <>
                    <LoaderCircle size={16} className="spin" />
                    {approval
                      ? 'İstek gönderiliyor…'
                      : registration
                        ? 'Hesap oluşturuluyor…'
                        : 'Giriş yapılıyor…'}
                  </>
                ) : (
                  <>
                    {approval
                      ? 'Hesap oluştur ve onay iste'
                      : registration
                        ? 'Hesap oluştur ve katıl'
                        : fromLink
                          ? 'Giriş yap ve katıl'
                          : sessionExpired
                            ? 'Giriş yap ve devam et'
                            : 'Giriş yap'}
                    <ArrowRight size={16} />
                  </>
                )}
              </button>
            </fieldset>
          </form>
        )}
        {error && (
          <div className="ref-auth-notice error" ref={errorRef} tabIndex={-1} role="alert">
            {error}
          </div>
        )}
      </section>
    );
  return (
    <section
      className="connection-card social-connection rooms-onboarding"
      aria-labelledby="community-heading"
      aria-busy={busy}
    >
      <div className="onboarding-heading">
        <span className="onboarding-emblem">
          <Users size={23} />
        </span>
        <div>
          <h4 id="community-heading">{c.user ? 'Hesap' : 'Giriş'}</h4>
        </div>
        {c.user && (
          <span
            className={`connection-status ${c.status === 'connected' ? 'is-connected' : ''}`}
            role="status"
          >
            {c.status === 'connected'
              ? tr('Connected')
              : c.status === 'reconnecting'
                ? tr('Reconnecting…')
                : c.status === 'connecting'
                  ? tr('Connecting…')
                  : tr('Disconnected')}
          </span>
        )}
      </div>
      {c.user ? (
        <>
          <div className="signed-in-profile">
            <Avatar name={c.user.displayName || c.user.username} />
            <div>
              <strong>{c.user.displayName || c.user.username}</strong>
              <small>
                {c.status === 'connected'
                  ? tr('Your community is connected.')
                  : tr('Your session is saved. Waiting for the server.')}
              </small>
            </div>
            <button
              className="button secondary small"
              disabled={busy}
              onClick={() => {
                clearError();
                setWorking(true);
                void c
                  .logout()
                  .catch((err) => setLocalError(uiError(err)))
                  .finally(() => setWorking(false));
              }}
            >
              <LogOut size={14} />
              {tr('Sign out')}
            </button>
          </div>
          <p className="connection-disclosure">{c.spaces.length} özel topluluk</p>
        </>
      ) : (
        <div className="onboarding-signed-out">
          <p>
            Hesabınla giriş yap. Hesabın yoksa davet bağlantısıyla ya da sunucu izin veriyorsa onay
            isteğiyle kayıt ol.
          </p>
          <div className="onboarding-signed-out-actions">
            <button className="button primary" onClick={() => navigate('/setup/signin')}>
              Giriş yap
              <ArrowRight size={15} />
            </button>
            <button className="button secondary" onClick={() => navigate('/setup/register')}>
              Kayıt ol
            </button>
          </div>
        </div>
      )}
      {error && (
        <div className="error-pane onboarding-error" ref={errorRef} tabIndex={-1} role="alert">
          <strong>{tr('We couldn’t complete that.')}</strong>
          <p>{error}</p>
        </div>
      )}
    </section>
  );
}
