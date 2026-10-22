import { MinimalSidebar } from './MinimalSidebar';
import { QuietMenu } from './QuietMenu';
import { RoomConversation } from './RoomConversation';
import { Messages } from './Messages';
import { useConversationRestore } from './last-conversation';
import { RoomEventSounds } from './room-event-sounds';
import './minimal-room.css';
import { ParticipantAudioMenu } from './ParticipantAudioMenu';
import { MusicDJ, MusicDJEntry, openMusicDJ } from './MusicDJ';
import { applyAppearancePreferences } from './appearance-preferences';
import { usePersonalPlayback } from './personal-playback';
import { tr, uiError } from './i18n';
import { VoiceSidebar } from './VoiceSidebar';
import {
  DirectMessageSurface,
  SocialSearchDialog,
  SharedFilesSurface,
  UserProfileDialog,
} from './SocialSurfaces';
import { VoiceContext } from './VoiceContext';
import { ReferenceIcon } from './ReferenceIcon';
import { RoomMembers } from './RoomMembers';
import { FriendsPage } from './FriendsPage';
import { FriendRequiredDialog } from './FriendRequiredDialog';
import { PersonalSidebar } from './PersonalSidebar';
import DmCallRuntime from './DmCallRuntime';
import ConnectionStatusSurface, { StartupSplash, SystemState } from './SystemState';
import { useChannelAccess } from './channel-access';
import { ChannelAccessState, CommunityEditor } from './CommunitySettings';
import { SocialNotificationsPage, SocialReferenceOverlay } from './SocialReferenceEntry';
import {
  ReferenceOnboarding,
  defaultStartTab,
  type ReferenceOnboardingMode,
} from './ReferenceOnboarding';
import { FriendsPanel } from './People';
import { InviteLanding } from './Invite';
import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  AudioLines,
  Bot,
  Gamepad2,
  Bell,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Film,
  Hash,
  Headphones,
  Home as HomeIcon,
  LayoutGrid,
  MessageCircle,
  Menu,
  Mic,
  MicOff,
  Moon,
  MoreHorizontal,
  Music2,
  PanelRightClose,
  PanelRightOpen,
  PhoneOff,
  Plus,
  Rocket,
  Search,
  Settings as SettingsIcon,
  Sparkles,
  Users,
  X,
} from 'lucide-react';
import { Avatar, IconButton, Modal } from '@rooms/design';
import { useRooms } from './store';
import { useCommunity, initializeCommunity } from './community';
import { useModerationRights } from './VoiceModeration';
import { useRealtime, joinVoice, toggleMic } from './realtime';
import { PushToTalk } from './PushToTalk';
import {
  CommunityChat,
  CommunitySpaces,
  CommunityVoice,
  CommunityInvite,
  RealVoiceDock,
} from './RealSocial';
import { Home } from './Home';
import { ConnectionPane } from './ConnectionPane';
import { ActivityLauncher } from './Activities';
import { RemoteControlRuntime } from './RemoteControl';
const PersonalPlaybackRuntime = lazy(() =>
  import('./PersonalMedia').then((module) => ({ default: module.PersonalPlaybackRuntime })),
);
const PersonalMedia = lazy(() =>
  import('./PersonalMedia').then((module) => ({ default: module.PersonalMedia })),
);
const RecoveryFixtureEntry = import.meta.env.DEV
  ? lazy(() => import('./dev/S04RecoveryEntry'))
  : null;
const PersonalMediaFixtureEntry = import.meta.env.DEV
  ? lazy(() => import('./dev/PersonalMediaEntry'))
  : null;
const CinemaHall = lazy(() => import('./cinema/CinemaHall'));
const Settings = lazy(() => import('./Settings'));
const AgentWorkspace = lazy(() => import('./Agent'));
const Together = lazy(() => import('./Together'));
const Games = lazy(() => import('./Games'));
export type Overlay =
  | 'launcher'
  | 'command'
  | 'create-space'
  | 'edit-space'
  | 'create-room'
  | 'help'
  | 'invite'
  | 'social-search'
  | 'profile'
  | null;
