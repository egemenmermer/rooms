import type { RoomSnapshot, Timeline } from '../../../packages/activity-protocol/src';

const VIDEO_ID = /^[\w-]{11}$/;

/** Accepts watch, short, embed, live and youtu.be links, or a bare 11-character video id. */
export function parseYouTubeVideo(value: string): string | null {
  const text = value.trim();
  if (VIDEO_ID.test(text)) return text;
  try {
    const url = new URL(text);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    const host = url.hostname.replace(/^(www|m|music)\./, '');
    if (host === 'youtu.be') {
      const id = url.pathname.slice(1).split('/')[0] ?? '';
      return VIDEO_ID.test(id) ? id : null;
    }
    if (host !== 'youtube.com' && host !== 'youtube-nocookie.com') return null;
    const query = url.searchParams.get('v');
    if (query) return VIDEO_ID.test(query) ? query : null;
    const [kind, id] = url.pathname.split('/').filter(Boolean);
    return ['shorts', 'embed', 'live', 'v'].includes(kind ?? '') && id && VIDEO_ID.test(id)
      ? id
      : null;
  } catch {
    return null;
  }
}

/** Looks like a link or path rather than a search phrase. */
export function looksLikeAddress(value: string) {
  return /^\w+:|^www\.|^[\w-]+\.(com|be|tv)\//i.test(value.trim());
}

export const youtubeThumbnail = (videoId: string, size: 'mq' | 'hq' = 'mq') =>
  `https://i.ytimg.com/vi/${videoId}/${size}default.jpg`;

/** The room playhead at local time `now`, given the measured server clock offset. */
export function expectedPosition(timeline: Timeline, now: number, serverOffsetMs: number) {
  return (
    timeline.positionSec +
    (timeline.playing
      ? (Math.max(0, now + serverOffsetMs - timeline.effectiveServerTimeMs) / 1000) * timeline.rate
      : 0)
  );
}

export function clock(seconds: number) {
  const total = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  const hours = Math.floor(total / 3600),
    minutes = Math.floor((total % 3600) / 60),
    rest = String(total % 60).padStart(2, '0');
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${rest}` : `${minutes}:${rest}`;
}

/** Items before the playing one have already been watched in this session. */
export function queueProgress(room: RoomSnapshot | null) {
  const queue = room?.queue ?? [];
  const index = queue.findIndex((item) => item.id === room?.timeline.itemId);
  return {
    current: index >= 0 ? queue[index]! : null,
    next: index >= 0 ? (queue[index + 1] ?? null) : null,
    watched: index > 0 ? queue.slice(0, index) : [],
    index,
  };
}

// Official codes: https://developers.google.com/youtube/iframe_api_reference#onError
const playerErrors: Record<number, string> = {
  2: 'Video bağlantısı geçersiz.',
  5: 'Bu video oynatıcıda açılamadı.',
  100: 'Video kaldırılmış veya gizli.',
  101: 'Video sahibi başka uygulamalarda oynatılmasına izin vermiyor.',
  150: 'Video sahibi başka uygulamalarda oynatılmasına izin vermiyor.',
  153: 'YouTube bu oynatıcıyı doğrulayamadı.',
};
export const youtubeErrorText = (code: number) =>
  playerErrors[code] ?? 'Video bu bölgede veya bu oynatıcıda kullanılamıyor olabilir.';

const VOLUME_KEY = 'rooms.cinema.volume';
export function storedVolume(): { volume: number; muted: boolean } {
  try {
    const value = JSON.parse(localStorage.getItem(VOLUME_KEY) ?? 'null') as {
      volume?: unknown;
      muted?: unknown;
    } | null;
    const volume = Number(value?.volume);
    return {
      volume: Number.isFinite(volume) ? Math.min(100, Math.max(0, volume)) : 80,
      muted: value?.muted === true,
    };
  } catch {
    return { volume: 80, muted: false };
  }
}
export function storeVolume(value: { volume: number; muted: boolean }) {
  try {
    localStorage.setItem(VOLUME_KEY, JSON.stringify(value));
  } catch {
    /* Private windows may block storage; the slider still works for this session. */
  }
}
