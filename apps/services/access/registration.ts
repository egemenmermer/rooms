import { copyFile, mkdir, open, readFile, rename, stat, unlink } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { StoatError } from '@rooms/stoat';
import { INVITE_LINK_DAYS, INVITE_LINK_MAX_USES, SOCIAL_ID_PATTERN } from '@rooms/social';

const datetime = z.string().datetime();
const legacyInvitation = z
  .object({
    accountInviteCode: z.string().min(2).max(128),
    communityInviteCode: z.string().min(2).max(128),
    expiresAt: datetime,
    createdAt: datetime,
    state: z.enum(['available', 'claiming', 'used', 'failed']),
    claim: z.string().optional(),
  })
  .strict();
const legacySchema = z
  .object({
    version: z.literal(1),
    invites: z.record(z.string().regex(/^[a-f0-9]{64}$/), legacyInvitation),
  })
  .strict();
const claim = z
  .object({ state: z.enum(['claiming', 'used', 'released', 'uncertain']), at: datetime })
  .strict();
const invitation = z
  .object({
    communityInviteCode: z.string().min(2).max(128),
    /** Only entries migrated from the single-use ledger carry a pre-seeded account invitation. */
    accountInviteCode: z.string().min(2).max(128).optional(),
    spaceId: z.string().regex(SOCIAL_ID_PATTERN).optional(),
    createdBy: z.string().regex(SOCIAL_ID_PATTERN).optional(),
    source: z.enum(['app', 'admin', 'script', 'legacy']),
    /** The broker created the upstream invitation for this link and may delete it on revoke. */
    upstreamOwned: z.boolean().optional(),
    createdAt: datetime,
    expiresAt: datetime,
    maxUses: z.number().int().min(1).max(50),
    claims: z.record(z.string().uuid(), claim),
    revokedAt: datetime.optional(),
  })
  .strict();
const schema = z
  .object({
    version: z.literal(2),
    invites: z.record(z.string().regex(/^[a-f0-9]{64}$/), invitation),
  })
  .strict();
export type RegistrationLedger = z.infer<typeof schema>;
type Invitation = z.infer<typeof invitation>;
export type InviteSource = Invitation['source'];

export const inviteDigest = (code: string) => createHash('sha256').update(code).digest('hex');
/** Management id: a prefix of the digest, so a listed link can never be turned back into a token. */
export const inviteId = (digest: string) => digest.slice(0, 16);
const MAX_SECONDS = INVITE_LINK_DAYS * 86400;
const PRUNE_AFTER_MS = 30 * 86400 * 1000;
/** Signups finish in well under a minute; a reservation older than this lost its final write. */
const STALE_CLAIM_MS = 10 * 60 * 1000;
const COUNTED = new Set(['claiming', 'used', 'uncertain']);
const queues = new Map<string, Promise<unknown>>();

export interface InviteGrant {
  claimId: string;
  communityInviteCode: string;
  accountInviteCode?: string;
  spaceId?: string;
}
export interface IssueInviteInput {
  communityInviteCode: string;
  spaceId?: string;
  createdBy?: string;
  source: Exclude<InviteSource, 'legacy'>;
  upstreamOwned?: boolean;
  /** Pre-seeded account invitation; forces a single use because Stoat account invites are one-time. */
  accountInviteCode?: string;
  maxUses?: number;
  seconds?: number;
  maxActivePerSpace?: number;
}
export interface InviteSummary {
  id: string;
  createdAt: string;
  expiresAt: string;
  maxUses: number;
  uses: number;
  pending: number;
  source: InviteSource;
  createdBy: string | null;
  state: 'active' | 'full';
}
/** Thrown by consume work when nothing happened upstream, so the reserved use can be returned. */
export class InviteClaimReleased extends Error {
  constructor(readonly reason: unknown) {
    super('Invitation use released');
  }
}

