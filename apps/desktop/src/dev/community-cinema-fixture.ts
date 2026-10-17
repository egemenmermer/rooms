import type { DesktopBridge } from '@rooms/contracts';
import type {
  ActivityResponse,
  QueueItem,
  RoomSnapshot,
} from '../../../../packages/activity-protocol/src';
import type {
  CatalogKind,
  CinemaCategory,
  CinemaDetails,
  CinemaEpisode,
  CinemaItem,
  CinemaProgramme,
  CinemaStatus,
} from '../../../../packages/community-cinema/src/types';
import type {
  CinemaBridge,
  CinemaItemsQuery,
  CinemaSourceInput,
} from '../../../../packages/community-cinema/src/bridge';
import { installCinemaFixture } from '../cinema/cinema-bridge';
import { installMediaFixture } from './media-fixture';
import { installDevelopmentRuntime, mediaBridge, mediaProvider } from '../runtime-sources';
import { useCommunity } from '../community';

/**
 * S80 · DEV-only community cinema. Every channel, film and programme below is invented sample
 * data with generated artwork; nothing reaches a cinema service, a relay or a provider.
 */
export const COMMUNITY_CINEMA_FIXTURE_VARIANTS = [
  'default',
  'empty',
  'vod',
  'not_connected',
  'member',
  'no_hall',
  'importing',
  'error',
  'remote',
] as const;
export type CommunityCinemaFixtureVariant = (typeof COMMUNITY_CINEMA_FIXTURE_VARIANTS)[number];

export const FIXTURE_HALL_ID = 'demo-channel-film-gecesi';
export const FIXTURE_COMMUNITY_ID = 'demo-bizim-oda';
const me = 'demo-deniz';

