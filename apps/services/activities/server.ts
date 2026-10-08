import Fastify from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { z } from 'zod';
import { commandSchema, opaqueId } from '../../../packages/activity-protocol/src/index';
import { ActivityError, applyCommand, emptyRoom, pruneDisconnected, response, type ActivityIdentity } from './engine';
import type { ActivityRepository, StoredRoom } from './repository';
import { heartbeatGame } from './games';

export interface ActivityServerOptions {
  repository: ActivityRepository;
  /** Check current upstream membership and permissions on every request. Never cache bearer tokens here. */
  authorize?: (bearer: string, roomId: string) => Promise<ActivityIdentity>;
  clock?: () => number;
  sweepIntervalMs?: number;
}
export async function createActivityServer(options: ActivityServerOptions) {
  const app = Fastify({ logger: false, bodyLimit: 65536 });
  await app.register(rateLimit, { max: 120, timeWindow: '1 minute' });
  const now = options.clock ?? Date.now;
  const locks = new Map<string, Promise<unknown>>();
  const listeners = new Map<string, Set<() => void>>();
  const serialize = async <T>(id: string, task: () => Promise<T>): Promise<T> => {
    const work = (locks.get(id) ?? Promise.resolve()).catch(() => {}).then(task);
    locks.set(id, work);
    try { return await work; } finally { if (locks.get(id) === work) locks.delete(id); }
  };
  const notify = (id: string) => { for (const wake of listeners.get(id) ?? []) wake(); };
  const identityOf = async (header: string | undefined, roomId: string) => {
    if (!header || !header.startsWith('Bearer ') || header.length > 8192) throw new ActivityError(401, 'AUTH_REQUIRED');
    if (!options.authorize) throw new ActivityError(503, 'AUTHORIZATION_NOT_CONFIGURED');
    const identity = z.object({ userId: opaqueId.refine(id => !['__proto__', 'constructor', 'prototype'].includes(id)), displayName: z.string().min(1).max(240), canControl: z.boolean(), canCreate: z.boolean() }).strict().parse(await options.authorize(header.slice(7), roomId));
    return identity;
  };
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ActivityError) return reply.code(error.status).send({ error: error.code });
    if (error instanceof z.ZodError) return reply.code(400).send({ error: 'INVALID_COMMAND' });
    if ((error as { statusCode?: number }).statusCode === 429) return reply.code(429).send({ error: 'RATE_LIMITED' });
    // Upstream failures fail closed; do not leak token-bearing request details.
    return reply.code(503).send({ error: 'ACTIVITY_SERVICE_UNAVAILABLE' });
  });
  const roomParam = z.object({ roomId: opaqueId });
  app.get('/health', async () => ({ service: 'rooms-activities', protocolVersion: 1, authorizationConfigured: !!options.authorize }));
  app.post('/v1/rooms/:roomId/activity/commands', async request => {
    const { roomId } = roomParam.parse(request.params);
    const identity = await identityOf(request.headers.authorization, roomId);
    const command = commandSchema.parse(request.body);
    return serialize(roomId, async () => {
      const room = await options.repository.load(roomId) ?? emptyRoom(roomId, now());
      // A rejected command never changes persisted state or a participant's lease.
      const changed = applyCommand(room, identity, command, now());
      if (changed) { await options.repository.save(room); notify(roomId); }
      return response(room, command.expectedRevision, now(), identity.userId);
    });
  });
  app.get('/v1/rooms/:roomId/activity', async request => {
    const { roomId } = roomParam.parse(request.params);
    const query = z.object({ afterRevision: z.coerce.number().int().min(0).default(0), waitMs: z.coerce.number().int().min(0).max(25000).default(0) }).strict().parse(request.query);
    const identity = await identityOf(request.headers.authorization, roomId);
    const read = () => serialize(roomId, async () => {
      const room = await options.repository.load(roomId) ?? emptyRoom(roomId, now());
      const participant = room.snapshot.participants.find(p => p.userId === identity.userId);
      if (participant) { participant.lastSeenAt = now(); participant.canControl = identity.canControl; if (room.game) heartbeatGame(room.game, identity.userId); await options.repository.save(room); }
      return room;
    });
    let room: StoredRoom;
    // Subscribe BEFORE reading to avoid losing a command between read and listener installation.
    let release = () => {};
    const wake = new Promise<void>(resolve => { release = resolve; });
    const bucket = listeners.get(roomId) ?? new Set<() => void>(); bucket.add(release); listeners.set(roomId, bucket);
    const timer = setTimeout(release, query.waitMs); timer.unref();
    const aborted = () => release(); request.raw.once('aborted', aborted);
    try {
      room = await read();
      if (query.waitMs && room.snapshot.revision === query.afterRevision) { await wake; await identityOf(request.headers.authorization, roomId); room = await read(); }
      return response(room, query.afterRevision, now(), identity.userId);
    } finally {
      clearTimeout(timer); request.raw.off('aborted', aborted); bucket.delete(release); if (!bucket.size) listeners.delete(roomId);
    }
  });
  let sweeping = false;
  const sweep = setInterval(async () => {
    if (sweeping) return; sweeping = true;
    try { for (const stored of await options.repository.list()) await serialize(stored.snapshot.roomId, async () => {
      const room = await options.repository.load(stored.snapshot.roomId);
      if (room && pruneDisconnected(room, now())) { await options.repository.save(room); notify(room.snapshot.roomId); }
    }); } catch { /* The next sweep retries. Never expose stale leases as an auth substitute. */ }
    finally { sweeping = false; }
  }, options.sweepIntervalMs ?? 5000); sweep.unref();
  app.addHook('onClose', async () => { clearInterval(sweep); for (const id of listeners.keys()) notify(id); });
  return app;
}
