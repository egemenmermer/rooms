import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCommunity } from './community';
import { useRealtime } from './realtime';
import { ReferenceIcon } from './ReferenceIcon';
import { uiError } from './i18n';
import './reference-system.css';

export type SystemStateKind = 'connected' | 'offline' | 'reconnect' | 'loading' | 'empty' | 'session_expired' | 'unavailable' | 'permission_denied' | 'unsupported';
const descriptions: Record<SystemStateKind, [string, string, string]> = {
  connected: ['Bağlısın', 'Topluluk bağlantısı açık.', 'Sohbete dön'],
  offline: ['Çevrimdışısın', 'İnternet bağlantın kesildi. Daha önce yüklenen mesajları okuyabilirsin; yeni mesaj ve işlemler bağlantı geldiğinde gönderilebilir.', 'Yeniden bağlan'],
  reconnect: ['Odaya yeniden bağlanıyoruz', 'Mesajların ve odadaki etkinliğin son durumu kontrol ediliyor. Bağlantı kurulana kadar yeni işlem başlatılmıyor.', 'Tekrar dene'],
  loading: ['Odan hazırlanıyor', 'Mesajlar ve üyeler yükleniyor.', ''],
  empty: ['Henüz burada bir şey yok', 'Bu alana ilk mesajı veya dosyayı ekleyerek birlikte başlayabilirsiniz.', 'Sohbete dön'],
  session_expired: ['Yeniden giriş yapman gerekiyor', 'Özel topluluğuna devam etmek için hesabınla tekrar giriş yap.', 'Giriş yap'],
  unavailable: ['Şu anda bağlanamıyoruz', 'Topluluk hizmetine ulaşılamıyor. Mesajların bu ekranda yeniden gönderilmeyecek.', 'Yeniden dene'],
  permission_denied: ['Bu alan için iznin yok', 'Bu içeriği görüntülemek için erişim gerekiyor. Kanalın özel içeriği ve önizlemesi gösterilmez.', 'Genel kanala dön'],
  unsupported: ['Sistem sesi burada kullanılamıyor', 'Bu cihaz ve paylaşım yöntemi için sistem sesi desteği doğrulanmadı. Ekranını sistem sesi olmadan paylaşabilirsin.', 'Ekran seçimine dön'],
};

/** Render only a supplied authoritative state; retry never sends queued chat messages. */
export function SystemState({ kind, onRetry, onReturn, onSignIn, onCapture, voiceStatus, busy = false, error, checkedAt }: {
  kind: SystemStateKind; onRetry?(): void; onReturn?(): void; onSignIn?(): void; onCapture?(): void;
  voiceStatus?: string; busy?: boolean; error?: string; checkedAt?: number;
}) {
  const [title, description, action] = descriptions[kind];
  const icon = ['empty','connected'].includes(kind) ? 'check' : ['loading', 'reconnect'].includes(kind) ? 'clock' : ['permission_denied', 'session_expired', 'unsupported'].includes(kind) ? 'lock' : 'wifi-off';
  const primary = kind === 'session_expired' ? onSignIn : kind === 'unsupported' ? onCapture : ['empty', 'connected', 'permission_denied'].includes(kind) ? onReturn : onRetry;
  return <section className={`reference-system system-${kind}`} aria-live="polite" aria-busy={busy || kind === 'loading'}>
    <div className="system-illustration" aria-hidden="true"><div className="system-door"/><span className={`system-indicator ${icon}`}><ReferenceIcon name={icon} size={20}/></span></div>
    <h1>{title}</h1><p>{description}</p>
    {kind === 'loading' && <div className="system-skeleton" aria-hidden="true">{[0, 1, 2].map(i => <div key={i}><i/><span><b/><b/></span></div>)}</div>}
    {kind === 'reconnect' && <div className="system-detail"><strong><span className="system-spinner"/>Bağlantı kontrol ediliyor</strong><p>Ses odası: {voiceStatus ?? 'bağlı değil'}<br/>Etkinlik: bağlantı sonrası güncellenecek</p></div>}
    {kind === 'unsupported' && <div className="system-detail"><strong>Sistem sesi</strong><div className="system-audio"><span>Bu cihazda kullanılamıyor</span><button role="switch" aria-label="Sistem sesi kullanılamıyor" aria-checked={false} disabled/></div><p>Paylaşım kaynağını ve mikrofonunu ayrı seçebilirsin.</p></div>}
    {action && <div className="system-actions"><button className="button primary" disabled={busy || !primary} onClick={primary}>{['offline', 'reconnect', 'unavailable'].includes(kind) && <ReferenceIcon name="refresh-cw" size={17}/>} {busy ? 'Kontrol ediliyor…' : action}</button>{['offline', 'reconnect', 'unavailable'].includes(kind) && <button className="button secondary" disabled={!onReturn} onClick={onReturn}>Yüklenen mesajlara dön</button>}</div>}
    {error && <p className="system-error" role="alert">{error}</p>}
    <small>{kind === 'permission_denied' ? 'Erişim değişiklikleri topluluk yöneticileri tarafından yapılır.' : kind === 'unsupported' ? 'Sistem izni vermek, desteklenmeyen bir özelliği etkinleştirmez.' : checkedAt ? `Son kontrol: ${new Date(checkedAt).toLocaleString('tr-TR', {day:'numeric',month:'long',hour:'2-digit',minute:'2-digit'})}` : null}</small>
  </section>;
}

