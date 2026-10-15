import { randomBytes, randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { StoatError } from '@rooms/stoat';
import {
  remoteSourceSchema,
  type RemoteSource,
  type RemoteLease,
} from '../../../packages/shared-contracts/src/remote-control';
import { opsId } from '../../../packages/shared-contracts/src/hostops';

export interface RemoteMember {
  userId: string;
  participantSid: string;
  screens: string[];
  human: boolean;
  label?: string;
}
const deny = (message: string, status = 403) => new StoatError(status, message);
/** Ephemeral only: restart/reconnect/new source require a new publisher decision. */
export class RemoteConsent {
  private sources = new Map<string, RemoteSource>();
  private requests = new Map<string, Omit<RemoteLease, 'leaseId' | 'inputKey' | 'approvedAt'>>();
  private leases = new Map<string, RemoteLease>();
  constructor(private now = Date.now) {}
  register(source: RemoteSource) {
    const key = `${source.channelId}:${source.publisherId}`,
      previous = this.sources.get(key);
    if (
      !previous &&
      (this.sources.size >= 1000 ||
        [...this.sources.values()].filter((s) => s.channelId === source.channelId).length >= 20)
    )
      throw deny('REMOTE_SOURCE_LIMIT');
    if (previous && JSON.stringify(previous) !== JSON.stringify(source))
      this.revoke(source.channelId, source.publisherId);
    this.sources.set(key, structuredClone(source));
  }
  revoke(channelId: string, userId: string, source = false) {
    for (const [id, lease] of this.leases)
      if (
        lease.source.channelId === channelId &&
        [lease.source.publisherId, lease.controllerId].includes(userId)
      )
        this.leases.delete(id);
    for (const [id, request] of this.requests)
      if (
        request.source.channelId === channelId &&
        [request.source.publisherId, request.controllerId].includes(userId)
      )
        this.requests.delete(id);
    if (source) this.sources.delete(`${channelId}:${userId}`);
  }
  source(channelId: string, publisherId: string) {
    return this.sources.get(`${channelId}:${publisherId}`);
  }
  parties(channelId: string) {
    return [
      ...new Set(
        [...this.leases.values()]
          .filter((l) => l.source.channelId === channelId)
          .flatMap((l) => [l.source.publisherId, l.controllerId]),
      ),
    ];
  }
  hasControl(channelId: string, userId: string) {
    return !!this.controlId(channelId, userId);
  }
  controlId(channelId: string, userId: string) {
    this.prune();
    return (
      [...this.leases.values()].find(
        (l) =>
          l.source.channelId === channelId &&
          [l.source.publisherId, l.controllerId].includes(userId),
      )?.leaseId ?? null
    );
  }
  private prune() {
    for (const [id, r] of this.requests) if (r.expiresAt <= this.now()) this.requests.delete(id);
    for (const [id, l] of this.leases) if (l.expiresAt <= this.now()) this.leases.delete(id);
  }
  request(source: RemoteSource, member: RemoteMember) {
    this.prune();
    if (!member.human || member.userId === source.publisherId)
      throw deny('REMOTE_HUMAN_PEER_REQUIRED');
    if (
      [...this.leases.values()].some(
        (l) =>
          l.source.channelId === source.channelId &&
          [l.source.publisherId, l.controllerId].includes(member.userId),
      )
    )
      throw deny('REMOTE_ALREADY_ACTIVE');
    if (
      [...this.requests.values()].some(
        (r) => r.source.channelId === source.channelId && r.controllerId === member.userId,
      )
    )
      throw deny('REMOTE_REQUEST_PENDING');
    if (
      this.requests.size >= 1000 ||
      [...this.requests.values()].filter((r) => r.source.channelId === source.channelId).length >=
        20
    )
      throw deny('REMOTE_REQUEST_LIMIT');
    const value = {
      id: randomUUID(),
      source: structuredClone(source),
      controllerId: member.userId,
      controllerName: member.label?.slice(0, 128),
      controllerSid: member.participantSid,
      createdAt: this.now(),
      expiresAt: this.now() + 30_000,
    };
    this.requests.set(value.id, value);
    return value;
  }
  pending(id: string) {
    this.prune();
    return this.requests.get(id);
  }
  decide(id: string, publisher: RemoteMember, controller: RemoteMember, approve: boolean) {
    this.prune();
    const request = this.requests.get(id);
    if (
      !request ||
      request.source.publisherId !== publisher.userId ||
      request.source.participantSid !== publisher.participantSid ||
      !publisher.screens.includes(request.source.trackId) ||
      !publisher.human ||
      !controller.human ||
      request.controllerId !== controller.userId ||
      request.controllerSid !== controller.participantSid ||
      this.source(request.source.channelId, publisher.userId)?.epoch !== request.source.epoch
    )
      throw deny('REMOTE_REQUEST_STALE');
    this.requests.delete(id);
    if (!approve) return;
    if (
      [...this.leases.values()].some(
        (l) =>
          l.source.channelId === request.source.channelId &&
          ([l.source.publisherId, l.controllerId].includes(publisher.userId) ||
            [l.source.publisherId, l.controllerId].includes(controller.userId)),
      )
    )
      throw deny('REMOTE_ALREADY_ACTIVE');
    const lease: RemoteLease = {
      ...request,
      leaseId: randomUUID(),
      inputKey: randomBytes(32).toString('hex'),
      approvedAt: this.now(),
      expiresAt: this.now() + 5000,
    };
    this.leases.set(lease.leaseId, lease);
  }
  async validate(channelId: string, get: (userId: string) => Promise<RemoteMember>) {
    this.prune();
    for (const source of [...this.sources.values()].filter((s) => s.channelId === channelId)) {
      try {
        const member = await get(source.publisherId);
        if (
          !member.human ||
          member.participantSid !== source.participantSid ||
          !member.screens.includes(source.trackId)
        )
          throw Error('changed');
      } catch {
        this.revoke(channelId, source.publisherId, true);
      }
    }
    for (const lease of [...this.leases.values()].filter((l) => l.source.channelId === channelId)) {
      try {
        const member = await get(lease.controllerId);
        if (
          !member.human ||
          member.participantSid !== lease.controllerSid ||
          this.source(channelId, lease.source.publisherId)?.epoch !== lease.source.epoch
        )
          throw Error('changed');
      } catch {
        this.leases.delete(lease.leaseId);
      }
    }
  }
  state(channelId: string, userId: string) {
    this.prune();
    const lease =
      [...this.leases.values()].find(
        (l) =>
          l.source.channelId === channelId &&
          [l.source.publisherId, l.controllerId].includes(userId),
      ) ?? null;
    // Only publisher heartbeats extend consent; the viewer cannot keep unattended control alive.
    if (lease?.source.publisherId === userId) lease.expiresAt = this.now() + 5000;
    return {
      serverAt: this.now(),
      sources: [...this.sources.values()].filter((s) => s.channelId === channelId),
      requests: [...this.requests.values()].filter(
        (r) =>
          r.source.channelId === channelId &&
          [r.source.publisherId, r.controllerId].includes(userId),
      ),
      lease,
    };
  }
}
export function registerRemoteControl(
  app: FastifyInstance,
  config: {
    member(token: string, channelId: string): Promise<RemoteMember>;
    peer(channelId: string, userId: string): Promise<RemoteMember>;
    setData?(channelId: string, userId: string, enabled: boolean): Promise<void>;
  },
) {
  const consent = new RemoteConsent();
  const synchronization = new Map<string, Promise<void>>();
  const applied = new Map<string, string | null>();
  const sync = async (channelId: string, users: string[]) => {
    const previous = synchronization.get(channelId) ?? Promise.resolve();
    const operation = previous
      .catch(() => {})
      .then(async () => {
        for (const userId of new Set([...users, ...consent.parties(channelId)])) {
          const key = `${channelId}:${userId}`,
            lease = consent.controlId(channelId, userId);
          if (applied.has(key) && applied.get(key) === lease) continue;
          await config.setData?.(channelId, userId, !!lease);
          if (applied.size >= 1000) applied.clear();
          applied.set(key, lease);
        }
      });
    synchronization.set(channelId, operation);
    try {
      await operation;
    } finally {
      if (synchronization.get(channelId) === operation) synchronization.delete(channelId);
    }
  };
  const body = z.object({ channelId: opsId }).strict();
  const member = async (header: unknown, channelId: string) => {
    if (typeof header !== 'string' || !header || header.length > 4096)
      throw deny('AUTH_REQUIRED', 401);
    const value = await config.member(header.replace(/^Bearer /, ''), channelId);
    if (!value.human) throw deny('REMOTE_HUMAN_PEER_REQUIRED');
    return value;
  };
  app.post('/v1/media/remote/register', async (req) => {
    const b = body
      .extend({ trackId: remoteSourceSchema.shape.trackId, epoch: z.string().uuid() })
      .strict()
      .parse(req.body);
    const p = await member(req.headers.authorization, b.channelId);
    const previous = consent.parties(b.channelId);
    if (!p.screens.includes(b.trackId)) throw deny('REMOTE_SCREEN_REQUIRED');
    consent.register({
      channelId: b.channelId,
      publisherId: p.userId,
      participantSid: p.participantSid,
      trackId: b.trackId,
      epoch: b.epoch,
    });
    await sync(b.channelId, previous);
    return { registered: true };
  });
  app.post('/v1/media/remote/state', async (req) => {
    const b = body.parse(req.body),
      p = await member(req.headers.authorization, b.channelId);
    const previous = [...consent.parties(b.channelId), p.userId];
    await consent.validate(b.channelId, (id) => config.peer(b.channelId, id));
    await sync(b.channelId, previous);
    return consent.state(b.channelId, p.userId);
  });
  app.post('/v1/media/remote/request', async (req) => {
    const b = body
        .extend({ publisherId: opsId, epoch: z.string().uuid() })
        .strict()
        .parse(req.body),
      p = await member(req.headers.authorization, b.channelId);
    await consent.validate(b.channelId, (id) => config.peer(b.channelId, id));
    const source = consent.source(b.channelId, b.publisherId);
    if (!source || source.epoch !== b.epoch) throw deny('REMOTE_SOURCE_STALE');
    return { requestId: consent.request(source, p).id };
  });
  app.post('/v1/media/remote/decide', async (req) => {
    const b = body
        .extend({ requestId: z.string().uuid(), approve: z.boolean() })
        .strict()
        .parse(req.body),
      p = await member(req.headers.authorization, b.channelId);
    const request = consent.pending(b.requestId);
    if (!request || request.source.channelId !== b.channelId) throw deny('REMOTE_REQUEST_STALE');
    const peer = await config.peer(b.channelId, request.controllerId);
    // Recheck publisher after peer lookup to fence a source/account change during the await.
    const fresh = await member(req.headers.authorization, b.channelId);
    if (fresh.userId !== p.userId) throw deny('IDENTITY_CHANGED');
    const previous = consent.parties(b.channelId);
    consent.decide(b.requestId, fresh, peer, b.approve);
    try {
      await sync(b.channelId, [...previous, fresh.userId, peer.userId]);
    } catch (error) {
      consent.revoke(b.channelId, fresh.userId);
      await sync(b.channelId, [...previous, fresh.userId, peer.userId]).catch(() => {});
      throw error;
    }
    return { decided: true };
  });
  app.post('/v1/media/remote/revoke', async (req) => {
    const b = body
        .extend({ source: z.boolean().default(false) })
        .strict()
        .parse(req.body),
      p = await member(req.headers.authorization, b.channelId);
    const previous = consent.parties(b.channelId);
    consent.revoke(b.channelId, p.userId, b.source);
    await sync(b.channelId, [...previous, p.userId]);
    return { revoked: true };
  });
  return consent;
}
