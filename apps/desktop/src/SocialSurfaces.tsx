import { FriendRequestButton } from './FriendRequestButton';
import './reference-social.css';
import { dmCallUnavailable, startDmCall, useDmCall } from './dm-call';
import { useRealtime } from './realtime';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Modal, IconButton } from '@rooms/design';
import type { SocialUser, SocialFriend, SocialAttachment } from '@rooms/social';
import { FileText, Search, Hash, Volume2, ArrowRight, Download, Image, Upload, Phone, Video, User, Eye, Home, MessageCircle, AlertCircle, Bell, Pin, Users, X, Gamepad2, ShieldAlert } from 'lucide-react';
import { useCommunity, type CommunityMessage } from './community';
import { CommunityChat } from './RealSocial';
import { VoiceAvatar } from './VoiceAvatar';
import { useChannelAccess } from './channel-access';
import { uiError } from './i18n';
import type { SocialDetailFixture, SocialDetailFixtureId, SocialDetailQuickDestination } from './dev/social-detail-fixture';
import { preserveReferenceFixtureRoute } from './dev/fixture-navigation';

const fixtureOnly = () => import.meta.env.DEV && new URLSearchParams(window.location.search).has('fixture');
const fixtureReason = 'Yerel görsel örnekte gerçek hesap işlemi kapalı';
type OpenMessage = (channelId: string, messageId: string) => void;
const nameOf = (user: SocialUser) => user.displayName || user.username;
const statusLabel = (status?: string) => ({ online: 'Çevrimiçi', idle: 'Uzakta', dnd: 'Rahatsız etmeyin', invisible: 'Görünmez', offline: 'Çevrimdışı' }[status ?? ''] ?? 'Durum alınamadı');
const sizeOf = (size: number) => size >= 1048576 ? `${(size / 1048576).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} MB` : `${Math.ceil(size / 1024)} KB`;
const dateOf = (date: string) => new Date(date).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const safeFileUrl = (url?: string) => { try { const parsed = new URL(url ?? ''); return ['https:', 'http:'].includes(parsed.protocol) ? parsed.href : undefined; } catch { return undefined; } };
/** Load samples only in an explicit DEV fixture, and only for the installed isolated identity. */
function useSocialDetailFixture(expected: SocialDetailFixtureId) {
  const c = useCommunity();
  const params = import.meta.env.DEV ? new URLSearchParams(location.search) : null;
  const requested = params?.get('fixture')?.trim().toUpperCase();
  const variant = params?.get('variant') ?? 'default';
  const key = `${requested ?? ''}:${variant}:${c.user?.id ?? ''}:${c.serverUrl}:${c.activeChannelId ?? ''}:${c.status}`;
  const [loaded, setLoaded] = useState<{ key: string; fixture?: SocialDetailFixture; error?: string } | null>(null);
  useEffect(() => {
    if (!import.meta.env.DEV || requested !== expected) return;
    let alive = true;
    void import('./dev/social-detail-fixture').then(module => {
      const fixture = module.getSocialDetailFixture(requested, variant);
      if (alive) setLoaded({ key, fixture });
    }).catch(error => { if (alive) setLoaded({ key, error: uiError(error) }); });
    return () => { alive = false; };
  }, [expected, requested, variant, key]);
  const current = loaded?.key === key ? loaded : null;
  const fixture = current?.fixture;
  const matches = fixture && c.user?.id === fixture.publicState.user?.id && c.serverUrl === fixture.publicState.serverUrl && c.activeChannelId === fixture.publicState.activeChannelId && c.status === fixture.publicState.status;
  return {
    key, fixture: matches ? fixture : null,
    loading: requested === expected && !current,
    error: current?.error ?? (fixture && !matches ? 'Yerel örnek sosyal verileri henüz kurulmadı veya hesap/kanal değişti.' : ''),
  };
}
function FixtureOpening({ loading, error }: { loading: boolean; error: string }) {
  return <p className={error ? 'ss-error' : 'ss-scope'} role={error ? 'alert' : 'status'}>{error || (loading ? 'Yerel örnek hazırlanıyor…' : '')}</p>;
}
/** The only fixture image is passive original artwork, never an arbitrary local/remote URL. */
function fixtureImageUrl(file: SocialAttachment, fixture: SocialDetailFixture | null) {
  if (!import.meta.env.DEV || !fixtureOnly() || !fixture || fixture.metadata.id !== 'S14') return undefined;
  const path = fixture.assets.attachments[file.id];
  return path === '/__reference/01_brand/cinema-still.svg' && file.url === path && file.mime === 'image/svg+xml' ? path : undefined;
}
/** A pending operation belongs to one mounted account/server/channel and access epoch. */
function useSocialOperationScope(){
  const c=useCommunity(),checking=useChannelAccess(state=>c.activeChannelId?state.checks[c.activeChannelId]:undefined);
  const alive=useRef(true),epoch=useRef(0),[revoked,setRevoked]=useState(false);
  useEffect(()=>{alive.current=true;const invalidate=(event:Event)=>{const ids=(event as CustomEvent<{channelIds?:string[]}>).detail?.channelIds;if(ids&&c.activeChannelId&&!ids.includes(c.activeChannelId))return;++epoch.current;setRevoked(true);};window.addEventListener('rooms:channel-access-invalidated',invalidate);window.addEventListener('rooms:community-management-invalidated',invalidate);return()=>{alive.current=false;++epoch.current;window.removeEventListener('rooms:channel-access-invalidated',invalidate);window.removeEventListener('rooms:community-management-invalidated',invalidate);};},[c.activeChannelId]);
  const capture=()=>{const state=useCommunity.getState(),generation=epoch.current,bridge=window.rooms?.social;return {bridge,channelId:state.activeChannelId,sameAccount:()=>{const now=useCommunity.getState();return now.user?.id===state.user?.id&&now.serverUrl===state.serverUrl&&window.rooms?.social===bridge;},current:(channelId=state.activeChannelId)=>{const now=useCommunity.getState();return alive.current&&generation===epoch.current&&!fixtureOnly()&&now.status==='connected'&&state.status==='connected'&&now.user?.id===state.user?.id&&now.serverUrl===state.serverUrl&&now.activeChannelId===channelId&&window.rooms?.social===bridge&&!(channelId&&useChannelAccess.getState().checks[channelId]);}};};
  return {capture,blocked:revoked||!!checking||c.status!=='connected'};
}
function FileLink({ file }: { file: SocialAttachment }) { const url = fixtureOnly()?undefined:safeFileUrl(file.url); return url ? <a className="ss-file-link" href={url} target="_blank" rel="noreferrer"><Download size={17}/>İndir</a> : <button disabled title={fixtureOnly() ? fixtureReason : "Sunucu dosya bağlantısını sağlamadı"}><Download size={17}/>İndir</button>; }

