import { z } from 'zod';
import type { StoatClient } from '@rooms/stoat';
import { SOCIAL_ID_PATTERN } from '@rooms/social';
import { CINEMA_REF_PATTERN } from '../../../packages/community-cinema/src/types';

/** The account the cinema request was made with; a request finishing in another account fails. */
export type CinemaAccount = { client: StoatClient; token: string; origin: string };

export class CinemaRequestError extends Error {}

const socialId = z.string().regex(SOCIAL_ID_PATTERN);
const ref = z.string().regex(CINEMA_REF_PATTERN);
const kind = z.enum(['live', 'movie', 'series']);
const relayFile = /^[A-Za-z0-9_.-]{1,80}$/;
const sessionId = /^[A-Za-z0-9_-]{1,80}$/;

const sourceInput = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('xtream'),
      server: z.string().max(2048),
      username: z.string().max(200),
      password: z.string().max(200),
      guideUrl: z.string().max(2048).nullable(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('m3u'),
      url: z.string().max(2048),
      guideUrl: z.string().max(2048).nullable(),
    })
    .strict(),
]);

const itemsQuery = z
  .object({
    kind,
    categoryId: z.string().max(120).nullable().optional(),
    sort: z.enum(['default', 'name', 'added', 'rating']).optional(),
    offset: z.number().int().min(0).max(1_000_000).optional(),
    limit: z.number().int().min(1).max(200).optional(),
  })
  .strict();

const watchResponse = z
  .object({
    session: z.string().regex(sessionId),
    ticket: z
      .string()
      .min(16)
      .max(1024)
      .regex(/^[A-Za-z0-9_.-]+$/),
    expiresAt: z.number(),
    live: z.boolean(),
    durationSec: z.number().nullable(),
    offsetSec: z.number().min(0),
    epoch: z.number().int(),
    itemRef: z.string().regex(CINEMA_REF_PATTERN),
  })
  .passthrough();

type Ticket = z.infer<typeof watchResponse> & { hallId: string; account: CinemaAccount };

/**
 * Community cinema IPC and the `rooms-cinema:` scheme. The Stoat token and
 * relay tickets stay here; the renderer gets `rooms-cinema://stream/<session>/…`
 * for playback and `rooms-cinema://art/<hall>/<id>` for artwork.
 */
