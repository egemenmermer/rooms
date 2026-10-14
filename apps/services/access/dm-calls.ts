import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { AccessToken, TrackSource, type RoomServiceClient } from 'livekit-server-sdk';
import { StoatError } from '@rooms/stoat';
import type { SocialUser } from '@rooms/social';
import {
  dmCallActionSchema,
  dmCallIdSchema,
  dmCallStartSchema,
  type DmCallSession,
} from '../../../packages/shared-contracts/src/dm-call';

interface Authorization {
  user: SocialUser;
  peer: SocialUser;
}
interface Record {
  session: DmCallSession;
  tokens: Map<string, string>;
  seen: Map<string, number>;
  grants: Set<string>;
  cleanup: boolean;
}
interface Dependencies {
  identify(token: string): Promise<SocialUser>;
  authorize(token: string, dmId: string): Promise<Authorization>;
  disconnect(room: string): Promise<unknown>;
  now?: () => number;
}
const terminalRetention = 60_000;
export const dmCallRoom = (id: string) => `rooms-dm-call-${id}`;
/** Transient single-process invitations. No chat writes and no account credentials in public state. */
export class DmCallRegistry {
  private records = new Map<string, Record>();
  private latest = new Map<string, string>();
  private now: () => number;
  constructor(private dependencies: Dependencies) {
    this.now = dependencies.now ?? Date.now;
  }
  private get(id: string, userId: string) {
    const record = this.records.get(id);
    if (!record || ![record.session.callerId, record.session.calleeId].includes(userId))
      throw new StoatError(404, 'DM_CALL_NOT_FOUND');
    return record;
  }
  private public(record: Record): DmCallSession {
    return { ...record.session };
  }
  private async finish(record: Record, reason: NonNullable<DmCallSession['reason']>) {
    if (record.session.state !== 'ended') {
      record.session = {
        ...record.session,
        state: 'ended',
        reason,
        expiresAt: this.now() + terminalRetention,
      };
      record.tokens.clear();
      record.grants.clear();
      record.cleanup = true;
    }
    if (record.cleanup)
      try {
        await this.dependencies.disconnect(dmCallRoom(record.session.id));
        record.cleanup = false;
      } catch {
        /* Sweep retries revocation without reopening the call. */
      }
    return this.public(record);
  }
  private expired(record: Record) {
    return record.session.state === 'ringing'
      ? this.now() >= record.session.expiresAt
      : record.session.state === 'accepted' &&
          [record.session.callerId, record.session.calleeId].some(
            (id) => this.now() - (record.seen.get(id) ?? 0) > 35_000,
          );
  }
  private async validate(record: Record) {
    if (this.expired(record)) {
      await this.finish(record, record.session.state === 'ringing' ? 'missed' : 'disconnected');
      return false;
    }
    if (record.session.state === 'ended') return false;
    try {
      for (const [id, token] of record.tokens) {
        const auth = await this.dependencies.authorize(token, record.session.dmId);
        if (
          auth.user.id !== id ||
          auth.peer.id !==
            (id === record.session.callerId ? record.session.calleeId : record.session.callerId)
        )
          throw new StoatError(403, 'DM_CALL_ACCESS_DENIED');
      }
    } catch {
      await this.finish(record, 'access-lost');
      return false;
    }
    if (this.expired(record)) {
      await this.finish(record, record.session.state === 'ringing' ? 'missed' : 'disconnected');
      return false;
    }
    return this.records.get(record.session.id)?.session.state !== 'ended';
  }
  async start(token: string, dmId: string, mode: 'audio' | 'video') {
    const { user, peer } = await this.dependencies.authorize(token, dmId);
    for (const id of [user.id, peer.id]) {
      const previous = this.records.get(this.latest.get(id) ?? '');
      if (previous && previous.session.state !== 'ended') {
        if (this.expired(previous))
          await this.finish(
            previous,
            previous.session.state === 'ringing' ? 'missed' : 'disconnected',
          );
        else throw new StoatError(409, 'DM_CALL_BUSY');
      }
    }
    // No await between the final occupancy check and reservation: crossed calls cannot both win.
    for (const id of [user.id, peer.id]) {
      const previous = this.records.get(this.latest.get(id) ?? '');
      if (previous && previous.session.state !== 'ended') throw new StoatError(409, 'DM_CALL_BUSY');
    }
    if (this.records.size >= 10_000) throw new StoatError(503, 'DM_CALL_CAPACITY');
    const now = this.now(),
      session: DmCallSession = {
        id: randomUUID(),
        dmId,
        callerId: user.id,
        calleeId: peer.id,
        callerName: user.displayName.slice(0, 128),
        calleeName: peer.displayName.slice(0, 128),
        mode,
        state: 'ringing',
        reason: null,
        createdAt: now,
        acceptedAt: null,
        expiresAt: now + 45_000,
      };
    const record: Record = {
      session,
      tokens: new Map([[user.id, token]]),
      seen: new Map([[user.id, now]]),
      grants: new Set(),
      cleanup: false,
    };
    this.records.set(session.id, record);
    this.latest.set(user.id, session.id);
    this.latest.set(peer.id, session.id);
    return this.public(record);
  }
  async poll(token: string) {
    const user = await this.dependencies.identify(token),
      record = this.records.get(this.latest.get(user.id) ?? '');
    if (!record) return { call: null };
    if (record.session.state !== 'ended') {
      try {
        const auth = await this.dependencies.authorize(token, record.session.dmId);
        if (
          auth.user.id !== user.id ||
          auth.peer.id !==
            (user.id === record.session.callerId
              ? record.session.calleeId
              : record.session.callerId)
        )
          throw new StoatError(403, 'DM_CALL_ACCESS_DENIED');
      } catch {
        await this.finish(record, 'access-lost');
      }
      if (this.expired(record))
        await this.finish(record, record.session.state === 'ringing' ? 'missed' : 'disconnected');
      record.seen.set(user.id, this.now());
    }
    return { call: this.public(record) };
  }
  async respond(token: string, id: string, action: 'accept' | 'reject' | 'end') {
    const user = await this.dependencies.identify(token),
      record = this.get(id, user.id);
    if (action === 'end')
      return this.finish(record, record.session.state === 'ringing' ? 'cancelled' : 'ended');
    if (user.id !== record.session.calleeId)
      throw new StoatError(403, 'DM_CALL_RECIPIENT_REQUIRED');
    if (action === 'reject') return this.finish(record, 'rejected');
    if (!(await this.validate(record))) throw new StoatError(409, 'DM_CALL_ENDED');
    const auth = await this.dependencies.authorize(token, record.session.dmId);
    if (auth.user.id !== user.id || auth.peer.id !== record.session.callerId)
      throw new StoatError(403, 'DM_CALL_ACCESS_DENIED');
    if (record.session.state === 'ended') throw new StoatError(409, 'DM_CALL_ENDED');
    record.tokens.set(user.id, token);
    record.seen.set(user.id, this.now());
    if (record.session.state === 'ringing') {
      record.session = {
        ...record.session,
        state: 'accepted',
        acceptedAt: this.now(),
        expiresAt: this.now() + 35_000,
      };
      record.seen.set(record.session.callerId, this.now());
    }
    return this.public(record);
  }
  async authorizeGrant(token: string, id: string) {
    const user = await this.dependencies.identify(token),
      record = this.get(id, user.id);
    if (record.session.state !== 'accepted' || !(await this.validate(record)))
      throw new StoatError(403, 'DM_CALL_ACCEPT_REQUIRED');
    const auth = await this.dependencies.authorize(token, record.session.dmId);
    if (
      auth.user.id !== user.id ||
      auth.peer.id !==
        (user.id === record.session.callerId ? record.session.calleeId : record.session.callerId) ||
      record.session.state !== 'accepted'
    )
      throw new StoatError(403, 'DM_CALL_ACCESS_DENIED');
    record.tokens.set(user.id, token);
    record.seen.set(user.id, this.now());
    record.grants.add(user.id);
    return { user, roomName: dmCallRoom(id) };
  }
  async participantAllowed(callId: string, userId: string) {
    const record = this.records.get(callId);
    return (
      !!record &&
      record.session.state === 'accepted' &&
      record.grants.has(userId) &&
      (await this.validate(record))
    );
  }
  async sweep() {
    for (const [id, record] of this.records) {
      if (record.session.state !== 'ended') await this.validate(record);
      else if (record.cleanup) await this.finish(record, record.session.reason ?? 'ended');
      if (
        record.session.state === 'ended' &&
        !record.cleanup &&
        this.now() >= record.session.expiresAt
      ) {
        this.records.delete(id);
        for (const user of [record.session.callerId, record.session.calleeId])
          if (this.latest.get(user) === id) this.latest.delete(user);
      }
    }
  }
  ownsRoom(room: string) {
    return [...this.records.values()].some(
      (record) => record.session.state === 'accepted' && dmCallRoom(record.session.id) === room,
    );
  }
  async close() {
    await Promise.allSettled(
      [...this.records.values()].map((record) => this.finish(record, 'disconnected')),
    );
    this.records.clear();
    this.latest.clear();
  }
}

