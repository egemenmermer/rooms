import { uiError } from './i18n';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  Clock3,
  ExternalLink,
  Film,
  FolderOpen,
  Headphones,
  KeyRound,
  Link2,
  LoaderCircle,
  LockKeyhole,
  Play,
  Pause,
  Maximize,
  Minimize,
  Mic,
  MicOff,
  Volume2,
  MessageCircle,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Star,
  Trash2,
  Tv,
  Upload,
  Users,
  X,
} from 'lucide-react';
import Hls from 'hls.js';
import { IconButton, Modal } from '@rooms/design';
import type {
  PersonalChannel,
  PersonalLibraryItem,
  PersonalPlaylistSelection,
  PersonalProgram,
  PersonalGuide,
  PersonalRecentChannel,
  ProviderConnection,
} from '../electron/provider-contracts';
import { useCommunity } from './community';
import './reference-media.css';
import './reference-inset-player.css';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  startPersonalPlayback,
  stopPersonalPlayback,
  usePersonalPlayback,
  liveWindow,
  type PersonalPlaybackSource,
} from './personal-playback';
import { useRealtime, toggleMic, stopScreen } from './realtime';
import { VoiceAvatar } from './VoiceAvatar';
import { getPersonalProviders } from './personal-provider-runtime';
import {
  playbackFailure,
  playbackFailureCopy,
  type PersonalPlaybackFailure,
} from './personal-playback-failure';
import { MiniPlaybackChrome } from './MiniPlaybackChrome';
import { ReferenceRDConnection } from './ReferenceRDConnection';
import { addedDate, resumePosition, resumeLabel, CurrentProgram } from './PersonalMediaMetadata';

export type PersonalMediaView = 'home' | 'channels' | 'library';
type MediaSource = PersonalPlaybackSource;
type Program = PersonalProgram;
const formatBytes = (size: number) =>
  `${(size / 1024 / 1024).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} MB`;
const connectionStatus = (c: ProviderConnection) =>
  c.status === 'connected'
    ? 'Bağlı'
    : c.status === 'auth-expired'
      ? 'Yetkilendirme süresi doldu'
      : 'Bağlantı kontrol edilemiyor';

export interface PersonalMediaProps {
  notify(message: string): void;
  embedded?: boolean;
  initialView?: PersonalMediaView;
  initialDialog?: 'playlist' | 'xtream' | 'rd' | null;
  initialConnectionId?: string | null;
  initialEditId?: string | null;
  initialRemoveId?: string | null;
}
const personalId = (value: string | null) =>
  value && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
    ? value
    : null;