export function setupCommunityCinema(options: {
  handle(name: string, handler: (...args: unknown[]) => unknown): void;
  /** The signed-in account, or a thrown sign-in error. */
  account(): CinemaAccount;
  /** Whether `account` is still the signed-in one. */
  isCurrent(account: CinemaAccount): boolean;
  fetch?: typeof fetch;
}) {
  const request = options.fetch ?? fetch;
  const tickets = new Map<string, Ticket>();

  async function call(
    account: CinemaAccount,
    method: 'GET' | 'PUT' | 'POST' | 'DELETE',
    path: string,
    body?: unknown,
    timeoutMs = 15_000,
  ) {
    let response: Response;
    try {
      response = await request(`${account.origin}/rooms-cinema${path}`, {
        method,
        headers: {
          Authorization: account.token,
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        redirect: 'error',
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      throw new CinemaRequestError('CINEMA_UNAVAILABLE');
    }
    const value = (await response.json().catch(() => null)) as { error?: unknown } | null;
    if (!options.isCurrent(account)) throw new CinemaRequestError('Oturum değişti.');
    if (!response.ok)
      throw new CinemaRequestError(
        typeof value?.error === 'string' && /^CINEMA_[A-Z_]{2,40}$/.test(value.error)
          ? value.error
          : 'CINEMA_UNAVAILABLE',
      );
    return value;
  }

  const api = (
    method: 'GET' | 'PUT' | 'POST' | 'DELETE',
    path: string,
    body?: unknown,
    timeoutMs?: number,
  ) => call(options.account(), method, path, body, timeoutMs);
  const community = (communityId: unknown) =>
    `/v1/communities/${encodeURIComponent(socialId.parse(communityId))}`;
  const hall = (hallId: unknown) => `/v1/halls/${encodeURIComponent(socialId.parse(hallId))}`;

  options.handle('rooms:cinema-status', (communityId) => api('GET', community(communityId)));
  options.handle('rooms:cinema-set-hall', (communityId, channelId) =>
    api('PUT', `${community(communityId)}/hall`, {
      channelId: socialId.nullable().parse(channelId),
    }),
  );
  // Verifying an account downloads its playlist or account info; large M3U files take a while.
  options.handle('rooms:cinema-connect', (communityId, source) =>
    api('PUT', `${community(communityId)}/source`, sourceInput.parse(source), 180_000),
  );
  options.handle('rooms:cinema-disconnect', async (communityId) => {
    const result = await api('DELETE', `${community(communityId)}/source`);
    tickets.clear();
    return result;
  });
  options.handle('rooms:cinema-reload', (communityId, scope) =>
    api('POST', `${community(communityId)}/reload`, {
      scope: z.enum(['all', 'guide']).parse(scope),
    }),
  );
  options.handle('rooms:cinema-categories', (hallId, value) =>
    api('GET', `${hall(hallId)}/categories?kind=${kind.parse(value)}`),
  );
  options.handle('rooms:cinema-items', (hallId, value) => {
    const query = itemsQuery.parse(value);
    const params = new URLSearchParams({ kind: query.kind });
    if (query.categoryId) params.set('categoryId', query.categoryId);
    if (query.sort) params.set('sort', query.sort);
    if (query.offset !== undefined) params.set('offset', String(query.offset));
    if (query.limit !== undefined) params.set('limit', String(query.limit));
    return api('GET', `${hall(hallId)}/items?${params}`);
  });
  options.handle('rooms:cinema-search', (hallId, text, kinds) => {
    const params = new URLSearchParams({ q: z.string().max(200).parse(text) });
    if (kinds !== undefined) params.set('kinds', z.array(kind).max(3).parse(kinds).join(','));
    return api('GET', `${hall(hallId)}/search?${params}`);
  });
  options.handle('rooms:cinema-guide', (hallId, refs, from, to) =>
    api('POST', `${hall(hallId)}/guide`, {
      refs: z.array(ref).max(200).parse(refs),
      from: z.number().int().nonnegative().parse(from),
      to: z.number().int().nonnegative().parse(to),
    }),
  );
  options.handle('rooms:cinema-details', (hallId, value) =>
    api('GET', `${hall(hallId)}/details/${encodeURIComponent(ref.parse(value))}`),
  );
  options.handle('rooms:cinema-watch', async (hallId) => {
    const id = socialId.parse(hallId);
    const account = options.account();
    const watch = watchResponse.parse(
      await call(account, 'POST', `${hall(id)}/watch`, undefined, 30_000),
    );
    for (const [session, ticket] of tickets)
      if (ticket.hallId === id && session !== watch.session) tickets.delete(session);
    tickets.set(watch.session, { ...watch, hallId: id, account });
    return {
      src: `rooms-cinema://stream/${watch.session}/index.m3u8`,
      itemRef: watch.itemRef,
      live: watch.live,
      durationSec: watch.durationSec,
      offsetSec: watch.offsetSec,
      epoch: watch.epoch,
    };
  });

  /** Renews a ticket close to expiry; a new session means the hall moved on. */
  async function ticketFor(session: string) {
    const ticket = tickets.get(session);
    if (!ticket || !options.isCurrent(ticket.account)) return null;
    if (ticket.expiresAt - Date.now() > 30_000) return ticket;
    try {
      const next = watchResponse.parse(
        await call(ticket.account, 'POST', `${hall(ticket.hallId)}/watch`, undefined, 30_000),
      );
      if (next.session !== session) {
        tickets.delete(session);
        return null;
      }
      const renewed = { ...ticket, ...next };
      tickets.set(session, renewed);
      return renewed;
    } catch {
      return ticket.expiresAt > Date.now() ? ticket : null;
    }
  }

  const cors = { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' };

  const serve = async (incoming: Request) => {
    try {
      const url = new URL(incoming.url);
      const [first, second] = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
      if (url.hostname === 'stream') {
        if (!first || !second || !sessionId.test(first) || !relayFile.test(second))
          return new Response('Not found', { status: 404, headers: cors });
        const ticket = await ticketFor(first);
        if (!ticket) return new Response('Expired', { status: 410, headers: cors });
        const response = await request(
          `${ticket.account.origin}/rooms-cinema/v1/relay/${encodeURIComponent(ticket.ticket)}/${encodeURIComponent(second)}`,
          { redirect: 'error', signal: incoming.signal },
        );
        if (!options.isCurrent(ticket.account)) {
          await response.body?.cancel();
          return new Response('Expired', { status: 410, headers: cors });
        }
        return new Response(response.ok ? response.body : null, {
          status: response.status,
          headers: {
            ...cors,
            'Content-Type': response.headers.get('content-type') ?? 'application/octet-stream',
          },
        });
      }
      if (url.hostname === 'art') {
        if (
          !first ||
          !second ||
          !SOCIAL_ID_PATTERN.test(first) ||
          !/^[a-f0-9]{16,64}$/.test(second)
        )
          return new Response('Not found', { status: 404 });
        const account = options.account();
        const response = await request(
          `${account.origin}/rooms-cinema${hall(first)}/art/${second}`,
          {
            headers: { Authorization: account.token },
            redirect: 'error',
            signal: incoming.signal,
          },
        );
        const type = response.headers.get('content-type') ?? '';
        if (!response.ok || !type.startsWith('image/') || !options.isCurrent(account)) {
          await response.body?.cancel();
          return new Response('Not found', { status: 404 });
        }
        return new Response(response.body, {
          headers: { 'Content-Type': type, 'Cache-Control': 'private, max-age=86400' },
        });
      }
      return new Response('Not found', { status: 404 });
    } catch {
      return new Response('Unavailable', { status: 502, headers: cors });
    }
  };

  return {
    /** Handler for the `rooms-cinema:` scheme; main registers it. */
    serve,
    /** Forget every relay ticket (sign-out, account switch). */
    clear() {
      tickets.clear();
    },
  };
}
