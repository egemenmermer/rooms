import type { FastifyInstance } from 'fastify';
import { mkdir, open, readFile, rename, stat, unlink } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { StoatClient, StoatError } from '@rooms/stoat';
import { SOCIAL_ID_PATTERN } from '@rooms/social';
import { seedAccountInvite, type AccountInviteSink } from './account-invites';

/** A request nobody decided on stops counting against the queue after this many days. */
export const SIGNUP_PENDING_DAYS = 14;
/** Decided and expired requests stay readable this long so the person can see the outcome. */
const KEEP_DAYS = 30;
const DAY_MS = 86400 * 1000;
export const SIGNUP_LIMITS = { perIpPerHour: 3, globalPerHour: 20, maxPending: 50 } as const;
export type SignupLimits = { perIpPerHour: number; globalPerHour: number; maxPending: number };

const datetime = z.string().datetime();
const socialId = z.string().regex(SOCIAL_ID_PATTERN);
const entrySchema = z
  .object({
    spaceId: socialId,
    username: z.string().min(2).max(32),
    createdAt: datetime,
    state: z.enum(['pending', 'approved', 'joined', 'rejected']),
    decidedAt: datetime.optional(),
    decidedBy: socialId.optional(),
  })
  .strict();
const fileSchema = z
  .object({
    version: z.literal(1),
    /** Keyed by the upstream user id; no email, password or session is ever stored. */
    requests: z.record(socialId, entrySchema),
    /** Broker-owned upstream community invitations that admit approved people; never sent out. */
    communityInvites: z.record(socialId, z.string().min(2).max(128)),
  })
  .strict();
type SignupFile = z.infer<typeof fileSchema>;
type Entry = z.infer<typeof entrySchema>;
export type SignupStatus = 'none' | 'pending' | 'approved' | 'joined' | 'rejected' | 'expired';
export interface SignupRequestSummary {
  userId: string;
  username: string;
  createdAt: string;
  state: 'pending' | 'approved';
}

export const signupUsername = z
  .string()
  .trim()
  .min(2)
  .max(32)
  .regex(/^[\p{L}\d_.-]+$/u);
const signupBody = z
  .object({
    email: z.string().trim().email().max(254),
    password: z.string().min(8).max(256),
    username: signupUsername,
  })
  .strict();

/** Counts events in a rolling window; used for the server-wide sign-up budget. */
export class WindowLimiter {
  private readonly hits: number[] = [];
  constructor(
    private readonly max: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}
  take() {
    const now = this.now();
    while (this.hits.length && now - this.hits[0]! >= this.windowMs) this.hits.shift();
    if (this.hits.length >= this.max) return false;
    this.hits.push(now);
    return true;
  }
}

const queues = new Map<string, Promise<unknown>>();

/**
 * Durable queue of approved sign-up requests. Writes are atomic (temp file, fsync, rename) and
 * serialized in this process and across processes sharing the file, like the invitation ledger.
 */
