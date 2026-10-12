import {MusicDJ, MusicDJEntry} from './MusicDJ';
import { applyAppearancePreferences } from './appearance-preferences';
import { usePersonalPlayback } from './personal-playback';
import { tr } from './i18n';
import { VoiceSidebar } from './VoiceSidebar';
import { DirectMessageSurface, SocialSearchDialog, SharedFilesSurface, UserProfileDialog } from './SocialSurfaces';
import { VoiceContext } from './VoiceContext';
import { ReferenceIcon } from './ReferenceIcon';
import { RoomMembers } from './RoomMembers';
import { FriendsPage } from './FriendsPage';
import { PersonalSidebar } from './PersonalSidebar';
import CinemaPlayback from './CinemaPlayback';
import DmCallRuntime from './DmCallRuntime';
import ConnectionStatusSurface, { StartupSplash, SystemState } from './SystemState';
import { useChannelAccess } from './channel-access';
import { ChannelAccessState, CommunityEditor } from './CommunitySettings';
import { SocialNotificationsPage, SocialReferenceOverlay } from './SocialReferenceEntry';
import { ReferenceOnboarding, type ReferenceOnboardingMode } from './ReferenceOnboarding';
import { FriendsPanel } from './People';
import { InviteLanding } from './Invite';
import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, AudioLines, Bot, Gamepad2, Bell, ChevronDown, ChevronRight, CircleHelp, Film, Hash, Headphones, Home as HomeIcon, LayoutGrid, MessageCircle, Menu, Mic, MicOff, Moon, MoreHorizontal, PanelRightClose, PanelRightOpen, PhoneOff, Plus, Search, Settings as SettingsIcon, Sparkles, Users, X } from 'lucide-react';
import { Avatar, IconButton, Modal } from '@rooms/design';
import { useRooms } from './store';
import { useCommunity, initializeCommunity } from './community';
import { useRealtime, joinVoice, toggleMic } from './realtime';
import { PushToTalk } from './PushToTalk';
import { CommunityChat, CommunitySpaces, CommunityVoice, CommunityInvite, RealVoiceDock } from './RealSocial';
import { Home } from './Home';
import { ConnectionPane } from './ConnectionPane';
import { ActivityLauncher } from './Activities';
import { ScreenHandoffRuntime } from './screen-handoff';
const PersonalPlaybackRuntime = lazy(() => import('./PersonalMedia').then(module => ({default:module.PersonalPlaybackRuntime})));
const PersonalMedia = lazy(() => import('./PersonalMedia').then(module => ({default:module.PersonalMedia})));
const RecoveryFixtureEntry = import.meta.env.DEV ? lazy(() => import('./dev/S04RecoveryEntry')) : null;
const PersonalMediaFixtureEntry = import.meta.env.DEV ? lazy(() => import('./dev/PersonalMediaEntry')) : null;
const Cinema = lazy(() => import('./Cinema'));
const Settings = lazy(() => import('./Settings'));
const AgentWorkspace = lazy(() => import('./Agent'));
const Together = lazy(() => import('./Together'));
const Games = lazy(() => import('./Games'));
const YouTube = lazy(() => import('./YouTube'));
export type Overlay = 'launcher' | 'command' | 'create-space' | 'edit-space' | 'create-room' | 'help' | 'invite' | 'social-search' | 'profile' | null;
export default function App() {
    const navigate = useNavigate();
    const location = useLocation();
    const { preferences: p, setPreference } = useRooms();
    const community = useCommunity();
    const realtime = useRealtime();
    useEffect(()=>{
        if(import.meta.env.DEV&&new URLSearchParams(window.location.search).has('fixture'))return;
        const bridge=window.rooms?.notifications;if(!bridge?.setVoiceActive)return;
        const active=realtime.status==='connected'||realtime.status==='reconnecting';
        const send=()=>void bridge.setVoiceActive(active).catch(()=>{});send();
        const timer=active?setInterval(send,10000):undefined;
        return()=>{if(timer)clearInterval(timer);void bridge.setVoiceActive(false).catch(()=>{});};
    },[realtime.status]);
    const spaces = community.spaces.map(s => ({ id: s.id, name: s.name, initials: s.name.slice(0, 1), tone: 'blue', description: "ROOMS" }));
    const activeSpace = community.activeSpaceId;
    const [communityIcons,setCommunityIcons]=useState<Record<string,string>>({});
    useEffect(()=>{let active=true;if(import.meta.env.DEV&&new URLSearchParams(window.location.search).has('fixture'))void import('./dev/reference-fixtures').then(f=>{if(active)setCommunityIcons(f.getReferenceCommunityIcons());});return()=>{active=false;};},[]);
    const channelAccess=useChannelAccess(state=>community.activeChannelId?state.checks[community.activeChannelId]:undefined);
    const channel = (community.channels.find(c => c.id === community.activeChannelId)?.name ?? community.dms.find(c => c.id === community.activeChannelId)?.name ?? tr("Messages"));
    const displayName = community.user?.displayName ?? tr("You");
    const setSpace = (id: string) => { void community.openSpace(id); };
    const setChannel = (name: string) => {
        const ch = community.channels.find(c => c.name === name);
        if (ch)
            void community.openChannel(ch.id);
    };
    const [startupReady,setStartupReady]=useState(()=>!window.rooms || !!(import.meta.env.DEV&&new URLSearchParams(window.location.search).has('fixture')));
    useEffect(() => {
        if (import.meta.env.DEV && new URLSearchParams(window.location.search).has('fixture')) return;
        let current = true;
        void initializeCommunity().then(() => {
            if (current && !useCommunity.getState().user && ['/home', '/'].includes(location.pathname)) navigate('/setup/welcome', {replace:true});
        }).finally(()=>{if(current)setStartupReady(true);});
        return () => { current=false; };
    }, [navigate]);
    const sourceRequest = useRef<string|null>(null);
    useEffect(() => {
        const params = new URLSearchParams(location.search);
        if (location.pathname !== '/voice' || params.get('choose') !== '1' || sourceRequest.current === location.key) return;
        sourceRequest.current=location.key;
        window.dispatchEvent(new Event('rooms:choose-capture'));
        params.delete('choose');navigate({pathname:'/voice',search:params.toString()}, {replace:true});
    }, [location.pathname,location.search,location.key,navigate]);
    const [channelNavOpen, setChannelNavOpen] = useState(false);
    const [narrowContext, setNarrowContext] = useState(() => matchMedia('(max-width:1279px)').matches);
    const [contextDrawerOpen, setContextDrawerOpen] = useState(false);
    const localFixture = import.meta.env.DEV ? document.documentElement.dataset.referenceFixture ?? '' : '';
    const fixtureHidesRoomMembers = localFixture.startsWith('S14/') || (localFixture === 'S19/empty' && !realtime.channelId);
    const contextVisible = fixtureHidesRoomMembers ? contextDrawerOpen : narrowContext ? contextDrawerOpen : p.showFriends;
    const toggleContext = useCallback(() => {
        if (narrowContext || fixtureHidesRoomMembers) setContextDrawerOpen(value => !value);
        else setPreference('showFriends', !p.showFriends);
    }, [fixtureHidesRoomMembers, narrowContext, p.showFriends, setPreference]);
    const closeContext = useCallback(() => {
        setContextDrawerOpen(false);
        if (!narrowContext) setPreference('showFriends', false);
    }, [narrowContext, setPreference]);
    useEffect(() => {
        const query = matchMedia('(max-width:1279px)');
        const resize = () => { setNarrowContext(query.matches); setContextDrawerOpen(false); };
        query.addEventListener('change', resize);
        return () => query.removeEventListener('change', resize);
    }, []);
    useEffect(() => { setChannelNavOpen(false); setContextDrawerOpen(false); }, [location.pathname, community.activeChannelId]);
    const [overlay, setOverlay] = useState<Overlay>(null);
    useEffect(() => {
        if (!import.meta.env.DEV) return;
        const fixture = new URLSearchParams(window.location.search).get('fixture')?.toUpperCase();
        if (fixture === 'S13') setOverlay('social-search');
        if (fixture === 'S15') setOverlay('profile');
    }, []);
    const [nativeInvite, setNativeInvite] = useState<{
        serverUrl: string;
        code: string;
    } | null>(null);
    const closeInvite = useCallback(() => setNativeInvite(null), []);
    useEffect(() => {
        if (!window.rooms)
            return;
        void window.rooms.pendingInvite().then(value => {
            if (value)
                setNativeInvite(value);
        }).catch(() => { });
        return window.rooms.onInvite(value => setNativeInvite(value));
    }, []);
    const [toast, setToast] = useState('');
    const [search, setSearch] = useState('');
    const notify = useCallback((message: string) => setToast(message), []);
    const close = useCallback(() => { setOverlay(null); setSearch(''); }, []);

    useEffect(()=>{const clear=()=>{setOverlay(current=>current==='social-search'||current==='profile'?null:current);setSearch('');};window.addEventListener('rooms:channel-access-invalidated',clear);return()=>window.removeEventListener('rooms:channel-access-invalidated',clear);},[]);
    const settingsPage = location.pathname === '/settings';
    const returnFromSettings = useRef('/home');
    useEffect(() => { if (!settingsPage) returnFromSettings.current = location.pathname + location.search; }, [settingsPage, location.pathname, location.search]);
    const closeSettings = useCallback(() => {const allowed=window.dispatchEvent(new Event('rooms:settings-close-request',{cancelable:true}));if(allowed)navigate(returnFromSettings.current,{replace:true});return allowed;},[navigate]);
    const visiblePath = settingsPage ? returnFromSettings.current.split('?')[0]! : location.pathname;
    const cinema = visiblePath === '/cinema';
    const voiceView = visiblePath === '/voice';
    const videoView = voiceView && (new URLSearchParams(location.search).get('view') === 'video' || new URLSearchParams(location.search).get('view') !== 'share' && realtime.tracks.some(track => track.source === 'camera' && track.kind === 'video' && !track.muted));
    const statusView = visiblePath === '/status';
    const fileView = visiblePath === '/files';
    const mediaView = visiblePath === '/media';
    const personalSession = usePersonalPlayback(state=>state.session);
    const mediaHeader = new URLSearchParams(location.search).get('player')==='1' && personalSession ? personalSession.media.live ? personalSession.media.name : 'Kişisel oynatıcı' : new URLSearchParams(location.search).get('view')==='channels'||localFixture.startsWith('S35/')?'Canlı kanallar':new URLSearchParams(location.search).get('view')==='library'||localFixture.startsWith('S38/')?'Kütüphane':'Kişisel medyam';
    const notificationView = visiblePath === '/notifications';
    const dmView = ['/chat','/dm'].includes(visiblePath) && community.dms.some(dm=>dm.id===community.activeChannelId);
    const communityView = !dmView && !!community.user && (voiceView || ['/chat','/status','/files','/games','/together','/agent','/youtube','/media'].includes(visiblePath));
    const personalSidebarView = !!community.user && (['/home','/friends','/notifications'].includes(visiblePath) || dmView);
    useLayoutEffect(() => {
        const main = document.querySelector('.main-view');
        if (main) main.scrollTop = 0;
    }, [visiblePath]);
    const settings = ['/agent', '/together', '/games', '/youtube', '/media'].includes(visiblePath);
    const selected = spaces.find(s => s.id === activeSpace) ?? { name: tr("Your community") };
    const open = (value: Overlay) => { setSearch(''); setOverlay(value === 'create-room' ? 'invite' : value); };
    useEffect(() => {
        if (!toast)
            return;
        const id = setTimeout(() => setToast(''), 4500);
        return () => clearTimeout(id);
    }, [toast]);
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement;
            const editing = target.closest('input,textarea,[contenteditable="true"]');
            if(settingsPage&&(e.metaKey||e.ctrlKey)&&(e.key.toLowerCase()==='k'||/^[1-5]$/.test(e.key))){e.preventDefault();return;}
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
                e.preventDefault();
                setOverlay(current => current === 'command' ? null : 'command');
            }
            if ((e.metaKey || e.ctrlKey) && e.key === ',') {
                e.preventDefault();
                close();
                navigate('/settings');
            }
            if (!editing && (e.metaKey || e.ctrlKey) && /^[1-5]$/.test(e.key)) {
                e.preventDefault();
                close();
                navigate(['/home', '/spaces', '/chat', '/voice', '/cinema'][Number(e.key) - 1]!);
            }
            if (e.key === 'Escape' && contextDrawerOpen) { e.preventDefault(); setContextDrawerOpen(false); return; }
            if (e.key === 'Escape' && channelNavOpen) { e.preventDefault(); setChannelNavOpen(false); return; }
            if (e.key === 'Escape' && !overlay && !nativeInvite) {
                if (settingsPage) { e.preventDefault(); closeSettings(); return; }
                if (document.fullscreenElement)
                    void document.exitFullscreen();
            }
            if (!editing && (e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'm') {
                e.preventDefault();
                if (realtime.channelId)
                    void toggleMic().catch(e => notify(e.message));
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [navigate, close, overlay, nativeInvite, settingsPage, closeSettings, realtime.channelId, notify, channelNavOpen, contextDrawerOpen]);
    useEffect(() => applyAppearancePreferences(p), [p]);
    const titles: Record<string, string> = { '/home': "Ana sayfa", '/friends': 'Arkadaşlar', '/media': 'Medyam', '/spaces': tr("Your spaces"), '/chat': channel.startsWith('dm-') ? channel.slice(3) : `# ${channel}`, '/voice': tr("The lounge"), '/cinema': tr("Cinema"), '/settings': tr("Settings"), '/notifications': 'Bildirimler', '/polls': tr("Quick polls"), '/agent': 'Agent', '/together': 'Birlikte', '/games': tr("Oyun masas\u0131"), '/youtube': 'Birlikte YouTube' };
    const setupName = visiblePath.startsWith('/setup/') ? visiblePath.slice(7) : null;
    const setupModes: ReferenceOnboardingMode[] = ['welcome', 'signin', 'register', 'recovery', 'invite', 'profile', 'devices'];
    const setupMode = setupModes.find(mode => mode === setupName);
    if(!startupReady)return <div className="app onboarding-mode"><div className="window-chrome"><span className="window-wordmark"><img src="./reference-brand/brand/logo-symbol-white.svg" alt=""/>ROOMS</span></div><StartupSplash/></div>;
    if (setupMode) return <div className="app onboarding-mode">
      <div className="window-chrome"><span className="window-wordmark"><img src="./reference-brand/brand/logo-symbol-white.svg" alt=""/>ROOMS</span></div>
      {RecoveryFixtureEntry && localFixture.startsWith('S04/') ? <Suspense fallback={null}><RecoveryFixtureEntry variant={localFixture.split('/')[1] || 'default'}/></Suspense> : <ReferenceOnboarding key={`${setupMode}-${settingsPage}`} mode={setupMode} onNavigate={mode => navigate(`/setup/${mode}${location.search}`)} onComplete={() => navigate('/home')} onOpenSettings={tab => navigate(`/settings?tab=${tab}`)}/>}
      {settingsPage && <Modal title="Ayarlar" hideHeading onClose={closeSettings} className="settings-modal"><Suspense fallback={<div className="loading-view">Yükleniyor…</div>}><Settings notify={notify} onClose={closeSettings} onInvite={()=>{if(closeSettings())open('invite');}}/></Suspense></Modal>}
      {nativeInvite && <InviteLanding invite={nativeInvite} onClose={closeInvite} notify={notify}/>}
      {toast && <div role="status" className="toast">{toast}</div>}
    </div>;
    return <div className={`app ${cinema ? 'cinema-mode' : ''} ${voiceView ? 'voice-mode' : ''} ${mediaView ? 'personal-media-mode' : ''} ${communityView ? 'community-mode' : ''} ${visiblePath === '/chat' || visiblePath === '/dm' ? 'chat-mode' : ''} ${realtime.channelId ? 'voice-active' : ''} ${channelNavOpen ? 'channel-nav-open' : ''} ${contextDrawerOpen ? 'context-drawer-open' : ''}`}>
    {<PushToTalk notify={notify}/>}<div className="window-chrome"><div className="traffic-space">{!window.rooms && !document.documentElement.dataset.referenceFixture && <span className="browser-preview">{tr("DESKTOP PREVIEW")}</span>}</div><span className="window-wordmark"><img src="./reference-brand/brand/logo-symbol-white.svg" alt=""/>ROOMS</span>{import.meta.env.DEV&&localFixture?<span className="window-private"><span className="demo-indicator" title={`Development-only visual fixture: ${localFixture}`}>DEMO · Yerel örnek</span></span>:community.user&&<span className="window-private"><ReferenceIcon name="lock" size={10}/>Özel topluluk</span>}</div>
    <div className={`app-layout ${settingsPage?'settings-background':''}`}><button className="compact-nav-toggle" aria-label={channelNavOpen ? 'Kanal listesini kapat' : 'Kanal listesini aç'} aria-expanded={channelNavOpen} onClick={() => setChannelNavOpen(value => !value)}><Menu size={20}/></button>{channelNavOpen && <button className="compact-nav-scrim" aria-label="Kanal listesini kapat" onClick={() => setChannelNavOpen(false)}/> }
      <aside className="space-rail" aria-label={tr("Spaces rail")}><button className="brand-symbol" title={tr("ROOMS home")} aria-label={tr("ROOMS home")} onClick={() => navigate('/home')}><img src="./reference-brand/brand/logo-symbol-lilac.svg" alt=""/></button><div className="rail-line"/><button className={`space-orb home-orb ${(visiblePath === '/home' || visiblePath === '/friends' || communityView || dmView) ? 'selected' : ''}`} aria-label="Ana sayfa" onClick={() => navigate('/home')}><HomeIcon size={24}/></button>{spaces.map(s => <button key={s.id} className={`space-orb community-orb ${s.tone} ${activeSpace === s.id ? 'active-community' : ''}`} title={s.name} aria-label={`${s.name} mekânını aç`} onClick={() => { setSpace(s.id); navigate('/chat'); }}>{communityIcons[s.id]?<img src={communityIcons[s.id]} alt=""/>:s.initials}</button>)}<IconButton label="Topluluk oluştur" onClick={() => open('create-space')}><Plus size={20}/></IconButton><div className="rail-bottom"><IconButton label={tr("Help and keyboard shortcuts")} onClick={() => open('help')}><CircleHelp size={19}/></IconButton></div></aside>
      {!cinema && (personalSidebarView ? <PersonalSidebar path={visiblePath} notify={notify} invite={() => open('invite')}/> : communityView ? <VoiceSidebar notify={notify} invite={() => open('invite')} search={() => open('command')} editSpace={()=>open('edit-space')}/> : <aside className="sidebar"><div className="sidebar-brand"><h1>{tr("rooms")}<span>.</span></h1></div><button className="sidebar-search" onClick={() => open('command')}><Search size={15}/><span>{"Ara"}</span><kbd>{tr("\u2318 K")}</kbd></button><nav aria-label={tr("Main navigation")}>{[{ to: '/home', label: "Ana sayfa", icon: HomeIcon }, { to: '/spaces', label: tr("Spaces"), icon: LayoutGrid }, { to: '/chat', label: tr("Messages"), icon: MessageCircle }, { to: '/voice', label: tr("Voice lounge"), icon: AudioLines }, { to: '/cinema', label: tr("Cinema"), icon: Film }, { to: '/games', label: tr("Oyun masas\u0131"), icon: Gamepad2 }, { to: '/agent', label: 'Agent', icon: Bot }].map(n => <NavLink key={n.to} to={n.to} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}><n.icon size={18}/><span>{n.label}</span>{n.to === '/home' && <span className="nav-dot"/>}</NavLink>)}</nav><div className="sidebar-section"><div className="section-label"><span>{tr("YOUR COMMUNITY")}</span><IconButton label={tr("Invite a friend")} onClick={() => open('create-space')}><Plus size={14}/></IconButton></div>{spaces.map(s => <button key={s.id} className={`space-list-item ${s.id === activeSpace ? 'active-space' : ''}`} onClick={() => { setSpace(s.id); navigate('/chat'); }}><span className={`mini-space ${s.tone}`}>{s.initials}</span><span>{s.name}</span><ChevronRight size={12}/></button>)}</div>{visiblePath === '/chat' && <div className="channels"><span className="section-label">{tr("TEXT CHANNELS")}</span>{(community.channels.filter(c => c.type === 0).map(c => c.name)).map(c => <button key={c} className={channel === c ? 'selected' : ''} onClick={() => setChannel(c)}><Hash size={14}/>{c}{!!community.unread[community.channels.find(ch => ch.name === c)?.id ?? ''] && <span className="nav-dot"/>}</button>)}<span className="section-label">{tr("VOICE")}</span>{community.channels.filter(c => c.type === 2).map(c => <button key={c.id} onClick={() => { navigate('/voice'); void joinVoice(c.id, c.name).catch(e => notify(e.message)); }}><AudioLines size={14}/>{c.name}</button>)}{community.dms.length > 0 && <><span className="section-label">{tr("DIRECT MESSAGES")}</span>{community.dms.map(dm => <button key={dm.id} className={community.activeChannelId === dm.id ? 'selected' : ''} onClick={() => void community.openChannel(dm.id)}><MessageCircle size={14}/>{dm.recipients?.map(p => p.displayName || p.username).join(', ') || dm.name}{community.unread[dm.id] && <span className="nav-dot" aria-label={tr('Okunmamış mesaj')}/>}</button>)}</>}</div>}<div className="sidebar-spacer"/><button className="activity-nav" onClick={() => open('launcher')}><span><Plus size={17}/></span><div>{"Etkinlikler"}<small>{tr("Start an activity")}</small></div><ChevronRight size={14}/></button><NavLink to="/settings" className={({ isActive }) => `nav-item settings-link ${isActive ? 'active' : ''}`}><SettingsIcon size={17}/><span>{tr("Settings")}</span><kbd>⌘ ,</kbd></NavLink><button className="self-profile" onClick={() => navigate('/settings?tab=profile')}><Avatar name={displayName}/><span><strong>{displayName}</strong><small><i />{!community.user ? tr('Giriş yap') : community.status === 'connected' ? tr('Connected') : community.status}</small></span><MoreHorizontal size={17}/></button></aside>)}
      <div className="workspace"><header className="toolbar"><div className="breadcrumb">{statusView ? <><ReferenceIcon name="hash" size={23}/><span>Bağlantı durumu</span><span className="breadcrumb-divider"/><span className="breadcrumb-space">{selected.name}</span></> : voiceView ? <><ReferenceIcon name="volume" size={23}/><span>{videoView&&localFixture&&!new URLSearchParams(window.location.search).has('roomLayout')?'Görüntülü Salon':realtime.roomName || (localFixture==='S19/empty'?'Salon':"Ses odaları")}</span><span className="breadcrumb-divider"/><span className="breadcrumb-space">{realtime.roomName ? `${realtime.roomName} · ` : localFixture==='S19/empty'?'Salon · ':""}{selected.name}</span></> : mediaView ? <><ReferenceIcon name="film" size={23}/><span>{mediaHeader}</span><span className="breadcrumb-divider"/><span className="breadcrumb-space">Kişisel alan</span></> : fileView ? <><ReferenceIcon name="hash" size={23}/><span>{channel}</span><span className="breadcrumb-divider"/><span className="breadcrumb-space">Odanın dosyaları</span></> : notificationView ? <><ReferenceIcon name="hash" size={23}/><span>Bildirimler</span><span className="breadcrumb-divider"/><span className="breadcrumb-space">Seni ilgilendirenler</span></> : <><IconButton label={tr("Go back")} onClick={() => {
            if (cinema)
                navigate('/home');
            else
                navigate(-1);
        }}><ArrowLeft size={17}/></IconButton><span>{titles[visiblePath] ?? "Ana sayfa"}</span><span className="breadcrumb-divider">/</span><span className="breadcrumb-space">{selected.name}</span></>}</div><div className="toolbar-actions"><span className="community-indicator real-tag">{community.user ? tr('PRIVATE COMMUNITY') : tr('Giriş yapılmadı')}</span><IconButton label={tr("Search commands")} onClick={() => open('command')}><Search size={17}/></IconButton><IconButton label="Bildirimler" onClick={() => navigate('/notifications')}><Bell size={17}/></IconButton>{!settings && !statusView && <><span className="toolbar-separator"/><button className="button subtle small" onClick={() => open('launcher')}><Plus size={15}/>{tr("Start an activity")}</button><IconButton label={p.showFriends ? tr("Hide friends panel") : tr("Show friends panel")} onClick={toggleContext}>{contextVisible ? <PanelRightClose size={18}/> : <PanelRightOpen size={18}/>}</IconButton></>}</div></header>
      {community.user && (community.status !== 'connected' || community.error) && <div className={`connection-banner ${community.error ? 'error' : ''}`} role="status"><button className="connection-status-link" onClick={()=>navigate('/status')}>{community.error ?? (community.status === 'reconnecting' ? tr("Reconnecting to your community. Your last conversation is still here.") : community.status === 'connecting' ? tr("Connecting to your private community\u2026") : tr("Your community connection is interrupted."))}</button><button className="text-button" onClick={() => navigate('/settings?tab=connections')}>{tr("Connection settings")}<ArrowRight size={12}/></button>{community.error && <IconButton label={tr("Dismiss community error")} onClick={community.clearError}><X size={13}/></IconButton>}</div>}<div className="workspace-body"><main className={`main-view ${cinema ? 'theater-view' : ''}`}><Suspense fallback={<div className="loading-view"><span className="loading-ring"/>{tr("Opening your room\u2026")}</div>}><Routes location={settingsPage ? returnFromSettings.current : location}><Route path="/status" element={<ConnectionStatusSurface/>}/><Route path="/home" element={<Home open={open} notify={notify}/>}/><Route path="/friends" element={community.user ? <FriendsPage notify={notify}/> : <ConnectionRequired/>}/><Route path="/spaces" element={community.user ? <CommunitySpaces notify={notify}/> : <ConnectionRequired />}/><Route path="/notifications" element={community.user ? <SocialNotificationsPage/> : <ConnectionRequired/>}/><Route path="/chat" element={community.user ? channelAccess ? channelAccess==='checking'||channelAccess==='unavailable'? <SystemState kind={channelAccess==='checking'?'loading':'unavailable'} onRetry={()=>{if(community.activeChannelId)void community.openChannel(community.activeChannelId);}} onReturn={()=>navigate('/home')}/> : <ChannelAccessState kind="denied" voiceConnected={realtime.status==='connected'} voiceRoomName={realtime.roomName??undefined} onReturn={()=>navigate('/home')}/> : dmView ? <DirectMessageSurface notify={notify}/> : <CommunityChat notify={notify} membersVisible={contextVisible} onToggleMembers={toggleContext} onSearch={() => open('social-search')}/> : <ConnectionRequired />}/><Route path="/voice" element={community.user ? <CommunityVoice openLauncher={() => open('launcher')} notify={notify}/> : <ConnectionRequired />}/><Route path="/dm-call" element={<></>}/><Route path="/dm" element={community.user ? <DirectMessageSurface notify={notify}/> : <ConnectionRequired/>}/><Route path="/files" element={community.user ? <SharedFilesSurface notify={notify} onOpenMessage={(channelId,messageId)=>{void community.openChannel(channelId).then(()=>navigate(`/chat?message=${encodeURIComponent(messageId)}`)).catch(e=>notify(e.message));}}/> : <ConnectionRequired/>}/><Route path="/media" element={PersonalMediaFixtureEntry&&/^S3[3-9]\//.test(localFixture)?<PersonalMediaFixtureEntry notify={notify}/>:<PersonalMedia notify={notify}/>}/><Route path="/cinema" element={<Cinema notify={notify}/>}/><Route path="/polls" element={<Navigate to="/together?tab=polls" replace/>}/><Route path="/agent" element={<AgentWorkspace notify={notify}/>}/><Route path="/together" element={<Together />}/><Route path="/games" element={<Games />}/><Route path="/youtube" element={localFixture?<YouTube />:<MusicDJEntry/>}/><Route path="*" element={<Navigate to="/home" replace/>}/></Routes></Suspense><CinemaPlayback notify={notify}/><Suspense fallback={null}><PersonalPlaybackRuntime notify={notify}/></Suspense><DmCallRuntime/></main>{contextDrawerOpen && <button className="context-panel-scrim" aria-label="Üye panelini kapat" onClick={closeContext}/>}
      {community.user && !statusView && contextVisible && !dmView && !settings && !cinema && !['/friends','/notifications'].includes(visiblePath) && (voiceView ? <VoiceContext onClose={closeContext} openLauncher={() => open('launcher')} invite={() => open('invite')}/> : ['/home','/chat','/files'].includes(visiblePath) && !community.dms.some(dm => dm.id === community.activeChannelId) ? <RoomMembers notify={notify} onClose={closeContext}/> : <FriendsPanel notify={notify} onClose={closeContext}/>)}
      </div>{realtime.channelId && <RealVoiceDock openLauncher={() => open('launcher')} notify={notify}/>} </div>
    </div>
    <MusicDJ/>
    <ScreenHandoffRuntime />
    {settingsPage && <section className="settings-modal settings-reference-surface" aria-label="Ayarlar"><Suspense fallback={<div className="loading-view">Yükleniyor…</div>}><Settings notify={notify} onClose={closeSettings} onInvite={()=>{if(closeSettings())open('invite');}}/></Suspense></section>}
    {nativeInvite && <InviteLanding invite={nativeInvite} onClose={closeInvite} notify={notify}/>}
    {(overlay==='create-space'||overlay==='edit-space')&&<CommunityEditor mode={overlay==='edit-space'?'edit':'create'} space={community.spaces.find(s=>s.id===activeSpace)} canEdit={community.spaces.find(s=>s.id===activeSpace)?.ownerId===community.user?.id} onClose={close} onSave={window.rooms&&community.user?async name=>{const result=overlay==='edit-space'?await window.rooms!.social.renameSpace(activeSpace!,name):await window.rooms!.social.createSpace(name);await community.refresh();return result;}:undefined} onSaved={space=>{void community.openSpace(space.id);}}/>}
    <SocialReferenceOverlay onClose={()=>{close();navigate('/chat');}}/>
    {overlay === 'social-search' && <SocialSearchDialog onClose={close}/>}
    {overlay === 'profile' && <UserProfileDialog onClose={close}/>}
    {overlay === 'launcher' && <ActivityLauncher onClose={close}/>}
    {overlay === 'command' && <Modal title={"Ara"} onClose={close} className="command-modal"><div className="command-input"><Search size={19}/><input autoFocus aria-label={tr("Search commands")} placeholder={"Oda veya komut ara\u2026"} value={search} onChange={e => setSearch(e.target.value)}/><kbd>{tr("ESC")}</kbd></div><div className="command-list">{[{ label: "Ana sayfa", detail: "", path: '/home', icon: HomeIcon }, { label: tr("Cinema"), detail: tr("Open the local theater"), path: '/cinema', icon: Film }, { label: tr("Voice lounge"), detail: tr("Join a private voice room"), path: '/voice', icon: AudioLines }, { label: tr("Messages"), detail: tr("Your private community conversations"), path: '/chat', icon: MessageCircle }, { label: tr("Quick polls"), detail: tr("Ortak odada birlikte karar ver"), path: '/polls', icon: LayoutGrid }, { label: 'Agent', detail: tr("G\u00F6revler, sonu\u00E7lar ve oda haf\u0131zas\u0131"), path: '/agent', icon: Bot }, { label: tr("Oyun masas\u0131"), detail: "Sanal puan", path: '/games', icon: Gamepad2 }, { label: 'Ortak tahta ve anketler', detail: tr("Birlikte \u00E7iz, birlikte karar ver"), path: '/together', icon: Sparkles }, { label: tr("Settings"), detail: "", path: '/settings', icon: SettingsIcon }].filter(item => (item.label + item.detail).toLowerCase().includes(search.toLowerCase())).map(item => <button key={item.path} onClick={() => { navigate(item.path); close(); }}><item.icon size={20}/><span>{item.label}</span><ArrowRight size={16}/></button>)}</div><p className="modal-footnote">{tr("Tab to choose \u00B7 Enter to open \u00B7 Escape to return")}</p></Modal>}

    {overlay === 'help' && <Modal title={"Klavye k\u0131sayollar\u0131"} onClose={close}>{[[tr("Command palette"), '⌘ / Ctrl K'], [tr("Tonight \u2192 Cinema"), '⌘ / Ctrl 1–5'], [tr("Settings"), '⌘ / Ctrl ,'], [tr("Mute your room mic"), '⌘ / Ctrl Shift M'], [tr("Push to talk (when enabled)"), 'Ctrl Shift Space'], [tr("Play / pause (Cinema)"), 'Space'], [tr("Seek backward / forward"), '← / →'], [tr("Close an overlay"), 'Esc'], [tr("Send a message"), 'Enter'], [tr("New line in a message"), 'Shift Enter']].map(([label, key]) => <div className="shortcut-row" key={label}><span>{label}</span><kbd>{key}</kbd></div>)}<p className="modal-footnote">{tr("Playback keys never interrupt typing in a message.")}</p></Modal>}
    {overlay === 'invite' && <CommunityInvite onClose={close} notify={notify}/>}


    {toast && <div role="status" className="toast glass"><span>{toast}</span><IconButton label={tr("Dismiss notification")} onClick={() => setToast('')}><X size={14}/></IconButton></div>}
  </div>;
}
function ConnectionRequired() {
    return <div className="home-page page-enter"><ConnectionPane /></div>;
}
