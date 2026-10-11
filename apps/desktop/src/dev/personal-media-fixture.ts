import type { PersonalChannel, PersonalLibraryItem, ProviderBridge, ProviderConnection } from '../../electron/provider-contracts';
import { installPersonalProviderFixture } from '../personal-provider-runtime';

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
  intent: { screen: PersonalMediaFixtureScreen; variant: string; channelId: string; libraryItemId: string };
}
const playlistId = '00000000-0000-4000-8000-000000000033', rdId = '00000000-0000-4000-8000-000000000037';
const installedSeeds: PersonalMediaFixtureSeed[] = [];

export function getPersonalMediaFixtureSeed(): PersonalMediaFixtureSeed | null {
  const seed = import.meta.env.DEV ? installedSeeds.at(-1) : undefined;
  return seed ? structuredClone(seed) : null;
}
const label = 'DEV fixture · local demo' as const;
const unavailable = 'DEV fixture: oynatma kaynağı yok; gerçek hesap, medya isteği veya harici uygulama kullanılmaz.';

/** Metadata only. This module must be dynamically imported inside a DEV bootstrap branch. */
export function installPersonalMediaFixture(screenValue: string, variantValue = 'default'): { dispose(): void; seed: PersonalMediaFixtureSeed } {
  if (!import.meta.env.DEV) throw new Error('Personal media fixtures are unavailable in production.');
  const screen = screenValue.trim().toUpperCase() as PersonalMediaFixtureScreen;
  const variant = variantValue.trim().toLowerCase() || 'default';
  if (!Object.hasOwn(allowed, screen) || !(allowed[screen] as readonly string[]).includes(variant)) {
    throw new Error(`Unsupported personal media fixture: ${screenValue}/${variantValue}`);
  }
  let disposed = false, cancelled = false, nextConnection = 1000;
  const pending = new Set<(reason: Error) => void>();
  const assertActive = () => { if (disposed) throw new Error('DEV fixture disposed.'); };
  const copy = <T>(value: T): T => structuredClone(value);
  const connection = (type: ProviderConnection['type'], id: string, name: string): ProviderConnection => ({
    id, type, name: `${name} · ${label}`, status: 'connected', channelCount: type === 'real-debrid' ? 0 : 5,
  });
  let connections = [connection('playlist', playlistId, 'Kişisel IPTV'), connection('real-debrid', rdId, 'Real-Debrid')];
  if (screen === 'S33' && variant === 'empty') connections = [];
  if (screen === 'S33' && variant === 'iptv_removed') connections = connections.filter(c => c.type === 'real-debrid');
  if (screen === 'S33' && variant === 'offline') connections = connections.map(c => ({ ...c, status: 'error' }));
  if (screen === 'S36' && variant === 'expired') connections[0].status = 'auth-expired';
  if (screen === 'S37' && variant !== 'connected') connections = connections.filter(c => c.type !== 'real-debrid');
  let channels: PersonalChannel[] = [
    { id: 'dev-fixture-kiyi', name: `Kıyı TV · ${label}`, group: 'Genel', favorite: true },
    { id: 'dev-fixture-rota', name: `Rota · ${label}`, group: 'Belgesel', favorite: true },
    { id: 'dev-fixture-sahne', name: `Açık Sahne · ${label}`, group: 'Kültür & sanat', favorite: false },
    { id: 'dev-fixture-dunya', name: `Dünya · ${label}`, group: 'Belgesel', favorite: false },
    { id: 'dev-fixture-cizgi', name: `Çizgi · ${label}`, group: 'Çocuk', favorite: false },
  ];
  if (screen === 'S35' && variant === 'empty') { channels = []; connections[0].channelCount = 0; }
  const library: PersonalLibraryItem[] = (screen === 'S38' && variant === 'empty' ? [] : ['Gecenin Kıyısında', 'Şehir Uyurken', 'Pazar Yolculuğu', 'Son Vapurlar']).map((name, i) => ({
    id: `dev-fixture-library-${i}`, name: `${name} · ${label}`, size: (1400 + i * 200) * 1024 * 1024, mime: 'video/mp4',
  }));
  const lookup = (id: string, type?: ProviderConnection['type']) => {
    assertActive();
    const found = connections.find(c => c.id === id && (!type || c.type === type));
    if (!found) throw new Error('DEV fixture: kişisel bağlantı bulunamadı.');
    return found;
  };
  const connect = async (type: 'playlist' | 'xtream', name: string) => {
    assertActive();
    if (screen === 'S34' && variant === 'checking') return new Promise<ProviderConnection>((_resolve, reject) => pending.add(reject));
    if (screen === 'S34' && variant === 'error') throw new Error('DEV fixture: yerel bağlantı kontrolü başarısız; ağ isteği yapılmadı.');
    const next = connection(type, `00000000-0000-4000-8000-${String(nextConnection++).padStart(12, '0')}`, name.trim() || 'Kişisel IPTV');
    connections.push(next);
    return copy(next);
  };
  const update = async (id: string, type: 'playlist' | 'xtream', name: string) => {
    const current = lookup(id, type);
    current.name = `${name.trim() || 'Kişisel IPTV'} · ${label}`;
    return copy(current);
  };
  const bridge: ProviderBridge = {
    async status() { assertActive(); return copy(connections); },
    connectPlaylist: input => connect('playlist', input.name),
    connectXtream: input => connect('xtream', input.name),
    updatePlaylist: input => update(input.id, 'playlist', input.name),
    updateXtream: input => update(input.id, 'xtream', input.name),
    async pickPlaylist() { assertActive(); return null; },
    async playlistFile() { assertActive(); throw new Error('DEV fixture: yerel dosya seçimi yapılmadı.'); },
    async channels(id) { lookup(id); return copy(channels); },
    async epg(id, channelId) {
      lookup(id);
      if (!channels.some(c => c.id === channelId)) throw new Error('DEV fixture: kanal bulunamadı.');
      return screen === 'S35' && variant === 'no_guide' ? [] : [{
        title: `Şehrin kıyısında · ${label}`, description: 'Yerel örnek program bilgisi.',
        startsAt: '2026-10-08T19:00:00.000Z', endsAt: '2026-10-08T20:00:00.000Z',
      }];
    },
    async favorite(id, channelId, value) {
      lookup(id);
      const item = channels.find(c => c.id === channelId);
      if (!item) throw new Error('DEV fixture: kanal bulunamadı.');
      item.favorite = value;
    },
    async play(id, channelId) { lookup(id); if (!channels.some(c => c.id === channelId)) throw new Error('DEV fixture: kanal bulunamadı.'); throw new Error(unavailable); },
    async saveResume() { assertActive(); throw new Error('DEV fixture: oynatma kaynağı olmadığı için ilerleme kaydedilemez.'); },
    async disconnect(id) { lookup(id); connections = connections.filter(c => c.id !== id); },
    async rdStart() {
      assertActive(); cancelled = false;
      if (screen === 'S37' && variant === 'error') throw new Error('DEV fixture: yerel yetkilendirme örneği başarısız; sağlayıcıya bağlanılmadı.');
      return { userCode: 'DEV-DEMO', verificationUrl: 'about:blank', expiresAt: variant === 'expired' ? '2000-01-01T00:00:00.000Z' : '2099-01-01T00:00:00.000Z', interval: 5 };
    },
    async rdPoll() { assertActive(); return { state: cancelled || variant === 'expired' ? 'expired' : 'pending' }; },
    async rdCancel() { assertActive(); cancelled = true; },
    async rdLibrary() { lookup(rdId, 'real-debrid'); return copy(library); },
    async rdPlay(id) { lookup(rdId, 'real-debrid'); if (!library.some(c => c.id === id)) throw new Error('DEV fixture: içerik bulunamadı.'); throw new Error(unavailable); },
  };
  const uninstall = installPersonalProviderFixture(bridge);
  const initialView = screen === 'S35' || screen === 'S36' ? 'channels' : screen === 'S38' || screen === 'S39' ? 'library' : 'home';
  const seed: PersonalMediaFixtureSeed = {
    label, initialView,
    initialDialog: screen === 'S34' ? variant === 'xtream' ? 'xtream' : variant === 'remove' ? null : 'playlist' : screen === 'S37' ? 'rd' : null,
    ...(initialView !== 'home' || screen === 'S34' && (variant === 'edit' || variant === 'remove') ? { selectedConnectionId: initialView === 'library' ? rdId : playlistId } : {}),
    intent: { screen, variant, channelId: 'dev-fixture-kiyi', libraryItemId: 'dev-fixture-library-0' },
  };
  installedSeeds.push(seed);
  return { seed: copy(seed), dispose() {
    if (disposed) return;
    disposed = true; cancelled = true; uninstall();
    const seedIndex = installedSeeds.indexOf(seed);
    if (seedIndex !== -1) installedSeeds.splice(seedIndex, 1);
    for (const reject of pending) reject(new Error('DEV fixture disposed; local operation cancelled.'));
    pending.clear(); connections = []; channels = []; library.splice(0);
  } };
}
