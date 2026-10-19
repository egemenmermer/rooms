import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ActivityCommand, ActivityResponse } from '../packages/activity-protocol/src/index';
import { applyCommand, emptyRoom } from '../apps/services/activities/engine';
import { ConfigStore } from '../apps/services/cinema/config-store';
import { CinemaError, Importer } from '../apps/services/cinema/importer';
import { SecureFiles } from '../apps/services/cinema/secure-file';
import { createCinemaServer } from '../apps/services/cinema/server';
import { Rmdb, RmdbStore } from '../apps/services/cinema/rmdb';
import {
  CatalogStore,
  CinemaService,
  type RelayPort,
  type SubtitlePort,
} from '../apps/services/cinema/service';
import type { SubtitleCandidate, SubtitleQuery } from '../apps/services/cinema/subtitles';
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
  const clock = { offsetMs: 0 };
  const subtitleResults: SubtitleCandidate[][] = [];
  const subtitleCalls = {
    verify: [] as string[],
    search: [] as (SubtitleQuery & { key: string })[],
    download: [] as string[],
  };
  const subtitles: SubtitlePort = {
    async verify(key) {
      subtitleCalls.verify.push(key);
      if (key === 'wrong-subdl-key') throw new CinemaError('CINEMA_SUBTITLE_KEY_INVALID');
    },
    async search(key, query) {
      subtitleCalls.search.push({ ...query, key });
      const queued = subtitleResults.shift();
      if (queued) return queued;
      return [
        {
          id: '3197651-3213944',
          label: 'Türkçe · WEB-DL',
          language: 'tur',
          release: 'WEB-DL',
          hearingImpaired: false,
        },
      ];
    },
    async download(id, episode) {
      subtitleCalls.download.push(episode ? `${id}@${episode.season}x${episode.episode}` : id);
      return 'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nMerhaba\n\n';
    },
  };
  const rmdb = new Rmdb(new RmdbStore(dir, files), () => Date.now() + clock.offsetMs);
  const service = new CinemaService({
    subtitles,
    rmdb,
    now: () => Date.now() + clock.offsetMs,
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
    subtitleCalls,
    subtitleResults,
    clock,
    rmdb,
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

describe('community cinema online subtitles', () => {
  let s: Setup;
  beforeEach(async () => {
    s = await setup();
  });
  afterEach(async () => {
    await s.server.close();
    await s.provider.close();
    rmSync(s.dir, { recursive: true, force: true });
  });
  const KEY = 'subdl-owner-key-123';

  it('keeps the SubDL key on the server and lets only the owner change it', async () => {
    await s.connect();
    const path = `/v1/communities/${COMMUNITY}/subtitles`;
    expect((await s.call('PUT', path, 'member-token', { key: KEY })).status).toBe(403);
    const wrong = await s.call('PUT', path, 'owner-token', { key: 'wrong-subdl-key' });
    expect(wrong).toMatchObject({ status: 422, body: { error: 'CINEMA_SUBTITLE_KEY_INVALID' } });
    expect((await s.call('PUT', path, 'owner-token', { key: 'kısa' })).status).toBe(400);
    const saved = await s.call('PUT', path, 'owner-token', { key: KEY });
    expect(saved.body.subtitleSearch).toBe(true);
    const member = await s.call('GET', `/v1/communities/${COMMUNITY}`, 'member-token');
    expect(member.body.subtitleSearch).toBe(true);
    expect(saved.raw + member.raw).not.toContain(KEY);
    for (const name of readdirSync(join(s.dir, 'communities')))
      expect(readFileSync(join(s.dir, 'communities', name)).includes(KEY)).toBe(false);
    const removed = await s.call('PUT', path, 'owner-token', { key: null });
    expect(removed.body.subtitleSearch).toBe(false);
  });

  it('says when there is no key, then searches by TMDB id and downloads once', async () => {
    await s.connect();
    const list = `/v1/halls/${HALL}/subtitles/m-3001`;
    expect((await s.call('GET', list, 'member-token')).body).toEqual({
      available: false,
      subtitles: [],
    });
    await s.call('PUT', `/v1/communities/${COMMUNITY}/subtitles`, 'owner-token', { key: KEY });
    const found = await s.call('GET', list, 'member-token');
    expect(found.body).toEqual({
      available: true,
      subtitles: [
        {
          id: '3197651-3213944',
          label: 'Türkçe · WEB-DL',
          language: 'tur',
          hearingImpaired: false,
        },
      ],
    });
    await s.call('GET', list, 'member-token');
    expect(s.subtitleCalls.search).toEqual([
      { kind: 'movie', tmdbId: '1001001', name: 'Kış Uykusu', year: 2014, key: KEY },
    ]);
    const file = await s.server.inject({
      method: 'GET',
      url: `${list}/3197651-3213944`,
      headers: { authorization: 'Bearer member-token' },
    });
    expect(file.statusCode).toBe(200);
    expect(file.headers['content-type']).toBe('text/vtt; charset=utf-8');
    expect(file.body).toContain('Merhaba');
    await s.server.inject({
      method: 'GET',
      url: `${list}/3197651-3213944`,
      headers: { authorization: 'Bearer owner-token' },
    });
    expect(s.subtitleCalls.download).toEqual(['3197651-3213944']);
    expect((await s.call('GET', `${list}/9999-1`, 'member-token')).status).toBe(404);
    expect((await s.call('GET', list, 'outsider-token')).status).toBe(403);
    expect((await s.call('GET', `/v1/halls/${HALL}/subtitles/l-1001`, 'member-token')).status).toBe(
      404,
    );
  });

  it('asks again after ten minutes when a search found nothing', async () => {
    await s.connect();
    await s.call('PUT', `/v1/communities/${COMMUNITY}/subtitles`, 'owner-token', { key: KEY });
    const list = `/v1/halls/${HALL}/subtitles/m-3001`;
    s.subtitleResults.push([]);
    expect((await s.call('GET', list, 'member-token')).body.subtitles).toEqual([]);
    s.clock.offsetMs = 9 * 60_000;
    expect((await s.call('GET', list, 'member-token')).body.subtitles).toEqual([]);
    expect(s.subtitleCalls.search).toHaveLength(1);
    s.clock.offsetMs = 11 * 60_000;
    expect((await s.call('GET', list, 'member-token')).body.subtitles).toHaveLength(1);
    expect(s.subtitleCalls.search).toHaveLength(2);
    // Found lists stay for hours.
    s.clock.offsetMs = 3 * 3600_000;
    await s.call('GET', list, 'member-token');
    expect(s.subtitleCalls.search).toHaveLength(2);
  });

  it("asks a film's own info for a TMDB id it lacks, and searches episodes by series", async () => {
    await s.connect();
    await s.call('PUT', `/v1/communities/${COMMUNITY}/subtitles`, 'owner-token', { key: KEY });
    await s.call('GET', `/v1/halls/${HALL}/subtitles/m-3002`, 'member-token');
    expect(s.subtitleCalls.search.at(-1)).toMatchObject({ kind: 'movie', tmdbId: '2002002' });
    const series = await s.call('GET', `/v1/halls/${HALL}/details/s-5001`, 'member-token');
    const episode = series.body.seasons[0].episodes[0].ref as string;
    await s.call('GET', `/v1/halls/${HALL}/subtitles/${episode}`, 'member-token');
    expect(s.subtitleCalls.search.at(-1)).toMatchObject({
      kind: 'tv',
      tmdbId: '5005005',
      season: 1,
      episode: 1,
    });
    await s.server.inject({
      method: 'GET',
      url: `/v1/halls/${HALL}/subtitles/${episode}/3197651-3213944`,
      headers: { authorization: 'Bearer member-token' },
    });
    expect(s.subtitleCalls.download.at(-1)).toBe('3197651-3213944@1x1');
  });
});

describe('RMDB in the cinema service', () => {
  let s: Setup;
  beforeEach(async () => {
    s = await setup();
    await s.connect();
    s.send('member', { type: 'join' });
    s.send('member', { type: 'start', activity: 'hall', title: 'Sinema' });
  });
  afterEach(async () => {
    await s.server.close();
    await s.provider.close();
    rmSync(s.dir, { recursive: true, force: true });
  });

  const rmdb = (
    method: 'GET' | 'PUT' | 'POST' | 'DELETE',
    path: string,
    token = 'member-token',
    body?: unknown,
  ) => s.call(method, `/v1/halls/${HALL}/rmdb${path}`, token, body);
  /** The hall plays `ref` from `from` for `seconds`; each viewer's player asks to watch. */
  const playFor = async (seconds: number, from: number, tokens = ['member-token']) => {
    s.clock.offsetMs += seconds * 1000;
    s.send('member', { type: 'playback', playing: true, positionSec: from + seconds, rate: 1 });
    for (const token of tokens) {
      const watch = await s.call('POST', `/v1/halls/${HALL}/watch`, token);
      expect(watch.status).toBe(200);
    }
  };

  it('logs what the hall watched and keeps it, with its poster, after the account is removed', async () => {
    s.send('member', {
      type: 'queue.add',
      itemId: 'f1',
      media: { kind: 'community-media', ref: 'm-3001', title: 'Kış Uykusu', live: false },
      start: true,
    });
    await s.call('POST', `/v1/halls/${HALL}/watch`, 'member-token');
    await playFor(200, 0, ['member-token', 'owner-token']);
    expect((await rmdb('GET', '')).body).toEqual([]);
    await playFor(200, 200);
    const [work] = (await rmdb('GET', '')).body;
    expect(work).toMatchObject({ kind: 'movie', watchCount: 1, progress: { finished: false } });
    expect(work.progress.positionSec).toBeGreaterThanOrEqual(399);
    // A ticket renewal is one more look at the hall.
    const current = await s.call('POST', `/v1/halls/${HALL}/watch`, 'member-token');
    s.clock.offsetMs += 120_000;
    s.send('member', { type: 'playback', playing: true, positionSec: 520, rate: 1 });
    await s.service.renew('member-token', HALL, COMMUNITY, 'member', current.body.session);
    expect((await rmdb('GET', '')).body[0].progress.positionSec).toBeGreaterThanOrEqual(519);
    const details = (await rmdb('GET', `/${work.id}`, 'owner-token')).body;
    expect(details.diary[0].viewers.map((v: { userId: string }) => v.userId).sort()).toEqual([
      'member',
      'owner',
    ]);
    expect(details.resume).toMatchObject({ ref: 'm-3001', positionSec: expect.any(Number) });
    expect(details.resume.positionSec).toBeGreaterThan(390);
    // Wait for the artwork copy the hall's first log started.
    for (let i = 0; i < 100 && !s.rmdb.store.hasArt(COMMUNITY, work.art); i++)
      await new Promise((resolve) => setTimeout(resolve, 10));
    expect(s.rmdb.store.hasArt(COMMUNITY, work.art)).toBe(true);

    await s.call('DELETE', `/v1/communities/${COMMUNITY}/source`, 'owner-token');
    const kept = await rmdb('GET', `/${work.id}`);
    expect(kept.status).toBe(200);
    expect(kept.body).toMatchObject({ id: work.id, title: work.title, resume: null });
    const poster = await s.server.inject({
      method: 'GET',
      url: `/v1/halls/${HALL}/art/${work.art}`,
      headers: { authorization: 'Bearer member-token' },
    });
    expect(poster.statusCode).toBe(200);
    expect(poster.body).toBe('png');
    expect(s.rmdb.store.readArt(COMMUNITY, work.art)?.body.toString()).toBe('png');
    // Without the account a title cannot be added, but reviews still work.
    expect((await rmdb('POST', '', 'member-token', { ref: 'm-3002' })).body).toEqual({
      error: 'CINEMA_NOT_CONNECTED',
    });
    const reviewed = await rmdb('PUT', `/${work.id}/review`, 'member-token', {
      rating: 9,
      text: 'Hâlâ burada',
      spoiler: false,
      liked: true,
    });
    expect(reviewed.body).toMatchObject({ averageRating: 9, mine: { rating: 9, liked: true } });
  });

  it('adds titles by hand, shares İzlenecekler and resumes series where the hall stopped', async () => {
    const added = await rmdb('POST', '', 'member-token', { ref: 'm-3001', watchlist: true });
    expect(added.status).toBe(200);
    expect(added.body).toMatchObject({
      kind: 'movie',
      onWatchlist: true,
      watchlist: { by: { userId: 'member' } },
      resume: { ref: 'm-3001', positionSec: 0, episode: null },
    });
    const again = await rmdb('POST', '', 'owner-token', { ref: 'm-3001' });
    expect(again.body.id).toBe(added.body.id);
    expect((await rmdb('POST', '', 'member-token', { ref: 'l-1001' })).body).toEqual({
      error: 'CINEMA_ITEM_NOT_FOUND',
    });
    expect((await rmdb('POST', '', 'member-token', { ref: 'e-77001' })).body).toEqual({
      error: 'CINEMA_ITEM_NOT_FOUND',
    });

    s.send('member', {
      type: 'queue.add',
      itemId: 'e1',
      media: {
        kind: 'community-media',
        ref: 'e-77001',
        title: 'Sıcak Kafa · 1. Sezon 1. Bölüm',
        live: false,
      },
      start: true,
    });
    await s.call('GET', `/v1/halls/${HALL}/details/s-5001`, 'member-token');
    await s.call('POST', `/v1/halls/${HALL}/watch`, 'member-token');
    await playFor(320, 0);
    const series = (await rmdb('GET', '')).body.find((w: { kind: string }) => w.kind === 'series');
    expect(series.progress.episode).toMatchObject({ season: 1, episode: 1 });
    let details = (await rmdb('GET', `/${series.id}`)).body;
    expect(details.resume).toMatchObject({
      ref: 'e-77001',
      positionSec: 315,
      episode: { season: 1, episode: 1 },
    });
    expect(details.diary[0]).toMatchObject({ source: 'hall', finished: false, positionSec: 320 });
    expect(details.resume.title).toBe('Sıcak Kafa · 1. Sezon 1. Bölüm');
    // The fake relay reports 600 s: past 90 % the next episode is offered from the start.
    await playFor(240, 320);
    details = (await rmdb('GET', `/${series.id}`)).body;
    expect(details.progress.finished).toBe(true);
    expect(details.resume).toMatchObject({
      ref: 'e-77002',
      positionSec: 0,
      episode: { season: 1, episode: 2 },
    });
    expect(details.episodes).toEqual([
      expect.objectContaining({ season: 1, episode: 1, finished: true }),
    ]);
  });

  it('checks who may change what', async () => {
    const work = (await rmdb('POST', '', 'member-token', { ref: 'm-3001' })).body;
    expect((await rmdb('GET', '', 'outsider-token')).body).toEqual({
      error: 'CINEMA_ACCESS_DENIED',
    });
    expect((await s.call('GET', `/v1/halls/${OTHER_CHANNEL}/rmdb`, 'owner-token')).body).toEqual({
      error: 'CINEMA_HALL_REQUIRED',
    });
    const invalid = await rmdb('PUT', `/${work.id}/review`, 'member-token', {
      rating: 11,
      text: '',
      spoiler: false,
      liked: false,
    });
    expect(invalid).toMatchObject({ status: 400, body: { error: 'CINEMA_RMDB_INVALID' } });
    expect((await rmdb('PUT', `/${work.id}/review`, 'member-token', { rating: 4 })).body).toEqual({
      error: 'CINEMA_RMDB_INVALID',
    });
    await rmdb('PUT', `/${work.id}/review`, 'member-token', {
      rating: 4,
      text: 'Sonu belli',
      spoiler: true,
      liked: false,
    });
    // Members cannot remove each other's reviews or works; the owner can.
    expect((await rmdb('DELETE', `/${work.id}/reviews/member`, 'member-token')).body).toEqual({
      error: 'CINEMA_OWNER_REQUIRED',
    });
    expect((await rmdb('DELETE', `/${work.id}`, 'member-token')).body).toEqual({
      error: 'CINEMA_OWNER_REQUIRED',
    });
    const removedReview = await rmdb('DELETE', `/${work.id}/reviews/member`, 'owner-token');
    expect(removedReview.body).toMatchObject({ reviews: [], ratingCount: 0 });
    const logged = await rmdb('POST', `/${work.id}/diary`, 'member-token', {});
    expect(logged.body.diary[0]).toMatchObject({
      source: 'manual',
      loggedBy: { userId: 'member' },
    });
    expect(
      (await rmdb('DELETE', `/${work.id}/diary/${logged.body.diary[0].id}`, 'owner-token')).body
        .diary,
    ).toEqual([]);
    expect((await rmdb('DELETE', `/${work.id}`, 'owner-token')).body).toEqual({ removed: true });
    expect((await rmdb('GET', `/${work.id}`)).body).toEqual({ error: 'CINEMA_RMDB_NOT_FOUND' });
    // Nothing in any answer gives the provider account away.
    expect((await rmdb('GET', '', 'owner-token')).raw).not.toContain(PROVIDER_USER);
  });
});
