// Loosely typed Xtream Codes JSON. PHP panels send the same field as `1`,
// `"1"`, `1.0`, `null`, `""`, `"null"`, `false` or `[]`; every helper accepts
// anything and never throws. Ported from Kanal's `json_utils.dart` and
// `xtream_models.dart`.

export function asInt(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? Math.trunc(v) : null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'string' && v.trim()) {
    const n = Number(v.trim());
    return Number.isFinite(n) ? Math.trunc(n) : null;
  }
  return null;
}

export function asPositiveInt(v: unknown) {
  const n = asInt(v);
  return n !== null && n > 0 ? n : null;
}

/** Finite number; a single decimal comma (`"7,5"`) is accepted. */
export function asNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string' || !v.trim()) return null;
  let s = v.trim();
  if (!s.includes('.') && s.split(',').length === 2) s = s.replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Trimmed string; `""`, `"null"`, booleans, objects → null; numbers → text. */
export function asString(v: unknown): string | null {
  if (typeof v === 'string') {
    const s = v.trim();
    return s && s.toLowerCase() !== 'null' ? s : null;
  }
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : null;
  return null;
}

/** Provider id: `1001`, `1001.0` and `" 1001 "` → `"1001"`. */
export function asId(v: unknown): string | null {
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : null;
  const s = asString(v);
  if (!s) return null;
  return /^\d+\.0+$/.test(s) ? s.slice(0, s.indexOf('.')) : s;
}

export function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

/** Rows from an array, or from `{data|categories: [...]}`, or from an id-keyed object. */
export function asRows(v: unknown): Record<string, unknown>[] {
  let rows: unknown[] = [];
  if (Array.isArray(v)) rows = v;
  else if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if (Array.isArray(o.data)) rows = o.data;
    else if (Array.isArray(o.categories)) rows = o.categories;
    else rows = Object.values(o);
  }
  return rows.filter(
    (row): row is Record<string, unknown> =>
      !!row && typeof row === 'object' && !Array.isArray(row),
  );
}

const inactiveStatuses = new Set(['expired', 'banned', 'disabled']);

export type XtreamAccount = {
  active: boolean;
  status: string | null;
  /** Epoch ms, or null for "unlimited". */
  expiresAt: number | null;
  maxConnections: number | null;
  activeConnections: number | null;
  /** Server wall clock minus UTC, rounded to 15 minutes. */
  serverOffsetMinutes: number;
  /** Live output formats the account may use (`ts`, `m3u8`); empty when the panel does not say. */
  outputFormats: string[];
};

/** MPEG-TS when the account allows it (one long request, quick zaps), else HLS. */
export function liveExtension(account: Pick<XtreamAccount, 'outputFormats'> | null) {
  const formats = account?.outputFormats ?? [];
  return formats.length && !formats.includes('ts') && formats.includes('m3u8') ? 'm3u8' : 'ts';
}

/** Reads `player_api.php` (no action): `user_info` + `server_info`. */
export function xtreamAccount(json: unknown): XtreamAccount {
  const root = asRecord(json);
  const user = asRecord(root.user_info);
  const server = asRecord(root.server_info);
  const status = asString(user.status);
  const auth = asInt(user.auth) === 1;
  const expires = asPositiveInt(user.exp_date);
  const timestamp = asPositiveInt(server.timestamp_now);
  const wall = asString(server.time_now);
  let offset = 0;
  if (timestamp && wall) {
    const parsed = Date.parse(`${wall.replace(' ', 'T')}Z`);
    if (Number.isFinite(parsed))
      offset = Math.round((parsed - timestamp * 1000) / 60_000 / 15) * 15;
  }
  return {
    active: auth && !inactiveStatuses.has(status?.toLowerCase() ?? ''),
    status,
    expiresAt: expires ? expires * 1000 : null,
    maxConnections: asPositiveInt(user.max_connections),
    activeConnections: asInt(user.active_cons),
    serverOffsetMinutes: Math.abs(offset) <= 14 * 60 ? offset : 0,
    outputFormats: Array.isArray(user.allowed_output_formats)
      ? user.allowed_output_formats
          .map((format) => asString(format)?.toLowerCase())
          .filter((format): format is string => !!format && /^[a-z0-9]{1,8}$/.test(format))
          .slice(0, 8)
      : [],
  };
}

/** Xtream stream URLs. The password is part of the path, so these never leave the server. */
export function xtreamUrls(server: string, username: string, password: string) {
  const base = server.replace(/\/+$/, '');
  const u = encodeURIComponent(username);
  const p = encodeURIComponent(password);
  return {
    api: (params: Record<string, string> = {}) => {
      const url = new URL(`${base}/player_api.php`);
      url.searchParams.set('username', username);
      url.searchParams.set('password', password);
      for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
      return url.href;
    },
    xmltv: () => {
      const url = new URL(`${base}/xmltv.php`);
      url.searchParams.set('username', username);
      url.searchParams.set('password', password);
      return url.href;
    },
    live: (streamId: string, ext = 'ts') => `${base}/live/${u}/${p}/${streamId}.${ext}`,
    movie: (streamId: string, ext: string) => `${base}/movie/${u}/${p}/${streamId}.${ext}`,
    episode: (episodeId: string, ext: string) => `${base}/series/${u}/${p}/${episodeId}.${ext}`,
  };
}

/** A container extension Xtream may report; anything else falls back to mp4/ts. */
export function containerExtension(v: unknown, fallback: string) {
  const s = asString(v)?.toLowerCase();
  return s && /^[a-z0-9]{2,5}$/.test(s) ? s : fallback;
}