function usage(item: Invitation, now: number) {
  let uses = 0,
    pending = 0;
  for (const entry of Object.values(item.claims)) {
    // An abandoned reservation still counts, but no longer shows as in progress.
    if (entry.state === 'claiming' && now - Date.parse(entry.at) < STALE_CLAIM_MS) pending++;
    else if (COUNTED.has(entry.state)) uses++;
  }
  return { uses, pending };
}
function migrate(legacy: z.infer<typeof legacySchema>): RegistrationLedger {
  const invites: RegistrationLedger['invites'] = {};
  for (const [digest, item] of Object.entries(legacy.invites)) {
    const claims: Invitation['claims'] = {};
    if (item.state === 'used') claims[randomUUID()] = { state: 'used', at: item.createdAt };
    else if (item.state !== 'available')
      claims[randomUUID()] = { state: 'uncertain', at: item.createdAt };
    invites[digest] = {
      communityInviteCode: item.communityInviteCode,
      accountInviteCode: item.accountInviteCode,
      source: 'legacy',
      createdAt: item.createdAt,
      expiresAt: item.expiresAt,
      maxUses: 1,
      claims,
    };
  }
  return { version: 2, invites };
}

/**
 * Owned durable gate for multi-use signup links; upstream account creation remains unmodified.
 * Every use is reserved on disk before any external action and network calls never run under the lock.
 */
