import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, ClipboardPaste, LockKeyhole } from 'lucide-react';

export interface PasswordResetSelection { handle: string; expiresAt: number; serverOrigin: string }
export type PasswordResetOutcome = { state: 'completed' | 'invalid-token' | 'selection-expired' | 'rejected' | 'uncertain' | 'scope-changed' };
export interface PasswordResetBridge {
  importPasswordRecoveryLink(input: { serverUrl: string }): Promise<PasswordResetSelection>;
  confirmPasswordRecovery(input: { serverUrl: string; handle: string; password: string }): Promise<PasswordResetOutcome>;
  cancelPasswordRecovery(input: { handle: string }): Promise<void>;
}
interface Props { serverUrl: string; scopeKey: string; bridge: PasswordResetBridge | null; onBack(): void; onNewRequest(): void }
const messages: Record<PasswordResetOutcome['state'], string> = {
  completed: 'Şifre kaydedildi. Yeni şifrenle giriş yap.',
  'invalid-token': 'Kurtarma bağlantısı geçersiz veya süresi dolmuş. Yeni kurtarma isteği gönder.',
  'selection-expired': 'Kurtarma işleminin süresi doldu. Bağlantıyı yeniden aktar.',
  rejected: 'Sunucu yeni şifreyi kabul etmedi. Şifre kurallarını kontrol edip bağlantıyı yeniden aktar.',
  uncertain: 'Şifre değişikliği doğrulanamadı. Önce yeni şifrenle giriş yapmayı dene.',
  'scope-changed': 'Hesap veya sunucu değişti. Kurtarma bağlantısını mevcut sunucu için yeniden aktar.',
};

/** The renderer receives an opaque native capability, never the reset URL or token. Password drafts are ephemeral. */
export function PasswordResetPane({ serverUrl, scopeKey, bridge, onBack, onNewRequest }: Props) {
  const [selection, setSelection] = useState<PasswordResetSelection | null>(null);
  const [password, setPassword] = useState('');
  const [repeatedPassword, setRepeatedPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [outcome, setOutcome] = useState<PasswordResetOutcome | null>(null);
  const generation = useRef(0);
  const activeSelection = useRef<PasswordResetSelection | null>(null);
  const notice = useRef<HTMLDivElement>(null);
  const clearDrafts = () => { setPassword(''); setRepeatedPassword(''); };
  const release = () => {
    const previous = activeSelection.current; activeSelection.current = null;
    if (previous) void bridge?.cancelPasswordRecovery({ handle: previous.handle }).catch(() => {});
  };
  useEffect(() => {
    ++generation.current; setSelection(null); clearDrafts(); setOutcome(null); setError(''); setBusy(false);
    return () => { ++generation.current; release(); };
  }, [serverUrl, scopeKey, bridge]);
  useEffect(() => {
    if (!selection || busy) return;
    const expire = () => { release(); setSelection(null); clearDrafts(); setOutcome({ state: 'selection-expired' }); };
    const remaining = selection.expiresAt - Date.now();
    if (remaining <= 0) { expire(); return; }
    const timer = setTimeout(expire, Math.min(remaining, 3 * 60_000));
    return () => clearTimeout(timer);
  }, [selection, busy]);
  useEffect(() => { if (outcome || error) notice.current?.focus(); }, [outcome, error]);
  const importLink = async () => {
    if (!bridge || busy) return;
    const epoch = ++generation.current; release(); setBusy(true); setSelection(null); clearDrafts(); setOutcome(null); setError('');
    try {
      const result = await bridge.importPasswordRecoveryLink({ serverUrl });
      if (epoch !== generation.current) { void bridge.cancelPasswordRecovery({ handle: result.handle }).catch(() => {}); return; }
      activeSelection.current = result; setSelection(result);
    } catch { if (epoch === generation.current) setError('Bağlantı aktarılamadı. Seçili HTTPS sunucusunun /login/reset/ bağlantısını kopyala. E-posta farklı bir uygulama alan adı kullanıyorsa Stoat web akışından devam et.'); }
    finally { if (epoch === generation.current) setBusy(false); }
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!bridge || !selection || busy || password.length < 8 || password !== repeatedPassword) return;
    const epoch = ++generation.current; setBusy(true); setError('');
    const value = password; clearDrafts();
    try {
      const result = await bridge.confirmPasswordRecovery({ serverUrl, handle: selection.handle, password: value });
      if (epoch === generation.current) { activeSelection.current = null; setSelection(null); setOutcome(result); }
    } catch {
      if (epoch === generation.current) { release(); setSelection(null); setOutcome({ state: 'uncertain' }); }
    } finally { if (epoch === generation.current) setBusy(false); }
  };
  const leave = (callback: () => void) => { ++generation.current; release(); clearDrafts(); callback(); };
  const unavailable = !bridge ? 'Şifre sıfırlama yalnızca masaüstü uygulamasında kullanılabilir.' : null;
  return <div className="ref-auth-recovery" aria-busy={busy}>
    <h2>{outcome?.state === 'completed' ? 'Şifre kaydedildi' : 'Yeni şifre'}</h2>
    {outcome ? <div className={`ref-auth-notice ${outcome.state === 'completed' ? 'recovery-accepted' : 'error'}`} ref={notice} tabIndex={-1} role={outcome.state === 'completed' ? 'status' : 'alert'}>{messages[outcome.state]}</div> : selection ? <>
      <p className="ref-auth-help">{selection.serverOrigin}</p>
      <form onSubmit={event => void submit(event)}>
        <label className="field-label">Yeni şifre<input required type="password" autoComplete="new-password" minLength={8} maxLength={256} disabled={busy} value={password} onChange={event => setPassword(event.target.value)}/></label>
        <label className="field-label">Yeni şifreyi tekrar yaz<input required type="password" autoComplete="new-password" minLength={8} maxLength={256} disabled={busy} value={repeatedPassword} onChange={event => setRepeatedPassword(event.target.value)}/></label>
        {repeatedPassword && password !== repeatedPassword && <div className="ref-auth-notice" role="status">Şifreler eşleşmiyor.</div>}
        <p className="ref-auth-help">Diğer oturumlar kapatılır.</p>
        <button className="button primary full" disabled={busy || password.length < 8 || password !== repeatedPassword}>{busy ? 'Kaydediliyor…' : 'Şifreyi kaydet'}<ArrowRight size={16}/></button>
      </form>
    </> : <p className="ref-auth-help">E-postadaki kurtarma bağlantısını kopyalayıp aktar.</p>}
    {error && <div className="ref-auth-notice error" ref={notice} tabIndex={-1} role="alert">{error}</div>}
    {unavailable && <div className="ref-auth-notice" role="status"><LockKeyhole size={17}/><span>{unavailable}</span></div>}
    {!selection && outcome?.state !== 'completed' && outcome?.state !== 'uncertain' && <button className="button primary full" disabled={busy || !!unavailable} title={unavailable ?? undefined} onClick={() => void importLink()}><ClipboardPaste size={16}/>{busy ? 'Aktarılıyor…' : 'Panodan kurtarma bağlantısını aktar'}</button>}
    {outcome?.state === 'invalid-token' && <button className="button secondary full" onClick={() => leave(onNewRequest)}>Yeni kurtarma isteği</button>}
    <button className="ref-auth-back" onClick={() => leave(onBack)}><ArrowLeft size={14}/>Giriş ekranına dön</button>
  </div>;
}
