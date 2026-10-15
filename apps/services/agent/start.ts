import { connectStoatBot, sendStoatReply } from './stoat-bot';
import { StoatClient } from '@rooms/stoat';
import { connectDiscordBot, sendDiscordReply } from './discord';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { timingSafeEqual, createHash } from 'node:crypto';
import { z } from 'zod';
import { execFileSync } from 'node:child_process';
import { AgentRepository, type AgentOutboxItem } from './repository';
import { createAgentServer, type AgentPrincipal } from './server';
import { createRemoteExecutor, executorCapabilities, type RemoteExecutorConfig } from './worker';
import { sharedHostExecutor, sharedWorker, verifySharedHost } from './shared-host';
import { WorkspaceTerminals, rootlessTerminalDriver } from './workspace-terminals';
const subject = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-zA-Z0-9_-]+$/)
  .refine((id) => !['__proto__', 'constructor', 'prototype'].includes(id));
const host = z
  .string()
  .min(1)
  .max(253)
  .regex(/^(?:[a-zA-Z0-9-]+\.)+[a-zA-Z0-9-]+$/);
const grantSchema = z
  .object({
    userId: subject,
    roomIds: z.array(subject).max(100),
    canManage: z.boolean(),
    tokenSha256: z.string().regex(/^[a-fA-F0-9]{64}$/),
    enabled: z.boolean(),
  })
  .strict();
const policySchema = z
  .object({
    version: z.literal(1),
    networkName: z
      .string()
      .regex(/^rooms-[a-z0-9-]{1,80}$/)
      .optional(),
    egressVerified: z.boolean().default(false),
    allowedResearchHosts: z.array(host).max(200).default([]),
    browserHosts: z.array(host).max(100).default([]),
    connectorScopes: z
      .array(z.enum(['github.read', 'github.write', 'drive.read', 'drive.write']))
      .default([]),
  })
  .strict();
const accountsSchema = z
  .object({
    githubToken: z.string().min(10).max(4096).optional(),
    githubRepositories: z
      .array(z.string().regex(/^\w[\w.-]*\/\w[\w.-]*$/))
      .max(100)
      .default([]),
    driveToken: z.string().min(10).max(4096).optional(),
    driveOAuth: z
      .object({
        clientId: z.string().min(5).max(4096),
        clientSecret: z.string().min(5).max(4096),
        refreshToken: z.string().min(10).max(8192),
      })
      .strict()
      .optional(),
    driveFolderIds: z
      .array(z.string().regex(/^[-\w]{1,200}$/))
      .max(100)
      .default([]),
  })
  .strict();
const stoatMappingSchema = z
  .object({
    authorId: subject,
    channelId: subject,
    userId: subject,
    roomId: subject,
    modelConnectionId: z.string().uuid(),
  })
  .strict();
const discordMappingSchema = z
  .object({
    discordAuthorId: z.string().regex(/^\d{5,25}$/),
    channelId: z.string().regex(/^\d{5,25}$/),
    userId: subject,
    roomId: subject,
    modelConnectionId: z.string().uuid(),
  })
  .strict();