export class RegistrationGate {
  private readonly lockWaitMs: number;
  private readonly staleLockMs: number;
  private readonly now: () => number;
  constructor(
    readonly path: string,
    options: { lockWaitMs?: number; staleLockMs?: number; now?: () => number } = {},
  ) {
    this.lockWaitMs = options.lockWaitMs ?? 3000;
    this.staleLockMs = options.staleLockMs ?? 30000;
    this.now = options.now ?? Date.now;
  }
  private async load(missing: 'empty' | 'unavailable') {
    let raw: unknown;
    try {
      raw = JSON.parse(await readFile(this.path, 'utf8'));
    } catch (error) {
      if (missing === 'empty' && (error as NodeJS.ErrnoException).code === 'ENOENT')
        return { ledger: { version: 2, invites: {} } as RegistrationLedger, migrated: false };
      throw missing === 'empty'
        ? new StoatError(503, 'REGISTRATION_LEDGER_INVALID')
        : new StoatError(403, 'INVITE_UNAVAILABLE');
    }
    const current = schema.safeParse(raw);
    if (current.success) return { ledger: current.data, migrated: false };
    const legacy = legacySchema.safeParse(raw);
    if (legacy.success) return { ledger: migrate(legacy.data), migrated: true };
    throw missing === 'empty'
      ? new StoatError(503, 'REGISTRATION_LEDGER_INVALID')
      : new StoatError(403, 'INVITE_UNAVAILABLE');
  }
  private async persist(ledger: RegistrationLedger, migrated: boolean) {
    if (migrated)
      // Keep the single-use ledger once so an older broker can be restored.
      await copyFile(this.path, `${this.path}.v1.bak`, 1).catch((error) => {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      });
    const cutoff = this.now() - PRUNE_AFTER_MS;
    for (const [digest, item] of Object.entries(ledger.invites))
      if (Date.parse(item.expiresAt) < cutoff) delete ledger.invites[digest];
    const temp = `${this.path}.${randomUUID()}.tmp`;
    const file = await open(temp, 'wx', 0o600);
    try {
      await file.writeFile(JSON.stringify(ledger) + '\n');
      await file.sync();
    } finally {
      await file.close();
    }
    await rename(temp, this.path);
    const directory = await open(dirname(this.path), 'r');
    try {
      await directory.sync();
    } finally {
      await directory.close();
    }
  }
  private async acquireFileLock() {
    const lockPath = `${this.path}.lock`;
    const deadline = Date.now() + this.lockWaitMs;
    for (;;) {
      try {
        return await open(lockPath, 'wx', 0o600);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        const info = await stat(lockPath).catch(() => null);
        // A crashed process leaves its lock behind; never let that block every later signup.
        if (info && Date.now() - info.mtimeMs > this.staleLockMs) {
          await unlink(lockPath).catch(() => {});
          continue;
        }
        if (Date.now() >= deadline) throw new StoatError(409, 'REGISTRATION_BUSY');
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    }
  }
  /** Serializes ledger writes within this process and across processes sharing the file. */
  private async withLock<T>(work: () => Promise<T>): Promise<T> {
    const previous = queues.get(this.path) ?? Promise.resolve();
    let release!: () => void;
    const turn = new Promise<void>((resolve) => (release = resolve));
    const chained = previous.then(
      () => turn,
      () => turn,
    );
    queues.set(this.path, chained);
    await previous.catch(() => {});
    try {
      await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
      const lock = await this.acquireFileLock();
      try {
        return await work();
      } finally {
        await lock.close();
        await unlink(`${this.path}.lock`).catch(() => {});
      }
    } finally {
      release();
      if (queues.get(this.path) === chained) queues.delete(this.path);
    }
  }
  private available(item: Invitation | undefined): Invitation {
    if (!item) throw new StoatError(404, 'INVITE_NOT_FOUND');
    if (Date.parse(item.expiresAt) <= this.now()) throw new StoatError(404, 'INVITE_EXPIRED');
    if (item.revokedAt) throw new StoatError(404, 'INVITE_REVOKED');
    const { uses, pending } = usage(item, this.now());
    if (uses + pending >= item.maxUses) throw new StoatError(409, 'INVITE_ALREADY_CLAIMED');
    return item;
  }
  /**
   * Read-only lookup that ignores expiry, revocation and the use limit. Only for deciding that an
   * existing member needs nothing; it never authorizes a use.
   */
  async peek(code: string) {
    const { ledger } = await this.load('unavailable');
    const item = ledger.invites[inviteDigest(code)];
    return item ? { spaceId: item.spaceId, expiresAt: item.expiresAt } : null;
  }
  /** Read-only: link previews and landing pages never reserve a use. */
  async inspect(code: string) {
    const { ledger } = await this.load('unavailable');
    const item = this.available(ledger.invites[inviteDigest(code)]);
    return {
      communityInviteCode: item.communityInviteCode,
      spaceId: item.spaceId,
      expiresAt: item.expiresAt,
    };
  }
  async consume<T>(code: string, work: (grant: InviteGrant) => Promise<T>): Promise<T> {
    const digest = inviteDigest(code),
      claimId = randomUUID();
    const grant = await this.withLock(async () => {
      const { ledger, migrated } = await this.load('unavailable');
      const item = this.available(ledger.invites[digest]);
      const claims = Object.entries(item.claims);
      // Released attempts free their use; bound how many of them the file keeps.
      if (claims.length >= item.maxUses * 3)
        for (const [id, entry] of claims) if (entry.state === 'released') delete item.claims[id];
      item.claims[claimId] = { state: 'claiming', at: new Date(this.now()).toISOString() };
      await this.persist(ledger, migrated);
      return {
        claimId,
        communityInviteCode: item.communityInviteCode,
        accountInviteCode: item.accountInviteCode,
        spaceId: item.spaceId,
      };
    });
    try {
      const value = await work(grant);
      // A failed final write leaves the claim pending, which still counts; success stands.
      await this.settleSoon(digest, claimId, 'used');
      return value;
    } catch (error) {
      const released = error instanceof InviteClaimReleased;
      await this.settleSoon(digest, claimId, released ? 'released' : 'uncertain');
      throw released ? error.reason : error;
    }
  }
  /** A busy lock must not cost a released use; retry briefly, then leave the claim counted. */
  private async settleSoon(
    digest: string,
    claimId: string,
    state: 'used' | 'released' | 'uncertain',
  ) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.settle(digest, claimId, state);
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
      }
    }
  }
  private async settle(digest: string, claimId: string, state: 'used' | 'released' | 'uncertain') {
    await this.withLock(async () => {
      const { ledger, migrated } = await this.load('unavailable');
      const entry = ledger.invites[digest]?.claims[claimId];
      if (!entry) return;
      entry.state = state;
      entry.at = new Date(this.now()).toISOString();
      await this.persist(ledger, migrated);
    });
  }
  async issue(input: IssueInviteInput) {
    const seconds = input.seconds ?? MAX_SECONDS;
    if (!Number.isInteger(seconds) || seconds < 60 || seconds > MAX_SECONDS)
      throw new StoatError(400, 'INVALID_INVITE_EXPIRY');
    const maxUses = input.accountInviteCode ? 1 : (input.maxUses ?? INVITE_LINK_MAX_USES);
    if (!Number.isInteger(maxUses) || maxUses < 1 || maxUses > 50)
      throw new StoatError(400, 'INVALID_INVITE_USES');
    // Validate before writing so a bad entry can never make the whole ledger unreadable.
    if (
      !invitation.shape.communityInviteCode.safeParse(input.communityInviteCode).success ||
      !invitation.shape.accountInviteCode.safeParse(input.accountInviteCode).success ||
      !invitation.shape.spaceId.safeParse(input.spaceId).success ||
      !invitation.shape.createdBy.safeParse(input.createdBy).success
    )
      throw new StoatError(400, 'INVALID_INVITE');
    return this.withLock(async () => {
      const { ledger, migrated } = await this.load('empty');
      const now = this.now();
      if (input.spaceId) {
        const active = Object.values(ledger.invites).filter((item) => {
          if (item.spaceId !== input.spaceId || item.revokedAt) return false;
          if (Date.parse(item.expiresAt) <= now) return false;
          const { uses, pending } = usage(item, now);
          return uses + pending < item.maxUses;
        }).length;
        if (active >= (input.maxActivePerSpace ?? 20))
          throw new StoatError(409, 'INVITE_LIMIT_REACHED');
      }
      const code = randomBytes(32).toString('hex');
      const digest = inviteDigest(code);
      const expiresAt = new Date(now + seconds * 1000).toISOString();
      ledger.invites[digest] = {
        communityInviteCode: input.communityInviteCode,
        ...(input.accountInviteCode ? { accountInviteCode: input.accountInviteCode } : {}),
        ...(input.spaceId ? { spaceId: input.spaceId } : {}),
        ...(input.createdBy ? { createdBy: input.createdBy } : {}),
        source: input.source,
        ...(input.upstreamOwned ? { upstreamOwned: true } : {}),
        createdAt: new Date(now).toISOString(),
        expiresAt,
        maxUses,
        claims: {},
      };
      await this.persist(ledger, migrated);
      return { code, id: inviteId(digest), expiresAt, maxUses };
    });
  }
  async list(spaceId: string): Promise<InviteSummary[]> {
    const { ledger } = await this.load('empty');
    const now = this.now();
    return Object.entries(ledger.invites)
      .filter(
        ([, item]) =>
          item.spaceId === spaceId && !item.revokedAt && Date.parse(item.expiresAt) > now,
      )
      .map(([digest, item]) => {
        const { uses, pending } = usage(item, now);
        return {
          id: inviteId(digest),
          createdAt: item.createdAt,
          expiresAt: item.expiresAt,
          maxUses: item.maxUses,
          uses,
          pending,
          source: item.source,
          createdBy: item.createdBy ?? null,
          state: uses + pending >= item.maxUses ? ('full' as const) : ('active' as const),
        };
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  /**
   * Stops new uses. While a signup reserved before the revoke is still running, the upstream
   * invitation is kept so that signup can finish joining; its code never leaves the broker.
   */
  async revoke(spaceId: string, id: string) {
    return this.withLock(async () => {
      const { ledger, migrated } = await this.load('empty');
      const entry = Object.entries(ledger.invites).find(
        ([digest, item]) => inviteId(digest) === id && item.spaceId === spaceId && !item.revokedAt,
      );
      if (!entry) throw new StoatError(404, 'INVITE_NOT_FOUND');
      const [digest, item] = entry;
      item.revokedAt = new Date(this.now()).toISOString();
      const now = this.now();
      const inFlight = usage(item, now).pending > 0;
      const shared = Object.entries(ledger.invites).some(
        ([other, candidate]) =>
          other !== digest &&
          candidate.communityInviteCode === item.communityInviteCode &&
          !candidate.revokedAt &&
          Date.parse(candidate.expiresAt) > now,
      );
      await this.persist(ledger, migrated);
      return {
        communityInviteCode: item.communityInviteCode,
        releaseUpstream: !!item.upstreamOwned && !shared && !inFlight,
      };
    });
  }
}

export const issueRegistrationInvite = (path: string, input: IssueInviteInput) =>
  new RegistrationGate(path).issue(input);
