// End to end with real ffmpeg: Kanal's mock IPTV panel → cinema service (import, hall
// activity, watch) → relay → ticketed playlist and segments → ffprobe. Opt-in:
// ROOMS_CINEMA_KANAL_MOCK=http://127.0.0.1:8787 ROOMS_CINEMA_RELAY_NATIVE=1, with the
// mock started from the Kanal repository (`dart run tools/mock_server/bin/mock_server.dart`).
import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ActivityCommand, SharedMedia } from '../packages/activity-protocol/src/index';
import { applyCommand, emptyRoom } from '../apps/services/activities/engine';
import type { CinemaAuthority } from '../apps/services/cinema/authority';
import { ConfigStore } from '../apps/services/cinema/config-store';
import { Importer } from '../apps/services/cinema/importer';
import { RelayManager } from '../apps/services/cinema/relay';
import { registerRelayRoutes } from '../apps/services/cinema/relay-routes';
import { SecureFiles } from '../apps/services/cinema/secure-file';
import { createCinemaServer } from '../apps/services/cinema/server';
import { CatalogStore, CinemaService } from '../apps/services/cinema/service';
import { issueTicket } from '../apps/services/cinema/tickets';

const mock = process.env.ROOMS_CINEMA_KANAL_MOCK;
const native = process.env.ROOMS_CINEMA_RELAY_NATIVE === '1';

