import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { SocialMessage } from '@rooms/social';

/** ROOMS quote-replies carry the first 400 characters of the quoted message. */
export const QUOTE_PREFIX_LENGTH = 400;
export const STOAT_MESSAGE_LIMIT = 1900;

export interface BotIdentity {
  id: string;
  /** Names users can type as plain text (`@claude`) and names ROOMS quote-replies use. */
  names: string[];
}

export type Trigger =
  | { kind: 'mention'; prompt: string }
  | { kind: 'continue'; prompt: string; conversationId: string };

export interface ConversationRecord {
  id: string;
  channelId: string;
  sessionId: string | null;
  startedBy: string;
  createdAt: string;
  updatedAt: string;
}
interface BotMessageRecord {
  messageId: string;
  channelId: string;
  conversationId: string;
  prefix: string;
}
interface StoreData {
  version: 1;
  conversations: Record<string, ConversationRecord>;
  botMessages: BotMessageRecord[];
  spend: { month: string; usd: number };
  /** Newest message ID seen on the gateway (ULIDs sort by time); catch-up resumes after it. */
  cursor?: string | null;
  /** Source messages already answered, so catch-up and live delivery never reply twice. */
  handled?: string[];
}

const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const normalize = (value: string) => value.replace(/\s+/g, ' ').trim();

export function textMentionPattern(bot: BotIdentity) {
  const names = bot.names.filter(Boolean).map(escape);
  return new RegExp(`(^|[\\s(])@(?:${names.join('|')})(?![\\w-])`, 'i');
}

export function mentionsBot(message: SocialMessage, bot: BotIdentity) {
  return (
    !!message.mentions?.includes(bot.id) ||
    message.content.includes(`<@${bot.id}>`) ||
    (bot.names.length > 0 && textMentionPattern(bot).test(message.content))
  );
}

/** Remove the bot's own mention tokens so Claude sees only the request. */
export function cleanPrompt(content: string, bot: BotIdentity) {
  let text = content.split(`<@${bot.id}>`).join('');
  if (bot.names.length) {
    const names = bot.names.filter(Boolean).map(escape).join('|');
    text = text.replace(new RegExp(`(^|[\\s(])@(?:${names})(?![\\w-])[,:]? ?`, 'gi'), '$1');
  }
  return text.replace(/[ \t]+\n/g, '\n').trim();
}

/**
 * Parse the ROOMS desktop quote-reply format:
 * `> Name: first line\n> more lines\n\nreply text`.
 */
export function parseQuoteReply(content: string) {
  const lines = content.split('\n');
  if (!lines[0]?.startsWith('> ')) return null;
  const quoted: string[] = [];
  let index = 0;
  while (index < lines.length && lines[index]!.startsWith('>')) {
    quoted.push(lines[index]!.replace(/^> ?/, ''));
    index++;
  }
  const head = quoted[0] ?? '';
  const colon = head.indexOf(': ');
  if (colon < 1) return null;
  return {
    author: head.slice(0, colon).trim(),
    quoted: [head.slice(colon + 2), ...quoted.slice(1)].join('\n'),
    reply: lines.slice(index).join('\n').trim(),
  };
}

