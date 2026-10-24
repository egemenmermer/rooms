import type {
  SocialAttachment,
  SocialChannel,
  SocialFriend,
  SocialSpace,
  SocialUser,
} from '@rooms/social';
import type { CommunityMessage, CommunityState } from '../community';
import type { CommunityNotification } from '../CommunitySettings';
import { people, places, sample } from './sample';

/**
 * Original passive artwork inlined as a data URI, so the S14 image renders without the private
 * reference folder (`ROOMS_REFERENCE_ROOT`). SVG in an <img> runs no script.
 */
export const S14_IMAGE_URL = `data:image/svg+xml,${encodeURIComponent(
  [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 200">',
    '<defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1">',
    '<stop offset="0" stop-color="#2b2350"/><stop offset=".55" stop-color="#b86b7a"/>',
    '<stop offset="1" stop-color="#f0b27a"/></linearGradient>',
    '<linearGradient id="w" x1="0" y1="0" x2="0" y2="1">',
    '<stop offset="0" stop-color="#3c4f7a"/><stop offset="1" stop-color="#1b2140"/></linearGradient></defs>',
    '<rect width="320" height="200" fill="url(#s)"/>',
    '<circle cx="214" cy="118" r="26" fill="#ffd9a0" opacity=".9"/>',
    '<rect y="124" width="320" height="76" fill="url(#w)"/>',
    '<path d="M150 136h128M178 148h76M196 160h40" stroke="#ffd9a0" stroke-width="3" stroke-linecap="round" opacity=".55"/>',
    '<path d="M0 124c40-22 70-30 104-18s52 8 76 18z" fill="#1f1a3a"/>',
    '</svg>',
  ].join(''),
)}`;

export const SOCIAL_DETAIL_FIXTURE_VARIANTS = {
  S12: ['default', 'blocked', 'nonfriend'],
  S13: ['default', 'empty', 'files', 'quick'],
  S14: ['default', 'failed', 'preview', 'uploading'],
  S15: ['default', 'expanded', 'invisible', 'status'],
  S16: ['default', 'empty'],
  S17: ['default', 'created', 'edit'],
  S18: ['default', 'delete', 'private', 'voice'],
} as const;
export type SocialDetailFixtureId = keyof typeof SOCIAL_DETAIL_FIXTURE_VARIANTS;
export type SocialDetailPublicState = Pick<
  CommunityState,
  | 'status'
  | 'user'
  | 'serverUrl'
  | 'remembered'
  | 'spaces'
  | 'channels'
  | 'dms'
  | 'activeSpaceId'
  | 'activeChannelId'
  | 'messages'
  | 'typing'
  | 'unread'
  | 'readStates'
  | 'presence'
  | 'error'
  | 'busy'
  | 'loadingMessages'
  | 'hasOlder'
>;

export interface SocialDetailQuickDestination {
  id: string;
  label: string;
  kind: 'voice' | 'text' | 'games';
  keywords: string[];
  channelId?: string;
  route?: '/games';
  memberCount?: number;
}

/** Opening intents only. The integration must use existing components and deny account mutations. */
export type SocialDetailUIIntent =
  | {
      surface: 'dm';
      peerId: string;
      relationship: SocialFriend['relationship'] | null;
      relationshipReady: true;
    }
  | {
      surface: 'search';
      initialMode: 'messages' | 'files' | 'quick';
      initialQuery: string;
      quickDestinations?: SocialDetailQuickDestination[];
    }
  | {
      surface: 'files';
      initialPreviewId?: string;
      initialUploadState?: 'unavailable' | 'failed';
      initialError?: string;
    }
  | {
      surface: 'profile';
      userId: string;
      initialView: 'profile' | 'expanded' | 'invisible' | 'status';
    }
  | {
      surface: 'notifications';
      items: Array<Omit<CommunityNotification, 'onOpen'>>;
      targets: Record<string, { route: string; channelId?: string; messageId?: string }>;
    }
  | {
      surface: 'community-editor';
      mode: 'create' | 'edit';
      draft: SocialSpace;
      description: string;
      createdReferenceRequested: boolean;
    }
  | {
      surface: 'channel-editor';
      mode: 'create' | 'delete';
      draft: SocialChannel;
      initialType: 'text' | 'voice';
      privateReferenceRequested: boolean;
    };

