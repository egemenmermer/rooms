import type {
  PersonalChannel,
  PersonalLibraryItem,
  ProviderBridge,
  ProviderConnection,
} from '../../electron/provider-contracts';
import { installPersonalProviderFixture } from '../personal-provider-runtime';
import { sample } from './sample';

const allowed = {
  S33: ['default', 'empty', 'offline', 'iptv_removed'],
  S34: ['default', 'xtream', 'checking', 'error', 'edit', 'remove'],
  S35: ['default', 'empty', 'no_guide'],
  S36: ['default', 'buffering', 'error', 'expired', 'rewound'],
  S37: ['default', 'waiting', 'expired', 'cancelled', 'connected', 'error'],
  S38: ['default', 'empty', 'details', 'playing'],
  S39: ['default', 'unsupported', 'external'],
} as const;
export type PersonalMediaFixtureScreen = keyof typeof allowed;
export interface PersonalMediaFixtureSeed {
  label: 'DEV fixture · local demo';
  initialView: 'home' | 'channels' | 'library';
  initialDialog: 'playlist' | 'xtream' | 'rd' | null;
  selectedConnectionId?: string;
  /** Root/capture applies this through actual component interactions. */
  intent: {
    screen: PersonalMediaFixtureScreen;
    variant: string;
    channelId: string;
    libraryItemId: string;
  };
}
const playlistId = '00000000-0000-4000-8000-000000000033',
  rdId = '00000000-0000-4000-8000-000000000037';
const installedSeeds: PersonalMediaFixtureSeed[] = [];

export function getPersonalMediaFixtureSeed(): PersonalMediaFixtureSeed | null {
  const seed = import.meta.env.DEV ? installedSeeds.at(-1) : undefined;
  return seed ? structuredClone(seed) : null;
}
const label = 'DEV fixture · local demo' as const;
const unavailable = sample(
  'DEV fixture: oynatma kaynağı yok; gerçek hesap, medya isteği veya harici uygulama kullanılmaz.',
  'DEV fixture: there is no playback source; no real account, media request or external app is used.',
);