/** ROOMS chat renders plain text, so drop Markdown syntax that would otherwise show literally. */
export function toPlainText(text: string) {
  return text
    .split('\n')
    .filter((line) => !/^\s*(`{3,}|~{3,})[\w-]*\s*$/.test(line))
    .map((line) =>
      line
        .replace(/^(\s*)#{1,6}\s+/, '$1')
        .replace(/^(\s*)[*+]\s+/, '$1- ')
        .replace(/\*\*(.+?)\*\*/g, '$1')
        .replace(/__(.+?)__/g, '$1')
        .replace(/(^|[\s(])\*([^*\s][^*]*?)\*(?=[\s).,:;!?]|$)/g, '$1$2')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/!?\[([^\]]+)\]\((https?:[^)\s]+)\)/g, (_m, label: string, url: string) =>
          label === url ? url : `${label} (${url})`,
        ),
    )
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Split long answers on line boundaries, keeping fenced code blocks balanced per chunk. */
export function splitReply(text: string, limit = STOAT_MESSAGE_LIMIT) {
  const chunks: string[] = [];
  let current = '';
  let fence: string | null = null;
  const flush = () => {
    if (!current.trim()) return;
    chunks.push(fence ? `${current}\n\`\`\`` : current);
    current = fence ? `${fence}\n` : '';
  };
  for (const raw of text.split('\n')) {
    let line = raw;
    while (line.length > limit - 16) {
      if (current) flush();
      const cut =
        line.lastIndexOf(' ', limit - 16) > limit / 2
          ? line.lastIndexOf(' ', limit - 16)
          : limit - 16;
      current += line.slice(0, cut);
      flush();
      line = line.slice(cut).trimStart();
    }
    if ((current + line).length + 1 > limit - 8) flush();
    current += current && !current.endsWith('\n') ? `\n${line}` : line;
    const marker = line.trim().match(/^(`{3,}|~{3,})/);
    if (marker) fence = fence ? null : line.trim();
  }
  if (current.trim()) chunks.push(current);
  return chunks.length ? chunks : [''];
}

export class ConversationStore {
  private data: StoreData;
  constructor(
    private readonly path: string,
    private readonly now = () => new Date(),
  ) {
    this.data = existsSync(path)
      ? (JSON.parse(readFileSync(path, 'utf8')) as StoreData)
      : { version: 1, conversations: {}, botMessages: [], spend: { month: '', usd: 0 } };
  }
  private save() {
    mkdirSync(dirname(this.path), { recursive: true, mode: 0o700 });
    const temporary = `${this.path}.${process.pid}.tmp`;
    writeFileSync(temporary, JSON.stringify(this.data), { mode: 0o600 });
    chmodSync(temporary, 0o600);
    renameSync(temporary, this.path);
  }
  get(id: string) {
    return this.data.conversations[id];
  }
  create(channelId: string, startedBy: string) {
    const at = this.now().toISOString();
    const record: ConversationRecord = {
      id: randomUUID(),
      channelId,
      sessionId: null,
      startedBy,
      createdAt: at,
      updatedAt: at,
    };
    this.data.conversations[record.id] = record;
    this.save();
    return record;
  }
  setSession(id: string, sessionId: string) {
    const record = this.data.conversations[id];
    if (!record) return;
    record.sessionId = sessionId;
    record.updatedAt = this.now().toISOString();
    this.save();
  }
  recordBotMessage(conversationId: string, channelId: string, messageId: string, content: string) {
    this.data.botMessages.push({
      messageId,
      channelId,
      conversationId,
      prefix: normalize(content.slice(0, QUOTE_PREFIX_LENGTH)),
    });
    if (this.data.botMessages.length > 5000) this.data.botMessages.splice(0, 1000);
    this.save();
  }
  get cursor() {
    return this.data.cursor ?? null;
  }
  /** Advance the catch-up cursor; IDs are ULIDs, so string order is time order. */
  markSeen(messageId: string) {
    if (this.data.cursor && this.data.cursor >= messageId) return;
    this.data.cursor = messageId;
    this.save();
  }
  isHandled(messageId: string) {
    return (this.data.handled ?? []).includes(messageId);
  }
  markHandled(messageId: string) {
    const handled = (this.data.handled ??= []);
    if (handled.includes(messageId)) return;
    handled.push(messageId);
    if (handled.length > 2000) handled.splice(0, 500);
    this.save();
  }
  /** Keep quote matching working after a status message is edited. */
  updateBotMessage(messageId: string, content: string) {
    const record = this.data.botMessages.find((m) => m.messageId === messageId);
    if (!record) return;
    record.prefix = normalize(content.slice(0, QUOTE_PREFIX_LENGTH));
    this.save();
  }
  byBotMessage(messageId: string) {
    return this.data.botMessages.find((m) => m.messageId === messageId)?.conversationId;
  }
  /** Newest bot message in the channel whose start matches the quoted text. */
  byQuote(channelId: string, quoted: string) {
    const target = normalize(quoted);
    if (!target) return undefined;
    for (let i = this.data.botMessages.length - 1; i >= 0; i--) {
      const m = this.data.botMessages[i]!;
      if (m.channelId !== channelId) continue;
      if (m.prefix === target || m.prefix.startsWith(target) || target.startsWith(m.prefix))
        return m.conversationId;
    }
    return undefined;
  }
  private month() {
    return this.now().toISOString().slice(0, 7);
  }
  monthlySpend() {
    return this.data.spend.month === this.month() ? this.data.spend.usd : 0;
  }
  addSpend(usd: number) {
    if (!Number.isFinite(usd) || usd <= 0) return;
    const month = this.month();
    this.data.spend =
      this.data.spend.month === month ? { month, usd: this.data.spend.usd + usd } : { month, usd };
    this.save();
  }
}

/** Decide whether a message is addressed to @claude, and whether it continues a conversation. */
export function detectTrigger(
  message: SocialMessage,
  bot: BotIdentity,
  store: Pick<ConversationStore, 'byBotMessage' | 'byQuote'>,
): Trigger | null {
  if (message.author.bot || message.author.id === bot.id || typeof message.content !== 'string')
    return null;
  for (const replyId of message.replies ?? []) {
    const conversationId = store.byBotMessage(replyId);
    if (conversationId) {
      const prompt = cleanPrompt(message.content, bot);
      return prompt ? { kind: 'continue', prompt, conversationId } : null;
    }
  }
  const quote = parseQuoteReply(message.content);
  if (quote && bot.names.some((name) => name.toLowerCase() === quote.author.toLowerCase())) {
    const conversationId = store.byQuote(message.channelId, quote.quoted);
    const prompt = cleanPrompt(quote.reply, bot);
    if (conversationId && prompt) return { kind: 'continue', prompt, conversationId };
  }
  if (!mentionsBot(message, bot)) return null;
  const prompt = cleanPrompt(message.content, bot);
  return prompt ? { kind: 'mention', prompt } : null;
}