describe.runIf(mock && native)('community cinema end to end with real ffmpeg', () => {
  const dir = mkdtempSync(join(tmpdir(), 'rooms-cinema-e2e-'));
  const logs: string[] = [];
  const authority: CinemaAuthority = {
    community: async () => ({ userId: 'owner', displayName: 'owner', isOwner: true }),
    channel: async () => ({
      userId: 'owner',
      displayName: 'owner',
      communityId: 'c1',
      isOwner: true,
    }),
    close: async () => {},
  };
  const room = emptyRoom('hall', Date.now());
  const send = (command: ActivityCommand) =>
    applyCommand(
      room,
      { userId: 'owner', displayName: 'owner', canCreate: true, canControl: true },
      {
        protocolVersion: 1,
        commandId: randomUUID(),
        expectedRevision: room.snapshot.revision,
        command,
      },
      Date.now(),
    );
  const secret = randomBytes(32);
  const relays = new RelayManager({
    directory: join(dir, 'hls'),
    userAgent: 'ROOMS-Cinema/e2e',
    allowPrivateNetwork: true,
    vodWindowSec: 120,
    log: (line) => logs.push(line),
  });
  let server: Awaited<ReturnType<typeof createCinemaServer>>;
  const call = async (method: 'GET' | 'PUT' | 'POST', url: string, payload?: unknown) => {
    const response = await server.inject({
      method,
      url,
      headers: { authorization: 'Bearer t' },
      payload: payload as object,
    });
    return {
      status: response.statusCode,
      body: response.headers['content-type']?.includes('json') ? response.json() : null,
      raw: response.rawPayload,
    };
  };
  let item = 0;
  const open = (media: SharedMedia) =>
    send({ type: 'queue.add', itemId: `i${++item}`, media, start: true });
  /** Watches the hall's current item and saves the playlist with its media for ffprobe. */
  const watchAndProbe = async () => {
    const started = performance.now();
    const watch = await call('POST', '/v1/halls/hall/watch');
    const readyMs = Math.round(performance.now() - started);
    if (watch.status !== 200) return { watch, readyMs, streams: [] };
    const target = mkdtempSync(join(dir, 'probe-'));
    const playlist = (
      await call('GET', `/v1/relay/${watch.body.ticket}/index.m3u8`)
    ).raw.toString();
    writeFileSync(join(target, 'index.m3u8'), playlist);
    const names = [
      'init.mp4',
      ...playlist.split('\n').filter((line) => line && !line.startsWith('#')),
    ];
    for (const name of names)
      writeFileSync(
        join(target, name),
        (await call('GET', `/v1/relay/${watch.body.ticket}/${name}`)).raw,
      );
    const probe = JSON.parse(
      execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-of', 'json', 'index.m3u8'], {
        cwd: target,
        encoding: 'utf8',
      }),
    ) as {
      streams: {
        codec_type: string;
        codec_name: string;
        codec_tag_string: string;
        channels?: number;
      }[];
    };
    return { watch, readyMs, streams: probe.streams, playlist };
  };

  beforeAll(async () => {
    const files = new SecureFiles(randomBytes(32));
    const configs = new ConfigStore(dir, files);
    const importer = new Importer({ userAgent: 'ROOMS-Cinema/e2e', allowPrivateNetwork: true });
    const service = new CinemaService({
      configs,
      catalogs: new CatalogStore(dir, files),
      importer,
      relays,
      tickets: (claims) => issueTicket(claims, secret),
      activity: async () => ({
        protocolVersion: 1,
        serverTimeMs: Date.now(),
        room: room.snapshot,
        events: [],
        replayRequired: false,
      }),
      image: (url) => importer.image(url),
      maxRelays: 1,
      log: (line) => logs.push(line),
    });
    server = await createCinemaServer({
      service,
      configs,
      authority,
      registerRelay: (instance) => registerRelayRoutes(instance, { relays, ticketSecret: secret }),
    });
    await call('PUT', '/v1/communities/c1/hall', { channelId: 'hall' });
    const connected = await call('PUT', '/v1/communities/c1/source', {
      kind: 'xtream',
      server: mock,
      username: 'kanal',
      password: 'test123',
      guideUrl: '',
    });
    expect(connected.status).toBe(200);
    for (let i = 0; i < 300; i++) {
      const status = (await call('GET', '/v1/communities/c1')).body;
      if (!status.importing) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    send({ type: 'join' });
    send({ type: 'start', activity: 'hall', title: 'Sinema' });
  }, 120_000);

  afterAll(async () => {
    await server?.close();
    await relays.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('relays a live H.264/AAC channel', async () => {
    open({ kind: 'community-media', ref: 'l-1001', title: 'TRT 1', live: true });
    const result = await watchAndProbe();
    console.log(JSON.stringify({ channel: 'TRT 1', readyMs: result.readyMs }));
    expect(result.watch.body).toMatchObject({ live: true, itemRef: 'l-1001' });
    expect(result.playlist).toContain('#EXT-X-PROGRAM-DATE-TIME');
    expect(result.streams.find((s) => s.codec_type === 'video')?.codec_name).toBe('h264');
    expect(result.streams.find((s) => s.codec_type === 'audio')?.codec_name).toBe('aac');
  }, 60_000);

  it('turns AC-3 5.1 into stereo AAC and copies HEVC', async () => {
    open({ kind: 'community-media', ref: 'l-1002', title: 'Show TV', live: true });
    const ac3 = await watchAndProbe();
    expect(ac3.streams.find((s) => s.codec_type === 'audio')).toMatchObject({
      codec_name: 'aac',
      channels: 2,
    });
    open({ kind: 'community-media', ref: 'l-1003', title: 'UHD Test', live: true });
    const hevc = await watchAndProbe();
    console.log(JSON.stringify({ channel: 'UHD Test', readyMs: hevc.readyMs }));
    expect(hevc.streams.find((s) => s.codec_type === 'video')).toMatchObject({
      codec_name: 'hevc',
      codec_tag_string: 'hvc1',
    });
    expect(hevc.streams.find((s) => s.codec_type === 'audio')?.codec_name).toBe('aac');
    // One provider connection: switching channels replaced the previous relay.
    expect(relays.sessionsOf('c1')).toHaveLength(1);
  }, 90_000);

  it('refuses MPEG-2 with a clear code', async () => {
    open({ kind: 'community-media', ref: 'l-1004', title: 'Kanal D', live: true });
    const result = await watchAndProbe();
    expect(result.watch).toMatchObject({
      status: 415,
      body: { error: 'CINEMA_CODEC_UNSUPPORTED' },
    });
  }, 60_000);

  it('relays a movie and an episode from the shared timeline', async () => {
    open({ kind: 'community-media', ref: 'm-3001', title: 'Kış Uykusu', live: false });
    const movie = await watchAndProbe();
    expect(movie.watch.body).toMatchObject({ live: false, offsetSec: 0 });
    expect(movie.watch.body.durationSec).toBeGreaterThan(0);
    expect(movie.streams.find((s) => s.codec_type === 'audio')?.codec_name).toBe('aac');
    const details = await call('GET', '/v1/halls/hall/details/s-5001');
    const episode = details.body.seasons[0].episodes[0];
    open({ kind: 'community-media', ref: episode.ref, title: episode.title, live: false });
    const played = await watchAndProbe();
    expect(played.watch.status).toBe(200);
    expect(played.streams.find((s) => s.codec_type === 'video')).toBeTruthy();
  }, 90_000);

  it('never logs the account', () => {
    const text = logs.join('\n');
    expect(text).not.toContain('test123');
    expect(text).not.toContain('/live/kanal/');
  });
});
