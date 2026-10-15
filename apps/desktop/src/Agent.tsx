import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowDownToLine,
  ArrowRight,
  Bot,
  Check,
  CheckCheck,
  Clock3,
  FileText,
  KeyRound,
  Link2,
  LockKeyhole,
  Bookmark,
  Folder,
  Triangle,
  AlertTriangle,
  ExternalLink,
  LoaderCircle,
  Plus,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
  Square,
  Trash2,
  UserRound,
  X,
} from 'lucide-react';
import { EmptyState, IconButton, Modal, Toggle } from '@rooms/design';
import type {
  AgentAuthoritySnapshot,
  AgentBridge,
  AgentMemory,
  AgentProvider,
  AgentStatus,
  AgentTask,
  ModelConnection,
} from '../../../packages/agent-contracts/src';
import { useCommunity } from './community';
import type { SocialMessage } from '@rooms/social';
import { useRealtime } from './realtime';
import { tr, uiError } from './i18n';
import './reference-agent.css';
import AgentAutomation from './AgentAutomation';
import { ArtifactPreview } from './ArtifactPreview';
import AgentTaskSurface from './AgentTaskSurface';
const DevelopmentTaskEntry = import.meta.env.DEV
  ? lazy(() => import('./dev/AgentTaskEntry'))
  : null;
const DevelopmentConnectionsEntry = import.meta.env.DEV
  ? lazy(() => import('./dev/S59S61Entry'))
  : null;
const DevelopmentSchedulesEntry = import.meta.env.DEV
  ? lazy(() => import('./dev/S62SchedulesEntry'))
  : null;