export function DirectMessageSurface({ notify }: { notify(message: string): void }) {
  const c = useCommunity(), detail = useSocialDetailFixture('S12');
  const access = useChannelAccess(state => c.activeChannelId ? state.checks[c.activeChannelId] : undefined);
  if (detail.loading || detail.error) return <FixtureOpening loading={detail.loading} error={detail.error}/>;
  return <DirectMessageScope key={`${detail.key}:${access ?? 'allowed'}`} notify={notify} fixture={detail.fixture}/>;
}
function DirectMessageScope({ notify, fixture }: { notify(message: string): void; fixture: SocialDetailFixture | null }) {
  const c = useCommunity(), navigate = useNavigate();
  const scope = useSocialOperationScope();
  const intent = fixture?.ui.surface === 'dm' ? fixture.ui : null;
  const dm = useDmCall(); useRealtime();
  const callReason = fixtureOnly() ? fixtureReason : scope.blocked ? 'Kanal erişimi yeniden doğrulanmalı.' : !window.rooms?.dmCalls ? 'Özel arama için masaüstü uygulamasını aç.' : dmCallUnavailable();
  const call = async (mode: 'audio' | 'video') => { if (!channel || callReason) return; const request = scope.capture(); try { await startDmCall(channel.id,mode); if (request.current()) navigate('/dm-call'); } catch (e) { if (request.current()) setError(uiError(e)); } };
  const channel = c.dms.find(item => item.id === c.activeChannelId);
  const peer = channel?.recipients?.find(item => item.id !== c.user?.id);
  const [relationship, setRelationship] = useState<SocialFriend['relationship'] | null>(intent?.relationship ?? null);
  const [relationshipReady, setRelationshipReady] = useState(intent?.relationshipReady ?? false);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [profile, setProfile] = useState(false), [search, setSearch] = useState(false), [inspectorVisible, setInspectorVisible] = useState(true);
  useEffect(() => { if (fixtureOnly()) return; let active = true; setRelationship(null); setRelationshipReady(false); setError(''); const request = scope.capture(); if (peer && c.user && !scope.blocked) void request.bridge?.friends().then(items => { if (active && request.current()) { setRelationship(items.find(item => item.user.id === peer.id)?.relationship ?? null); setRelationshipReady(true); } }).catch(e => { if (active && request.current()) setError(uiError(e)); }); return () => { active = false; }; }, [peer?.id, c.user?.id, c.serverUrl, scope.blocked]);
  const changeRelationship = async () => { if (!peer || !window.rooms || fixtureOnly() || scope.blocked || busy) return; const request = scope.capture(); setBusy(true); setError(''); try { if (relationship === 'blocked') await request.bridge!.unblockUser(peer.id); else await request.bridge!.addFriend(`${peer.username}${peer.discriminator?'#'+peer.discriminator:''}`); if (!request.current()) return; const items = await request.bridge!.friends(); if (request.current()) setRelationship(items.find(item => item.user.id === peer.id)?.relationship ?? null); } catch (e) { if (request.current()) setError(uiError(e)); } finally { if (request.current()) setBusy(false); } };
  if (!channel || !peer) return <div className="ss-empty"><MessageCircle size={42}/><h2>Özel konuşma seç</h2><p>Arkadaşlarından veya üyelerden bir konuşma aç.</p></div>;
  const files = c.messages.filter(message => message.channelId === channel.id).flatMap(message => (message.attachments ?? []).map(file => ({ file, message })));
  const peerDetails = fixture?.profileDetails?.[peer.id];
  const inspectorFiles = fixture ? (peerDetails?.sharedFiles ?? []) : files.slice(-5).map(({ file }) => file);
  const relationshipRestricted = relationshipReady && relationship !== 'friend';
  return <div className={`ss-dm ${relationship === 'blocked' ? 'blocked' : ''} ${relationshipRestricted ? 'relationship-restricted' : ''}`}><section className="ss-dm-main"><header className="ss-header"><Hash size={23}/><button onClick={() => setProfile(true)}>{nameOf(peer)}</button><span>{statusLabel(c.presence[peer.id])}</span><div><IconButton label="Bildirim ayarları" onClick={() => navigate(preserveReferenceFixtureRoute('/settings?tab=desktop'))}><Bell size={19}/></IconButton><IconButton disabled label="Sabitlenen mesajlar bu bağlantıda sunulmuyor."><Pin size={19}/></IconButton><IconButton label={inspectorVisible ? 'Üye panelini kapat' : 'Üye panelini aç'} aria-pressed={inspectorVisible} onClick={() => setInspectorVisible(value => !value)}><Users size={19}/></IconButton><IconButton label="Yüklenen konuşmada ara" onClick={() => setSearch(true)}><Search size={19}/></IconButton></div></header><div className="ss-dm-intro"><VoiceAvatar id={peer.id} name={nameOf(peer)}/><div><strong>{nameOf(peer)} ile özel konuşman</strong><small>Bu konuşmayı yalnızca siz görebilirsiniz.</small></div><IconButton disabled={!!callReason || relationship === 'blocked' || dm.busy} label={callReason ?? 'Sesli arama'} onClick={() => void call('audio')}><Phone size={19}/></IconButton><IconButton disabled={!!callReason || relationship === 'blocked' || dm.busy} label={callReason ?? 'Görüntülü arama'} onClick={() => void call('video')}><Video size={19}/></IconButton></div><CommunityChat notify={notify} composerPlaceholder={fixture?.metadata.id === 'S12' ? `${nameOf(peer)}’ye mesaj yaz` : undefined}/>{relationshipReady && relationship !== 'friend' && <div className={`ss-relationship ${relationship === 'blocked' ? 'warning' : ''}`}>{relationship === 'blocked' ? <ShieldAlert size={18} aria-hidden="true"/> : <Users size={18} aria-hidden="true"/>}<span>{relationship === 'blocked' ? `${nameOf(peer)}’yi engelledin. Mesaj göndermek için engeli kaldır.` : relationship === 'outgoing' ? 'Arkadaşlık isteğin gönderildi.' : relationship === 'incoming' ? 'Bu kişiden arkadaşlık isteği var.' : 'Henüz arkadaş değilsiniz.'}</span><button className="button primary" disabled={busy || scope.blocked || !window.rooms || fixtureOnly() || relationship === 'outgoing'} title={fixtureOnly() ? fixtureReason : scope.blocked ? 'Kanal erişimi yeniden doğrulanmalı.' : undefined} onClick={() => void changeRelationship()}>{busy ? 'Bekleniyor…' : relationship === 'blocked' ? 'Engeli kaldır' : relationship === 'incoming' ? 'İsteği kabul et' : 'Arkadaş ekle'}</button></div>}{error && <p className="ss-error" role="alert">{error}</p>}</section>{inspectorVisible && <aside className="ss-dm-inspector"><div className="ss-inspector-heading"><h6>PROFİL</h6><IconButton label="Üye panelini kapat" onClick={() => setInspectorVisible(false)}><X size={17}/></IconButton></div><button className="ss-peer" onClick={() => setProfile(true)}><VoiceAvatar id={peer.id} name={nameOf(peer)} large/><h2>{nameOf(peer)}</h2>{!fixture && <p>@{peer.username}</p>}{peerDetails?.statusText&&<p className="ss-peer-status">{peerDetails.statusText}</p>}</button>{peerDetails?.mutualSpaces?.length ? <><h6>ORTAK TOPLULUK</h6>{peerDetails.mutualSpaces.map(space => <button className={`ss-mutual-space ${fixture ? 'reference-match' : ''}`} key={space.id} onClick={() => navigate(preserveReferenceFixtureRoute('/spaces'))}><Home size={17}/><span>{space.name}</span><ArrowRight size={15}/></button>)}</> : null}<h6>PAYLAŞILANLAR</h6>{inspectorFiles.length ? inspectorFiles.slice(-5).map(file => <div className="ss-shared-row" key={file.id}><FileText size={20}/><span>{file.name}</span>{!fixture && <FileLink file={file}/>}</div>) : <p>Yüklenen mesajlarda dosya yok.</p>}{!fixture && <button className="button secondary" onClick={() => navigate(preserveReferenceFixtureRoute('/files'))}>Dosyaları aç</button>}</aside>}{profile && <UserProfileDialog user={peer} onClose={() => setProfile(false)}/>} {search && <SocialSearchDialog onClose={() => setSearch(false)}/>}</div>;
}

