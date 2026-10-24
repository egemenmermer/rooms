import type { AgentArtifactPreview, AgentTask, ModelConnection } from '@rooms/agent-contracts';
import { sample, people, places } from './sample';

export const AGENT_TASK_FIXTURE_VARIANTS = {
  S56: [
    'default',
    'approval',
    'completed',
    'failed',
    'offline',
    'running',
    'stopped',
    'waiting',
    '1280x800',
    '900x700',
    '1920x1080',
  ],
  S57: ['default', 'empty', 'preview_error', 'sources'],
  S58: ['default', 'approved', 'rejected', 'unauthorized', 'uncertain'],
} as const;
export interface AgentTaskFixture {
  task: AgentTask;
  models: ModelConnection[];
  userId: string;
  roomName: string;
  view: 'task' | 'result';
  modal?: 'approval' | 'uncertain';
  initialTab?: 'sources';
  fixturePreview?: AgentArtifactPreview;
  connected: boolean;
  canManage: false;
  metadata: {
    id: 'S56' | 'S57' | 'S58';
    variant: string;
    integration_status: 'LOCAL_FIXTURE';
    demo: true;
    label: string;
    originalPath: string;
    unsupportedReason: string | null;
  };
}

/** Pure explicit DEV samples. No store installation, credentials, native access, timers or mutations. */
export function getAgentTaskFixture(id: string, value: string): AgentTaskFixture {
  if (!import.meta.env.DEV)
    throw new Error('Agent task fixtures are available only in development.');
  const screen = id.trim().toUpperCase();
  if (screen !== 'S56' && screen !== 'S57' && screen !== 'S58')
    throw new Error(`Unsupported Agent task fixture screen: ${id}`);
  const variant = value.trim().toLowerCase() || 'default';
  if (!(AGENT_TASK_FIXTURE_VARIANTS[screen] as readonly string[]).includes(variant))
    throw new Error(`Unsupported ${screen} Agent task fixture variant: ${value}`);
  const taskId = '56565656-5656-4565-8565-565656565656',
    modelId = '59595959-5959-4595-8595-595959595959',
    artifactId = '57575757-5757-4575-8575-575757575757';
  const operationId = '58'.repeat(32);
  const pending = {
    operationId,
    tool: 'drive_write',
    description: sample(
      'Film gecesi planı dosyasına bölüm ekle',
      'Add a section to the movie night plan file',
    ),
    preview: sample(
      '+ Bu akşamın planı\n+ 21.00 — Salon’da buluşuyoruz.\n+ Herkes kendi kaynağıyla senkron katılıyor.\n+ Sonraki filmi birlikte seçiyoruz.',
      '+ Tonight’s plan\n+ 9:00 PM — We meet in the Lounge.\n+ Everyone joins in sync with their own source.\n+ We pick the next movie together.',
    ),
  };
  const task: AgentTask = {
    id: taskId,
    roomId: 'demo-channel-genel',
    ownerId: 'demo-deniz',
    modelConnectionId: modelId,
    kind: 'model',
    prompt: sample(
      'Bu akşamın film gecesi planını konuşmalardan çıkar, bir dosya hazırla.',
      'Pull tonight’s movie night plan out of the conversations and put together a file.',
    ),
    state: 'running',
    progress: [
      sample('İstek alındı', 'Request received'),
      sample('Kaynaklar okunuyor', 'Reading sources'),
      sample('Plan hazırlanıyor', 'Preparing the plan'),
    ],
    result: null,
    artifacts: [],
    createdAt: '2026-10-10T18:02:00.000Z',
    runAt: null,
    error: null,
  };
  const models: ModelConnection[] = [
    {
      id: modelId,
      ownerId: 'demo-deniz',
      provider: 'openrouter',
      label: `OpenRouter · ${people.deniz}`,
      model: sample('Deniz’in kişisel seçimi', 'Maya’s personal pick'),
      status: 'connected',
    },
  ];
  let unsupportedReason: string | null = null;
  if (screen === 'S56') {
    if (variant === 'waiting') {
      task.state = 'queued';
      task.progress = [];
    }
    if (variant === 'approval') {
      task.state = 'awaiting-approval';
      task.pendingApproval = { ...pending };
    }
    if (variant === 'stopped') {
      task.state = 'cancelled';
      task.progress = [
        sample('İstek alındı', 'Request received'),
        sample('Kaynaklar okunuyor', 'Reading sources'),
      ];
    }
    if (variant === 'failed') {
      task.state = 'failed';
      task.error = sample(
        'Kişisel bağlantının limiti doldu.',
        'The personal connection hit its limit.',
      );
      models[0].status = 'unavailable';
      models[0].reason = task.error;
    }
  }
  if (
    screen === 'S57' ||
    (screen === 'S56' && variant === 'completed') ||
    (screen === 'S58' && variant === 'approved')
  ) {
    task.state = 'completed';
    task.progress = [
      sample('İstek alındı', 'Request received'),
      sample('Plan hazırlandı', 'Plan prepared'),
      sample('Sonuç ve dosya hazır', 'Result and file ready'),
    ];
    task.result = sample(
      'Bu akşam 21.00’de Salon’da buluşuyoruz. Herkes kendi kaynağını seçecek.',
      'We meet in the Lounge at 9:00 PM tonight. Everyone will pick their own source.',
    );
    if (variant !== 'empty')
      task.artifacts = [
        {
          id: artifactId,
          name: sample('film-gecesi-plani.md', 'movie-night-plan.md'),
          mime: 'text/markdown',
          size: 398,
        },
      ];
  }
  if (screen === 'S58') {
    if (variant === 'uncertain') {
      task.state = 'interrupted';
      task.uncertainOperation = { ...pending };
      task.error = sample(
        'Dış işlem yanıtı alınamadı.',
        'No response was received from the external operation.',
      );
    } else if (variant === 'rejected') {
      task.state = 'cancelled';
      unsupportedReason =
        'AgentTask has no persisted rejection receipt or target-change proof. The safe projection shows a cancelled task, not a fabricated rejected-operation confirmation.';
    } else if (variant === 'approved')
      unsupportedReason =
        'AgentTask has no operation completion receipt, approving identity/time or target-file proof. A completed sample task does not certify a Drive write.';
    else {
      task.state = 'awaiting-approval';
      task.pendingApproval = { ...pending };
    }
  }
  if (screen === 'S57' && variant === 'sources')
    unsupportedReason =
      'The service has no persisted source-message list. The renderer displays the precise unavailable state; fictional source messages and source count are not projected.';
  const artifact = task.artifacts[0];
  const fixturePreview: AgentArtifactPreview | undefined = artifact
    ? variant === 'preview_error'
      ? {
          taskId,
          sourcesAvailable: false,
          artifact: { ...artifact },
          state: 'unsupported',
          reason: 'unsupported-type',
        }
      : {
          taskId,
          sourcesAvailable: false,
          artifact: { ...artifact },
          state: 'text',
          encoding: 'utf-8',
          text: sample(
            'BİZİM ODA / 10 EKİM 2026\n\nFilm gecesi planı\n\nBu akşamın planı\n\n1. 21.00 — Salon’da buluşuyoruz.\n   Katılanlar ses odasına geçiyor.\n2. Herkes kendi kaynağını seçiyor.\n   Cinema’da kişisel kaynakla senkron izleme kullanılıyor.\n3. Önce kısa bir şey izliyoruz.\n   Sonraki içerik için birlikte karar veriyoruz.\n\nBu metin yalnızca yerel görsel örnektir.',
            'OUR PLACE / OCTOBER 10, 2026\n\nMovie night plan\n\nTonight’s plan\n\n1. 9:00 PM — We meet in the Lounge.\n   Everyone joins the voice room.\n2. Everyone picks their own source.\n   Cinema uses synced watching with a personal source.\n3. We start with something short.\n   We decide on the next pick together.\n\nThis text is only a local visual sample.',
          ),
        }
    : undefined;
  // Metadata measures the exact local bytes; it is not a claim about remote storage.
  if (fixturePreview?.state === 'text') {
    const size = new TextEncoder().encode(fixturePreview.text).length;
    fixturePreview.artifact.size = size;
    if (artifact) artifact.size = size;
  }
  const slug =
    screen === 'S56'
      ? 'assistant_task'
      : screen === 'S57'
        ? 'assistant_result_files'
        : 'assistant_action_approval';
  return {
    task,
    models,
    userId: screen === 'S58' && variant === 'unauthorized' ? 'demo-ece' : 'demo-deniz',
    roomName: `#${places.general} · ${places.community}`,
    view: screen === 'S57' ? 'result' : 'task',
    connected: variant !== 'offline',
    canManage: false,
    ...(screen === 'S58' && ['default', 'unauthorized'].includes(variant)
      ? { modal: 'approval' as const }
      : {}),
    ...(screen === 'S58' && variant === 'uncertain' ? { modal: 'uncertain' as const } : {}),
    ...(variant === 'sources' ? { initialTab: 'sources' as const } : {}),
    fixturePreview,
    metadata: {
      id: screen,
      variant,
      integration_status: 'LOCAL_FIXTURE',
      demo: true,
      label: sample('DEMO · Yerel Agent görevi örneği', 'DEMO · Local Agent task sample'),
      unsupportedReason,
      originalPath: `<ROOMS_REFERENCE_ROOT>/04_screens/${screen}_${slug}${variant === 'default' ? '' : `__${variant}`}.png`,
    },
  };
}