const taskNames: Record<AgentTask['state'], string> = {
  scheduled: tr('Zamanland\u0131'),
  queued: tr('S\u0131rada'),
  running: tr('\u00C7al\u0131\u015F\u0131yor'),
  'awaiting-approval': 'Onay bekliyor',
  completed: tr('Tamamland\u0131'),
  failed: tr('Ba\u015Far\u0131s\u0131z'),
  cancelled: tr('\u0130ptal edildi'),
  interrupted: 'Kesildi',
};
const date = (value: string) =>
  new Date(value).toLocaleString('tr-TR', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
const reason = uiError;
export function useCurrentRoom() {
  const c = useCommunity();
  const r = useRealtime();
  return c.user ? (r.channelId ?? c.activeChannelId) : null;
}
function LegacyAgentSettings({
  notify,
  view = 'all',
}: {
  view?: 'all' | 'models' | 'automation';
  notify(message: string): void;
}) {
  const closeModel = useCallback(() => {
    setShow(false);
    setKey('');
  }, []);
  const [status, setStatus] = useState<AgentStatus | null>(null),
    [models, setModels] = useState<ModelConnection[]>([]),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [url, setUrl] = useState(''),
    [token, setToken] = useState(''),
    [show, setShow] = useState(false),
    [provider, setProvider] = useState<AgentProvider>('openrouter'),
    [label, setLabel] = useState(''),
    [model, setModel] = useState(''),
    [key, setKey] = useState('');
  const refresh = useCallback(async () => {
    if (!window.rooms?.agent) return;
    try {
      const s = await window.rooms.agent.status();
      setStatus(s);
      setModels(
        s.connected
          ? (await window.rooms.agent.connections()).filter((m) => m.ownerId === s.userId)
          : [],
      );
    } catch (e) {
      setError(reason(e));
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  const run = async (work: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try {
      await work();
      await refresh();
    } catch (e) {
      setError(reason(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className={`agent-settings reference-agent-settings view-${view}`}>
      <span className="reference-agent-kicker">KİŞİSEL</span>
      <h2>{view === 'automation' ? 'Otomasyon modu' : 'Model bağlantılarım'}</h2>
      <p className="reference-agent-description">
        Görevlerin, başlatırken seçtiğin kişisel bağlantıyla çalışır.
      </p>
      <div className="service-status">
        <span className={`service-orb ${status?.connected ? 'online' : ''}`}>
          <Bot size={24} />
        </span>
        <div>
          <strong>
            {status?.connected
              ? tr('Ayr\u0131 sunucuya ba\u011Fl\u0131')
              : tr('Agent sunucusu ba\u011Fl\u0131 de\u011Fil')}
          </strong>
          <p>
            {(status?.reason ? uiError(status.reason) : undefined) ??
              tr('G\u00F6revler yaln\u0131zca ayr\u0131 sunucuda \u00E7al\u0131\u015F\u0131r.')}
          </p>
        </div>
        <IconButton label="Durumu yenile" onClick={() => void refresh()}>
          <RefreshCw size={16} />
        </IconButton>
      </div>
      <form
        className="service-form"
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            await window.rooms?.agent.configure({ url: url.trim(), token });
            setUrl('');
            setToken('');
            notify(tr('Agent sunucusu kaydedildi. Ba\u011Flant\u0131 do\u011Frulan\u0131yor.'));
          });
        }}
      >
        <label className="field-label">
          {tr('AGENT SUNUCUSU')}
          <input
            type="url"
            required
            placeholder="https://agent.example.com"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            autoComplete="off"
          />
        </label>
        <label className="field-label">
          {tr('K\u0130\u015E\u0130SEL AGENT ER\u0130\u015E\u0130M ANAHTARI')}
          <input
            type="password"
            required
            value={token}
            onChange={(e) => setToken(e.target.value)}
            autoComplete="new-password"
            placeholder={tr('Sunucudan ald\u0131\u011F\u0131n eri\u015Fim anahtar\u0131')}
          />
        </label>
        <button
          className="button secondary"
          disabled={busy || !window.rooms || !url.trim() || !token}
        >
          <Link2 size={15} />
          {tr('Sunucuya ba\u011Flan')}
        </button>
      </form>
      <div className="section-heading">
        <div>
          <h3>{'Model ba\u011Flant\u0131s\u0131'}</h3>
          <span>{''}</span>
        </div>
        <button
          className="text-button"
          disabled={!status?.connected || busy}
          title={!status?.connected ? tr('\u00D6nce agent sunucusuna ba\u011Flan') : ''}
          onClick={() => setShow(true)}
        >
          <Plus size={15} />
          {tr('Ba\u011Flant\u0131 ekle')}
        </button>
      </div>
      <div className="model-list">
        {models.map((m) => (
          <div className="model-row" key={m.id}>
            <span className={`model-mark ${m.provider}`}>
              {m.provider === 'openrouter' ? <Sparkles size={18} /> : <Bot size={18} />}
            </span>
            <div>
              <strong>{m.label}</strong>
              <small>
                {m.provider === 'codex'
                  ? 'Codex'
                  : m.provider === 'claude'
                    ? 'Claude'
                    : 'OpenRouter'}{' '}
                · {m.model}
              </small>
              <p>
                {(m.reason ? uiError(m.reason) : undefined) ??
                  (m.status === 'connected'
                    ? tr(
                        'Ba\u011Flant\u0131 kaydedildi. Model eri\u015Fimi g\u00F6rev s\u0131ras\u0131nda do\u011Frulan\u0131r.',
                      )
                    : m.status === 'login-required'
                      ? tr(
                          'Ayr\u0131 sunucuda resm\u00EE oturum a\u00E7\u0131lmas\u0131 gerekiyor.',
                        )
                      : tr('\u015Eu anda kullan\u0131lam\u0131yor.'))}
              </p>
            </div>
            <span className={`small-tag ${m.status === 'connected' ? 'real-tag' : ''}`}>
              {m.status === 'connected'
                ? 'HAZIR'
                : m.status === 'login-required'
                  ? tr('G\u0130R\u0130\u015E GEREKL\u0130')
                  : 'KULLANILAMIYOR'}
            </span>
            <IconButton
              label={`${m.label} bağlantısını kaldır`}
              disabled={busy}
              onClick={() => void run(() => window.rooms!.agent.disconnectModel(m.id))}
            >
              <Trash2 size={15} />
            </IconButton>
          </div>
        ))}
        {!models.length && (
          <div className="inline-empty">
            <KeyRound size={25} />
            <p>{tr('Hen\u00FCz ki\u015Fisel model ba\u011Flant\u0131n yok.')}</p>
            <span>
              {tr(
                'OpenRouter anahtar\u0131nla veya sunucudaki Codex / Claude oturumunla ba\u011Flan.',
              )}
            </span>
          </div>
        )}
      </div>
      {error && (
        <div className="error-pane" role="alert">
          {error}
        </div>
      )}
      {show && (
        <Modal title="Model bağlantısı ekle" onClose={closeModel}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                await window.rooms!.agent.connectModel({
                  provider,
                  label: label.trim() || provider,
                  model: model.trim(),
                  ...(provider === 'openrouter' ? { apiKey: key } : {}),
                });
                setShow(false);
                setKey('');
                setModel('');
                setLabel('');
              });
            }}
          >
            <div className="segmented">
              {(['openrouter', 'codex', 'claude'] as const).map((p) => (
                <button
                  type="button"
                  key={p}
                  className={provider === p ? 'selected' : ''}
                  onClick={() => {
                    setProvider(p);
                    setKey('');
                  }}
                >
                  {p === 'openrouter' ? 'OpenRouter' : p === 'codex' ? 'Codex' : 'Claude'}
                </button>
              ))}
            </div>
            <label className="field-label">
              {tr('BA\u011ELANTI ADI')}
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder={tr('Ki\u015Fisel modelim')}
                maxLength={80}
              />
            </label>
            <label className="field-label">
              {tr('MODEL')}
              <input
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder={
                  provider === 'openrouter'
                    ? tr('sa\u011Flay\u0131c\u0131/model')
                    : tr('Sunucudaki resm\u00EE model ad\u0131')
                }
                required
                maxLength={120}
              />
            </label>
            {provider === 'openrouter' ? (
              <label className="field-label">
                {tr('K\u0130\u015E\u0130SEL API ANAHTARI')}
                <input
                  type="password"
                  autoComplete="new-password"
                  required
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  placeholder={tr('Anahtar\u0131n\u0131 yap\u0131\u015Ft\u0131r')}
                />
              </label>
            ) : (
              <div className="settings-note">
                <KeyRound size={19} />
                <p>
                  {provider === 'codex' ? 'Codex' : 'Claude'}
                  {tr(
                    'ba\u011Flant\u0131s\u0131 ayr\u0131 sunucudaki resm\u00EE CLI oturumunu kullan\u0131r. ROOMS, ChatGPT veya Claude parolan\u0131 istemez.',
                  )}
                </p>
              </div>
            )}
            <button
              className="button primary full"
              disabled={busy || !model.trim() || (provider === 'openrouter' && !key)}
            >
              {busy ? <LoaderCircle size={16} className="spin" /> : <Plus size={16} />}
              {tr('Ba\u011Flant\u0131y\u0131 ekle')}
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}
export default function AgentWorkspace({ notify }: { notify(message: string): void }) {
  const community = useCommunity();
  if (
    DevelopmentConnectionsEntry &&
    /^S(59|60|61)$/.test(new URLSearchParams(window.location.search).get('fixture') || '')
  )
    return (
      <Suspense fallback={<div role="status">Bağlantılar hazırlanıyor…</div>}>
        <DevelopmentConnectionsEntry />
      </Suspense>
    );
  if (
    DevelopmentSchedulesEntry &&
    new URLSearchParams(window.location.search).get('fixture') === 'S62'
  )
    return (
      <Suspense fallback={<div role="status">Görev görünümü hazırlanıyor…</div>}>
        <DevelopmentSchedulesEntry />
      </Suspense>
    );
  if (
    DevelopmentTaskEntry &&
    /^S5[678]$/.test(new URLSearchParams(window.location.search).get('fixture') || '')
  )
    return (
      <Suspense fallback={<div role="status">Görev görünümü hazırlanıyor…</div>}>
        <DevelopmentTaskEntry notify={notify} />
      </Suspense>
    );
  return (
    <AgentWorkspaceScope
      key={`${community.user?.id || ''}:${community.serverUrl}:${community.status}`}
      notify={notify}
    />
  );
}
export type AgentReferenceSettingsView = 'models' | 'connections' | 'memory' | 'schedules';
export function AgentReferenceSettingsContent({ view }: { view: AgentReferenceSettingsView }) {
  const fixture = import.meta.env.DEV
    ? document.documentElement.dataset.referenceFixture?.split('/')[0]
    : undefined;
  if (DevelopmentConnectionsEntry && /^S(59|60|61)$/.test(fixture || ''))
    return (
      <Suspense fallback={<div role="status">Bağlantılar hazırlanıyor…</div>}>
        <DevelopmentConnectionsEntry />
      </Suspense>
    );
  if (DevelopmentSchedulesEntry && fixture === 'S62')
    return (
      <Suspense fallback={<div role="status">Görev görünümü hazırlanıyor…</div>}>
        <DevelopmentSchedulesEntry />
      </Suspense>
    );
  return (
    <AgentWorkspaceScope
      key={`settings:${view}`}
      notify={() => {}}
      initialTab={view}
      settingsSurface
    />
  );
}
function AgentWorkspaceScope({
  notify,
  initialTab,
  settingsSurface = false,
}: {
  notify(message: string): void;
  initialTab?: AgentReferenceSettingsView;
  settingsSurface?: boolean;
}) {
  const community = useCommunity();
  const roomId = useCurrentRoom(),
    navigate = useNavigate(),
    location = useLocation();
  type AgentTab = 'tasks' | 'memory' | 'schedules' | 'models' | 'connections' | 'automation';
  const query = new URLSearchParams(location.search);
  const requestedTab = query.get('tab');
  const currentTab: AgentTab =
    initialTab ??
    (['memory', 'schedules', 'models', 'connections', 'automation'].includes(requestedTab ?? '')
      ? (requestedTab as AgentTab)
      : 'tasks');
  const [previewArtifactId, setPreviewArtifactId] = useState<string | null>(null);
  useEffect(() => setPreviewArtifactId(null), [roomId, location.search]);
  const [confirmCancel, setConfirmCancel] = useState<AgentTask | null>(null);
  const closeCancel = useCallback(() => setConfirmCancel(null), []);
  const scope = useRef(roomId);
  scope.current = roomId;
  const refreshSequence = useRef(0);
  const [loading, setLoading] = useState(true);
  const [accessRevision, setAccessRevision] = useState(0);
  const changeTab = (next: AgentTab) => navigate(`/agent?tab=${next}`);
  const [status, setStatus] = useState<AgentStatus | null>(null),
    [tasks, setTasks] = useState<AgentTask[]>([]),
    [models, setModels] = useState<ModelConnection[]>([]),
    [memories, setMemories] = useState<AgentMemory[]>([]),
    [selected, setSelected] = useState<string | null>(null),
    [tab, setTab] = useState<AgentTab>(currentTab),
    [prompt, setPrompt] = useState(''),
    [modelId, setModelId] = useState(''),
    [scheduled, setScheduled] = useState(false),
    [runAt, setRunAt] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [verifiedResult, setVerifiedResult] = useState(''),
    [notApplied, setNotApplied] = useState(false);
  useEffect(() => {
    setTab(currentTab);
    setScheduled(currentTab === 'schedules');
    if (query.get('task')) setSelected(query.get('task'));
  }, [location.search]);
  const refresh = useCallback(async () => {
    const request = ++refreshSequence.current;
    if (!window.rooms?.agent) {
      setLoading(false);
      return;
    }
    try {
      const next = await window.rooms.agent.status();
      if (scope.current !== roomId || request !== refreshSequence.current) return;
      setStatus(next);
      if (!next.connected || next.userId !== community.user?.id || !roomId) {
        setTasks([]);
        setModels([]);
        setModelId('');
        setMemories([]);
        return;
      }
      const [jobs, connections, notes] = await Promise.all([
        window.rooms.agent.tasks(roomId),
        window.rooms.agent.connections(),
        window.rooms.agent.memory(roomId),
      ]);
      if (scope.current !== roomId || request !== refreshSequence.current) return;
      setTasks(jobs.filter((t) => t.roomId === roomId));
      setModels(connections.filter((m) => m.ownerId === next.userId));
      setMemories(notes.filter((n) => n.roomId === roomId));
      setModelId((id) =>
        connections.some((m) => m.id === id && m.ownerId === next.userId) ? id : '',
      );
      setSelected((id) => (jobs.some((t) => t.id === id && t.roomId === roomId) ? id : null));
    } catch (e) {
      if (scope.current === roomId && request === refreshSequence.current) {
        setError(reason(e));
        setTasks([]);
        setMemories([]);
        setModels([]);
      }
    } finally {
      if (scope.current === roomId && request === refreshSequence.current) setLoading(false);
    }
  }, [roomId, community.user?.id, community.serverUrl]);
  useEffect(() => {
    setError('');
    setLoading(true);
    setTasks([]);
    setMemories([]);
    setModels([]);
    setSelected(new URLSearchParams(location.search).get('task'));
    setModelId('');
    setPrompt('');
    setConfirmCancel(null);
    void refresh();
    const timer = setInterval(() => {
      if (!document.hidden) void refresh();
    }, 4000);
    return () => {
      clearInterval(timer);
      refreshSequence.current++;
    };
  }, [refresh]);
  useEffect(() => {
    const invalidate = () => {
      refreshSequence.current++;
      setTasks([]);
      setMemories([]);
      setModels([]);
      setStatus(null);
      setLoading(true);
      setAccessRevision((value) => value + 1);
      void refresh();
    };
    window.addEventListener('rooms:community-management-invalidated', invalidate);
    window.addEventListener('rooms:channel-access-invalidated', invalidate);
    return () => {
      window.removeEventListener('rooms:community-management-invalidated', invalidate);
      window.removeEventListener('rooms:channel-access-invalidated', invalidate);
    };
  }, [refresh]);
  const run = async (work: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try {
      await work();
      await refresh();
    } catch (e) {
      setError(reason(e));
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    setVerifiedResult('');
    setNotApplied(false);
  }, [selected]);
  useEffect(() => {
    const choice = new URLSearchParams(location.search).get('model');
    if (
      choice &&
      currentTab === 'tasks' &&
      models.some(
        (item) =>
          item.id === choice && item.ownerId === community.user?.id && item.status === 'connected',
      )
    )
      setModelId(choice);
  }, [location.search, models, community.user?.id]);
  const active = tasks.find(
    (t) => t.roomId === roomId && t.id === selected && (tab !== 'schedules' || !!t.runAt),
  );
  const ready = !!roomId && !!status?.connected && status.userId === community.user?.id;
  const roomTasks = tasks.filter((t) => t.roomId === roomId);
  const visibleTasks = tab === 'schedules' ? roomTasks.filter((t) => !!t.runAt) : roomTasks;
  const connectedModels = models.filter((m) => m.status === 'connected');
  if (settingsSurface) {
    if (tab === 'models') return <AgentModelsContainer />;
    if (tab === 'connections') return <AgentConnectionsContainer />;
    if (tab === 'memory')
      return (
        <AgentMemorySurface
          key={`${community.user?.id}:${community.serverUrl}:${roomId}:${accessRevision}`}
          memories={memories}
          userId={community.user?.id || ''}
          roomId={roomId || ''}
          roomName={
            community.spaces.find((space) => space.id === community.activeSpaceId)?.name ||
            'Topluluk'
          }
          channelName={community.channels.find((channel) => channel.id === roomId)?.name || 'Oda'}
          ready={ready}
          loading={loading}
          unavailableReason={
            error ||
            status?.reason ||
            (!roomId ? 'Önce bir oda seç.' : 'Agent sunucusu bağlı değil.')
          }
          bridge={window.rooms?.agent}
          onRefresh={refresh}
          sourceCandidates={
            community.activeChannelId === roomId
              ? community.messages.filter(
                  (message) => !message.delivery || message.delivery === 'sent',
                )
              : []
          }
          loadSource={
            window.rooms?.social
              ? async (id) => {
                  const permissions = await window.rooms!.social.channelPermissions(roomId!);
                  if (permissions.access !== 'allowed' || !permissions.effective?.view)
                    throw new Error('Kaynak erişimi kaldırıldı.');
                  const messages = await window.rooms!.social.messages(roomId!);
                  return (
                    messages.find((message) => message.id === id && message.channelId === roomId) ||
                    null
                  );
                }
              : undefined
          }
        />
      );
    if (tab === 'schedules')
      return (
        <AgentSchedulesSurface
          key={`${community.user?.id}:${community.serverUrl}:${roomId}:${accessRevision}`}
          tasks={roomTasks}
          models={models}
          userId={community.user?.id || ''}
          roomId={roomId || ''}
          roomName={
            community.spaces.find((space) => space.id === community.activeSpaceId)?.name ||
            'Topluluk'
          }
          channelName={community.channels.find((channel) => channel.id === roomId)?.name || 'Oda'}
          ready={ready}
          loading={loading}
          unavailableReason={
            error ||
            status?.reason ||
            (!roomId ? 'Önce bir oda seç.' : 'Agent sunucusu bağlı değil.')
          }
          canManage={status?.canManage === true}
          bridge={window.rooms?.agent}
          onRefresh={refresh}
          settingsMode
        />
      );
  }
  if (tab === 'memory')
    return (
      <AgentMemorySurface
        key={`${community.user?.id}:${community.serverUrl}:${roomId}:${accessRevision}`}
        memories={memories}
        userId={community.user?.id || ''}
        roomId={roomId || ''}
        roomName={
          community.spaces.find((space) => space.id === community.activeSpaceId)?.name || 'Topluluk'
        }
        channelName={community.channels.find((channel) => channel.id === roomId)?.name || 'Oda'}
        ready={ready}
        loading={loading}
        unavailableReason={
          error || status?.reason || (!roomId ? 'Önce bir oda seç.' : 'Agent sunucusu bağlı değil.')
        }
        bridge={window.rooms?.agent}
        onRefresh={refresh}
        sourceCandidates={
          community.activeChannelId === roomId
            ? community.messages.filter(
                (message) => !message.delivery || message.delivery === 'sent',
              )
            : []
        }
        loadSource={
          window.rooms?.social
            ? async (id) => {
                const permissions = await window.rooms!.social.channelPermissions(roomId!);
                if (permissions.access !== 'allowed' || !permissions.effective?.view)
                  throw new Error('Kaynak erişimi kaldırıldı.');
                const messages = await window.rooms!.social.messages(roomId!);
                return (
                  messages.find((message) => message.id === id && message.channelId === roomId) ||
                  null
                );
              }
            : undefined
        }
      />
    );
  if (tab === 'connections') return <AgentConnectionsContainer />;
  if (tab === 'schedules')
    return (
      <AgentSchedulesSurface
        key={`${community.user?.id}:${community.serverUrl}:${roomId}:${accessRevision}`}
        tasks={roomTasks}
        models={models}
        userId={community.user?.id || ''}
        roomId={roomId || ''}
        roomName={
          community.spaces.find((space) => space.id === community.activeSpaceId)?.name || 'Topluluk'
        }
        channelName={community.channels.find((channel) => channel.id === roomId)?.name || 'Oda'}
        ready={ready}
        loading={loading}
        unavailableReason={
          error || status?.reason || (!roomId ? 'Önce bir oda seç.' : 'Agent sunucusu bağlı değil.')
        }
        canManage={status?.canManage === true}
        bridge={window.rooms?.agent}
        onRefresh={refresh}
      />
    );
  if (active && ready && query.get('task') === active.id && window.rooms?.agent)
    return (
      <AgentTaskSurface
        task={active}
        models={models}
        userId={status!.userId!}
        roomName={`${community.channels.find((channel) => channel.id === roomId)?.name || 'Oda'} · ${community.spaces.find((space) => space.id === community.activeSpaceId)?.name || 'Topluluk'}`}
        bridge={window.rooms.agent}
        connected={ready}
        canManage={status?.canManage === true}
        scopeKey={`${community.user?.id}:${community.serverUrl}:${community.status}:${accessRevision}`}
        notify={notify}
        onReturn={() => navigate('/agent?tab=tasks')}
        onRefresh={refresh}
        view={query.get('view') === 'result' ? 'result' : 'task'}
        onManageConnection={() => navigate('/agent?tab=models')}
        onHistory={() => navigate('/settings?tab=assistant-permissions&view=history')}
      />
    );
  return (
    <div className="agent-page reference-agent page-enter" data-tab={tab}>
      <div className="page-intro">
        <div>
          <span className="reference-agent-kicker">
            {tab === 'models' ? 'KİŞİSEL' : 'ODA ASİSTANI'}
          </span>
          <h2>
            {tab === 'models'
              ? 'Model bağlantılarım'
              : tab === 'automation'
                ? 'Otomasyon modu'
                : 'Oda asistanı'}
          </h2>
          <p className="reference-agent-description">
            {status?.executionHost === 'shared-rootless'
              ? 'Görevler sunucudaki izole çalışma alanında çalışır.'
              : 'Görevler ayrı Agent sunucusunda çalışır.'}
          </p>
        </div>
        <button className="button secondary small" onClick={() => navigate('/settings?tab=agent')}>
          <Bot size={16} />
          Agent ayarları
        </button>
      </div>
      <nav className="reference-agent-tabs" aria-label="Asistan bölümleri">
        {(
          [
            ['tasks', 'Görevler'],
            ['memory', 'Oda hafızası'],
            ['schedules', 'Tek seferlik görevler'],
            ['models', 'Model bağlantılarım'],
            ['connections', 'Bağlı uygulamalar'],
            ['automation', 'Otomasyon modu'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            aria-current={tab === value ? 'page' : undefined}
            onClick={() => changeTab(value)}
          >
            {label}
          </button>
        ))}
      </nav>
      {tab === 'models' || tab === 'automation' ? (
        <AgentSettings notify={notify} view={tab === 'automation' ? 'automation' : 'models'} />
      ) : (
        <>
          {!ready ? (
            <div className="agent-unavailable">
              <EmptyState
                icon={<Bot size={34} />}
                title={
                  loading
                    ? 'Bağlantı kontrol ediliyor'
                    : !roomId
                      ? 'Önce bir oda seç'
                      : 'Agent sunucusu bağlı değil'
                }
              >
                {!roomId
                  ? tr(
                      'Agent g\u00F6revleri bir topluluk odas\u0131na aittir. Giri\u015F yap ve sohbet ya da ses odas\u0131 se\u00E7.',
                    )
                  : ((status?.reason ? uiError(status.reason) : undefined) ??
                    tr(
                      'Ayr\u0131 agent sunucusuna ba\u011Fland\u0131ktan sonra burada ger\u00E7ek g\u00F6revler olu\u015Fturabilirsin.',
                    ))}
                <button
                  className="button primary"
                  onClick={() =>
                    navigate(!roomId ? '/settings?tab=connections' : '/settings?tab=agent')
                  }
                >
                  {!roomId
                    ? tr('Toplulu\u011Fa ba\u011Flan')
                    : tr('Agent ba\u011Flant\u0131s\u0131n\u0131 kur')}
                  <ArrowRight size={16} />
                </button>
              </EmptyState>
            </div>
          ) : (
            <>
              <div className="agent-workbench">
                <form
                  className="agent-composer"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!roomId || !modelId || busy) return;
                    if (
                      scheduled &&
                      (!Number.isFinite(Date.parse(runAt)) ||
                        Date.parse(runAt) <= Date.now() ||
                        Date.parse(runAt) > Date.now() + 365 * 86400000)
                    ) {
                      setError('Gelecek bir yıl içinde geçerli tarih ve saat seç.');
                      return;
                    }
                    void run(async () => {
                      const t = await window.rooms!.agent.submit({
                        roomId,
                        prompt: prompt.trim(),
                        modelConnectionId: modelId,
                        ...(scheduled ? { runAt: new Date(runAt).toISOString() } : {}),
                      });
                      setSelected(t.id);
                      setPrompt('');
                      setRunAt('');
                      setScheduled(false);
                      navigate(`/agent?tab=tasks&task=${encodeURIComponent(t.id)}`);
                    });
                  }}
                >
                  <label htmlFor="agent-prompt" className="eyebrow">
                    {'G\u00D6REV'}
                  </label>
                  <textarea
                    id="agent-prompt"
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    maxLength={16000}
                    rows={3}
                    placeholder={'G\u00F6rev yaz\u2026'}
                    required
                  />
                  <div className="agent-composer-controls">
                    <select
                      aria-label={tr('G\u00F6rev modeli')}
                      required
                      value={modelId}
                      onChange={(e) => setModelId(e.target.value)}
                    >
                      <option value="">{tr('Model se\u00E7')}</option>
                      {connectedModels.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.label} · {m.model}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className={`button subtle small ${scheduled ? 'selected' : ''}`}
                      onClick={() => setScheduled((v) => !v)}
                    >
                      <Clock3 size={15} />
                      {scheduled ? tr('Zamanlanm\u0131\u015F') : 'Daha sonra'}
                    </button>
                    <button
                      className="button primary small"
                      disabled={busy || !prompt.trim() || !modelId || (scheduled && !runAt)}
                    >
                      {busy ? <LoaderCircle size={15} className="spin" /> : <Send size={15} />}
                      {tr('G\u00F6revi g\u00F6nder')}
                    </button>
                  </div>
                  {scheduled && (
                    <label className="schedule-row">
                      {tr('Bir kez \u00E7al\u0131\u015Ft\u0131r')}
                      <input
                        type="datetime-local"
                        required
                        min={new Date(Date.now() + 60000)
                          .toLocaleString('sv-SE')
                          .replace(' ', 'T')
                          .slice(0, 16)}
                        value={runAt}
                        onChange={(e) => setRunAt(e.target.value)}
                      />
                      <span>{Intl.DateTimeFormat().resolvedOptions().timeZone}</span>
                    </label>
                  )}
                  {!connectedModels.length && (
                    <p className="inline-help">
                      {tr('Haz\u0131r model yok.')}
                      <button
                        type="button"
                        className="text-button"
                        onClick={() => navigate('/settings?tab=agent')}
                      >
                        {tr('Kendi modelini ba\u011Fla')}
                      </button>
                    </p>
                  )}
                </form>
                <div className="agent-subnav">
                  <div className="segmented small">
                    <button
                      className={tab === 'tasks' ? 'selected' : ''}
                      onClick={() => changeTab('tasks')}
                    >
                      {tr('G\u00F6revler')}
                      <span>{tasks.length}</span>
                    </button>
                    <button className="" onClick={() => changeTab('memory')}>
                      {tr('Oda haf\u0131zas\u0131')}
                      <span>{memories.length}</span>
                    </button>
                  </div>
                  <IconButton
                    label={tr('G\u00F6revleri yenile')}
                    disabled={busy}
                    onClick={() => void refresh()}
                  >
                    <RefreshCw size={16} />
                  </IconButton>
                </div>
                {visibleTasks.length ? (
                  <div className="agent-task-layout">
                    <div className="task-list">
                      {visibleTasks.map((task) => (
                        <button
                          className={`task-item ${selected === task.id ? 'selected' : ''}`}
                          key={task.id}
                          onClick={() => {
                            setSelected(task.id);
                            setPreviewArtifactId(null);
                            navigate(`/agent?task=${encodeURIComponent(task.id)}`);
                          }}
                        >
                          <span className={`task-status-icon ${task.state}`}>
                            {task.state === 'completed' ? (
                              <CheckCheck size={17} />
                            ) : task.state === 'running' ? (
                              <LoaderCircle size={17} className="spin" />
                            ) : task.state === 'scheduled' ? (
                              <Clock3 size={17} />
                            ) : (
                              <Bot size={17} />
                            )}
                          </span>
                          <div>
                            <strong>{task.prompt}</strong>
                            <small>
                              {task.kind === 'reminder' ? tr('Hatırlatma') + ' · ' : ''}
                              {taskNames[task.state]} · {date(task.runAt ?? task.createdAt)}
                            </small>
                          </div>
                          <ArrowRight size={14} />
                        </button>
                      ))}
                    </div>
                    {active && (
                      <article className="task-detail">
                        <div className="task-detail-heading">
                          <span className={`task-state ${active.state}`}>
                            {taskNames[active.state]}
                          </span>
                          <span>{date(active.createdAt)}</span>
                        </div>
                        <span className="reference-agent-kicker">ODA GÖREVİ</span>
                        <h3>{active.prompt}</h3>
                        <dl className="reference-agent-metadata">
                          <div>
                            <dt>Başlatan</dt>
                            <dd>{active.ownerId === status?.userId ? 'Sen' : active.ownerId}</dd>
                          </div>
                          <div>
                            <dt>Kişisel bağlantı</dt>
                            <dd>
                              {models.find((m) => m.id === active.modelConnectionId)?.label ??
                                (active.kind === 'reminder'
                                  ? 'Model gerektirmez'
                                  : 'Başlatanın kişisel bağlantısı')}
                            </dd>
                          </div>
                          <div>
                            <dt>Oda</dt>
                            <dd>{active.roomId}</dd>
                          </div>
                        </dl>
                        {active.state === 'cancelled' && (
                          <p className="reference-agent-callout">
                            Görev durduruldu. Tamamlanmış dış işlemler geri alınmaz.
                          </p>
                        )}
                        {active.kind === 'reminder' && (
                          <p className="inline-help">
                            <Clock3 size={14} />
                            {tr(
                              'Kaynak sohbete tek seferlik hatırlatma. Model bağlantısı gerektirmez.',
                            )}
                          </p>
                        )}
                        {active.progress.length > 0 && (
                          <ol className="task-progress">
                            {active.progress.map((p, i) => (
                              <li key={i}>
                                <span />
                                {p}
                              </li>
                            ))}
                          </ol>
                        )}
                        {active.result && (
                          <div className="task-result">
                            <span className="eyebrow">{tr('SONU\u00C7')}</span>
                            <p>{active.result}</p>
                          </div>
                        )}
                        {active.error && (
                          <>
                            <div className="error-pane">{uiError(active.error)}</div>
                            <button
                              className="button secondary small"
                              onClick={() => {
                                setPrompt(active.prompt);
                                setModelId('');
                                changeTab('tasks');
                                document.getElementById('agent-prompt')?.focus();
                              }}
                            >
                              Yeni görev için isteği kullan
                            </button>
                            <p className="inline-help">
                              Model bağlantını seçip yeni görevi açıkça gönder. Önce dış işlem
                              sonucunu kontrol et.
                            </p>
                          </>
                        )}
                        {active.state === 'completed' && !active.artifacts.length && (
                          <p className="inline-help">Bu görev dosya oluşturmadı.</p>
                        )}
                        {active.artifacts.length > 0 && (
                          <p className="inline-help">
                            Kaynak mesaj listesi bu hizmette sunulmuyor.
                          </p>
                        )}
                        {active.artifacts.map((a) => (
                          <div className="artifact-item" key={a.id}>
                            <FileText size={20} />
                            <span>
                              <strong>{a.name}</strong>
                              <small>{(a.size / 1024).toFixed(1)} KB</small>
                            </span>
                            <button
                              className="text-button"
                              disabled={!window.rooms?.agent.previewArtifact}
                              onClick={() => setPreviewArtifactId(a.id)}
                            >
                              Önizle
                            </button>
                            <IconButton
                              label={`${a.name} dosyasını indir`}
                              disabled={busy}
                              onClick={() =>
                                void run(async () =>
                                  notify(
                                    (await window.rooms!.agent.downloadArtifact(active.id, a.id))
                                      ? 'Dosya kaydedildi.'
                                      : 'Kaydetme iptal edildi.',
                                  ),
                                )
                              }
                            >
                              <ArrowDownToLine size={18} />
                            </IconButton>
                          </div>
                        ))}
                        {previewArtifactId &&
                          active.artifacts.some((a) => a.id === previewArtifactId) && (
                            <ArtifactPreview
                              taskId={active.id}
                              artifactId={previewArtifactId}
                              onClose={() => setPreviewArtifactId(null)}
                              notify={notify}
                            />
                          )}
                        {active.state === 'interrupted' && active.uncertainOperation && (
                          <div className="approval-preview">
                            <span className="eyebrow">{tr('İŞLEM SONUCU BELİRSİZ')}</span>
                            <h4>{active.uncertainOperation.description}</h4>
                            <small>{active.uncertainOperation.tool}</small>
                            <pre>{active.uncertainOperation.preview}</pre>
                            <p>
                              {tr(
                                'İşlem dış hizmette uygulanmış olabilir. Devam etmeden önce ilgili hizmetten sonucu kontrol et.',
                              )}
                            </p>
                            <label className="field-label">
                              {tr('DOĞRULADIĞIN SONUÇ')}
                              <textarea
                                value={verifiedResult}
                                onChange={(e) => setVerifiedResult(e.target.value)}
                                maxLength={12000}
                                placeholder={tr('Dış hizmette gördüğün sonucu buraya yaz…')}
                              />
                            </label>
                            <button
                              className="button secondary small"
                              disabled={busy || !verifiedResult.trim()}
                              onClick={() =>
                                void run(() =>
                                  window.rooms!.agent.resolveOperation(active.id, {
                                    operationId: active.uncertainOperation!.operationId,
                                    resolution: 'record-result',
                                    result: verifiedResult.trim(),
                                  }),
                                )
                              }
                            >
                              {tr('Doğrulanmış sonuçla devam et')}
                            </button>
                            <label className="recovery-confirm">
                              <input
                                type="checkbox"
                                checked={notApplied}
                                onChange={(e) => setNotApplied(e.target.checked)}
                              />
                              {tr('Dış hizmeti kontrol ettim; bu işlem uygulanmadı.')}
                            </label>
                            <button
                              className="button secondary small"
                              disabled={busy || !notApplied}
                              onClick={() =>
                                void run(() =>
                                  window.rooms!.agent.resolveOperation(active.id, {
                                    operationId: active.uncertainOperation!.operationId,
                                    resolution: 'confirm-not-applied',
                                  }),
                                )
                              }
                            >
                              {tr('Uygulanmadığını onayla ve devam et')}
                            </button>
                          </div>
                        )}
                        <div className="button-row">
                          {active.state === 'awaiting-approval' && active.pendingApproval && (
                            <div className="approval-preview">
                              <span className="eyebrow">{tr('ONAYIN BEKLEN\u0130YOR')}</span>
                              <h4>{active.pendingApproval.description}</h4>
                              <small>{active.pendingApproval.tool}</small>
                              <pre>
                                {typeof active.pendingApproval.preview === 'string'
                                  ? active.pendingApproval.preview
                                  : JSON.stringify(active.pendingApproval.preview, null, 2)}
                              </pre>
                              <p>
                                {tr(
                                  'Devam etti\u011Finde yukar\u0131daki somut i\u015Flem, mevcut sunucu izinleriyle \u00E7al\u0131\u015Ft\u0131r\u0131l\u0131r.',
                                )}
                              </p>
                            </div>
                          )}
                          {active.state === 'awaiting-approval' && (
                            <button
                              className="button primary small"
                              disabled={busy}
                              title="Onay yetkisini Agent sunucusu doğrular."
                              onClick={() => void run(() => window.rooms!.agent.approve(active.id))}
                            >
                              <Check size={15} />
                              {tr('G\u00F6reve devam et')}
                            </button>
                          )}
                          {[
                            'queued',
                            'scheduled',
                            'running',
                            'awaiting-approval',
                            'interrupted',
                          ].includes(active.state) && (
                            <button
                              className="button secondary small"
                              disabled={busy}
                              onClick={() => setConfirmCancel(active)}
                            >
                              <Square size={13} />
                              {active.kind === 'reminder'
                                ? tr('Hatırlatmayı iptal et')
                                : tr('G\u00F6revi iptal et')}
                            </button>
                          )}
                        </div>
                      </article>
                    )}
                  </div>
                ) : (
                  <div className="inline-empty">
                    <Sparkles size={28} />
                    <h3>{'Henüz görev yok'}</h3>
                  </div>
                )}
              </div>
            </>
          )}
          {error && (
            <div className="error-pane" role="alert">
              {error}
            </div>
          )}
        </>
      )}
      {confirmCancel && (
        <Modal title="Görevi iptal et?" onClose={closeCancel}>
          <p>{confirmCancel.prompt}</p>
          {confirmCancel.runAt && (
            <p>
              {date(confirmCancel.runAt)} · {Intl.DateTimeFormat().resolvedOptions().timeZone}
            </p>
          )}
          <p className="reference-agent-description">
            İptal, tamamlanmış dış işlemleri geri almaz. Geçmiş sonuçları ve oda mesajlarını silmez.
          </p>
          <div className="button-row">
            <button className="button secondary" onClick={closeCancel} disabled={busy}>
              Vazgeç
            </button>
            <button
              className="button secondary"
              disabled={busy || !ready}
              onClick={() =>
                void run(async () => {
                  await window.rooms!.agent.cancel(confirmCancel.id);
                  setConfirmCancel(null);
                })
              }
            >
              Görevi iptal et
            </button>
          </div>
          {error && <p role="alert">{error}</p>}
        </Modal>
      )}
    </div>
  );
}

