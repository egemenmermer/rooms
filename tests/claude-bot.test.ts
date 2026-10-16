import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { SocialMessage } from '@rooms/social';
import {
  ConversationStore,
  cleanPrompt,
  detectTrigger,
  parseQuoteReply,
  splitReply,
  toPlainText,
  type BotIdentity,
} from '../apps/services/claude-bot/conversation';
import { ClaudeChannelBot, type ChatClient } from '../apps/services/claude-bot/bot';
import {
  describeToolUse,
  runClaude,
  type RunInput,
  type RunResult,
} from '../apps/services/claude-bot/runner';

const bot: BotIdentity = { id: 'BOT1', names: ['Claude', 'claude'] };
let seq = 0;
const msg = (content: string, extra: Partial<SocialMessage> = {}): SocialMessage => ({
  id: `M${++seq}`,
  channelId: 'C1',
  author: { id: 'U1', username: 'semsettin', displayName: 'Semsettin', avatar: null },
  content,
  timestamp: '2026-10-16T12:00:00.000Z',
  editedTimestamp: null,
  ...extra,
});
const store = () =>
  new ConversationStore(join(mkdtempSync(join(tmpdir(), 'claude-bot-')), 'c.json'));

describe('@claude trigger detection', () => {
  it('accepts identity mentions and plain-text @claude, and ignores bots and other text', () => {
    const s = store();
    expect(detectTrigger(msg('<@BOT1> what is 2+2?', { mentions: ['BOT1'] }), bot, s)).toEqual({
      kind: 'mention',
      prompt: 'what is 2+2?',
    });
    expect(detectTrigger(msg('hey @Claude, deploy status?'), bot, s)).toEqual({
      kind: 'mention',
      prompt: 'hey deploy status?',
    });
    expect(detectTrigger(msg('mail me at a@claude.dev'), bot, s)).toBeNull();
    expect(detectTrigger(msg('@claudette hi'), bot, s)).toBeNull();
    expect(detectTrigger(msg('just chatting'), bot, s)).toBeNull();
    expect(
      detectTrigger(
        msg('@claude hi', {
          author: { id: 'B2', username: 'x', displayName: 'x', avatar: null, bot: true },
        }),
        bot,
        s,
      ),
    ).toBeNull();
    expect(detectTrigger(msg('<@BOT1>', { mentions: ['BOT1'] }), bot, s)).toBeNull();
  });

  it('continues a conversation from a ROOMS quote-reply or a native reply to a bot message', () => {
    const s = store();
    const c = s.create('C1', 'U1');
    const answer = 'Here is the plan:\n1. read logs\n2. fix it';
    s.recordBotMessage(c.id, 'C1', 'B10', answer);
    const quote = `> Claude: ${answer.replace(/\n/g, '\n> ')}\n\nok, do step 2`;
    expect(parseQuoteReply(quote)).toMatchObject({ author: 'Claude', reply: 'ok, do step 2' });
    expect(detectTrigger(msg(quote), bot, s)).toEqual({
      kind: 'continue',
      prompt: 'ok, do step 2',
      conversationId: c.id,
    });
    expect(detectTrigger(msg('and tests?', { replies: ['B10'] }), bot, s)).toEqual({
      kind: 'continue',
      prompt: 'and tests?',
      conversationId: c.id,
    });
    // Quoting a person (not the bot) only triggers with an explicit mention, as a new conversation.
    expect(detectTrigger(msg('> Ayşe: the build broke\n\nany idea?'), bot, s)).toBeNull();
    expect(
      detectTrigger(msg('> Ayşe: the build broke\n\n@claude any idea?'), bot, s),
    ).toMatchObject({
      kind: 'mention',
    });
  });

  it('matches edited status messages and long answers by their quoted prefix', () => {
    const s = store();
    const c = s.create('C1', 'U1');
    s.recordBotMessage(c.id, 'C1', 'S1', '⏳ Üzerinde çalışıyorum…');
    s.updateBotMessage('S1', '✅ Bitti · 3 adım · 12 sn · $0.04');
    expect(s.byQuote('C1', '✅ Bitti · 3 adım · 12 sn · $0.04')).toBe(c.id);
    const long = 'x'.repeat(900);
    s.recordBotMessage(c.id, 'C1', 'L1', long);
    expect(s.byQuote('C1', long.slice(0, 400))).toBe(c.id);
    expect(s.byQuote('C2', long.slice(0, 400))).toBeUndefined();
  });

  it('cleans mention tokens from prompts', () => {
    expect(cleanPrompt('<@BOT1>   fix the login bug', bot)).toBe('fix the login bug');
    expect(cleanPrompt('@claude: summarize', bot)).toBe('summarize');
  });
});

