import type { FastifyInstance, FastifyRequest } from 'fastify';
import { mkdir, open, readFile, rename, stat, unlink } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { StoatClient, StoatError } from '@rooms/stoat';
import { SOCIAL_ID_PATTERN } from '@rooms/social';
import { isIPv6 } from 'node:net';
import type { InviteUse, RegistrationGate } from './registration';

/** A request nobody decided on stops counting against the queue after this many days. */
export const SIGNUP_PENDING_DAYS = 14;
/** Decided and expired requests stay readable this long so the person can see the outcome. */
const KEEP_DAYS = 30;
const DAY_MS = 86400 * 1000;
/** How long the single-use registration link minted at approval stays valid. */
export const SIGNUP_INVITE_SECONDS = 7 * 86400;
export const SIGNUP_LIMITS = { perIpPerHour: 3, globalPerHour: 20, maxPending: 50 } as const;
export type SignupLimits = { perIpPerHour: number; globalPerHour: number; maxPending: number };
export const SIGNUP_REQUEST_ID = /^[a-f0-9]{32}$/;
const POLL_SECRET = /^[A-Za-z0-9_-]{43}$/;

const datetime = z.string().datetime();
const socialId = z.string().regex(SOCIAL_ID_PATTERN);
const hex64 = z.string().regex(/^[a-f0-9]{64}$/);
const entrySchema = z
  .object({
    spaceId: socialId,
    username: z.string().min(2).max(32),
    /** sha256 of the normalised email; only used to refuse a second open request. */
    emailHash: hex64,
    /** sha256 of the poll secret the requester holds; the secret itself is never stored. */
    secretHash: hex64,
    createdAt: datetime,
    state: z.enum(['pending', 'approved', 'delivered', 'rejected', 'cancelled']),
    decidedAt: datetime.optional(),
    decidedBy: socialId.optional(),
    /** Management id of the single-use registration link minted at approval. */
    inviteId: z
      .string()
      .regex(/^[a-f0-9]{16}$/)
      .optional(),
    /** The link itself, kept until it is used, closed or expired so a lost reply can be repeated. */
    inviteCode: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
    inviteExpiresAt: datetime.optional(),
  })
  .strict();
const fileSchema = z
  .object({
    version: z.literal(2),
    requests: z.record(z.string().regex(SIGNUP_REQUEST_ID), entrySchema),
  })
  .strict();
type SignupFile = z.infer<typeof fileSchema>;
type Entry = z.infer<typeof entrySchema>;
/** How each registration link stands, by management id; unknown ids are left alone. */
export type InviteStates = ReadonlyMap<string, InviteUse>;
export type SignupStatus = 'pending' | 'approved' | 'issued' | 'rejected' | 'expired';
export interface SignupRequestSummary {
  id: string;
  username: string;
  createdAt: string;
  state: 'pending' | 'approved';
}

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
export const signupEmailHash = (email: string) => sha256(email.trim().toLowerCase());
export const signupUsername = z
  .string()
  .trim()
  .min(2)
  .max(32)
  .regex(/^[\p{L}\d_.-]+$/u);
const signupBody = z
  .object({ email: z.string().trim().email().max(254), username: signupUsername })
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

/**
 * Rate-limit key for a client address. An IPv6 subscriber controls a whole /64, so addresses are
 * grouped by it; IPv4 (also when IPv4-mapped) is keyed as is.
 */
export function signupClientKey(ip: string) {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  if (mapped) return mapped[1]!;
  const bare = ip.split('%')[0]!;
  if (!isIPv6(bare)) return ip;
  const [head = '', tail] = bare.split('::');
  const first = head === '' ? [] : head.split(':');
  const last = tail === undefined || tail === '' ? [] : tail.split(':');
  const groups =
    tail === undefined
      ? first
      : [...first, ...Array(8 - first.length - last.length).fill('0'), ...last];
  return (
    groups
      .slice(0, 4)
      .map((group) => group.toLowerCase().padStart(4, '0'))
      .join(':') + '::/64'
  );
}

