import { VoiceAvatar } from './VoiceAvatar';
import { tr, uiError } from './i18n';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Check, MessageCircle, Plus, RefreshCw, ShieldCheck, Trash2, Users, X } from 'lucide-react';
import { Avatar, IconButton, Modal } from '@rooms/design';
import type { SocialFriend } from '@rooms/social';
import { useCommunity } from './community';
import { useRealtime } from './realtime';
const friendStatus: Record<SocialFriend['status'], string> = { online: tr("\u00C7evrimi\u00E7i"), idle: 'Uzakta', dnd: tr("Rahats\u0131z etmeyin"), invisible: tr("\u00C7evrimd\u0131\u015F\u0131"), unknown: 'Durum bilinmiyor' };
const relation: Record<SocialFriend['relationship'], string> = { friend: tr("Arkada\u015F"), incoming: 'Gelen istek', outgoing: tr("\u0130stek g\u00F6nderildi"), blocked: 'Engellendi' };
export function FriendsPanel({ notify, onClose }: {
    notify(message: string): void;
    onClose?(): void;
}) {
    const c = useCommunity(), r = useRealtime(), navigate = useNavigate();
    const [friends, setFriends] = useState<SocialFriend[]>([]), [show, setShow] = useState(false), [username, setUsername] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
    const refresh = useCallback(async () => {
        if (import.meta.env.DEV && new URLSearchParams(location.search).has('fixture')) {
            setFriends((await import('./dev/reference-fixtures')).getReferenceFriends());return;
        }
        if (!window.rooms?.social || !c.user) {
            if (import.meta.env.DEV && new URLSearchParams(location.search).has('fixture')) {
                const fixtures = await import('./dev/reference-fixtures');
                setFriends(fixtures.getReferenceFriends());
            } else setFriends([]);
            return;
        }
        try {
            setFriends(await window.rooms.social.friends());
            setError('');
        }
        catch (e) {
            setError(uiError(e));
        }
    }, [c.user?.id]);
    useEffect(() => {
        void refresh();
        const timer = setInterval(() => {
            if (!document.hidden)
                void refresh();
        }, 30000);
        return () => clearInterval(timer);
    }, [refresh]);
    const run = async (work: () => Promise<unknown>) => {
        setBusy(true);
        setError('');
        try {
            await work();
            await refresh();
        }
        catch (e) {
            setError(uiError(e));
        }
        finally {
            setBusy(false);
        }
    };
    const visibleFriends = friends.filter(friend => friend.relationship !== 'blocked').map(friend => {
        const live = c.presence[friend.user.id];
        const status: SocialFriend['status'] = c.status !== 'connected' ? 'unknown' : live && Object.hasOwn(friendStatus, live) ? live as SocialFriend['status'] : friend.status;
        return { ...friend, status };
    }).sort((left, right) => {
        const rank: Record<SocialFriend['status'], number> = { online: 0, idle: 1, dnd: 2, invisible: 3, unknown: 4 };
        return rank[left.status] - rank[right.status] || (left.user.displayName || left.user.username).localeCompare(right.user.displayName || right.user.username, 'tr');
    });
    return <aside className="friends-panel"><div className="friends-title"><h3>{tr("Dostlar\u0131n")}</h3>{onClose && <IconButton label="Üye panelini kapat" onClick={onClose}><X size={18}/></IconButton>}<IconButton label={tr("Arkada\u015F ekle")} onClick={() => setShow(true)}><Plus size={16}/></IconButton></div><div className="section-label"><span>{tr("ARKADA\u015ELARIN")}</span><IconButton label={tr("Arkada\u015Flar\u0131 yenile")} onClick={() => void refresh()}><RefreshCw size={12}/></IconButton></div>{visibleFriends.length ? visibleFriends.map(f => <div className="friend-relationship" key={f.user.id}><button className="friend-row" onClick={() => {
                if (f.relationship === 'friend')
                    void c.createDM(f.user.id).then(() => navigate('/chat')).catch(e => notify(uiError(e)));
                else
                    setShow(true);
            }}><VoiceAvatar id={f.user.id} name={f.user.displayName || f.user.username}/><div><strong>{f.user.displayName || f.user.username}</strong><small>{f.relationship === 'friend' ? friendStatus[f.status] : relation[f.relationship]}</small></div>{f.relationship === 'friend' && <MessageCircle size={13}/>}</button>{f.relationship === 'incoming' && <button className="text-button" disabled={busy} onClick={() => void run(() => window.rooms!.social.addFriend(`${f.user.username}${f.user.discriminator ? '#' + f.user.discriminator : ''}`))}><Check size={12}/>{tr("Kabul et")}</button>}</div>) : <div className="friends-empty"><Users size={23}/><p>{"Arkada\u015F yok"}</p><button className="text-button" onClick={() => setShow(true)}>{tr("Arkada\u015F ekle")}<Plus size={12}/></button></div>}{r.participants.length > 0 && <><div className="section-label"><span>{tr("SES ODAN")}</span><span>{r.participants.length}</span></div>{r.participants.map(p => <button className="friend-row" key={p.id} onClick={() => navigate('/voice')}><Avatar name={p.name}/><div><strong>{p.name}</strong><small>{p.muted ? tr("Mikrofon kapal\u0131") : p.speaking ? tr("Konu\u015Fuyor") : 'Dinliyor'}</small></div></button>)}</>}{error && <p className="friends-error" role="status">{error}</p>}{show && <Modal title={"Arkada\u015F ekle"} onClose={() => setShow(false)}><p className="modal-description">{tr("Arkada\u015F\u0131n\u0131n tam Stoat kullan\u0131c\u0131 ad\u0131n\u0131 ve varsa numaras\u0131n\u0131 gir.")}</p><form onSubmit={e => { e.preventDefault(); void run(async () => { await window.rooms!.social.addFriend(username.trim()); setUsername(''); notify(tr("Arkada\u015Fl\u0131k iste\u011Fi sunucuya g\u00F6nderildi.")); }); }}><label className="field-label">{tr("KULLANICI ADI")}<input value={username} onChange={e => setUsername(e.target.value)} required placeholder="kullanici#1234" maxLength={80}/></label><button className="button primary full" disabled={busy || !username.trim()}><Plus size={16}/>{tr("Arkada\u015Fl\u0131k iste\u011Fi g\u00F6nder")}</button></form><div className="friends-management">{friends.map(f => <div className="model-row" key={f.user.id}><VoiceAvatar id={f.user.id} name={f.user.displayName || f.user.username}/><div><strong>{f.user.displayName || f.user.username}</strong><small>{relation[f.relationship]}</small></div>{f.relationship === 'incoming' && <button className="button secondary small" disabled={busy} onClick={() => void run(() => window.rooms!.social.addFriend(`${f.user.username}${f.user.discriminator ? '#' + f.user.discriminator : ''}`))}>{tr("Kabul et")}</button>}<IconButton label={f.relationship === 'outgoing' ? tr("Arkada\u015Fl\u0131k iste\u011Fini iptal et") : f.relationship === 'incoming' ? tr("\u0130ste\u011Fi reddet") : tr("Arkada\u015Fl\u0131k ba\u011Flant\u0131s\u0131n\u0131 kald\u0131r")} disabled={busy} onClick={() => void run(() => window.rooms!.social.removeFriend(f.user.id))}><Trash2 size={14}/></IconButton></div>)}</div>{error && <div className="error-pane" role="alert">{error}</div>}</Modal>}</aside>;
}
export function AccountProfile({ notify }: {
    notify(message: string): void;
}) {
    const c = useCommunity();
    const [name, setName] = useState(c.user?.displayName ?? ''), [bio, setBio] = useState(''), [status, setStatus] = useState(''), [presence, setPresence] = useState<'online' | 'idle' | 'dnd' | 'invisible'>('online'), [busy, setBusy] = useState(false), [error, setError] = useState('');
    return <><h3>{"Profil"}</h3><div className="profile-photo-control">{c.user&&<VoiceAvatar id={c.user.id} name={c.user.displayName} large/>}<button className="button secondary small" disabled={busy} onClick={()=>{setBusy(true);void window.rooms!.social.chooseAvatar().then(photo=>{if(photo)notify('Fotoğraf güncellendi.');}).catch(e=>setError(uiError(e))).finally(()=>setBusy(false));}}>Fotoğraf değiştir</button><small>PNG, JPEG, WebP · 2 MB</small></div><div className="profile-preview"><Avatar name={c.user?.displayName || c.user?.username || 'Sen'} size="large"/><div><h3>{c.user?.displayName}</h3><span className="small-tag">{tr("STOAT HESABIN")}</span></div></div><form onSubmit={e => { e.preventDefault(); setBusy(true); setError(''); void window.rooms!.social.updateProfile({ displayName: name.trim(), ...(bio.trim() ? { bio: bio.trim() } : {}), ...(status.trim() ? { statusText: status.trim() } : {}) }).then(user => { useCommunity.setState({ user }); notify(tr("Profilin sunucuda g\u00FCncellendi.")); }).catch(e => setError(uiError(e))).finally(() => setBusy(false)); }}><label className="field-label">{tr("G\u00D6R\u00DCNEN AD")}<input required maxLength={32} value={name} onChange={e => setName(e.target.value)}/></label><label className="field-label">{tr("HAKKINDA \u00B7 DE\u011E\u0130\u015ET\u0130RMEK \u0130\u00C7\u0130N YAZ")}<textarea maxLength={2000} value={bio} onChange={e => setBio(e.target.value)} placeholder={"Hakk\u0131nda"}/></label><label className="field-label">{tr("DURUM MESAJI \u00B7 DE\u011E\u0130\u015ET\u0130RMEK \u0130\u00C7\u0130N YAZ")}<input maxLength={128} value={status} onChange={e => setStatus(e.target.value)} placeholder={"Durum"}/></label><button className="button primary" disabled={busy || !name.trim()}><Check size={16}/>{tr("Profili kaydet")}</button></form><div className="settings-row"><div><h4>{tr("G\u00F6r\u00FCn\u00FCrl\u00FCk")}</h4><p>{tr("Durumunu sunucuna bildir. G\u00F6r\u00FCnmezken \u00E7evrimi\u00E7i olarak g\u00F6sterilmezsin.")}</p></div><select aria-label={tr("Topluluk g\u00F6r\u00FCn\u00FCrl\u00FC\u011F\u00FC")} value={presence} onChange={e => { const value = e.target.value as typeof presence; setBusy(true); void c.setPresence(value).then(() => { setPresence(value); notify(tr("G\u00F6r\u00FCn\u00FCrl\u00FCk sunucuda g\u00FCncellendi.")); }).catch(e => setError(uiError(e))).finally(() => setBusy(false)); }} disabled={busy}><option value="online">{tr("\u00C7evrimi\u00E7i")}</option><option value="idle">{tr("Uzakta")}</option><option value="dnd">{tr("Rahats\u0131z etmeyin")}</option><option value="invisible">{tr("G\u00F6r\u00FCnmez")}</option></select></div>{error && <div className="error-pane" role="alert">{error}</div>}</>;
}
