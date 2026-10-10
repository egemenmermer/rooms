import { tr } from './i18n';
import { FriendsPanel } from './People';
import { InviteLanding } from './Invite';
import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, AudioLines, Bot, Gamepad2, Bell, ChevronDown, ChevronRight, CircleHelp, Film, Hash, Headphones, Home as HomeIcon, LayoutGrid, MessageCircle, Mic, MicOff, Moon, MoreHorizontal, PanelRightClose, PanelRightOpen, PhoneOff, Plus, Search, Settings as SettingsIcon, Sparkles, Users, X } from 'lucide-react';
import { Avatar, IconButton, Modal } from '@rooms/design';
import { useRooms } from './store';
import { useCommunity, initializeCommunity } from './community';
import { useRealtime, joinVoice, toggleMic } from './realtime';
import { PushToTalk } from './PushToTalk';
import { CommunityChat, CommunitySpaces, CommunityVoice, CommunityInvite, RealVoiceDock } from './RealSocial';
import { Home } from './Home';
import { ConnectionPane } from './ConnectionPane';
import { ActivityLauncher } from './Activities';
const Cinema = lazy(() => import('./Cinema'));
const Settings = lazy(() => import('./Settings'));
const AgentWorkspace = lazy(() => import('./Agent'));
const Together = lazy(() => import('./Together'));
const Games = lazy(() => import('./Games'));
const YouTube = lazy(() => import('./YouTube'));
export type Overlay = 'launcher' | 'command' | 'create-space' | 'create-room' | 'help' | 'invite' | null;
export default function App() {
    const navigate = useNavigate();
    const location = useLocation();
    const { preferences: p, setPreference } = useRooms();
    const community = useCommunity();
    const realtime = useRealtime();
    const spaces = community.spaces.map(s => ({ id: s.id, name: s.name, initials: s.name.slice(0, 1), tone: 'blue', description: "ROOMS" }));
    const activeSpace = community.activeSpaceId;
    const channel = (community.channels.find(c => c.id === community.activeChannelId)?.name ?? community.dms.find(c => c.id === community.activeChannelId)?.name ?? tr("Messages"));
    const displayName = community.user?.displayName ?? tr("You");
    const setSpace = (id: string) => { void community.openSpace(id); };
    const setChannel = (name: string) => {
        const ch = community.channels.find(c => c.name === name);
        if (ch)
            void community.openChannel(ch.id);
    };
    useEffect(() => { void initializeCommunity(); }, []);
    const [overlay, setOverlay] = useState<Overlay>(null);
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

    const settingsPage = location.pathname === '/settings';
    const returnFromSettings = useRef('/home');
    useEffect(() => { if (!settingsPage) returnFromSettings.current = location.pathname + location.search; }, [settingsPage, location.pathname, location.search]);
    const closeSettings = useCallback(() => navigate(returnFromSettings.current, { replace: true }), [navigate]);
    const visiblePath = settingsPage ? returnFromSettings.current.split('?')[0]! : location.pathname;
    const cinema = visiblePath === '/cinema';
    useLayoutEffect(() => {
        const main = document.querySelector('.main-view');
        if (main) main.scrollTop = 0;
    }, [visiblePath]);
    const settings = ['/agent', '/together', '/games', '/youtube'].includes(visiblePath);
    const selected = spaces.find(s => s.id === activeSpace) ?? { name: tr("Your community") };
    const open = (value: Overlay) => { setSearch(''); setOverlay((value === 'create-space' || value === 'create-room') ? 'invite' : value); };
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
    }, [navigate, close, overlay, nativeInvite, settingsPage, closeSettings, realtime.channelId, notify]);
    useEffect(() => { document.documentElement.dataset.motion = p.reduceMotion ? 'reduce' : 'full'; document.documentElement.dataset.transparency = p.reduceTransparency ? 'reduce' : 'full'; document.documentElement.dataset.accent = p.accent; document.documentElement.dataset.compact = String(p.compact); }, [p]);
    const titles: Record<string, string> = { '/home': "Ana sayfa", '/spaces': tr("Your spaces"), '/chat': channel.startsWith('dm-') ? channel.slice(3) : `# ${channel}`, '/voice': tr("The lounge"), '/cinema': tr("Cinema"), '/settings': tr("Settings"), '/polls': tr("Quick polls"), '/agent': 'Agent', '/together': 'Birlikte', '/games': tr("Oyun masas\u0131"), '/youtube': 'Birlikte YouTube' };
    return <div className={`app ${cinema ? 'cinema-mode' : ''} ${visiblePath === '/chat' ? 'chat-mode' : ''} ${realtime.channelId ? 'voice-active' : ''}`}>
    {<PushToTalk notify={notify}/>}<div className="window-chrome"><div className="traffic-space">{!window.rooms && <span className="browser-preview">{tr("DESKTOP PREVIEW")}</span>}</div><span className="window-wordmark">{tr("ROOMS")}</span></div>
    <div className="app-layout" inert={settingsPage || undefined}>
      <aside className="space-rail" aria-label={tr("Spaces rail")}><button className="brand-symbol" title={tr("ROOMS home")} aria-label={tr("ROOMS home")} onClick={() => navigate('/home')}><svg viewBox="0 0 32 32" fill="none"><path d="M6 27V12a7 7 0 0 1 14 0v15M12 27V16a7 7 0 0 1 14 0v11" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"/></svg></button><div className="rail-line"/>{spaces.map(s => <button key={s.id} className={`space-orb ${s.tone} ${activeSpace === s.id ? 'selected' : ''}`} title={s.name} aria-label={`${s.name} mekânını aç`} onClick={() => { setSpace(s.id); navigate('/chat'); }}>{s.initials}</button>)}<IconButton label={tr("Invite a friend")} onClick={() => open('create-space')}><Plus size={20}/></IconButton><div className="rail-bottom"><IconButton label={tr("Help and keyboard shortcuts")} onClick={() => open('help')}><CircleHelp size={19}/></IconButton></div></aside>
      {!cinema && <aside className="sidebar"><div className="sidebar-brand"><h1>{tr("rooms")}<span>.</span></h1></div><button className="sidebar-search" onClick={() => open('command')}><Search size={15}/><span>{"Ara"}</span><kbd>{tr("\u2318 K")}</kbd></button><nav aria-label={tr("Main navigation")}>{[{ to: '/home', label: "Ana sayfa", icon: HomeIcon }, { to: '/spaces', label: tr("Spaces"), icon: LayoutGrid }, { to: '/chat', label: tr("Messages"), icon: MessageCircle }, { to: '/voice', label: tr("Voice lounge"), icon: AudioLines }, { to: '/cinema', label: tr("Cinema"), icon: Film }, { to: '/games', label: tr("Oyun masas\u0131"), icon: Gamepad2 }, { to: '/agent', label: 'Agent', icon: Bot }].map(n => <NavLink key={n.to} to={n.to} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}><n.icon size={18}/><span>{n.label}</span>{n.to === '/home' && <span className="nav-dot"/>}</NavLink>)}</nav><div className="sidebar-section"><div className="section-label"><span>{tr("YOUR COMMUNITY")}</span><IconButton label={tr("Invite a friend")} onClick={() => open('create-space')}><Plus size={14}/></IconButton></div>{spaces.map(s => <button key={s.id} className={`space-list-item ${s.id === activeSpace ? 'active-space' : ''}`} onClick={() => { setSpace(s.id); navigate('/chat'); }}><span className={`mini-space ${s.tone}`}>{s.initials}</span><span>{s.name}</span><ChevronRight size={12}/></button>)}</div>{visiblePath === '/chat' && <div className="channels"><span className="section-label">{tr("TEXT CHANNELS")}</span>{(community.channels.filter(c => c.type === 0).map(c => c.name)).map(c => <button key={c} className={channel === c ? 'selected' : ''} onClick={() => setChannel(c)}><Hash size={14}/>{c}{!!community.unread[community.channels.find(ch => ch.name === c)?.id ?? ''] && <span className="nav-dot"/>}</button>)}<span className="section-label">{tr("VOICE")}</span>{community.channels.filter(c => c.type === 2).map(c => <button key={c.id} onClick={() => { navigate('/voice'); void joinVoice(c.id, c.name).catch(e => notify(e.message)); }}><AudioLines size={14}/>{c.name}</button>)}{community.dms.length > 0 && <><span className="section-label">{tr("DIRECT MESSAGES")}</span>{community.dms.map(dm => <button key={dm.id} className={community.activeChannelId === dm.id ? 'selected' : ''} onClick={() => void community.openChannel(dm.id)}><MessageCircle size={14}/>{dm.recipients?.map(p => p.displayName || p.username).join(', ') || dm.name}{community.unread[dm.id] && <span className="nav-dot" aria-label={tr('Okunmamış mesaj')}/>}</button>)}</>}</div>}<div className="sidebar-spacer"/><button className="activity-nav" onClick={() => open('launcher')}><span><Plus size={17}/></span><div>{"Etkinlikler"}<small>{tr("Start an activity")}</small></div><ChevronRight size={14}/></button><NavLink to="/settings" className={({ isActive }) => `nav-item settings-link ${isActive ? 'active' : ''}`}><SettingsIcon size={17}/><span>{tr("Settings")}</span><kbd>⌘ ,</kbd></NavLink><button className="self-profile" onClick={() => navigate('/settings?tab=profile')}><Avatar name={displayName}/><span><strong>{displayName}</strong><small><i />{!community.user ? tr('Giriş yap') : community.status === 'connected' ? tr('Connected') : community.status}</small></span><MoreHorizontal size={17}/></button></aside>}
      <div className="workspace"><header className="toolbar"><div className="breadcrumb"><IconButton label={tr("Go back")} onClick={() => {
            if (cinema)
                navigate('/home');
            else
                navigate(-1);
        }}><ArrowLeft size={17}/></IconButton><span>{titles[visiblePath] ?? "Ana sayfa"}</span><span className="breadcrumb-divider">/</span><span className="breadcrumb-space">{selected.name}</span></div><div className="toolbar-actions"><span className="community-indicator real-tag">{community.user ? tr('PRIVATE COMMUNITY') : tr('Giriş yapılmadı')}</span><IconButton label={tr("Search commands")} onClick={() => open('command')}><Search size={17}/></IconButton>{!settings && <><span className="toolbar-separator"/><button className="button subtle small" onClick={() => open('launcher')}><Plus size={15}/>{tr("Start an activity")}</button><IconButton label={p.showFriends ? tr("Hide friends panel") : tr("Show friends panel")} onClick={() => setPreference('showFriends', !p.showFriends)}>{p.showFriends ? <PanelRightClose size={18}/> : <PanelRightOpen size={18}/>}</IconButton></>}</div></header>
      {community.user && (community.status !== 'connected' || community.error) && <div className={`connection-banner ${community.error ? 'error' : ''}`} role="status"><span>{community.error ?? (community.status === 'reconnecting' ? tr("Reconnecting to your community. Your last conversation is still here.") : community.status === 'connecting' ? tr("Connecting to your private community\u2026") : tr("Your community connection is interrupted."))}</span><button className="text-button" onClick={() => navigate('/settings?tab=connections')}>{tr("Connection settings")}<ArrowRight size={12}/></button>{community.error && <IconButton label={tr("Dismiss community error")} onClick={community.clearError}><X size={13}/></IconButton>}</div>}<div className="workspace-body"><main className={`main-view ${cinema ? 'theater-view' : ''}`}><Suspense fallback={<div className="loading-view"><span className="loading-ring"/>{tr("Opening your room\u2026")}</div>}><Routes location={settingsPage ? returnFromSettings.current : location}><Route path="/home" element={<Home open={open}/>}/><Route path="/spaces" element={community.user ? <CommunitySpaces notify={notify}/> : <ConnectionRequired />}/><Route path="/chat" element={community.user ? <CommunityChat notify={notify}/> : <ConnectionRequired />}/><Route path="/voice" element={community.user ? <CommunityVoice openLauncher={() => open('launcher')} notify={notify}/> : <ConnectionRequired />}/><Route path="/cinema" element={<Cinema notify={notify}/>}/><Route path="/polls" element={<Navigate to="/together?tab=polls" replace/>}/><Route path="/agent" element={<AgentWorkspace notify={notify}/>}/><Route path="/together" element={<Together />}/><Route path="/games" element={<Games />}/><Route path="/youtube" element={<YouTube />}/><Route path="*" element={<Navigate to="/home" replace/>}/></Routes></Suspense></main>
      {community.user && p.showFriends && !settings && !cinema && <FriendsPanel notify={notify}/>}
      </div>{<RealVoiceDock openLauncher={() => open('launcher')} notify={notify}/>} </div>
    </div>
    {settingsPage && <Modal title="Ayarlar" hideHeading onClose={closeSettings} className="settings-modal"><Suspense fallback={<div className="loading-view">Yükleniyor…</div>}><Settings notify={notify} onClose={closeSettings}/></Suspense></Modal>}
    {nativeInvite && <InviteLanding invite={nativeInvite} onClose={closeInvite} notify={notify}/>}
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