const queues = new Map<string, Promise<unknown>>();

/**
 * Durable queue of approved sign-up requests. No account exists for a request: it holds the
 * chosen name, an email hash and a poll-secret hash. Writes are atomic and serialized in this
 * process and across processes sharing the file, like the invitation ledger.
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
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { version: 2, requests: {} };
      throw new StoatError(503, 'SIGNUP_STORE_INVALID');
    }
    const parsed = fileSchema.safeParse(raw);
    if (!parsed.success) throw new StoatError(503, 'SIGNUP_STORE_INVALID');
    return parsed.data;
  }
  expired(entry: Entry) {
    return (
      entry.state === 'pending' &&
      this.now() - Date.parse(entry.createdAt) >= SIGNUP_PENDING_DAYS * DAY_MS
    );
  }
  /** An approved link nobody used before it ran out can no longer be handed out. */
  private lapsed(entry: Entry) {
    return (
      entry.state === 'approved' &&
      entry.inviteExpiresAt !== undefined &&
      Date.parse(entry.inviteExpiresAt) <= this.now()
    );
  }
  private open(entry: Entry) {
    if (entry.state === 'approved') return !this.lapsed(entry);
    return entry.state === 'pending' && !this.expired(entry);
  }
  /**
   * Brings approved entries in line with the registration ledger and the clock: a link that was
   * used becomes delivered, one an admin closed becomes rejected, and a lapsed one drops its code.
   * Returns whether anything changed.
   */
  private sweep(data: SignupFile, states?: InviteStates) {
    let changed = false;
    for (const entry of Object.values(data.requests)) {
      if (entry.state !== 'approved') continue;
      const use = entry.inviteId ? states?.get(entry.inviteId) : undefined;
      if (use === 'used') {
        entry.state = 'delivered';
      } else if (use === 'revoked') {
        entry.state = 'rejected';
        entry.decidedAt = new Date(this.now()).toISOString();
      } else if (!(this.lapsed(entry) && entry.inviteCode)) continue;
      delete entry.inviteCode;
      changed = true;
    }
    return changed;
  }
  private async persist(data: SignupFile) {
    const now = this.now();
    for (const [id, entry] of Object.entries(data.requests)) {
      // An approved link waits for its requester; everything else is pruned in time.
      const until =
        entry.state === 'pending'
          ? Date.parse(entry.createdAt) + (SIGNUP_PENDING_DAYS + KEEP_DAYS) * DAY_MS
          : entry.state === 'approved'
            ? Date.parse(entry.inviteExpiresAt ?? entry.createdAt) + KEEP_DAYS * DAY_MS
            : Date.parse(entry.decidedAt ?? entry.createdAt) + KEEP_DAYS * DAY_MS;
      if (now >= until) delete data.requests[id];
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
  /** Queues a request and returns its id and the poll secret, which only the requester holds. */
  async add(
    input: { spaceId: string; username: string; email: string },
    maxPending: number,
    options: {
      states?: InviteStates;
      /** Called once the request would be queued; false spends nothing and refuses it as busy. */
      admit?: () => boolean;
    } = {},
  ) {
    return this.withLock(async (data) => {
      this.sweep(data, options.states);
      const emailHash = signupEmailHash(input.email);
      if (
        Object.values(data.requests).some(
          (entry) => entry.emailHash === emailHash && this.open(entry),
        )
      )
        throw new StoatError(409, 'SIGNUP_ALREADY_REQUESTED');
      if (this.pendingCount(data) >= maxPending) throw new StoatError(503, 'SIGNUP_QUEUE_FULL');
      // Only a request that is really queued uses up the server-wide budget.
      if (options.admit && !options.admit()) throw new StoatError(429, 'SIGNUP_BUSY');
      const id = randomBytes(16).toString('hex');
      const pollSecret = randomBytes(32).toString('base64url');
      data.requests[id] = {
        spaceId: input.spaceId,
        username: input.username,
        emailHash,
        secretHash: sha256(pollSecret),
        createdAt: new Date(this.now()).toISOString(),
        state: 'pending',
      };
      await this.persist(data);
      return { id, pollSecret };
    });
  }
  private authenticate(data: SignupFile, id: string, pollSecret: string) {
    const entry = SIGNUP_REQUEST_ID.test(id) ? data.requests[id] : undefined;
    const given = Buffer.from(sha256(pollSecret), 'hex');
    // Unknown ids and wrong secrets look the same to the caller.
    if (
      !entry ||
      !POLL_SECRET.test(pollSecret) ||
      !timingSafeEqual(given, Buffer.from(entry.secretHash, 'hex'))
    )
      throw new StoatError(404, 'SIGNUP_REQUEST_NOT_FOUND');
    return entry;
  }
  /**
   * The requester's view. An approved request hands out its single-use registration link on every
   * poll until the link is used, closed or expired, so a lost reply or a restart never strands an
   * approval. The poll secret is the proof of ownership.
   */
  async poll(id: string, pollSecret: string, states?: InviteStates) {
    return this.withLock(async (data) => {
      const entry = this.authenticate(data, id, pollSecret);
      if (entry.state === 'cancelled') throw new StoatError(404, 'SIGNUP_REQUEST_NOT_FOUND');
      if (this.sweep(data, states)) await this.persist(data);
      const base = { createdAt: entry.createdAt, username: entry.username };
      if (entry.state === 'approved' && entry.inviteCode && !this.lapsed(entry))
        return {
          ...base,
          status: 'approved' as const,
          inviteCode: entry.inviteCode,
          expiresAt: entry.inviteExpiresAt ?? null,
        };
      const status: SignupStatus =
        entry.state === 'delivered'
          ? 'issued'
          : entry.state === 'approved'
            ? this.lapsed(entry)
              ? 'expired'
              : 'pending'
            : this.expired(entry)
              ? 'expired'
              : (entry.state as 'pending' | 'rejected');
      return { ...base, status, inviteCode: null, expiresAt: entry.inviteExpiresAt ?? null };
    });
  }
  /** The requester withdraws; returns the link to revoke when one was minted. */
  async cancel(id: string, pollSecret: string) {
    return this.withLock(async (data) => {
      const entry = this.authenticate(data, id, pollSecret);
      // A link that was minted but never used must not outlive the withdrawn request.
      const inviteId =
        entry.state === 'approved' || entry.state === 'delivered' ? entry.inviteId : undefined;
      entry.state = 'cancelled';
      entry.decidedAt = new Date(this.now()).toISOString();
      delete entry.inviteCode;
      await this.persist(data);
      return { spaceId: entry.spaceId, inviteId };
    });
  }
  async list(spaceId: string, states?: InviteStates): Promise<SignupRequestSummary[]> {
    const data = await this.load();
    // Read-only view: the sweep is saved by the next write.
    this.sweep(data, states);
    return Object.entries(data.requests)
      .filter(([, entry]) => entry.spaceId === spaceId && this.open(entry))
      .map(([id, entry]) => ({
        id,
        username: entry.username,
        createdAt: entry.createdAt,
        state: entry.state as 'pending' | 'approved',
      }))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
  /** Open requests only: a pending one, or an approved one whose link is still unused. */
  async find(spaceId: string, id: string, states?: InviteStates) {
    const data = await this.load();
    this.sweep(data, states);
    const entry = data.requests[id];
    if (!entry || entry.spaceId !== spaceId || !this.open(entry))
      throw new StoatError(404, 'SIGNUP_REQUEST_NOT_FOUND');
    return entry;
  }
  /** Records an approval with its freshly minted link; returns a previous link to revoke. */
  async approve(
    spaceId: string,
    id: string,
    by: string,
    invite: { id: string; code: string; expiresAt: string },
    states?: InviteStates,
  ) {
    return this.withLock(async (data) => {
      this.sweep(data, states);
      const entry = data.requests[id];
      if (!entry || entry.spaceId !== spaceId || !this.open(entry))
        throw new StoatError(404, 'SIGNUP_REQUEST_NOT_FOUND');
      const replaced = entry.inviteId;
      Object.assign(entry, {
        state: 'approved',
        decidedAt: new Date(this.now()).toISOString(),
        decidedBy: by,
        inviteId: invite.id,
        inviteCode: invite.code,
        inviteExpiresAt: invite.expiresAt,
      });
      await this.persist(data);
      return { replaced };
    });
  }
  async reject(spaceId: string, id: string, by: string, states?: InviteStates) {
    return this.withLock(async (data) => {
      this.sweep(data, states);
      const entry = data.requests[id];
      if (!entry || entry.spaceId !== spaceId || !this.open(entry))
        throw new StoatError(404, 'SIGNUP_REQUEST_NOT_FOUND');
      const inviteId = entry.inviteId;
      entry.state = 'rejected';
      entry.decidedAt = new Date(this.now()).toISOString();
      entry.decidedBy = by;
      delete entry.inviteCode;
      await this.persist(data);
      return { inviteId };
    });
  }
}

export interface SignupRequestOptions {
  /** Community approved people join; unset keeps approved sign-up off. */
  spaceId?: string;
  store: SignupRequestStore;
  /** The invitation ledger behind /v1/auth/register and /v1/auth/invites/:code/join. */
  registration: RegistrationGate;
  /** Invitation-link sign-up needs this to create accounts; approved sign-up relies on it. */
  provisioning: boolean;
  limits?: Partial<SignupLimits>;
  /** The space owner or an owner-equivalent admin, as for invitation links. */
  requireSpaceAdmin(
    authorization: string | undefined,
    spaceId: string,
  ): Promise<{ client: StoatClient; userId: string }>;
}

/**
 * Sign-up without an invitation link. A request creates nothing upstream: the requester gets a
 * poll secret. When an owner or admin approves, the broker mints a single-use registration link
 * in the invitation ledger and hands it to the requester; the existing registration flow then
 * creates the account and joins the community in one step. Rejected or expired requests never get
 * an account.
 */
export function registerSignupRequests(server: FastifyInstance, options: SignupRequestOptions) {
  const limits: SignupLimits = { ...SIGNUP_LIMITS };
  for (const [key, value] of Object.entries(options.limits ?? {}))
    if (value !== undefined) limits[key as keyof SignupLimits] = value;
  const budget = new WindowLimiter(limits.globalPerHour, 3600 * 1000);
  const enabled = () => !!options.spaceId && options.provisioning;
  const secretOf = (header: string | undefined) => {
    const value = header?.replace(/^Bearer /, '') ?? '';
    if (!POLL_SECRET.test(value)) throw new StoatError(404, 'SIGNUP_REQUEST_NOT_FOUND');
    return value;
  };
  /** Unreadable ledger: report nothing known rather than fail the sign-up screens. */
  const inviteStates = () => options.registration.useStates().catch(() => undefined);
  const idParams = z.object({ id: z.string().regex(SIGNUP_REQUEST_ID) });
  const revokeQuietly = async (
    spaceId: string,
    inviteId: string | undefined,
    client?: StoatClient,
  ) => {
    if (!inviteId) return;
    try {
      const revoked = await options.registration.revoke(spaceId, inviteId);
      if (revoked.releaseUpstream && client)
        await client.deleteUpstreamInvite(revoked.communityInviteCode).catch(() => {});
    } catch {
      // Already used, revoked or expired: nothing left to close.
    }
  };

  server.get(
    '/v1/auth/signup',
    { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    async () => ({ enabled: enabled() }),
  );
  server.post(
    '/v1/auth/signup-requests',
    {
      config: {
        rateLimit: {
          max: limits.perIpPerHour,
          timeWindow: '1 hour',
          keyGenerator: (request: FastifyRequest) =>
            'signup-request:' + signupClientKey(request.ip),
        },
      },
    },
    async (request) => {
      const body = signupBody.parse(request.body);
      if (!enabled() || !options.spaceId) throw new StoatError(501, 'SIGNUP_UNAVAILABLE');
      const created = await options.store.add(
        { spaceId: options.spaceId, username: body.username, email: body.email },
        limits.maxPending,
        { states: await inviteStates(), admit: () => budget.take() },
      );
      return { requestId: created.id, pollSecret: created.pollSecret, status: 'pending' as const };
    },
  );
  server.get(
    '/v1/auth/signup-requests/:id',
    { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    async (request) => {
      const { id } = idParams.parse(request.params);
      const secret = secretOf(request.headers.authorization);
      return options.store.poll(id, secret, await inviteStates());
    },
  );
  server.delete(
    '/v1/auth/signup-requests/:id',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (request) => {
      const { id } = idParams.parse(request.params);
      const cancelled = await options.store.cancel(id, secretOf(request.headers.authorization));
      await revokeQuietly(cancelled.spaceId, cancelled.inviteId);
      return { cancelled: true };
    },
  );
  const spaceParams = z.object({ spaceId: socialId });
  const decisionParams = z.object({ spaceId: socialId, id: z.string().regex(SIGNUP_REQUEST_ID) });
  server.get(
    '/v1/spaces/:spaceId/signup-requests',
    { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    async (request) => {
      const { spaceId } = spaceParams.parse(request.params);
      await options.requireSpaceAdmin(request.headers.authorization, spaceId);
      if (!enabled() || options.spaceId !== spaceId) return { enabled: false, requests: [] };
      return { enabled: true, requests: await options.store.list(spaceId, await inviteStates()) };
    },
  );
  server.post(
    '/v1/spaces/:spaceId/signup-requests/:id/approve',
    { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    async (request) => {
      const { spaceId, id } = decisionParams.parse(request.params);
      const admin = await options.requireSpaceAdmin(request.headers.authorization, spaceId);
      if (!enabled() || options.spaceId !== spaceId)
        throw new StoatError(404, 'SIGNUP_NOT_ENABLED');
      await options.store.find(spaceId, id, await inviteStates());
      // Same shape as an app invitation link, limited to one use; it appears under Davetler.
      const space = (await admin.client.getServer(spaceId)) as { channels?: unknown };
      const channelId = Array.isArray(space.channels)
        ? space.channels.find((value): value is string => typeof value === 'string')
        : undefined;
      if (!channelId) throw new StoatError(409, 'SIGNUP_CHANNEL_REQUIRED');
      const upstream = await admin.client.createUpstreamInvite(channelId);
      let issued;
      try {
        issued = await options.registration.issue({
          communityInviteCode: upstream.code,
          spaceId,
          createdBy: admin.userId,
          source: 'admin',
          upstreamOwned: true,
          maxUses: 1,
          seconds: SIGNUP_INVITE_SECONDS,
        });
      } catch (error) {
        await admin.client.deleteUpstreamInvite(upstream.code).catch(() => {});
        throw error;
      }
      let approved;
      try {
        approved = await options.store.approve(
          spaceId,
          id,
          admin.userId,
          issued,
          await inviteStates(),
        );
      } catch (error) {
        await revokeQuietly(spaceId, issued.id, admin.client);
        throw error;
      }
      // Approving again replaces a link that has not been used yet.
      if (approved.replaced && approved.replaced !== issued.id)
        await revokeQuietly(spaceId, approved.replaced, admin.client);
      return { state: 'approved' as const };
    },
  );
  server.post(
    '/v1/spaces/:spaceId/signup-requests/:id/reject',
    { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    async (request) => {
      const { spaceId, id } = decisionParams.parse(request.params);
      const admin = await options.requireSpaceAdmin(request.headers.authorization, spaceId);
      if (!enabled() || options.spaceId !== spaceId)
        throw new StoatError(404, 'SIGNUP_NOT_ENABLED');
      const rejected = await options.store.reject(spaceId, id, admin.userId, await inviteStates());
      await revokeQuietly(spaceId, rejected.inviteId, admin.client);
      return { state: 'rejected' as const };
    },
  );
}