export interface SocialDetailFixtureMetadata {
  id: SocialDetailFixtureId;
  variant: string;
  integration_status: 'LOCAL_FIXTURE';
  demo: true;
  label: string;
  originalPath: string;
  route: string;
  /** Null never means visual acceptance or verification of a remote account. */
  unsupportedReason: string | null;
  pendingIntegration: string[];
}
export interface SocialDetailFixture {
  metadata: SocialDetailFixtureMetadata;
  publicState: SocialDetailPublicState;
  friends: SocialFriend[];
  ui: SocialDetailUIIntent;
  sidebarBadges?: { friends: number; notifications: number; dmUnread: Record<string, number> };
  profileDetails?: Record<
    string,
    {
      statusText?: string;
      about?: string;
      mutualSpaces?: Array<{ id: string; name: string }>;
      sharedFiles?: SocialAttachment[];
    }
  >;
  /** Fixed, local reference artwork only; not provider attachment capabilities. */
  assets: { avatars: Record<string, string>; attachments: Record<string, string> };
}

const referenceRoot = '<ROOMS_REFERENCE_ROOT>/04_screens';
const slugs: Record<SocialDetailFixtureId, string> = {
  S12: 'direct_message',
  S13: 'search_quick_switch',
  S14: 'file_sharing',
  S15: 'user_profile',
  S16: 'notifications',
  S17: 'community_editor',
  S18: 'channel_editor',
};
const spaceId = 'demo-bizim-oda';
const generalId = 'demo-channel-genel';
const shareId = 'demo-channel-paylasimlar';
const dmId = 'demo-dm-ece';
const pdfId = 'demo-weekend-list-pdf';
const imageId = 'demo-coast-svg';

function checked(id: string, value: string): { screen: SocialDetailFixtureId; variant: string } {
  if (!import.meta.env.DEV)
    throw new Error('Social detail fixtures are available only in development.');
  const screen = id.trim().toUpperCase();
  if (!Object.prototype.hasOwnProperty.call(SOCIAL_DETAIL_FIXTURE_VARIANTS, screen))
    throw new Error(`Unsupported social detail fixture screen: ${id}`);
  const variant = value.trim().toLowerCase() || 'default';
  if (
    !(
      SOCIAL_DETAIL_FIXTURE_VARIANTS[screen as SocialDetailFixtureId] as readonly string[]
    ).includes(variant)
  )
    throw new Error(`Unsupported ${screen} social detail fixture variant: ${value}`);
  return { screen: screen as SocialDetailFixtureId, variant };
}

export function getSocialDetailFixtureMetadata(
  id: string,
  value: string,
): SocialDetailFixtureMetadata {
  const { screen, variant } = checked(id, value);
  let unsupportedReason: string | null = null;
  const pendingIntegration: string[] = [
    'Exact local captures still require visual review against the immutable reference images.',
  ];
  if (screen === 'S12') {
    unsupportedReason =
      'The mutual-space and shared-PDF details are local reference fixtures; production shows only profile and attachment data returned by the connected server.';
  }
  if (screen === 'S13') {
    if (variant === 'quick')
      unsupportedReason = `The three quick-switch destinations and ${places.lounge} participant count are explicit local demo projections. Channel actions open installed local channels and ${sample('Oyun alanı', 'Games')} opens the existing /games route; no voice connection or remote presence is claimed.`;
    else
      unsupportedReason =
        'The actual search covers loaded messages, not a server-wide indexed history. The fixture provides only explicit local messages.';
  }
  if (screen === 'S14') {
    unsupportedReason =
      variant === 'uploading'
        ? 'Native attachment upload exposes neither byte progress nor cancellation. No ZIP, 65% progress, ongoing upload or cancellation success is fabricated.'
        : `The original ${sample('pazar-plani.png', 'sunday-plan.png')} is a prototype board-icon tile without a packaged PNG. Its sample attachment has no downloadable URL. The local PDF is 13,499 bytes, rather than the prototype label of 248 KB.`;
  }
  if (screen === 'S15') {
    unsupportedReason =
      variant === 'expanded'
        ? 'SocialUser does not expose bio, membership join date or favorite room. The actual expanded profile must retain its precise unavailable state.'
        : 'SocialUser does not expose the reference profile bio/banner or public membership detail. Those are not invented production profile fields.';
  }
  if (screen === 'S16') {
    unsupportedReason =
      'The normalized social contract has no aggregate activity/Agent notification feed or aggregate mark-all-read operation. These explicit local sample items cannot certify receipt of remote notifications.';
  }
  if (screen === 'S17') {
    unsupportedReason =
      variant === 'created'
        ? 'S17 created is a DEV local reference view only; no native community creation result or persistence is claimed.'
        : 'The native create/rename APIs support the community name. Description, icon upload and the reference invitation-only policy are not available in SocialSpace.';
  }
  if (screen === 'S18') {
    if (variant !== 'delete')
      unsupportedReason =
        'S18 member and role selections are local-only and are not persisted. Native channel creation does not include topic, category or initial-permission updates; no private ACL success is claimed.';
  }
  const route =
    screen === 'S12'
      ? '/dm'
      : screen === 'S14'
        ? '/files'
        : screen === 'S16'
          ? '/notifications'
          : '/chat';
  return {
    id: screen,
    variant,
    integration_status: 'LOCAL_FIXTURE',
    demo: true,
    label: sample('DEMO · Yerel örnek veriler', 'DEMO · Local sample data'),
    route,
    originalPath: `${referenceRoot}/${screen}_${slugs[screen]}${variant === 'default' ? '' : `__${variant}`}.png`,
    unsupportedReason,
    pendingIntegration,
  };
}

