import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ActivityCommand, ActivityResponse } from '../packages/activity-protocol/src/index';
import { applyCommand, emptyRoom } from '../apps/services/activities/engine';
import { ConfigStore } from '../apps/services/cinema/config-store';
import { Importer } from '../apps/services/cinema/importer';
import { SecureFiles } from '../apps/services/cinema/secure-file';
import { createCinemaServer } from '../apps/services/cinema/server';
import { CatalogStore, CinemaService, type RelayPort } from '../apps/services/cinema/service';
import type { CinemaAuthority } from '../apps/services/cinema/authority';
import {
  PROVIDER_PASSWORD,
  PROVIDER_USER,
  startProvider,
} from './fixtures/community-cinema-provider';

const COMMUNITY = 'community1';
const HALL = 'hallchannel';
const OTHER_CHANNEL = 'otherchannel';
const users: Record<string, { userId: string; isOwner: boolean; channels: string[] }> = {
  'owner-token': { userId: 'owner', isOwner: true, channels: [HALL, OTHER_CHANNEL] },
  'member-token': { userId: 'member', isOwner: false, channels: [HALL] },
  'outsider-token': { userId: 'outsider', isOwner: false, channels: [] },
};

const authority: CinemaAuthority = {
  async community(token, communityId) {
    const user = users[token];
    if (!user || communityId !== COMMUNITY || !user.channels.length) throw new Error('denied');
    return { userId: user.userId, displayName: user.userId, isOwner: user.isOwner };
  },
  async channel(token, channelId) {
    const user = users[token];
    if (!user?.channels.includes(channelId)) throw new Error('denied');
    return {
      userId: user.userId,
      displayName: user.userId,
      communityId: COMMUNITY,
      isOwner: user.isOwner,
    };
  },
  async close() {},
};

type Setup = Awaited<ReturnType<typeof setup>>;