interface SocialSearchProps { onClose(): void; initialMode?: 'messages' | 'files' | 'quick'; initialQuery?: string; onOpenMessage?: OpenMessage; }
export function SocialSearchDialog(props: SocialSearchProps) {
  const c = useCommunity(), detail = useSocialDetailFixture('S13');
  const access = useChannelAccess(state => c.activeChannelId ? state.checks[c.activeChannelId] : undefined);
  const intent = detail.fixture?.ui.surface === 'search' ? detail.fixture.ui : null;
  if (detail.loading || detail.error) return <Modal title="Arama" onClose={props.onClose}><FixtureOpening loading={detail.loading} error={detail.error}/></Modal>;
  return <SocialSearchScope key={`${detail.key}:${access ?? 'allowed'}`} {...props} fixture={detail.fixture} initialMode={intent?.initialMode ?? props.initialMode} initialQuery={intent?.initialQuery ?? props.initialQuery}/>;
}
function SocialSearchScope({ onClose, initialMode = 'messages', initialQuery = '', onOpenMessage, fixture }: SocialSearchProps & { fixture: SocialDetailFixture | null }) {
  const c = useCommunity(), navigate = useNavigate();
  const scope=useSocialOperationScope();
  const [query, setQuery] = useState(initialQuery), [mode, setMode] = useState(initialMode), [author, setAuthor] = useState(''), [selected, setSelected] = useState(0), [error, setError] = useState('');
  const channels = [...c.channels, ...c.dms];
  const channel = channels.find(item => item.id === c.activeChannelId);
  const needle = query.trim().toLocaleLowerCase('tr-TR');
  const matches = (scope.blocked ? [] : c.messages).filter(message => message.channelId === c.activeChannelId && (!author || message.author.id === author) && (mode === 'files' ? message.attachments?.some(file => file.name.toLocaleLowerCase('tr-TR').includes(needle)) : message.content.toLocaleLowerCase('tr-TR').includes(needle))).sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
  const quickFixture = import.meta.env.DEV && fixtureOnly() && fixture?.ui.surface === 'search' ? fixture.ui.quickDestinations : undefined;
  const destinations: SocialDetailQuickDestination[] = scope.blocked ? [] : quickFixture
    ? quickFixture.filter(item => (!item.channelId || channels.some(channel => channel.id === item.channelId)) && item.keywords.some(keyword => keyword.toLocaleLowerCase('tr-TR').includes(needle)))
    : channels.filter(item => item.name.toLocaleLowerCase('tr-TR').includes(needle)).map(item => ({ id: item.id, label: item.name, kind: item.type === 2 ? 'voice' : 'text', channelId: item.id, keywords: [item.name] }));
  const people = [...new Map((scope.blocked ? [] : c.messages).map(message => [message.author.id, message.author])).values()];
  useEffect(() => setSelected(0), [query, mode]);
  const open = async (id: string, messageId?: string) => {
    if(scope.blocked)return;
    if(fixtureOnly()){
      const state=useCommunity.getState(),target=[...state.channels,...state.dms].find(item=>item.id===id);
      if(!target||messageId&&!state.messages.some(message=>message.id===messageId&&message.channelId===id)){setError('Yerel örnekte bu kanal veya mesaj bulunamadı.');return;}
      useCommunity.setState({activeSpaceId:target.spaceId??null,activeChannelId:id,messages:state.messages.filter(message=>message.channelId===id),loadingMessages:false,hasOlder:false,error:null});
      navigate(preserveReferenceFixtureRoute(`${target.type===2?'/voice':'/chat'}${messageId?`?message=${encodeURIComponent(messageId)}`:''}`));onClose();return;
    }
    const request=scope.capture();setError('');try{if(messageId&&onOpenMessage){if(request.current())onOpenMessage(id,messageId);}else{if(id!==c.activeChannelId)await c.openChannel(id);if(!request.current(id))return;navigate(preserveReferenceFixtureRoute(`/chat${messageId?`?message=${encodeURIComponent(messageId)}`:''}`));}if(request.current(id))onClose();}catch(e){if(request.current())setError(uiError(e));}
  };
  const openDestination = (destination: SocialDetailQuickDestination) => {
    if (scope.blocked) return;
    if (destination.channelId) { void open(destination.channelId); return; }
    if (import.meta.env.DEV && quickFixture && destination.route === '/games') { navigate(preserveReferenceFixtureRoute('/games')); onClose(); }
  };
  const highlight = (value: string) => { if (!needle) return value; const index = value.toLocaleLowerCase('tr-TR').indexOf(needle); return index < 0 ? value : <>{value.slice(0, index)}<mark>{value.slice(index, index + needle.length)}</mark>{value.slice(index + needle.length)}</>; };
  return <Modal title={mode === 'quick' ? 'Nereye gitmek istersin?' : fixture?.metadata.id === 'S13' ? 'Bizim Oda’da ara' : `${c.spaces.find(item => item.id === c.activeSpaceId)?.name ?? 'Konuşma'} içinde ara`} className={`ss-modal ss-search ${mode === 'files' ? 'ss-search-files' : ''} ${mode === 'quick' ? 'ss-search-quick' : ''} ${mode !== 'quick' && !matches.length ? 'ss-search-no-results' : ''}`} onClose={onClose}><div className="ss-modal-body"><div className="ss-search-input"><input aria-label="Arama" placeholder="Mesaj, dosya veya kanal ara" value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (mode !== 'quick' || !destinations.length) return; if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setSelected(index => (index + (event.key === 'ArrowDown' ? 1 : -1) + destinations.length) % destinations.length); } if (event.key === 'Enter') { event.preventDefault(); openDestination(destinations[selected] ?? destinations[0]); } }}/><Search size={20}/></div>{mode !== 'quick' && <div className="ss-search-filters"><span>{fixture?.metadata.id === 'S13' ? 'Kanal: tümü' : `Kanal: ${channel?.name ?? 'seçilmedi'}`}</span><select aria-label="Kişi filtresi" value={author} onChange={event => setAuthor(event.target.value)}><option value="">Kişi: herkes</option>{people.map(person => <option key={person.id} value={person.id}>{nameOf(person)}</option>)}</select><select aria-label="Arama türü" value={mode} onChange={event => setMode(event.target.value as typeof mode)}><option value="messages">Tür: mesaj</option><option value="files">Tür: dosya</option><option value="quick">Kanal geçişi</option></select></div>}{mode !== 'quick' && !fixture && <p className="ss-scope">Bu kanalda yüklenen {c.messages.length} mesaj içinde aranıyor.</p>}<div className="ss-search-results">{mode === 'quick' ? destinations.map((item, index) => <button key={item.id} className={`ss-destination ${index === selected ? 'selected' : ''}`} disabled={scope.blocked} onFocus={() => setSelected(index)} onClick={() => openDestination(item)}>{item.kind === 'voice' ? <Volume2 size={19}/> : item.kind === 'games' ? <Gamepad2 size={19}/> : <Hash size={19}/>}<span>{item.label}{item.memberCount !== undefined ? ` · ${item.memberCount} kişi` : ''}</span></button>) : matches.map(message => mode === 'files' ? (message.attachments ?? []).filter(file => file.name.toLocaleLowerCase('tr-TR').includes(needle)).map(file => <div className="ss-search-file" key={`${message.id}-${file.id}`}><FileText size={26}/><div><strong>{highlight(file.name)}</strong><small>{channel?.name} · {nameOf(message.author)} · {dateOf(message.timestamp)}</small></div><button disabled={scope.blocked} onClick={() => void open(message.channelId, message.id)}>Bağlamı aç</button></div>) : <article className="ss-search-result" key={message.id}><VoiceAvatar id={message.author.id} name={nameOf(message.author)}/><div><strong>{nameOf(message.author)}</strong><small>{channel?.name} · {dateOf(message.timestamp)}</small><p>{highlight(message.content)}</p><button disabled={scope.blocked} onClick={() => void open(message.channelId, message.id)}><ArrowRight size={14}/>Mesaja git</button></div></article>)}{!(mode === 'quick' ? destinations.length : matches.length) && <div className="ss-empty"><Search size={38}/><h2>Bir eşleşme bulamadık.</h2><p>Farklı bir kelime veya daha az filtre deneyebilirsin.</p></div>}</div>{mode === 'quick' && <p className="ss-scope">↑ ↓ Seç · Enter Aç · Esc Kapat</p>}{error && <p className="ss-error" role="alert">{error}</p>}</div><footer className="ss-modal-footer"><button onClick={onClose}>Kapat</button></footer></Modal>;
}

