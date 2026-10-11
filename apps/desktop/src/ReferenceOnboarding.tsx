import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, ChevronRight, LockKeyhole, Mail, Mic, Monitor, Users, Video } from 'lucide-react';
import type { SocialInvite } from '@rooms/social';
import type { SocialPasswordRecoveryCapabilities } from '@rooms/contracts';
import { ConnectionPane } from './ConnectionPane';
import { VoiceAvatar } from './VoiceAvatar';
import { useCommunity } from './community';
import { useRooms } from './store';
import { uiError } from './i18n';
import './reference-onboarding.css';

export type ReferenceOnboardingMode = 'welcome' | 'signin' | 'register' | 'recovery' | 'invite' | 'profile' | 'devices';
export interface ReferenceOnboardingProps {
    mode: ReferenceOnboardingMode;
    onNavigate(mode: ReferenceOnboardingMode): void;
    onComplete?(): void;
    onOpenSettings?(tab: 'profile' | 'audio'): void;
}
const normalizeServer = (value: string) => value.trim().replace(/\/+$/, '');

/** Request-only recovery. Reset secrets remain in the configured upstream web flow. */
export function PasswordRecoveryPane({serverUrl,onBack}:{serverUrl:string;onBack():void}) {
    const [email,setEmail]=useState('');
    const [capabilities,setCapabilities]=useState<SocialPasswordRecoveryCapabilities|null>(null);
    const [loading,setLoading]=useState(true);
    const [busy,setBusy]=useState(false);
    const [accepted,setAccepted]=useState(false);
    const [error,setError]=useState('');
    const generation=useRef(0);
    const notice=useRef<HTMLDivElement>(null);
    const load=async()=>{
        const epoch=++generation.current;setLoading(true);setCapabilities(null);setError('');setAccepted(false);setBusy(false);
        try{
            if(!window.rooms?.social.passwordRecoveryCapabilities)throw new Error('Kurtarma isteği yalnızca masaüstü uygulamasında kullanılabilir.');
            const result=await window.rooms.social.passwordRecoveryCapabilities(serverUrl);
            if(epoch===generation.current)setCapabilities(result);
        }catch{if(epoch===generation.current)setError('Sunucunun kurtarma ayarları alınamadı. Bağlantını ve giriş ekranındaki sunucu adresini kontrol et.');}
        finally{if(epoch===generation.current)setLoading(false);}
    };
    useEffect(()=>{setEmail('');void load();return()=>{generation.current++;};},[serverUrl]);
    useEffect(()=>{if(accepted||error)notice.current?.focus();},[accepted,error]);
    const reason=loading?'Sunucu ayarları alınıyor…':!window.rooms?.social.requestPasswordRecovery?'Kurtarma isteği yalnızca masaüstü uygulamasında kullanılabilir.':!capabilities?'Sunucunun kurtarma ayarları doğrulanamadı.':!capabilities.emailEnabled?'Sunucuda kurtarma e-postası yapılandırılmamış.':capabilities.captcha.required?'Sunucu hCaptcha doğrulaması istiyor. Kurtarmayı Stoat web uygulamasından başlat.':null;
    const submit=async(event:React.FormEvent)=>{
        event.preventDefault();if(reason||busy||!email.trim()||!window.rooms)return;
        const epoch=++generation.current;setBusy(true);setError('');
        try{await window.rooms.social.requestPasswordRecovery({serverUrl,email:email.trim()});if(epoch===generation.current){setEmail('');setAccepted(true);}}
        catch{if(epoch===generation.current)setError('Kurtarma isteği tamamlanamadı. Biraz bekleyip yeniden dene.');}
        finally{if(epoch===generation.current)setBusy(false);}
    };
    return <div className="ref-auth-recovery" aria-busy={loading||busy}>
        <h2>Şifre kurtarma</h2>
        {accepted?<div className="ref-auth-notice recovery-accepted" role="status" tabIndex={-1} ref={notice}><Mail size={18}/><span>İstek kabul edildi. Hesap uygunsa sunucunun e-posta kurtarma bağlantısıyla devam edebilirsin.</span></div>:<>
            <p className="ref-auth-help">Kayıtlı e-posta adresi</p>
            <form onSubmit={event=>void submit(event)}><label className="field-label">E-posta adresi<input required type="email" autoComplete="email" autoCapitalize="none" spellCheck={false} maxLength={254} value={email} disabled={busy} onChange={event=>setEmail(event.target.value)}/></label>
                {reason&&<div className="ref-auth-notice" role="status"><Mail size={17}/><span>{reason}</span></div>}
                <button className="button primary full" disabled={!!reason||busy||!email.trim()} title={reason??undefined}>{busy?'İstek gönderiliyor…':'Kurtarma isteği gönder'}<ArrowRight size={16}/></button>
            </form>
            {error&&<div className="ref-auth-notice error" role="alert" tabIndex={-1} ref={notice}>{error}</div>}
            {!loading&&!capabilities&&<button className="button secondary full" onClick={()=>void load()}>Yeniden bağlan</button>}
        </>}
        <button className="ref-auth-back" onClick={onBack}><ArrowLeft size={14}/>Giriş ekranına dön</button>
    </div>;
}