export function registerDmCalls(
  server: FastifyInstance,
  options: Dependencies & {
    apiKey: string;
    apiSecret: string;
    publicLivekitUrl: string;
    roomService: RoomServiceClient;
  },
) {
  const registry = new DmCallRegistry(options);
  const token = (header: string | undefined) => {
    if (!header?.startsWith('Bearer ') || header.length > 8192 || header.length <= 7)
      throw new StoatError(401, 'AUTH_REQUIRED');
    return header.slice(7);
  };
  server.post(
    '/v1/calls/poll',
    { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } },
    (request) => registry.poll(token(request.headers.authorization)),
  );
  server.post('/v1/calls/start', (request) => {
    const body = dmCallStartSchema.parse(request.body);
    return registry.start(token(request.headers.authorization), body.dmId, body.mode);
  });
  server.post('/v1/calls/respond', (request) => {
    const body = dmCallActionSchema.parse(request.body);
    return registry.respond(token(request.headers.authorization), body.callId, body.action);
  });
  server.post('/v1/calls/grant', async (request) => {
    const { callId } = dmCallIdSchema.parse(request.body);
    const { user, roomName } = await registry.authorizeGrant(
      token(request.headers.authorization),
      callId,
    );
    const access = new AccessToken(options.apiKey, options.apiSecret, {
      identity: user.id,
      name: user.displayName,
      ttl: 60,
    });
    access.addGrant({
      roomJoin: true,
      room: roomName,
      canSubscribe: true,
      canPublish: true,
      canPublishSources: [TrackSource.MICROPHONE, TrackSource.CAMERA],
      canPublishData: false,
      canUpdateOwnMetadata: false,
    });
    return {
      serverUrl: options.publicLivekitUrl,
      roomName,
      token: await access.toJwt(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    };
  });
  let sweeping = false;
  const timer = setInterval(async () => {
    if (sweeping) return;
    sweeping = true;
    try {
      await registry.sweep();
      const rooms = await options.roomService.listRooms();
      for (const room of rooms)
        if (room.name.startsWith('rooms-dm-call-') && !registry.ownsRoom(room.name))
          await options.roomService.deleteRoom(room.name).catch(() => {});
    } catch {
      /* Retry SFU reconciliation on the next sweep, including orphan rooms after a broker restart. */
    } finally {
      sweeping = false;
    }
  }, 5000);
  timer.unref();
  server.addHook('onClose', async () => {
    clearInterval(timer);
    await registry.close();
  });
  return {
    async webhook(room: string, identity: string) {
      if (!room.startsWith('rooms-dm-call-')) return false;
      const callId = room.slice('rooms-dm-call-'.length);
      if (!(await registry.participantAllowed(callId, identity)))
        await options.roomService.removeParticipant(room, identity);
      return true;
    },
  };
}
