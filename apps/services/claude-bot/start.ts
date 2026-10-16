import { execFile } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { StoatClient } from '@rooms/stoat';
import type { SocialMessage } from '@rooms/social';
import { ClaudeChannelBot } from './bot';
import { ConversationStore } from './conversation';
import { runClaude } from './runner';
import { systemPrompt } from './system-prompt';

const run = promisify(execFile);
const log = (message: string) => console.log(`[claude-bot] ${message}`);
const number = (name: string, fallback: number) => {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isFinite(value) || value < 0)
    throw new Error(`${name} must be a non-negative number.`);
  return value;
};

/** Best-effort repository checkout and GitHub credential helper; the bot still works without them. */
async function prepareWorkspace(workdir: string, repository: string, github: boolean) {
  mkdirSync(workdir, { recursive: true });
  if (github) await run('gh', ['auth', 'setup-git']).catch(() => log('gh auth setup-git failed'));
  const checkout = join(workdir, repository.split('/')[1]!);
  if (!existsSync(join(checkout, '.git')))
    await run('git', ['clone', '--quiet', `https://github.com/${repository}.git`, checkout], {
      timeout: 600_000,
    }).catch(() => log(`clone of ${repository} failed; Claude can retry on demand`));
}

async function main() {
  const url = process.env.ROOMS_CLAUDE_STOAT_URL;
  const token = process.env.ROOMS_CLAUDE_BOT_TOKEN;
  if (!url || !token)
    throw new Error('ROOMS_CLAUDE_STOAT_URL and ROOMS_CLAUDE_BOT_TOKEN are required.');
  const allowedUserIds = new Set(
    (process.env.ROOMS_CLAUDE_ALLOWED_USERS ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean),
  );
  // A personal claude.ai login may only serve its owner; shared use needs an Anthropic API key.
  const personal = !process.env.ANTHROPIC_API_KEY;
  if (personal && allowedUserIds.size !== 1)
    throw new Error(
      'Without ANTHROPIC_API_KEY, set ROOMS_CLAUDE_ALLOWED_USERS to exactly one ROOMS user ID (the owner of the Claude login).',
    );
  const data = process.env.ROOMS_CLAUDE_DATA ?? '/data';
  const workdir = process.env.ROOMS_CLAUDE_WORKDIR ?? '/workspace';
  const repository = process.env.ROOMS_CLAUDE_REPOSITORY ?? 'egemenmermer/rooms';
  const github = Boolean(process.env.GH_TOKEN);
  const prodOps = process.env.ROOMS_CLAUDE_PROD_OPS === 'enabled';

  const client = new StoatClient(url, token, { botToken: true });
  const self = await client.getCurrentUser();
  if (!self.bot) throw new Error('The configured token does not identify a Stoat bot.');
  const names = [...new Set([self.displayName, self.username, 'claude'].filter(Boolean))];
  await prepareWorkspace(workdir, repository, github);

  // The bot token stays with this process; Claude's tools never see it.
  const { ROOMS_CLAUDE_BOT_TOKEN: _token, ...claudeEnv } = process.env;
  const bot = new ClaudeChannelBot(
    {
      sendReply: (channelId, messageId, content, deliveryId) =>
        client.sendReply(channelId, messageId, content, deliveryId),
      editMessage: (channelId, messageId, content) =>
        client.editMessage(channelId, messageId, content),
      listMessages: (channelId) => client.listMessages(channelId),
    },
    new ConversationStore(join(data, 'conversations.json')),
    runClaude,
    {
      bot: { id: self.id, names },
      model: process.env.ROOMS_CLAUDE_MODEL ?? 'claude-sonnet-5-5',
      workdir,
      systemPrompt: systemPrompt({
        botName: self.displayName || self.username,
        ownerOnly: allowedUserIds.size > 0,
        repository,
        github,
        prodOps,
      }),
      timeoutMs: number('ROOMS_CLAUDE_TIMEOUT_MINUTES', 30) * 60_000,
      monthlyBudgetUsd: number('ROOMS_CLAUDE_MONTHLY_BUDGET_USD', 200),
      maxConcurrent: Math.max(1, number('ROOMS_CLAUDE_MAX_CONCURRENT', 1)),
      progressIntervalMs: 4000,
      contextMessages: number('ROOMS_CLAUDE_CONTEXT_MESSAGES', 15),
      allowedUserIds,
      env: { ...claudeEnv, DISABLE_AUTOUPDATER: '1' },
    },
    log,
  );
  const maxAgeMs = number('ROOMS_CLAUDE_CATCHUP_HOURS', 12) * 3_600_000;
  const catchUp = async () => {
    const channels = [];
    for (const space of await client.listSpaces())
      channels.push(...(await client.listChannels(space.id)));
    const queued = await bot.catchUp(channels, maxAgeMs);
    if (queued) log(`caught up on ${queued} message(s) missed while offline`);
  };
  const runCatchUp = () =>
    catchUp().catch((error) =>
      log(`catch-up failed: ${error instanceof Error ? error.message : error}`),
    );
  let ready = false;
  client.subscribe((event) => {
    // The gateway reconnects on its own; each later READY may follow a gap in delivery.
    if (event.type === 'READY' && ready) void runCatchUp();
    if (event.type !== 'MESSAGE_CREATE') return;
    void bot
      .handle(event.data as SocialMessage)
      .catch((error) =>
        log(`message handling failed: ${error instanceof Error ? error.message : error}`),
      );
  });
  await client.connect();
  await runCatchUp();
  ready = true;
  log(
    `connected as @${self.username} (${self.id}); model ${process.env.ROOMS_CLAUDE_MODEL ?? 'claude-sonnet-5-5'}; ${personal ? `personal login, owner ${[...allowedUserIds][0]}` : 'API key'}; prod ops ${prodOps ? 'enabled' : 'disabled'}; GitHub ${github ? 'enabled' : 'disabled'}`,
  );
  for (const signal of ['SIGINT', 'SIGTERM'] as const)
    process.on(signal, () => {
      bot.stopAll();
      void Promise.race([bot.idle(), new Promise((r) => setTimeout(r, 8000))]).then(async () => {
        await client.disconnect();
        process.exit(0);
      });
    });
}

void main().catch((error) => {
  console.error(`[claude-bot] startup failed: ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
});
