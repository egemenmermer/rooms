import { readFileSync, statSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { z } from 'zod';
import { StoatClient } from '@rooms/stoat';
import { RoomServiceClient, TrackType } from 'livekit-server-sdk';
import { StoatAuthorizationReader } from '../access/stoat-authorization';
import { stoatCommunityAdmin } from '../access/stoat-permissions';
import { communityOwnership, visibleHostRooms } from './authorization';
import { createHostOpsServer } from './server';
import { HostOpsStore } from './store';
import { LinuxCollector, emptySupplement, type HostSupplement } from './collector';
import { nativeTerminalDriver } from './driver';
import { TerminalHub } from './terminals';
import { opsId, hostSampleSchema } from '../../../packages/shared-contracts/src/hostops';
const exec = promisify(execFile);
const configSchema = z
  .object({
    host: z
      .object({
        id: opsId,
        label: z.string().min(1).max(100),
        physicalHostId: opsId,
        mode: z.enum(['shared', 'dedicated']),
        communityId: opsId,
        ownerProfileId: opsId.nullable(),
        agentAvailable: z.boolean().default(false),
      })
      .strict(),
    stoatUrl: z.string().url(),
    dataDirectory: z.string().startsWith('/'),
    interfaces: z
      .array(z.string().regex(/^[\w.:-]{1,32}$/))
      .max(20)
      .default([]),
    blockDevices: z
      .array(z.string().regex(/^[\w-]{1,64}$/))
      .max(20)
      .default([]),
    terminalProfiles: z
      .array(
        z
          .object({
            id: opsId,
            user: z.string().regex(/^[a-z_][a-z0-9_-]{0,31}$/),
            directory: z.string().startsWith('/').max(512),
          })
          .strict(),
      )
      .max(50)
      .default([]),
    helper: z.string().startsWith('/').optional(),
    nativeModules: z.string().startsWith('/').optional(),
    statusHelper: z.string().startsWith('/').optional(),
    socialReadMongoUrl: z.string().startsWith('mongodb://').optional(),
    agentAuthority: z
      .object({ key: z.string().regex(/^[a-f0-9]{64}$/) })
      .strict()
      .optional(),
    livekit: z
      .object({ url: z.string().url(), key: z.string().min(5), secret: z.string().min(20) })
      .strict()
      .optional(),
  })
  .strict();
async function start() {
  if (process.platform !== 'linux' || process.getuid?.() === 0)
    throw Error('DEDICATED_UNPRIVILEGED_LINUX_USER_REQUIRED');
  const path = process.env.ROOMS_HOSTOPS_CONFIG;
  if (!path) throw Error('HOSTOPS_CONFIG_REQUIRED');
  const info = statSync(path);
  if (info.mode & 0o007 || (info.uid !== 0 && info.uid !== process.getuid?.()))
    throw Error('PRIVATE_CONFIG_REQUIRED');
  const config = configSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
  if (new Set(config.terminalProfiles.map((p) => p.user)).size !== config.terminalProfiles.length)
    throw Error('DISTINCT_OPERATOR_USERS_REQUIRED');
  const store = new HostOpsStore(join(config.dataDirectory, 'metrics.sqlite'));
  const terminal =
    config.helper && config.nativeModules
      ? new TerminalHub(
          join(config.dataDirectory, 'terminals.json'),
          config.terminalProfiles,
          nativeTerminalDriver(config.nativeModules, config.helper),
        )
      : undefined;
  const livekit = config.livekit
    ? new RoomServiceClient(config.livekit.url, config.livekit.key, config.livekit.secret)
    : null;
  const supplement = async (): Promise<HostSupplement> => {
    const value = emptySupplement();
    if (config.statusHelper) {
      try {
        const st = statSync(config.statusHelper);
        if (st.uid !== 0 || st.mode & 0o022) throw Error('UNTRUSTED_STATUS_HELPER');
        const { stdout } = await exec('/usr/bin/sudo', ['-n', config.statusHelper, 'snapshot'], {
          timeout: 4000,
          maxBuffer: 65536,
          env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' },
        });
        const raw = JSON.parse(stdout);
        value.services = hostSampleSchema.shape.services.parse(raw.services);
        value.lastBackupAt = hostSampleSchema.shape.lastBackupAt.parse(raw.lastBackupAt);
        value.workloads = hostSampleSchema.shape.workloads.parse(raw.workloads ?? []);
      } catch {
        value.services = [{ name: 'Servis ölçümü', state: 'unknown', restarts: null }];
      }
    }
    if (livekit) {
      try {
        const rooms = (await livekit.listRooms()).filter((r) =>
          r.name.startsWith('stoat-channel-'),
        );
        let participants = 0,
          streams = 0;
        for (const room of rooms) {
          const users = await livekit.listParticipants(room.name);
          participants += users.length;
          streams += users
            .flatMap((u) => u.tracks)
            .filter((t) => t.type === TrackType.VIDEO).length;
        }
        value.media = { ...value.media, rooms: rooms.length, participants, streams };
      } catch {
        /* No fabricated media health. */
      }
    }
    return value;
  };
  const collector = new LinuxCollector(config.host.id, {
    interfaces: config.interfaces,
    blockDevices: config.blockDevices,
    supplement,
  });
  // A short identity cache bounds keystroke authorization load; grants themselves are read per action.
  const identities = new Map<
    string,
    { until: number; value: { userId: string; owner: boolean } }
  >();
  const reader = config.socialReadMongoUrl
    ? new StoatAuthorizationReader(config.socialReadMongoUrl)
    : null;
  if (config.agentAuthority && !reader) throw Error('CURRENT_ROOM_AUTHORIZATION_REQUIRED');
  const app = createHostOpsServer({
    hosts: [config.host],
    store,
    terminals: terminal,
    sample: () => collector.sample(),
    // Read from the membership store; without it, demoted admins are only cut off on their next
    // request (their sessions then end at the 24 h expiry).
    ...(reader
      ? {
          stillOwner: async (userId: string, host: { communityId: string }) => {
            const { server, member } = await reader.community(host.communityId, userId);
            return stoatCommunityAdmin(server, member, userId);
          },
        }
      : {}),
    ...(config.agentAuthority
      ? {
          internalAgent: {
            key: config.agentAuthority.key,
            visibleRooms: (userId, host, roomIds) =>
              visibleHostRooms(reader!, host.communityId, userId, roomIds),
            identifyUser: async (userId: string, host: { communityId: string }) => {
              const { server, member } = await reader!.community(host.communityId, userId);
              return { userId, owner: stoatCommunityAdmin(server, member, userId) };
            },
          },
        }
      : {}),
    identify: async (token, host) => {
      const known = identities.get(token);
      if (known && known.until > Date.now()) return known.value;
      const client = new StoatClient(config.stoatUrl, token, {
        trustedInternalOrigin: true,
        apiRoot: !new URL(config.stoatUrl).pathname.startsWith('/api'),
      });
      const user = await client.getCurrentUser();
      const owner = await communityOwnership(reader, client, host.communityId, user.id);
      if (identities.size >= 500) identities.clear();
      const value = { userId: user.id, owner };
      identities.set(token, { value, until: Date.now() + 1000 });
      return value;
    },
  });
  app.addHook('onClose', async () => {
    await reader?.close();
  });
  await app.listen({
    host: process.env.SERVICE_HOST ?? '127.0.0.1',
    port: Number(process.env.PORT ?? 3042),
  });
  console.log('ROOMS host operations listening; request and terminal-content logging disabled.');
  for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => void app.close());
}
void start().catch(() => {
  console.error('Host operations startup failed. Verify private configuration and dedicated user.');
  process.exitCode = 1;
});