async function setup() {
  const now = Date.now();
  const provider = await startProvider(now);
  const dir = mkdtempSync(join(tmpdir(), 'rooms-cinema-'));
  const files = new SecureFiles(randomBytes(32));
  const configs = new ConfigStore(dir, files);
  const catalogs = new CatalogStore(dir, files);
  const room = emptyRoom(HALL, now);
  const send = (userId: string, command: ActivityCommand) =>
    applyCommand(
      room,
      { userId, displayName: userId, canCreate: true, canControl: true },
      {
        protocolVersion: 1,
        commandId: randomUUID(),
        expectedRevision: room.snapshot.revision,
        command,
      },
      Date.now(),
    );
  const acquired: Parameters<RelayPort['acquire']>[0][] = [];
  const stopped: string[] = [];
  let sessions = 0;
  const running: Awaited<ReturnType<RelayPort['acquire']>>[] = [];
  const relays: RelayPort = {
    async acquire(input) {
      acquired.push(input);
      const info = {
        session: `s${++sessions}`,
        live: input.source.live,
        offsetSec: input.startSec ?? 0,
        epoch: sessions,
        durationSec: input.source.live ? null : 600,
        producedSec: 30,
        windowStartSec: 0,
      };
      // One slot: a new relay replaces the previous one.
      running.splice(0, running.length, info);
      return info;
    },
    sessionsOf: () => [...running],
    async stop(session) {
      stopped.push(session);
      running.splice(
        running.findIndex((info) => info.session === session),
        running.some((info) => info.session === session) ? 1 : 0,
      );
    },
    async stopCommunity(communityId) {
      stopped.push(communityId);
    },
  };
  const service = new CinemaService({
    configs,
    catalogs,
    importer: new Importer({ userAgent: 'ROOMS-Cinema/test', allowPrivateNetwork: true }),
    relays,
    tickets: (claims) => ({
      ticket: `ticket-${claims.session}-${claims.userId}`,
      expiresAt: Date.now() + 120_000,
    }),
    activity: async (): Promise<ActivityResponse> => ({
      protocolVersion: 1,
      serverTimeMs: Date.now(),
      room: room.snapshot,
      events: [],
      replayRequired: false,
    }),
    image: async () => ({ body: Buffer.from('png'), type: 'image/png' }),
    maxRelays: 1,
  });
  const server = await createCinemaServer({ service, configs, authority });
  const call = async (
    method: 'GET' | 'PUT' | 'POST' | 'DELETE',
    url: string,
    token: string,
    payload?: unknown,
  ) => {
    const response = await server.inject({
      method,
      url,
      headers: { authorization: `Bearer ${token}` },
      payload: payload as object,
    });
    return { status: response.statusCode, body: response.json(), raw: response.body };
  };
  const waitImport = async () => {
    for (let i = 0; i < 200; i++) {
      const status = (await call('GET', `/v1/communities/${COMMUNITY}`, 'owner-token')).body;
      if (!status.importing || status.importing.step === 'failed') return status;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error('import did not finish');
  };
  const connect = async () => {
    await call('PUT', `/v1/communities/${COMMUNITY}/hall`, 'owner-token', { channelId: HALL });
    const result = await call('PUT', `/v1/communities/${COMMUNITY}/source`, 'owner-token', {
      kind: 'xtream',
      server: `${provider.url}/`,
      username: PROVIDER_USER,
      password: PROVIDER_PASSWORD,
      guideUrl: null,
    });
    expect(result.status).toBe(200);
    return waitImport();
  };
  return {
    provider,
    dir,
    server,
    call,
    connect,
    waitImport,
    send,
    room,
    acquired,
    stopped,
    service,
    catalogs,
  };
}

describe('community cinema service', () => {
  let s: Setup;
  beforeEach(async () => {
    s = await setup();
  });
  afterEach(async () => {
    await s.server.close();
    await s.provider.close();
    rmSync(s.dir, { recursive: true, force: true });
  });

  it('lets only the owner connect, and verifies the account first', async () => {
    const denied = await s.call('PUT', `/v1/communities/${COMMUNITY}/source`, 'member-token', {
      kind: 'xtream',
      server: s.provider.url,
      username: PROVIDER_USER,
      password: PROVIDER_PASSWORD,
      guideUrl: null,
    });
    expect(denied).toMatchObject({ status: 403, body: { error: 'CINEMA_OWNER_REQUIRED' } });
    const wrong = await s.call('PUT', `/v1/communities/${COMMUNITY}/source`, 'owner-token', {
      kind: 'xtream',
      server: s.provider.url,
      username: PROVIDER_USER,
      password: 'nope',
      guideUrl: null,
    });
    expect(wrong).toMatchObject({ status: 422, body: { error: 'CINEMA_PROVIDER_DENIED' } });
    expect((await s.call('GET', `/v1/communities/${COMMUNITY}`, 'outsider-token')).status).toBe(
      403,
    );
  });

  it('imports channels, movies, series and the guide', async () => {
    const status = await s.connect();
    expect(status).toMatchObject({
      hallChannelId: HALL,
      connected: true,
      account: { maxConnections: 2, status: 'Active' },
      catalog: { live: 3, movies: 2, series: 1, programmes: 3 },
      relaySlots: 1,
    });
    expect(status.source.label).toMatch(/^http:\/\/127\*\*\*:\d+$/);
    const memberView = (await s.call('GET', `/v1/communities/${COMMUNITY}`, 'member-token')).body;
    expect(memberView).toMatchObject({
      connected: true,
      isOwner: false,
      source: null,
      account: null,
    });
    expect(memberView.catalog.live).toBe(3);
    const categories = (
      await s.call('GET', `/v1/halls/${HALL}/categories?kind=live`, 'member-token')
    ).body;
    expect(categories).toEqual([
      expect.objectContaining({ label: 'Ulusal', flag: '🇹🇷', count: 2 }),
      expect.objectContaining({ label: 'Spor', flag: null, count: 1 }),
    ]);
    const live = (
      await s.call('GET', `/v1/halls/${HALL}/items?kind=live&sort=name`, 'member-token')
    ).body;
    expect(
      live.items.map((item: { title: string; badges: string[] }) => [item.title, item.badges]),
    ).toEqual([
      ['Show TV', ['FHD']],
      ['Sıcak Spor', ['4K']],
      ['TR: TRT 1', ['HD']],
    ]);
    const guide = (
      await s.call('POST', `/v1/halls/${HALL}/guide`, 'member-token', {
        refs: ['l-1001', 'l-1002'],
        from: Date.now() - 3600_000,
        to: Date.now() + 6 * 3600_000,
      })
    ).body;
    expect(guide['l-1001'].map((p: { title: string }) => p.title)).toEqual([
      'Ana Haber',
      'Gönül Dağı',
    ]);
    expect(guide['l-1001'][0].description).toBe('Günün özeti & hava durumu');
    // Show TV has no tvg id; it is matched by its display name.
    expect(guide['l-1002'].map((p: { title: string }) => p.title)).toEqual(['Kızılcık Şerbeti']);
  });

  it('keeps a catalog import successful when the provider has no guide', async () => {
    await s.call('PUT', `/v1/communities/${COMMUNITY}/hall`, 'owner-token', { channelId: HALL });
    await s.call('PUT', `/v1/communities/${COMMUNITY}/source`, 'owner-token', {
      kind: 'xtream',
      server: `${s.provider.url}/`,
      username: PROVIDER_USER,
      password: PROVIDER_PASSWORD,
      guideUrl: `${s.provider.url}/no-guide.xml`,
    });
    const status = await s.waitImport();
    expect(status.importing).toBeNull();
    expect(status.catalog).toMatchObject({ live: 3, movies: 2, series: 1, programmes: 0 });
    // Asking for the guide alone still says it failed.
    await s.call('POST', `/v1/communities/${COMMUNITY}/reload`, 'owner-token', { scope: 'guide' });
    const guideOnly = await s.waitImport();
    expect(guideOnly.importing).toMatchObject({
      step: 'failed',
      error: 'CINEMA_PROVIDER_UNREACHABLE',
    });
  });

  it('searches Turkish titles and current programmes', async () => {
    await s.connect();
    const search = async (q: string) =>
      (
        await s.call('GET', `/v1/halls/${HALL}/search?q=${encodeURIComponent(q)}`, 'member-token')
      ).body.map((item: { ref: string }) => item.ref);
    expect(await search('kis uyku')).toEqual(['m-3001']);
    expect(await search('SICAK')).toEqual(['l-1003', 's-5001']);
    expect(await search('kızılcık')).toEqual(['l-1002']);
    expect(await search('HD')).toEqual([]);
  });

  it('loads series episodes and movie details lazily', async () => {
    await s.connect();
    const series = (await s.call('GET', `/v1/halls/${HALL}/details/s-5001`, 'member-token')).body;
    expect(series.plot).toBe('Bir virüs…');
    expect(series.seasons).toEqual([
      {
        season: 1,
        episodes: [
          expect.objectContaining({ ref: 'e-77001', durationSec: 2700 }),
          expect.objectContaining({ ref: 'e-77002' }),
        ],
      },
    ]);
    const movie = (await s.call('GET', `/v1/halls/${HALL}/details/m-3001`, 'member-token')).body;
    expect(movie).toMatchObject({
      plot: 'Kapadokya’da bir otel.',
      durationSec: 11760,
      director: 'Nuri Bilge Ceylan',
      item: { year: 2014, rating: 8.1 },
    });
  });

  it('lets whoever holds the remote switch the hall’s audio stream', async () => {
    await s.connect();
    s.send('member', { type: 'join' });
    s.send('member', { type: 'start', activity: 'hall', title: 'Sinema' });
    s.send('member', {
      type: 'queue.add',
      itemId: 'a',
      media: { kind: 'community-media', ref: 'l-1001', title: 'TRT 1', live: true },
      start: true,
    });
    await s.call('POST', `/v1/halls/${HALL}/watch`, 'member-token');
    expect(s.acquired[0]).toMatchObject({ key: `${COMMUNITY}:l-1001`, audio: null });
    // The owner never joined the hall's activity, so the remote is not theirs.
    const denied = await s.call('POST', `/v1/halls/${HALL}/audio`, 'owner-token', {
      ref: 'l-1001',
      track: 1,
    });
    expect(denied.body).toEqual({ error: 'CINEMA_ACCESS_DENIED' });
    const wrongItem = await s.call('POST', `/v1/halls/${HALL}/audio`, 'member-token', {
      ref: 'l-1002',
      track: 1,
    });
    expect(wrongItem.body).toEqual({ error: 'CINEMA_NOTHING_SELECTED' });
    const chosen = await s.call('POST', `/v1/halls/${HALL}/audio`, 'member-token', {
      ref: 'l-1001',
      track: 1,
    });
    expect(chosen.body).toEqual({ audioTrack: 1 });
    expect(s.stopped).toContain('s1');
    await s.call('POST', `/v1/halls/${HALL}/watch`, 'member-token');
    expect(s.acquired[1]).toMatchObject({ key: `${COMMUNITY}:l-1001#a1`, audio: 1 });
  });

  it('relays only the hall’s selected item and never exposes the account', async () => {
    await s.connect();
    expect((await s.call('POST', `/v1/halls/${HALL}/watch`, 'member-token')).body).toEqual({
      error: 'CINEMA_NOTHING_SELECTED',
    });
    s.send('member', { type: 'join' });
    s.send('member', { type: 'start', activity: 'hall', title: 'Sinema' });
    s.send('member', {
      type: 'queue.add',
      itemId: 'a',
      media: { kind: 'community-media', ref: 'l-1001', title: 'TRT 1', live: true },
      start: true,
    });
    const watch = await s.call('POST', `/v1/halls/${HALL}/watch`, 'member-token');
    expect(watch.body).toMatchObject({
      session: 's1',
      ticket: 'ticket-s1-member',
      live: true,
      offsetSec: 0,
    });
    expect(s.acquired[0]).toMatchObject({
      communityId: COMMUNITY,
      key: `${COMMUNITY}:l-1001`,
      slots: 1,
    });
    expect(s.acquired[0].source.url).toBe(
      `${s.provider.url}/live/${PROVIDER_USER}/${PROVIDER_PASSWORD}/1001.ts`,
    );

    s.send('member', {
      type: 'queue.add',
      itemId: 'b',
      media: { kind: 'community-media', ref: 'e-77002', title: 'Bölüm 2', live: false },
      start: true,
    });
    await s.call('GET', `/v1/halls/${HALL}/details/s-5001`, 'member-token');
    const episode = await s.call('POST', `/v1/halls/${HALL}/watch`, 'member-token');
    expect(episode.body).toMatchObject({ live: false, offsetSec: 0 });
    expect(s.acquired[1].source.url).toBe(
      `${s.provider.url}/series/${PROVIDER_USER}/${PROVIDER_PASSWORD}/77002.mp4`,
    );
    expect(s.acquired[1].key).toBe(`${COMMUNITY}:e-77002@0`);

    const outsider = await s.call('POST', `/v1/halls/${HALL}/watch`, 'outsider-token');
    expect(outsider.body).toEqual({ error: 'CINEMA_ACCESS_DENIED' });
    const notHall = await s.call(
      'GET',
      `/v1/halls/${OTHER_CHANNEL}/categories?kind=live`,
      'owner-token',
    );
    expect(notHall.body).toEqual({ error: 'CINEMA_HALL_REQUIRED' });

    for (const response of [
      (await s.call('GET', `/v1/communities/${COMMUNITY}`, 'owner-token')).raw,
      (await s.call('GET', `/v1/halls/${HALL}/items?kind=live`, 'member-token')).raw,
      (await s.call('GET', `/v1/halls/${HALL}/details/m-3001`, 'member-token')).raw,
      watch.raw,
    ]) {
      expect(response).not.toContain(PROVIDER_PASSWORD);
      expect(response).not.toContain(PROVIDER_USER);
      expect(response).not.toContain('img.provider');
    }
  });

  it('stores the account and catalog encrypted, and wipes them on disconnect', async () => {
    await s.connect();
    await s.catalogs.settled();
    const files = readdirSync(join(s.dir, 'communities')).map((name) =>
      join(s.dir, 'communities', name),
    );
    files.push(join(s.dir, 'catalogs', `${COMMUNITY}.enc`));
    for (const file of files) {
      const raw = readFileSync(file);
      expect(raw.includes(PROVIDER_PASSWORD)).toBe(false);
      expect(raw.includes('TRT')).toBe(false);
    }
    const status = (await s.call('DELETE', `/v1/communities/${COMMUNITY}/source`, 'owner-token'))
      .body;
    expect(status).toMatchObject({ connected: false, hallChannelId: HALL, catalog: { live: 0 } });
    expect(s.stopped).toContain(COMMUNITY);
    expect(readdirSync(join(s.dir, 'catalogs'))).toEqual([]);
    expect((await s.call('GET', `/v1/halls/${HALL}/items?kind=live`, 'member-token')).body).toEqual(
      { error: 'CINEMA_NOT_CONNECTED' },
    );
  });

  it('turns an M3U export link into an Xtream account', async () => {
    await s.call('PUT', `/v1/communities/${COMMUNITY}/hall`, 'owner-token', { channelId: HALL });
    const result = await s.call('PUT', `/v1/communities/${COMMUNITY}/source`, 'owner-token', {
      kind: 'm3u',
      url: `${s.provider.url}/get.php?username=${PROVIDER_USER}&password=${PROVIDER_PASSWORD}&type=m3u_plus`,
      guideUrl: null,
    });
    expect(result.body.source.kind).toBe('xtream');
    expect((await s.waitImport()).catalog.live).toBe(3);
  });
});

describe('cached authority', () => {
  it('reuses successful answers for a short time and never caches failures', async () => {
    const { cachedAuthority } = await import('../apps/services/cinema/authority');
    let calls = 0;
    let deny = false;
    const cached = cachedAuthority(
      {
        community: async () => ({ userId: 'u', displayName: 'u', isOwner: false }),
        channel: async (token) => {
          calls++;
          if (deny || token === 'bad') throw new Error('denied');
          return { userId: 'u', displayName: 'u', communityId: 'c', isOwner: false };
        },
        close: async () => {},
      },
      50,
    );
    await cached.channel('t', 'h');
    await cached.channel('t', 'h');
    expect(calls).toBe(1);
    await expect(cached.channel('bad', 'h')).rejects.toThrow();
    await expect(cached.channel('bad', 'h')).rejects.toThrow();
    expect(calls).toBe(3);
    deny = true;
    await new Promise((resolve) => setTimeout(resolve, 60));
    await expect(cached.channel('t', 'h')).rejects.toThrow();
  });
});

describe('ticket renewal', () => {
  let s: Setup;
  beforeEach(async () => {
    s = await setup();
  });
  afterEach(async () => {
    await s.server.close();
    await s.provider.close();
    rmSync(s.dir, { recursive: true, force: true });
  });

  it('renews a running session without a new relay, and ends it once the hall moves on', async () => {
    await s.connect();
    s.send('member', { type: 'join' });
    s.send('member', { type: 'start', activity: 'hall', title: 'Sinema' });
    s.send('member', {
      type: 'queue.add',
      itemId: 'a',
      media: { kind: 'community-media', ref: 'l-1001', title: 'TRT 1', live: true },
      start: true,
    });
    const watch = (await s.call('POST', `/v1/halls/${HALL}/watch`, 'member-token')).body;
    const renewed = await s.service.renew('member-token', HALL, COMMUNITY, 'member', watch.session);
    expect(renewed).toMatchObject({ ticket: `ticket-${watch.session}-member` });
    expect(renewed.ttlMs).toBeGreaterThan(0);
    expect(s.acquired).toHaveLength(1);
    s.send('member', {
      type: 'queue.add',
      itemId: 'b',
      media: { kind: 'community-media', ref: 'l-1002', title: 'Show TV', live: true },
      start: true,
    });
    await expect(
      s.service.renew('member-token', HALL, COMMUNITY, 'member', watch.session),
    ).rejects.toThrow('CINEMA_SESSION_ENDED');
    const route = await s.call(
      'POST',
      `/v1/halls/${HALL}/sessions/0123456789abcdef0123456789abcdef/ticket`,
      'member-token',
    );
    expect(route).toMatchObject({ status: 410, body: { error: 'CINEMA_SESSION_ENDED' } });
  });
});
