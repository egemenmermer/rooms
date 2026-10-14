import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { StoatClient, StoatError, validateInstanceUrl } from '@rooms/stoat';

export interface PasswordResetSelection {
  handle: string;
  expiresAt: number;
  serverOrigin: string;
}
export type PasswordResetOutcome = {
  state:
    | 'completed'
    | 'invalid-token'
    | 'selection-expired'
    | 'rejected'
    | 'uncertain'
    | 'scope-changed';
};
interface Selection extends PasswordResetSelection {
  token: string;
  serverUrl: string;
  senderId: number;
  epoch: number;
}
interface RecoveryClient {
  confirmPasswordRecovery(input: {
    token: string;
    password: string;
    removeSessions: true;
  }): Promise<{ completed: true }>;
}
interface Dependencies {
  readClipboard(): string | Promise<string>;
  sessionEpoch(): number;
  createClient?(serverUrl: string): RecoveryClient;
  now?(): number;
}
const server = z.string().min(1).max(2048);
const importInput = z.object({ serverUrl: server }).strict();
const confirmInput = z
  .object({
    serverUrl: server,
    handle: z.string().uuid(),
    password: z
      .string()
      .min(8)
      .max(256)
      .refine((value) => !/[\x00-\x1f\x7f]/.test(value)),
  })
  .strict();
const cancelInput = z.object({ handle: z.string().uuid() }).strict();
const selectionLifetimeMs = 3 * 60_000;

/** Main-only clipboard ingress. The selected server, never a pasted URL, determines the PATCH destination. */
export class PasswordRecoveryBroker {
  private readonly selections = new Map<string, Selection>();
  private readonly expiryTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private pending = false;
  private importEpoch = 0;
  private readonly now: () => number;
  constructor(private readonly dependencies: Dependencies) {
    this.now = dependencies.now ?? Date.now;
  }

  private remove(handle: string): void {
    this.selections.delete(handle);
    const timer = this.expiryTimers.get(handle);
    if (timer) clearTimeout(timer);
    this.expiryTimers.delete(handle);
  }

  private canonicalServer(value: string): string {
    const canonical = validateInstanceUrl(value);
    if (new URL(canonical).protocol !== 'https:')
      throw new Error('A HTTPS social server is required for password reset.');
    return canonical;
  }
  private purge(): void {
    for (const [handle, selection] of this.selections) {
      if (selection.expiresAt <= this.now() || selection.epoch !== this.dependencies.sessionEpoch())
        this.remove(handle);
    }
  }
  async importLink(input: unknown, senderId: number): Promise<PasswordResetSelection> {
    const body = importInput.parse(input),
      serverUrl = this.canonicalServer(body.serverUrl);
    if (!Number.isSafeInteger(senderId) || senderId < 0) throw new Error('Invalid sender.');
    if (this.pending) throw new Error('A password reset is already pending.');
    this.purge();
    const importEpoch = ++this.importEpoch,
      epoch = this.dependencies.sessionEpoch();
    let text: string;
    try {
      text = await this.dependencies.readClipboard();
    } catch {
      throw new Error('The recovery link could not be read from the clipboard.');
    }
    if (
      importEpoch !== this.importEpoch ||
      epoch !== this.dependencies.sessionEpoch() ||
      this.pending
    )
      throw new Error('The recovery scope changed. Import the link again.');
    // Upstream generates a 32-character nanoid and appends it to /login/reset/.
    // Reject queries, fragments, credentials, encoded tokens and normalized path traversal.
    if (
      typeof text !== 'string' ||
      text.length > 4096 ||
      text !== text.trim() ||
      /[\x00-\x20\x7f]/.test(text)
    )
      throw new Error('Copy the complete recovery link from the selected server.');
    let link: URL;
    try {
      link = new URL(text);
    } catch {
      throw new Error('Copy the complete recovery link from the selected server.');
    }
    const origin = new URL(serverUrl).origin;
    const prefix = `${origin}/login/reset/`;
    const token = text.startsWith(prefix) ? text.slice(prefix.length) : '';
    if (
      link.origin !== origin ||
      link.protocol !== 'https:' ||
      link.username ||
      link.password ||
      link.search ||
      link.hash ||
      !/^[A-Za-z0-9_-]{32}$/.test(token) ||
      link.pathname !== `/login/reset/${token}`
    ) {
      throw new Error(
        'Recovery links must use the selected HTTPS server origin and /login/reset/ path. Use the configured Stoat web flow if its application host differs.',
      );
    }
    // A new import replaces this sender's previous selection without exposing its secret.
    for (const [handle, selection] of this.selections)
      if (selection.senderId === senderId) this.remove(handle);
    if (this.selections.size >= 16)
      throw new Error('Too many recovery selections. Close a previous recovery view.');
    const selection: Selection = {
      handle: randomUUID(),
      expiresAt: this.now() + selectionLifetimeMs,
      serverOrigin: origin,
      serverUrl,
      senderId,
      epoch: this.dependencies.sessionEpoch(),
      token,
    };
    this.selections.set(selection.handle, selection);
    const timer = setTimeout(() => this.remove(selection.handle), selectionLifetimeMs);
    timer.unref();
    this.expiryTimers.set(selection.handle, timer);
    return {
      handle: selection.handle,
      expiresAt: selection.expiresAt,
      serverOrigin: selection.serverOrigin,
    };
  }
  cancel(input: unknown, senderId: number): void {
    const body = cancelInput.parse(input),
      selection = this.selections.get(body.handle);
    if (selection?.senderId === senderId) this.remove(body.handle);
    this.purge();
  }
  clear(): void {
    ++this.importEpoch;
    for (const handle of this.selections.keys()) this.remove(handle);
  }
  async confirm(input: unknown, senderId: number): Promise<PasswordResetOutcome> {
    const body = confirmInput.parse(input),
      serverUrl = this.canonicalServer(body.serverUrl);
    const selection = this.selections.get(body.handle);
    if (!selection || selection.expiresAt <= this.now()) {
      this.purge();
      return { state: 'selection-expired' };
    }
    if (
      selection.senderId !== senderId ||
      selection.serverUrl !== serverUrl ||
      selection.epoch !== this.dependencies.sessionEpoch()
    )
      return { state: 'scope-changed' };
    if (this.pending) throw new Error('A password reset is already pending.');
    // Consume before sending: uncertain mutations are never retried with a retained capability.
    this.remove(body.handle);
    this.pending = true;
    let state: PasswordResetOutcome['state'];
    try {
      const recovery = this.dependencies.createClient?.(serverUrl) ?? new StoatClient(serverUrl);
      const result = await recovery.confirmPasswordRecovery({
        token: selection.token,
        password: body.password,
        removeSessions: true,
      });
      state = result.completed === true ? 'completed' : 'uncertain';
    } catch (error) {
      state =
        error instanceof StoatError && error.code === 'PASSWORD_RECOVERY_INVALID_TOKEN'
          ? 'invalid-token'
          : error instanceof StoatError && error.status === 400
            ? 'rejected'
            : 'uncertain';
    } finally {
      this.pending = false;
    }
    if (selection.epoch !== this.dependencies.sessionEpoch()) return { state: 'scope-changed' };
    return { state };
  }
}
