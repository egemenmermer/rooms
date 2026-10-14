import { createHash } from 'node:crypto';
import { personalURL } from './network';
export interface PlaylistEntry {
  id: string;
  name: string;
  group: string;
  url: string;
  epgId?: string;
}
export function parsePlaylist(text: string, base: string): PlaylistEntry[] {
  if (text.length > 5_000_000 || !text.trimStart().startsWith('#EXTM3U'))
    throw new Error('Select a valid M3U playlist.');
  if (/^#EXT-X-(?:STREAM-INF|TARGETDURATION|MEDIA-SEQUENCE|ENDLIST|MEDIA):?/m.test(text)) {
    const url = personalURL(base).href;
    return [
      {
        id: createHash('sha256').update(url).digest('hex').slice(0, 24),
        name: 'Live stream',
        group: 'Personal',
        url,
      },
    ];
  }
  const entries: PlaylistEntry[] = [];
  let metadata = '';
  for (const line of text.replace(/\r/g, '').split('\n')) {
    const s = line.trim();
    if (s.startsWith('#EXTINF:')) metadata = s;
    else if (s && !s.startsWith('#')) {
      const url = personalURL(new URL(s, base).href).href;
      const name =
        metadata.slice(metadata.indexOf(',') + 1).trim() || `Channel ${entries.length + 1}`;
      const group = metadata.match(/group-title="([^"]*)"/)?.[1] ?? 'Other';
      const epgId = metadata.match(/tvg-id="([^"]*)"/)?.[1];
      entries.push({
        id: createHash('sha256').update(url).digest('hex').slice(0, 24),
        name: name.slice(0, 200),
        group: group.slice(0, 100),
        url,
        epgId,
      });
      metadata = '';
      if (entries.length > 10000) throw new Error('This playlist contains too many channels.');
    }
  }
  if (!entries.length) throw new Error('The playlist contains no playable channel entries.');
  return entries;
}
/** Strip paths/URLs/credentials from labels supplied by untrusted providers. */
export function safeMediaLabel(value: string, fallback = 'Personal media'): string {
  return value.includes('://') || /[\r\n]/.test(value) ? fallback : value.slice(0, 200);
}
export function rewriteHLS(text: string, base: string, register: (url: string) => string): string {
  if (!text.trimStart().startsWith('#EXTM3U')) throw new Error('Invalid HLS manifest.');
  return text
    .split('\n')
    .map((line) => {
      if (line.trim() && !line.startsWith('#'))
        return register(personalURL(new URL(line.trim(), base).href).href);
      return line.replace(
        /URI="([^"]+)"/g,
        (_m, uri) => `URI="${register(personalURL(new URL(uri, base).href).href)}"`,
      );
    })
    .join('\n');
}
