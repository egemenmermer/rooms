import type { FastifyInstance } from 'fastify';

/**
 * Caddy and the Docker network reach the services from private addresses, and Caddy writes
 * the client's address into X-Forwarded-For (it drops the header from untrusted clients).
 * Trust exactly those hops, so `request.ip` is the client instead of the proxy for everyone.
 */
export const TRUSTED_PROXIES = ['loopback', 'linklocal', 'uniquelocal'];

/**
 * A per-client-address budget across every route, including routes with their own limits.
 * Per-token limits key on the bearer value, so without this a client sending a fresh token
 * on every request would never be throttled (and each request still costs an auth lookup).
 */
export function ingressLimit(
  app: FastifyInstance,
  options: { perMinute: number; error: string; now?: () => number },
) {
  const windows = new Map<string, { start: number; count: number }>();
  app.addHook('onRequest', async (request, reply) => {
    const now = options.now?.() ?? Date.now();
    const key = request.ip;
    let window = windows.get(key);
    if (!window || now - window.start >= 60_000) {
      window = { start: now, count: 0 };
      windows.delete(key);
      windows.set(key, window);
      // Oldest windows first; a flood of addresses cannot grow the map without bound.
      for (const old of windows.keys()) {
        if (windows.size <= 20_000) break;
        windows.delete(old);
      }
    }
    window.count++;
    if (window.count > options.perMinute) return reply.code(429).send({ error: options.error });
  });
}
