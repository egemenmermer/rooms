import {
  AgentConnectionsSurface,
  AgentMemorySurface,
  AgentModelsSurface,
  type AgentConnectionsProps,
  type AgentMemoryProps,
  type AgentModelsProps,
} from '../Agent';
import type {
  AgentAuthoritySnapshot,
  AgentMemory,
  ModelConnection,
} from '../../../../packages/agent-contracts/src';
import type { SocialMessage } from '@rooms/social';
import { sample, people, places } from './sample';
/** Exact, opt-in development projections. No bridge or native mutation is supplied. */
export const S59_VARIANTS = [
  'default',
  'expired',
  'limit',
  'waiting',
  'claude_waiting',
  'choose',
  'error',
  'empty',
] as const;
export const S60_VARIANTS = [
  'default',
  'scope',
  'drive_scope',
  'error',
  'empty',
  'revoked',
] as const;
export const S61_VARIANTS = ['default', 'source', 'save', 'delete', 'empty', 'permission'] as const;
const userId = 'demo-deniz',
  roomId = 'demo-general';
function assertVariant(screen: string, variant: string, allowed: readonly string[]) {
  if (!allowed.includes(variant)) throw new Error(`Unsupported ${screen} variant: ${variant}`);
}
export function getS59Fixture(variant: string): AgentModelsProps {
  assertVariant('S59', variant, S59_VARIANTS);
  const models: ModelConnection[] =
    variant === 'empty'
      ? []
      : [
          {
            id: 'demo-openrouter',
            ownerId: userId,
            provider: 'openrouter',
            label: sample('Araştırma', 'Research'),
            model: 'demo-model',
            status: variant === 'limit' || variant === 'error' ? 'unavailable' : 'connected',
            reason:
              variant === 'limit'
                ? sample(
                    'Hesap limiti doldu. Başka bir hesaba geçilmedi.',
                    'The account limit was reached. Nothing switched to another account.',
                  )
                : variant === 'error'
                  ? sample(
                      'Anahtar doğrulanamadı. Hesabındaki erişimi kontrol et.',
                      'The key could not be verified. Check the access on your account.',
                    )
                  : undefined,
          },
          {
            id: 'demo-codex',
            ownerId: userId,
            provider: 'codex',
            label: `Codex · ${people.deniz}`,
            model: 'demo-codex',
            status: variant === 'expired' ? 'login-required' : 'connected',
            reason:
              variant === 'expired'
                ? sample(
                    'Resmî giriş süresi doldu. Ayrı sunucuda yeniden giriş gerekli.',
                    'The official sign-in expired. Sign in again on the separate server.',
                  )
                : undefined,
          },
        ];
  return {
    models,
    userId,
    ready: true,
    fixture: true,
    fixtureView: variant,
    onRefresh: async () => {},
  };
}
export function getS60Fixture(variant: string): AgentConnectionsProps {
  assertVariant('S60', variant, S60_VARIANTS);
  const authority: AgentAuthoritySnapshot = {
    userId,
    roomId,
    canManage: false,
    yolo: false,
    principals: [],
    scopes:
      variant === 'empty'
        ? []
        : [
            {
              kind: 'github',
              read: true,
              write: true,
              resources: ['rooms-space/film-night-notes'],
            },
            {
              kind: 'drive',
              read: true,
              write: true,
              resources:
                variant === 'revoked' ? [] : [sample('Film-gecesi-plani', 'Movie-night-plan')],
            },
            {
              kind: 'drive',
              read: true,
              write: false,
              resources: variant === 'revoked' ? [] : [sample('Izleme-listesi', 'Watchlist')],
            },
          ],
    discord: { state: 'not-configured', mentionOnly: true, mappings: [] },
    permissionsMutable: false,
    configurationSource: 'server-admin',
  };
  return {
    authority,
    userId,
    roomId,
    roomName: places.community,
    channelName: places.general,
    fixture: true,
    fixtureView: variant,
    error:
      variant === 'error'
        ? sample(
            'Yerel demo: Drive bağlantısı doğrulanamadı. Yeni işlemler bekletiliyor.',
            'Local demo: the Drive connection could not be verified. New operations are on hold.',
          )
        : undefined,
    onRefresh: async () => {},
  };
}
const sampleMessages: SocialMessage[] = [
  [
    'demo-memory-source-1',
    'ece',
    people.ece,
    sample(
      'Film gecelerini genelde cumartesi 21.00’de yapalım. İzlerken herkes kendi kaynağını seçsin.',
      'Let’s usually do movie nights on Saturday at 9:00 PM. Everyone picks their own source while watching.',
    ),
  ],
  [
    'demo-memory-source-2',
    'can',
    people.can,
    sample(
      'Film gecesi planı, bu odaya açıkça izin verilen Google Drive dosyasında tutuluyor.',
      'The movie night plan lives in a Google Drive file this room was explicitly given access to.',
    ),
  ],
  [
    'demo-memory-source-3',
    'deniz',
    people.deniz,
    sample(
      'Kısa akşamlarda Blackjack; dört kişi olduğumuzda Batak tercih ediyoruz.',
      'Blackjack on short evenings; when there are four of us we go for Batak.',
    ),
  ],
].map(([id, key, name, content]) => ({
  id,
  channelId: roomId,
  author: { id: `demo-${key}`, username: name, displayName: name, avatar: null },
  content,
  timestamp: '2026-10-08T18:30:00Z',
  editedTimestamp: null,
  attachments: [],
}));
export function getS61Fixture(variant: string): AgentMemoryProps {
  assertVariant('S61', variant, S61_VARIANTS);
  const texts = [
    sample(
      'Cumartesi 21.00’de buluşuyoruz. Herkes kendi kaynağıyla senkron katılıyor.',
      'We meet on Saturday at 9:00 PM. Everyone joins in sync with their own source.',
    ),
    sample(
      'Film gecesi planı, bu odaya açıkça izin verilen Google Drive dosyasında tutuluyor.',
      'The movie night plan lives in a Google Drive file this room was explicitly given access to.',
    ),
    sample(
      'Kısa akşamlarda Blackjack; dört kişi olduğumuzda Batak tercih ediyoruz.',
      'Blackjack on short evenings; when there are four of us we go for Batak.',
    ),
  ];
  const memories: AgentMemory[] =
    variant === 'empty'
      ? []
      : sampleMessages.map((message, i) => ({
          id: `demo-memory-${i}`,
          roomId,
          authorId: i === 2 ? userId : message.author.id,
          text: texts[i],
          sourceMessageId: message.id,
          createdAt: message.timestamp,
        }));
  return {
    memories,
    userId,
    roomId,
    roomName: places.community,
    channelName: places.general,
    ready: true,
    fixture: true,
    fixtureView: variant,
    fixtureSources: Object.fromEntries(
      sampleMessages.map((message, i) => [
        message.id,
        variant === 'permission' && i === 0 ? null : message,
      ]),
    ),
    sourceCandidates: sampleMessages,
    onRefresh: async () => {},
  };
}
export default function S59S61Entry() {
  const query = new URLSearchParams(window.location.search),
    screen = query.get('fixture'),
    variant = query.get('variant') || 'default';
  if (screen === 'S59') return <AgentModelsSurface {...getS59Fixture(variant)} />;
  if (screen === 'S60') return <AgentConnectionsSurface {...getS60Fixture(variant)} />;
  if (screen === 'S61') return <AgentMemorySurface {...getS61Fixture(variant)} />;
  throw new Error('Unsupported personal-agent fixture');
}
