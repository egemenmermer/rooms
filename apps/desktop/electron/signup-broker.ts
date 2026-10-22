import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { z } from 'zod';
import type { SocialPendingSignup, SocialSignupPoll } from '@rooms/social';

/** The access-service calls approved sign-up needs; StoatClient implements them. */
export interface SignupClient {
  requestSignup(input: { email: string; username: string }): Promise<{
    requestId: string;
    pollSecret: string;
  }>;
  signupStatus(requestId: string, pollSecret: string): Promise<SocialSignupPoll>;
  cancelSignup(requestId: string, pollSecret: string): Promise<void>;
}
export interface SecretStorage {
  isEncryptionAvailable(): boolean;
  encryptString(value: string): Buffer;
  decryptString(value: Buffer): string;
}
/** What the existing invitation registration needs once the request was approved. */
export interface SignupRegistration {
  serverUrl: string;
  email: string;
  password: string;
  username: string;
  inviteCode: string;
}

const stored = z
  .object({
    version: z.literal(1),
    serverUrl: z.string().min(1).max(2048),
    requestId: z.string().regex(/^[a-f0-9]{32}$/),
    pollSecret: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    email: z.string().email().max(254),
    username: z.string().min(2).max(32),
    createdAt: z.string().max(64).nullable(),
    /** Delivered once by the service; kept until the account exists. */
    inviteCode: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .nullable(),
  })
  .strict();
type Stored = z.infer<typeof stored>;

/**
 * Main-process owner of the sign-up this device started. The poll secret and, after approval,
 * the single-use registration link are kept encrypted with the OS keychain (safeStorage); the
 * password lives only in memory and is never written to disk or sent before approval.
 */
export class PendingSignupBroker {
  private current: (Stored & { password: string | null }) | null = null;
  private status: SocialPendingSignup['status'] = 'unknown';
  private error: string | null = null;
  private loaded = false;
  constructor(
    private readonly deps: {
      path: string;
      storage: SecretStorage;
      client(serverUrl: string): SignupClient;
    },
  ) {}
  private load() {
    if (this.loaded) return;
    this.loaded = true;
    try {
      if (!existsSync(this.deps.path) || !this.deps.storage.isEncryptionAvailable()) return;
      const parsed = stored.safeParse(
        JSON.parse(this.deps.storage.decryptString(readFileSync(this.deps.path))),
      );
      if (parsed.success) {
        this.current = { ...parsed.data, password: null };
        this.status = parsed.data.inviteCode ? 'approved' : 'unknown';
      } else unlinkSync(this.deps.path);
    } catch {
      // An unreadable file is a lost request; the person can ask again.
    }
  }
  private persist() {
    const value = this.current;
    try {
      if (!value || !this.deps.storage.isEncryptionAvailable()) {
        if (existsSync(this.deps.path)) unlinkSync(this.deps.path);
        return;
      }
      // The password is deliberately left out.
      const record: Stored = {
        version: 1,
        serverUrl: value.serverUrl,
        requestId: value.requestId,
        pollSecret: value.pollSecret,
        email: value.email,
        username: value.username,
        createdAt: value.createdAt,
        inviteCode: value.inviteCode,
      };
      writeFileSync(this.deps.path, this.deps.storage.encryptString(JSON.stringify(record)), {
        mode: 0o600,
      });
    } catch {
      // Without a keychain the request is followed only while the app stays open.
    }
  }
  snapshot(): SocialPendingSignup | null {
    this.load();
    const value = this.current;
    if (!value) return null;
    return {
      serverUrl: value.serverUrl,
      email: value.email,
      username: value.username,
      createdAt: value.createdAt,
      status: this.status,
      ready: !!value.inviteCode,
      passwordKnown: !!value.password,
      error: this.error,
    };
  }
  async request(input: { serverUrl: string; email: string; password: string; username: string }) {
    this.load();
    const created = await this.deps
      .client(input.serverUrl)
      .requestSignup({ email: input.email, username: input.username });
    // A newer request replaces whatever this device followed before.
    this.current = {
      version: 1,
      serverUrl: input.serverUrl,
      requestId: created.requestId,
      pollSecret: created.pollSecret,
      email: input.email,
      username: input.username,
      createdAt: new Date().toISOString(),
      inviteCode: null,
      password: input.password,
    };
    this.status = 'pending';
    this.error = null;
    this.persist();
    return this.snapshot()!;
  }
  /**
   * Asks the service once. Returns the registration to run when the request was approved and
   * the password is still in memory; otherwise the person types it on the waiting screen.
   */
  async check(): Promise<{
    pending: SocialPendingSignup | null;
    registration: SignupRegistration | null;
  }> {
    this.load();
    const value = this.current;
    if (!value) return { pending: null, registration: null };
    if (!value.inviteCode) {
      try {
        const poll = await this.deps
          .client(value.serverUrl)
          .signupStatus(value.requestId, value.pollSecret);
        if (this.current !== value) return { pending: this.snapshot(), registration: null };
        this.status = poll.status;
        this.error = null;
        if (poll.createdAt) value.createdAt = poll.createdAt;
        if (poll.status === 'approved' && poll.inviteCode) {
          // Fetched exactly once; keep it until the account exists.
          value.inviteCode = poll.inviteCode;
          this.persist();
        }
      } catch (error) {
        const status = (error as { status?: number }).status;
        if (status === 404) this.status = 'unknown';
        this.error = error instanceof Error ? error.message : 'SIGNUP_UNAVAILABLE';
        return { pending: this.snapshot(), registration: null };
      }
    }
    return {
      pending: this.snapshot(),
      registration: value.inviteCode && value.password ? this.registration() : null,
    };
  }
  /** The approved link with the typed (or remembered) credentials. */
  registration(input?: { email?: string; password?: string }): SignupRegistration | null {
    this.load();
    const value = this.current;
    if (!value?.inviteCode) return null;
    if (input?.email) value.email = input.email;
    if (input?.password) value.password = input.password;
    if (!value.password) return null;
    return {
      serverUrl: value.serverUrl,
      email: value.email,
      password: value.password,
      username: value.username,
      inviteCode: value.inviteCode,
    };
  }
  /** The account exists: forget everything, including the password. */
  completed() {
    this.current = null;
    this.status = 'unknown';
    this.error = null;
    this.persist();
  }
  failed(message: string) {
    this.error = message;
    // A wrong password guess is not kept for the next attempt.
    if (this.current) this.current.password = null;
  }
  /** Withdraws the request on the server (best effort) and forgets it on this device. */
  async cancel() {
    this.load();
    const value = this.current;
    this.completed();
    if (value)
      await this.deps
        .client(value.serverUrl)
        .cancelSignup(value.requestId, value.pollSecret)
        .catch(() => {});
  }
}
