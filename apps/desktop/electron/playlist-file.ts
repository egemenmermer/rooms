import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { open } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import { TextDecoder } from 'node:util';
import { personalURL, isPublicAddress } from '../../../packages/personal-media/src/network';
import { isIP } from 'node:net';
import { parsePlaylist, safeMediaLabel, type PlaylistEntry } from '../../../packages/personal-media/src/playlist';

export const PLAYLIST_FILE_LIMIT = 2 * 1024 * 1024;
const IMPORT_TTL = 5 * 60_000;
const INVALID_TOKEN = 'The playlist file selection expired. Select the file again.';

/** A local playlist is a channel list, never a base URL for relative resources. */
export function parsePersonalPlaylistFile(text: string): PlaylistEntry[] {
  if (Buffer.byteLength(text, 'utf8') > PLAYLIST_FILE_LIMIT || text.includes('\0')) throw new Error('The playlist file must be UTF-8 and no larger than 2 MiB.');
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).map(line => line.trim());
  if (!/^#EXTM3U(?:\s|$)/.test(lines.find(line => line) ?? '')) throw new Error('Select a valid extended M3U playlist file.');
  if (lines.some(line => /^#(?:EXT-X-|KODIPROP|EXTVLCOPT)/i.test(line))) throw new Error('The playlist file contains unsupported playback or DRM directives. Use a plain channel playlist.');
  for (const line of lines) {
    if (!line || line.startsWith('#')) continue;
    try {
      const url = personalURL(line);
      const host = url.hostname.replace(/^\[|\]$/g, '');
      if (isIP(host) && !isPublicAddress(host)) throw new Error('Reserved network');
      if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) throw new Error('Local network');
    } catch { throw new Error('The playlist file requires absolute public HTTP(S) channel URLs without URL userinfo.'); }
  }
  // All resource lines were validated as absolute URLs; the parser cannot resolve a local path.
  return parsePlaylist(lines.join('\n'), 'https://playlist.invalid/');
}

export async function readPersonalPlaylistFile(path: string): Promise<{ text: string; entries: PlaylistEntry[] }> {
  if (!['.m3u', '.m3u8'].includes(extname(path).toLowerCase())) throw new Error('Select a valid M3U or M3U8 playlist file.');
  try {
    const file = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
    try {
      const stat = await file.stat();
      if (!stat.isFile()) throw new Error('The playlist selection must be a regular file.');
      if (!stat.size || stat.size > PLAYLIST_FILE_LIMIT) throw new Error('The playlist file must be nonempty and no larger than 2 MiB.');
      const buffer = Buffer.alloc(PLAYLIST_FILE_LIMIT + 1);
      let total = 0;
      for (;;) {
        const { bytesRead } = await file.read(buffer, total, buffer.length - total, null);
        total += bytesRead;
        if (total > PLAYLIST_FILE_LIMIT) throw new Error('The playlist file must be no larger than 2 MiB.');
        if (!bytesRead) break;
      }
      let text: string;
      try { text = new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, total)); }
      catch { throw new Error('The playlist file must use UTF-8 encoding.'); }
      return { text, entries: parsePersonalPlaylistFile(text) };
    } finally { await file.close(); }
  } catch (error) {
    if (error instanceof Error && /^(The playlist|Select a valid)/.test(error.message)) throw error;
    throw new Error('The playlist file could not be read. Select an accessible regular file.');
  }
}

/** Holds personal contents in main memory, exposing only a single-use selection capability. */
export class PlaylistFileImports {
  private generation = 0;
  private choosing = false;
  private pending: { token: string; text: string; expires: number; scope: string } | null = null;

  constructor(private readonly read = readPersonalPlaylistFile, private readonly now = Date.now, private readonly scope = () => '') {}

  async pick(choose: () => Promise<string | null>): Promise<{ token: string; fileName: string; channelCount: number } | null> {
    if (this.choosing) throw new Error('The playlist file chooser is already open.');
    this.choosing = true;
    this.pending = null;
    const generation = ++this.generation;
    const scope = this.scope();
    try {
      const path = await choose();
      if (generation !== this.generation || scope !== this.scope()) { this.clear(); throw new Error(INVALID_TOKEN); }
      if (!path) return null;
      const { text, entries } = await this.read(path);
      if (generation !== this.generation || scope !== this.scope()) { this.clear(); throw new Error(INVALID_TOKEN); }
      const token = randomUUID();
      this.pending = { token, text, expires: this.now() + IMPORT_TTL, scope };
      return { token, fileName: safeMediaLabel(basename(path).replace(/[\x00-\x1f\x7f]/g, ''), 'Playlist file').slice(0, 100), channelCount: entries.length };
    } finally { this.choosing = false; }
  }

  take(token: string): string {
    const selection = this.pending;
    if (!selection || selection.expires <= this.now() || selection.scope !== this.scope()) { this.clear(); throw new Error(INVALID_TOKEN); }
    if (selection.token !== token) throw new Error(INVALID_TOKEN);
    this.pending = null;
    return selection.text;
  }

  clear(): void { this.generation++; this.pending = null; }
}