/** Reference geometry with real native account operations; no prototype scenario state. */
export function ReferenceOnboarding({ mode, onNavigate, onComplete, onOpenSettings }: ReferenceOnboardingProps) {
    const c = useCommunity();
    const recoveryServer = useRooms(state=>state.preferences.serverUrl);
    const [params, setParams] = useSearchParams();
    const [server, setServer] = useState(() => params.get('server') || useRooms.getState().preferences.serverUrl || 'https://62.238.119.134');
    const [code, setCode] = useState(() => params.get('invite') || '');
    const [invite, setInvite] = useState<SocialInvite | null>(null);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [name, setName] = useState(c.user?.displayName || c.user?.username || '');
    const [status, setStatus] = useState('');
    const [permissions, setPermissions] = useState<{ microphone: string; camera: string; screen: string } | null>(null);
    const request = useRef(0);
    const errorRef = useRef<HTMLDivElement>(null);
    useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);
    useEffect(() => { setName(c.user?.displayName || c.user?.username || ''); }, [c.user?.id, c.user?.displayName, c.user?.username]);
    useEffect(() => {
        let active = true;
        setBusy(false); setError('');
        if (mode === 'devices' && window.rooms) void window.rooms.media.captureStatus().then(status => { if (active) setPermissions(status); }).catch(e => { if (active) setError(uiError(e)); });
        return () => { active = false; request.current++; };
    }, [mode]);
    const inspect = async () => {
        if (busy || !code.trim() || !server.trim()) return;
        const epoch = ++request.current;
        setBusy(true); setError(''); setInvite(null);
        try {
            if (!window.rooms) throw new Error('Davetler yalnızca masaüstü uygulamasında doğrulanabilir.');
            const result = await window.rooms.social.inspectInvite(normalizeServer(server), code.trim());
            if (epoch !== request.current) return;
            setInvite(result);
            const next = new URLSearchParams(params); next.set('invite', code.trim()); next.set('server', normalizeServer(server)); setParams(next, { replace: true });
        } catch (e) { if (epoch === request.current) setError(uiError(e)); }
        finally { if (epoch === request.current) setBusy(false); }
    };
    const join = async () => {
        if (busy || !invite || !c.user) return;
        setBusy(true); setError('');
        try { await c.acceptInvite(invite.code); const next = new URLSearchParams(params); next.delete('invite'); setParams(next, { replace: true }); onNavigate('profile'); }
        catch (e) { setError(uiError(e)); }
        finally { setBusy(false); }
    };
    const saveProfile = async (e: React.FormEvent) => {
        e.preventDefault(); if (busy || !c.user || !name.trim()) return;
        setBusy(true); setError('');
        try {
            if (!window.rooms) throw new Error('Profil yalnızca masaüstü uygulamasında kaydedilebilir.');
            const user = await window.rooms.social.updateProfile({ displayName: name.trim(), ...(status.trim() ? { statusText: status.trim() } : {}) });
            useCommunity.setState({ user }); onNavigate('devices');
        } catch (e) { setError(uiError(e)); }
        finally { setBusy(false); }
    };
    const expires = invite?.expiresAt ? Date.parse(invite.expiresAt) : NaN;
    const expired = Number.isFinite(expires) && expires <= Date.now();
    const sameServer = normalizeServer(c.serverUrl || '') === normalizeServer(server);
    const configure = (tab: 'profile' | 'audio') => onOpenSettings?.(tab);
    const settingsReason = onOpenSettings ? undefined : 'Ayarlar bu görünümde henüz bağlanmadı.';
    return <main className={`ref-onboarding mode-${mode}`}>

        <div className="ref-auth-content">
            <aside className="ref-auth-art" aria-label="ROOMS">
                <div className="ref-auth-wordmark"><img src="./reference-brand/brand/logo-symbol-lilac.svg" alt=""/>ROOMS</div>
                <div className="ref-auth-sculpture" aria-hidden="true"><div className="ref-auth-portal"/></div>
            </aside>
            <div className="ref-auth-panel">
                {(mode === 'signin' || mode === 'register') ? <ConnectionPane referenceMode={mode} onAuthenticated={() => onNavigate('profile')} onAccessChange={onNavigate} onRecovery={() => onNavigate('recovery')}/> : <section className="ref-auth-form" aria-busy={busy}>
                    {(mode === 'profile' || mode === 'devices') && <div className="ref-auth-steps" aria-label={`Kurulum: ${mode === 'profile' ? '1' : '2'}. adım`}><i className="active"/><i className={mode === 'devices' ? 'active' : ''}/><i/></div>}
                    {mode === 'welcome' && <><h2>Giriş</h2><button className="button primary full" onClick={() => onNavigate('signin')}><ArrowRight size={16}/>Giriş yap</button><div className="ref-auth-footer"><button onClick={() => onNavigate('invite')}>Davet aç</button></div></>}
                    {mode === 'recovery' && <PasswordRecoveryPane serverUrl={recoveryServer} onBack={()=>onNavigate('signin')}/>}
                    {mode === 'invite' && <><h2>{expired ? 'Davetin süresi doldu' : 'Topluluk daveti'}</h2><p>{invite ? 'Topluluk davetini incele.' : 'Arkadaşından gelen davet kodunu aç.'}</p>
                        <form onSubmit={e => { e.preventDefault(); void inspect(); }}><fieldset disabled={busy}><label className="field-label">Davet kodu<input required autoComplete="off" maxLength={128} spellCheck={false} value={code} onChange={e => { setCode(e.target.value); setInvite(null); setError(''); }}/></label><details className="ref-auth-server"><summary>Sunucu adresi</summary><label className="field-label">Sunucu adresi<input required type="url" autoCapitalize="none" spellCheck={false} value={server} onChange={e => { setServer(e.target.value); setInvite(null); setError(''); }}/></label></details><button className="button secondary full" disabled={busy || !code.trim() || !server.trim()}>{busy ? 'Davet açılıyor…' : 'Davetimi aç'}<ChevronRight size={16}/></button></fieldset></form>
                        {invite && <div className="ref-auth-invite"><span className="ref-auth-community-icon"><Users size={25}/></span><h3>{invite.space?.name || invite.channel?.name || 'Topluluk'}</h3>{invite.channel?.name && <p>#{invite.channel.name}</p>}{expired ? <div className="ref-auth-notice">Arkadaşından yeni bir davet iste.</div> : <><div className="ref-auth-notice"><LockKeyhole size={15}/>Bu topluluğa katılmak için hesabınla giriş yap.</div>{c.user ? <><button className="button primary full" disabled={busy || !sameServer} onClick={() => void join()}>Daveti kabul et<ArrowRight size={16}/></button>{!sameServer && <p className="ref-auth-help">Hesabın farklı sunucuda. Giriş ekranından çıkış yapıp davetin sunucusunda giriş yap.</p>}</> : <button className="button primary full" onClick={() => onNavigate('signin')}>Giriş yap ve katıl<ArrowRight size={16}/></button>}<button className="ref-auth-back" onClick={() => onNavigate(c.user ? 'signin' : 'register')}>{c.user ? 'Hesap değiştir' : 'Davetle hesap oluştur'}</button></>}</div>}
                        <button className="ref-auth-back" disabled={busy} onClick={() => onNavigate('welcome')}><ArrowLeft size={14}/>Geri dön</button>
                    </>}
                    {mode === 'profile' && <><h2>Profil</h2>{c.user ? <form onSubmit={e => void saveProfile(e)}><fieldset disabled={busy}><div className="ref-auth-avatar"><VoiceAvatar id={c.user.id} name={name || c.user.username} large/><button type="button" className="button secondary" disabled={!onOpenSettings} title={settingsReason} onClick={() => configure('profile')}>Avatar seç</button></div><label className="field-label">Görünen ad<input required maxLength={32} autoComplete="nickname" value={name} onChange={e => setName(e.target.value)}/></label><label className="field-label">Durum<input maxLength={128} value={status} onChange={e => setStatus(e.target.value)}/></label><p className="ref-auth-help">Bunları daha sonra profilinden değiştirebilirsin.</p><button className="button primary full" disabled={busy || !name.trim()}>{busy ? 'Kaydediliyor…' : 'Devam et'}<ArrowRight size={16}/></button><button type="button" className="ref-auth-back" onClick={() => onNavigate('devices')}>Şimdilik atla</button></fieldset></form> : <><div className="ref-auth-notice">Profilini hazırlamak için önce hesabına giriş yap.</div><button className="button primary full" onClick={() => onNavigate('signin')}>Giriş yap</button></>}</>}
                    {mode === 'devices' && <><h2>Cihazlar</h2><p>İzinleri yalnızca ilgili özelliği kullandığında isteyeceğiz.</p>{permissions?.microphone === 'denied' && <div className="ref-auth-notice warning">Mikrofon izni kapalı. Ses ve video ayarlarından sistem izinlerini açabilirsin.</div>}<div className="ref-auth-permission"><Mic size={22}/><div><strong>Mikrofon</strong><p>{permissions?.microphone === 'granted' ? 'İzin verildi' : permissions?.microphone === 'denied' ? 'İzin kapalı' : 'Sesli konuşmak için'}</p></div><button className="button secondary small" disabled={!onOpenSettings} title={settingsReason} onClick={() => configure('audio')}>Ayarlar</button></div><div className="ref-auth-permission"><Video size={22}/><div><strong>Kamera</strong><p>İlk görüntülü görüşmede seçebilirsin.</p></div><span>İsteğe bağlı</span></div><div className="ref-auth-permission"><Monitor size={22}/><div><strong>Ekran paylaşımı</strong><p>Paylaşımı başlatırken izin istenir.</p></div><span>Sonra</span></div><div className="ref-auth-device-card"><span>Giriş cihazı</span><strong>Ses ve video ayarlarından seç</strong><button className="button secondary full" disabled={!onOpenSettings} title={settingsReason} onClick={() => configure('audio')}><Mic size={15}/>Mikrofonu dene</button></div><button className="button primary full" disabled={!onComplete} title={onComplete ? undefined : 'Topluluk bağlantısı bu görünümde henüz bağlanmadı.'} onClick={onComplete}>Topluluğuma gir<ArrowRight size={16}/></button><p className="ref-auth-footer">Sistem izinleri macOS tarafından gösterilir.</p></>}
                    {error && <div className="ref-auth-notice error" ref={errorRef} tabIndex={-1} role="alert">{error}</div>}
                </section>}
            </div>
        </div>
    </main>;
}