function ReferencePdfIcon() {
  return <svg className="ss-pdf-icon" width="58" height="58" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="4.2" strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true"><path d="M15 6h23l12 12v40H15z"/><path d="M38 7v13h12M23 34h20M23 43h20M23 52h13"/></svg>;
}
function ReferenceBoardIcon() {
  return <svg className="ss-board-icon" width="58" height="58" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="4.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="8" y="7" width="48" height="35" rx="2"/><path d="M17 59l6-17m24 17l-6-17M17 57h30M18 31l8-8 7 6 12-12"/></svg>;
}
export function SharedFilesSurface(props: { notify(message: string): void; onOpenMessage?: OpenMessage }) {
 const c=useCommunity(),detail=useSocialDetailFixture('S14'),access=useChannelAccess(state=>c.activeChannelId?state.checks[c.activeChannelId]:undefined);
 if(detail.loading||detail.error)return <FixtureOpening loading={detail.loading} error={detail.error}/>;
 return <SharedFilesScope key={`${detail.key}:${access??'allowed'}`} {...props} fixture={detail.fixture}/>;
}
function SharedFilesScope({ notify, onOpenMessage, fixture }: { notify(message: string): void; onOpenMessage?: OpenMessage; fixture: SocialDetailFixture | null }) {
  const c = useCommunity(), navigate = useNavigate();
  const intent = fixture?.ui.surface === 'files' ? fixture.ui : null;
  const scope=useSocialOperationScope(),uploadLock=useRef(false);
  const [tab, setTab] = useState('all'), [preview, setPreview] = useState<SocialAttachment | null>(() => {
    const candidate = c.messages.filter(message => message.channelId === c.activeChannelId).flatMap(message => message.attachments ?? []).find(file => file.id === intent?.initialPreviewId);
    return candidate && fixtureImageUrl(candidate, fixture) ? candidate : null;
  }), [busy, setBusy] = useState(false), [error, setError] = useState(intent?.initialUploadState === 'failed' ? intent.initialError ?? '' : '');
  useEffect(()=>{const clear=()=>{setPreview(null);setError('');};window.addEventListener('rooms:channel-access-invalidated',clear);return()=>window.removeEventListener('rooms:channel-access-invalidated',clear);},[]);
  const files = useMemo(() => (scope.blocked?[]:c.messages.filter(message=>message.channelId===c.activeChannelId)).flatMap(message => (message.attachments ?? []).map(file => ({ file, message }))).sort((a,b)=>Date.parse(b.message.timestamp)-Date.parse(a.message.timestamp)).filter(({ file }) => tab === 'all' || (tab === 'images' ? file.mime.startsWith('image/') : !file.mime.startsWith('image/'))), [c.messages, tab,scope.blocked,c.activeChannelId]);
  const upload = async () => {
    if(!window.rooms||!c.activeChannelId||!c.user||uploadLock.current||scope.blocked||fixtureOnly())return;
    const request=scope.capture();uploadLock.current=true;setBusy(true);setError('');
    try{const file=await request.bridge!.chooseAttachment(request.channelId!);if(!file)return;
      if(!request.current()){if(request.sameAccount()&&!fixtureOnly())await request.bridge!.discardAttachment(file.id).catch(()=>{});return;}
      await c.send('',[file]);
    }catch(e){if(request.current())setError(uiError(e));}finally{uploadLock.current=false;if(request.current())setBusy(false);}
  };
  const scopedAction=async(action:()=>Promise<void>)=>{if(fixtureOnly()||scope.blocked)return;const request=scope.capture();try{await action();}catch(e){if(request.current())setError(uiError(e));}};
  const openContext=(channelId:string,messageId:string)=>{if(!fixtureOnly()&&!scope.blocked&&scope.capture().current())onOpenMessage?.(channelId,messageId);};
  const closePreview = useCallback(() => setPreview(null), []);
  const imageUrl = (file: SocialAttachment) => !scope.blocked && file.mime.startsWith('image/') ? fixtureOnly() ? fixtureImageUrl(file, fixture) : safeFileUrl(file.url) : undefined;
  const previewUrl = preview ? imageUrl(preview) : undefined;
  return <section className="ss-files"><header className="ss-files-heading"><div><h1>{fixture?.metadata.id === 'S14' ? 'Birbirimize bıraktıklarımız' : 'Paylaşılan dosyalar'}</h1><p>{fixture?.metadata.id === 'S14' ? `${c.spaces.find(space => space.id === c.activeSpaceId)?.name ?? 'Topluluk'}’da paylaşılan dosyalar.` : `${c.channels.find(item => item.id === c.activeChannelId)?.name ?? c.dms.find(item => item.id === c.activeChannelId)?.name ?? 'Kanal seç'} · Yüklenen mesajlar`}</p></div><button className="button primary" disabled={busy || scope.blocked || !c.activeChannelId || !c.user || !window.rooms || fixtureOnly()} title={scope.blocked?'Kanal erişimi yeniden doğrulanmalı.':fixtureOnly() ? fixtureReason : !c.activeChannelId ? 'Dosya paylaşmak için bir metin kanalı seç' : undefined} onClick={() => void upload()}><Upload size={18}/>Dosya yükle</button></header>{intent?.initialUploadState === 'unavailable' && !scope.blocked && <div className="ss-upload" role="status"><AlertCircle size={26}/><div><strong>Yükleme durumu sağlanmıyor</strong><small>{intent.initialError}</small></div><button disabled title="Sunucu yükleme iptali sağlamıyor">İptal</button></div>}{busy && <div className="ss-upload" role="status"><FileText size={26}/><div><strong>Dosya seçiliyor veya yükleniyor…</strong><progress aria-label="Dosya yüklemesi"/><small>Sunucu yükleme yüzdesi sağlamıyor.</small></div><button disabled title="Yerel yükleme iptali henüz uygulanmadı">İptal</button></div>}{error && <div className="ss-upload ss-error" role="alert"><AlertCircle size={18}/><span>{error}</span><button onClick={() => { setError(''); if (!fixtureOnly()) notify('Başarısız mesajı sohbetten yeniden gönderebilirsin; yeni yükleme için dosyayı tekrar seç.'); }}>Kapat</button></div>}<div className="ss-tabs" role="tablist" aria-label="Dosya türü">{[['all', 'Tümü'], ['images', 'Görseller'], ['documents', 'Belgeler']].map(([key, label]) => <button key={key} role="tab" aria-selected={tab === key} onClick={() => setTab(key)}>{label}</button>)}</div><div className="ss-file-grid">{files.map(({ file, message }) => { const image = imageUrl(file), boardReference = !!fixture && fixture.metadata.id === 'S14' && file.id === 'demo-sunday-plan-png'; return <article className="ss-file-tile" key={`${message.id}-${file.id}`}><button className={`ss-file-preview ${image ? 'image' : ''} ${boardReference ? 'board' : ''}`} disabled={!image} title={!image ? boardReference ? 'Örnek PNG içeriği sağlanmadı.' : 'İzinli görsel önizleme kaynağı sağlanmadı' : undefined} onClick={() => setPreview(file)} aria-label={`${file.name} önizle`}>{image ? <img src={image} alt={file.name} loading="lazy"/> : boardReference ? <ReferenceBoardIcon/> : file.mime === 'application/pdf' ? <ReferencePdfIcon/> : <FileText size={58}/>}</button><footer><h4>{file.name}</h4><p>{nameOf(message.author)} · {fixture?.metadata.id === 'S14' ? message.id === 'demo-detail-board-file' ? 'Dün 19.15' : 'Bugün 20.45' : dateOf(message.timestamp)} · {sizeOf(file.size)}</p>{boardReference ? <button onClick={() => navigate(preserveReferenceFixtureRoute('/together?tab=board'))} title="Uygulamadaki ortak Whiteboard alanını açar; örnek PNG içeriği dahil değildir."><ArrowRight size={17}/>Tahtayı aç</button> : message.delivery === 'failed' ? <button disabled={fixtureOnly()} title={fixtureOnly() ? fixtureReason : undefined} onClick={() => void scopedAction(()=>c.retryMessage(message.id))}>Gönderimi yeniden dene</button> : message.delivery === 'pending' ? <span role="status">Gönderiliyor…</span> : image ? <button onClick={() => setPreview(file)}><Image size={17}/>Önizle</button> : <FileLink file={file}/>} {onOpenMessage && !fixture && <button disabled={fixtureOnly()||scope.blocked} title={fixtureOnly()?fixtureReason:scope.blocked?'Kanal erişimi yeniden doğrulanmalı.':undefined} onClick={() => openContext(message.channelId, message.id)}>Bağlamı aç</button>}</footer></article>; })}</div>{!files.length && <div className="ss-empty"><FileText size={42}/><h2>Dosya yok</h2><p>Seçili kanalda yüklenen mesajlarda bu türde dosya bulunamadı.</p></div>}{c.hasOlder && <button className="button secondary" disabled={c.loadingMessages || scope.blocked || fixtureOnly()} title={fixtureOnly() ? fixtureReason : undefined} onClick={() => void scopedAction(()=>c.loadOlder())}>Önceki mesajların dosyalarını yükle</button>}{preview && previewUrl && <Modal title={preview.name} className="ss-modal ss-preview" onClose={closePreview}><div className="ss-modal-body"><img src={previewUrl} alt={preview.name}/><p>{preview.name} · {sizeOf(preview.size)}</p></div><footer className="ss-modal-footer"><FileLink file={preview}/></footer></Modal>}</section>;
}