export interface AgentSchedulesProps {
  tasks: AgentTask[];
  models: ModelConnection[];
  userId: string;
  roomId: string;
  roomName: string;
  channelName: string;
  ready: boolean;
  loading?: boolean;
  unavailableReason?: string;
  canManage?: boolean;
  bridge?: AgentBridge;
  onRefresh(): Promise<void>;
  fixture?: boolean;
  fixtureView?: string;
  fixtureNotice?: string;
  initialPrompt?: string;
  initialDate?: string;
  initialTime?: string;
  settingsMode?: boolean;
}
/** One-shot tasks only. No renderer timers execute tasks or synthesize task outcomes. */
export function AgentSchedulesSurface(props: AgentSchedulesProps) {
  const navigate = useNavigate(),
    location = useLocation(),
    query = new URLSearchParams(location.search);
  const [prompt, setPrompt] = useState(props.initialPrompt || ''),
    [day, setDay] = useState(props.initialDate || ''),
    [time, setTime] = useState(props.initialTime || ''),
    [modelId, setModelId] = useState('');
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [receipt, setReceipt] = useState<AgentTask | null>(null),
    [receiptKind, setReceiptKind] = useState<'created' | 'cancelled' | null>(null);
  const live = useRef(true),
    generation = useRef(0),
    [invalidated, setInvalidated] = useState(false);
  useEffect(() => {
    live.current = true;
    const invalidate = () => {
      generation.current++;
      setInvalidated(true);
      setReceipt(null);
      setPrompt('');
      setModelId('');
      setDay('');
      setTime('');
      setError('');
    };
    window.addEventListener('rooms:channel-access-invalidated', invalidate);
    window.addEventListener('rooms:community-management-invalidated', invalidate);
    return () => {
      live.current = false;
      generation.current++;
      window.removeEventListener('rooms:channel-access-invalidated', invalidate);
      window.removeEventListener('rooms:community-management-invalidated', invalidate);
    };
  }, []);
  useEffect(() => {
    generation.current++;
    setReceipt(null);
    setReceiptKind(null);
    setPrompt(props.initialPrompt || '');
    setModelId('');
    setDay(props.initialDate || '');
    setTime(props.initialTime || '');
    setBusy(false);
    setError('');
  }, [props.roomId, props.userId, props.ready]);
  const view = query.get('view') || (props.fixture ? props.fixtureView : undefined);
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const format = (at: string, options: Intl.DateTimeFormatOptions) =>
    new Date(at).toLocaleString('tr-TR', options);
  const ready = props.ready && !invalidated,
    models = props.models.filter(
      (model) => model.ownerId === props.userId && model.status === 'connected',
    );
  const jobs = ready
    ? props.tasks.filter((task) => task.roomId === props.roomId && task.runAt)
    : [];
  const order = [...jobs].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  const featured = order.find((task) => task.id === query.get('scheduleTask')) || order[0];
  const history = order.filter(
    (task) =>
      (view === 'empty' || task.id !== featured?.id) &&
      ['completed', 'failed', 'cancelled'].includes(task.state),
  );
  const showEmpty =
    view === 'empty' &&
    !order.some((task) =>
      ['scheduled', 'queued', 'running', 'awaiting-approval', 'interrupted'].includes(task.state),
    );
  const canCancel = (task: AgentTask) =>
    ready &&
    (task.ownerId === props.userId || props.canManage === true) &&
    ['scheduled', 'queued', 'running', 'awaiting-approval', 'interrupted'].includes(task.state);
  const editable = ready && !busy && !props.fixture && !!props.bridge;
  const disabledReason = props.fixture
    ? 'Yerel demo önizlemesi hesap işlemi yapamaz.'
    : invalidated
      ? 'Oda erişimi yeniden doğrulanmalı.'
      : props.unavailableReason || 'Agent bağlantısı gerekli.';
  const route = (view: string = 'list', task?: string) =>
    navigate(
      `${props.settingsMode ? '/settings?tab=schedules' : '/agent?tab=schedules'}${view ? `&view=${view}` : ''}${task ? `&scheduleTask=${encodeURIComponent(task)}` : ''}`,
    );
  const create = async () => {
    if (!editable) return;
    const local = new Date(`${day}T${time}`);
    if (!day || !time || !Number.isFinite(local.getTime()) || local.getTime() <= Date.now()) {
      setError('Gelecekte bir tarih ve saat seç.');
      return;
    }
    if (local.getTime() > Date.now() + 365 * 86400000) {
      setError('Gelecek bir yıl içinde bir tarih ve saat seç.');
      return;
    }
    // Reject normalized invalid calendar dates and DST gaps instead of silently changing the chosen time.
    const localDay = `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, '0')}-${String(local.getDate()).padStart(2, '0')}`;
    const localTime = `${String(local.getHours()).padStart(2, '0')}:${String(local.getMinutes()).padStart(2, '0')}`;
    if (localDay !== day || localTime !== time) {
      setError('Bu tarih ve saat seçili saat diliminde geçerli değil.');
      return;
    }
    if (!prompt.trim() || !models.some((model) => model.id === modelId)) {
      setError('Görev ve kendi hazır model bağlantını seç.');
      return;
    }
    const current = ++generation.current;
    setBusy(true);
    setError('');
    try {
      const result = await props.bridge!.submit({
        roomId: props.roomId,
        prompt: prompt.trim(),
        modelConnectionId: modelId,
        runAt: local.toISOString(),
      });
      if (!live.current || current !== generation.current) return;
      if (result.roomId !== props.roomId || result.ownerId !== props.userId || !result.runAt)
        throw new Error('Planlanan görev makbuzu bu oda ve hesaba ait değil.');
      setReceipt(result);
      setReceiptKind('created');
      setPrompt('');
      route('created', result.id);
      await props.onRefresh();
    } catch (e) {
      if (live.current && current === generation.current) setError(reason(e));
    } finally {
      if (live.current && current === generation.current) setBusy(false);
    }
  };
  const cancel = async (task: AgentTask) => {
    if (!editable || !canCancel(task)) return;
    const current = ++generation.current;
    setBusy(true);
    setError('');
    try {
      const result = await props.bridge!.cancel(task.id);
      if (!live.current || current !== generation.current) return;
      if (result.id !== task.id || result.roomId !== props.roomId)
        throw new Error('İptal makbuzu bu göreve ait değil.');
      setReceipt(result);
      setReceiptKind(result.state === 'cancelled' ? 'cancelled' : null);
      route(result.state === 'cancelled' ? 'cancelled' : undefined, result.id);
      await props.onRefresh();
    } catch (e) {
      if (live.current && current === generation.current) setError(reason(e));
    } finally {
      if (live.current && current === generation.current) setBusy(false);
    }
  };
  const notice =
    props.fixtureNotice ||
    (view === 'created' && receiptKind === 'created' && receipt
      ? `Görev planlandı. ${date(receipt.runAt!)} · ${zone} · Bir kez.`
      : '');
  const connection = (task: AgentTask) =>
    task.kind === 'reminder'
      ? 'Hatırlatma · Model gerektirmez'
      : props.models.find((model) => model.id === task.modelConnectionId)?.label ||
        'Başlatanın kişisel bağlantısı';
  const owner = (task: AgentTask) => (task.ownerId === props.userId ? 'Sen' : task.ownerId);
  const openTask = (task: AgentTask) =>
    navigate(
      `/agent?task=${encodeURIComponent(task.id)}${task.state === 'completed' ? '&view=result' : ''}`,
    );
  return (
    <div
      className="agent-page reference-agent reference-schedules"
      data-tab="schedules"
      data-fixture={props.fixture || undefined}
    >
      <header className="page-intro">
        <div>
          <span className="reference-agent-kicker">
            {props.roomName} / #{props.channelName}
          </span>
          <h2>Tek seferlik görevler</h2>
        </div>
        <button
          className="button primary"
          disabled={!ready || busy}
          title={!ready ? disabledReason : undefined}
          onClick={() => route('create')}
        >
          <Plus size={18} />
          Görev planla
        </button>
      </header>
      {props.fixture && <span className="s62-demo-label">Yerel demo önizlemesi</span>}
      {notice && ready && (
        <div className="s62-notice" role="status">
          <Check size={18} />
          {notice}
        </div>
      )}
      <div className="reference-agent-plan-summary">
        {(
          [
            ['scheduled', 'Planlanan'],
            ['completed', 'Tamamlanan'],
            ['cancelled', 'İptal edilen'],
          ] as const
        ).map(([state, label]) => (
          <div key={state}>
            <strong>{jobs.filter((task) => task.state === state).length}</strong>
            <span>{label}</span>
          </div>
        ))}
      </div>
      <div className="s62-section-bar">
        <strong>Görevler</strong>
        <span>{zone}</span>
      </div>
      {!ready ? (
        <div className="s62-empty" role="status">
          <Clock3 size={32} />
          <h3>{props.loading ? 'Bağlantı kontrol ediliyor' : 'Görevler kullanılamıyor'}</h3>
          <p>{disabledReason}</p>
          <button className="button secondary" onClick={() => navigate('/agent?tab=models')}>
            Model bağlantıları
          </button>
        </div>
      ) : featured && !showEmpty ? (
        <>
          {order
            .filter(
              (task) =>
                task.id === featured.id ||
                !['completed', 'failed', 'cancelled'].includes(task.state),
            )
            .map((card) => (
              <div className="s62-card-group" key={card.id}>
                {' '}
                <article className="s62-task-card">
                  <div className="s62-card-body">
                    <div className="s62-calendar">
                      <strong>{format(card.runAt!, { day: 'numeric' })}</strong>
                      <span>
                        {format(card.runAt!, { month: 'short' }).toLocaleUpperCase('tr-TR')}
                      </span>
                    </div>
                    <div className="s62-task-copy">
                      <h3>{card.prompt}</h3>
                      <p>
                        <Clock3 size={13} />
                        <b>{format(card.runAt!, { hour: '2-digit', minute: '2-digit' })}</b> ·{' '}
                        {zone} · Bir kez
                      </p>
                      <p>
                        <UserRound size={13} />
                        {owner(card)} · {connection(card)}
                      </p>
                    </div>
                    <span className={`s62-state ${card.state}`}>
                      {card.kind === 'reminder' ? 'Hatırlatma · ' : ''}
                      {taskNames[card.state]}
                    </span>
                  </div>
                  <footer>
                    <span>
                      #{props.channelName} · {props.roomName}
                    </span>
                    {canCancel(card) ? (
                      <button
                        className="text-button"
                        disabled={busy}
                        onClick={() => route('cancel', card.id)}
                      >
                        İptal et
                      </button>
                    ) : card.state === 'cancelled' ? (
                      <span className="s62-muted">İptal edildi</span>
                    ) : (
                      <button
                        className="text-button"
                        disabled={props.fixture}
                        title={props.fixture ? disabledReason : undefined}
                        onClick={() => openTask(card)}
                      >
                        <ArrowRight size={16} />
                        {card.state === 'completed' ? 'Sonucu aç' : 'Görevi aç'}
                      </button>
                    )}
                  </footer>
                </article>
                {card.error && (
                  <div className="s62-notice warning" role="alert">
                    {uiError(card.error)}
                    <button className="text-button" onClick={() => navigate('/agent?tab=models')}>
                      Bağlantıları yönet
                    </button>
                  </div>
                )}
              </div>
            ))}
        </>
      ) : (
        <div className="s62-empty">
          <Clock3 size={34} />
          <h3>Planlanan görev yok</h3>
          <button className="button primary" onClick={() => route('create')}>
            <Plus size={17} />
            İlk görevi planla
          </button>
        </div>
      )}
      {ready && history.length > 0 && (
        <section className="s62-history">
          <header>
            <h3>Geçmiş</h3>
            <span>Son {history.length} görev</span>
          </header>
          {history.map((task) => (
            <div className="s62-history-row" key={task.id}>
              <time>{date(task.runAt!)}</time>
              <div>
                <strong>{task.prompt}</strong>
                <small>
                  {owner(task)} · {connection(task)} · #{props.channelName}
                </small>
              </div>
              <span className={`s62-state ${task.state}`}>{taskNames[task.state]}</span>
              <button
                className="text-button"
                disabled={props.fixture}
                title={props.fixture ? disabledReason : undefined}
                onClick={() => openTask(task)}
              >
                Aç
              </button>
            </div>
          ))}
        </section>
      )}
      {error && (
        <div className="error-pane" role="alert">
          {error}
        </div>
      )}
      {ready && view === 'create' && (
        <Modal
          className="s62-modal"
          title="Tek seferlik görev planla"
          onClose={() => {
            if (!busy) route();
          }}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void create();
            }}
          >
            {error && (
              <div className="error-pane" role="alert">
                {error}
              </div>
            )}
            <label className="field-label">
              Asistan ne yapsın?
              <textarea
                aria-label="Asistan ne yapsın?"
                required
                maxLength={12000}
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
              />
            </label>
            <div className="s62-date-fields">
              <label className="field-label">
                Tarih
                <input
                  aria-label="Tarih"
                  type="date"
                  required
                  value={day}
                  onChange={(event) => setDay(event.target.value)}
                />
              </label>
              <label className="field-label">
                Saat
                <input
                  aria-label="Saat"
                  type="time"
                  required
                  value={time}
                  onChange={(event) => setTime(event.target.value)}
                />
              </label>
            </div>
            <label className="field-label">
              Saat dilimi
              <input readOnly value={zone} aria-label="Saat dilimi" />
            </label>
            <label className="field-label">
              Kişisel model bağlantısı
              <select
                aria-label="Kişisel model bağlantısı"
                required
                value={modelId}
                onChange={(event) => setModelId(event.target.value)}
              >
                <option value="">Bağlantı seç</option>
                {models.map((model) => (
                  <option value={model.id} key={model.id}>
                    {model.label} · {model.model}
                  </option>
                ))}
              </select>
            </label>
            {!models.length && <p>Hazır kişisel model bağlantısı yok.</p>}
            <div className="reference-agent-callout">
              <Clock3 size={16} />
              Bir kez çalışır. Dış işlemler sunucunun onay politikasına tabidir.
            </div>
            <div className="button-row">
              <button
                type="button"
                className="button secondary"
                disabled={busy}
                onClick={() => route()}
              >
                Vazgeç
              </button>
              <button
                className="button primary"
                disabled={!editable || !prompt.trim() || !day || !time || !modelId}
                title={!editable ? disabledReason : undefined}
              >
                <Clock3 size={16} />
                Görevi planla
              </button>
            </div>
          </form>
        </Modal>
      )}
      {ready && view === 'cancel' && featured && canCancel(featured) && (
        <Modal
          className="s62-modal s62-cancel-modal"
          title="Planlanan görevi iptal et?"
          onClose={() => {
            if (!busy) route();
          }}
        >
          <p>
            <strong>{featured.prompt}</strong> · {date(featured.runAt!)}.
          </p>
          {error && (
            <div className="error-pane" role="alert">
              {error}
            </div>
          )}
          <div className="s62-timezone">
            <span>Saat dilimi</span>
            <strong>{zone}</strong>
          </div>
          <p className="reference-agent-description">
            Tamamlanmış dış işlemler geri alınmaz. Geçmiş sonuçları ve oda mesajları silinmez.
          </p>
          <div className="button-row">
            <button className="button secondary" disabled={busy} onClick={() => route()}>
              Vazgeç
            </button>
            <button
              className="button danger"
              disabled={!editable}
              title={!editable ? disabledReason : undefined}
              onClick={() => void cancel(featured)}
            >
              Görevi iptal et
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

/** Account and access changes invalidate every in-flight private result. */
function useAgentPrivateScope(scopeKey: string) {
  const generation = useRef(0),
    alive = useRef(true),
    [invalidated, setInvalidated] = useState(false);
  useEffect(() => {
    alive.current = true;
    generation.current++;
    setInvalidated(false);
    const invalidate = () => {
      generation.current++;
      setInvalidated(true);
    };
    window.addEventListener('rooms:channel-access-invalidated', invalidate);
    window.addEventListener('rooms:community-management-invalidated', invalidate);
    return () => {
      alive.current = false;
      generation.current++;
      window.removeEventListener('rooms:channel-access-invalidated', invalidate);
      window.removeEventListener('rooms:community-management-invalidated', invalidate);
    };
  }, [scopeKey]);
  return {
    invalidated,
    ticket: () => generation.current,
    current: (ticket: number) => alive.current && ticket === generation.current,
  };
}
const providerName = (provider: AgentProvider) =>
  provider === 'codex' ? 'Codex' : provider === 'claude' ? 'Claude Code' : 'OpenRouter';
const referenceFixtureReason = 'Yerel demo önizlemesi hesap işlemi yapamaz.';
export interface AgentModelsProps {
  models: ModelConnection[];
  userId: string;
  ready: boolean;
  bridge?: AgentBridge;
  onRefresh(): Promise<void>;
  loading?: boolean;
  unavailableReason?: string;
  fixture?: boolean;
  fixtureView?: string;
}
/** Public metadata only. Stored API keys and subscription credentials are never read back. */
export function AgentModelsSurface(props: AgentModelsProps) {
  const navigate = useNavigate(),
    scope = useAgentPrivateScope(`${props.userId}:${props.ready}`),
    [apiKey, setApiKey] = useState(''),
    [label, setLabel] = useState(''),
    [model, setModel] = useState('');
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [receipt, setReceipt] = useState(''),
    [selected, setSelected] = useState('');
  const [login, setLogin] = useState<AgentProvider | null>(
      props.fixture && props.fixtureView === 'waiting'
        ? 'codex'
        : props.fixture && props.fixtureView === 'claude_waiting'
          ? 'claude'
          : null,
    ),
    [remove, setRemove] = useState<ModelConnection | null>(null),
    locked = useRef(false);
  const ready = props.ready && !scope.invalidated,
    models = ready ? props.models.filter((item) => item.ownerId === props.userId) : [],
    connected = models.filter((item) => item.status === 'connected');
  const editable = ready && !props.fixture && !!props.bridge && !busy,
    disabledReason = props.fixture
      ? referenceFixtureReason
      : props.unavailableReason || 'Önce kişisel Agent sunucusuna bağlan.';
  useEffect(() => {
    setApiKey('');
    setLabel('');
    setModel('');
    setSelected('');
    setLogin(
      props.fixture && !scope.invalidated && props.fixtureView === 'waiting'
        ? 'codex'
        : props.fixture && !scope.invalidated && props.fixtureView === 'claude_waiting'
          ? 'claude'
          : null,
    );
    setRemove(null);
    setReceipt('');
    setError('');
    setBusy(false);
    locked.current = false;
  }, [props.userId, scope.invalidated, props.ready]);
  const perform = async (work: () => Promise<void>) => {
    if (!editable || locked.current) return;
    locked.current = true;
    const ticket = scope.ticket();
    setBusy(true);
    setError('');
    setReceipt('');
    try {
      await work();
      if (!scope.current(ticket)) return;
      await props.onRefresh();
    } catch (failure) {
      if (scope.current(ticket)) setError(reason(failure));
    } finally {
      locked.current = false;
      if (scope.current(ticket)) setBusy(false);
    }
  };
  const connect = async (provider: AgentProvider) => {
    if (!model.trim() || (provider === 'openrouter' && !apiKey.trim())) return;
    // Clear the transient credential before awaiting native IPC, including failures.
    const key = apiKey;
    setApiKey('');
    const ticket = scope.ticket();
    await perform(async () => {
      const result = await props.bridge!.connectModel({
        provider,
        label: label.trim() || providerName(provider),
        model: model.trim(),
        ...(provider === 'openrouter' ? { apiKey: key } : {}),
      });
      if (!scope.current(ticket)) return;
      if (result.ownerId !== props.userId || result.provider !== provider)
        throw new Error('Bağlantı makbuzu bu hesaba ait değil.');
      setReceipt(
        result.status === 'connected'
          ? 'Bağlantı kaydedildi. Model erişimi görev sırasında doğrulanır.'
          : 'Bağlantı kaydedildi. Resmî sunucu oturumu gerekli.',
      );
      setLabel('');
      setModel('');
      if (result.status === 'connected') setLogin(null);
    });
  };
  const unavailable = models.find((item) => item.status !== 'connected'),
    fixtureChoice = props.fixture && props.fixtureView === 'choose';
  const banner = scope.invalidated
    ? 'Erişim yeniden doğrulanmalı.'
    : (unavailable?.reason ? uiError(unavailable.reason) : undefined) ||
      (fixtureChoice ? 'Bu görev için kendi bağlantını seç.' : undefined);
  return (
    <section className="reference-personal-models" data-fixture={props.fixture || undefined}>
      <header className="s59-heading">
        <span className="reference-agent-kicker">Kişisel</span>
        <h2>Model bağlantılarım</h2>
        <p>Görevler, başlatırken seçtiğin kişisel bağlantıyla çalışır.</p>
      </header>
      {props.fixture && <span className="s59-demo-label">Yerel demo önizlemesi</span>}
      {!ready && (
        <div className="reference-agent-callout warning" role="status">
          {props.loading ? 'Bağlantı kontrol ediliyor' : disabledReason}
        </div>
      )}
      {banner && ready && (
        <div className={`reference-agent-callout ${fixtureChoice ? '' : 'warning'}`} role="status">
          <AlertTriangle size={18} />
          {banner}
        </div>
      )}
      {receipt && (
        <div className="reference-agent-callout" role="status">
          {receipt}
        </div>
      )}
      {(['openrouter', 'codex', 'claude'] as const).map((provider) => {
        const items = models.filter((item) => item.provider === provider),
          primary = items[0];
        return (
          <article className="s59-provider-row" key={provider}>
            <span className={`s59-provider-symbol ${provider}`}>
              {provider === 'openrouter' ? (
                <ExternalLink size={24} />
              ) : provider === 'codex' ? (
                'C'
              ) : (
                'CC'
              )}
            </span>
            <div className="s59-provider-body">
              <header>
                <h3>{providerName(provider)}</h3>
                <span
                  className={`s59-badge ${primary?.status === 'connected' ? 'ready' : primary ? 'warning' : ''}`}
                >
                  {primary?.status === 'connected'
                    ? 'Kaydedildi'
                    : primary?.status === 'login-required'
                      ? 'Giriş gerekli'
                      : primary
                        ? 'Kullanılamıyor'
                        : 'Bağlı değil'}
                </span>
              </header>
              <p>
                {provider === 'openrouter'
                  ? 'Kendi API anahtarın. Diğer üyelerle paylaşılmaz.'
                  : 'Ayrı sunucudaki kişisel resmî CLI oturumu kullanılır.'}
              </p>
              {provider === 'openrouter' ? (
                <form
                  className="s59-connect-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void connect(provider);
                  }}
                >
                  <div className="s59-input-row">
                    <label className="field-label">
                      API anahtarı
                      <input
                        type="password"
                        autoComplete="new-password"
                        value={apiKey}
                        disabled={!editable}
                        onChange={(event) => setApiKey(event.target.value)}
                        aria-label="OpenRouter API anahtarı"
                        placeholder={primary ? 'Yeni anahtar ekle' : 'API anahtarını gir'}
                        maxLength={2048}
                      />
                    </label>
                    <button
                      className="button secondary"
                      disabled={!editable || !apiKey.trim() || !model.trim()}
                      title={
                        !editable
                          ? disabledReason
                          : !model.trim()
                            ? 'Model adı gerekli.'
                            : undefined
                      }
                    >
                      {busy ? <LoaderCircle size={16} /> : <Plus size={16} />}Bağlantı ekle
                    </button>
                  </div>
                  <div className="s59-profile-fields">
                    <label className="field-label">
                      Bağlantı adı
                      <input
                        value={label}
                        disabled={!editable}
                        onChange={(event) => setLabel(event.target.value)}
                        placeholder="Bağlantı adı"
                        maxLength={80}
                      />
                    </label>
                    <label className="field-label">
                      Model
                      <input
                        aria-label="OpenRouter model"
                        value={model}
                        disabled={!editable}
                        onChange={(event) => setModel(event.target.value)}
                        placeholder="sağlayıcı/model"
                        maxLength={160}
                        required
                      />
                    </label>
                  </div>
                </form>
              ) : (
                <div className="s59-integration-footer">
                  <span>
                    <UserRound size={15} />
                    {primary ? 'Kişisel bağlantın' : 'Henüz bağlantı eklenmedi'}
                  </span>
                  <button
                    className="button secondary"
                    disabled={!ready}
                    title={!ready ? disabledReason : undefined}
                    onClick={() => {
                      setLogin(provider);
                      setModel('');
                      setLabel('');
                      setError('');
                    }}
                  >
                    <ExternalLink size={16} />
                    {primary ? 'Girişi yönet' : 'Resmî oturum bağlantısı'}
                  </button>
                </div>
              )}
              {items.map((item) => (
                <div className="s59-model-metadata" key={item.id}>
                  <div>
                    <strong>{item.label}</strong>
                    <small>
                      {item.model} ·{' '}
                      {item.reason
                        ? uiError(item.reason)
                        : item.status === 'connected'
                          ? 'Model erişimi görev sırasında doğrulanır.'
                          : 'Resmî oturum gerekli.'}
                    </small>
                  </div>
                  <IconButton
                    label={`${item.label} bağlantısını kaldır`}
                    disabled={!editable}
                    onClick={() => setRemove(item)}
                  >
                    <Trash2 size={16} />
                  </IconButton>
                </div>
              ))}
              {provider === 'openrouter' && error && (
                <div className="s59-inline-error" role="alert">
                  {error}
                </div>
              )}
            </div>
          </article>
        );
      })}
      <section className="s59-task-choice">
        <h3>Yeni görevde kullan</h3>
        <div>
          <label htmlFor="s59-model-choice">
            Kişisel bağlantın<small>Her görev için açıkça seçilir.</small>
          </label>
          <select
            id="s59-model-choice"
            aria-label="Kişisel bağlantın"
            value={selected}
            disabled={!ready || !connected.length}
            onChange={(event) => setSelected(event.target.value)}
          >
            <option value="">Bağlantı seç</option>
            {connected.map((item) => (
              <option key={item.id} value={item.id}>
                {providerName(item.provider)} · {item.label}
              </option>
            ))}
          </select>
        </div>
        <button
          className="button primary"
          disabled={!selected || !connected.some((item) => item.id === selected) || props.fixture}
          title={
            props.fixture
              ? referenceFixtureReason
              : !selected
                ? 'Kendi hazır bağlantını seç.'
                : undefined
          }
          onClick={() => navigate(`/agent?tab=tasks&model=${encodeURIComponent(selected)}`)}
        >
          <ArrowRight size={17} />
          Bu bağlantıyla yeni görev
        </button>
      </section>
      <footer className="s59-footer">
        <ShieldCheck size={14} />
        Bağlantı hatalarında hesap değiştirilmez. Tekrar başlatma açık bir eylemdir.
      </footer>
      {login && ready && (
        <Modal
          className="s59-modal"
          title="Resmî sunucu oturumu"
          onClose={() => {
            if (!busy) {
              setLogin(null);
              setModel('');
              setError('');
            }
          }}
        >
          <span className={`s59-provider-symbol ${login}`}>{login === 'codex' ? 'C' : 'CC'}</span>
          <p>{providerName(login)} girişini ayrı Agent sunucusunda tamamla.</p>
          <div className="reference-agent-callout">
            <LockKeyhole size={18} />
            ROOMS parola veya abonelik erişim bilgisi istemez. Giriş başlatma bağlantısı bu hizmette
            sunulmuyor.
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void connect(login);
            }}
          >
            <label className="field-label">
              Bağlantı adı
              <input
                value={label}
                disabled={!editable}
                onChange={(event) => setLabel(event.target.value)}
                maxLength={80}
              />
            </label>
            <label className="field-label">
              Resmî model adı
              <input
                aria-label="Resmî model adı"
                required
                value={model}
                disabled={!editable}
                onChange={(event) => setModel(event.target.value)}
                maxLength={160}
              />
            </label>
            <div className="button-row">
              <button
                className="button secondary"
                type="button"
                disabled={busy}
                onClick={() => setLogin(null)}
              >
                İptal
              </button>
              <button
                className="button secondary"
                type="button"
                disabled={!editable}
                title={!editable ? disabledReason : undefined}
                onClick={() => void perform(async () => {})}
              >
                <RefreshCw size={16} />
                Durumu yenile
              </button>
              <button
                className="button primary"
                disabled={!editable || !model.trim()}
                title={!editable ? disabledReason : undefined}
              >
                Bağlantı kaydet
              </button>
            </div>
          </form>
          {error && <p role="alert">{error}</p>}
        </Modal>
      )}
      {remove && ready && (
        <Modal
          className="s59-modal"
          title="Model bağlantısını kaldır?"
          onClose={() => {
            if (!busy) setRemove(null);
          }}
        >
          <p>
            {remove.label} · {remove.model}
          </p>
          <p>Bu bağlantıyla çalışan veya planlanan görevler sunucuda iptal edilir.</p>
          <div className="button-row">
            <button className="button secondary" disabled={busy} onClick={() => setRemove(null)}>
              Vazgeç
            </button>
            <button
              className="button danger"
              disabled={!editable}
              onClick={() => {
                const id = remove.id,
                  ticket = scope.ticket();
                void perform(async () => {
                  await props.bridge!.disconnectModel(id);
                  if (scope.current(ticket)) setRemove(null);
                });
              }}
            >
              Bağlantıyı kaldır
            </button>
          </div>
          {error && <p role="alert">{error}</p>}
        </Modal>
      )}
    </section>
  );
}
export function AgentSettings(props: {
  notify(message: string): void;
  view?: 'all' | 'models' | 'automation';
}) {
  if (props.view === 'automation') return <AgentAutomation />;
  if (props.view === 'models') return <AgentModelsContainer />;
  return <LegacyAgentSettings {...props} />;
}
function AgentModelsContainer() {
  const community = useCommunity(),
    [status, setStatus] = useState<AgentStatus | null>(null),
    [models, setModels] = useState<ModelConnection[]>([]),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true);
  const scope = useAgentPrivateScope(
    `${community.user?.id}:${community.serverUrl}:${community.status}`,
  );
  const refresh = useCallback(async () => {
    const ticket = scope.ticket();
    setLoading(true);
    try {
      if (!window.rooms?.agent) throw new Error('Masaüstü Agent bağlantısı gerekli.');
      const status = await window.rooms.agent.status();
      if (!scope.current(ticket)) return;
      if (!status.connected || status.userId !== community.user?.id) {
        setStatus(status);
        setModels([]);
        return;
      }
      const models = await window.rooms.agent.connections();
      if (scope.current(ticket)) {
        setStatus(status);
        setModels(models.filter((model) => model.ownerId === status.userId));
        setError('');
      }
    } catch (failure) {
      if (scope.current(ticket)) {
        setModels([]);
        setStatus(null);
        setError(reason(failure));
      }
    } finally {
      if (scope.current(ticket)) setLoading(false);
    }
  }, [community.user?.id, community.serverUrl, community.status]);
  useEffect(() => {
    setStatus(null);
    setModels([]);
    void refresh();
  }, [refresh]);
  return (
    <>
      <AgentModelsSurface
        key={`${community.user?.id}:${community.serverUrl}:${community.status}`}
        userId={community.user?.id || ''}
        ready={!!status?.connected && status.userId === community.user?.id && !scope.invalidated}
        models={models}
        bridge={window.rooms?.agent}
        onRefresh={refresh}
        loading={loading}
        unavailableReason={error || status?.reason}
      />
      <div className="s59-connection-refresh">
        <button
          className="button secondary small"
          onClick={() => void refresh()}
          disabled={loading}
        >
          Durumu yenile
        </button>
        <details>
          <summary>Agent sunucusu</summary>
          <LegacyAgentSettings view="all" notify={() => {}} />
        </details>
      </div>
    </>
  );
}

