import { privateFetch, limitedText } from '../../../packages/personal-media/src/network';
import {
  musicLyricsSchema,
  type MusicLyrics,
} from '../../../packages/shared-contracts/src/music-lyrics';
const normalize = (text: string) =>
  text
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/ı/g, 'i')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
export function parseSyncedLyrics(value: string) {
  const lines: { time: number; text: string }[] = [];
  for (const row of value.split('\n')) {
    const stamps = [...row.matchAll(/\[(\d{1,3}):([0-5]\d)(?:[.:](\d{1,3}))?\]/g)];
    const text = row
      .replace(/\[[^\]]*\]/g, '')
      .replace(/[\x00-\x1f<>]/g, '')
      .trim()
      .slice(0, 1000);
    for (const stamp of stamps) {
      const time = Number(stamp[1]) * 60 + Number(stamp[2]) + Number(`0.${stamp[3] ?? '0'}`);
      if (time <= 7200) lines.push({ time, text });
      if (lines.length > 1000) return [];
    }
  }
  return lines.sort((a, b) => a.time - b.time);
}
/** Explicit, on-demand public metadata lookup. Never send account or community identifiers. */
export async function loadMusicLyrics(
  title: string,
  duration: number,
  request: typeof privateFetch = privateFetch,
): Promise<MusicLyrics> {
  if (
    !title ||
    title.length > 160 ||
    !Number.isFinite(duration) ||
    duration <= 0 ||
    duration > 7200
  )
    return { status: 'unavailable' };
  const query = title
    .replace(/\s*· YouTube$/, '')
    .replace(/[\[(](?:official[^\])]*|lyrics?|audio|video)[\])]/gi, '')
    .trim();
  const parts = query.split(/\s+[-–—]\s+/);
  const exact = parts.length === 2 && parts.every((part) => part.trim());
  const endpoint = new URL(`https://lrclib.net/api/${exact ? 'get' : 'search'}`);
  if (exact) {
    endpoint.searchParams.set('artist_name', parts[0].trim());
    endpoint.searchParams.set('track_name', parts[1].trim());
    endpoint.searchParams.set('duration', String(duration));
  } else endpoint.searchParams.set('q', query);
  try {
    const response = await request(endpoint.href, {
      allowedHosts: ['lrclib.net'],
      allowedProtocols: ['https:'],
      signal: AbortSignal.timeout(8000),
      headers: { 'User-Agent': 'ROOMS/1.0 (desktop lyrics)' },
    });
    if (!response.ok) {
      await response.body?.cancel();
      return { status: 'unavailable' };
    }
    const payload = JSON.parse(await limitedText(response, 512 * 1024));
    const records = exact ? [payload] : payload;
    if (!Array.isArray(records) || records.length > 100) return { status: 'unavailable' };
    const matching = records.filter(
      (row) =>
        typeof row?.trackName === 'string' &&
        typeof row?.artistName === 'string' &&
        typeof row?.duration === 'number' &&
        Math.abs(row.duration - duration) <= 2 &&
        normalize(`${row.artistName} ${row.trackName}`) === normalize(query),
    );
    if (matching.length !== 1) return { status: 'unavailable' };
    const record = matching[0];
    if (record.instrumental === true) return { status: 'instrumental' };
    if (typeof record.syncedLyrics !== 'string' || record.syncedLyrics.length > 100000)
      return { status: 'unavailable' };
    const lines = parseSyncedLyrics(record.syncedLyrics);
    return lines.length
      ? musicLyricsSchema.parse({ status: 'found', provider: 'LRCLIB', lines })
      : { status: 'unavailable' };
  } catch {
    return { status: 'unavailable' };
  }
}
