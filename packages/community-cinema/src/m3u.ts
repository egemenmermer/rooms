// M3U playlist parsing for the community catalog. Follows Kanal's
// `lib/data/sources/m3u/` contract: entries are classified as live, movie or
// episode by their URL and duration, and episode names carry a season marker.
import { createHash } from 'node:crypto';

export type M3uKind = 'live' | 'movie' | 'episode';

export type M3uEntry = {
  /** Stable id: sha256 of the URL, 24 hex characters. */
  id: string;
  kind: M3uKind;
  name: string;
  url: string;
  group: string;
  tvgId: string | null;
  tvgName: string | null;
  logo: string | null;
  number: number | null;
  catchupDays: number | null;
  userAgent: string | null;
  referrer: string | null;
  /** Episodes only. */
  seriesName: string | null;
  season: number | null;
  episode: number | null;
};

export type M3uHeader = { tvgUrls: string[] };

export type M3uParseResult = { header: M3uHeader; entries: M3uEntry[] };

export const M3U_MAX_ENTRIES = 250_000;

const movieExtensions = new Set(['mp4', 'mkv', 'avi', 'mov']);

/** `/movie/` → movie, `/series/` → episode, a VOD extension with a duration → movie, else live. */
export function classifyM3u(url: string, duration: number): M3uKind {
  const path = url.split(/[?#]/, 1)[0].toLowerCase();
  if (path.includes('/movie/')) return 'movie';
  if (path.includes('/series/')) return 'episode';
  const dot = path.lastIndexOf('.');
  const extension = dot > path.lastIndexOf('/') ? path.slice(dot + 1) : '';
  return duration > 0 && movieExtensions.has(extension) ? 'movie' : 'live';
}

const seasonEpisode = /(?<![A-Za-z0-9])S(\d{1,3})[ ._-]*E(\d{1,4})(?!\d)/i;
const crossMarker = /(?<![A-Za-z0-9])(\d{1,2})x(\d{1,3})(?![A-Za-z0-9])/i;
const tailJunk = ' \t-–—|:._,;([{';
const headJunk = ' \t-–—|:._,;)]}';

/** `Sıcak Kafa S01 E02` → series `Sıcak Kafa`, season 1, episode 2. */
export function parseSeriesMarker(name: string) {
  const m = seasonEpisode.exec(name) ?? crossMarker.exec(name);
  if (!m) return null;
  let before = name.slice(0, m.index);
  while (before && tailJunk.includes(before[before.length - 1])) before = before.slice(0, -1);
  before = before.trim();
  let after = name.slice(m.index + m[0].length);
  while (after && headJunk.includes(after[0])) after = after.slice(1);
  after = after.trim();
  return {
    seriesName: before || after || name.trim(),
    season: Number(m[1]),
    episode: Number(m[2]),
    episodeTitle: before && after ? after : null,
  };
}

const attribute = /([A-Za-z0-9_-]+)="([^"]*)"/g;

function attributes(line: string) {
  const out = new Map<string, string>();
  const comma = commaOutsideQuotes(line);
  const head = comma < 0 ? line : line.slice(0, comma);
  for (const m of head.matchAll(attribute)) out.set(m[1].toLowerCase(), m[2].trim());
  return out;
}

function commaOutsideQuotes(line: string) {
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') quoted = !quoted;
    else if (line[i] === ',' && !quoted) return i;
  }
  return -1;
}

const positiveInt = (value: string | undefined) => {
  if (!value || !/^\d{1,6}$/.test(value)) return null;
  const n = Number(value);
  return n > 0 ? n : null;
};

const httpUrl = (value: string | undefined | null) => {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
};

/**
 * Parses an `#EXTM3U` playlist. Relative entry URLs resolve against `base`.
 * Only HTTP(S) entries are kept. Throws when the text is not a playlist or
 * has more than {@link M3U_MAX_ENTRIES} entries.
 */
export function parseM3u(text: string, base: string): M3uParseResult {
  const body = text.replace(/^﻿/, '');
  if (!body.trimStart().startsWith('#EXTM3U')) throw new Error('M3U_INVALID');
  const lines = body.split(/\r?\n/);
  const header: M3uHeader = { tvgUrls: [] };
  const first = attributes(lines.find((line) => line.trimStart().startsWith('#EXTM3U')) ?? '');
  for (const key of ['url-tvg', 'x-tvg-url', 'tvg-url'])
    for (const value of (first.get(key) ?? '').split(','))
      if (httpUrl(value.trim())) header.tvgUrls.push(httpUrl(value.trim())!);
  const headerCatchupDays = positiveInt(first.get('catchup-days'));

  const entries: M3uEntry[] = [];
  let extinf: string | null = null;
  let group: string | null = null;
  let userAgent: string | null = null;
  let referrer: string | null = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('#EXTINF:')) {
      extinf = line;
      continue;
    }
    if (line.startsWith('#EXTGRP:')) {
      group = line.slice(8).trim() || null;
      continue;
    }
    if (line.startsWith('#EXTVLCOPT:')) {
      const [key, ...rest] = line.slice(11).split('=');
      const value = rest.join('=').trim();
      if (/^http-user-agent$/i.test(key.trim())) userAgent = value || null;
      if (/^http-referr?er$/i.test(key.trim())) referrer = value || null;
      continue;
    }
    if (line.startsWith('#')) continue;
    let url: string | null = null;
    try {
      url = httpUrl(new URL(line.split('|', 1)[0], base).href);
    } catch {
      url = null;
    }
    if (url && extinf) {
      const attrs = attributes(extinf);
      const comma = commaOutsideQuotes(extinf);
      const duration = Number.parseFloat(extinf.slice(8, comma < 0 ? undefined : comma)) || 0;
      const name = (comma < 0 ? '' : extinf.slice(comma + 1).trim()) || attrs.get('tvg-name') || '';
      const kind = classifyM3u(url, duration);
      const marker = kind === 'episode' ? parseSeriesMarker(name) : null;
      entries.push({
        id: createHash('sha256').update(url).digest('hex').slice(0, 24),
        kind,
        // i18n-ignore: fallback name stored in the shared catalog by the server, not interface text
        name: (name || `Kanal ${entries.length + 1}`).slice(0, 300),
        url,
        group: (attrs.get('group-title') || group || '').slice(0, 200),
        tvgId: attrs.get('tvg-id') || null,
        tvgName: attrs.get('tvg-name') || null,
        logo: httpUrl(attrs.get('tvg-logo')),
        number: positiveInt(attrs.get('tvg-chno')),
        catchupDays:
          positiveInt(attrs.get('catchup-days')) ??
          (attrs.has('catchup') ? (headerCatchupDays ?? 7) : null),
        userAgent: attrs.get('user-agent') || userAgent,
        referrer: attrs.get('referrer') || referrer,
        seriesName: kind === 'episode' ? (marker?.seriesName ?? name) : null,
        season: marker?.season ?? null,
        episode: marker?.episode ?? null,
      });
      if (entries.length > M3U_MAX_ENTRIES) throw new Error('M3U_TOO_LARGE');
    }
    extinf = null;
    group = null;
    userAgent = null;
    referrer = null;
  }
  if (!entries.length) throw new Error('M3U_EMPTY');
  return { header, entries };
}

/** Xtream credentials embedded in a `get.php?username=…&password=…` export URL. */
export function detectXtreamExport(raw: string) {
  try {
    const url = new URL(raw);
    const username = url.searchParams.get('username');
    const password = url.searchParams.get('password');
    if (!/\/get\.php$/i.test(url.pathname) || !username || !password) return null;
    return { server: url.origin, username, password };
  } catch {
    return null;
  }
}
