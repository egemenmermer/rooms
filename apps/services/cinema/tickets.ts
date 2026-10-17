import { createHmac, timingSafeEqual } from 'node:crypto';

export type TicketClaims = { session: string; userId: string; hallId: string; exp: number };

const SESSION = /^[a-f0-9]{32}$/;
const SOCIAL = /^[A-Za-z0-9_-]{1,128}$/;

const sign = (payload: string, secret: Buffer) =>
  createHmac('sha256', secret).update(payload).digest('base64url');

/**
 * Short-lived relay ticket: `base64url(json).base64url(hmac)`. It binds one relay
 * session to one member of one hall and carries no Stoat token or provider data.
 */
export function issueTicket(
  claims: { session: string; userId: string; hallId: string },
  secret: Buffer,
  ttlMs = 120_000,
  now = Date.now(),
) {
  if (!SESSION.test(claims.session) || !SOCIAL.test(claims.userId) || !SOCIAL.test(claims.hallId))
    throw new Error('Invalid ticket claims');
  const expiresAt = now + ttlMs;
  const payload = Buffer.from(
    JSON.stringify({ s: claims.session, u: claims.userId, h: claims.hallId, e: expiresAt }),
  ).toString('base64url');
  return { ticket: `${payload}.${sign(payload, secret)}`, expiresAt };
}

export function verifyTicket(
  ticket: string,
  secret: Buffer,
  now = Date.now(),
): TicketClaims | null {
  if (ticket.length > 1024) return null;
  const match = /^([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]{43})$/.exec(ticket);
  if (!match) return null;
  const expected = Buffer.from(sign(match[1], secret));
  const given = Buffer.from(match[2]);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(match[1], 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  const { s, u, h, e } = (value ?? {}) as Record<string, unknown>;
  if (
    typeof s !== 'string' ||
    typeof u !== 'string' ||
    typeof h !== 'string' ||
    typeof e !== 'number' ||
    !SESSION.test(s) ||
    !SOCIAL.test(u) ||
    !SOCIAL.test(h) ||
    e <= now
  )
    return null;
  return { session: s, userId: u, hallId: h, exp: e };
}