/** Fresh, pure public projections. No globals, native calls, callbacks, credentials or stores are accessed. */
export function getSocialDetailFixture(id: string, value: string): SocialDetailFixture {
  const metadata = getSocialDetailFixtureMetadata(id, value);
  const { id: screen, variant } = metadata;
  const names = ['deniz', 'ece', 'can', 'zeynep', 'mert'] as const;
  const users: Record<string, SocialUser> = Object.fromEntries(
    names.map((key) => {
      const displayName = people[key];
      return [
        key,
        { id: `demo-${key}`, username: displayName.toLowerCase(), displayName, avatar: null },
      ];
    }),
  );
  const space: SocialSpace = {
    id: spaceId,
    name: places.community,
    icon: null,
    ownerId: users.ece.id,
  };
  const channels: SocialChannel[] = [
    {
      id: generalId,
      spaceId,
      name: places.general,
      type: 0,
      topic: sample('Her şey burada başlar.', 'Where everything starts.'),
    },
    {
      id: 'demo-channel-film-gecesi',
      spaceId,
      name: places.movieNight,
      type: 0,
      topic: sample('Bu akşam ne izliyoruz?', 'What are we watching tonight?'),
    },
    { id: 'demo-channel-oyun-masasi', spaceId, name: places.gameTable, type: 0, topic: null },
    { id: shareId, spaceId, name: sample('paylaşımlar', places.shares), type: 0, topic: null },
    { id: 'demo-channel-salon', spaceId, name: places.lounge, type: 2, topic: null },
    { id: 'demo-channel-sessiz-kose', spaceId, name: places.quietCorner, type: 2, topic: null },
  ];
  const pdf: SocialAttachment = {
    id: pdfId,
    name: sample('hafta-sonu-listesi.pdf', 'weekend-list.pdf'),
    size: 248 * 1024,
    mime: 'application/pdf',
    url: '/__reference/06_handoff/examples/weekend-list.pdf',
  };
  const image: SocialAttachment = {
    id: imageId,
    name: sample('Kıyıda bir akşam', 'An evening by the coast'),
    size: 3172,
    mime: 'image/svg+xml',
    url: S14_IMAGE_URL,
  };
  const makeMessage = (
    key: string,
    author: string,
    timestamp: string,
    content: string,
    additions: Pick<CommunityMessage, 'attachments' | 'mentions' | 'reactions'> = {},
  ): CommunityMessage => ({
    id: `demo-detail-${key}`,
    channelId: generalId,
    author: { ...users[author] },
    timestamp,
    content,
    editedTimestamp: null,
    ...additions,
  });
  const messages = [
    makeMessage(
      'ece-film',
      'ece',
      '2026-10-10T18:42:00.000Z',
      sample(
        'Bu akşam filmi biraz erken açalım mı?',
        'Should we start the movie a bit early tonight?',
      ),
    ),
    makeMessage(
      'can-film',
      'can',
      '2026-10-09T18:43:00.000Z',
      sample('Birkaç film daha ekledim listeye.', 'Added a few more movies to the list.'),
    ),
    makeMessage(
      'deniz-film',
      'deniz',
      '2026-10-07T18:44:00.000Z',
      sample('Film gecesine hazırım.', 'Ready for movie night.'),
    ),
    makeMessage('zeynep-file', 'zeynep', '2026-10-10T18:45:00.000Z', '', { attachments: [pdf] }),
  ].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
  const publicState: SocialDetailPublicState = {
    status: 'connected',
    user: { ...users.deniz },
    serverUrl: '',
    remembered: false,
    spaces: [space],
    channels,
    dms: [],
    activeSpaceId: spaceId,
    activeChannelId: generalId,
    messages,
    typing: {},
    unread: {},
    readStates: {},
    presence: {
      [users.deniz.id]: 'online',
      [users.ece.id]: 'online',
      [users.can.id]: 'online',
      [users.zeynep.id]: 'online',
      [users.mert.id]: 'invisible',
    },
    error: null,
    busy: false,
    loadingMessages: false,
    hasOlder: false,
  };
  const friends: SocialFriend[] = ['ece', 'can', 'zeynep', 'mert'].map((name) => ({
    user: { ...users[name] },
    relationship: 'friend',
    status: name === 'mert' ? 'invisible' : 'online',
  }));
  let ui: SocialDetailUIIntent;
  if (screen === 'S12') {
    const transcript = [
      [
        'ece',
        '19:52',
        sample(
          'Bugün nasıldı? Akşam bir şeyler izleyelim mi?',
          'How was your day? Want to watch something tonight?',
        ),
      ],
      [
        'deniz',
        '19:54',
        sample(
          'Olur! Salon’da buluşuruz. Listeye birkaç film ekledim.',
          `Sure! Let's meet in the ${places.lounge}. I added a few movies to the list.`,
        ),
      ],
      [
        'ece',
        '20:03',
        sample(
          'Tamamdır. Diğerlerine de haber veriyorum.',
          "Sounds good. I'll let the others know.",
        ),
      ],
      [
        'deniz',
        '20:38',
        sample(
          'Ben geldim, istediğin zaman açabiliriz.',
          "I'm here, we can start whenever you want.",
        ),
      ],
      [
        'ece',
        '20:40',
        sample('Bir sonraki filmi sen seç istersen.', 'You can pick the next movie if you like.'),
      ],
    ];
    publicState.activeSpaceId = null;
    publicState.activeChannelId = dmId;
    publicState.messages = transcript.map(([author, time, content], index) => ({
      ...makeMessage(
        `dm-${index + 1}`,
        author,
        `2026-10-10T${new Date(`2026-10-10T${time}:00+02:00`).toISOString().slice(11, 19)}.000Z`,
        content,
      ),
      channelId: dmId,
      ...(index === 4 ? { reactions: { '2764': [users.deniz.id] } } : {}),
    }));
    publicState.dms = [
      {
        id: dmId,
        spaceId: null,
        name: people.ece,
        type: 1,
        topic: null,
        recipients: [{ ...users.deniz }, { ...users.ece }],
        lastMessageId: publicState.messages.at(-1)!.id,
      },
      ...(['can', 'zeynep', 'mert'] as const).map((name) => ({
        id: `demo-dm-${name}`,
        spaceId: null,
        name: users[name].displayName ?? users[name].username,
        type: 1 as const,
        topic: null,
        recipients: [{ ...users.deniz }, { ...users[name] }],
      })),
    ];
    publicState.unread[dmId] = true;
    ui = {
      surface: 'dm',
      peerId: users.ece.id,
      relationship: variant === 'blocked' ? 'blocked' : variant === 'nonfriend' ? null : 'friend',
      relationshipReady: true,
    };
    if (variant === 'blocked') friends[0].relationship = 'blocked';
    if (variant === 'nonfriend') friends.splice(0, 1);
  } else if (screen === 'S13') {
    ui = {
      surface: 'search',
      initialMode: variant === 'quick' ? 'quick' : variant === 'files' ? 'files' : 'messages',
      initialQuery:
        variant === 'quick'
          ? sample('salon', 'lounge')
          : variant === 'empty'
            ? sample('dağ bisikleti', 'mountain bike')
            : variant === 'files'
              ? 'pdf'
              : sample('film', 'movie'),
      ...(variant === 'quick'
        ? {
            quickDestinations: [
              {
                id: 'demo-switch-salon',
                label: places.lounge,
                kind: 'voice' as const,
                channelId: 'demo-channel-salon',
                memberCount: 4,
                keywords: [sample('salon', 'lounge')],
              },
              {
                id: 'demo-switch-film',
                label: places.movieNight,
                kind: 'text' as const,
                channelId: 'demo-channel-film-gecesi',
                keywords: [sample('salon', 'lounge'), places.movieNight],
              },
              {
                id: 'demo-switch-games',
                label: sample('Oyun alanı', 'Games'),
                kind: 'games' as const,
                route: '/games' as const,
                keywords: [sample('salon', 'lounge'), sample('oyun', 'games')],
              },
            ],
          }
        : {}),
    };
  } else if (screen === 'S14') {
    publicState.activeChannelId = shareId;
    publicState.messages = [
      {
        ...makeMessage('board-file', 'can', '2026-10-09T17:15:00.000Z', '', {
          attachments: [
            {
              id: 'demo-sunday-plan-png',
              name: sample('pazar-plani.png', 'sunday-plan.png'),
              size: 92 * 1024,
              mime: 'image/png',
            },
          ],
        }),
        channelId: shareId,
      },
      {
        ...makeMessage('coast-file', 'zeynep', '2026-10-10T18:45:00.000Z', '', {
          attachments: [image, pdf],
        }),
        channelId: shareId,
      },
    ];
    ui = {
      surface: 'files',
      ...(variant === 'preview' ? { initialPreviewId: imageId } : {}),
      ...(variant === 'uploading'
        ? {
            initialUploadState: 'unavailable' as const,
            initialError: sample(
              'Yükleme ilerlemesi ve iptali bu bağlantıda sunulmuyor.',
              'Upload progress and cancellation are not available on this connection.',
            ),
          }
        : {}),
      ...(variant === 'failed'
        ? {
            initialUploadState: 'failed' as const,
            initialError: sample(
              'Yerel görsel örnekte yükleme hatası. Yeniden deneme için gerçek bir dosya seçilmeli.',
              'Upload error in the local visual sample. Pick a real file to try again.',
            ),
          }
        : {}),
    };
  } else if (screen === 'S15') {
    if (variant === 'invisible') publicState.presence[users.deniz.id] = 'invisible';
    ui = {
      surface: 'profile',
      userId: users.deniz.id,
      initialView:
        variant === 'default' ? 'profile' : (variant as 'expanded' | 'invisible' | 'status'),
    };
  } else if (screen === 'S16') {
    publicState.dms = (['ece', 'can', 'zeynep', 'mert'] as const).map((name) => ({
      id: `demo-dm-${name}`,
      spaceId: null,
      name: users[name].displayName ?? users[name].username,
      type: 1 as const,
      topic: null,
      recipients: [{ ...users.deniz }, { ...users[name] }],
    }));
    if (variant !== 'empty') publicState.unread['demo-dm-ece'] = true;
    const items: Array<Omit<CommunityNotification, 'onOpen'>> =
      variant === 'empty'
        ? []
        : [
            {
              id: 'demo-notice-mention',
              kind: 'mention',
              title: sample(
                `${people.ece} seni #${places.general} kanalında etiketledi.`,
                `${people.ece} mentioned you in #${places.general}.`,
              ),
              detail: sample(
                `“${people.deniz}, sen de geliyor musun?”`,
                `“${people.deniz}, are you coming too?”`,
              ),
              timestampLabel: sample('3 dakika önce', '3 minutes ago'),
              unread: true,
              author: { ...users.ece },
              actionLabel: sample('Mesaja git', 'Go to message'),
            },
            {
              id: 'demo-notice-cinema',
              kind: 'activity',
              title: sample('Sinema’da film başladı.', 'A movie started in Cinema.'),
              detail: sample(
                `${people.ece}, ${people.can} ve ${people.zeynep} izliyor`,
                `${people.ece}, ${people.can} and ${people.zeynep} are watching`,
              ),
              timestampLabel: sample('6 dakika önce', '6 minutes ago'),
              unread: true,
              actionLabel: sample('Sinema’yı aç', 'Open Cinema'),
            },
            {
              id: 'demo-notice-agent',
              kind: 'agent',
              title: sample('Tayfa araştırmanı tamamladı.', 'Tayfa finished your research.'),
              detail: sample('Hafta sonu için 3 seçenek', '3 options for the weekend'),
              timestampLabel: sample('12 dakika önce', '12 minutes ago'),
              unread: true,
              actionLabel: sample('Tayfa Agent’ı aç', 'Open Tayfa Agent'),
            },
            {
              id: 'demo-notice-friend',
              kind: 'friend',
              title: sample(
                `${people.mert} arkadaş olmak istiyor.`,
                `${people.mert} wants to be friends.`,
              ),
              timestampLabel: sample('Bugün 19.10', 'Today 7:10 PM'),
              unread: false,
              author: { ...users.mert },
              actionLabel: sample('Arkadaşları aç', 'Open friends'),
            },
          ];
    if (variant !== 'empty') {
      publicState.messages.push(
        makeMessage(
          'notice-mention',
          'ece',
          '2026-10-10T18:47:00.000Z',
          sample(`${people.deniz}, sen de geliyor musun?`, `${people.deniz}, are you coming too?`),
          { mentions: [users.deniz.id] },
        ),
      );
      friends[friends.length - 1].relationship = 'incoming';
    }
    ui = {
      surface: 'notifications',
      items,
      targets:
        variant === 'empty'
          ? {}
          : {
              'demo-notice-mention': {
                route: '/chat',
                channelId: generalId,
                messageId: 'demo-detail-notice-mention',
              },
              'demo-notice-friend': { route: '/friends' },
              'demo-notice-cinema': { route: '/cinema' },
              'demo-notice-agent': { route: '/agent' },
            },
    };
  } else if (screen === 'S17') {
    ui = {
      surface: 'community-editor',
      mode: variant === 'edit' ? 'edit' : 'create',
      draft: { ...space },
      description: sample(
        'Arkadaşlarınla aynı yerde takıl.',
        'Hang out with your friends in one place.',
      ),
      createdReferenceRequested: variant === 'created',
    };
  } else {
    const voice = variant === 'voice';
    const draft = {
      ...channels.find(
        (channel) =>
          channel.id === (voice ? 'demo-channel-sessiz-kose' : 'demo-channel-film-gecesi'),
      )!,
      topic: sample('Bu akşam ne izliyoruz?', 'What are we watching tonight?'),
    };
    ui = {
      surface: 'channel-editor',
      mode: variant === 'delete' ? 'delete' : 'create',
      draft,
      initialType: voice ? 'voice' : 'text',
      privateReferenceRequested: variant === 'private',
    };
  }
  return {
    metadata,
    publicState,
    friends,
    ui,
    sidebarBadges: ['S12', 'S16'].includes(screen)
      ? {
          friends: 5,
          notifications: screen === 'S16' && variant === 'empty' ? 0 : 3,
          dmUnread: { [dmId]: 2 },
        }
      : undefined,
    profileDetails: {
      [users.ece.id]: {
        statusText: sample('Bugün bir şeyler izleyelim.', "Let's watch something today."),
        mutualSpaces: [{ id: spaceId, name: space.name }],
        sharedFiles: [{ ...pdf, id: 'demo-dm-weekend-list' }],
      },
      [users.deniz.id]: {
        statusText: sample(
          'Buradayım.\nİyi bir film, uzun bir sohbet.',
          "I'm here.\nA good movie, a long chat.",
        ),
        about: sample(
          'Katılma tarihi · 4 Ekim 2026\nEn sevdiği yer · Salon',
          `Joined · October 4, 2026\nFavorite place · ${places.lounge}`,
        ),
      },
    },
    assets: {
      avatars: Object.fromEntries(
        names.map((key) => [`demo-${key}`, `/__reference/01_brand/avatar-${key}.svg`]),
      ),
      attachments: {
        [pdfId]: '/__reference/06_handoff/examples/weekend-list.pdf',
        [imageId]: S14_IMAGE_URL,
      },
    },
  };
}