function privateJSON(path: string) {
  const mode = statSync(path).mode & 0o777;
  if (mode & 0o077) throw new Error('Configuration file permissions must be 0600 or stricter.');
  return JSON.parse(readFileSync(path, 'utf8'));
}
async function main() {
  const shared = process.env.ROOMS_AGENT_BACKEND === 'shared-rootless';
  if (process.platform !== 'linux') throw new Error('Linux agent host required.');
  if (!shared && process.getuid?.() !== 10001)
    throw new Error('Run the dedicated service as UID 10001 to match isolated worker mounts.');
  const key = process.env.ROOMS_AGENT_STORAGE_KEY;
  if (!key || !/^([a-fA-F0-9]{64})$/.test(key))
    throw new Error('32-byte storage encryption key required.');
  const authorizationFile = process.env.ROOMS_AGENT_AUTH_FILE;
  if (!authorizationFile) throw new Error('Authorization file required.');
  const grants = () => z.array(grantSchema).max(100).parse(privateJSON(authorizationFile));
  const match = (hash: string) =>
    grants().find(
      (g) =>
        g.enabled && timingSafeEqual(Buffer.from(g.tokenSha256, 'hex'), Buffer.from(hash, 'hex')),
    );
  const hostId = shared ? subject.parse(process.env.ROOMS_AGENT_HOST_ID) : undefined;
  const authorityKey = shared
    ? z
        .string()
        .regex(/^[a-f0-9]{64}$/)
        .parse(process.env.ROOMS_AGENT_HOST_AUTHORITY_KEY)
    : undefined;
  const hostChecks = new Map<string, { until: number; pending: Promise<void> }>();
  const hostAuthority = async (p: AgentPrincipal) => {
    if (!shared) return p;
    let check = hostChecks.get(p.userId);
    if (!check || check.until <= Date.now()) {
      const pending = (async () => {
        const response = await fetch('http://127.0.0.1:3042/internal/agent-authority', {
          method: 'POST',
          redirect: 'error',
          signal: AbortSignal.timeout(3000),
          headers: { Authorization: `Bearer ${authorityKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ hostId, userId: p.userId }),
        });
        if (!response.ok || ((await response.json()) as { allowed?: boolean }).allowed !== true)
          throw new Error('Host Agent authority is unavailable or revoked.');
      })();
      if (hostChecks.size >= 500) hostChecks.clear();
      check = { pending, until: Date.now() + 1000 };
      hostChecks.set(p.userId, check);
    }
    await check.pending;
    return p;
  };
  const directory = process.env.ROOMS_AGENT_DATA ?? '/var/lib/rooms-agent';
  const modelHomes = join(directory, 'model-homes');
  const policy = process.env.ROOMS_AGENT_POLICY_FILE
    ? policySchema.parse(privateJSON(process.env.ROOMS_AGENT_POLICY_FILE))
    : policySchema.parse({ version: 1 });
  const accounts = process.env.ROOMS_AGENT_CONNECTORS_FILE
    ? accountsSchema.parse(privateJSON(process.env.ROOMS_AGENT_CONNECTORS_FILE))
    : accountsSchema.parse({});
  const workerNetworkEnabled = process.env.ROOMS_AGENT_WORKER_NETWORK === 'enabled';
  const sharedConfig = {
    image: process.env.ROOMS_AGENT_WORKER_IMAGE ?? '',
    workspaceRoot: join(directory, 'workspaces'),
  };
  if (shared) {
    if (workerNetworkEnabled || policy.browserHosts.length || policy.egressVerified)
      throw new Error('Shared-host workers have no network or browser access.');
    await verifySharedHost(sharedConfig);
  }
  if (workerNetworkEnabled && policy.egressVerified) {
    if (policy.networkName !== 'rooms-agent-egress')
      throw new Error('Use the dedicated isolated proxy network.');
    const network = JSON.parse(
      execFileSync('docker', ['network', 'inspect', policy.networkName], {
        encoding: 'utf8',
        timeout: 5000,
      }),
    )[0];
    if (
      network?.Internal !== true ||
      network?.Options?.['com.docker.network.bridge.name'] !== 'br-rooms-agent'
    )
      throw new Error('Worker network topology is not isolated.');
  }
  const executorConfig: RemoteExecutorConfig = {
    image: process.env.ROOMS_AGENT_WORKER_IMAGE ?? 'rooms-agent-worker:local',
    modelHomes,
    allowNetwork: workerNetworkEnabled,
    networkName: policy.networkName,
    egressVerified: policy.egressVerified,
    allowedResearchHosts: policy.allowedResearchHosts,
    externalAccounts: accounts,
    connectorScopes: policy.connectorScopes,
    ...(shared ? { runtime: { runWorker: sharedWorker(sharedConfig) } } : {}),
    ...(policy.browserHosts.length
      ? {
          browser: {
            profileDirectory: join(directory, 'bot-browser-profile'),
            allowedHosts: policy.browserHosts,
            networkName: policy.networkName,
            egressVerified: policy.egressVerified,
          },
        }
      : {}),
  };
  const stoatMappings = () =>
    process.env.ROOMS_STOAT_BOT_MAPPING_FILE
      ? z.array(stoatMappingSchema).parse(privateJSON(process.env.ROOMS_STOAT_BOT_MAPPING_FILE))
      : [];
  const discordMappings = () =>
    process.env.ROOMS_DISCORD_MAPPING_FILE
      ? z.array(discordMappingSchema).parse(privateJSON(process.env.ROOMS_DISCORD_MAPPING_FILE))
      : [];
  const reminderTarget = async (
    p: AgentPrincipal,
    input: { roomId: string; channelId: string; sourceMessageId: string },
  ) => {
    if (!process.env.ROOMS_STOAT_BOT_TOKEN || !process.env.ROOMS_STOAT_BOT_URL)
      throw Object.assign(new Error('STOAT_REMINDERS_UNAVAILABLE'), { statusCode: 409 });
    const mapping = stoatMappings().find(
      (m) => m.userId === p.userId && m.roomId === input.roomId && m.channelId === input.channelId,
    );
    if (!mapping || !p.roomIds.includes(input.roomId))
      throw Object.assign(new Error('REMINDER_TARGET_DENIED'), { statusCode: 403 });
    const client = new StoatClient(
      process.env.ROOMS_STOAT_BOT_URL,
      process.env.ROOMS_STOAT_BOT_TOKEN,
      { botToken: true },
    );
    const bot = await client.getCurrentUser();
    if (!bot.bot) throw new Error('Official Stoat bot required.');
    await client.getMessage(input.channelId, input.sourceMessageId);
    return {
      platform: 'stoat' as const,
      channelId: input.channelId,
      sourceMessageId: input.sourceMessageId,
      sourceAuthorId: mapping.authorId,
    };
  };
  const remindersAvailable = async (p: AgentPrincipal) =>
    Boolean(
      process.env.ROOMS_STOAT_BOT_TOKEN &&
      process.env.ROOMS_STOAT_BOT_URL &&
      stoatMappings().some((m) => m.userId === p.userId && p.roomIds.includes(m.roomId)),
    );
  const deliverNotification = async (item: AgentOutboxItem) => {
    // Re-read the current mapping before every delivery; startup snapshots cannot preserve revoked access.
    if (item.platform === 'stoat') {
      if (
        !process.env.ROOMS_STOAT_BOT_TOKEN ||
        !process.env.ROOMS_STOAT_BOT_URL ||
        !stoatMappings().some(
          (m) =>
            m.userId === item.userId &&
            m.roomId === item.roomId &&
            m.channelId === item.channelId &&
            m.authorId === item.sourceAuthorId,
        )
      )
        throw new Error('Stoat notification mapping unavailable or revoked.');
      await sendStoatReply({
        serverUrl: process.env.ROOMS_STOAT_BOT_URL,
        token: process.env.ROOMS_STOAT_BOT_TOKEN,
        channelId: item.channelId,
        messageId: item.sourceMessageId,
        content: item.content,
        deliveryId: createHash('sha256').update(item.id).digest('hex'),
      });
    } else {
      if (
        !process.env.ROOMS_DISCORD_BOT_TOKEN ||
        !process.env.ROOMS_DISCORD_BOT_ID ||
        !discordMappings().some(
          (m) =>
            m.userId === item.userId &&
            m.roomId === item.roomId &&
            m.channelId === item.channelId &&
            m.discordAuthorId === item.sourceAuthorId,
        )
      )
        throw new Error('Discord notification mapping unavailable or revoked.');
      await sendDiscordReply({
        token: process.env.ROOMS_DISCORD_BOT_TOKEN,
        botId: process.env.ROOMS_DISCORD_BOT_ID,
        channelId: item.channelId,
        messageId: item.sourceMessageId,
        content: item.content,
        deliveryId: createHash('sha256').update(item.id).digest('hex'),
      });
    }
  };
  const repository = new AgentRepository(directory, Buffer.from(key, 'hex'));
  const workspaceTerminals =
    shared && process.env.ROOMS_AGENT_NATIVE_MODULES
      ? new WorkspaceTerminals(
          hostId!,
          sharedConfig,
          join(directory, 'workspace-terminals.json'),
          rootlessTerminalDriver(sharedConfig, process.env.ROOMS_AGENT_NATIVE_MODULES),
          repository.data.tasks,
        )
      : undefined;
  let executor = createRemoteExecutor(executorConfig);
  if (shared) executor = sharedHostExecutor(sharedConfig, executor);
  if (workspaceTerminals) executor = workspaceTerminals.guard(executor);
  const { server, enqueueMention } = await createAgentServer({
    repository,
    workspaceTerminals,
    executionHostId: hostId,
    authorize: async (token) => {
      const p = match(createHash('sha256').update(token).digest('hex'));
      if (!p) throw Object.assign(new Error('AUTH_DENIED'), { statusCode: 403 });
      return hostAuthority(p);
    },
    reauthorize: async (userId) => {
      const p = grants().find((g) => g.enabled && g.userId === userId);
      if (!p) throw new Error('User authorization revoked.');
      return hostAuthority(p);
    },
    capabilities: executorCapabilities(executorConfig),
    authority: async (p, roomId) => {
      const active = grants().filter((grant) => grant.enabled && grant.roomIds.includes(roomId));
      const capabilities = new Set(executorCapabilities(executorConfig));
      const scopes: import('../../../packages/agent-contracts/src/index').AgentAuthorityScope[] = [
        { kind: 'room', read: true, write: true, resources: [roomId] },
        { kind: 'workspace', read: true, write: true, resources: [] },
      ];
      for (const kind of ['github', 'drive'] as const) {
        const read = capabilities.has(`${kind}.read`),
          write = capabilities.has(`${kind}.write`);
        if (read || write)
          scopes.push({
            kind,
            read,
            write,
            resources: p.canManage
              ? kind === 'github'
                ? accounts.githubRepositories
                : accounts.driveFolderIds
              : [],
          });
      }
      if (capabilities.has('research'))
        scopes.push({
          kind: 'research',
          read: true,
          write: false,
          resources: p.canManage ? policy.allowedResearchHosts : [],
        });
      if (capabilities.has('browser'))
        scopes.push({
          kind: 'browser',
          read: true,
          write: true,
          resources: p.canManage ? policy.browserHosts : [],
        });
      return {
        principals: active.map((grant) => ({
          userId: grant.userId,
          roomIds: grant.roomIds,
          canManage: grant.canManage,
        })),
        scopes,
        discord: {
          configured: Boolean(
            process.env.ROOMS_DISCORD_BOT_TOKEN &&
            process.env.ROOMS_DISCORD_BOT_ID &&
            process.env.ROOMS_DISCORD_MAPPING_FILE,
          ),
          mappings: discordMappings()
            .filter((mapping) => mapping.roomId === roomId)
            .map((mapping) => ({
              userId: mapping.userId,
              roomId: mapping.roomId,
              channelId: mapping.channelId,
              modelConnectionId: mapping.modelConnectionId,
            })),
        },
      };
    },
    modelStatus: async (m) => {
      if (m.provider === 'openrouter') return 'connected';
      if (!workerNetworkEnabled || !policy.egressVerified || !policy.networkName)
        return 'unavailable';
      const owner = createHash('sha256').update(m.ownerId).digest('hex');
      const dir = join(modelHomes, owner, m.id);
      return existsSync(
        join(dir, m.provider === 'codex' ? '.codex/auth.json' : '.claude/.credentials.json'),
      )
        ? 'connected'
        : 'login-required';
    },
    executionHost: shared ? 'shared-rootless' : 'separate-server',
    executor,
    deliverNotification,
    reminderTarget,
    remindersAvailable,
  });
  let stopStoat = () => {};
  if (
    process.env.ROOMS_STOAT_BOT_TOKEN &&
    process.env.ROOMS_STOAT_BOT_URL &&
    process.env.ROOMS_STOAT_BOT_MAPPING_FILE
  ) {
    const initial = stoatMappings();
    stopStoat = await connectStoatBot({
      serverUrl: process.env.ROOMS_STOAT_BOT_URL,
      token: process.env.ROOMS_STOAT_BOT_TOKEN,
      authorizedAuthorIds: new Set(initial.map((m) => m.authorId)),
      onMention: async (input) => {
        const m = stoatMappings().find(
          (m) => m.authorId === input.authorId && m.channelId === input.channelId,
        );
        if (!m) throw new Error('Mention mapping not authorized.');
        const task = await enqueueMention({
          ...m,
          prompt: input.content,
          sourceMessageId: input.messageId,
          sourceAuthorId: input.authorId,
          platform: 'stoat',
        });
        return task
          ? `Görev ${task.state === 'awaiting-approval' ? 'onay bekliyor' : 'sıraya alındı'}. Sonuç bu mesaja yanıt olarak gönderilecek; ilerlemeyi ROOMS Agent ekranından görebilirsin.`
          : 'Bu mesaj için görev zaten oluşturuldu.';
      },
    });
  }
  server.addHook('onClose', async () => stopStoat());
  let stopDiscord = () => {};
  if (
    process.env.ROOMS_DISCORD_BOT_TOKEN &&
    process.env.ROOMS_DISCORD_BOT_ID &&
    process.env.ROOMS_DISCORD_MAPPING_FILE
  ) {
    const initial = discordMappings();
    stopDiscord = connectDiscordBot({
      token: process.env.ROOMS_DISCORD_BOT_TOKEN,
      botId: process.env.ROOMS_DISCORD_BOT_ID,
      authorizedAuthorIds: new Set(initial.map((m) => m.discordAuthorId)),
      onMention: async (input) => {
        const m = discordMappings().find(
          (m) => m.discordAuthorId === input.authorId && m.channelId === input.channelId,
        );
        if (!m) throw new Error('Discord mapping not authorized.');
        const task = await enqueueMention({
          ...m,
          prompt: input.content,
          sourceMessageId: input.messageId,
          sourceAuthorId: input.authorId,
          platform: 'discord',
        });
        return task
          ? `ROOMS görevi ${task.state === 'awaiting-approval' ? 'onay bekliyor' : 'sıraya alındı'}. Sonuç bu mesaja yanıt olarak gönderilecek; ilerlemeyi ROOMS Agent ekranından görebilirsin.`
          : 'Bu mesaj için görev zaten oluşturuldu.';
      },
    });
  }
  server.addHook('onClose', async () => stopDiscord());
  await server.listen({
    host: process.env.SERVICE_HOST ?? '127.0.0.1',
    port: Number(process.env.AGENT_PORT ?? 3041),
  });
  console.log('ROOMS separate agent service listening. Request logging disabled.');
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => void server.close());
}
void main().catch(() => {
  console.error(
    'Agent startup failed. Check separate Linux host, private authorization/config files and encryption key.',
  );
  process.exitCode = 1;
});