export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const lastNonDJPath = useRef(
    location.pathname === '/youtube' ? '/home' : location.pathname + location.search,
  );
  useEffect(() => {
    if (location.pathname !== '/youtube')
      lastNonDJPath.current = location.pathname + location.search;
  }, [location.pathname, location.search]);
  const { preferences: p, setPreference } = useRooms();
  const community = useCommunity();
  const communityAdmin = useModerationRights(community.activeSpaceId).communityAdmin;
  const realtime = useRealtime();
  useEffect(() => {
    if (import.meta.env.DEV && new URLSearchParams(window.location.search).has('fixture')) return;
    const bridge = window.rooms?.notifications;
    if (!bridge?.setVoiceActive) return;
    const active = realtime.status === 'connected' || realtime.status === 'reconnecting';
    const send = () => void bridge.setVoiceActive(active).catch(() => {});
    send();
    const timer = active ? setInterval(send, 10000) : undefined;
    return () => {
      if (timer) clearInterval(timer);
      void bridge.setVoiceActive(false).catch(() => {});
    };
  }, [realtime.status]);
  const spaces = community.spaces.map((s) => ({
    id: s.id,
    name: s.name,
    initials: s.name.slice(0, 1),
    tone: 'blue',
    description: 'Tayfa',
  }));
  const activeSpace = community.activeSpaceId;
  const [communityIcons, setCommunityIcons] = useState<Record<string, string>>({});
  useEffect(() => {
    let active = true;
    if (import.meta.env.DEV && new URLSearchParams(window.location.search).has('fixture'))
      void import('./dev/reference-fixtures').then((f) => {
        if (active) setCommunityIcons(f.getReferenceCommunityIcons());
      });
    return () => {
      active = false;
    };
  }, []);
  const channelAccess = useChannelAccess((state) =>
    community.activeChannelId ? state.checks[community.activeChannelId] : undefined,
  );
  const channel =
    community.channels.find((c) => c.id === community.activeChannelId)?.name ??
    community.dms.find((c) => c.id === community.activeChannelId)?.name ??
    tr('Messages');
  const displayName = community.user?.displayName ?? tr('You');
  const setSpace = (id: string) => {
    void community.openSpace(id);
  };
  const setChannel = (name: string) => {
    const ch = community.channels.find((c) => c.name === name);
    if (ch) void community.openChannel(ch.id);
  };
  const [startupReady, setStartupReady] = useState(
    () =>
      !window.rooms ||
      !!(import.meta.env.DEV && new URLSearchParams(window.location.search).has('fixture')),
  );
  // The saved session's server came back after launch: leave the sign-in screen.
  useEffect(() => {
    const restored = () => {
      if (location.pathname.startsWith('/setup/')) navigate('/home', { replace: true });
    };
    window.addEventListener('rooms:session-restored', restored);
    return () => window.removeEventListener('rooms:session-restored', restored);
  }, [location.pathname, navigate]);
  useEffect(() => {
    if (import.meta.env.DEV && new URLSearchParams(window.location.search).has('fixture')) return;
    let current = true;
    void initializeCommunity()
      .then(() => {
        if (current && !useCommunity.getState().user && ['/home', '/'].includes(location.pathname))
          navigate('/setup/welcome', { replace: true });
      })
      .finally(() => {
        if (current) setStartupReady(true);
      });
    return () => {
      current = false;
    };
  }, [navigate]);
  const sourceRequest = useRef<string | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (
      location.pathname !== '/voice' ||
      params.get('choose') !== '1' ||
      sourceRequest.current === location.key
    )
      return;
    sourceRequest.current = location.key;
    window.dispatchEvent(new Event('rooms:choose-capture'));
    params.delete('choose');
    navigate({ pathname: '/voice', search: params.toString() }, { replace: true });
  }, [location.pathname, location.search, location.key, navigate]);
  const [channelNavOpen, setChannelNavOpen] = useState(false);
  useEffect(() => {
    if (!channelNavOpen) return;
    const sidebar = document.getElementById('rooms-navigation'),
      origin = document.activeElement as HTMLElement | null;
    const items = () =>
      [
        ...(sidebar?.querySelectorAll<HTMLElement>(
          'summary,button:not(:disabled),[tabindex="0"]',
        ) ?? []),
      ].filter((el) => el.getClientRects().length);
    items()[0]?.focus();
    const trap = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const targets = items(),
        first = targets[0],
        last = targets.at(-1);
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    window.addEventListener('keydown', trap);
    return () => {
      window.removeEventListener('keydown', trap);
      origin?.focus();
    };
  }, [channelNavOpen]);
  const [narrowContext, setNarrowContext] = useState(
    () => matchMedia('(max-width:1279px)').matches,
  );
  const [contextDrawerOpen, setContextDrawerOpen] = useState(false);
  const localFixture = import.meta.env.DEV
    ? (document.documentElement.dataset.referenceFixture ?? '')
    : '';
  const fixtureHidesRoomMembers =
    localFixture.startsWith('S14/') || (localFixture === 'S19/empty' && !realtime.channelId);
  const contextVisible = contextDrawerOpen;
  useEffect(() => {
    const show = () => setOverlay('launcher');
    window.addEventListener('rooms:open-activity-launcher', show);
    return () => window.removeEventListener('rooms:open-activity-launcher', show);
  }, []);
  const toggleContext = useCallback(() => {
    setContextDrawerOpen((value) => !value);
  }, [fixtureHidesRoomMembers, narrowContext, p.showFriends, setPreference]);
  const closeContext = useCallback(() => {
    setContextDrawerOpen(false);
    if (!narrowContext) setPreference('showFriends', false);
  }, [narrowContext, setPreference]);
  useEffect(() => {
    const query = matchMedia('(max-width:1279px)');
    const resize = () => {
      setNarrowContext(query.matches);
      setContextDrawerOpen(false);
    };
    query.addEventListener('change', resize);
    return () => query.removeEventListener('change', resize);
  }, []);
  useEffect(() => {
    setChannelNavOpen(false);
    setContextDrawerOpen(false);
  }, [location.pathname, community.activeChannelId]);
  useConversationRestore(startupReady);
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
    if (!window.rooms) return;
    void window.rooms
      .pendingInvite()
      .then((value) => {
        if (value) setNativeInvite(value);
      })
      .catch(() => {});
    return window.rooms.onInvite((value) => setNativeInvite(value));
  }, []);
  // Signed out, an invitation link is a signup: open Kayıt ol with the link already filled in.
  useEffect(() => {
    if (!startupReady || !nativeInvite || community.user) return;
    const params = new URLSearchParams({
      server: nativeInvite.serverUrl,
      invite: nativeInvite.code,
    });
    setNativeInvite(null);
    navigate(`/setup/register?${params}`, { replace: true });
  }, [startupReady, nativeInvite, community.user, navigate]);
  const [toast, setToast] = useState('');
  const [search, setSearch] = useState('');
  const notify = useCallback((message: string) => setToast(message), []);
  useEffect(() => {
    // Modules without a component (voice, updates) report through this event.
    const show = (event: Event) => {
      const message = (event as CustomEvent<unknown>).detail;
      if (typeof message === 'string' && message) setToast(message.slice(0, 300));
    };
    window.addEventListener('rooms:toast', show);
    return () => window.removeEventListener('rooms:toast', show);
  }, []);
  const close = useCallback(() => {
    setOverlay(null);
    setSearch('');
  }, []);

  useEffect(() => {
    const clear = () => {
      setOverlay((current) =>
        current === 'social-search' || current === 'profile' ? null : current,
      );
      setSearch('');
    };
    window.addEventListener('rooms:channel-access-invalidated', clear);
    return () => window.removeEventListener('rooms:channel-access-invalidated', clear);
  }, []);
  const settingsPage = location.pathname === '/settings';
  const returnFromSettings = useRef('/home');
  useEffect(() => {
    if (!settingsPage) returnFromSettings.current = location.pathname + location.search;
  }, [settingsPage, location.pathname, location.search]);
  const closeSettings = useCallback(() => {
    const allowed = window.dispatchEvent(
      new Event('rooms:settings-close-request', { cancelable: true }),
    );
    if (allowed) navigate(returnFromSettings.current, { replace: true });
    return allowed;
  }, [navigate]);
  const visiblePath = settingsPage ? returnFromSettings.current.split('?')[0]! : location.pathname;
  const hallView = visiblePath === '/cinema';
  const voiceView = visiblePath === '/voice';
  const videoView =
    voiceView &&
    (new URLSearchParams(location.search).get('view') === 'video' ||
      (new URLSearchParams(location.search).get('view') !== 'share' &&
        realtime.tracks.some(
          (track) => track.source === 'camera' && track.kind === 'video' && !track.muted,
        )));
  const statusView = visiblePath === '/status';
  const fileView = visiblePath === '/files';
  const mediaView = visiblePath === '/media';
  const personalSession = usePersonalPlayback((state) => state.session);
  const mediaHeader =
    new URLSearchParams(location.search).get('player') === '1' && personalSession
      ? personalSession.media.live
        ? personalSession.media.name
        : 'Kişisel oynatıcı'
      : new URLSearchParams(location.search).get('view') === 'channels' ||
          localFixture.startsWith('S35/')
        ? 'Canlı kanallar'
        : new URLSearchParams(location.search).get('view') === 'library' ||
            localFixture.startsWith('S38/')
          ? 'Kütüphane'
          : 'Kişisel medyam';
  const notificationView = visiblePath === '/notifications';
  const dmView =
    ['/chat', '/dm'].includes(visiblePath) &&
    community.dms.some((dm) => dm.id === community.activeChannelId);
  const communityView =
    !dmView &&
    !!community.user &&
    (voiceView ||
      [
        '/chat',
        '/status',
        '/files',
        '/games',
        '/together',
        '/agent',
        '/youtube',
        '/media',
      ].includes(visiblePath));
  const personalSidebarView =
    !!community.user && (['/home', '/friends', '/notifications'].includes(visiblePath) || dmView);
  useLayoutEffect(() => {
    const main = document.querySelector('.main-view');
    if (main) main.scrollTop = 0;
  }, [visiblePath]);
  const settings = ['/agent', '/together', '/games', '/youtube', '/media'].includes(visiblePath);
  const selected = spaces.find((s) => s.id === activeSpace) ?? { name: tr('Your community') };
  const open = (value: Overlay) => {
    setSearch('');
    setOverlay(value === 'create-room' ? 'invite' : value);
  };
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(''), 4500);
    return () => clearTimeout(id);
  }, [toast]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const editing = target.closest('input,textarea,[contenteditable="true"]');
      if (
        settingsPage &&
        (e.metaKey || e.ctrlKey) &&
        (e.key.toLowerCase() === 'k' || /^[1-5]$/.test(e.key))
      ) {
        e.preventDefault();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        // The cinema hall's own "Aç…" palette owns ⌘K there.
        if (hallView) return;
        e.preventDefault();
        setOverlay((current) => (current === 'command' ? null : 'command'));
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
      if (e.key === 'Escape' && contextDrawerOpen) {
        e.preventDefault();
        setContextDrawerOpen(false);
        return;
      }
      if (e.key === 'Escape' && channelNavOpen) {
        e.preventDefault();
        setChannelNavOpen(false);
        return;
      }
      if (e.key === 'Escape' && !overlay && !nativeInvite) {
        if (settingsPage) {
          e.preventDefault();
          closeSettings();
          return;
        }
        if (document.fullscreenElement) void document.exitFullscreen();
      }
      if (!editing && (e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'm') {
        e.preventDefault();
        if (realtime.channelId) void toggleMic().catch((e) => notify(e.message));
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [
    navigate,
    close,
    overlay,
    nativeInvite,
    settingsPage,
    closeSettings,
    realtime.channelId,
    notify,
    channelNavOpen,
    contextDrawerOpen,
    hallView,
  ]);
  useEffect(() => applyAppearancePreferences(p), [p]);
  const titles: Record<string, string> = {
    '/home': 'Ana sayfa',
    '/friends': 'Arkadaşlar',
    '/messages': 'Mesajlar',
    '/media': 'Medyam',
    '/spaces': tr('Your spaces'),
    '/chat': channel.startsWith('dm-') ? channel.slice(3) : `# ${channel}`,
    '/voice': tr('The lounge'),
    '/cinema': 'Sinema',
    '/settings': tr('Settings'),
    '/notifications': 'Bildirimler',
    '/polls': tr('Quick polls'),
    '/agent': 'Agent',
    '/together': 'Birlikte',
    '/games': 'Kıraathane',
    '/youtube': 'DJ',
  };
  const setupName = visiblePath.startsWith('/setup/') ? visiblePath.slice(7) : null;
  const setupModes: ReferenceOnboardingMode[] = [
    'welcome',
    'signin',
    'register',
    'recovery',
    'selfhost',
    'invite',
    'profile',
    'devices',
  ];
  const setupMode = setupModes.find((mode) => mode === setupName);
  // The start tabs share one mounted screen so switching tabs keeps keyboard focus on the tab list.
  const setupKey =
    setupMode === 'register' || setupMode === 'signin' || setupMode === 'selfhost'
      ? 'start'
      : setupMode;
  if (!startupReady)
    return (
      <div className="app onboarding-mode">
        <div className="window-chrome">
          <span className="window-wordmark">
            <img src="./reference-brand/brand/logo-symbol-white.svg" alt="" />
            Tayfa
          </span>
        </div>
        <StartupSplash />
      </div>
    );
  if (setupMode === 'welcome' || (setupMode === 'invite' && !community.user))
    return (
      <Navigate
        replace
        to={`/setup/${defaultStartTab(new URLSearchParams(location.search))}${location.search}`}
      />
    );
  if (setupMode)
    return (
      <div className="app onboarding-mode">
        <div className="window-chrome">
          <span className="window-wordmark">
            <img src="./reference-brand/brand/logo-symbol-white.svg" alt="" />
            Tayfa
          </span>
        </div>
        {RecoveryFixtureEntry && localFixture.startsWith('S04/') ? (
          <Suspense fallback={null}>
            <RecoveryFixtureEntry variant={localFixture.split('/')[1] || 'default'} />
          </Suspense>
        ) : (
          <ReferenceOnboarding
            key={`${setupKey}-${settingsPage}`}
            mode={setupMode}
            onNavigate={(mode) => navigate(`/setup/${mode}${location.search}`)}
            onComplete={() => navigate('/home')}
            onOpenSettings={(tab) => navigate(`/settings?tab=${tab}`)}
          />
        )}
        {settingsPage && (
          <Modal title="Ayarlar" hideHeading onClose={closeSettings} className="settings-modal">
            <Suspense fallback={<div className="loading-view">Yükleniyor…</div>}>
              <Settings
                notify={notify}
                onClose={closeSettings}
                onInvite={() => {
                  if (closeSettings()) open('invite');
                }}
              />
            </Suspense>
          </Modal>
        )}
        {nativeInvite && community.user && (
          <InviteLanding invite={nativeInvite} onClose={closeInvite} notify={notify} />
        )}
        <FriendRequiredDialog notify={notify} />
        {toast && (
          <div role="status" className="toast">
            {toast}
          </div>
        )}
      </div>
    );
  return (
    <div
      className={`app minimal-room-ui ${hallView ? 'hall-mode' : ''} ${voiceView ? 'voice-mode' : ''} ${mediaView ? 'personal-media-mode' : ''} ${communityView ? 'community-mode' : ''} ${visiblePath === '/chat' || visiblePath === '/dm' ? 'chat-mode' : ''} ${realtime.channelId ? 'voice-active' : ''} ${channelNavOpen ? 'channel-nav-open' : ''} ${contextDrawerOpen ? 'context-drawer-open' : ''}`}
    >
      {<PushToTalk notify={notify} />}
      <div className="window-chrome">
        <div className="traffic-space">
          {!window.rooms && !document.documentElement.dataset.referenceFixture && (
            <span className="browser-preview">{tr('DESKTOP PREVIEW')}</span>
          )}
        </div>
        <span className="window-wordmark">
          <img src="./reference-brand/brand/logo-symbol-white.svg" alt="" />
          Tayfa
        </span>
        {import.meta.env.DEV && localFixture ? (
          <span className="window-private">
            <span
              className="demo-indicator"
              title={`Development-only visual fixture: ${localFixture}`}
            >
              DEMO · Yerel örnek
            </span>
          </span>
        ) : (
          community.user && (
            <span className="window-private">
              <ReferenceIcon name="lock" size={10} />
              Özel topluluk
            </span>
          )
        )}
      </div>
      <div className={`app-layout ${settingsPage ? 'settings-background' : ''}`}>
        <button
          className="compact-nav-toggle"
          aria-label={channelNavOpen ? 'Kanal listesini kapat' : 'Kanal listesini aç'}
          aria-controls="rooms-navigation"
          aria-expanded={channelNavOpen}
          onClick={() => setChannelNavOpen((value) => !value)}
        >
          <Menu size={20} />
        </button>
        {channelNavOpen && (
          <button
            className="compact-nav-scrim"
            aria-label="Kanal listesini kapat"
            onClick={() => setChannelNavOpen(false)}
          />
        )}
        {community.user && (
          <MinimalSidebar
            notify={notify}
            invite={() => open('invite')}
            createSpace={() => open('create-space')}
            editSpace={() => open('edit-space')}
            search={() => open('command')}
            help={() => open('help')}
          />
        )}
        <div className="workspace">
          <header className="toolbar minimal-toolbar">
            <div className="breadcrumb">
              <span>
                {['/chat', '/voice'].includes(visiblePath)
                  ? voiceView
                    ? (realtime.roomName ?? channel)
                    : channel
                  : (titles[visiblePath] ?? 'Tayfa')}
              </span>
            </div>
            <div className="toolbar-actions">
              {!['/chat', '/home', '/messages'].includes(visiblePath) && (
                <IconButton
                  label="Sohbete dön"
                  className="toolbar-icon"
                  onClick={() => {
                    if (voiceView && realtime.channelId)
                      void community
                        .openChannel(realtime.channelId)
                        .then(() => navigate('/chat'))
                        .catch((e) => notify(uiError(e)));
                    else navigate('/chat');
                  }}
                >
                  <ArrowLeft size={19} />
                </IconButton>
              )}
              <IconButton
                label={community.user ? 'DJ' : 'DJ için önce giriş yap.'}
                className="toolbar-icon"
                disabled={!community.user}
                onClick={openMusicDJ}
              >
                <Music2 size={19} />
              </IconButton>
              <IconButton
                label="Etkinlikler"
                className="toolbar-icon"
                onClick={() => open('launcher')}
              >
                <Rocket size={19} />
              </IconButton>
              <IconButton
                label={dmView ? 'Kişi bilgisi' : 'Üyeler'}
                className="toolbar-icon"
                disabled={!community.user}
                onClick={() => (dmView ? open('profile') : toggleContext())}
              >
                <Users size={19} />
              </IconButton>
              <IconButton
                label="Mesajlarda ara"
                className="toolbar-icon"
                onClick={() => open('social-search')}
              >
                <Search size={19} />
              </IconButton>
              <QuietMenu label="Oda işlemleri" compact>
                <button onClick={() => navigate('/files')}>Dosyalar</button>
                <button onClick={() => open('invite')}>Davet oluştur</button>
                <button onClick={() => open('command')}>Ara</button>
              </QuietMenu>
            </div>
          </header>
          {community.user && (community.status !== 'connected' || community.error) && (
            <div className={`connection-banner ${community.error ? 'error' : ''}`} role="status">
              <button className="connection-status-link" onClick={() => navigate('/status')}>
                {community.error ??
                  (community.status === 'reconnecting'
                    ? tr('Reconnecting to your community. Your last conversation is still here.')
                    : community.status === 'connecting'
                      ? tr('Connecting to your private community\u2026')
                      : tr('Your community connection is interrupted.'))}
              </button>
              <button className="text-button" onClick={() => navigate('/settings?tab=connections')}>
                {tr('Connection settings')}
                <ArrowRight size={12} />
              </button>
              {community.error && (
                <IconButton label={tr('Dismiss community error')} onClick={community.clearError}>
                  <X size={13} />
                </IconButton>
              )}
            </div>
          )}
          <div className="workspace-body">
            <main className="main-view">
              <Suspense
                fallback={
                  <div className="loading-view">
                    <span className="loading-ring" />
                    {tr('Opening your room\u2026')}
                  </div>
                }
              >
                <Routes location={settingsPage ? returnFromSettings.current : location}>
                  <Route path="/status" element={<ConnectionStatusSurface />} />
                  <Route path="/home" element={<Home open={open} notify={notify} />} />
                  <Route path="/messages" element={<Messages notify={notify} />} />
                  <Route
                    path="/friends"
                    element={
                      community.user ? <FriendsPage notify={notify} /> : <ConnectionRequired />
                    }
                  />
                  <Route
                    path="/spaces"
                    element={
                      community.user ? <CommunitySpaces notify={notify} /> : <ConnectionRequired />
                    }
                  />
                  <Route
                    path="/notifications"
                    element={community.user ? <SocialNotificationsPage /> : <ConnectionRequired />}
                  />
                  <Route
                    path="/chat"
                    element={
                      community.user ? (
                        channelAccess ? (
                          channelAccess === 'checking' || channelAccess === 'unavailable' ? (
                            <SystemState
                              kind={channelAccess === 'checking' ? 'loading' : 'unavailable'}
                              onRetry={() => {
                                if (community.activeChannelId)
                                  void community.openChannel(community.activeChannelId);
                              }}
                              onReturn={() => navigate('/home')}
                            />
                          ) : (
                            <ChannelAccessState
                              kind="denied"
                              voiceConnected={realtime.status === 'connected'}
                              voiceRoomName={realtime.roomName ?? undefined}
                              onReturn={() => navigate('/home')}
                            />
                          )
                        ) : dmView ? (
                          <DirectMessageSurface notify={notify} />
                        ) : (
                          <RoomConversation
                            notify={notify}
                            membersVisible={contextVisible}
                            toggleMembers={toggleContext}
                            search={() => open('social-search')}
                            openLauncher={() => open('launcher')}
                          />
                        )
                      ) : (
                        <ConnectionRequired />
                      )
                    }
                  />
                  <Route
                    path="/voice"
                    element={
                      community.user ? (
                        <RoomConversation
                          notify={notify}
                          membersVisible={contextVisible}
                          toggleMembers={toggleContext}
                          search={() => open('social-search')}
                          openLauncher={() => open('launcher')}
                        />
                      ) : (
                        <ConnectionRequired />
                      )
                    }
                  />
                  <Route path="/dm-call" element={<></>} />
                  <Route
                    path="/dm"
                    element={
                      community.user ? (
                        <DirectMessageSurface notify={notify} />
                      ) : (
                        <ConnectionRequired />
                      )
                    }
                  />
                  <Route
                    path="/files"
                    element={
                      community.user ? (
                        <SharedFilesSurface
                          notify={notify}
                          onOpenMessage={(channelId, messageId) => {
                            void community
                              .openChannel(channelId)
                              .then(() =>
                                navigate(`/chat?message=${encodeURIComponent(messageId)}`),
                              )
                              .catch((e) => notify(e.message));
                          }}
                        />
                      ) : (
                        <ConnectionRequired />
                      )
                    }
                  />
                  <Route
                    path="/media"
                    element={
                      PersonalMediaFixtureEntry && /^S3[3-9]\//.test(localFixture) ? (
                        <PersonalMediaFixtureEntry notify={notify} />
                      ) : (
                        <PersonalMedia notify={notify} />
                      )
                    }
                  />
                  <Route
                    path="/cinema"
                    element={
                      community.user ? <CinemaHall notify={notify} /> : <ConnectionRequired />
                    }
                  />
                  <Route path="/polls" element={<Navigate to="/together?tab=polls" replace />} />
                  <Route path="/agent" element={<AgentWorkspace notify={notify} />} />
                  <Route path="/together" element={<Together />} />
                  <Route path="/games" element={<Games />} />
                  <Route
                    path="/youtube"
                    element={<MusicDJEntry returnTo={lastNonDJPath.current} />}
                  />
                  <Route path="*" element={<Navigate to="/home" replace />} />
                </Routes>
              </Suspense>
              <Suspense fallback={null}>
                <PersonalPlaybackRuntime notify={notify} />
              </Suspense>
              <DmCallRuntime />
            </main>
            {contextDrawerOpen && (
              <button
                className="context-panel-scrim"
                aria-label="Üye panelini kapat"
                onClick={closeContext}
              />
            )}
            {community.user && contextVisible && !dmView && !settingsPage && (
              <RoomMembers notify={notify} onClose={closeContext} />
            )}
          </div>{' '}
        </div>
      </div>
      <RealVoiceDock
        showControls={voiceView && !settingsPage}
        openLauncher={() => open('launcher')}
        notify={notify}
      />
      {/* Route independent: registers the shared screen and answers control requests. */}
      <RemoteControlRuntime />
      <MusicDJ showTrigger={false} />
      <RoomEventSounds />
      <ParticipantAudioMenu />

      {settingsPage && (
        <section className="settings-modal settings-reference-surface" aria-label="Ayarlar">
          <Suspense fallback={<div className="loading-view">Yükleniyor…</div>}>
            <Settings
              notify={notify}
              onClose={closeSettings}
              onInvite={() => {
                if (closeSettings()) open('invite');
              }}
            />
          </Suspense>
        </section>
      )}
      {nativeInvite && community.user && (
        <InviteLanding invite={nativeInvite} onClose={closeInvite} notify={notify} />
      )}
      {(overlay === 'create-space' || overlay === 'edit-space') && (
        <CommunityEditor
          mode={overlay === 'edit-space' ? 'edit' : 'create'}
          space={community.spaces.find((s) => s.id === activeSpace)}
          canEdit={
            community.spaces.find((s) => s.id === activeSpace)?.ownerId === community.user?.id ||
            communityAdmin
          }
          onClose={close}
          onSave={
            window.rooms && community.user
              ? async (name) => {
                  const result =
                    overlay === 'edit-space'
                      ? await window.rooms!.social.renameSpace(activeSpace!, name)
                      : await window.rooms!.social.createSpace(name);
                  await community.refresh();
                  return result;
                }
              : undefined
          }
          onSaved={(space) => {
            void community.openSpace(space.id);
          }}
        />
      )}
      <SocialReferenceOverlay
        onClose={() => {
          close();
          navigate('/chat');
        }}
      />
      {overlay === 'social-search' && <SocialSearchDialog onClose={close} />}
      {overlay === 'profile' && (
        <UserProfileDialog
          user={
            dmView
              ? community.dms
                  .find((dm) => dm.id === community.activeChannelId)
                  ?.recipients?.find((person) => person.id !== community.user?.id)
              : undefined
          }
          onClose={close}
        />
      )}
      {overlay === 'launcher' && <ActivityLauncher onClose={close} />}
      {overlay === 'command' && (
        <Modal title={'Ara'} onClose={close} className="command-modal">
          <div className="command-input">
            <Search size={19} />
            <input
              autoFocus
              aria-label={tr('Search commands')}
              placeholder={'Oda veya komut ara\u2026'}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <kbd>{tr('ESC')}</kbd>
          </div>
          <div className="command-list">
            {[
              { label: 'Ana sayfa', detail: '', path: '/home', icon: HomeIcon },
              {
                label: 'Sinema',
                detail: 'Topluluğun sinema salonu',
                path: '/cinema',
                icon: Film,
              },
              {
                label: tr('Voice lounge'),
                detail: tr('Join a private voice room'),
                path: '/voice',
                icon: AudioLines,
              },
              {
                label: tr('Messages'),
                detail: tr('Your private community conversations'),
                path: '/chat',
                icon: MessageCircle,
              },
              {
                label: tr('Quick polls'),
                detail: tr('Ortak odada birlikte karar ver'),
                path: '/polls',
                icon: LayoutGrid,
              },
              {
                label: 'Agent',
                detail: tr('G\u00F6revler, sonu\u00E7lar ve oda haf\u0131zas\u0131'),
                path: '/agent',
                icon: Bot,
              },
              {
                label: tr('Oyun masas\u0131'),
                detail: 'Sanal puan',
                path: '/games',
                icon: Gamepad2,
              },
              {
                label: 'Ortak tahta ve anketler',
                detail: tr('Birlikte \u00E7iz, birlikte karar ver'),
                path: '/together',
                icon: Sparkles,
              },
              { label: tr('Settings'), detail: '', path: '/settings', icon: SettingsIcon },
            ]
              .filter((item) =>
                (item.label + item.detail).toLowerCase().includes(search.toLowerCase()),
              )
              .map((item) => (
                <button
                  key={item.path}
                  onClick={() => {
                    navigate(item.path);
                    close();
                  }}
                >
                  <item.icon size={20} />
                  <span>{item.label}</span>
                  <ArrowRight size={16} />
                </button>
              ))}
          </div>
          <p className="modal-footnote">
            {tr('Tab to choose \u00B7 Enter to open \u00B7 Escape to return')}
          </p>
        </Modal>
      )}

      {overlay === 'help' && (
        <Modal title={'Klavye k\u0131sayollar\u0131'} onClose={close}>
          {[
            [tr('Command palette'), '⌘ / Ctrl K'],
            [tr('Tonight \u2192 Cinema'), '⌘ / Ctrl 1–5'],
            [tr('Settings'), '⌘ / Ctrl ,'],
            [tr('Mute your room mic'), '⌘ / Ctrl Shift M'],
            [tr('Push to talk (when enabled)'), 'Ctrl Shift Space'],
            [tr('Play / pause (Cinema)'), 'Space'],
            [tr('Seek backward / forward'), '← / →'],
            [tr('Close an overlay'), 'Esc'],
            [tr('Send a message'), 'Enter'],
            [tr('New line in a message'), 'Shift Enter'],
          ].map(([label, key]) => (
            <div className="shortcut-row" key={label}>
              <span>{label}</span>
              <kbd>{key}</kbd>
            </div>
          ))}
          <p className="modal-footnote">
            {tr('Playback keys never interrupt typing in a message.')}
          </p>
        </Modal>
      )}
      {overlay === 'invite' && <CommunityInvite onClose={close} notify={notify} />}

      <FriendRequiredDialog notify={notify} />
      {toast && (
        <div role="status" className="toast glass">
          <span>{toast}</span>
          <IconButton label={tr('Dismiss notification')} onClick={() => setToast('')}>
            <X size={14} />
          </IconButton>
        </div>
      )}
    </div>
  );
}
function ConnectionRequired() {
  return (
    <div className="home-page page-enter">
      <ConnectionPane />
    </div>
  );
}