export function personalMediaEntry(search: string) {
  const params = new URLSearchParams(search),
    view = params.get('view'),
    dialog = params.get('dialog');
  return {
    initialView: view === 'channels' || view === 'library' ? view : ('home' as PersonalMediaView),
    initialDialog:
      dialog === 'iptv'
        ? ('playlist' as const)
        : dialog === 'xtream' || dialog === 'rd'
          ? dialog
          : null,
    initialConnectionId: personalId(params.get('connection')),
    initialEditId: personalId(params.get('edit')),
    initialRemoveId: personalId(params.get('remove')),
  };
}
export function PersonalMedia(props: PersonalMediaProps) {
  const c = useCommunity(),
    location = useLocation(),
    entry = props.embedded ? {} : personalMediaEntry(location.search);
  return (
    <PersonalMediaContent
      key={`${c.serverUrl}:${c.user?.id ?? 'signed-out'}`}
      {...entry}
      {...props}
    />
  );
}
function PersonalMediaContent({
  notify,
  embedded = false,
  initialView = 'home',
  initialDialog = null,
  initialConnectionId = null,
  initialEditId = null,
  initialRemoveId = null,
}: PersonalMediaProps) {
  const providers = getPersonalProviders();
  const user = useCommunity((s) => s.user);
  const serverUrl = useCommunity((s) => s.serverUrl);
  const navigate = useNavigate();
  const location = useLocation();
  const playMedia = (source: MediaSource, connectionId: string) => {
    if (!active.current) return;
    startPersonalPlayback(source, connectionId, user?.id ?? null, serverUrl);
    navigate('/media?player=1');
  };
  const [connections, setConnections] = useState<ProviderConnection[]>([]);
  const [view, setView] = useState<PersonalMediaView>(initialView);
  const [selected, setSelected] = useState<ProviderConnection | null>(null);
  const [channels, setChannels] = useState<PersonalChannel[]>([]),
    [library, setLibrary] = useState<PersonalLibraryItem[]>([]);
  const [inlineGuide, setInlineGuide] = useState<(PersonalGuide & { connectionId: string }) | null>(
    null,
  );
  const [resumeItems, setResumeItems] = useState<PersonalLibraryItem[]>([]),
    [resumeLoading, setResumeLoading] = useState(false),
    [resumeError, setResumeError] = useState(false);
  const [guideNow, setGuideNow] = useState(Date.now);
  const [detail, setDetail] = useState<PersonalLibraryItem | null>(null);
  const [show, setShow] = useState<'playlist' | 'xtream' | 'rd' | null>(initialDialog),
    [remove, setRemove] = useState<ProviderConnection | null>(null);
  const [recentOnly, setRecentOnly] = useState(false),
    [recentChannels, setRecentChannels] = useState<PersonalRecentChannel[]>([]),
    [historyError, setHistoryError] = useState(false);
  const historyRevision = usePersonalPlayback((s) => s.historyRevision);
  const playbackSession = usePersonalPlayback((s) => s.session);
  const [query, setQuery] = useState(''),
    [group, setGroup] = useState(''),
    [favorites, setFavorites] = useState(false);
  const [guide, setGuide] = useState<{ name: string; programs: Program[] } | null>(null);
  const [name, setName] = useState(''),
    [url, setUrl] = useState(''),
    [xmltv, setXmltv] = useState(''),
    [username, setUsername] = useState(''),
    [password, setPassword] = useState('');
  const [editing, setEditing] = useState<ProviderConnection | null>(null),
    [removeGuide, setRemoveGuide] = useState(false);
  const [playlistFile, setPlaylistFile] = useState<PersonalPlaylistSelection | null>(null);
  const [auth, setAuth] = useState<{
    userCode: string;
    verificationUrl: string;
    expiresAt: string;
    interval: number;
  } | null>(null);
  const [rdState, setRdState] = useState<
    'initial' | 'waiting' | 'connected' | 'expired' | 'cancelled' | 'error'
  >('initial');
  const [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState('');
  const errorRef = useRef<HTMLDivElement>(null),
    active = useRef(true),
    pollEpoch = useRef(0),
    dialogEpoch = useRef(0),
    operation = useRef(false),
    browseEpoch = useRef(0),
    refreshEpoch = useRef(0);
  const latestDialog = useRef(show),
    dialogDismissed = useRef(false);
  latestDialog.current = show;
  const available = !!providers;
  const unavailableReason = available
    ? undefined
    : 'Medya bağlantıları için masaüstü uygulaması gerekli.';
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      browseEpoch.current++;
      refreshEpoch.current++;
      pollEpoch.current++;
      dialogEpoch.current++;
      if (latestDialog.current === 'rd') void providers?.rdCancel?.().catch(() => {});
    };
  }, []);
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);
  const refresh = useCallback(async () => {
    if (!providers) {
      setLoading(false);
      return;
    }
    const ticket = ++refreshEpoch.current;
    try {
      const result = await providers.status();
      if (active.current && ticket === refreshEpoch.current) {
        setConnections(result);
        return result;
      }
    } catch (e) {
      if (active.current && ticket === refreshEpoch.current) setError(uiError(e));
    } finally {
      if (active.current && ticket === refreshEpoch.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => {
    let activeRead = true;
    setRecentChannels([]);
    setHistoryError(false);
    if (view !== 'channels' || !selected || !providers?.recentChannels) return;
    void providers
      .recentChannels(selected.id)
      .then((items) => {
        if (activeRead) setRecentChannels(items);
      })
      .catch(() => {
        if (activeRead) setHistoryError(true);
      });
    return () => {
      activeRead = false;
    };
  }, [view, selected, channels, historyRevision, providers]);
  const guideIds = JSON.stringify(channels.slice(0, 32).map((channel) => channel.id));
  useEffect(() => {
    if (view !== 'channels' || !selected || !channels.length) {
      setInlineGuide(null);
      return;
    }
    let cancelled = false;
    const id = selected.id;
    setInlineGuide(null);
    if (!providers?.guide) return;
    void providers
      .guide(id, JSON.parse(guideIds) as string[])
      .then((result) => {
        if (!cancelled && active.current) setInlineGuide({ ...result, connectionId: id });
      })
      .catch(() => {
        if (!cancelled && active.current)
          setInlineGuide({ status: 'unavailable', programs: {}, connectionId: id });
      });
    return () => {
      cancelled = true;
    };
  }, [view, selected, guideIds]);
  useEffect(() => {
    if (view !== 'channels') return;
    setGuideNow(Date.now());
    const timer = setInterval(() => setGuideNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, [view]);
  useEffect(() => {
    const rd = connections.find(
      (connection) => connection.type === 'real-debrid' && connection.status === 'connected',
    );
    setResumeItems([]);
    setResumeError(false);
    if (view !== 'home' || !rd || !providers?.rdLibrary) {
      setResumeLoading(false);
      if (
        view === 'home' &&
        connections.some(
          (connection) => connection.type === 'real-debrid' && connection.status !== 'connected',
        )
      )
        setResumeError(true);
      return;
    }
    let cancelled = false;
    setResumeLoading(true);
    void providers
      .rdLibrary()
      .then((items) => {
        if (!cancelled && active.current)
          setResumeItems(
            items.filter((item) => (resumePosition(item.resumeAt) ?? 0) > 0).slice(0, 3),
          );
      })
      .catch(() => {
        if (!cancelled && active.current) setResumeError(true);
      })
      .finally(() => {
        if (!cancelled && active.current) setResumeLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [view, connections]);
  const run = async (work: () => Promise<unknown>) => {
    if (operation.current) return;
    operation.current = true;
    setBusy(true);
    setError('');
    try {
      await work();
    } catch (e) {
      if (active.current) setError(uiError(e));
    } finally {
      operation.current = false;
      if (active.current) setBusy(false);
    }
  };
  const open = async (connection: ProviderConnection) => {
    if (operation.current) return;
    const ticket = ++browseEpoch.current;
    const nextView = connection.type === 'real-debrid' ? 'library' : 'channels';
    if (
      !embedded &&
      new URLSearchParams(location.search).get('player') !== '1' &&
      new URLSearchParams(location.search).get('connection') !== connection.id
    )
      navigate(`/media?view=${nextView}&connection=${encodeURIComponent(connection.id)}`);
    setSelected(connection);
    setDetail(null);
    setGuide(null);
    setQuery('');
    setGroup('');
    setFavorites(false);
    setChannels([]);
    setLibrary([]);
    setView(connection.type === 'real-debrid' ? 'library' : 'channels');
    await run(async () => {
      if (connection.type === 'real-debrid') {
        const items = await providers!.rdLibrary();
        if (active.current && ticket === browseEpoch.current) setLibrary(items);
      } else {
        const items = await providers!.channels(connection.id);
        if (active.current && ticket === browseEpoch.current) setChannels(items);
      }
      if (active.current && ticket === browseEpoch.current) await refresh();
    });
  };
  const previousEntry = useRef(initialView);
  useEffect(() => {
    const changed = previousEntry.current !== initialView;
    previousEntry.current = initialView;
    if (initialView === 'home') {
      if (changed) setView('home');
      return;
    }
    const connection = connections.find(
      (c) =>
        (!initialConnectionId || c.id === initialConnectionId) &&
        (initialView === 'library' ? c.type === 'real-debrid' : c.type !== 'real-debrid'),
    );
    if (connection && connection.id !== selected?.id) void open(connection);
    else if (connection && changed) setView(initialView);
  }, [connections.length, initialView, initialConnectionId, busy]);
  const close = useCallback(() => {
    dialogDismissed.current = true;
    dialogEpoch.current++;
    pollEpoch.current++;
    if (latestDialog.current === 'rd') void providers?.rdCancel?.().catch(() => {});
    setShow(null);
    setAuth(null);
    setUrl('');
    setXmltv('');
    setPassword('');
    setUsername('');
    setName('');
    setPlaylistFile(null);
    setEditing(null);
    setRemoveGuide(false);
    setError('');
  }, []);
  const closeRemove = useCallback(() => {
    setRemove(null);
  }, []);
  const begin = (kind: 'playlist' | 'xtream' | 'rd', connection?: ProviderConnection) => {
    dialogDismissed.current = false;
    setEditing(connection ?? null);
    setRemoveGuide(false);
    setName(connection?.name ?? '');
    setXmltv('');
    dialogEpoch.current++;
    setError('');
    setPlaylistFile(null);
    setUrl('');
    setPassword('');
    setUsername('');
    setShow(kind);
    setRdState(
      connections.some((c) => c.type === 'real-debrid' && c.status === 'connected')
        ? 'connected'
        : connections.some((c) => c.type === 'real-debrid' && c.status === 'auth-expired')
          ? 'expired'
          : 'initial',
    );
  };
  const entryApplied = useRef('');
  useEffect(() => {
    if (loading) return;
    const key = JSON.stringify([initialDialog, initialEditId, initialRemoveId]);
    if (key === entryApplied.current) return;
    if (!entryApplied.current && dialogDismissed.current) {
      entryApplied.current = key;
      return;
    }
    entryApplied.current = key;
    const edit = connections.find((c) => c.id === initialEditId),
      removing = connections.find((c) => c.id === initialRemoveId);
    if (removing) setRemove(removing);
    else if (edit && edit.type !== 'real-debrid') begin(edit.type, edit);
    else if (initialDialog && show !== initialDialog) begin(initialDialog);
    else if (
      initialDialog === 'rd' &&
      connections.some((c) => c.type === 'real-debrid' && c.status === 'connected')
    )
      setRdState('connected');
  }, [loading, initialDialog, initialEditId, initialRemoveId]);
  const selectInput = (kind: 'playlist' | 'xtream') => {
    dialogEpoch.current++;
    setPlaylistFile(null);
    setUrl('');
    setUsername('');
    setPassword('');
    setError('');
    setShow(kind);
  };
  const choosePlaylist = () => {
    const ticket = dialogEpoch.current;
    void run(async () => {
      const picked = await providers!.pickPlaylist();
      if (!active.current || ticket !== dialogEpoch.current) return;
      if (picked) {
        setPlaylistFile(picked);
        setUrl('');
      }
    });
  };
  const startRD = () => {
    const epoch = dialogEpoch.current;
    void run(async () => {
      pollEpoch.current++;
      try {
        const grant = await providers!.rdStart();
        if (epoch === dialogEpoch.current && active.current) {
          setAuth(grant);
          setRdState('waiting');
        }
      } catch (failure) {
        if (epoch === dialogEpoch.current && active.current) {
          setAuth(null);
          setRdState('error');
          throw failure;
        }
      }
    });
  };
  useEffect(() => {
    if (!auth || show !== 'rd' || rdState !== 'waiting') return;
    let stopped = false,
      polling = false;
    const epoch = pollEpoch.current;
    const timer = setInterval(
      () => {
        if (polling || stopped || epoch !== pollEpoch.current) return;
        if (Date.now() >= Date.parse(auth.expiresAt)) {
          setAuth(null);
          setRdState('expired');
          return;
        }
        polling = true;
        void providers!
          .rdPoll()
          .then(async (result) => {
            if (stopped || epoch !== pollEpoch.current) return;
            if (result.state === 'connected') {
              const latest = await refresh();
              if (!active.current || stopped || epoch !== pollEpoch.current) return;
              setAuth(null);
              if (
                latest?.some(
                  (connection) =>
                    connection.type === 'real-debrid' && connection.status === 'connected',
                )
              ) {
                setRdState('connected');
                notify('Kişisel Real-Debrid hesabın bağlandı.');
              } else {
                setRdState('error');
                setError('Bağlantı sonucu okunamadı. Bağlantıları yenile.');
              }
            } else if (result.state === 'expired') {
              setAuth(null);
              setRdState('expired');
            }
          })
          .catch((e) => {
            if (!stopped && epoch === pollEpoch.current && active.current) {
              setError(uiError(e));
              setAuth(null);
              setRdState('error');
              pollEpoch.current++;
              void providers?.rdCancel?.().catch(() => {});
            }
          })
          .finally(() => {
            polling = false;
          });
      },
      Math.max(5000, auth.interval * 1000),
    );
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [auth, show, rdState, refresh, notify]);
  const connect = (e: React.FormEvent) => {
    e.preventDefault();
    const epoch = dialogEpoch.current;
    void run(async () => {
      const guide = removeGuide ? null : xmltv.trim() || undefined;
      const connection = editing
        ? show === 'xtream'
          ? await providers!.updateXtream({
              id: editing.id,
              name: name.trim(),
              ...(url.trim() ? { serverUrl: url.trim() } : {}),
              ...(username ? { username } : {}),
              ...(password ? { password } : {}),
            })
          : await providers!.updatePlaylist({
              id: editing.id,
              name: name.trim(),
              ...(playlistFile
                ? { token: playlistFile.token }
                : url.trim()
                  ? { url: url.trim() }
                  : {}),
              ...(guide !== undefined ? { xmltvUrl: guide } : {}),
            })
        : show === 'playlist' && playlistFile
          ? await providers!.playlistFile({
              name: name.trim(),
              token: playlistFile.token,
              ...(xmltv.trim() ? { xmltvUrl: xmltv.trim() } : {}),
            })
          : show === 'xtream'
            ? await providers!.connectXtream({
                name: name.trim(),
                serverUrl: url.trim(),
                username,
                password,
              })
            : await providers!.connectPlaylist({
                name: name.trim(),
                url: url.trim(),
                ...(xmltv.trim() ? { xmltvUrl: xmltv.trim() } : {}),
              });
      if (!active.current) return;
      if (epoch !== dialogEpoch.current) {
        await refresh();
        if (active.current) notify(editing ? 'Bağlantı güncellendi.' : 'Kişisel kaynağın eklendi.');
        return;
      }
      await refresh();
      if (!active.current) return;
      if (editing) stopPersonalPlayback(editing.id);
      setShow(null);
      setEditing(null);
      setRemoveGuide(false);
      setName('');
      setUrl('');
      setXmltv('');
      setUsername('');
      setPassword('');
      setPlaylistFile(null);
      notify(editing ? 'Bağlantı güncellendi.' : 'Kişisel kaynağın eklendi.');
      setChannels([]);
      setInlineGuide(null);
      setSelected(connection);
      setView('channels');
      const items = await providers!.channels(connection.id);
      if (active.current) setChannels(items);
    });
  };
  const groups = [...new Set(channels.map((c) => c.group).filter(Boolean))];
  const historyOrder = new Map(recentChannels.map((item, index) => [item.channelId, index]));
  const filteredChannels = channels.filter(
    (c) =>
      (!recentOnly || historyOrder.has(c.id)) &&
      (!favorites || c.favorite) &&
      (!group || group === c.group) &&
      `${c.name} ${c.group}`.toLocaleLowerCase('tr').includes(query.toLocaleLowerCase('tr')),
  );
  if (recentOnly)
    filteredChannels.sort((a, b) => (historyOrder.get(a.id) ?? 0) - (historyOrder.get(b.id) ?? 0));
  const filteredLibrary = library.filter((item) =>
    item.name.toLocaleLowerCase('tr').includes(query.toLocaleLowerCase('tr')),
  );
  const resetFilters = () => {
    setRecentOnly(false);
    setQuery('');
    setFavorites(false);
    setGroup('');
  };
  const home = () => {
    browseEpoch.current++;
    setView('home');
    setDetail(null);
    setGuide(null);
    if (!embedded) navigate('/media');
  };
  const errorBlock = error && (
    <div className="ref-media-notice error" role="alert" tabIndex={-1} ref={errorRef}>
      {error}
    </div>
  );
  const coveredByPlayer =
    !embedded && !!playbackSession && new URLSearchParams(location.search).get('player') === '1';
  return (
    <section
      inert={coveredByPlayer}
      aria-hidden={coveredByPlayer}
      className={`ref-personal-media ${embedded ? 'embedded' : ''}`}
      aria-busy={busy || loading}
    >
      <div className="ref-media-main">
        <div className="ref-media-private">
          <span>
            <LockKeyhole size={15} />
            Kişisel alanın · yalnızca sen görebilirsin
          </span>
          {user && <small>{user.displayName || user.username}</small>}
        </div>
        {
          <>
            <div className="ref-media-top">
              <div>
                <h1>
                  {view === 'home'
                    ? 'Kişisel medya'
                    : view === 'channels'
                      ? 'Canlı kanallar'
                      : 'Kütüphane'}
                </h1>
                <p>
                  {view === 'home'
                    ? 'Kişisel kaynakların.'
                    : selected
                      ? `${selected.name}${view === 'channels' ? ` · ${channels.length} kanal` : ''}`
                      : 'Bir kaynak seç.'}
                </p>
              </div>
              <div className="ref-media-actions">
                {view === 'channels' && (
                  <button
                    className="button secondary"
                    disabled={
                      busy ||
                      !selected ||
                      !(selected.type === 'playlist'
                        ? providers?.updatePlaylist
                        : providers?.updateXtream)
                    }
                    title={
                      !selected
                        ? 'Önce bir kaynak seç.'
                        : !(selected.type === 'playlist'
                              ? providers?.updatePlaylist
                              : providers?.updateXtream)
                          ? 'Bağlantı düzenleme için güncel masaüstü uygulaması gerekli.'
                          : undefined
                    }
                    onClick={() => {
                      if (selected)
                        begin(selected.type === 'playlist' ? 'playlist' : 'xtream', selected);
                    }}
                  >
                    <Settings2 size={15} />
                    Bağlantıyı düzenle
                  </button>
                )}
                {view !== 'home' && (
                  <button className="button secondary" disabled={busy} onClick={home}>
                    <ArrowLeft size={15} />
                    Kişisel medyaya dön
                  </button>
                )}
                <button
                  className="button secondary"
                  disabled={busy || !available}
                  title={unavailableReason}
                  onClick={() =>
                    view === 'home'
                      ? begin('playlist')
                      : selected
                        ? void open(selected)
                        : void refresh()
                  }
                >
                  {view === 'home' ? <Plus size={16} /> : <RefreshCw size={16} />}
                  {view === 'home' ? 'Kaynak ekle' : 'Yenile'}
                </button>
              </div>
            </div>
            {!show && !remove && errorBlock}
            {loading && (
              <div className="ref-media-loading" role="status">
                <LoaderCircle size={25} className="spin" />
                Bağlantılar yükleniyor…
              </div>
            )}
            {view === 'home' && !loading && (
              <>
                {!connections.length ? (
                  <div className="ref-media-empty">
                    <Film size={36} />
                    <h2>Bağlı kaynak yok</h2>
                    <p>İzlemek için kişisel bir kaynak ekle.</p>
                    <div className="ref-media-actions">
                      <button
                        className="button primary"
                        disabled={!available}
                        title={unavailableReason}
                        onClick={() => begin('playlist')}
                      >
                        <Plus size={16} />
                        IPTV ekle
                      </button>
                      <button
                        className="button secondary"
                        disabled={!available}
                        title={unavailableReason}
                        onClick={() => begin('rd')}
                      >
                        <Link2 size={16} />
                        Real-Debrid bağla
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="ref-media-section-head">
                      <h2>Kaldığın yerden</h2>
                      {connections.some((connection) => connection.type === 'real-debrid') && (
                        <button
                          className="ref-media-ghost"
                          disabled={busy}
                          onClick={() => {
                            const rd = connections.find(
                              (connection) => connection.type === 'real-debrid',
                            );
                            if (rd) void open(rd);
                          }}
                        >
                          <ArrowRight size={15} />
                          Tümünü gör
                        </button>
                      )}
                    </div>
                    {resumeLoading ? (
                      <div className="ref-media-loading" role="status">
                        <LoaderCircle size={19} className="spin" />
                        Kayıtlı konumlar yükleniyor…
                      </div>
                    ) : resumeItems.length ? (
                      <div className="ref-media-resume-list">
                        {resumeItems.map((item) => (
                          <button
                            className="ref-media-resume-card"
                            key={item.id}
                            disabled={busy}
                            onClick={() => {
                              const rd = connections.find(
                                (connection) => connection.type === 'real-debrid',
                              );
                              if (rd)
                                void run(async () =>
                                  playMedia(await providers!.rdPlay(item.id), rd.id),
                                );
                            }}
                          >
                            <span className="ref-media-resume-art">
                              <Film size={34} />
                              <Play size={18} />
                            </span>
                            <strong>{item.name}</strong>
                            <small>{resumeLabel(item.resumeAt)} · Real-Debrid</small>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="ref-media-resume-empty">
                        {resumeError
                          ? 'Kayıtlı izleme konumları alınamadı.'
                          : 'Kayıtlı izleme konumu yok.'}
                      </p>
                    )}
                    <div className="ref-media-section-head">
                      <h2>Bağlantılar</h2>
                      <button
                        className="ref-media-ghost"
                        disabled={busy}
                        onClick={() => void run(refresh)}
                      >
                        <RefreshCw size={15} />
                        Yenile
                      </button>
                    </div>
                    <div className="ref-media-connections">
                      {connections.map((connection) => (
                        <article className="ref-media-source" key={connection.id}>
                          <span className="ref-media-mark">
                            {connection.type === 'real-debrid' ? (
                              <Link2 size={24} />
                            ) : (
                              <Tv size={24} />
                            )}
                          </span>
                          <button
                            className="ref-media-source-copy"
                            disabled={busy}
                            onClick={() => void open(connection)}
                          >
                            <strong>{connection.name}</strong>
                            <small>
                              {connectionStatus(connection)}
                              {connection.type !== 'real-debrid'
                                ? ` · ${connection.channelCount} kanal`
                                : ''}
                            </small>
                          </button>
                          <IconButton
                            label={`${connection.name} aç`}
                            disabled={busy}
                            onClick={() => void open(connection)}
                          >
                            <ChevronRight size={16} />
                          </IconButton>
                          <IconButton
                            label={`${connection.name} bağlantısını kaldır`}
                            disabled={busy}
                            onClick={() => setRemove(connection)}
                          >
                            <Trash2 size={14} />
                          </IconButton>
                        </article>
                      ))}
                    </div>
                    <div className="ref-media-actions">
                      <button
                        className="button secondary"
                        disabled={busy}
                        onClick={() => begin('playlist')}
                      >
                        <Tv size={16} />
                        IPTV ekle
                      </button>
                      <button
                        className="button secondary"
                        disabled={busy}
                        onClick={() => begin('rd')}
                      >
                        <Link2 size={16} />
                        Real-Debrid bağla
                      </button>
                      <button
                        className="ref-media-ghost"
                        disabled
                        title="Kişisel kaynaklar Cinema'ya aktarılmaz. Ortak oynatma için her katılımcının ayrı yetkili kaynağı gerekir."
                      >
                        <Users size={16} />
                        Cinema’da izle
                      </button>
                    </div>
                  </>
                )}
              </>
            )}
            {view !== 'home' && !loading && (
              <>
                <label className="ref-media-search">
                  <Search size={17} />
                  <input
                    aria-label={view === 'channels' ? 'Kanal ara' : 'Kütüphanede içerik ara'}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={view === 'channels' ? 'Kanal ara' : 'Kütüphanende ara'}
                  />
                </label>
                {!selected ? (
                  <div className="ref-media-empty">
                    <FolderOpen size={32} />
                    <h2>Bağlı kaynak bulunamadı</h2>
                    <button className="button primary" onClick={home}>
                      Kaynak ekle
                    </button>
                  </div>
                ) : view === 'channels' ? (
                  <div className="ref-media-browse">
                    <nav className="ref-media-groups" aria-label="Kanal filtreleri">
                      <h3>KANALLAR</h3>
                      <button
                        className={!recentOnly && !favorites && !group ? 'selected' : ''}
                        onClick={resetFilters}
                      >
                        <Tv size={15} />
                        Tüm kanallar<span>{channels.length}</span>
                      </button>
                      <button
                        className={favorites ? 'selected' : ''}
                        onClick={() => {
                          setRecentOnly(false);
                          setFavorites(!favorites);
                          setGroup('');
                        }}
                      >
                        <Star size={15} />
                        Favoriler<span>{channels.filter((c) => c.favorite).length}</span>
                      </button>
                      <button
                        className={recentOnly ? 'selected' : ''}
                        disabled={!providers?.recentChannels}
                        title={
                          !providers?.recentChannels
                            ? 'İzleme geçmişi için güncel masaüstü uygulaması gerekli.'
                            : undefined
                        }
                        onClick={() => {
                          setRecentOnly(true);
                          setFavorites(false);
                          setGroup('');
                        }}
                      >
                        <Clock3 size={15} />
                        Son izlenenler<span>{recentChannels.length}</span>
                      </button>
                      <h3>GRUPLAR</h3>
                      {groups.map((value) => (
                        <button
                          key={value}
                          className={group === value ? 'selected' : ''}
                          onClick={() => {
                            setRecentOnly(false);
                            setGroup(value);
                            setFavorites(false);
                          }}
                        >
                          {value}
                          <span>{channels.filter((c) => c.group === value).length}</span>
                        </button>
                      ))}
                    </nav>
                    <div className="ref-media-results">
                      {recentOnly && historyError && (
                        <div className="ref-media-notice error" role="alert">
                          İzleme geçmişi alınamadı.
                        </div>
                      )}
                      {inlineGuide?.connectionId === selected.id &&
                        inlineGuide.status !== 'available' && (
                          <div className="ref-media-notice" role="status">
                            {inlineGuide.status === 'not-configured'
                              ? 'Bu bağlantıda program rehberi yok.'
                              : 'Program rehberi alınamadı.'}
                          </div>
                        )}
                      {busy && (
                        <div className="ref-media-loading">
                          <LoaderCircle className="spin" size={22} />
                          Kanallar yükleniyor…
                        </div>
                      )}
                      {guide && (
                        <section className="ref-media-guide">
                          <div className="ref-media-section-head">
                            <h2>{guide.name} · Program rehberi</h2>
                            <IconButton
                              label="Program rehberini kapat"
                              onClick={() => setGuide(null)}
                            >
                              <X size={15} />
                            </IconButton>
                          </div>
                          {guide.programs.length ? (
                            guide.programs.map((p, index) => (
                              <article key={index}>
                                <time>
                                  {new Date(p.startsAt).toLocaleTimeString('tr-TR', {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}
                                  –
                                  {new Date(p.endsAt).toLocaleTimeString('tr-TR', {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}
                                </time>
                                <strong>{p.title}</strong>
                                <p>{p.description}</p>
                              </article>
                            ))
                          ) : (
                            <div className="ref-media-notice">
                              Bu kanal için program bilgisi sunulmuyor. Kanal normal şekilde
                              izlenebilir.
                            </div>
                          )}
                        </section>
                      )}
                      {filteredChannels.map((channel) => (
                        <article className="ref-media-channel" key={channel.id}>
                          <span className="ref-media-channel-icon" aria-hidden="true">
                            {channel.name.slice(0, 3).toLocaleUpperCase('tr-TR')}
                          </span>
                          <div>
                            <strong>{channel.name}</strong>
                            <CurrentProgram
                              programs={
                                inlineGuide?.connectionId === selected.id
                                  ? inlineGuide.programs[channel.id]
                                  : undefined
                              }
                              now={guideNow}
                              fallback={channel.group || 'Kişisel kanal'}
                            />
                          </div>
                          <IconButton
                            label={`${channel.name} program rehberi`}
                            disabled={busy}
                            onClick={() =>
                              void run(async () => {
                                const programs = await providers!.epg(selected.id, channel.id);
                                if (active.current) setGuide({ name: channel.name, programs });
                              })
                            }
                          >
                            <Clock3 size={16} />
                          </IconButton>
                          <IconButton
                            label={
                              channel.favorite
                                ? `${channel.name} favorilerden çıkar`
                                : `${channel.name} favorilere ekle`
                            }
                            disabled={busy}
                            onClick={() =>
                              void run(async () => {
                                await providers!.favorite(
                                  selected.id,
                                  channel.id,
                                  !channel.favorite,
                                );
                                if (active.current)
                                  setChannels((items) =>
                                    items.map((c) =>
                                      c.id === channel.id ? { ...c, favorite: !c.favorite } : c,
                                    ),
                                  );
                              })
                            }
                          >
                            <Star size={17} fill={channel.favorite ? 'currentColor' : 'none'} />
                          </IconButton>
                          <button
                            className="ref-media-ghost"
                            disabled={busy}
                            onClick={() =>
                              void run(async () =>
                                playMedia(
                                  {
                                    ...(await providers!.play(selected.id, channel.id)),
                                    channelId: channel.id,
                                  },
                                  selected.id,
                                ),
                              )
                            }
                          >
                            <Play size={15} />
                            İzle
                          </button>
                        </article>
                      ))}
                      {!busy && !filteredChannels.length && (
                        <div className="ref-media-empty">
                          <Search size={30} />
                          <h2>Kanal bulunamadı</h2>
                          <p>Başka bir kelime dene veya seçili grubu değiştir.</p>
                          <button className="button secondary" onClick={resetFilters}>
                            Tüm kanalları göster
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <>
                    {busy && (
                      <div className="ref-media-loading">
                        <LoaderCircle size={22} className="spin" />
                        Kütüphanen yükleniyor…
                      </div>
                    )}
                    {filteredLibrary.length ? (
                      <table className="ref-media-library">
                        <thead>
                          <tr>
                            <th>İÇERİK</th>
                            <th>EKLENME</th>
                            <th>İZLEME KONUMU</th>
                            <th />
                          </tr>
                        </thead>
                        <tbody>
                          {filteredLibrary.map((item) => (
                            <tr className={detail?.id === item.id ? 'selected' : ''} key={item.id}>
                              <td>
                                <span className="ref-media-name-cell">
                                  <Film size={25} />
                                  <strong>{item.name}</strong>
                                </span>
                              </td>
                              <td>{addedDate(item.addedAt)}</td>
                              <td>{resumeLabel(item.resumeAt)}</td>
                              <td>
                                <button
                                  className="ref-media-ghost"
                                  disabled={busy}
                                  onClick={() => setDetail(item)}
                                >
                                  <ChevronRight size={16} />
                                  Aç
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      !busy && (
                        <div className="ref-media-empty">
                          <Film size={36} />
                          <h2>{query ? 'İçerik bulunamadı' : 'Henüz içerik görünmüyor'}</h2>
                          <p>
                            {query
                              ? 'Başka bir kelime dene.'
                              : 'Kişisel hesabındaki uygun içerikler bağlantı yenilendikten sonra burada listelenir.'}
                          </p>
                          <button
                            className="button primary"
                            onClick={() => (query ? setQuery('') : void open(selected))}
                          >
                            <RefreshCw size={16} />
                            {query ? 'Aramayı temizle' : 'Kütüphaneyi yenile'}
                          </button>
                        </div>
                      )
                    )}
                    <div className="ref-media-section-head">
                      <small>{filteredLibrary.length} içerik · kişisel listede</small>
                      <button
                        className="ref-media-ghost"
                        disabled={busy}
                        onClick={() => begin('rd')}
                      >
                        <Settings2 size={15} />
                        Bağlantıyı yönet
                      </button>
                    </div>
                  </>
                )}
              </>
            )}
          </>
        }
        <p className="ref-media-footnote">
          <ShieldCheck size={13} />
          Kişisel oynatma · diğer üyelerle paylaşılmaz
        </p>
      </div>
      {detail && (
        <aside className="ref-media-detail">
          <div className="ref-media-section-head">
            <h2>İçerik ayrıntısı</h2>
            <IconButton label="İçerik ayrıntısını kapat" onClick={() => setDetail(null)}>
              <X size={17} />
            </IconButton>
          </div>
          <div className="ref-media-detail-art">
            <Film size={44} />
          </div>
          <h2>{detail.name}</h2>
          <p>
            {formatBytes(detail.size)} · {detail.mime || 'Biçim belirtilmedi'}
          </p>
          <dl className="ref-media-detail-metadata">
            <dt>Eklenme</dt>
            <dd>{addedDate(detail.addedAt)}</dd>
            <dt>İzleme konumu</dt>
            <dd>{resumeLabel(detail.resumeAt)}</dd>
          </dl>
          <button
            className="button primary full"
            disabled={busy}
            onClick={() =>
              void run(async () => playMedia(await providers!.rdPlay(detail.id), selected!.id))
            }
          >
            <Play size={16} />
            {(resumePosition(detail.resumeAt) ?? 0) > 0 ? 'Kaldığım yerden izle' : 'İzle'}
          </button>
          <button
            className="button secondary full"
            disabled
            title="Her katılımcının ayrı yetkili kaynağını eşleştiren Cinema bağlantısı henüz yok."
          >
            <Users size={16} />
            Cinema’da kullan
          </button>
          <p className="ref-media-footnote">
            <LockKeyhole size={13} />
            Kişisel bağlantı ayrıntıların yalnızca sende kalır.
          </p>
        </aside>
      )}
      {show && (
        <Modal
          title={
            show === 'rd'
              ? 'Kişisel Real-Debrid bağlantısı'
              : editing
                ? 'IPTV bağlantısını düzenle'
                : 'Kişisel IPTV bağlantısı'
          }
          onClose={close}
          className={`ref-media-modal ${show === 'rd' ? 'rd' : 'iptv'}`}
        >
          {show === 'rd' ? (
            <ReferenceRDConnection
              state={
                rdState === 'connected' &&
                !connections.some(
                  (connection) =>
                    connection.type === 'real-debrid' && connection.status === 'connected',
                )
                  ? 'initial'
                  : rdState
              }
              grant={auth}
              busy={busy}
              available={available}
              canCancel={!!providers?.rdCancel}
              error={error || null}
              onStart={startRD}
              onClose={close}
              onCancel={() => {
                const ticket = dialogEpoch.current;
                pollEpoch.current++;
                void run(async () => {
                  await providers!.rdCancel();
                  if (active.current && ticket === dialogEpoch.current) {
                    setAuth(null);
                    setRdState('cancelled');
                  }
                });
              }}
              onOpenLibrary={() => {
                const rd = connections.find(
                  (connection) =>
                    connection.type === 'real-debrid' && connection.status === 'connected',
                );
                if (rd) {
                  close();
                  void open(rd);
                }
              }}
              onRemove={() => {
                const rd = connections.find(
                  (connection) =>
                    connection.type === 'real-debrid' && connection.status === 'connected',
                );
                if (rd) {
                  close();
                  setRemove(rd);
                }
              }}
            />
          ) : (
            <form onSubmit={connect}>
              <fieldset disabled={busy}>
                <p className="ref-media-description">
                  Yalnızca kullanma yetkine sahip olduğun kişisel bir kaynak ekle.
                </p>
                <div className="ref-media-tabs" role="group" aria-label="IPTV bağlantı türü">
                  <button
                    type="button"
                    aria-pressed={show === 'playlist'}
                    className={show === 'playlist' ? 'selected' : ''}
                    disabled={!!editing && editing.type !== 'playlist'}
                    title={
                      editing && editing.type !== 'playlist'
                        ? 'Türü değiştirmek için yeni bağlantı ekle.'
                        : undefined
                    }
                    onClick={() => selectInput('playlist')}
                  >
                    M3U / M3U8
                  </button>
                  <button
                    type="button"
                    aria-pressed={show === 'xtream'}
                    className={show === 'xtream' ? 'selected' : ''}
                    disabled={!!editing && editing.type !== 'xtream'}
                    title={
                      editing && editing.type !== 'xtream'
                        ? 'Türü değiştirmek için yeni bağlantı ekle.'
                        : undefined
                    }
                    onClick={() => selectInput('xtream')}
                  >
                    Xtream
                  </button>
                </div>
                <label className="field-label">
                  Bağlantı adı
                  <input
                    required
                    autoFocus
                    maxLength={80}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Örn. Evdeki kanallar"
                  />
                </label>
                <label className="field-label">
                  {show === 'playlist' ? 'Liste bağlantısı' : 'Sunucu adresi'}
                  <input
                    required={!playlistFile && !editing}
                    type="password"
                    autoComplete="off"
                    value={url}
                    onChange={(e) => {
                      setUrl(e.target.value);
                      setPlaylistFile(null);
                    }}
                    placeholder={
                      editing
                        ? 'Değiştirmek için yeni adres yaz'
                        : show === 'playlist'
                          ? 'M3U veya M3U8 bağlantısını yapıştır'
                          : 'https://sunucu-adresi'
                    }
                  />
                </label>
                {show === 'playlist' ? (
                  <>
                    <div className="ref-media-upload">
                      <Upload size={28} />
                      <strong>Bir M3U / M3U8 dosyası seç</strong>
                      <p>
                        {playlistFile
                          ? `${playlistFile.fileName} · ${playlistFile.channelCount} kanal`
                          : 'M3U veya M3U8'}
                      </p>
                      <button
                        type="button"
                        className="button secondary"
                        disabled={busy || !providers?.pickPlaylist}
                        title={
                          !providers?.pickPlaylist
                            ? 'Dosya seçimi için güncel masaüstü uygulaması gerekli.'
                            : undefined
                        }
                        onClick={choosePlaylist}
                      >
                        <Upload size={15} />
                        {playlistFile ? 'Başka dosya seç' : 'Dosya seç'}
                      </button>
                    </div>
                    <details className="ref-media-epg-options">
                      <summary>Program rehberi · isteğe bağlı</summary>
                      <label className="field-label">
                        XMLTV adresi
                        <input
                          type="password"
                          value={xmltv}
                          disabled={removeGuide}
                          autoComplete="off"
                          onChange={(e) => setXmltv(e.target.value)}
                          placeholder={
                            editing ? 'Mevcut rehberi korumak için boş bırak' : 'XMLTV adresi'
                          }
                        />
                      </label>
                      {editing && (
                        <label className="ref-media-guide-remove">
                          <input
                            type="checkbox"
                            checked={removeGuide}
                            onChange={(event) => setRemoveGuide(event.target.checked)}
                          />
                          Program rehberini kaldır
                        </label>
                      )}
                    </details>
                  </>
                ) : (
                  <div className="ref-media-form-grid">
                    <label className="field-label">
                      Kullanıcı adı
                      <input
                        required={!editing}
                        autoComplete="off"
                        placeholder={
                          editing ? 'Değiştirmek için yeni kullanıcı adı yaz' : undefined
                        }
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                      />
                    </label>
                    <label className="field-label">
                      Parola
                      <input
                        required={!editing}
                        type="password"
                        autoComplete="new-password"
                        placeholder={editing ? 'Mevcut parolayı korumak için boş bırak' : undefined}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                      />
                    </label>
                  </div>
                )}
                {busy && (
                  <div className="ref-media-notice" role="status">
                    <LoaderCircle className="spin" size={16} />
                    Kaynak ve kanal listesi doğrulanıyor…
                  </div>
                )}
                {errorBlock}
                <p className="ref-media-footnote">
                  <LockKeyhole size={13} />
                  Bu bilgiler yalnızca senin kişisel bağlantında kalır; ortak sohbet ve kuyruklarda
                  görünmez.
                </p>
                <div className="ref-media-modal-footer">
                  <button type="button" className="button secondary" onClick={close}>
                    Vazgeç
                  </button>
                  <button
                    className="button primary"
                    disabled={
                      busy ||
                      !available ||
                      !name.trim() ||
                      (!url.trim() && !playlistFile && !editing)
                    }
                  >
                    <Check size={16} />
                    {busy ? 'Doğrulanıyor…' : editing ? 'Değişiklikleri kaydet' : 'Doğrula ve ekle'}
                  </button>
                </div>
              </fieldset>
            </form>
          )}
        </Modal>
      )}
      {remove && (
        <Modal
          title={`${remove.name} bağlantısını kaldır?`}
          onClose={closeRemove}
          className="ref-media-modal remove"
        >
          <p className="ref-media-description">
            Bu bağlantıya ait kanallar ve favoriler kişisel medya alanından kaldırılır. Yeniden
            kullanmak için bağlantıyı tekrar eklemen gerekir.
          </p>
          <div className="ref-media-notice">
            <LockKeyhole size={17} />
            Diğer kişisel bağlantıların ve topluluğun etkilenmez.
          </div>
          {errorBlock}
          <div className="ref-media-modal-footer">
            <button className="button secondary" disabled={busy} onClick={() => setRemove(null)}>
              Vazgeç
            </button>
            <button
              className="button danger"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await providers!.disconnect(remove.id);
                  if (!active.current) return;
                  stopPersonalPlayback(remove.id);
                  if (selected?.id === remove.id) {
                    setSelected(null);
                    setView('home');
                  }
                  setRemove(null);
                  await refresh();
                  if (active.current) notify('Kişisel bağlantın kaldırıldı.');
                })
              }
            >
              <Trash2 size={15} />
              Bağlantıyı kaldır
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}

export function PersonalPlaybackRuntime({ notify }: { notify(message: string): void }) {
  const providers = getPersonalProviders();
  const session = usePersonalPlayback((s) => s.session),
    location = useLocation(),
    navigate = useNavigate();
  const ownerId = useCommunity((s) => s.user?.id ?? null);
  const ownerServerUrl = useCommunity((s) => s.serverUrl);
  const fixture = import.meta.env.DEV
    ? document.documentElement.dataset.referenceFixture
    : undefined;
  const inset = !fixture?.startsWith('S29/') && !fixture?.startsWith('S30/');
  const foreground =
    location.pathname === '/media' && new URLSearchParams(location.search).get('player') === '1';
  const miniFixture =
    import.meta.env.DEV && document.documentElement.dataset.referenceFixture?.startsWith('S30/');
  const [miniHidden, setMiniHidden] = useState(false),
    [miniCompact, setMiniCompact] = useState(false);
  useEffect(() => {
    if (foreground) setMiniHidden(false);
  }, [foreground]);
  useEffect(() => {
    if (
      session &&
      (ownerId !== session.ownerId ||
        (session.ownerServerUrl !== undefined && ownerServerUrl !== session.ownerServerUrl))
    )
      stopPersonalPlayback();
  }, [ownerId, ownerServerUrl, session]);
  useEffect(() => {
    if (!session || !providers) return;
    let active = true;
    const check = async () => {
      try {
        const connections = await providers!.status();
        if (
          active &&
          usePersonalPlayback.getState().session === session &&
          !connections.some((c) => c.id === session.connectionId)
        )
          stopPersonalPlayback(session.connectionId);
      } catch {
        /* Playback itself reports unavailable/expired capabilities. */
      }
    };
    const timer = setInterval(() => void check(), 15000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [session]);
  if (!session) return null;
  const showMini = !!miniFixture && !foreground && !miniHidden;
  return (
    <>
      <div
        className={`personal-playback-runtime ${foreground ? 'foreground' : 'background'} ${inset ? 'inset' : ''} ${miniFixture ? 's30-mini-active' : ''} ${miniHidden && miniFixture ? 's30-mini-hidden' : ''} ${miniCompact ? 's30-mini-compact' : ''}`}
        aria-hidden={!foreground && !showMini}
        inert={!foreground && !showMini}
      >
        <PersonalPlayer
          media={session.media}
          connectionId={session.connectionId}
          inset={inset}
          notify={notify}
          onClose={() => {
            stopPersonalPlayback();
            navigate('/media');
          }}
          onBack={() =>
            navigate(
              `/media?view=${session.media.live ? 'channels' : 'library'}&connection=${encodeURIComponent(session.connectionId)}`,
            )
          }
          onChat={() => navigate('/chat')}
          visible={foreground}
          miniMode={!!miniFixture}
          miniCompact={miniCompact}
          miniHidden={miniHidden}
          onMiniCompact={() => setMiniCompact((value) => !value)}
          onMiniHide={() => setMiniHidden(true)}
          onReturn={() => navigate('/media?player=1')}
        />
      </div>
      {!foreground && !miniFixture && (
        <div className="personal-playback-mini" role="region" aria-label="Kişisel oynatma">
          <span>{session.media.name}</span>
          <button onClick={() => navigate('/media?player=1')}>
            <Maximize size={15} />
            Oynatıcıya dön
          </button>
          <IconButton label="Kişisel oynatmayı durdur" onClick={() => stopPersonalPlayback()}>
            <X size={15} />
          </IconButton>
        </div>
      )}
    </>
  );
}

function PersonalPlayer({
  media,
  connectionId,
  inset,
  onClose,
  onBack,
  onChat,
  visible,
  notify,
  miniMode = false,
  miniCompact = false,
  miniHidden = false,
  onMiniCompact = () => {},
  onMiniHide = () => {},
  onReturn = onBack,
}: {
  media: MediaSource;
  connectionId: string;
  inset: boolean;
  onClose(): void;
  onBack(): void;
  onChat(): void;
  visible: boolean;
  notify(message: string): void;
  miniMode?: boolean;
  miniCompact?: boolean;
  miniHidden?: boolean;
  onMiniCompact?: () => void;
  onMiniHide?: () => void;
  onReturn?: () => void;
}) {
  const providers = getPersonalProviders();
  const fixtureValue = import.meta.env.DEV
    ? document.documentElement.dataset.referenceFixture
    : undefined;
  const referenceVariant = fixtureValue?.startsWith('S29/')
    ? fixtureValue.slice('S29/'.length)
    : fixtureValue === 'S30/live'
      ? 'live'
      : fixtureValue === 'S30/personal'
        ? 'personal'
        : null;
  const insetFixture =
    fixtureValue?.startsWith('S36/') ||
    fixtureValue?.startsWith('S39/') ||
    fixtureValue === 'S38/playing';
  const insetVariant = insetFixture ? fixtureValue?.split('/')[1] : undefined;
  const referenceFixture = !!referenceVariant || !!insetFixture;
  const referenceCaption = referenceFixture && referenceVariant === 'captions';
  const [programmes, setProgrammes] = useState<PersonalProgram[]>([]);
  const [programmeTime, setProgrammeTime] = useState(Date.now);
  useEffect(() => {
    let active = true;
    setProgrammes([]);
    if (!media.live || !media.channelId || !providers?.epg) return;
    const read = async () => {
      try {
        const result = await providers.epg(connectionId, media.channelId!);
        if (active) {
          setProgrammes(result);
          setProgrammeTime(Date.now());
        }
      } catch {
        if (active) setProgrammes([]);
      }
    };
    void read();
    const timer = setInterval(() => void read(), 60000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [connectionId, media.channelId, media.live, providers]);
  const currentProgramme = programmes.find(
    (p) => Date.parse(p.startsAt) <= programmeTime && programmeTime < Date.parse(p.endsAt),
  );
  const nextProgramme = programmes
    .filter((p) => Date.parse(p.startsAt) > programmeTime)
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))[0];
  const programmeClock = (value: string) =>
    new Date(value).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  const stageRef = useRef<HTMLDivElement>(null);
  const realtime = useRealtime();
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [playing, setPlaying] = useState(false),
    [volume, setVolume] = useState(0.65),
    [fullscreen, setFullscreen] = useState(false);
  const [seekWindow, setSeekWindow] = useState<ReturnType<typeof liveWindow>>(null);
  const [duration, setDuration] = useState(() => (referenceFixture ? 6120 : 0)),
    [currentTime, setCurrentTime] = useState(() =>
      referenceFixture ? 2068 : (media.startAt ?? 0),
    );
  const ref = useRef<HTMLVideoElement>(null),
    hlsRef = useRef<Hls | null>(null);
  const lastSave = useRef(0),
    completed = useRef(false),
    acknowledged = useRef<string | null>(null);
  const [failure, setFailure] = useState<PersonalPlaybackFailure | null>(null);
  const [error, setError] = useState(''),
    [loading, setLoading] = useState(true),
    [attempt, setAttempt] = useState(0);
  const [options, setOptions] = useState(false),
    [external, setExternal] = useState(false);
  const [audio, setAudio] = useState<{ id: number; label: string }[]>([]),
    [captions, setCaptions] = useState<{ id: number; label: string }[]>([]);
  const [audioId, setAudioId] = useState(-1),
    [captionId, setCaptionId] = useState(-1);
  const [liveLag, setLiveLag] = useState(0),
    [canSeekLive, setCanSeekLive] = useState(false);
  const native = providers?.nativePlayer;
  const nativeToken = useRef<string | null>(null);
  const nativeTime = useRef(0);
  const nativeVolume = useRef(volume);
  nativeVolume.current = volume;
  const [nativeAvailable, setNativeAvailable] = useState(false);
  const [engine, setEngine] = useState<'checking' | 'vlc' | 'web'>(
    native && !referenceFixture ? 'checking' : 'web',
  );
  useEffect(() => {
    let active = true;
    if (!native || referenceFixture) {
      setEngine('web');
      return;
    }
    void native
      .status()
      .then((status) => {
        if (active) {
          setNativeAvailable(status.available);
          setEngine(status.available ? 'vlc' : 'web');
        }
      })
      .catch(() => {
        if (active) setEngine('web');
      });
    return () => {
      active = false;
    };
  }, [native, referenceFixture]);
  useEffect(() => {
    if (engine !== 'vlc' || !native) return;
    let active = true;
    let ownToken: string | null = null;
    let busy = false;
    let hasPlayback = false;
    let resumeApplied = false;
    let timer: ReturnType<typeof setInterval> | undefined;
    setError('');
    setFailure(null);
    setLoading(true);
    setPlaying(false);
    setSeekWindow(null);
    setCanSeekLive(false);
    setLiveLag(0);
    setAudio([]);
    setCaptions([]);
    setAudioId(-1);
    setCaptionId(-1);
    completed.current = false;
    void native
      .start(media.url)
      .then(async (result) => {
        ownToken = result.token;
        if (!active) {
          await native.stop(result.token);
          return;
        }
        nativeToken.current = result.token;
        await native.control(result.token, {
          action: 'volume',
          value: Math.round(nativeVolume.current * 100),
        });
        const tick = async () => {
          if (!active || busy) return;
          busy = true;
          try {
            const state = await native.state(result.token);
            if (!active) return;
            setPlaying(state.state === 3);
            setCurrentTime(Math.max(0, state.time));
            nativeTime.current = Math.max(0, state.time);
            setDuration(Math.max(0, state.duration));
            setAudioId((value) => (value < 0 ? state.audioId : value));
            setAudio(state.audio.filter((track) => track.id >= 0));
            setCaptions(state.captions.filter((track) => track.id >= 0));
            if (state.state === 7) {
              setLoading(false);
              setFailure('unknown');
              setError(
                'VLC bu yayını açamadı. Kaynak bağlantısı veya yayın biçimi nedeniyle oynatma durdu. Yeniden deneyebilirsin.',
              );
              return;
            }
            if (state.state === 6) {
              completed.current = true;
              setLoading(false);
            }
            if (state.state === 2) setLoading(true);
            if (
              state.state === 3 &&
              state.width > 0 &&
              state.height > 0 &&
              state.displayedFrames > 0
            ) {
              hasPlayback = true;
              setLoading(false);
              if (media.live && acknowledged.current !== media.url) {
                acknowledged.current = media.url;
                void providers
                  ?.acknowledgePlayback(media.url)
                  .then(() =>
                    usePersonalPlayback.setState((state) => ({
                      historyRevision: state.historyRevision + 1,
                    })),
                  )
                  .catch(() => {
                    if (acknowledged.current === media.url) acknowledged.current = null;
                  });
              }
            }
            if (
              !media.live &&
              !resumeApplied &&
              media.startAt &&
              state.state === 3 &&
              state.seekable &&
              state.duration > media.startAt + 2
            ) {
              resumeApplied = true;
              await native.control(result.token, { action: 'seek', value: media.startAt });
            }
            // VLC does not expose a trustworthy live/DVR interval through this adapter.
            // Never invent a seekable live edge; VOD seeking follows actual engine support.
            if (!media.live && state.seekable && state.duration > 0)
              setSeekWindow({
                start: 0,
                end: state.duration,
                position: state.time,
                canSeek: true,
                lag: 0,
              });
          } catch {
            if (active) {
              setLoading(false);
              setFailure('expired');
              setError('Oynatma oturumu sona erdi. Kaynağı yeniden aç.');
            }
          } finally {
            busy = false;
          }
        };
        await tick();
        if (!active) return;
        timer = setInterval(() => void tick(), 500);
      })
      .catch(() => {
        if (active) {
          setLoading(false);
          setFailure('unknown');
          setError('VLC yayını başlatamadı. Kaynak bağlantısını kontrol edip yeniden dene.');
        }
      });
    return () => {
      active = false;
      if (timer) clearInterval(timer);
      if (nativeToken.current === ownToken) nativeToken.current = null;
      if (ownToken) {
        if (!media.live && hasPlayback)
          void providers
            ?.saveResume(media.url, completed.current ? 0 : nativeTime.current)
            .catch(() => {});
        void native.stop(ownToken).catch(() => {});
      }
    };
  }, [engine, native, media.url, attempt]);
  useEffect(() => {
    if (engine !== 'vlc' || !native) return;
    let disposed = false;
    let busy = false;
    const update = async () => {
      const token = nativeToken.current;
      const element = ref.current;
      if (disposed || busy || !token || !element) return;
      busy = true;
      const rect = element.getBoundingClientRect();
      // Native views draw above Chromium. Reserve the DOM toolbar/control areas,
      // otherwise visually hidden controls could still respond to automation clicks.
      let top = rect.top;
      let bottom = rect.bottom;
      const header = stageRef.current?.querySelector('.ref-media-top')?.getBoundingClientRect();
      const controls = stageRef.current
        ?.querySelector('.personal-live-controls')
        ?.getBoundingClientRect();
      if (header && header.top <= top && header.bottom > top) top = Math.min(bottom, header.bottom);
      if (controls && controls.top > top && controls.top < bottom) bottom = controls.top;
      const height = Math.max(0, bottom - top);
      const obstructed = !!document.querySelector(
        '[role="dialog"], [role="menu"], [role="listbox"]',
      );
      try {
        await native.bounds(token, {
          x: Math.max(0, rect.x),
          y: Math.max(0, top),
          width: rect.x < 0 ? 0 : rect.width,
          height: top < 0 ? 0 : height,
          visible: visible && !miniHidden && !options && !loading && !error && !obstructed,
        });
      } catch {
        /* Stale cleanup cannot update the replacement player. */
      } finally {
        busy = false;
      }
    };
    const timer = setInterval(() => void update(), 100);
    const observer = new ResizeObserver(() => void update());
    if (ref.current) observer.observe(ref.current);
    window.addEventListener('scroll', update, true);
    void update();
    return () => {
      disposed = true;
      clearInterval(timer);
      observer.disconnect();
      window.removeEventListener('scroll', update, true);
    };
  }, [engine, native, visible, miniHidden, options, loading, error, fullscreen]);
  useEffect(() => {
    if (engine === 'vlc' && native && nativeToken.current)
      void native
        .control(nativeToken.current, { action: 'volume', value: Math.round(volume * 100) })
        .catch(() => {});
  }, [engine, native, volume]);
  const closeOptions = useCallback(() => {
    setOptions(false);
    setExternal(false);
  }, []);
  useEffect(() => {
    const update = () => setFullscreen(document.fullscreenElement === stageRef.current);
    document.addEventListener('fullscreenchange', update);
    return () => {
      document.removeEventListener('fullscreenchange', update);
      delete document.documentElement.dataset.roomPlayerFullscreen;
    };
  }, []);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (
        event.key !== 'Escape' ||
        options ||
        document.querySelector('[role="dialog"]') ||
        document.fullscreenElement !== stageRef.current
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      void document.exitFullscreen().catch((error) => notify(uiError(error)));
    };
    document.addEventListener('keydown', escape, true);
    return () => document.removeEventListener('keydown', escape, true);
  }, [options, notify]);
  useEffect(() => {
    if (fullscreen) document.documentElement.dataset.roomPlayerFullscreen = 'true';
    else delete document.documentElement.dataset.roomPlayerFullscreen;
  }, [fullscreen]);
  useEffect(() => {
    if (visible) stageRef.current?.focus({ preventScroll: true });
    else closeOptions();
  }, [visible, closeOptions]);
  useEffect(() => {
    if (!visible && document.fullscreenElement === stageRef.current)
      void document.exitFullscreen().catch(() => {});
  }, [visible]);
  useEffect(() => {
    if (ref.current) ref.current.volume = volume;
  }, [volume]);
  const revealControls = () => {
    setControlsVisible(true);
    if (idleTimer.current) clearTimeout(idleTimer.current);
    if (visible && playing && !options)
      idleTimer.current = setTimeout(() => setControlsVisible(false), 2800);
  };
  useEffect(() => {
    revealControls();
    return () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
  }, [visible, playing, options]);
  const togglePlayback = () => {
    if (referenceFixture) {
      setPlaying((value) => !value);
      revealControls();
      return;
    }
    if (engine === 'vlc' && native && nativeToken.current) {
      void native
        .control(nativeToken.current, { action: 'pause', value: playing ? 1 : 0 })
        .catch(() => notify('Oynatma kontrolü uygulanamadı.'));
      return;
    }
    const video = ref.current;
    if (!video) return;
    if (video.paused)
      void video.play().catch(() => {
        setError('Oynatma başlatılamadı. Kaynağını kontrol edip yeniden dene.');
      });
    else video.pause();
  };
  const toggleFullscreen = () => {
    if (document.fullscreenElement === stageRef.current)
      void document.exitFullscreen().catch((e) => notify(uiError(e)));
    else if (document.fullscreenEnabled)
      void stageRef.current?.requestFullscreen().catch((e) => notify(uiError(e)));
  };

  const savePosition = useCallback(
    (force = false) => {
      if (engine === 'vlc') {
        if (!media.live && providers && nativeToken.current)
          void providers
            .saveResume(media.url, completed.current ? 0 : nativeTime.current)
            .catch(() => {});
        return;
      }
      const video = ref.current;
      if (!video || media.live || !providers || !video.readyState) return;
      const now = Date.now();
      if (!force && now - lastSave.current < 5000) return;
      lastSave.current = now;
      void providers
        ?.saveResume(media.url, completed.current ? 0 : video.currentTime)
        .catch((e) => notify(uiError(e)));
    },
    [media.url, media.live, notify, engine],
  );
  useEffect(() => {
    completed.current = false;
    lastSave.current = 0;
    const video = ref.current;
    return () => {
      if (video?.readyState && !media.live)
        void providers
          ?.saveResume(media.url, completed.current ? 0 : video.currentTime)
          .catch((e) => notify(uiError(e)));
    };
  }, [media.url, media.live, notify]);
  useEffect(() => {
    if (engine !== 'web') return;
    const video = ref.current;
    if (!video) return;
    setError('');
    setFailure(null);
    setLoading(true);
    setPlaying(false);
    setSeekWindow(null);
    setAudio([]);
    setCaptions([]);
    setAudioId(-1);
    setCaptionId(-1);
    setLiveLag(0);
    setCanSeekLive(false);
    if (referenceFixture) {
      setLoading(insetVariant === 'buffering');
      setPlaying(
        insetVariant !== 'buffering' && insetVariant !== 'error' && insetVariant !== 'expired',
      );
      if (
        insetVariant === 'expired' ||
        insetVariant === 'error' ||
        insetVariant === 'unsupported'
      ) {
        const kind =
          insetVariant === 'expired'
            ? 'expired'
            : insetVariant === 'unsupported'
              ? 'unsupported'
              : 'network';
        setFailure(kind);
        setError(playbackFailureCopy[kind].message);
      }
      if (media.live) {
        setCanSeekLive(true);
        setCurrentTime(insetVariant === 'rewound' ? 21420 : 21600);
        setLiveLag(insetVariant === 'rewound' ? 180 : 0);
      }
      if (fixtureValue?.startsWith('S39/')) {
        setOptions(true);
        setExternal(insetVariant === 'external');
        if (insetVariant === 'default') {
          setAudio([
            { id: 0, label: 'Türkçe · DEV' },
            { id: 1, label: 'İngilizce · DEV' },
          ]);
          setAudioId(0);
          setCaptions([
            { id: 0, label: 'Türkçe · DEV' },
            { id: 1, label: 'İngilizce · DEV' },
          ]);
          setCaptionId(0);
        }
      }
      return;
    }
    let hls: Hls | null = null;
    let networkRecoveries = 0,
      mediaRecoveries = 0,
      recovering = false,
      disposed = false,
      hasPlayed = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined,
      recoveryDeadline: ReturnType<typeof setTimeout> | undefined,
      stallTimer: ReturnType<typeof setTimeout> | undefined;
    let progressTime = video.currentTime;
    const clearStall = () => {
      clearTimeout(stallTimer);
      stallTimer = undefined;
    };
    const clearRecovery = () => {
      recovering = false;
      clearTimeout(retryTimer);
      clearTimeout(recoveryDeadline);
    };
    const fail = (kind: PersonalPlaybackFailure) => {
      clearRecovery();
      clearStall();
      if (disposed) return;
      setLoading(false);
      setFailure(kind);
      setError(playbackFailureCopy[kind].message);
    };
    const recovered = () => {
      hasPlayed = true;
      clearStall();
      progressTime = video.currentTime;
      clearRecovery();
      setFailure(null);
      setError('');
    };
    const recover = (kind: 'network' | 'unsupported') => {
      if (!hls || !media.live || !hasPlayed || (video.paused && video.error?.code !== 3))
        return false;
      if (recovering) return true;
      if (
        (kind === 'network' && networkRecoveries >= 2) ||
        (kind === 'unsupported' && (mediaRecoveries >= 1 || video.error?.code !== 3))
      )
        return false;
      recovering = true;
      setLoading(true);
      setFailure(null);
      setError('');
      recoveryDeadline = setTimeout(() => fail(kind), 10000);
      if (kind === 'unsupported') {
        mediaRecoveries++;
        hls.recoverMediaError();
      } else {
        networkRecoveries++;
        hls.stopLoad();
        retryTimer = setTimeout(() => {
          if (!disposed) hls?.startLoad();
        }, networkRecoveries * 1500);
      }
      return true;
    };
    const stalled = () => {
      if (!media.live || !hasPlayed || disposed || video.paused || video.ended || stallTimer)
        return;
      stallTimer = setTimeout(() => {
        stallTimer = undefined;
        if (!disposed && !video.paused && !video.ended && !recover('network')) fail('stalled');
      }, 20000);
    };
    const progressed = () => {
      if (Math.abs(video.currentTime - progressTime) < 0.1) return;
      progressTime = video.currentTime;
      clearStall();
      if (recovering) recovered();
    };
    const nativeError = () => {
      if (video.error?.code === 3 && hls && !recover('unsupported')) fail('unsupported');
    };
    video.addEventListener('playing', recovered);
    video.addEventListener('waiting', stalled);
    video.addEventListener('stalled', stalled);
    video.addEventListener('pause', clearStall);
    video.addEventListener('timeupdate', progressed);
    video.addEventListener('error', nativeError);
    const readTracks = () => {
      if (hls) {
        setAudio(
          hls.audioTracks.map((track, id) => ({
            id,
            label: track.name || track.lang || `Ses ${id + 1}`,
          })),
        );
        setCaptions(
          hls.subtitleTracks.map((track, id) => ({
            id,
            label: track.name || track.lang || `Altyazı ${id + 1}`,
          })),
        );
        setAudioId(hls.audioTrack);
        setCaptionId(hls.subtitleTrack);
      } else {
        setCaptions(
          Array.from(video.textTracks).map((track, id) => ({
            id,
            label: track.label || track.language || `Altyazı ${id + 1}`,
          })),
        );
      }
    };
    video.addEventListener('loadedmetadata', readTracks);
    video.textTracks.addEventListener('addtrack', readTracks);
    if (Hls.isSupported()) {
      hls = new Hls({ enableWorker: true });
      hlsRef.current = hls;
      hls.on(Hls.Events.MANIFEST_PARSED, readTracks);
      hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, readTracks);
      hls.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, readTracks);
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (!data.fatal) return;
        if (
          data.type === Hls.ErrorTypes.NETWORK_ERROR &&
          data.details === Hls.ErrorDetails.MANIFEST_PARSING_ERROR
        ) {
          hls?.destroy();
          hls = null;
          hlsRef.current = null;
          video.src = media.url;
        } else {
          const status = data.response?.code;
          if (data.type === Hls.ErrorTypes.MEDIA_ERROR && recover('unsupported')) return;
          if (
            data.type === Hls.ErrorTypes.NETWORK_ERROR &&
            (status === undefined ||
              status === 0 ||
              status === 408 ||
              status === 429 ||
              status >= 500) &&
            recover('network')
          )
            return;
          fail(playbackFailure(status, data.type === Hls.ErrorTypes.MEDIA_ERROR ? 3 : undefined));
        }
      });
      hls.loadSource(media.url);
      hls.attachMedia(video);
    } else video.src = media.url;
    return () => {
      disposed = true;
      clearStall();
      clearRecovery();
      video.removeEventListener('playing', recovered);
      video.removeEventListener('waiting', stalled);
      video.removeEventListener('stalled', stalled);
      video.removeEventListener('pause', clearStall);
      video.removeEventListener('timeupdate', progressed);
      video.removeEventListener('error', nativeError);
      video.removeEventListener('loadedmetadata', readTracks);
      video.textTracks.removeEventListener('addtrack', readTracks);
      hls?.destroy();
      hlsRef.current = null;
      video.pause();
      video.removeAttribute('src');
      video.load();
    };
  }, [media.url, attempt, referenceFixture, engine]);
  const applyTracks = () => {
    if (engine === 'vlc' && native && nativeToken.current) {
      const token = nativeToken.current;
      void Promise.all([
        native.control(token, { action: 'audio', value: audioId }),
        native.control(token, { action: 'caption', value: captionId }),
      ]).catch(() => notify('Ses veya altyazı seçimi uygulanamadı.'));
      setOptions(false);
      return;
    }
    const hls = hlsRef.current;
    if (hls) {
      if (audioId >= 0 && audio.some((track) => track.id === audioId)) hls.audioTrack = audioId;
      hls.subtitleTrack = captionId;
      hls.subtitleDisplay = captionId >= 0;
    } else if (ref.current)
      Array.from(ref.current.textTracks).forEach((track, id) => {
        track.mode = id === captionId ? 'showing' : 'disabled';
      });
    setOptions(false);
  };
  const updateTime = () => {
    savePosition();
    const video = ref.current;
    if (!video) return;
    if (Number.isFinite(video.duration)) setDuration(video.duration);
    if (Number.isFinite(video.currentTime)) setCurrentTime(video.currentTime);
    if (!media.live) return;
    const range = liveWindow(video.seekable, video.currentTime);
    setSeekWindow(range);
    setCanSeekLive(!!range?.canSeek);
    setLiveLag(range?.lag ?? 0);
  };
  const returnLive = () => {
    if (referenceFixture) {
      setCurrentTime(21600);
      setLiveLag(0);
      return;
    }
    const video = ref.current;
    if (!canSeekLive || !video?.seekable.length) return;
    video.currentTime = Math.max(
      video.seekable.start(video.seekable.length - 1),
      video.seekable.end(video.seekable.length - 1) - 0.2,
    );
    updateTime();
  };
  const fixtureLive = referenceFixture && media.live;
  const fixturePersonal = referenceFixture && referenceVariant === 'personal';
  const playbackWindow = referenceFixture
    ? {
        start: 0,
        end: fixtureLive ? 21600 : 6120,
        position: currentTime,
        canSeek: true,
        lag: fixtureLive ? Math.max(0, 21600 - currentTime) : 0,
      }
    : media.live
      ? seekWindow
      : duration > 0
        ? { start: 0, end: duration, position: currentTime, canSeek: true, lag: 0 }
        : null;
  const canSeek =
    !!playbackWindow?.canSeek &&
    (media.live ? referenceFixture || canSeekLive : duration > 0 || referenceFixture);
  const clock = (value: number) => {
    const total = Math.max(0, Math.floor(value));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;
    return hours
      ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
      : `${minutes}:${String(seconds).padStart(2, '0')}`;
  };
  const seekTo = (value: number) => {
    const next = Math.max(
      playbackWindow?.start ?? 0,
      Math.min((playbackWindow?.end ?? value) - (media.live ? 0.2 : 0), value),
    );
    if (referenceFixture) {
      setCurrentTime(next);
      if (media.live) setLiveLag(Math.max(0, 21600 - next));
      return;
    }
    if (engine === 'vlc' && native && nativeToken.current && canSeek) {
      void native
        .control(nativeToken.current, { action: 'seek', value: next })
        .catch(() => notify('Bu kaynakta konum değiştirilemiyor.'));
      return;
    }
    if (ref.current && canSeek) {
      ref.current.currentTime = next;
      setCurrentTime(next);
      updateTime();
    }
  };
  return (
    <div
      ref={stageRef}
      tabIndex={-1}
      className={`ref-personal-player ${media.live ? 'live' : 'vod'} ${controlsVisible || loading || error ? '' : 'idle'} ${miniMode ? 's30-mini-player' : ''}`}
      onPointerMove={revealControls}
      onFocusCapture={revealControls}
      aria-label={media.live ? 'Kişisel canlı yayın' : 'Kişisel oynatıcı'}
      onKeyDown={(event) => {
        if (
          (event.target as HTMLElement).closest(
            'input,select,textarea,button,[contenteditable="true"]',
          ) ||
          options
        )
          return;
        if (event.key === ' ') {
          event.preventDefault();
          togglePlayback();
        }
        if (!media.live && event.key === 'ArrowLeft') {
          event.preventDefault();
          seekTo(currentTime - 10);
        }
        if (!media.live && event.key === 'ArrowRight') {
          event.preventDefault();
          seekTo(currentTime + 10);
        }
        if (event.key === 'Escape' && !document.fullscreenElement) {
          event.preventDefault();
          onBack();
        }
      }}
    >
      {inset && !media.live && (
        <div className="personal-inset-privacy">
          <LockKeyhole size={15} />
          Kişisel alanın · yalnızca sen görebilirsin
        </div>
      )}
      <div className="ref-media-top">
        <div className="ref-media-title">
          {!inset && (
            <button className="ref-media-back" aria-label="Geri" onClick={onBack}>
              <ArrowLeft size={20} />
            </button>
          )}
          <div>
            <h1>{currentProgramme?.title || media.name}</h1>
            <p>
              {media.live
                ? `${inset ? media.name + ' · ' : ''}Kişisel canlı yayın`
                : 'Kişisel oynatma · yalnızca sen'}
            </p>
          </div>
        </div>
        <div className="ref-media-actions">
          <button
            className="button secondary"
            disabled={referenceFixture || realtime.status !== 'connected' || realtime.busy}
            title={
              referenceFixture
                ? 'Örnek görünümde paylaşım kapalı.'
                : realtime.status !== 'connected'
                  ? 'Önce ses odasına katıl.'
                  : 'Paylaşılacak pencereyi seç; istersen sistem sesini de aç.'
            }
            onClick={() => {
              if (realtime.sharing)
                void stopScreen().catch(() => notify('Paylaşım durdurulamadı. Yeniden dene.'));
              else window.dispatchEvent(new Event('rooms:choose-capture'));
            }}
          >
            {realtime.sharing ? 'Paylaşımı durdur' : 'Odayla paylaş'}
          </button>
          {!inset && (
            <button className="button secondary" onClick={onChat}>
              <MessageCircle size={15} />
              Sohbet
            </button>
          )}
          <button className="button secondary" onClick={onBack}>
            {media.live ? <Tv size={15} /> : <Film size={15} />}{' '}
            {media.live ? 'Kanallara dön' : 'Kütüphaneme dön'}
          </button>
          {inset && (
            <button className="ref-media-ghost" onClick={() => setOptions(true)}>
              <Settings2 size={18} />
              Ses ve altyazı
            </button>
          )}
          <IconButton label="Kişisel oynatmayı durdur" onClick={onClose}>
            <X size={18} />
          </IconButton>
        </div>
      </div>
      {inset && media.live && liveLag > 5 && (
        <div className="personal-inset-notice" role="status">
          <Clock3 size={17} />
          <span>Canlı yayından {Math.floor(liveLag)} saniye geridesin.</span>
          <button className="button secondary" onClick={returnLive} disabled={!canSeek}>
            Canlıya dön
          </button>
        </div>
      )}
      <div className="personal-inset-stage">
        <div className="ref-media-stage">
          <video
            ref={ref}
            autoPlay
            controls={false}
            poster={referenceFixture ? '/__reference/01_brand/cinema-still.svg' : undefined}
            playsInline
            onLoadedMetadata={() => {
              const video = ref.current;
              if (
                video &&
                !media.live &&
                media.startAt &&
                Number.isFinite(video.duration) &&
                media.startAt < video.duration - 2
              )
                video.currentTime = media.startAt;
              updateTime();
            }}
            onTimeUpdate={updateTime}
            onProgress={updateTime}
            onDurationChange={updateTime}
            onPause={() => {
              setPlaying(false);
              savePosition(true);
            }}
            onEnded={() => {
              completed.current = true;
              savePosition(true);
            }}
            onPlay={() => {
              completed.current = false;
              setPlaying(true);
            }}
            onWaiting={() => setLoading(true)}
            onPlaying={() => {
              setLoading(false);
              if (
                !referenceFixture &&
                media.live &&
                providers?.acknowledgePlayback &&
                acknowledged.current !== media.url
              ) {
                const url = media.url;
                acknowledged.current = url;
                void providers
                  .acknowledgePlayback(url)
                  .then(() =>
                    usePersonalPlayback.setState((state) => ({
                      historyRevision: state.historyRevision + 1,
                    })),
                  )
                  .catch((e) => {
                    if (acknowledged.current === url) acknowledged.current = null;
                    notify(uiError(e));
                  });
              }
            }}
            onLoadedData={() => setLoading(false)}
            onCanPlay={() => setLoading(false)}
            onError={() => {
              if (referenceFixture || (hlsRef.current && ref.current?.error?.code === 3)) return;
              setLoading(false);
              const kind = playbackFailure(undefined, ref.current?.error?.code);
              setFailure(kind);
              setError(playbackFailureCopy[kind].message);
            }}
            aria-label="Kişisel medya oynatıcısı"
          />
          {loading && !error && (
            <div className="ref-media-stage-state" role="status">
              <LoaderCircle size={40} className="spin" />
              <h2>{media.live ? 'Yayın hazırlanıyor' : 'Kaynak hazırlanıyor'}</h2>
              <p>Kişisel kaynağından görüntü bekleniyor.</p>
              <button className="button secondary" onClick={() => setAttempt((value) => value + 1)}>
                <RefreshCw size={15} />
                Yeniden dene
              </button>
            </div>
          )}
          {error && (
            <div className="ref-media-stage-state" role="alert">
              {failure === 'expired' || failure === 'unauthorized' ? (
                <LockKeyhole size={38} />
              ) : (
                <Film size={38} />
              )}
              <h2>{failure ? playbackFailureCopy[failure].title : 'Kaynak şu anda açılamıyor'}</h2>
              <p>{error}</p>
              <div className="ref-media-actions">
                <button
                  className="button primary"
                  onClick={
                    failure === 'expired' || failure === 'unauthorized'
                      ? onBack
                      : () => setAttempt((value) => value + 1)
                  }
                >
                  <RefreshCw size={15} />
                  {failure === 'expired' || failure === 'unauthorized'
                    ? 'Kaynağa dön'
                    : 'Yeniden dene'}
                </button>
                <button className="button secondary" onClick={() => setOptions(true)}>
                  Oynatma seçenekleri
                </button>
              </div>
            </div>
          )}
        </div>
        <div
          className="personal-live-controls"
          aria-label={media.live ? 'Canlı yayın kontrolleri' : 'Oynatma kontrolleri'}
        >
          <input
            type="range"
            className="personal-live-scrubber"
            aria-label={media.live ? 'Canlı yayın zaman aralığı' : 'Oynatma konumu'}
            min={playbackWindow?.start ?? 0}
            max={playbackWindow?.end ?? 1}
            step=".1"
            value={playbackWindow?.position ?? 0}
            disabled={!canSeek || !!error || loading}
            title={
              canSeek
                ? undefined
                : media.live
                  ? 'Kaynak geri sarma aralığı sunmuyor.'
                  : 'Kaynak aranabilir süre bildirmedi.'
            }
            onChange={(event) => seekTo(Number(event.target.value))}
          />
          <div className="personal-live-row">
            <IconButton
              label={playing ? 'Duraklat' : 'Oynat'}
              disabled={!!error || loading}
              onClick={togglePlayback}
            >
              {playing ? <Pause size={20} /> : <Play size={20} />}
            </IconButton>
            {!media.live && (
              <IconButton
                label="10 saniye geri"
                disabled={!canSeek}
                onClick={() => seekTo(currentTime - 10)}
              >
                <ArrowLeft size={18} />
              </IconButton>
            )}
            <Volume2 size={18} />
            <input
              type="range"
              aria-label="Yayın ses düzeyi"
              min="0"
              max="1"
              step=".01"
              value={volume}
              onChange={(event) => setVolume(Number(event.target.value))}
            />
            {media.live ? (
              <>
                <span role="status">
                  {canSeekLive && liveLag > 5 ? `−${Math.floor(liveLag)} sn` : 'CANLI'}
                </span>
                <small>{!loading && !error && !canSeekLive ? 'Geri sarma yok' : ''}</small>
                <button
                  className="personal-live-edge"
                  onClick={returnLive}
                  disabled={!canSeek || !!error}
                  title={canSeek ? 'Yayının sonuna git' : 'Kaynak zaman kaydırma aralığı sunmuyor.'}
                >
                  Canlı
                </button>
              </>
            ) : (
              <>
                <span className="personal-playback-time" aria-live="off">
                  {clock(currentTime)} / {duration ? clock(duration) : '--:--'}
                </span>
                {fixturePersonal && (
                  <span className="personal-playback-badge">
                    <LockKeyhole size={13} />
                    Kişisel oynatma
                  </span>
                )}
              </>
            )}
            <IconButton label="Ses ve altyazı" onClick={() => setOptions(true)}>
              <Settings2 size={20} />
            </IconButton>
            <IconButton
              label="Ekrana aktar"
              disabled
              title="Harici ekrana güvenli aktarım bu sürümde desteklenmiyor."
            >
              <ExternalLink size={18} />
            </IconButton>
            <IconButton
              label={fullscreen ? 'Tam ekrandan çık' : 'Tam ekran'}
              disabled={!document.fullscreenEnabled}
              title={
                !document.fullscreenEnabled ? 'Bu pencerede tam ekran desteklenmiyor.' : undefined
              }
              onClick={toggleFullscreen}
            >
              {fullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
            </IconButton>
          </div>
        </div>
      </div>
      {inset && media.live && (
        <section className="personal-programme-grid" aria-label="Program rehberi">
          {[
            { label: 'ŞİMDİ', programme: currentProgramme },
            { label: 'SONRA', programme: nextProgramme },
          ].map(({ label, programme }) => (
            <article key={label}>
              <small>
                {label}
                {programme && (
                  <>
                    {' '}
                    ·{' '}
                    <time>
                      {programmeClock(programme.startsAt)}–{programmeClock(programme.endsAt)}
                    </time>
                  </>
                )}
              </small>
              <strong>{programme?.title || 'Program bilgisi yok'}</strong>
              {programme?.description && <p>{programme.description}</p>}
            </article>
          ))}
        </section>
      )}
      {referenceCaption && (
        <div className="personal-reference-caption" aria-label="Örnek altyazı">
          “Bazen aynı yere dönmek,
          <br />
          yeni bir yol bulmaktır.”
        </div>
      )}
      {realtime.status === 'connected' && (
        <div className="personal-playback-voice" role="region" aria-label="Ses salonu">
          <div className="personal-playback-avatars">
            {realtime.participants.slice(0, 5).map((person) => (
              <VoiceAvatar key={person.id} id={person.id} name={person.name} />
            ))}
          </div>
          <span className="personal-playback-room">
            <Headphones size={15} />
            {realtime.roomName} · ses açık
          </span>
          <IconButton
            label={!realtime.muted ? 'Mikrofonu kapat' : 'Mikrofonu aç'}
            onClick={() => void toggleMic().catch((e) => notify(uiError(e)))}
          >
            {!realtime.muted ? <Mic size={18} /> : <MicOff size={18} />}
          </IconButton>
        </div>
      )}
      {miniMode && !miniHidden && (
        <MiniPlaybackChrome
          title={media.name}
          personal
          live={media.live}
          playing={playing}
          time={media.live ? 'CANLI' : `${clock(currentTime)} / ${clock(duration)}`}
          compact={miniCompact}
          voiceStatus={realtime.status}
          muted={realtime.muted}
          canControl={!loading && !error}
          controlReason={error || (loading ? 'Kaynak hazırlanıyor.' : undefined)}
          onToggle={togglePlayback}
          onMute={() => void toggleMic().catch((e) => notify(uiError(e)))}
          onReturn={onReturn}
          onCompact={onMiniCompact}
          onHide={onMiniHide}
        />
      )}
      {options && (
        <Modal
          title={
            external
              ? 'Harici oynatıcıda aç?'
              : failure === 'unsupported'
                ? 'Bu format desteklenmiyor'
                : 'Ses ve altyazı'
          }
          onClose={closeOptions}
          className="ref-media-modal playback"
        >
          {external ? (
            <>
              <div className="ref-media-source">
                <span className="ref-media-mark">
                  <ExternalLink size={22} />
                </span>
                <div>
                  <strong>{media.name}</strong>
                  <small>Seçtiğin kişisel kaynak</small>
                </div>
              </div>
              <div className="ref-media-notice warning">
                Bu kişisel kaynak için güvenli harici oynatıcı bağlantısı henüz bulunmuyor. Özel
                adres ve hesap bilgileri uygulamadan çıkarılmaz.
              </div>
              <label className="field-label">
                Oynatıcı
                <select disabled title="Güvenli harici oynatıcı işlemi henüz desteklenmiyor.">
                  <option>Varsayılan video oynatıcı</option>
                </select>
              </label>
              <div className="ref-media-modal-footer">
                <button className="button secondary" onClick={() => setExternal(false)}>
                  Geri
                </button>
                <button
                  className="button primary"
                  disabled
                  title="Güvenli harici oynatıcı işlemi henüz desteklenmiyor."
                >
                  <ExternalLink size={16} />
                  Harici oynatıcıda aç
                </button>
              </div>
            </>
          ) : failure === 'unsupported' ? (
            <>
              <div className="ref-media-notice warning">
                Bu ses veya video biçimi burada oynatılamıyor. Başka bir kaynak seçebilirsin.
              </div>
              <div className="ref-media-source">
                <span className="ref-media-mark">
                  <Film size={22} />
                </span>
                <div>
                  <strong>{media.name}</strong>
                  <small>Görüntü açılamadı.</small>
                </div>
              </div>
              <button className="button secondary full" onClick={onBack}>
                <RefreshCw size={16} />
                Başka kaynak seç
              </button>
              <div className="ref-media-modal-footer">
                <button className="button secondary" onClick={closeOptions}>
                  Kapat
                </button>
                <button className="button primary" onClick={() => setExternal(true)}>
                  <ExternalLink size={16} />
                  Harici oynatıcı seç
                </button>
              </div>
            </>
          ) : (
            <>
              {nativeAvailable && !referenceFixture && (
                <label className="field-label">
                  Oynatıcı
                  <select
                    value={engine}
                    onChange={(event) => {
                      setEngine(event.target.value as 'vlc' | 'web');
                      closeOptions();
                    }}
                  >
                    <option value="vlc">VLC</option>
                    <option value="web">Standart</option>
                  </select>
                </label>
              )}
              <h3>Ses dili</h3>
              {audio.length ? (
                audio.map((track) => (
                  <label className="ref-media-track" key={track.id}>
                    <input
                      type="radio"
                      name="personal-audio"
                      checked={audioId === track.id}
                      onChange={() => setAudioId(track.id)}
                    />
                    {track.label}
                    <small>Kaynakta var</small>
                  </label>
                ))
              ) : (
                <div className="ref-media-notice">
                  Bu kaynak değiştirilebilir ses dili sunmuyor.
                </div>
              )}
              <h3>Altyazı</h3>
              <label className="ref-media-track">
                <input
                  type="radio"
                  name="personal-caption"
                  checked={captionId === -1}
                  onChange={() => setCaptionId(-1)}
                />
                Kapalı
              </label>
              {captions.map((track) => (
                <label className="ref-media-track" key={track.id}>
                  <input
                    type="radio"
                    name="personal-caption"
                    checked={captionId === track.id}
                    onChange={() => setCaptionId(track.id)}
                  />
                  {track.label}
                </label>
              ))}
              {!captions.length && (
                <p className="ref-media-description">Bu kaynak altyazı sunmuyor.</p>
              )}
              <p className="ref-media-footnote">
                <LockKeyhole size={13} />
                Yalnızca bu kaynağın sunduğu ses ve altyazı seçenekleri listelenir.
              </p>
              <div className="ref-media-modal-footer">
                <button className="button secondary" onClick={() => setExternal(true)}>
                  <ExternalLink size={15} />
                  Harici oynatıcı
                </button>
                <button className="button primary" onClick={applyTracks}>
                  <Check size={15} />
                  Tercihleri uygula
                </button>
              </div>
            </>
          )}
        </Modal>
      )}
    </div>
  );
}
