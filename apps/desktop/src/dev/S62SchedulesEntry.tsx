import { AgentSchedulesSurface, type AgentSchedulesProps } from '../Agent';
import type { AgentTask, ModelConnection } from '../../../../packages/agent-contracts/src';
import { sample, places } from './sample';
/** Explicit DEV projection. No bridge is supplied, so account mutations are impossible. */
export const S62_VARIANTS = [
  'default',
  'create',
  'created',
  'cancel',
  'cancelled',
  'completed',
  'failed',
  'empty',
] as const;
export function getS62Fixture(variant: string): AgentSchedulesProps {
  if (!S62_VARIANTS.includes(variant as (typeof S62_VARIANTS)[number]))
    throw new Error(`Unsupported S62 variant: ${variant}`);
  const model: ModelConnection = {
    id: 's62-demo-model',
    ownerId: 's62-demo-owner',
    provider: 'openrouter',
    label: sample('OpenRouter / Araştırma', 'OpenRouter / Research'),
    model: 'demo-model',
    status: 'connected',
  };
  const task: AgentTask = {
    id: 's62-demo-task',
    roomId: 's62-demo-room',
    ownerId: model.ownerId,
    modelConnectionId: model.id,
    prompt: sample('Film gecesi planını hazırla', 'Put together the movie night plan'),
    createdAt: '2026-10-10T17:00:00Z',
    runAt: '2026-10-10T19:00:00Z',
    state:
      variant === 'cancelled'
        ? 'cancelled'
        : variant === 'completed'
          ? 'completed'
          : variant === 'failed'
            ? 'failed'
            : 'scheduled',
    progress: [],
    result: variant === 'completed' ? sample('Yerel demo sonucu', 'Local demo result') : null,
    artifacts: [],
    error:
      variant === 'failed'
        ? sample(
            'Kişisel model bağlantısı kullanılamıyor.',
            'The personal model connection is unavailable.',
          )
        : null,
  };
  const tasks: AgentTask[] = [
    {
      ...task,
      id: 's62-demo-history-1',
      prompt: sample('Hafta sonu planını özetle', 'Summarize the weekend plan'),
      state: 'completed',
      runAt: '2026-10-09T18:00:00Z',
      createdAt: '2026-10-09T16:00:00Z',
    },
    {
      ...task,
      id: 's62-demo-history-2',
      prompt: sample('İzleme listesini düzenle', 'Tidy up the watchlist'),
      state: 'completed',
      runAt: '2026-10-08T17:30:00Z',
      createdAt: '2026-10-08T16:00:00Z',
    },
  ];
  if (variant !== 'empty') tasks.unshift(task);
  return {
    tasks,
    models: [model],
    userId: model.ownerId,
    roomId: task.roomId,
    roomName: places.community,
    channelName: places.general,
    ready: true,
    fixture: true,
    fixtureView: variant,
    onRefresh: async () => {},
    initialPrompt:
      variant === 'create'
        ? sample(
            'Bu odadaki film gecesi kararlarını özetle ve plan dosyasını hazırla.',
            'Summarize the movie night decisions in this room and prepare the plan file.',
          )
        : '',
    initialDate: '2026-10-10',
    initialTime: '21:00',
    fixtureNotice:
      variant === 'created'
        ? sample(
            'Yerel demo: Görev planlandı. 10 Ekim 2026 · 21.00 · Europe/Amsterdam · Bir kez.',
            'Local demo: Task scheduled. October 10, 2026 · 9:00 PM · Europe/Amsterdam · Once.',
          )
        : undefined,
  };
}
export default function S62SchedulesEntry() {
  const query = new URLSearchParams(window.location.search),
    variant = query.get('variant') || 'default';
  return <AgentSchedulesSurface {...getS62Fixture(variant)} />;
}