function hex(text: string) {
  let a = 0x811c9dc5,
    b = 0x01000193;
  for (const char of text) {
    a = Math.imul(a ^ char.charCodeAt(0), 0x01000193) >>> 0;
    b = Math.imul(b ^ char.charCodeAt(0), 0x5bd1e995) >>> 0;
  }
  return (a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0')).slice(0, 16);
}

type Art = { kind: 'logo' | 'poster' | 'backdrop' | 'still'; label: string; hue: number };
const artwork = new Map<string, Art>();
function art(kind: Art['kind'], label: string, hue: number) {
  const id = hex(`${kind}:${label}`);
  artwork.set(id, { kind, label, hue });
  return id;
}

const escape = (text: string) =>
  text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** Generated vector artwork: logo tiles, poster gradients and dusk scenes. */
export function fixtureArt(artId: string): string | null {
  const value = artwork.get(artId);
  if (!value) return null;
  const { kind, label, hue } = value;
  const h2 = (hue + 38) % 360;
  let svg: string;
  if (kind === 'logo') {
    const short = label
      .replace(/\b(HD|FHD|4K|TV)\b/g, '')
      .trim()
      .split(/\s+/)
      .map((word) => word[0])
      .join('')
      .slice(0, 3)
      .toLocaleUpperCase('tr');
    svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue} 62% 52%)"/><stop offset="1" stop-color="hsl(${h2} 58% 34%)"/></linearGradient></defs><rect width="96" height="96" rx="20" fill="url(#g)"/><text x="48" y="58" font-family="Inter,system-ui,sans-serif" font-size="${short.length > 2 ? 26 : 32}" font-weight="700" fill="#fff" text-anchor="middle">${escape(short)}</text></svg>`;
  } else if (kind === 'poster') {
    svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 300"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="hsl(${hue} 46% 40%)"/><stop offset="0.62" stop-color="hsl(${h2} 44% 20%)"/><stop offset="1" stop-color="hsl(${h2} 40% 9%)"/></linearGradient><radialGradient id="s" cx="0.7" cy="0.28" r="0.32"><stop offset="0" stop-color="hsl(${(hue + 30) % 360} 90% 78%)" stop-opacity=".9"/><stop offset="1" stop-color="hsl(${hue} 90% 70%)" stop-opacity="0"/></radialGradient></defs><rect width="200" height="300" fill="url(#g)"/><circle cx="140" cy="84" r="64" fill="url(#s)"/><path d="M0 214 Q50 176 100 204 T200 190 V300 H0Z" fill="hsl(${h2} 40% 12%)" opacity=".85"/></svg>`;
  } else {
    svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900"><defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="hsl(${hue} 50% 22%)"/><stop offset="0.55" stop-color="hsl(${h2} 62% 46%)"/><stop offset="1" stop-color="hsl(${(h2 + 20) % 360} 72% 66%)"/></linearGradient><radialGradient id="sun" cx="0.66" cy="0.58" r="0.2"><stop offset="0" stop-color="#fff4d8"/><stop offset="0.4" stop-color="hsl(${(h2 + 24) % 360} 90% 72%)" stop-opacity=".8"/><stop offset="1" stop-color="hsl(${h2} 90% 60%)" stop-opacity="0"/></radialGradient></defs><rect width="1600" height="900" fill="url(#sky)"/><circle cx="1056" cy="522" r="300" fill="url(#sun)"/><path d="M0 610 Q260 520 520 600 T1040 580 T1600 560 V900 H0Z" fill="hsl(${hue} 38% 16%)"/><path d="M0 700 Q300 640 640 700 T1280 690 T1600 680 V900 H0Z" fill="hsl(${hue} 40% 10%)"/><path d="M0 790 Q400 750 800 790 T1600 780 V900 H0Z" fill="hsl(${hue} 42% 6%)"/></svg>`;
  }
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

type Channel = { name: string; category: string; badges: string[]; hue: number; shows: string[] };
const liveCategories: { id: string; label: string; flag: string | null }[] = [
  { id: 'ulusal', label: 'Ulusal', flag: '🇹🇷' },
  { id: 'haber', label: 'Haber', flag: '🇹🇷' },
  { id: 'spor', label: 'Spor', flag: '🇹🇷' },
  { id: 'belgesel', label: 'Belgesel', flag: '🇹🇷' },
  { id: 'cocuk', label: 'Çocuk', flag: '🇹🇷' },
  { id: 'muzik', label: 'Müzik', flag: '🇹🇷' },
  { id: 'uk', label: 'Entertainment', flag: '🇬🇧' },
];
const showsBy: Record<string, string[]> = {
  ulusal: [
    'Ana Haber',
    'Yalı Günleri',
    'Gece Vardiyası',
    'Sabah Kahvesi',
    'Kayıp Şehir',
    'Mahalle',
    'Yarışma Gecesi',
    'Sinema Kuşağı',
  ],
  haber: [
    'Gün Ortası',
    'Ekonomi Masası',
    'Ana Haber',
    'Dünya Gündemi',
    'Gece Bülteni',
    'Tartışma Saati',
  ],
  spor: [
    'Maç Önü',
    'Süper Lig: Canlı',
    'Maç Sonu',
    'Basketbol Gecesi',
    'Spor Bülteni',
    'Tenis: Yarı Final',
  ],
  belgesel: [
    'Anadolu’nun Kuşları',
    'Derin Mavi',
    'Kayıp Uygarlıklar',
    'Vahşi Doğa',
    'Şehirlerin Hikâyesi',
  ],
  cocuk: ['Minik Kâşifler', 'Uzay Kedisi', 'Masal Saati', 'Renkli Orman', 'Robot Arkadaşım'],
  muzik: ['Pop Listesi', 'Akustik Saat', 'Klip Kuşağı', 'Gece Seansı', 'Nostalji'],
  uk: ['Morning Live', 'Quiz Night', 'The Evening Show', 'Garden Diaries', 'Late News'],
};
const channelList: Channel[] = [
  ['TRT 1', 'ulusal', ['HD'], 352],
  ['Show TV', 'ulusal', ['FHD'], 28],
  ['Kanal D', 'ulusal', ['HD'], 210],
  ['ATV', 'ulusal', ['HD'], 6],
  ['Star TV', 'ulusal', ['HD'], 48],
  ['NOW', 'ulusal', ['FHD'], 190],
  ['TV8', 'ulusal', ['HD'], 300],
  ['TRT 2', 'ulusal', ['HD'], 160],
  ['TRT Haber', 'haber', ['HD'], 220],
  ['CNN Türk', 'haber', ['HD'], 0],
  ['NTV', 'haber', ['HD'], 200],
  ['Habertürk', 'haber', ['FHD'], 14],
  ['Halk TV', 'haber', [], 340],
  ['beIN Sports 1', 'spor', ['FHD'], 280],
  ['beIN Sports 2', 'spor', ['HD'], 284],
  ['TRT Spor', 'spor', ['HD'], 130],
  ['S Sport', 'spor', ['4K', 'H265'], 0],
  ['TRT Belgesel', 'belgesel', ['HD'], 96],
  ['Doğa Belgesel', 'belgesel', ['FHD'], 120],
  ['Tarih TV', 'belgesel', [], 36],
  ['TRT Çocuk', 'cocuk', [], 52],
  ['Minika Go', 'cocuk', [], 320],
  ['Kral Pop', 'muzik', ['HD'], 330],
  ['Power Türk', 'muzik', ['FHD'], 270],
  ['BBC One', 'uk', ['HD'], 0],
  ['Sky News', 'uk', ['HD'], 350],
].map(([name, category, badges, hue]) => ({
  name: name as string,
  category: category as string,
  badges: badges as string[],
  hue: hue as number,
  shows: showsBy[category as string]!,
}));

const films = [
  ['Son Vapur', 'yerli', 2024, 7.8, 32],
  ['Bozkırda Bir Yaz', 'yerli', 2023, 7.2, 40],
  ['Mavi Saat', 'dram', 2025, 8.1, 220],
  ['Uzak Kıyı', 'dram', 2022, 6.9, 196],
  ['Kırmızı Balon', 'komedi', 2024, 6.4, 2],
  ['Deniz Feneri', 'dram', 2021, 7.6, 205],
  ['Sessiz Sokak', 'gerilim', 2025, 7.0, 250],
  ['Gölgeler Arasında', 'gerilim', 2023, 6.8, 270],
  ['Eski Defter', 'yerli', 2020, 7.4, 30],
  ['Rüzgârın Kızı', 'macera', 2024, 7.1, 150],
  ['Sonbahar Mektupları', 'dram', 2019, 7.9, 24],
  ['Yıldız Tozu', 'macera', 2025, 7.3, 260],
  ['Pazar Yolculuğu', 'komedi', 2023, 6.6, 46],
  ['Şehir Uyurken', 'gerilim', 2024, 7.5, 230],
  ['Gecenin Kıyısında', 'dram', 2025, 8.0, 280],
  ['Ada Masalı', 'yerli', 2022, 6.7, 180],
] as const;
const filmCategories = [
  { id: 'yerli', label: 'Yerli Filmler' },
  { id: 'dram', label: 'Dram' },
  { id: 'gerilim', label: 'Gerilim' },
  { id: 'komedi', label: 'Komedi' },
  { id: 'macera', label: 'Macera' },
];
const shows = [
  ['Mahalle', 'yerli-dizi', 2024, 8.2, 26, 3],
  ['Köprüaltı', 'yerli-dizi', 2023, 7.7, 200, 2],
  ['Kayıp Şehir', 'gizem', 2025, 8.4, 240, 2],
  ['Yalı Günleri', 'yerli-dizi', 2022, 7.1, 190, 3],
  ['Gece Vardiyası', 'gizem', 2024, 7.9, 260, 1],
  ['İkinci Bahar', 'komedi-dizi', 2021, 7.3, 36, 2],
  ['Ayna', 'gizem', 2025, 8.0, 300, 1],
  ['Dört Mevsim', 'komedi-dizi', 2023, 6.9, 110, 2],
] as const;
const showCategories = [
  { id: 'yerli-dizi', label: 'Yerli Diziler' },
  { id: 'gizem', label: 'Gizem ve Gerilim' },
  { id: 'komedi-dizi', label: 'Komedi' },
];

const day = 86_400_000;
function buildCatalog(now: number) {
  const items: CinemaItem[] = [];
  const programmes = new Map<string, CinemaProgramme[]>();
  const details = new Map<string, CinemaDetails>();
  channelList.forEach((channel, index) => {
    const ref = `l-${1001 + index}`;
    items.push({
      ref,
      kind: 'live',
      title: channel.name,
      badges: channel.badges,
      categoryId: channel.category,
      number: index + 1,
      art: art('logo', channel.name, channel.hue),
      year: null,
      rating: null,
      addedAt: null,
      hasGuide: channel.category !== 'muzik' || index % 2 === 0,
    });
    const list: CinemaProgramme[] = [];
    const lengths = [30, 45, 60, 90, 40, 120, 50];
    let start = Math.floor((now - 3 * 3_600_000) / 900_000) * 900_000 - (index % 4) * 900_000;
    let k = index;
    while (start < now + 26 * 3_600_000) {
      const minutes = lengths[k % lengths.length]!;
      const title = channel.shows[k % channel.shows.length]!;
      list.push({
        start,
        stop: start + minutes * 60_000,
        title,
        subTitle: k % 3 === 0 ? `${(k % 40) + 1}. Bölüm` : null,
        description:
          k % 2 === 0
            ? `${title}, ${channel.name} ekranlarında. Bu akşamın konukları ve sürprizleriyle canlı yayında.`
            : `${channel.name} yayın akışında ${title.toLocaleLowerCase('tr')} saati.`,
        category: liveCategories.find((c) => c.id === channel.category)?.label ?? null,
      });
      start += minutes * 60_000;
      k++;
    }
    if (items[items.length - 1]!.hasGuide) programmes.set(ref, list);
  });
  films.forEach(([title, category, year, rating, hue], index) => {
    const ref = `m-${3001 + index}`;
    const item: CinemaItem = {
      ref,
      kind: 'movie',
      title,
      badges: index % 3 === 0 ? ['4K', 'HDR'] : index % 2 ? ['FHD'] : ['HD'],
      categoryId: category,
      number: null,
      art: art('poster', title, hue),
      year,
      rating,
      addedAt: now - index * 1.7 * day,
      hasGuide: false,
    };
    items.push(item);
    details.set(ref, {
      item,
      plot: `${title}, birbirini yıllardır görmeyen eski dostların tek bir gecede yeniden karşılaşmasını anlatıyor. Sessiz, sıcak ve sonunda insanı gülümseten bir hikâye.`,
      genre: filmCategories.find((c) => c.id === category)?.label ?? null,
      cast: 'Elif Aras, Mert Kaya, Selin Tan',
      director: 'Deniz Yalçın',
      durationSec: (95 + (index % 5) * 9) * 60,
      backdrop: art('backdrop', title, hue),
      seasons: [],
    });
  });
  shows.forEach(([title, category, year, rating, hue, seasonCount], index) => {
    const ref = `s-${5001 + index}`;
    const item: CinemaItem = {
      ref,
      kind: 'series',
      title,
      badges: index % 2 ? ['FHD'] : ['HD'],
      categoryId: category,
      number: null,
      art: art('poster', title, hue),
      year,
      rating,
      addedAt: now - index * 2.3 * day,
      hasGuide: false,
    };
    items.push(item);
    const seasons = Array.from({ length: seasonCount }, (_, s) => ({
      season: s + 1,
      episodes: Array.from({ length: 6 + ((s + index) % 3) }, (_, e): CinemaEpisode => ({
        ref: `e-${5001 + index}${s + 1}${String(e + 1).padStart(2, '0')}`,
        season: s + 1,
        episode: e + 1,
        title: [
          'Başlangıç',
          'Eski Ev',
          'Kapı',
          'Gece Treni',
          'Yağmur',
          'Mektup',
          'Son Gün',
          'Dönüş',
        ][e % 8]!,
        plot: 'Mahalleye yeni taşınan bir aile, bodrumda eski bir sandık bulur. Sandıktan çıkan defter herkesin hayatını değiştirecektir.',
        durationSec: (42 + ((e * 3) % 12)) * 60,
        art: art('still', `${title} ${s + 1}.${e + 1}`, (hue + e * 9) % 360),
      })),
    }));
    details.set(ref, {
      item,
      plot: `${title}, aynı apartmanda yaşayan dört komşunun bir yaz boyunca birbirine karışan hayatlarını anlatıyor.`,
      genre: showCategories.find((c) => c.id === category)?.label ?? null,
      cast: 'Ayşe Demir, Can Öztürk, Zeynep Arslan',
      director: 'Ece Kılıç',
      durationSec: null,
      backdrop: art('backdrop', title, hue),
      seasons,
    });
  });
  const categories: CinemaCategory[] = [
    ...liveCategories.map((c) => ({
      id: c.id,
      kind: 'live' as const,
      label: c.label,
      flag: c.flag,
      count: items.filter((i) => i.kind === 'live' && i.categoryId === c.id).length,
    })),
    ...filmCategories.map((c) => ({
      id: c.id,
      kind: 'movie' as const,
      label: c.label,
      flag: null,
      count: items.filter((i) => i.kind === 'movie' && i.categoryId === c.id).length,
    })),
    ...showCategories.map((c) => ({
      id: c.id,
      kind: 'series' as const,
      label: c.label,
      flag: null,
      count: items.filter((i) => i.kind === 'series' && i.categoryId === c.id).length,
    })),
  ];
  return { items, programmes, details, categories };
}

const fold = (text: string) =>
  text.toLocaleLowerCase('tr').normalize('NFKD').replace(/\p{M}/gu, '').replace(/ı/g, 'i');

export function createCommunityCinemaFixtureBridge(
  variant: CommunityCinemaFixtureVariant,
  now = Date.now(),
): CinemaBridge {
  const catalog = buildCatalog(now);
  let status: CinemaStatus = {
    communityId: FIXTURE_COMMUNITY_ID,
    hallChannelId: variant === 'no_hall' ? null : FIXTURE_HALL_ID,
    isOwner: variant !== 'member' && variant !== 'remote',
    connected: variant !== 'not_connected' && variant !== 'member',
    source:
      variant === 'not_connected' || variant === 'member'
        ? null
        : { kind: 'xtream', label: 'https://ipt***:8080', hasCustomGuide: false },
    account:
      variant === 'not_connected' || variant === 'member'
        ? null
        : { status: 'Active', expiresAt: now + 140 * day, maxConnections: 2 },
    catalog: {
      live: catalog.items.filter((i) => i.kind === 'live').length,
      movies: catalog.items.filter((i) => i.kind === 'movie').length,
      series: catalog.items.filter((i) => i.kind === 'series').length,
      programmes: [...catalog.programmes.values()].reduce((n, list) => n + list.length, 0),
      importedAt: now - 3 * 3_600_000,
      guideImportedAt: now - 12 * 60_000,
    },
    importing:
      variant === 'importing'
        ? {
            step: 'movies',
            counts: { live: 26, movies: 9, series: 0, programmes: 0 },
            error: null,
            startedAt: now - 40_000,
            finishedAt: null,
          }
        : null,
    relaySlots: 1,
  };
  const delay = <T>(value: T, ms = 120) =>
    new Promise<T>((resolve) => setTimeout(() => resolve(structuredClone(value)), ms));
  const hall = (hallId: string) => {
    if (hallId !== status.hallChannelId) throw new Error('CINEMA_HALL_REQUIRED');
    if (!status.connected) throw new Error('CINEMA_NOT_CONNECTED');
  };
  return {
    status: () => delay(status, 60),
    setHall: async (_communityId, channelId) => {
      status = { ...status, hallChannelId: channelId };
      return delay(status);
    },
    connect: async (_communityId, source: CinemaSourceInput) => {
      if (source.kind === 'xtream' && source.password === 'yanlis')
        throw new Error('CINEMA_PROVIDER_DENIED');
      status = {
        ...status,
        connected: true,
        source: {
          kind: source.kind,
          label: 'https://ipt***:8080',
          hasCustomGuide: !!source.guideUrl,
        },
        account: { status: 'Active', expiresAt: now + 140 * day, maxConnections: 2 },
        importing: {
          step: 'completed',
          counts: { live: 26, movies: 16, series: 8, programmes: 1400 },
          error: null,
          startedAt: Date.now() - 4000,
          finishedAt: Date.now(),
        },
      };
      return delay(status, 600);
    },
    disconnect: async () => {
      status = { ...status, connected: false, source: null, account: null, importing: null };
      return delay(status);
    },
    reload: async () => delay(status),
    categories: async (hallId, kind: CatalogKind) => {
      hall(hallId);
      return delay(catalog.categories.filter((c) => c.kind === kind));
    },
    items: async (hallId, query: CinemaItemsQuery) => {
      hall(hallId);
      let list = catalog.items.filter(
        (i) => i.kind === query.kind && (!query.categoryId || i.categoryId === query.categoryId),
      );
      if (query.sort === 'added')
        list = [...list].sort((a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0));
      if (query.sort === 'rating')
        list = [...list].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
      if (query.sort === 'name')
        list = [...list].sort((a, b) => a.title.localeCompare(b.title, 'tr'));
      const offset = query.offset ?? 0,
        limit = query.limit ?? 60;
      return delay({ items: list.slice(offset, offset + limit), total: list.length });
    },
    search: async (hallId, text, kinds) => {
      hall(hallId);
      const terms = fold(text).split(/\s+/).filter(Boolean);
      if (!terms.length) return [];
      return delay(
        catalog.items
          .filter((i) => !kinds || kinds.includes(i.kind))
          .filter((i) => {
            const words = fold(i.title).split(/\s+/);
            return terms.every((term) => words.some((word) => word.startsWith(term)));
          })
          .slice(0, 30),
        80,
      );
    },
    guide: async (hallId, refs, fromMs, toMs) => {
      hall(hallId);
      return delay(
        Object.fromEntries(
          refs.map((ref) => [
            ref,
            (catalog.programmes.get(ref) ?? []).filter((p) => p.stop > fromMs && p.start < toMs),
          ]),
        ),
        60,
      );
    },
    details: async (hallId, ref) => {
      hall(hallId);
      const value = catalog.details.get(ref);
      if (!value) throw new Error('CINEMA_ITEM_NOT_FOUND');
      return delay(value);
    },
    watch: async (hallId) => {
      hall(hallId);
      if (variant === 'error') {
        await delay(null, 500);
        throw new Error('CINEMA_CODEC_UNSUPPORTED');
      }
      const current = room?.queue.find((item) => item.id === room?.timeline.itemId);
      if (current?.media.kind !== 'community-media') throw new Error('CINEMA_NOTHING_SELECTED');
      const detail = catalog.details.get(current.media.ref);
      return delay(
        {
          src: `rooms-fixture://hall/${current.media.ref}`,
          itemRef: current.media.ref,
          live: current.media.live,
          durationSec: current.media.live ? null : (detail?.durationSec ?? 2700),
          offsetSec: 0,
          epoch: room?.timeline.epoch ?? 1,
          originPdtMs: null,
        },
        variant === 'default' ? 300 : 200,
      );
    },
  };
}

let room: RoomSnapshot | null = null;

const people = [
  { userId: 'demo-deniz', displayName: 'Deniz' },
  { userId: 'demo-ece', displayName: 'Ece' },
  { userId: 'demo-can', displayName: 'Can' },
  { userId: 'demo-zeynep', displayName: 'Zeynep' },
  { userId: 'demo-mert', displayName: 'Mert' },
];

export function communityCinemaFixtureRoom(
  variant: CommunityCinemaFixtureVariant,
  now = Date.now(),
): RoomSnapshot {
  const playing = ['default', 'vod', 'error', 'remote'].includes(variant);
  const participants = (playing ? people.slice(1, 5) : []).map((p) => ({
    ...p,
    canControl: true,
    canCreate: true,
    joinedAt: now - 3_600_000,
    lastSeenAt: now,
  }));
  const queue: QueueItem[] = !playing
    ? []
    : variant === 'vod'
      ? [
          {
            id: 'demo-hall-1',
            addedBy: 'demo-ece',
            media: { kind: 'community-media', ref: 'm-3003', title: 'Mavi Saat', live: false },
          },
          {
            id: 'demo-hall-2',
            addedBy: 'demo-can',
            media: {
              kind: 'community-media',
              ref: 'm-3015',
              title: 'Gecenin Kıyısında',
              live: false,
            },
          },
        ]
      : [
          {
            id: 'demo-hall-1',
            addedBy: 'demo-ece',
            media: { kind: 'community-media', ref: 'l-1001', title: 'TRT 1', live: true },
          },
          {
            id: 'demo-hall-2',
            addedBy: 'demo-can',
            media: { kind: 'community-media', ref: 'm-3003', title: 'Mavi Saat', live: false },
          },
          {
            id: 'demo-hall-3',
            addedBy: 'demo-zeynep',
            media: { kind: 'youtube', videoId: 'aqz-KE-bpKQ', title: 'Big Buck Bunny 60fps 4K' },
          },
        ];
  return {
    roomId: FIXTURE_HALL_ID,
    revision: 1,
    participants,
    primary: playing
      ? {
          activity: 'hall',
          title: 'Sinema salonu',
          hostUserId: 'demo-ece',
          startedAt: now - 3_600_000,
          state: 'live',
          ...(variant === 'remote' ? { controlMode: 'host' as const, controllers: [] } : {}),
        }
      : null,
    timeline: {
      itemId: queue[0]?.id ?? null,
      epoch: 3,
      positionSec: variant === 'vod' ? 1260 : 0,
      playing: playing,
      rate: 1,
      effectiveServerTimeMs: now,
    },
    queue,
    polls: [],
    whiteboard: [],
  };
}

/** Local hall Activity adapter: enough of the protocol to drive the real UI controls. */
export function createCommunityCinemaFixtureActivity(
  initial: RoomSnapshot,
): DesktopBridge['activity'] {
  room = initial;
  const response = (): ActivityResponse => ({
    protocolVersion: 1,
    serverTimeMs: Date.now(),
    room: structuredClone(room!),
    events: [],
    replayRequired: false,
  });
  const fail = (code: string): never => {
    throw new Error(code);
  };
  return {
    snapshot: async () => response(),
    command: async (_id, envelope) => {
      const state = room!;
      if (envelope.expectedRevision !== state.revision) fail('REVISION_CONFLICT');
      const command = envelope.command;
      const self = state.participants.find((p) => p.userId === me);
      const directs = () => {
        const p = state.primary;
        if (p?.controlMode === 'host' && p.hostUserId !== me && !(p.controllers ?? []).includes(me))
          fail('SESSION_HOST_CONTROL');
      };
      const select = (itemId: string, play: boolean) => {
        const item = state.queue.find((i) => i.id === itemId);
        if (!item) fail('QUEUE_ITEM_NOT_FOUND');
        state.timeline = {
          itemId,
          epoch: state.timeline.epoch + 1,
          positionSec: 0,
          rate: 1,
          playing: play,
          effectiveServerTimeMs: Date.now(),
        };
      };
      switch (command.type) {
        case 'join':
          if (!self)
            state.participants.push({
              userId: me,
              displayName: 'Deniz',
              canControl: true,
              canCreate: true,
              joinedAt: Date.now(),
              lastSeenAt: Date.now(),
            });
          break;
        case 'leave':
          state.participants = state.participants.filter((p) => p.userId !== me);
          break;
        case 'start':
          if (state.primary) fail('PRIMARY_ACTIVITY_ACTIVE');
          state.primary = {
            activity: command.activity,
            title: command.title,
            hostUserId: me,
            startedAt: Date.now(),
            state: 'live',
          };
          break;
        case 'queue.add':
          if (command.start) directs();
          state.queue.push({ id: command.itemId, media: command.media, addedBy: me });
          if (command.start) select(command.itemId, true);
          break;
        case 'queue.select':
          directs();
          select(command.itemId, command.play ?? false);
          break;
        case 'queue.remove':
          if (command.itemId === state.timeline.itemId) fail('QUEUE_ACTIVE_ITEM_FIXED');
          state.queue = state.queue.filter((i) => i.id !== command.itemId);
          break;
        case 'queue.reorder':
          directs();
          state.queue = command.itemIds.map((id) => state.queue.find((i) => i.id === id)!);
          break;
        case 'queue.next': {
          if (state.timeline.itemId !== command.fromItemId) break;
          const index = state.queue.findIndex((i) => i.id === command.fromItemId);
          const next = state.queue[index + 1];
          if (next) select(next.id, true);
          break;
        }
        case 'playback': {
          directs();
          const current = state.queue.find((i) => i.id === state.timeline.itemId)?.media;
          if (current?.kind === 'community-media' && current.live) fail('LIVE_PLAYBACK_FIXED');
          state.timeline = {
            ...state.timeline,
            playing: command.playing,
            positionSec: command.positionSec,
            rate: command.rate,
            effectiveServerTimeMs: Date.now(),
          };
          break;
        }
        case 'session.control':
          if (state.primary) state.primary.controlMode = command.mode;
          break;
        case 'session.permit':
          if (state.primary)
            state.primary.controllers = command.allowed
              ? [...new Set([...(state.primary.controllers ?? []), command.userId])]
              : (state.primary.controllers ?? []).filter((id) => id !== command.userId);
          break;
        case 'session.host':
          if (state.primary) state.primary.hostUserId = command.userId;
          break;
        default:
          fail(`Unsupported hall fixture command: ${command.type}`);
      }
      state.revision++;
      return response();
    },
    exportBoard: async () => fail('No board in the cinema fixture.'),
    youtubePlaylist: async () => fail('Playlist import is unavailable in the cinema fixture.'),
    youtubePlayer: async () => fail('No YouTube playback in the local cinema fixture.'),
  };
}

/** DEV-only install for `?fixture=S80&variant=…`. */
export function installCommunityCinemaFixture(value: string): () => void {
  if (!import.meta.env.DEV) throw new Error('Cinema fixtures are unavailable in production.');
  const variant = (COMMUNITY_CINEMA_FIXTURE_VARIANTS as readonly string[]).includes(value)
    ? (value as CommunityCinemaFixtureVariant)
    : (() => {
        throw new Error(`Unsupported community cinema fixture variant: ${value}`);
      })();
  const restoreMedia = installMediaFixture('S19', 'default');
  const restoreRuntime = installDevelopmentRuntime({
    mediaProvider: mediaProvider(),
    mediaBridge: mediaBridge(),
    activityBridge: createCommunityCinemaFixtureActivity(communityCinemaFixtureRoom(variant)),
  });
  const restoreBridge = installCinemaFixture({
    bridge: createCommunityCinemaFixtureBridge(variant),
    art: fixtureArt,
  });
  if (variant === 'member' || variant === 'remote') {
    const state = useCommunity.getState();
    useCommunity.setState({
      spaces: state.spaces.map((space) =>
        space.id === FIXTURE_COMMUNITY_ID ? { ...space, ownerId: 'demo-ece' } : space,
      ),
    });
  }
  return () => {
    restoreBridge();
    restoreRuntime();
    restoreMedia();
  };
}
