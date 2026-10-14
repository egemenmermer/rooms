import { createHash } from 'node:crypto';
import { existsSync, readFileSync, renameSync, unlinkSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import type { SocialMessage } from '@rooms/social';
const id = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const record = z
  .object({
    id,
    channelId: id,
    author: z.object({
      id,
      username: z.string().max(128),
      displayName: z.string().max(128),
      avatar: z.null(),
    }),
    content: z.string().max(4000),
    timestamp: z.string().max(40),
    editedTimestamp: z.string().max(40).nullable(),
  })
  .strict();
const data = z
  .array(z.object({ channelId: id, messages: z.array(record).max(200) }).strict())
  .max(20);
interface Encryption {
  isEncryptionAvailable(): boolean;
  encryptString(value: string): Buffer;
  decryptString(value: Buffer): string;
}
/** Durable message text only: no attachments, signed URLs, account/provider credentials. */
export class ConversationVault {
  private epoch = 0;
  private invalidations = new Map<string, number>();
  ticket(channelId: string) {
    return `${this.epoch}:${this.invalidations.get(channelId) ?? 0}`;
  }
  private entries = new Map<string, SocialMessage[]>();
  private file: string | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  constructor(
    private directory: string,
    private encryption: Encryption,
  ) {}
  select(server: string, userId: string) {
    this.flush();
    this.epoch++;
    this.invalidations.clear();
    this.entries.clear();
    this.file = join(
      this.directory,
      `conversation-cache-${createHash('sha256').update(`${server}\0${userId}`).digest('hex')}.bin`,
    );
    if (!this.encryption.isEncryptionAvailable() || !existsSync(this.file)) return;
    try {
      if (statSync(this.file).size > 25 * 1024 * 1024) throw new Error('Cache exceeds limit');
      const parsed = data.parse(JSON.parse(this.encryption.decryptString(readFileSync(this.file))));
      for (const entry of parsed) this.entries.set(entry.channelId, entry.messages);
    } catch {
      this.clear();
    }
  }
  get(channelId: string) {
    const found = this.entries.get(channelId);
    if (found) {
      this.entries.delete(channelId);
      this.entries.set(channelId, found);
    }
    return found ?? [];
  }
  put(channelId: string, messages: SocialMessage[]) {
    const text = messages
      .slice(-200)
      .map((m) => ({
        id: m.id,
        channelId: m.channelId,
        author: {
          id: m.author.id,
          username: m.author.username,
          displayName: m.author.displayName,
          avatar: null,
        },
        content: m.content,
        timestamp: m.timestamp,
        editedTimestamp: m.editedTimestamp,
      }));
    const parsed = z.array(record).max(200).safeParse(text);
    if (!parsed.success) return;
    this.entries.delete(channelId);
    this.entries.set(channelId, parsed.data);
    while (this.entries.size > 20) this.entries.delete(this.entries.keys().next().value!);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 500);
    this.timer.unref();
  }
  reconcile(channelId: string, fetched: SocialMessage[], before: SocialMessage[]) {
    const current = this.get(channelId),
      initial = new Map(before.map((m) => [m.id, m]));
    const oldest = Math.min(...fetched.map((m) => Date.parse(m.timestamp)));
    const result = new Map(
      current
        .filter((m) => fetched.length > 0 && Date.parse(m.timestamp) < oldest)
        .map((m) => [m.id, m]),
    );
    for (const message of fetched) result.set(message.id, message);
    const latest = new Map(current.map((m) => [m.id, m]));
    for (const message of before) if (!latest.has(message.id)) result.delete(message.id);
    for (const message of current)
      if (initial.get(message.id) !== message) result.set(message.id, message);
    this.put(
      channelId,
      [...result.values()].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp)),
    );
  }
  change(message: SocialMessage) {
    const current = this.entries.get(message.channelId);
    if (current)
      this.put(
        message.channelId,
        [...current.filter((m) => m.id !== message.id), message].sort(
          (a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp),
        ),
      );
  }
  deleteMessage(channelId: string, messageId: string) {
    const current = this.entries.get(channelId);
    if (current)
      this.put(
        channelId,
        current.filter((m) => m.id !== messageId),
      );
  }
  remove(channelId: string) {
    this.invalidations.set(channelId, (this.invalidations.get(channelId) ?? 0) + 1);
    this.entries.delete(channelId);
    this.flush();
  }
  clear() {
    this.epoch++;
    this.invalidations.clear();
    clearTimeout(this.timer);
    this.timer = undefined;
    this.entries.clear();
    if (this.file && existsSync(this.file)) unlinkSync(this.file);
    this.file = null;
  }
  flush() {
    clearTimeout(this.timer);
    this.timer = undefined;
    if (!this.file || !this.encryption.isEncryptionAvailable()) return;
    try {
      const json = JSON.stringify(
        [...this.entries].map(([channelId, messages]) => ({ channelId, messages })),
      );
      if (Buffer.byteLength(json) > 25 * 1024 * 1024) return;
      const temporary = `${this.file}.tmp`;
      writeFileSync(temporary, this.encryption.encryptString(json), { mode: 0o600 });
      renameSync(temporary, this.file);
    } catch {
      /* Cache failure never breaks social operations. */
    }
  }
}
