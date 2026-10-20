/** Signup tokens issued by the ROOMS access broker; the same value travels in every link form. */
export const INVITE_TOKEN_PATTERN = /^[a-f0-9]{64}$/;
/** Older broker tickets and upstream community invitations accepted from legacy links. */
export const LEGACY_INVITE_CODE_PATTERN = /^[A-Za-z0-9_-]{2,128}$/;
export const INVITE_LINK_MAX_USES = 10;
export const INVITE_LINK_DAYS = 7;
/** Active links per community; any member with the invite permission may create one. */
export const INVITE_LINKS_PER_SPACE = 50;
export const INVITE_LINK_PATH = '/davet/';

export interface InviteLink {
  serverUrl: string;
  code: string;
}

const LOOPBACK_HOSTS = ['127.0.0.1', 'localhost', '[::1]'];

/**
 * Same acceptance rules as the Stoat adapter's instance URL check: HTTPS, or HTTP on loopback for
 * development; no credentials, query or fragment; an optional `/api` suffix is kept.
 */
export function inviteServerUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (
      (url.protocol !== 'https:' &&
        !(url.protocol === 'http:' && LOOPBACK_HOSTS.includes(url.hostname))) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !['', '/', '/api', '/api/'].includes(url.pathname)
    )
      return null;
    return url.origin + (url.pathname.startsWith('/api') ? '/api' : '');
  } catch {
    return null;
  }
}

/** The public origin that serves `/davet/<token>`; it never carries the `/api` suffix. */
export function inviteOrigin(serverUrl: string): string | null {
  const server = inviteServerUrl(serverUrl);
  return server ? new URL(server).origin : null;
}

/** Shareable link that opens a landing page with download and "open in ROOMS" steps. */
export function inviteShareLink(serverUrl: string, token: string): string | null {
  const origin = inviteOrigin(serverUrl);
  return origin && INVITE_TOKEN_PATTERN.test(token) ? `${origin}${INVITE_LINK_PATH}${token}` : null;
}

/** Desktop deep link for the same invitation; used by the landing page's "open" button. */
export function inviteAppLink(serverUrl: string, token: string): string | null {
  const origin = inviteOrigin(serverUrl);
  if (!origin || !LEGACY_INVITE_CODE_PATTERN.test(token)) return null;
  return `rooms://invite?server=${encodeURIComponent(origin)}&code=${encodeURIComponent(token)}`;
}

function parseAppLink(url: URL): InviteLink | null {
  if (
    url.hostname !== 'invite' ||
    !['', '/'].includes(url.pathname) ||
    url.username ||
    url.password ||
    url.hash ||
    [...url.searchParams.keys()].some((key) => !['server', 'code'].includes(key)) ||
    url.searchParams.getAll('server').length !== 1 ||
    url.searchParams.getAll('code').length !== 1
  )
    return null;
  const serverUrl = inviteServerUrl(url.searchParams.get('server') ?? '');
  const code = url.searchParams.get('code') ?? '';
  return serverUrl && LEGACY_INVITE_CODE_PATTERN.test(code) ? { serverUrl, code } : null;
}

function parseShareLink(url: URL): InviteLink | null {
  if (url.username || url.password) return null;
  const origin = inviteOrigin(url.origin);
  const match = /^\/davet\/([a-f0-9]{64})\/?$/.exec(url.pathname);
  // Messengers append tracking parameters or fragments; the token alone identifies the invitation.
  return origin && match ? { serverUrl: origin, code: match[1] } : null;
}

/**
 * Accepts `rooms://invite?server=…&code=…`, `https://<server>/davet/<token>` and, only when a
 * fallback server is known, a bare token pasted on its own.
 */
export function parseInviteLink(
  raw: string,
  options: { fallbackServer?: string } = {},
): InviteLink | null {
  const value = raw.trim().replace(/^<|>$/g, '');
  if (!value || value.length > 4096) return null;
  if (INVITE_TOKEN_PATTERN.test(value)) {
    const serverUrl = options.fallbackServer ? inviteServerUrl(options.fallbackServer) : null;
    return serverUrl ? { serverUrl, code: value } : null;
  }
  try {
    const url = new URL(value);
    if (url.protocol === 'rooms:') return parseAppLink(url);
    if (url.protocol === 'https:' || url.protocol === 'http:') return parseShareLink(url);
    return null;
  } catch {
    return null;
  }
}