/** Metadata only. This module must be dynamically imported inside a DEV bootstrap branch. */
export function installPersonalMediaFixture(
  screenValue: string,
  variantValue = 'default',
): { dispose(): void; seed: PersonalMediaFixtureSeed } {
  if (!import.meta.env.DEV)
    throw new Error('Personal media fixtures are unavailable in production.');
  const screen = screenValue.trim().toUpperCase() as PersonalMediaFixtureScreen;
  const variant = variantValue.trim().toLowerCase() || 'default';
  if (
    !Object.hasOwn(allowed, screen) ||
    !(allowed[screen] as readonly string[]).includes(variant)
  ) {
    throw new Error(`Unsupported personal media fixture: ${screenValue}/${variantValue}`);
  }
  let disposed = false,
    cancelled = false,
    nextConnection = 1000;
  const pending = new Set<(reason: Error) => void>();
  const assertActive = () => {
    if (disposed) throw new Error('DEV fixture disposed.');
  };
  const copy = <T>(value: T): T => structuredClone(value);
  const connection = (
    type: ProviderConnection['type'],
    id: string,
    name: string,
  ): ProviderConnection => ({
    id,
    type,
    name: `${name} · ${label}`,
    status: 'connected',
    channelCount: type === 'real-debrid' ? 0 : 5,
  });
  let connections = [
    connection('playlist', playlistId, sample('Kişisel IPTV', 'Personal IPTV')),
    connection('real-debrid', rdId, 'Real-Debrid'),
  ];
  if (screen === 'S33' && variant === 'empty') connections = [];
  if (screen === 'S33' && variant === 'iptv_removed')
    connections = connections.filter((c) => c.type === 'real-debrid');
  if (screen === 'S33' && variant === 'offline')
    connections = connections.map((c) => ({ ...c, status: 'error' }));
  if (screen === 'S36' && variant === 'expired') connections[0].status = 'auth-expired';
  if (screen === 'S37' && variant !== 'connected')
    connections = connections.filter((c) => c.type !== 'real-debrid');
  let channels: PersonalChannel[] = [
    {
      id: 'dev-fixture-kiyi',
      name: `${sample('Kıyı TV', 'Shore TV')} · ${label}`,
      group: sample('Genel', 'General'),
      favorite: true,
    },
    {
      id: 'dev-fixture-rota',
      name: `${sample('Rota', 'Route')} · ${label}`,
      group: sample('Belgesel', 'Documentary'),
      favorite: true,
    },
    {
      id: 'dev-fixture-sahne',
      name: `${sample('Açık Sahne', 'Open Stage')} · ${label}`,
      group: sample('Kültür & sanat', 'Culture & arts'),
      favorite: false,
    },
    {
      id: 'dev-fixture-dunya',
      name: `${sample('Dünya', 'World')} · ${label}`,
      group: sample('Belgesel', 'Documentary'),
      favorite: false,
    },
    {
      id: 'dev-fixture-cizgi',
      name: `${sample('Çizgi', 'Toons')} · ${label}`,
      group: sample('Çocuk', 'Kids'),
      favorite: false,
    },
  ];
  const library: PersonalLibraryItem[] = (
    screen === 'S38' && variant === 'empty'
      ? []
      : [
          sample('Gecenin Kıyısında', 'On the Night Shore'),
          sample('Şehir Uyurken', 'While the City Sleeps'),
          sample('Pazar Yolculuğu', 'Sunday Journey'),
          sample('Son Vapurlar', 'The Last Ferries'),
        ]
  ).map((name, i) => ({
    id: `dev-fixture-library-${i}`,
    name: `${name} · ${label}`,
    size: (1400 + i * 200) * 1024 * 1024,
    mime: 'video/mp4',
    addedAt: '2026-10-08T18:00:00.000Z',
    resumeAt: i < 2 ? 1280 + i * 1500 : 0,
  }));
  const lookup = (id: string, type?: ProviderConnection['type']) => {
    assertActive();
    const found = connections.find((c) => c.id === id && (!type || c.type === type));
    if (!found)
      throw new Error(
        sample(
          'DEV fixture: kişisel bağlantı bulunamadı.',
          'DEV fixture: personal connection not found.',
        ),
      );
    return found;
  };
  const connect = async (type: 'playlist' | 'xtream', name: string) => {
    assertActive();
    if (screen === 'S34' && variant === 'checking')
      return new Promise<ProviderConnection>((_resolve, reject) => pending.add(reject));
    if (screen === 'S34' && variant === 'error')
      throw new Error(
        sample(
          'DEV fixture: yerel bağlantı kontrolü başarısız; ağ isteği yapılmadı.',
          'DEV fixture: the local connection check failed; no network request was made.',
        ),
      );
    const next = connection(
      type,
      `00000000-0000-4000-8000-${String(nextConnection++).padStart(12, '0')}`,
      name.trim() || sample('Kişisel IPTV', 'Personal IPTV'),
    );
    connections.push(next);
    return copy(next);
  };
  const update = async (id: string, type: 'playlist' | 'xtream', name: string) => {
    const current = lookup(id, type);
    current.name = `${name.trim() || sample('Kişisel IPTV', 'Personal IPTV')} · ${label}`;
    return copy(current);
  };
  const bridge: ProviderBridge = {
    async recentChannels(id) {
      lookup(id);
      return [];
    },
    async acknowledgePlayback() {
      throw new Error(unavailable);
    },
    async status() {
      assertActive();
      return copy(connections);
    },
    connectPlaylist: (input) => connect('playlist', input.name),
    connectXtream: (input) => connect('xtream', input.name),
    updatePlaylist: (input) => update(input.id, 'playlist', input.name),
    updateXtream: (input) => update(input.id, 'xtream', input.name),
    async pickPlaylist() {
      assertActive();
      return null;
    },
    async playlistFile() {
      assertActive();
      throw new Error(
        sample(
          'DEV fixture: yerel dosya seçimi yapılmadı.',
          'DEV fixture: no local file was picked.',
        ),
      );
    },
    async channels(id) {
      lookup(id);
      return copy(channels);
    },
    async epg(id, channelId) {
      lookup(id);
      if (!channels.some((c) => c.id === channelId))
        throw new Error(
          sample('DEV fixture: kanal bulunamadı.', 'DEV fixture: channel not found.'),
        );
      return screen === 'S35' && variant === 'no_guide'
        ? []
        : [
            {
              title: `${sample('Şehrin kıyısında', 'On the city shore')} · ${label}`,
              description: sample('Yerel örnek program bilgisi.', 'Local sample program info.'),
              startsAt: new Date(Date.now() - 1800000).toISOString(),
              endsAt: new Date(Date.now() + 1800000).toISOString(),
            },
          ];
    },
    async guide(id, channelIds) {
      lookup(id);
      if (
        channelIds.length > 32 ||
        channelIds.some((channelId) => !channels.some((channel) => channel.id === channelId))
      )
        throw new Error(
          sample('DEV fixture: geçersiz rehber kanalları.', 'DEV fixture: invalid guide channels.'),
        );
      if (screen === 'S35' && variant === 'no_guide')
        return { status: 'not-configured', programs: {} };
      const programs = Object.fromEntries(
        await Promise.all(
          channelIds.map(async (channelId) => [channelId, await bridge.epg(id, channelId)]),
        ),
      );
      return { status: 'available', programs };
    },
    async favorite(id, channelId, value) {
      lookup(id);
      const item = channels.find((c) => c.id === channelId);
      if (!item)
        throw new Error(
          sample('DEV fixture: kanal bulunamadı.', 'DEV fixture: channel not found.'),
        );
      item.favorite = value;
    },
    async play(id, channelId) {
      lookup(id);
      if (!channels.some((c) => c.id === channelId))
        throw new Error(
          sample('DEV fixture: kanal bulunamadı.', 'DEV fixture: channel not found.'),
        );
      throw new Error(unavailable);
    },
    async saveResume() {
      assertActive();
      throw new Error(
        sample(
          'DEV fixture: oynatma kaynağı olmadığı için ilerleme kaydedilemez.',
          'DEV fixture: progress cannot be saved because there is no playback source.',
        ),
      );
    },
    async disconnect(id) {
      lookup(id);
      connections = connections.filter((c) => c.id !== id);
    },
    async rdStart() {
      assertActive();
      cancelled = false;
      if (screen === 'S37' && variant === 'error')
        throw new Error(
          sample(
            'DEV fixture: yerel yetkilendirme örneği başarısız; sağlayıcıya bağlanılmadı.',
            'DEV fixture: the local authorization sample failed; the provider was not contacted.',
          ),
        );
      return {
        userCode: 'DEV-DEMO',
        verificationUrl: 'about:blank',
        expiresAt:
          variant === 'expired'
            ? '2000-01-01T00:00:00.000Z'
            : new Date(Date.now() + 600000).toISOString(),
        interval: 5,
      };
    },
    async rdPoll() {
      assertActive();
      return { state: cancelled || variant === 'expired' ? 'expired' : 'pending' };
    },
    async rdCancel() {
      assertActive();
      cancelled = true;
    },
    async rdLibrary() {
      lookup(rdId, 'real-debrid');
      return copy(library);
    },
    async rdPlay(id) {
      lookup(rdId, 'real-debrid');
      if (!library.some((c) => c.id === id))
        throw new Error(sample('DEV fixture: içerik bulunamadı.', 'DEV fixture: item not found.'));
      throw new Error(unavailable);
    },
  };
  const uninstall = installPersonalProviderFixture(bridge);
  const initialView =
    screen === 'S35' || screen === 'S36'
      ? 'channels'
      : screen === 'S38' || screen === 'S39'
        ? 'library'
        : 'home';
  const seed: PersonalMediaFixtureSeed = {
    label,
    initialView,
    initialDialog:
      screen === 'S34'
        ? variant === 'xtream'
          ? 'xtream'
          : variant === 'remove'
            ? null
            : 'playlist'
        : screen === 'S37'
          ? 'rd'
          : null,
    ...(initialView !== 'home' || (screen === 'S34' && (variant === 'edit' || variant === 'remove'))
      ? { selectedConnectionId: initialView === 'library' ? rdId : playlistId }
      : {}),
    intent: {
      screen,
      variant,
      channelId: 'dev-fixture-kiyi',
      libraryItemId: 'dev-fixture-library-0',
    },
  };
  installedSeeds.push(seed);
  return {
    seed: copy(seed),
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelled = true;
      uninstall();
      const seedIndex = installedSeeds.indexOf(seed);
      if (seedIndex !== -1) installedSeeds.splice(seedIndex, 1);
      for (const reject of pending)
        reject(new Error('DEV fixture disposed; local operation cancelled.'));
      pending.clear();
      connections = [];
      channels = [];
      library.splice(0);
    },
  };
}