export class SignupRequestStore {
  private readonly now: () => number;
  private readonly lockWaitMs: number;
  constructor(
    readonly path: string,
    options: { now?: () => number; lockWaitMs?: number } = {},
  ) {
    this.now = options.now ?? Date.now;
    this.lockWaitMs = options.lockWaitMs ?? 3000;
  }
  private async load(): Promise<SignupFile> {
    let raw: unknown;
    try {
      raw = JSON.parse(await readFile(this.path, 'utf8'));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT')
        return { version: 1, requests: {}, communityInvites: {} };
      throw new StoatError(503, 'SIGNUP_STORE_INVALID');
    }
    const parsed = fileSchema.safeParse(raw);
    if (!parsed.success) throw new StoatError(503, 'SIGNUP_STORE_INVALID');
    return parsed.data;
  }
  private expired(entry: Entry) {
    return (
      entry.state === 'pending' &&
      this.now() - Date.parse(entry.createdAt) >= SIGNUP_PENDING_DAYS * DAY_MS
    );
  }
  private async persist(data: SignupFile) {
    const now = this.now();
    for (const [userId, entry] of Object.entries(data.requests)) {
      // Approved people keep their place until they join; everything else is pruned in time.
      const until =
        entry.state === 'pending'
          ? Date.parse(entry.createdAt) + (SIGNUP_PENDING_DAYS + KEEP_DAYS) * DAY_MS
          : entry.state === 'approved'
            ? Infinity
            : Date.parse(entry.decidedAt ?? entry.createdAt) + KEEP_DAYS * DAY_MS;
      if (now >= until) delete data.requests[userId];
    }
    const temp = `${this.path}.${randomUUID()}.tmp`;
    const file = await open(temp, 'wx', 0o600);
    try {
      await file.writeFile(JSON.stringify(data) + '\n');
      await file.sync();
    } finally {
      await file.close();
    }
    await rename(temp, this.path);
  }
  private async withLock<T>(work: (data: SignupFile) => Promise<T>): Promise<T> {
    const previous = queues.get(this.path) ?? Promise.resolve();
    let release!: () => void;
    const turn = new Promise<void>((resolve) => (release = resolve));
    const chained = previous.then(
      () => turn,
      () => turn,
    );
    queues.set(this.path, chained);
    await previous.catch(() => {});
    const lockPath = `${this.path}.lock`;
    try {
      await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
      const deadline = Date.now() + this.lockWaitMs;
      let lock;
      for (;;) {
        try {
          lock = await open(lockPath, 'wx', 0o600);
          break;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
          const info = await stat(lockPath).catch(() => null);
          // A crashed process leaves its lock behind; never let that block every later request.
          if (info && Date.now() - info.mtimeMs > 30000) {
            await unlink(lockPath).catch(() => {});
            continue;
          }
          if (Date.now() >= deadline) throw new StoatError(409, 'SIGNUP_BUSY');
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
      }
      try {
        return await work(await this.load());
      } finally {
        await lock.close();
        await unlink(lockPath).catch(() => {});
      }
    } finally {
      release();
      if (queues.get(this.path) === chained) queues.delete(this.path);
    }
  }
  private pendingCount(data: SignupFile) {
    return Object.values(data.requests).filter(
      (entry) => entry.state === 'pending' && !this.expired(entry),
    ).length;
  }
  async status(userId: string): Promise<{ status: SignupStatus; entry: Entry | null }> {
    const entry = (await this.load()).requests[userId];
    if (!entry) return { status: 'none', entry: null };
    return { status: this.expired(entry) ? 'expired' : entry.state, entry };
  }
  /** Read-only early check so a full queue refuses before any upstream account is created. */
  async assertCapacity(maxPending: number) {
    if (this.pendingCount(await this.load()) >= maxPending)
      throw new StoatError(503, 'SIGNUP_QUEUE_FULL');
  }
  /**
   * Records a request. `maxPending` is enforced only where no account was created for this call;
   * an account that already exists is always queued so it is never left without a request.
   */
  async add(userId: string, spaceId: string, username: string, maxPending?: number) {
    return this.withLock(async (data) => {
      const existing = data.requests[userId];
      if (existing && !this.expired(existing))
        throw new StoatError(409, 'SIGNUP_ALREADY_REQUESTED');
      if (maxPending !== undefined && this.pendingCount(data) >= maxPending)
        throw new StoatError(503, 'SIGNUP_QUEUE_FULL');
      data.requests[userId] = {
        spaceId,
        username,
        createdAt: new Date(this.now()).toISOString(),
        state: 'pending',
      };
      await this.persist(data);
    });
  }
  async list(spaceId: string): Promise<SignupRequestSummary[]> {
    const data = await this.load();
    return Object.entries(data.requests)
      .filter(
        ([, entry]) =>
          entry.spaceId === spaceId &&
          (entry.state === 'approved' || (entry.state === 'pending' && !this.expired(entry))),
      )
      .map(([userId, entry]) => ({
        userId,
        username: entry.username,
        createdAt: entry.createdAt,
        state: entry.state as 'pending' | 'approved',
      }))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
  /** Open requests only: a pending one, or an approved one whose person has not joined yet. */
  async find(spaceId: string, userId: string) {
    const entry = (await this.load()).requests[userId];
    if (
      !entry ||
      entry.spaceId !== spaceId ||
      !(entry.state === 'approved' || (entry.state === 'pending' && !this.expired(entry)))
    )
      throw new StoatError(404, 'SIGNUP_REQUEST_NOT_FOUND');
    return entry;
  }
  async decide(spaceId: string, userId: string, state: 'approved' | 'rejected', by: string) {
    return this.withLock(async (data) => {
      const entry = data.requests[userId];
      if (
        !entry ||
        entry.spaceId !== spaceId ||
        !(entry.state === 'approved' || (entry.state === 'pending' && !this.expired(entry)))
      )
        throw new StoatError(404, 'SIGNUP_REQUEST_NOT_FOUND');
      entry.state = state;
      entry.decidedAt = new Date(this.now()).toISOString();
      entry.decidedBy = by;
      await this.persist(data);
    });
  }
  async markJoined(userId: string) {
    return this.withLock(async (data) => {
      const entry = data.requests[userId];
      if (!entry || entry.state !== 'approved') return;
      entry.state = 'joined';
      await this.persist(data);
    });
  }
  async communityInvite(spaceId: string) {
    return (await this.load()).communityInvites[spaceId] ?? null;
  }
  async setCommunityInvite(spaceId: string, code: string) {
    return this.withLock(async (data) => {
      data.communityInvites[spaceId] = code;
      await this.persist(data);
    });
  }
}

const definiteRefusal = (error: unknown) =>
  error instanceof StoatError &&
  error.status >= 400 &&
  error.status < 500 &&
  ![408, 429].includes(error.status);

export interface SignupRequestOptions {
  /** Community approved people join; unset keeps approved sign-up off. */
  spaceId?: string;
  store: SignupRequestStore;
  accountInvites: AccountInviteSink | null;
  limits?: Partial<SignupLimits>;
  stoat(token?: string): StoatClient;
  tokenOf(header: string | undefined): string;
  /** The space owner or an owner-equivalent admin, as for invitation links. */
  requireSpaceAdmin(
    authorization: string | undefined,
    spaceId: string,
  ): Promise<{ client: StoatClient; userId: string }>;
}

/**
 * Sign-up without an invitation link. The broker creates the upstream account itself with a
 * freshly seeded account invitation (the public proxy keeps blocking raw account creation), so
 * the new account exists but belongs to no community. An owner or admin approves the request;
 * the person then joins through a broker-owned community invitation on their next status check.
 */
export function registerSignupRequests(server: FastifyInstance, options: SignupRequestOptions) {
  const limits: SignupLimits = { ...SIGNUP_LIMITS };
  for (const [key, value] of Object.entries(options.limits ?? {}))
    if (value !== undefined) limits[key as keyof SignupLimits] = value;
  const budget = new WindowLimiter(limits.globalPerHour, 3600 * 1000);
  const enabled = () => !!options.spaceId && !!options.accountInvites;
  const joins = new Map<string, Promise<unknown>>();
  const approvals = new Map<string, Promise<unknown>>();
  const serialized = <T>(
    locks: Map<string, Promise<unknown>>,
    key: string,
    work: () => Promise<T>,
  ) => {
    const run = (locks.get(key) ?? Promise.resolve()).catch(() => {}).then(work);
    locks.set(key, run);
    return run.finally(() => {
      if (locks.get(key) === run) locks.delete(key);
    });
  };
  const isMember = (client: StoatClient, spaceId: string, userId: string) =>
    client.getMember(spaceId, userId).then(
      () => true,
      (error) => {
        if (error instanceof StoatError && [403, 404].includes(error.status)) return false;
        throw error;
      },
    );

  server.get(
    '/v1/auth/signup',
    { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    async () => ({ enabled: enabled() }),
  );
  server.post(
    '/v1/auth/signup-requests',
    { config: { rateLimit: { max: limits.perIpPerHour, timeWindow: '1 hour' } } },
    async (request) => {
      const body = signupBody.parse(request.body);
      if (!enabled() || !options.spaceId || !options.accountInvites)
        throw new StoatError(501, 'SIGNUP_UNAVAILABLE');
      await options.store.assertCapacity(limits.maxPending);
      if (!budget.take()) throw new StoatError(429, 'SIGNUP_BUSY');
      let accountInviteCode: string;
      try {
        accountInviteCode = await seedAccountInvite(options.accountInvites);
      } catch {
        throw new StoatError(503, 'INVITE_PROVISIONING_UNAVAILABLE');
      }
      const client = options.stoat();
      let stage: 'prepare' | 'account-create' | 'account-created' = 'prepare';
      let user;
      try {
        user = await client.createUpstreamAccount(
          { ...body, accountInviteCode },
          { onStage: (next) => (stage = next) },
        );
      } catch (error) {
        // An account may exist once creation was attempted without a definite refusal.
        if (stage === 'prepare' || (stage === 'account-create' && definiteRefusal(error)))
          throw error;
        throw new StoatError(502, 'REGISTRATION_UNCERTAIN');
      }
      const token = client.getToken();
      if (!token) throw new StoatError(502, 'INVALID_SESSION_RESPONSE');
      // The account exists now; queue it even when the queue filled up meanwhile.
      await options.store.add(user.id, options.spaceId, body.username);
      return { token, status: 'pending' as const };
    },
  );
  server.get(
    '/v1/auth/signup-requests/me',
    { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    async (request) => {
      const client = options.stoat(options.tokenOf(request.headers.authorization));
      const user = await client.getCurrentUser();
      const { status, entry } = await options.store.status(user.id);
      if (status !== 'approved' || !entry)
        return { status, enabled: enabled(), createdAt: entry?.createdAt ?? null };
      return serialized(joins, user.id, async () => {
        const current = await options.store.status(user.id);
        if (current.status !== 'approved') return { status: current.status, enabled: enabled() };
        const spaceId = entry.spaceId;
        if (!(await isMember(client, spaceId, user.id))) {
          const code = await options.store.communityInvite(spaceId);
          if (!code) throw new StoatError(409, 'SIGNUP_JOIN_FAILED');
          try {
            await client.acceptInvite(code);
          } catch (error) {
            // Banned, or the invitation was removed upstream: an admin approves again.
            if (definiteRefusal(error)) throw new StoatError(409, 'SIGNUP_JOIN_FAILED');
            throw error;
          }
        }
        await options.store.markJoined(user.id);
        const space = await client.getServer(spaceId).catch(() => null);
        return {
          status: 'joined' as const,
          enabled: enabled(),
          space: { id: spaceId, name: typeof space?.name === 'string' ? space.name : '' },
        };
      });
    },
  );
  // An existing account without a request (expired, or its request could not be written) asks again.
  server.post(
    '/v1/auth/signup-requests/me',
    { config: { rateLimit: { max: limits.perIpPerHour, timeWindow: '1 hour' } } },
    async (request) => {
      if (!enabled() || !options.spaceId) throw new StoatError(501, 'SIGNUP_UNAVAILABLE');
      const client = options.stoat(options.tokenOf(request.headers.authorization));
      const user = await client.getCurrentUser();
      if (await isMember(client, options.spaceId, user.id))
        throw new StoatError(409, 'SIGNUP_ALREADY_MEMBER');
      const username = (user.username || user.displayName).slice(0, 32).padEnd(2, '_');
      await options.store.add(user.id, options.spaceId, username, limits.maxPending);
      return { status: 'pending' as const, enabled: true };
    },
  );
  const spaceParams = z.object({ spaceId: socialId });
  const decisionParams = z.object({ spaceId: socialId, userId: socialId });
  server.get(
    '/v1/spaces/:spaceId/signup-requests',
    { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    async (request) => {
      const { spaceId } = spaceParams.parse(request.params);
      await options.requireSpaceAdmin(request.headers.authorization, spaceId);
      if (!enabled() || options.spaceId !== spaceId) return { enabled: false, requests: [] };
      return { enabled: true, requests: await options.store.list(spaceId) };
    },
  );
  server.post(
    '/v1/spaces/:spaceId/signup-requests/:userId/approve',
    { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    async (request) => {
      const { spaceId, userId } = decisionParams.parse(request.params);
      const admin = await options.requireSpaceAdmin(request.headers.authorization, spaceId);
      if (!enabled() || options.spaceId !== spaceId)
        throw new StoatError(404, 'SIGNUP_NOT_ENABLED');
      await options.store.find(spaceId, userId);
      await serialized(approvals, spaceId, async () => {
        const known = await options.store.communityInvite(spaceId);
        const usable =
          known &&
          (await admin.client.inspectUpstreamInvite(known).then(
            (invite) => invite.space?.id === spaceId,
            (error) => {
              if (definiteRefusal(error)) return false;
              throw error;
            },
          ));
        if (usable) return;
        const space = (await admin.client.getServer(spaceId)) as { channels?: unknown };
        const channelId = Array.isArray(space.channels)
          ? space.channels.find((id): id is string => typeof id === 'string')
          : undefined;
        if (!channelId) throw new StoatError(409, 'SIGNUP_CHANNEL_REQUIRED');
        const created = await admin.client.createUpstreamInvite(channelId);
        await options.store.setCommunityInvite(spaceId, created.code);
      });
      await options.store.decide(spaceId, userId, 'approved', admin.userId);
      return { state: 'approved' as const };
    },
  );
  server.post(
    '/v1/spaces/:spaceId/signup-requests/:userId/reject',
    { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    async (request) => {
      const { spaceId, userId } = decisionParams.parse(request.params);
      const admin = await options.requireSpaceAdmin(request.headers.authorization, spaceId);
      if (!enabled() || options.spaceId !== spaceId)
        throw new StoatError(404, 'SIGNUP_NOT_ENABLED');
      await options.store.decide(spaceId, userId, 'rejected', admin.userId);
      return { state: 'rejected' as const };
    },
  );
}
