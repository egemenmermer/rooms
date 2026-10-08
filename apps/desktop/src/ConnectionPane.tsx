import { tr, uiError } from './i18n';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowRight, Check, Fingerprint, Globe, LogOut, RefreshCw, ShieldCheck, Users } from 'lucide-react';
import { Avatar } from '@rooms/design';
import { useCommunity } from './community';
import { useRooms } from './store';
export function ConnectionPane() {
    const c = useCommunity();
    const [params] = useSearchParams();
    const [registration, setRegistration] = useState(false);
    const [server, setServer] = useState(useRooms.getState().preferences.serverUrl || 'http://127.0.0.1:3021');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [username, setUsername] = useState('');
    const [invite, setInvite] = useState('');
    const [accountInvite, setAccountInvite] = useState('');
    const [localError, setLocalError] = useState('');
    useEffect(() => { const code = params.get('invite'), address = params.get('server'); if (code && address && !c.user) {
        setInvite(code);
        setServer(address);
        setRegistration(true);
    } }, [params, c.user]);
    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLocalError('');
        try {
            if (registration)
                await c.register({ serverUrl: server, email, password, username, inviteCode: invite, ...(accountInvite.trim() ? { accountInviteCode: accountInvite.trim() } : {}) });
            else
                await c.connect({ serverUrl: server, email, password });
            setPassword('');
        }
        catch (err) {
            setLocalError(uiError(err));
        }
    };
    return <section className="connection-card social-connection"><div className="connection-card-heading"><span className="connection-icon"><Globe size={21}/></span><div><h4>{tr("Your private community")}</h4><p>{tr("Spacebar \u00B7 accounts, channels and conversations")}</p></div><span className={`connection-status ${c.status === 'connected' ? 'is-connected' : ''}`}>{c.status === 'connected' ? tr("Connected") : c.status === 'connecting' ? tr("Connecting\u2026") : c.status === 'reconnecting' ? tr("Reconnecting\u2026") : c.user ? tr("Disconnected") : tr("Sign in")}</span></div>
    {c.user ? <><div className="signed-in-profile"><Avatar name={c.user.displayName || c.user.username}/><div><strong>{c.user.displayName || c.user.username}</strong><small>{c.status === 'connected' ? tr("Your community is connected.") : tr("Your session is saved. Waiting for the server.")}</small></div><button className="button secondary small" onClick={() => void c.logout()} disabled={c.busy}><LogOut size={14}/>{tr("Sign out")}</button></div><div className="connection-disclosure">{c.spaces.length}{" " + tr("private space") + ""} · {c.mode === 'real' ? tr("Real community mode") : tr("Demo view")}</div>{c.mode === 'demo' && <button className="button secondary small" onClick={() => void c.openSpace(c.spaces[0]?.id ?? '')} disabled={!c.spaces.length}>{tr("Open community")}<ArrowRight size={14}/></button>}</> : <><div className="segmented" aria-label={tr("Account access")}><button className={!registration ? 'selected' : ''} onClick={() => setRegistration(false)}>{tr("Sign in")}</button><button className={registration ? 'selected' : ''} onClick={() => setRegistration(true)}>{tr("Join with an invitation")}</button></div><form onSubmit={e => void submit(e)}><label className="field-label">{tr("SERVER ADDRESS")}<input required type="url" aria-label={tr("Community server address")} value={server} onChange={e => setServer(e.target.value)} placeholder="https://your-private-server.example"/></label><button type="button" className="text-button local-server-button" onClick={() => setServer('http://127.0.0.1:3021')}>{tr("Use this computer\u2019s server")}<ArrowRight size={12}/></button>{registration && <><label className="field-label">{tr("INVITATION CODE")}<input required aria-label={tr("Invitation code")} autoComplete="off" maxLength={128} value={invite} onChange={e => setInvite(e.target.value)} placeholder={tr("From someone in your circle")}/></label><label className="field-label">{tr("HESAP DAVET KODU \u00B7 SUNUCUN \u0130ST\u0130YORSA")}<input value={accountInvite} onChange={e => setAccountInvite(e.target.value)} autoComplete="off" placeholder={tr("Topluluk davetinden ayr\u0131 hesap a\u00E7ma kodu")}/></label><label className="field-label">{tr("YOUR NAME")}<input required aria-label={tr("Account username")} autoComplete="nickname" maxLength={32} minLength={2} value={username} onChange={e => setUsername(e.target.value)} placeholder={tr("How your friends know you")}/></label></>}<label className="field-label">{tr("EMAIL")}<input required type="email" aria-label={tr("Account email")} autoComplete="email" value={email} onChange={e => setEmail(e.target.value)}/></label><label className="field-label">{tr("PASSWORD")}<input required type="password" aria-label={tr("Account password")} autoComplete={registration ? 'new-password' : 'current-password'} minLength={registration ? 8 : 1} value={password} onChange={e => setPassword(e.target.value)}/></label><button className="button primary full" type="submit" disabled={c.busy || !email.trim() || !password || !server.trim() || (registration && (!invite.trim() || !username.trim()))}>{c.busy ? <><RefreshCw size={15}/>{tr("Connecting\u2026")}</> : <>{registration ? tr("Join your friends") : tr("Come on in")}<ArrowRight size={15}/></>}</button></form><p className="connection-disclosure">{tr("An invitation is required to create an account. Your server handles sign-in; ROOMS keeps the session in the desktop\u2019s secure storage.")}</p></>}
    {(c.error || localError) && <div className="error-pane" role="alert"><strong>{tr("We couldn\u2019t complete that.")}</strong><p>{localError || c.error}</p></div>}
  </section>;
}
