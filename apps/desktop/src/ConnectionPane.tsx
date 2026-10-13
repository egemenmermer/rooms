import { tr, uiError } from './i18n';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowRight, Check, Eye, EyeOff, Globe, LoaderCircle, LockKeyhole, LogOut, Users } from 'lucide-react';
import { Avatar } from '@rooms/design';
import { useCommunity } from './community';
import { useRooms } from './store';
import './onboarding.css';
const productionServer = 'https://62.238.119.134';
const localServer = 'http://127.0.0.1:3021';
const normalizedServer = (value: string) => value.trim().replace(/\/+$/, '');
export function ConnectionPane({ referenceMode, sessionExpired = false, onAuthenticated, onAccessChange, onRecovery }: { sessionExpired?: boolean; referenceMode?: 'signin' | 'register'; onAuthenticated?(): void; onAccessChange?(mode: 'signin' | 'register'): void; onRecovery?(): void } = {}) {
    const c = useCommunity();
    const [params, setParams] = useSearchParams();
    const [registration, setRegistration] = useState(referenceMode === 'register');
    const [server, setServer] = useState(() => useRooms.getState().preferences.serverUrl || productionServer);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [username, setUsername] = useState('');
    const [invite, setInvite] = useState('');
    const [localError, setLocalError] = useState('');
    const [working, setWorking] = useState(false);
    const [joined, setJoined] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const errorRef = useRef<HTMLDivElement>(null);
    const code = params.get('invite'), address = params.get('server'), access = params.get('access');
    const busy = c.busy || working;
    const error = localError || c.error;
    const sameServer = normalizedServer(c.serverUrl) === normalizedServer(server);
    useEffect(() => {
        if (code && address) {
            setInvite(code);
            setServer(address);
            setJoined(false);
        }
    }, [code, address]);
    useEffect(() => {
        if (referenceMode) setRegistration(referenceMode === 'register');
        else if (access)
            setRegistration(access === 'register');
    }, [access, referenceMode]);
    useEffect(() => {
        if (error)
            errorRef.current?.focus();
    }, [error]);
    const clearError = () => { setLocalError(''); c.clearError(); };
    const completeInvite = () => {
        setInvite('');
        setJoined(true);
        const next = new URLSearchParams(params);
        next.delete('invite');
        next.delete('access');
        setParams(next, { replace: true });
    };
    const acceptInvite = async () => {
        if (busy)
            return;
        clearError();
        setWorking(true);
        try {
            await c.acceptInvite(invite.trim());
            completeInvite();
        }
        catch (err) {
            setLocalError(uiError(err));
        }
        finally {
            setWorking(false);
        }
    };
    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (busy)
            return;
        clearError();
        setWorking(true);
        try {
            const serverUrl = normalizedServer(server);
            if (registration) {
                await c.register({ serverUrl, email: email.trim(), password, username: username.trim(), inviteCode: invite.trim() });
                if (!useCommunity.getState().user) throw new Error('Sunucu bir hesap oturumu döndürmedi. Yeniden giriş yap.');
                completeInvite();
            }
            else {
                await c.connect({ serverUrl, email: email.trim(), password });
                if (!useCommunity.getState().user) throw new Error('Sunucu bir hesap oturumu döndürmedi. Yeniden giriş yap.');
                setPassword('');
                if (invite.trim()) {
                    await c.acceptInvite(invite.trim());
                    completeInvite();
                }
            }
            setPassword('');
            if (useCommunity.getState().user) onAuthenticated?.();
        }
        catch (err) {
            setLocalError(uiError(err));
        }
        finally {
            setWorking(false);
        }
    };
    const changeAccess = (next: boolean) => { setRegistration(next); clearError(); };
    if (referenceMode) return <section className="ref-auth-form" aria-busy={busy} aria-labelledby="reference-account-title">
        <h2 id="reference-account-title">{registration ? 'Hesap oluştur' : sessionExpired ? 'Yeniden giriş yap' : 'Giriş yap'}</h2>
        {sessionExpired&&!registration&&<p>Oturumunun süresi doldu. Hesabına yeniden giriş yap.</p>}
        {c.user ? <><div className="ref-auth-notice"><Avatar name={c.user.displayName || c.user.username}/><span>{c.user.displayName || c.user.username}</span></div><button className="button primary full" disabled={busy || !onAuthenticated} onClick={() => onAuthenticated?.()}>Devam et<ArrowRight size={16}/></button><button className="button secondary full" disabled={busy} onClick={() => { clearError(); setWorking(true); void c.logout().catch(err => setLocalError(uiError(err))).finally(() => setWorking(false)); }}>Çıkış yap</button></> : <form onSubmit={e => void submit(e)}>
        <fieldset disabled={busy}>
            {registration && <><label className="field-label">Topluluk davet kodu<input required autoComplete="off" spellCheck={false} maxLength={128} value={invite} onChange={e => setInvite(e.target.value)} placeholder="Davet kodun"/></label><label className="field-label">Kullanıcı adı<input required autoComplete="nickname" maxLength={32} minLength={2} value={username} onChange={e => setUsername(e.target.value)} placeholder="Kullanıcı adın"/></label></>}
            <label className="field-label">E-posta adresi<input required type="email" autoComplete="email" autoCapitalize="none" spellCheck={false} value={email} onChange={e => setEmail(e.target.value)} placeholder="sen@ornek.com"/></label>
            <label className="field-label">Şifre<span className="ref-auth-password"><input required type={showPassword ? 'text' : 'password'} autoComplete={registration ? 'new-password' : 'current-password'} minLength={registration ? 8 : 1} value={password} onChange={e => setPassword(e.target.value)} placeholder={registration ? 'En az 8 karakter' : 'Şifren'}/><button type="button" aria-label={showPassword ? 'Şifreyi gizle' : 'Şifreyi göster'} aria-pressed={showPassword} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={16}/> : <Eye size={16}/>}</button></span></label>
            {!registration && <div className="ref-auth-options"><label title="Bu sürümde oturum, sistemin güvenli deposunda saklanır."><input type="checkbox" checked disabled/>Beni hatırla</label><button type="button" onClick={() => { useRooms.getState().setPreference('serverUrl', normalizedServer(server)); onRecovery?.(); }} disabled={!onRecovery}>Şifreni mi unuttun?</button></div>}
            <details className="ref-auth-server"><summary>Sunucu ve davet seçenekleri</summary><label className="field-label">Sunucu adresi<input required type="url" autoCapitalize="none" spellCheck={false} value={server} onChange={e => setServer(e.target.value)}/></label>{!registration && <label className="field-label">Topluluk davet kodu (isteğe bağlı)<input autoComplete="off" maxLength={128} spellCheck={false} value={invite} onChange={e => setInvite(e.target.value)}/></label>}</details>
            <button className="button primary full" type="submit" disabled={busy || !email.trim() || !password || !server.trim() || (registration && (!invite.trim() || !username.trim()))}>{busy ? <><LoaderCircle size={16} className="spin"/>{registration ? 'Hesap oluşturuluyor…' : 'Giriş yapılıyor…'}</> : <>{registration ? 'Hesap oluştur ve katıl' : invite ? 'Giriş yap ve katıl' : sessionExpired ? 'Giriş yap ve devam et' : 'Giriş yap'}<ArrowRight size={16}/></>}</button>
        </fieldset>
        </form>}
        {error && <div className="ref-auth-notice error" ref={errorRef} tabIndex={-1} role="alert">{error}</div>}
        {!c.user && <div className="ref-auth-footer">{registration ? 'Zaten bir hesabın var mı?' : 'Hesabın yok mu?'} <button disabled={busy || !onAccessChange} onClick={() => onAccessChange?.(registration ? 'signin' : 'register')}>{registration ? 'Giriş yap' : 'Davetle hesap oluştur'}</button></div>}
    </section>;
    return <section className="connection-card social-connection rooms-onboarding" aria-labelledby="community-heading" aria-busy={busy}>
        <div className="onboarding-heading">
            <span className="onboarding-emblem"><Users size={23}/></span>
            <div><h4 id="community-heading">{c.user ? "Hesap" : "Giri\u015F"}</h4></div>
            {c.user && <span className={`connection-status ${c.status === 'connected' ? 'is-connected' : ''}`} role="status">{c.status === 'connected' ? tr('Connected') : c.status === 'reconnecting' ? tr('Reconnecting…') : c.status === 'connecting' ? tr('Connecting…') : tr('Disconnected')}</span>}
        </div>
        {c.user ? <>
            <div className="signed-in-profile"><Avatar name={c.user.displayName || c.user.username}/><div><strong>{c.user.displayName || c.user.username}</strong><small>{c.status === 'connected' ? tr('Your community is connected.') : tr('Your session is saved. Waiting for the server.')}</small></div><button className="button secondary small" disabled={busy} onClick={() => { clearError(); setWorking(true); void c.logout().catch(err => setLocalError(uiError(err))).finally(() => setWorking(false)); }}><LogOut size={14}/>{tr('Sign out')}</button></div>
            <p className="connection-disclosure">{c.spaces.length} özel topluluk</p>
            {!!invite && <div className="onboarding-invite-note"><Users size={17}/><div><strong>Davet</strong><p>{sameServer ? 'Hesabın açık. Topluluğa katılmak için davetini kabul et.' : 'Bu davet farklı bir sunucuda. Çıkış yapıp davetin sunucusunda giriş yap.'}</p><button className="button secondary small" disabled={busy || !sameServer} onClick={() => void acceptInvite()}>{busy ? <LoaderCircle size={14} className="spin"/> : <ArrowRight size={14}/>}Daveti kabul et</button></div></div>}
            {joined && <p className="onboarding-success" role="status"><Check size={16}/>Davet kabul edildi.</p>}
        </> : <>
            <div className="onboarding-access" role="group" aria-label={tr('Account access')}>
                <button type="button" aria-pressed={!registration} className={!registration ? 'selected' : ''} disabled={busy} onClick={() => changeAccess(false)}>{tr('Sign in')}</button>
                <button type="button" aria-pressed={registration} className={registration ? 'selected' : ''} disabled={busy} onClick={() => changeAccess(true)}>{tr('Join with an invitation')}</button>
            </div>
            {!!invite && !registration && <div className="onboarding-invite-note"><Users size={17}/><div><strong>Davet</strong><p>Mevcut hesabınla giriş yaptığında bu topluluğa katılacaksın. Hesabın yoksa “Davetle katıl”ı seç.</p></div></div>}
            <form onSubmit={e => void submit(e)}>
                <fieldset disabled={busy}>
                    <div className="onboarding-server">
                        <div className="onboarding-server-label"><Globe size={14}/><span>SUNUCU</span></div>
                        <div className="onboarding-presets">
                            <button type="button" aria-pressed={normalizedServer(server) === productionServer} onClick={() => { setServer(productionServer); clearError(); }}><span>ROOMS sunucusu</span>{normalizedServer(server) === productionServer && <Check size={13}/>}</button>
                            <button type="button" aria-pressed={normalizedServer(server) === localServer} onClick={() => { setServer(localServer); clearError(); }}>Bu bilgisayar{normalizedServer(server) === localServer && <Check size={13}/>}</button>
                        </div>
                        <label className="field-label onboarding-address"><span>Sunucu adresi</span><input required type="url" aria-label={tr('Community server address')} autoCapitalize="none" spellCheck={false} value={server} onChange={e => setServer(e.target.value)} placeholder="https://sunucun.example"/></label>
                    </div>
                    {registration && <div className="onboarding-registration">
                        <label className="field-label">TOPLULUK DAVET KODU<input required aria-label={tr('Invitation code')} autoComplete="off" spellCheck={false} maxLength={128} value={invite} onChange={e => setInvite(e.target.value)} placeholder="Arkadaşından gelen kod"/></label>
                        <label className="field-label">{tr('YOUR NAME')}<input required aria-label={tr('Account username')} autoComplete="nickname" maxLength={32} minLength={2} value={username} onChange={e => setUsername(e.target.value)} placeholder={'Kullanıcı adı'}/></label>

                    </div>}
                    <div className="onboarding-credentials">
                        <label className="field-label">{tr('EMAIL')}<input required type="email" aria-label={tr('Account email')} autoComplete="email" autoCapitalize="none" spellCheck={false} value={email} onChange={e => setEmail(e.target.value)} placeholder="sen@ornek.com"/></label>
                        <label className="field-label">{tr('PASSWORD')}<input required type="password" aria-label={tr('Account password')} autoComplete={registration ? 'new-password' : 'current-password'} minLength={registration ? 8 : 1} value={password} onChange={e => setPassword(e.target.value)} placeholder={registration ? 'En az 8 karakter' : 'Şifren'}/></label>
                    </div>
                    <button className="button primary full onboarding-submit" type="submit" disabled={busy || !email.trim() || !password || !server.trim() || (registration && (!invite.trim() || !username.trim()))}>{busy ? <><LoaderCircle size={16} className="spin"/>Bağlanılıyor…</> : <>{registration ? 'Hesap oluştur' : invite ? 'Giriş yap ve katıl' : 'Giriş yap'}<ArrowRight size={16}/></>}</button>
                </fieldset>
            </form>
            
        </>}
        {error && <div className="error-pane onboarding-error" ref={errorRef} tabIndex={-1} role="alert"><strong>{c.user && invite ? 'Giriş yapıldı, davet tamamlanamadı.' : tr('We couldn’t complete that.')}</strong><p>{error}</p></div>}
    </section>;
}
