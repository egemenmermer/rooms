// Credential masking for log lines and any UI that shows a provider URL.
// Ported from Kanal's `lib/data/net/mask.dart`. None of these functions throw;
// over-masking is preferred to leaking.
//
// `http://domain.com:8080/live/kanal/secret/1001.ts` →
// `http://dom***:8080/live/ka***/***/1001.ts`.

const sensitiveParamFragments = ['user', 'pass', 'pwd', 'token', 'secret', 'auth', 'key'];
const credentialPathKeywords = new Set(['live', 'movie', 'series', 'timeshift']);

const urlParts =
  /^(?<scheme>[A-Za-z][A-Za-z0-9+.-]*:\/\/)?(?:(?<userinfo>[^/?#]*)@)?(?<host>\[[^\]]*\]|[^:/?#]*)(?<port>:[^/?#]*)?(?<path>[^?#]*)(?:\?(?<query>[^#]*))?(?:#(?<fragment>[\s\S]*))?$/;
const shortStreamFile = /^\d+(?:\.[A-Za-z0-9]+)?(?:\|.*)?$/;
const embeddedUrl = /[A-Za-z][A-Za-z0-9+.-]*:\/\/[^\s"'<>]+/g;
const credentialPair =
  /\b([A-Za-z_-]*(?:user|pass|pwd|token|secret|auth|key)[A-Za-z_-]*)=([^&\s"'<>]+)/gi;

/**
 * Masks credentials in a URL: host cut after 3 characters (port kept),
 * userinfo → `***@`, Xtream `/live|movie|series|timeshift/<user>/<pass>/`
 * path credentials and the short `/<user>/<pass>/<id>` form, and query
 * parameters such as `username`, `password`, `token` and `key`.
 */
export function maskUrl(url: string): string {
  const m = urlParts.exec(url);
  if (!m?.groups) return '***';
  const g = m.groups;
  let out = g.scheme ?? '';
  if (g.userinfo !== undefined) out += g.userinfo ? '***@' : '@';
  out += maskHost(g.host ?? '') + maskPort(g.port) + maskPath(g.path ?? '');
  if (g.query !== undefined) out += `?${maskQuery(g.query)}`;
  if (g.fragment !== undefined) out += `#${maskQuery(g.fragment)}`;
  return out;
}

/** Masks a server base (`https://domain.com:8080` → `https://dom***:8080`); drops the query. */
export function maskServer(server: string): string {
  const m = urlParts.exec(server.trim());
  if (!m?.groups) return '***';
  const g = m.groups;
  let out = g.scheme ?? '';
  if (g.userinfo !== undefined) out += g.userinfo ? '***@' : '@';
  return out + maskHost(g.host ?? '') + maskPort(g.port) + maskPath(g.path ?? '');
}

/** Masks every URL in free text and any stray `password=…`-style pair. */
export function maskText(text: string): string {
  return text
    .replace(embeddedUrl, (url) => maskUrl(url))
    .replace(credentialPair, (whole, name: string, value: string) =>
      value === '***' ? whole : `${name}=***`,
    );
}

function maskHost(host: string) {
  if (!host) return host;
  if (host.startsWith('[')) {
    const end = host.endsWith(']') ? host.length - 1 : host.length;
    return `[${prefix(host.slice(1, end), 3)}***]`;
  }
  return `${prefix(host, 3)}***`;
}

function maskPort(port: string | undefined) {
  if (port === undefined) return '';
  return /^\d*$/.test(port.slice(1)) ? port : ':***';
}

function maskPath(path: string) {
  if (!path.includes('/')) return path;
  const segments = path.split('/');
  let masked = false;
  for (let i = 0; i < segments.length; i++) {
    if (i + 2 < segments.length && credentialPathKeywords.has(segments[i].toLowerCase())) {
      segments[i + 1] = maskUser(segments[i + 1]);
      segments[i + 2] = '***';
      i += 2;
      masked = true;
    }
  }
  if (
    !masked &&
    segments.length === 4 &&
    segments[0] === '' &&
    segments[1] &&
    segments[2] &&
    shortStreamFile.test(segments[3])
  ) {
    segments[1] = maskUser(segments[1]);
    segments[2] = '***';
  }
  return segments.join('/');
}

function maskUser(segment: string) {
  let decoded = segment;
  try {
    decoded = decodeURIComponent(segment);
  } catch {
    // Keep the raw segment.
  }
  if ([...decoded].length < 4) return '***';
  return `${encodeURIComponent(prefix(decoded, 2))}***`;
}

function maskQuery(query: string) {
  if (!query.includes('=')) return query;
  return query
    .split('&')
    .map((part) => {
      const eq = part.indexOf('=');
      if (eq < 0) return part;
      const name = part.slice(0, eq);
      return isSensitiveParam(name) ? `${name}=***` : part;
    })
    .join('&');
}

function isSensitiveParam(rawName: string) {
  let name = rawName;
  try {
    name = decodeURIComponent(rawName.replaceAll('+', ' '));
  } catch {
    // Keep the raw name.
  }
  name = name.toLowerCase();
  // `&amp;password=` in URLs copied from HTML or M3U files.
  if (name.startsWith('amp;')) name = name.slice(4);
  return sensitiveParamFragments.some((fragment) => name.includes(fragment));
}

function prefix(s: string, count: number) {
  const chars = [...s];
  return chars.length <= count ? s : chars.slice(0, count).join('');
}
