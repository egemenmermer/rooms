import { TitleMetadata } from './metadata';
import { join } from 'node:path';
import type { ActivityResponse } from '../../../packages/activity-protocol/src/index';
import { cachedAuthority, stoatAuthority } from './authority';
import { ConfigStore } from './config-store';
import { Importer, safeError } from './importer';
import { RelayManager } from './relay';
import { registerRelayRoutes } from './relay-routes';
import { Rmdb, RmdbStore } from './rmdb';
import { SecureFiles } from './secure-file';
import { createCinemaServer } from './server';
import { SubtitleSearch } from './subtitles';
import { stremioFetch } from './stremio';
import { CatalogStore, CinemaService } from './service';
import { issueTicket } from './tickets';

async function main() {
  const key = process.env.ROOMS_CINEMA_STORAGE_KEY ?? '';
  if (!/^[a-f0-9]{64}$/i.test(key))
    throw new Error('ROOMS_CINEMA_STORAGE_KEY must be 64 hex characters');
  const ticketSecret = process.env.ROOMS_CINEMA_TICKET_SECRET ?? '';
  if (ticketSecret.length < 32)
    throw new Error('ROOMS_CINEMA_TICKET_SECRET must be at least 32 characters');
  const state = process.env.ROOMS_CINEMA_STATE ?? '.local/cinema';
  const log = (line: string) => console.log(line);
  const userAgent = process.env.ROOMS_CINEMA_USER_AGENT ?? 'ROOMS-Cinema/1.0';
  // Dev only: a local mock provider on 127.0.0.1. Production keeps the private-network block.
  const allowPrivateNetwork = process.env.ROOMS_CINEMA_ALLOW_PRIVATE_SOURCES === '1';
  const files = new SecureFiles(Buffer.from(key, 'hex'));
  const configs = new ConfigStore(state, files);
  const catalogs = new CatalogStore(state, files);
  catalogs.preload(
    configs
      .all()
      .filter((config) => config.source)
      .map((c) => c.communityId),
  );
  // Separate from the account and catalog files: removing the account keeps RMDB.
  const rmdb = new Rmdb(new RmdbStore(state, files));
  const importer = new Importer({ userAgent, allowPrivateNetwork });
  const relays = new RelayManager({
    directory: process.env.ROOMS_CINEMA_HLS ?? join(state, 'hls'),
    userAgent,
    allowPrivateNetwork,
    // About 120 MB per film relay at 8 Mbps; leaves room in the 256 MB tmpfs.
    vodWindowSec: Number(process.env.ROOMS_CINEMA_VOD_WINDOW_SEC ?? 120),
    log,
  });
  const secret = Buffer.from(ticketSecret);
  const activities = process.env.ROOMS_ACTIVITIES_INTERNAL_URL ?? 'http://127.0.0.1:3031';
  const authority = cachedAuthority(
    stoatAuthority({
      stoatUrl: process.env.STOAT_INTERNAL_URL ?? 'http://127.0.0.1:3022',
      mongoUrl: process.env.ROOMS_SOCIAL_READ_MONGO_URL,
    }),
  );
  const service = new CinemaService({
    configs,
    catalogs,
    importer,
    relays,
    tickets: (claims) => issueTicket(claims, secret),
    activity: async (token, hallId) => {
      const response = await fetch(
        `${activities}/v1/rooms/${encodeURIComponent(hallId)}/activity`,
        {
          headers: { Authorization: `Bearer ${token}` },
          redirect: 'error',
          signal: AbortSignal.timeout(10_000),
        },
      );
      if (!response.ok) throw new Error(`activity ${response.status}`);
      return (await response.json()) as ActivityResponse;
    },
    image: (url) => importer.image(url),
    subtitles: new SubtitleSearch({ userAgent }),
    stremio: stremioFetch({ userAgent, allowPrivateNetwork }),
    metadata: new TitleMetadata({ userAgent }),
    rmdb,
    maxRelays: Number(process.env.ROOMS_CINEMA_MAX_RELAYS ?? 1),
    log,
  });
  const server = await createCinemaServer({
    service,
    configs,
    authority,
    registerRelay: (instance) => registerRelayRoutes(instance, { relays, ticketSecret: secret }),
    log,
  });
  const refresh = () => {
    try {
      service.refreshDue();
    } catch (error) {
      log(`cinema refresh failed: ${safeError(error)}`);
    }
  };
  setTimeout(refresh, 30_000).unref();
  setInterval(refresh, 10 * 60_000).unref();
  server.addHook('onClose', async () => {
    await relays.close();
    catalogs.flush();
    rmdb.store.flush();
    await catalogs.settled();
    await rmdb.store.settled();
    await authority.close();
  });
  await server.listen({
    host: process.env.SERVICE_HOST ?? '127.0.0.1',
    port: Number(process.env.CINEMA_PORT ?? 3050),
  });
  log('ROOMS cinema service listening. Logs exclude provider credentials.');
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => void server.close());
}

void main().catch((error: unknown) => {
  console.error(`ROOMS cinema startup failed: ${safeError(error)}`);
  process.exitCode = 1;
});
