import type { FastifyInstance } from 'fastify';
import type { RelayManager } from './relay';
import { verifyTicket } from './tickets';

/**
 * Relay files for players: `GET /v1/relay/<ticket>/<file>`. The ticket binds the
 * session, so playlist-relative names (`init.mp4`, `seg000001.m4s`) resolve under the
 * same ticket. A wildcard route because tickets exceed Fastify's 100-character
 * parameter limit.
 */
export function registerRelayRoutes(
  server: FastifyInstance,
  options: { relays: RelayManager; ticketSecret: Buffer },
) {
  server.get('/v1/relay/*', async (request, reply) => {
    reply.header('cache-control', 'no-store');
    const match = /^([A-Za-z0-9_.-]{1,1024})\/([A-Za-z0-9_.-]{1,64})$/.exec(
      (request.params as { '*': string })['*'],
    );
    const claims = match ? verifyTicket(match[1], options.ticketSecret) : null;
    if (!match || !claims) return reply.code(401).send();
    const found = await options.relays.file(claims.session, match[2]);
    if (!found) return reply.code(404).send();
    return reply.type(found.type).send(found.body);
  });
}