interface UserProfileProps { user?: SocialUser; onClose(): void; initialView?: 'profile' | 'expanded' | 'status' | 'invisible'; }
export function UserProfileDialog(props: UserProfileProps) {
  const c = useCommunity(), detail = useSocialDetailFixture('S15');
  const access = useChannelAccess(state => c.activeChannelId ? state.checks[c.activeChannelId] : undefined);
  const accountScope = `${c.user?.id ?? ''}:${c.serverUrl}:${c.activeChannelId ?? ''}:${props.user?.id ?? ''}:${access ?? 'allowed'}:${c.status}`;
  const mountedScope = useRef(accountScope);
  const changed = mountedScope.current !== accountScope;
  useEffect(() => { if (changed) props.onClose(); }, [changed, props.onClose]);
  if (changed) return null;
  if (detail.loading || detail.error) return <Modal title="Profil" onClose={props.onClose}><FixtureOpening loading={detail.loading} error={detail.error}/></Modal>;
  const intent = detail.fixture?.ui.surface === 'profile' && detail.fixture.ui.userId === (props.user ?? c.user)?.id ? detail.fixture.ui : null;
  return <UserProfileScope key={`${accountScope}:${detail.key}`} {...props} initialView={intent?.initialView ?? props.initialView} fixtureMode={!!detail.fixture} fixtureDetails={detail.fixture?.profileDetails?.[(props.user??c.user)?.id ?? '']}/>;
}
function UserProfileScope({ user, onClose, initialView = 'profile', fixtureMode = false, fixtureDetails }: UserProfileProps & { fixtureMode?: boolean; fixtureDetails?: { statusText?: string; about?: string } }) {
  const c = useCommunity(), navigate = useNavigate();
  const scope = useSocialOperationScope();
  const person = user ?? c.user, own = person?.id === c.user?.id;
  const [view, setView] = useState(initialView), [busy, setBusy] = useState(false), [error, setError] = useState('');
  if (scope.blocked) return <Modal title="Profil" className="ss-modal ss-profile" onClose={onClose}><div className="ss-modal-body"><p role="status">Hesap ve kanal erişimi yeniden doğrulanmalı.</p></div></Modal>;
  if (!person) return <Modal title="Profil" className="ss-modal ss-profile" onClose={onClose}><div className="ss-modal-body"><p>Profil için giriş yap.</p></div></Modal>;
  const status = c.presence[person.id];
  const setStatus = async (next: 'online' | 'dnd' | 'invisible' | 'idle') => { if (fixtureOnly() || scope.blocked || busy || !own) return; const request = scope.capture(); setBusy(true); setError(''); try { await c.setPresence(next); if (!request.current()) return; useCommunity.setState(state => ({ presence: { ...state.presence, [person.id]: next } })); setView(next === 'invisible' ? 'invisible' : 'profile'); } catch (e) { if (request.current()) setError(uiError(e)); } finally { if (request.current()) setBusy(false); } };
  const title = view === 'status' ? 'Durumunu seç' : view === 'invisible' && own && status === 'invisible' ? 'Görünmezsin' : fixtureDetails?.about ? 'Deniz’in profili' : `${nameOf(person)} profili`;
  const statusOptions: Array<[string, string, string]> = [['online', 'Çevrimiçi', ''], ['idle', 'Uzakta', ''], ['dnd', 'Rahatsız etmeyin', 'Durumunu diğer üyelere bildir'], ['invisible', 'Görünmez', 'Başkalarına çevrimdışı görün']];
  return <Modal title={title} className={`ss-modal ss-profile ${view === 'profile' || view === 'expanded' ? 'with-banner' : ''}`} onClose={onClose}><div className="ss-modal-body">{view === 'status' && own ? <div className="ss-status-options">{statusOptions.filter(([key]) => !fixtureMode || key !== 'idle').map(([key, label, help]) => <button key={key} aria-pressed={status === key} disabled={busy || scope.blocked || !window.rooms || fixtureOnly()} title={fixtureOnly() ? fixtureReason : scope.blocked ? 'Kanal erişimi yeniden doğrulanmalı.' : undefined} onClick={() => void setStatus(key as 'online' | 'idle' | 'dnd' | 'invisible')}><i className={key}/><span><strong>{label}</strong>{help && <small>{help}</small>}</span></button>)}</div> : view === 'invisible' && own && status === 'invisible' ? <><div className="ss-invisible"><Eye size={18}/>Senin durumun: Görünmez</div><div className="ss-offline-preview"><h6>DİĞER ÜYELERİN GÖRDÜĞÜ</h6><div><VoiceAvatar id={person.id} name={nameOf(person)}/><span><strong>{nameOf(person)}</strong><small>Çevrimdışı</small></span></div></div><p className="ss-scope">Görünmez olduğunu yalnızca sen görürsün.</p></> : <><div className="ss-profile-banner"/><div className="ss-profile-avatar"><VoiceAvatar id={person.id} name={nameOf(person)} large/><i className={status}/></div><div className="ss-profile-name"><div><h2>{nameOf(person)}</h2><p>{person.username} · {statusLabel(status)}</p></div>{own && <span>SEN</span>}</div>{fixtureDetails?.statusText&&<p className="ss-profile-status">{fixtureDetails.statusText}</p>}{own && c.spaces.length > 0 && <><h6>BİRLİKTE OLDUĞUN YER</h6>{c.spaces.map(space => <div className="ss-membership" key={space.id}><Home size={22}/><span>{space.name}</span><small>{space.ownerId === person.id ? 'Sahip' : 'Üye'}</small></div>)}</>}{view === 'expanded' && <div className="ss-about"><h6>HAKKINDA</h6><p>{fixtureDetails?.about ?? 'Profil ayrıntıları ve katılma tarihi bu bağlantıdan henüz alınamıyor.'}</p></div>}{!fixtureMode && <button className="ss-details-button" onClick={() => setView(view === 'expanded' ? 'profile' : 'expanded')}>{view === 'expanded' ? 'Daha az göster' : 'Ayrıntıları göster'}</button>}</>}{error && <p className="ss-error" role="alert">{error}</p>}</div><footer className="ss-modal-footer">{!own&&!fixtureMode&&<FriendRequestButton key={person.id} user={person}/>} {own && view !== 'status' ? <><button className="button secondary" onClick={() => setView('status')}>Durum değiştir</button><button className="button primary" onClick={() => { onClose(); navigate(preserveReferenceFixtureRoute('/settings?tab=profile')); }}>Profili düzenle</button></> : <button onClick={onClose}>Kapat</button>}</footer></Modal>;
}