describe('reply splitting', () => {
  it('keeps chunks under the Stoat limit and balances code fences', () => {
    const text = `intro\n\`\`\`ts\n${Array.from({ length: 200 }, (_, i) => `const line${i} = ${i};`).join('\n')}\n\`\`\`\noutro`;
    const chunks = splitReply(text, 500);
    expect(chunks.length).toBeGreaterThan(3);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(500);
      expect((chunk.match(/```/g) ?? []).length % 2).toBe(0);
    }
    expect(splitReply('short')).toEqual(['short']);
    expect(splitReply('y'.repeat(1200), 500).every((c) => c.length <= 500)).toBe(true);
  });
});

describe('plain-text answers', () => {
  it('removes Markdown that ROOMS would show literally, keeping the content', () => {
    expect(
      toPlainText(
        '## Özet\nProd sunucuda **21 container** çalışıyor.\n* Boş: __243 MiB__\n* Komut: `docker ps`\n```bash\nfree -m\n```\nDetay: [docs](https://example.org/x) ve *önemli* not, 2*3*4 kalır.',
      ),
    ).toBe(
      'Özet\nProd sunucuda 21 container çalışıyor.\n- Boş: 243 MiB\n- Komut: docker ps\nfree -m\nDetay: docs (https://example.org/x) ve önemli not, 2*3*4 kalır.',
    );
  });
});

describe('monthly spend', () => {
  it('accumulates within a month and resets in the next one', () => {
    let now = new Date('2026-10-30T00:00:00Z');
    const s = new ConversationStore(
      join(mkdtempSync(join(tmpdir(), 'claude-bot-')), 'c.json'),
      () => now,
    );
    s.addSpend(1.5);
    s.addSpend(2);
    expect(s.monthlySpend()).toBe(3.5);
    now = new Date('2026-11-01T00:00:00Z');
    expect(s.monthlySpend()).toBe(0);
  });
});

class FakeChat implements ChatClient {
  sent: { id: string; channelId: string; replyTo: string; content: string }[] = [];
  edits = new Map<string, string>();
  history: SocialMessage[] = [];
  async sendReply(channelId: string, replyTo: string, content: string) {
    const id = `B${this.sent.length + 100}`;
    this.sent.push({ id, channelId, replyTo, content });
    return { id };
  }
  async editMessage(_c: string, id: string, content: string) {
    this.edits.set(id, content);
  }
  async listMessages() {
    return this.history;
  }
  content(id: string) {
    return this.edits.get(id) ?? this.sent.find((m) => m.id === id)?.content ?? '';
  }
}
const config = {
  bot,
  model: 'test-model',
  workdir: '/tmp',
  systemPrompt: 'sys',
  timeoutMs: 10_000,
  monthlyBudgetUsd: 10,
  maxConcurrent: 1,
  progressIntervalMs: 0,
  contextMessages: 5,
};

describe('multi-step @claude conversation', () => {
  it('starts a session on mention, resumes it on replies, and posts progress and answers', async () => {
    const chat = new FakeChat();
    const s = store();
    const calls: RunInput[] = [];
    const run = async (input: RunInput): Promise<RunResult> => {
      calls.push(input);
      input.onStep?.('Read `README.md`');
      return {
        sessionId: 'S-1',
        text: calls.length === 1 ? 'The answer is 4.' : 'Doubled: 8.',
        costUsd: 0.02,
        turns: 2,
        isError: false,
        stopped: null,
      };
    };
    const b = new ClaudeChannelBot(chat, s, run, config);
    chat.history = [
      msg('earlier context line', {
        author: { id: 'U2', username: 'ayse', displayName: 'Ayşe', avatar: null },
      }),
    ];

    const first = msg('@claude what is 2+2?');
    await b.handle(first);
    await b.idle();
    expect(calls[0]!.sessionId).toBeNull();
    expect(calls[0]!.prompt).toContain('earlier context line');
    expect(calls[0]!.prompt).toContain('Semsettin (@semsettin, id U1)');
    const [status, answer] = chat.sent;
    expect(chat.content(status!.id)).toMatch(/^✅ Bitti · 1 adım/);
    expect(answer).toMatchObject({ replyTo: first.id, content: 'The answer is 4.' });

    // Step 2: a different person quote-replies to the answer without mentioning @claude.
    await b.handle(
      msg(`> Claude: The answer is 4.\n\nnow double it`, {
        author: { id: 'U2', username: 'ayse', displayName: 'Ayşe', avatar: null },
      }),
    );
    await b.idle();
    expect(calls[1]!.sessionId).toBe('S-1');
    expect(calls[1]!.prompt).not.toContain('earlier context line');
    expect(calls[1]!.prompt).toContain('Ayşe (@ayse, id U2)');
    expect(chat.sent.at(-1)!.content).toBe('Doubled: 8.');

    // A fresh mention starts a separate conversation.
    await b.handle(msg('@claude new topic'));
    await b.idle();
    expect(calls[2]!.sessionId).toBeNull();
    expect(s.monthlySpend()).toBeCloseTo(0.06);
  });

  it('serializes turns of one conversation and lets "stop" abort the running one', async () => {
    const chat = new FakeChat();
    const s = store();
    let release!: () => void;
    const aborted: boolean[] = [];
    const run = (input: RunInput) =>
      new Promise<RunResult>((resolve) => {
        release = () =>
          resolve({
            sessionId: 'S-2',
            text: 'done',
            costUsd: 0,
            turns: 1,
            isError: false,
            stopped: null,
          });
        input.signal?.addEventListener('abort', () => {
          aborted.push(true);
          resolve({
            sessionId: 'S-2',
            text: '',
            costUsd: 0,
            turns: 1,
            isError: false,
            stopped: 'aborted',
          });
        });
      });
    const b = new ClaudeChannelBot(chat, s, run, config);
    await b.handle(msg('@claude long job'));
    await new Promise((r) => setTimeout(r, 10));
    const statusId = chat.sent[0]!.id;
    await b.handle(msg('stop', { replies: [statusId] }));
    await b.idle();
    expect(aborted).toEqual([true]);
    expect(chat.sent.some((m) => m.content === '⏹️ Durduruyorum.')).toBe(true);
    expect(chat.content(statusId)).toMatch(/^⏹️ Durduruldu/);
    release();
  });

  it('in owner-only mode ignores everyone else, including replies to the bot', async () => {
    const chat = new FakeChat();
    const s = store();
    const calls: RunInput[] = [];
    const run = async (input: RunInput): Promise<RunResult> => {
      calls.push(input);
      return { sessionId: 'S-3', text: 'ok', costUsd: 0, turns: 1, isError: false, stopped: null };
    };
    const b = new ClaudeChannelBot(chat, s, run, { ...config, allowedUserIds: new Set(['U1']) });
    const other = { id: 'U9', username: 'guest', displayName: 'Guest', avatar: null };
    await b.handle(msg('@claude do something', { author: other }));
    await b.idle();
    expect(chat.sent).toHaveLength(0);
    await b.handle(msg('@claude hello'));
    await b.idle();
    expect(calls).toHaveLength(1);
    const answerId = chat.sent.at(-1)!.id;
    await b.handle(msg('continue please', { author: other, replies: [answerId] }));
    await b.idle();
    expect(calls).toHaveLength(1);
  });

  it('refuses new work once the monthly budget is used', async () => {
    const chat = new FakeChat();
    const s = store();
    s.addSpend(10);
    let ran = false;
    const b = new ClaudeChannelBot(
      chat,
      s,
      async () => {
        ran = true;
        throw new Error('should not run');
      },
      config,
    );
    await b.handle(msg('@claude hello'));
    await b.idle();
    expect(ran).toBe(false);
    expect(chat.sent[0]!.content).toContain('bütçesini');
  });
});

describe('catch-up after downtime', () => {
  const okRun =
    (calls: string[]) =>
    async (input: RunInput): Promise<RunResult> => {
      calls.push(input.prompt);
      return { sessionId: 'S-c', text: 'ok', costUsd: 0, turns: 1, isError: false, stopped: null };
    };
  const at = (
    id: string,
    content: string,
    minutesAgo: number,
    extra: Partial<SocialMessage> = {},
  ) =>
    msg(content, {
      id,
      timestamp: new Date(Date.parse('2026-10-16T12:00:00Z') - minutesAgo * 60_000).toISOString(),
      ...extra,
    });
  const now = Date.parse('2026-10-16T12:00:00Z');

  it('only records the cursor on the first run, without answering history', async () => {
    const chat = new FakeChat();
    const s = store();
    const calls: string[] = [];
    chat.history = [at('01A', '@claude old question', 5)];
    const b = new ClaudeChannelBot(chat, s, okRun(calls), config);
    expect(await b.catchUp([{ id: 'C1', lastMessageId: '01A' }], 3_600_000, now)).toBe(0);
    expect(s.cursor).toBe('01A');
    expect(calls).toHaveLength(0);
  });

  it('answers mentions missed after the cursor once, skipping old, bot and already-answered ones', async () => {
    const chat = new FakeChat();
    const s = store();
    const calls: string[] = [];
    const b = new ClaudeChannelBot(chat, s, okRun(calls), config);
    await b.handle(at('01B', '@claude live question', 30));
    await b.idle();
    expect(calls).toHaveLength(1);
    const bot = { id: 'BOT9', username: 'other', displayName: 'Other', avatar: null, bot: true };
    chat.history = [
      at('01B', '@claude live question', 30),
      at('01C', '@claude too old', 24 * 60),
      at('01D', 'not for the bot', 10),
      at('01E', '@claude missed while offline', 5),
      at('01F', '@claude from a bot', 4, { author: bot }),
    ];
    // 01C is newer than the cursor but older than the window, so it is ignored.
    s.markSeen('01B');
    expect(
      await b.catchUp(
        [
          { id: 'C1', lastMessageId: '01F' },
          { id: 'C2', lastMessageId: '01A' },
        ],
        3_600_000,
        now,
      ),
    ).toBe(1);
    await b.idle();
    expect(calls).toHaveLength(2);
    expect(calls[1]).toContain('missed while offline');
    expect(s.cursor).toBe('01F');
    // A second pass (for example after a reconnect) finds nothing new.
    expect(await b.catchUp([{ id: 'C1', lastMessageId: '01F' }], 3_600_000, now)).toBe(0);
    // Live redelivery of a caught-up message is ignored too.
    await b.handle(at('01E', '@claude missed while offline', 5));
    await b.idle();
    expect(calls).toHaveLength(2);
  });
});

describe('Claude CLI runner', () => {
  it('parses stream-json events, reports steps and resumes sessions', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'claude-cli-'));
    const fake = join(dir, 'claude');
    writeFileSync(
      fake,
      `#!/usr/bin/env node
const args = process.argv.slice(2);
let input = '';
process.stdin.on('data', (d) => (input += d)).on('end', () => {
  const out = (e) => process.stdout.write(JSON.stringify(e) + '\\n');
  out({ type: 'system', subtype: 'init', session_id: 'sess-9' });
  out({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Bash', input: { command: 'ls -la' } }] } });
  out({ type: 'result', subtype: 'success', is_error: false, result: 'echo:' + input + '|' + args.includes('--resume'), session_id: 'sess-9', total_cost_usd: 0.5, num_turns: 3 });
});
`,
    );
    chmodSync(fake, 0o755);
    const steps: string[] = [];
    const result = await runClaude({
      command: fake,
      prompt: 'hello',
      sessionId: 'prev',
      cwd: dir,
      model: 'm',
      systemPrompt: 's',
      timeoutMs: 10_000,
      onStep: (s) => steps.push(s),
    });
    expect(result).toEqual({
      sessionId: 'sess-9',
      text: 'echo:hello|true',
      costUsd: 0.5,
      turns: 3,
      isError: false,
      stopped: null,
    });
    expect(steps).toEqual(['$ ls -la']);
  });

  it('describes tool calls without echoing content', () => {
    expect(describeToolUse('Write', { file_path: '/a/b.ts', content: 'SECRET' })).toBe(
      'Write /a/b.ts',
    );
    expect(describeToolUse('TodoWrite', {})).toBeNull();
  });
});