export default function ConnectionStatusSurface() {
  const community = useCommunity(), media = useRealtime(), navigate = useNavigate();
  const [online, setOnline] = useState(navigator.onLine), [busy, setBusy] = useState(false), [error, setError] = useState(''), [checkedAt, setCheckedAt] = useState<number>();
  useEffect(() => { const update = () => setOnline(navigator.onLine); window.addEventListener('online', update);window.addEventListener('offline', update);return () => {window.removeEventListener('online', update);window.removeEventListener('offline', update);}; }, []);
  const [fixtureState,setFixtureState]=useState<SystemStateKind|'splash'|null>(null);
  useEffect(()=>{let active=true;if(import.meta.env.DEV&&new URLSearchParams(location.search).get('fixture')==='S72')void import('./dev/reference-fixtures').then(f=>{if(active)setFixtureState(f.getReferenceSystemState());});return()=>{active=false;};},[]);
  const kind: SystemStateKind = (fixtureState && fixtureState!=='splash') ? fixtureState : !community.user ? 'session_expired' : !online ? 'offline' : community.status === 'reconnecting' ? 'reconnect' : community.status === 'connecting' ? 'loading' : community.error || community.status === 'error' ? 'unavailable' : 'connected';
  const retry = async () => { setBusy(true);setError('');try { await community.refresh(); } catch (e) {setError(uiError(e));} finally {setCheckedAt(Date.now());setBusy(false);} };
  if(fixtureState==='splash')return <StartupSplash referenceCopy/>;
  return <SystemState kind={kind} busy={busy} error={error} checkedAt={checkedAt} voiceStatus={media.status === 'connected' ? 'bağlı' : media.status === 'reconnecting' ? 'yeniden bağlanıyor' : 'bağlı değil'} onRetry={() => void retry()} onReturn={() => navigate('/chat')} onSignIn={() => navigate('/setup/signin')}/>;
}

export function StartupSplash({referenceCopy=false}:{referenceCopy?:boolean}={}) {
  return <div className="reference-splash" role="status"><div><img src="./reference-brand/brand/logo-lockup-lilac.svg" alt="ROOMS"/>{import.meta.env.DEV&&referenceCopy&&<h1>Aynı yere dönmek güzel.</h1>}<p>Odan hazırlanıyor.</p><progress aria-label="Uygulama açılıyor"/></div></div>;
}