export interface AgentConnectionsProps {
  authority: AgentAuthoritySnapshot | null;
  userId: string;
  roomId: string;
  roomName: string;
  channelName: string;
  loading?: boolean;
  error?: string;
  onRefresh(): Promise<void>;
  fixture?: boolean;
  fixtureView?: string;
}
/** An authority grant is not proof that an external OAuth account is connected. */
export function AgentConnectionsSurface(props: AgentConnectionsProps) {
  const navigate = useNavigate(),
    scope = useAgentPrivateScope(`${props.userId}:${props.roomId}`),
    [view, setView] = useState(props.fixture ? props.fixtureView : undefined);
  const authority =
    !scope.invalidated &&
    props.authority?.userId === props.userId &&
    props.authority.roomId === props.roomId
      ? props.authority
      : null;
  const modal = view === 'scope' ? 'github' : view === 'drive_scope' ? 'drive' : null;
  const unavailable = 'Hesap yetkilendirme ve kapsam değiştirme API’si bu hizmette sunulmuyor.';
  const accessText = (read: boolean, write: boolean) =>
    read && write
      ? authority?.yolo
        ? 'Okuma + yazma'
        : 'Okuma + onaylı yazma'
      : read
        ? 'Yalnızca okuma'
        : write
          ? 'Yazma'
          : 'Erişim yok';
  return (
    <section className="reference-app-connections" data-fixture={props.fixture || undefined}>
      <header className="s59-heading">
        <span className="reference-agent-kicker">Kişisel</span>
        <h2>Uygulama bağlantıları</h2>
        <p>Bu oda için sunucunun verdiği içerik ve işlem kapsamı.</p>
      </header>
      {props.fixture && <span className="s59-demo-label">Yerel demo önizlemesi</span>}
      {(props.error || scope.invalidated || (props.fixture && view === 'revoked')) && (
        <div className="reference-agent-callout warning" role="alert">
          <LockKeyhole size={18} />
          {scope.invalidated
            ? 'Erişim yeniden doğrulanmalı.'
            : props.error || 'Erişim kaldırıldı. İçerik önizlemesi kapalı.'}
        </div>
      )}
      {!authority && !props.error && !scope.invalidated && (
        <div className="reference-agent-callout" role="status">
          {props.loading ? 'Kapsam yükleniyor' : 'Bu oda için doğrulanmış Agent kapsamı yok.'}
        </div>
      )}
      {(['github', 'drive'] as const).map((kind) => {
        const grants =
            authority?.scopes.filter((item) => item.kind === kind && (item.read || item.write)) ||
            [],
          revoked = props.fixture && view === 'revoked' && kind === 'drive',
          visible = revoked ? [] : grants;
        return (
          <article className="s60-provider-row" key={kind}>
            <span className={`s59-provider-symbol ${kind}`}>
              {kind === 'github' ? <Folder size={25} /> : <Triangle size={25} />}
            </span>
            <div className="s59-provider-body">
              <header>
                <h3>{kind === 'github' ? 'GitHub' : 'Google Drive'}</h3>
                <span
                  className={`s59-badge ${revoked ? 'warning' : visible.length ? 'ready' : ''}`}
                >
                  {revoked ? 'Erişim değişti' : visible.length ? 'Kapsam tanımlı' : 'Kapsam yok'}
                </span>
              </header>
              <p>Hesap oturum bilgisi bu API’de sunulmuyor.</p>
              {visible.length > 0 && (
                <div className="s60-scopes">
                  {visible.flatMap((grant, i) =>
                    grant.resources.length
                      ? grant.resources.map((resource) => (
                          <div className="s60-scope-row" key={`${i}:${resource}`}>
                            <span>
                              {kind === 'github' ? <Folder size={17} /> : <FileText size={17} />}
                              <span>{resource}</span>
                            </span>
                            <span className="s59-badge purple">
                              {accessText(grant.read, grant.write)}
                            </span>
                          </div>
                        ))
                      : [
                          <div className="s60-scope-row" key={`none:${i}`}>
                            <span>Kaynak listesi sunulmuyor</span>
                            <span className="s59-badge purple">
                              {accessText(grant.read, grant.write)}
                            </span>
                          </div>,
                        ],
                  )}
                </div>
              )}
              {revoked && (
                <div className="reference-agent-callout">
                  <LockKeyhole size={17} />
                  Kaldırılan içeriğin önizlemesi gösterilmez.
                </div>
              )}
              <div className="s59-integration-footer">
                <span>
                  {visible.reduce((count, grant) => count + grant.resources.length, 0)}{' '}
                  {kind === 'github' ? 'depo' : 'dosya'} · Sunucu kapsamı
                </span>
                <div>
                  <button
                    className="button secondary small"
                    disabled={!authority}
                    onClick={() => setView(kind === 'github' ? 'scope' : 'drive_scope')}
                  >
                    <ShieldCheck size={16} />
                    Kapsamı incele
                  </button>
                  <button className="button secondary small" disabled title={unavailable}>
                    {kind === 'github' ? 'GitHub ile bağlan' : 'Google Drive ile bağlan'}
                  </button>
                </div>
              </div>
            </div>
          </article>
        );
      })}
      <section className="s60-room-scope">
        <header>
          <h3>Bu odada geçerli kapsam</h3>
          <button
            className="text-button"
            onClick={() => navigate('/settings?tab=assistant-permissions')}
          >
            <ArrowRight size={17} />
            Asistan yetkileri
          </button>
        </header>
        <dl>
          <div>
            <dt>İçerik erişimi</dt>
            <dd>{authority ? 'Sunucunun izin verdiği kaynaklar' : 'Doğrulanmadı'}</dd>
          </div>
          <div>
            <dt>Dış değişiklikler</dt>
            <dd>
              {!authority
                ? 'Doğrulanmadı'
                : authority.yolo
                  ? 'YOLO · Mevcut kapsam'
                  : 'Normal mod · İşlem başına onay'}
            </dd>
          </div>
        </dl>
        <div className="s60-chips">
          <span>{props.roomName}</span>
          <span>#{props.channelName}</span>
          <span>Kişisel erişim</span>
        </div>
      </section>
      <footer className="s59-footer">
        <LockKeyhole size={14} />
        Hesap anahtarı veya özel kaynak adresi bu görünümde bulunmaz.
      </footer>
      <button
        className="text-button"
        disabled={props.loading || props.fixture}
        title={props.fixture ? referenceFixtureReason : undefined}
        onClick={() => void props.onRefresh()}
      >
        <RefreshCw size={16} />
        Kapsamı yenile
      </button>
      {modal && authority && (
        <Modal
          className="s60-modal"
          title={modal === 'github' ? 'GitHub kapsamı' : 'Drive dosya kapsamı'}
          onClose={() => setView(undefined)}
        >
          <p>Sunucu tarafından verilen kapsam. Değişiklik için yönetici yapılandırması gerekli.</p>
          <div className="s60-scopes">
            <div className="s60-scope-row">
              <span>Oda</span>
              <strong>
                {props.roomName} / #{props.channelName}
              </strong>
            </div>
            <div className="s60-scope-row">
              <span>Hesap</span>
              <strong>Kişisel Agent erişimi</strong>
            </div>
          </div>
          {authority.scopes
            .filter((grant) => grant.kind === modal)
            .flatMap((grant, i) =>
              grant.resources.map((resource) => (
                <label className="s60-scope-check" key={`${i}:${resource}`}>
                  <input type="checkbox" checked={grant.read || grant.write} disabled readOnly />
                  <span>
                    <strong>{resource}</strong>
                    <small>{accessText(grant.read, grant.write)}</small>
                  </span>
                </label>
              )),
            )}
          <div className="reference-agent-callout">
            <ShieldCheck size={18} />
            {unavailable}
          </div>
          <div className="button-row">
            <button className="button secondary" onClick={() => setView(undefined)}>
              Kapat
            </button>
            <button className="button primary" disabled title={unavailable}>
              Seçimi kaydet
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}
export function AgentConnectionsContainer() {
  const community = useCommunity(),
    roomId = useCurrentRoom(),
    [authority, setAuthority] = useState<AgentAuthoritySnapshot | null>(null),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true);
  const scope = useAgentPrivateScope(`${community.user?.id}:${community.serverUrl}:${roomId}`);
  const refresh = useCallback(async () => {
    const ticket = scope.ticket();
    setLoading(true);
    setAuthority(null);
    try {
      if (!roomId || !community.user?.id) throw new Error('Önce bir oda seç.');
      if (!window.rooms?.agent) throw new Error('Agent bağlantısı gerekli.');
      const value = await window.rooms.agent.authority(roomId);
      if (!scope.current(ticket)) return;
      if (value.roomId !== roomId || value.userId !== community.user.id)
        throw new Error('Kapsam bu oda ve hesaba ait değil.');
      setAuthority(value);
      setError('');
    } catch (failure) {
      if (scope.current(ticket)) {
        setAuthority(null);
        setError(reason(failure));
      }
    } finally {
      if (scope.current(ticket)) setLoading(false);
    }
  }, [community.user?.id, community.serverUrl, roomId]);
  useEffect(() => {
    setAuthority(null);
    void refresh();
  }, [refresh]);
  return (
    <AgentConnectionsSurface
      key={`${community.user?.id}:${community.serverUrl}:${roomId}`}
      authority={scope.invalidated ? null : authority}
      userId={community.user?.id || ''}
      roomId={roomId || ''}
      roomName={
        community.spaces.find((space) => space.id === community.activeSpaceId)?.name || 'Topluluk'
      }
      channelName={community.channels.find((channel) => channel.id === roomId)?.name || 'Oda'}
      loading={loading}
      error={scope.invalidated ? 'Erişim yeniden doğrulanmalı.' : error}
      onRefresh={refresh}
    />
  );
}

export interface AgentMemoryProps {
  memories: AgentMemory[];
  userId: string;
  roomId: string;
  roomName: string;
  channelName: string;
  ready: boolean;
  loading?: boolean;
  unavailableReason?: string;
  bridge?: AgentBridge;
  onRefresh(): Promise<void>;
  sourceCandidates?: SocialMessage[];
  loadSource?(id: string): Promise<SocialMessage | null>;
  fixture?: boolean;
  fixtureView?: string;
  fixtureSources?: Record<string, SocialMessage | null>;
}
/** Only explicit memory writes; route data cannot authorize a source or a mutation. */
export function AgentMemorySurface(props: AgentMemoryProps) {
  const navigate = useNavigate(),
    scope = useAgentPrivateScope(`${props.userId}:${props.roomId}:${props.ready}`),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const [view, setView] = useState(props.fixture ? props.fixtureView : undefined),
    [selected, setSelected] = useState<string | null>(null),
    [text, setText] = useState(''),
    [sourceId, setSourceId] = useState('');
  const [sources, setSources] = useState<Record<string, SocialMessage | null>>(
      props.fixture ? props.fixtureSources || {} : {},
    ),
    locked = useRef(false);
  const ready = props.ready && !scope.invalidated,
    notes = ready ? props.memories.filter((note) => note.roomId === props.roomId) : [],
    editable = ready && !props.fixture && !!props.bridge && !busy;
  const disabledReason = props.fixture
    ? referenceFixtureReason
    : props.unavailableReason || 'Agent sunucusu bağlı değil.';
  const target =
      notes.find((note) => note.id === selected) || (props.fixture ? notes[0] : undefined),
    source = target?.sourceMessageId ? sources[target.sourceMessageId] : null;
  const readable = (note: AgentMemory) => !note.sourceMessageId || !!sources[note.sourceMessageId];
  const title = (note: AgentMemory) =>
    note.sourceMessageId ? 'Mesajdan kaydedildi' : 'Kaydedilen not';
  const candidates = ready
    ? (props.sourceCandidates || []).filter((message) => message.channelId === props.roomId)
    : [];
  useEffect(() => {
    setSources(props.fixture ? props.fixtureSources || {} : {});
    setText('');
    setSourceId(
      props.fixture && props.fixtureView === 'save' ? props.sourceCandidates?.[0]?.id || '' : '',
    );
    setSelected(null);
    setNotice('');
    setError('');
    setBusy(false);
    locked.current = false;
    if (!props.fixture) setView(undefined);
  }, [props.userId, props.roomId, scope.invalidated]);
  useEffect(() => {
    if (props.fixture || !ready || !props.loadSource) return;
    const ticket = scope.ticket();
    let cancelled = false;
    const ids = [
      ...new Set(notes.map((note) => note.sourceMessageId).filter((id): id is string => !!id)),
    ];
    setSources({});
    // A bounded, fresh social read is required before rendering each source-backed note.
    for (const id of ids)
      void props
        .loadSource(id)
        .then((message) => {
          if (!cancelled && scope.current(ticket))
            setSources((current) => ({
              ...current,
              [id]: message?.channelId === props.roomId && message.id === id ? message : null,
            }));
        })
        .catch(() => {
          if (!cancelled && scope.current(ticket))
            setSources((current) => ({ ...current, [id]: null }));
        });
    return () => {
      cancelled = true;
    };
  }, [props.memories, props.roomId, props.userId, ready]);
  const close = () => {
    if (!busy) {
      setView(undefined);
      setError('');
      setText('');
      setSourceId('');
    }
  };
  const perform = async (work: (ticket: number) => Promise<void>) => {
    if (!editable || locked.current) return;
    locked.current = true;
    const ticket = scope.ticket();
    setBusy(true);
    setError('');
    try {
      await work(ticket);
      if (scope.current(ticket)) await props.onRefresh();
    } catch (failure) {
      if (scope.current(ticket)) setError(reason(failure));
    } finally {
      locked.current = false;
      if (scope.current(ticket)) setBusy(false);
    }
  };
  const preview = async (note: AgentMemory) => {
    if (!ready || !note.sourceMessageId) return;
    setSelected(note.id);
    setView('source');
    setError('');
    if (props.fixture) return;
    if (!props.loadSource) {
      setSources((current) => ({ ...current, [note.sourceMessageId!]: null }));
      return;
    }
    const ticket = scope.ticket();
    setSources(
      (current) =>
        ({ ...current, [note.sourceMessageId!]: undefined }) as Record<
          string,
          SocialMessage | null
        >,
    );
    try {
      const result = await props.loadSource(note.sourceMessageId);
      if (scope.current(ticket))
        setSources((current) => ({
          ...current,
          [note.sourceMessageId!]:
            result?.channelId === props.roomId && result.id === note.sourceMessageId
              ? result
              : null,
        }));
    } catch (failure) {
      if (scope.current(ticket)) {
        setSources((current) => ({ ...current, [note.sourceMessageId!]: null }));
        setError(reason(failure));
      }
    }
  };
  const save = () =>
    void perform(async (ticket) => {
      let content = text.trim();
      if (sourceId) {
        if (!props.loadSource) throw new Error('Kaynak doğrulama bağlantısı yok.');
        const message = await props.loadSource(sourceId);
        if (!scope.current(ticket)) return;
        if (!message || message.channelId !== props.roomId || message.id !== sourceId)
          throw new Error('Kaynak mesaj doğrulanamadı.');
        content = message.content;
      }
      if (!content) throw new Error('Kaydedilecek bilgi gerekli.');
      const result = await props.bridge!.saveMemory({
        roomId: props.roomId,
        text: content,
        ...(sourceId ? { sourceMessageId: sourceId } : {}),
      });
      if (!scope.current(ticket)) return;
      if (
        result.roomId !== props.roomId ||
        result.authorId !== props.userId ||
        result.sourceMessageId !== (sourceId || undefined)
      )
        throw new Error('Kayıt makbuzu bu oda ve hesaba ait değil.');
      setView(undefined);
      setText('');
      setSourceId('');
      setNotice('Bilgi kaydedildi.');
    });
  const remove = () => {
    if (!target) return;
    const id = target.id;
    void perform(async (ticket) => {
      await props.bridge!.deleteMemory(id);
      if (scope.current(ticket)) {
        setView(undefined);
        setSelected(null);
        setNotice('Hafıza kaydı silindi.');
      }
    });
  };
  return (
    <section
      className="agent-page reference-agent reference-room-memory"
      data-tab="memory"
      data-fixture={props.fixture || undefined}
    >
      <header className="s61-heading">
        <div>
          <span className="reference-agent-kicker">
            {props.roomName} / #{props.channelName}
          </span>
          <h2>Oda hafızası</h2>
        </div>
        <div>
          <button
            className="button secondary"
            disabled={!ready}
            title={!ready ? disabledReason : undefined}
            onClick={() => {
              setView('save');
              setSourceId('');
              setText('');
            }}
          >
            <Plus size={18} />
            Mesajdan kaydet
          </button>
          <button
            className="text-button"
            disabled={!ready}
            onClick={() => {
              setView('note');
              setSourceId('');
              setText('');
            }}
          >
            Not ekle
          </button>
        </div>
      </header>
      {props.fixture && <span className="s59-demo-label">Yerel demo önizlemesi</span>}
      <div className="reference-agent-callout s61-privacy">
        <Bookmark size={19} />
        Yalnızca açıkça kaydedilen bilgiler kullanılır. Sohbetler ve asistan konuşmaları
        kendiliğinden hafızaya alınmaz.
      </div>
      {notice && ready && (
        <div className="reference-agent-callout" role="status">
          {notice}
        </div>
      )}
      {!ready ? (
        <div className="s61-empty" role="status">
          <LockKeyhole size={30} />
          <h3>{props.loading ? 'Hafıza yükleniyor' : 'Hafıza kullanılamıyor'}</h3>
          <p>{scope.invalidated ? 'Oda erişimi yeniden doğrulanmalı.' : disabledReason}</p>
          <button className="button secondary" onClick={() => navigate('/settings?tab=agent')}>
            Agent bağlantısı
          </button>
        </div>
      ) : (
        <>
          <div className="s61-section-title">
            <h3>Kayıtlı bilgiler</h3>
            <span>{notes.length} kayıt</span>
          </div>
          {notes.length ? (
            <div className="s61-memory-list">
              {notes.map((note) => (
                <article className="s61-memory-row" key={note.id}>
                  <span className="s61-note-symbol">
                    <Bookmark size={20} />
                  </span>
                  <div className="s61-note-body">
                    <strong>{title(note)}</strong>
                    <p>
                      {note.sourceMessageId && !props.loadSource && !props.fixture
                        ? 'Kaynak doğrulama bağlantısı yok. Önizleme kapalı.'
                        : note.sourceMessageId && sources[note.sourceMessageId] === undefined
                          ? 'Kaynak doğrulanıyor…'
                          : readable(note)
                            ? note.text
                            : 'Kaynak doğrulanamadı. İçerik önizlemesi kapalı.'}
                    </p>
                    <div className="s61-memory-meta">
                      <span className="s59-badge purple">Açıkça kaydedildi</span>
                      <small>
                        {note.authorId === props.userId ? 'Sen' : note.authorId} ·{' '}
                        {date(note.createdAt)}
                      </small>
                    </div>
                  </div>
                  <div className="s61-memory-actions">
                    {note.sourceMessageId ? (
                      <button
                        className="text-button"
                        disabled={busy || sources[note.sourceMessageId] === null}
                        title={
                          sources[note.sourceMessageId] === null
                            ? 'Kaynak doğrulanamadı.'
                            : undefined
                        }
                        onClick={() => void preview(note)}
                      >
                        Kaynak mesaj
                      </button>
                    ) : (
                      <span>Kaynak mesaj yok</span>
                    )}
                    <button
                      className="text-button"
                      disabled={busy}
                      onClick={() => {
                        setSelected(note.id);
                        setView('delete');
                        setError('');
                      }}
                    >
                      <Trash2 size={16} />
                      Sil
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="s61-empty">
              <Bookmark size={42} />
              <h3>Henüz kayıtlı bilgi yok</h3>
              <button className="button primary" onClick={() => navigate('/chat')}>
                Sohbete dön
              </button>
            </div>
          )}
        </>
      )}
      <footer className="s59-footer">
        <LockKeyhole size={14} />
        Hafıza bu odayla sınırlıdır. Kişisel medya bağlantıları dahil edilmez.
      </footer>
      {ready && (view === 'save' || view === 'note') && (
        <Modal className="s61-modal" title="Oda hafızasına kaydet?" onClose={close}>
          <p>
            {props.roomName} / #{props.channelName} · Yalnızca bu oda.
          </p>
          {view === 'save' ? (
            <>
              <label className="field-label">
                Kaynak mesaj
                <select
                  aria-label="Kaynak mesaj seç"
                  disabled={!editable}
                  value={sourceId}
                  onChange={(event) => setSourceId(event.target.value)}
                >
                  <option value="">Mesaj seç</option>
                  {candidates.map((message) => (
                    <option value={message.id} key={message.id}>
                      {message.author.displayName || message.author.username} ·{' '}
                      {message.content.slice(0, 90)}
                    </option>
                  ))}
                </select>
              </label>
              {sourceId && (
                <blockquote>
                  {candidates.find((message) => message.id === sourceId)?.content}
                </blockquote>
              )}
              {!candidates.length && (
                <p>Bu odadan yüklü mesaj yok. Sohbeti açıp mesaj menüsünden kaydet.</p>
              )}
            </>
          ) : (
            <label className="field-label">
              Kaydedilecek bilgi
              <textarea
                aria-label="Kaydedilecek bilgi"
                maxLength={6000}
                value={text}
                disabled={!editable}
                onChange={(event) => setText(event.target.value)}
              />
            </label>
          )}
          <p className="reference-agent-description">
            Kaydı daha sonra silebilirsin. Otomatik saklama süresi bu hizmette sunulmuyor.
          </p>
          {error && <p role="alert">{error}</p>}
          <div className="button-row">
            <button className="button secondary" disabled={busy} onClick={close}>
              Vazgeç
            </button>
            <button
              className="button primary"
              disabled={!editable || (view === 'save' ? !sourceId : !text.trim())}
              title={!editable ? disabledReason : undefined}
              onClick={save}
            >
              <Bookmark size={16} />
              Hafızaya kaydet
            </button>
          </div>
        </Modal>
      )}
      {ready && view === 'source' && target && (
        <Modal className="s61-modal" title="Kaynak mesaj" onClose={close}>
          {source ? (
            <>
              <div className="s61-source-author">
                <UserRound size={24} />
                <div>
                  <strong>{source.author.displayName || source.author.username}</strong>
                  <small>
                    #{props.channelName} · {date(source.timestamp)}
                  </small>
                </div>
              </div>
              <blockquote>{source.content}</blockquote>
              <p className="reference-agent-description">Açıkça kaydedildi · Yalnızca bu oda.</p>
            </>
          ) : (
            <p role="status">
              {target.sourceMessageId && sources[target.sourceMessageId] === undefined
                ? 'Kaynak doğrulanıyor…'
                : 'Kaynak doğrulanamadı. Önizleme kapalı.'}
            </p>
          )}
          {error && <p role="alert">{error}</p>}
          <div className="button-row">
            <button className="button secondary" onClick={close}>
              Hafızaya dön
            </button>
            <button
              className="button primary"
              disabled={!source || props.fixture}
              title={
                props.fixture
                  ? referenceFixtureReason
                  : !source
                    ? 'Kaynak doğrulanmadı.'
                    : undefined
              }
              onClick={() => navigate(`/chat?message=${encodeURIComponent(source!.id)}`)}
            >
              <ArrowRight size={17} />
              Mesaja git
            </button>
          </div>
        </Modal>
      )}
      {ready && view === 'delete' && target && (
        <Modal
          className="s61-modal s61-delete-modal"
          title="Bu kaydı hafızadan sil?"
          onClose={close}
        >
          <p>{title(target)} sonraki asistan görevlerinde kullanılmayacak.</p>
          {readable(target) && <blockquote>{target.text}</blockquote>}
          <p className="reference-agent-description">Kaynak sohbet mesajı yerinde kalır.</p>
          {error && <p role="alert">{error}</p>}
          <div className="button-row">
            <button className="button secondary" disabled={busy} onClick={close}>
              Vazgeç
            </button>
            <button
              className="button danger"
              disabled={!editable}
              title={!editable ? disabledReason : undefined}
              onClick={remove}
            >
              <Trash2 size={16} />
              Hafızadan sil
            </button>
          </div>
        </Modal>
      )}
      {error && !view && (
        <div className="error-pane" role="alert">
          {error}
        </div>
      )}
    </section>
  );
}
