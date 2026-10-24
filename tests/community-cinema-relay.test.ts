import { EventEmitter } from 'node:events';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, request as httpRequest, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import type { ChildProcess, SpawnOptions } from 'node:child_process';
import Fastify from 'fastify';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { issueTicket, verifyTicket } from '../apps/services/cinema/tickets';
import {
  allowedInputFormat,
  audioLabel,
  INPUT_FORMATS,
  pickAudio,
  playlistSegments,
  probeArgs,
  relayArgs,
  RelayManager,
  type ProbeResult,
} from '../apps/services/cinema/relay';
import { singleVariant, UpstreamProxy } from '../apps/services/cinema/upstream-proxy';
import { registerRelayRoutes } from '../apps/services/cinema/relay-routes';
import { privateFetch } from '../packages/personal-media/src/network';

const secret = Buffer.alloc(32, 7);
const session = 'a'.repeat(32);

describe('relay tickets', () => {
  it('binds a session, a member and a hall until it expires', () => {
    const { ticket, expiresAt } = issueTicket(
      { session, userId: 'U1', hallId: 'H1' },
      secret,
      1000,
      5000,
    );
    expect(expiresAt).toBe(6000);
    expect(verifyTicket(ticket, secret, 5999)).toEqual({
      session,
      userId: 'U1',
      hallId: 'H1',
      exp: 6000,
    });
    expect(verifyTicket(ticket, secret, 6000)).toBeNull();
  });

  it('rejects tampering, other secrets and malformed claims', () => {
    const { ticket } = issueTicket({ session, userId: 'U1', hallId: 'H1' }, secret);
    const [payload, signature] = ticket.split('.');
    const forged = Buffer.from(
      JSON.stringify({ s: 'b'.repeat(32), u: 'U1', h: 'H1', e: Date.now() + 60_000 }),
    ).toString('base64url');
    expect(verifyTicket(`${forged}.${signature}`, secret)).toBeNull();
    const flipped = signature[0] === 'A' ? 'B' : 'A';
    expect(verifyTicket(`${payload}.${flipped}${signature.slice(1)}`, secret)).toBeNull();
    expect(verifyTicket(ticket, Buffer.alloc(32, 8))).toBeNull();
    expect(verifyTicket('nonsense', secret)).toBeNull();
    expect(verifyTicket(`${'a'.repeat(2000)}.${signature}`, secret)).toBeNull();
    expect(() => issueTicket({ session: '../x', userId: 'U1', hallId: 'H1' }, secret)).toThrow();
  });
});

describe('relay arguments and playlists', () => {
  const probe: ProbeResult = { format: 'mpegts', video: 'hevc', audio: 'ac3', durationSec: null };

  it('copies video, converts audio and never names a provider', () => {
    const live = relayArgs({
      url: 'http://127.0.0.1:1/x',
      live: true,
      startSec: 0,
      probe,
      startNumber: 0,
      vodWindowSec: 180,
      discontinuity: false,
    });
    expect(live.join(' ')).toContain('-c:v copy -tag:v hvc1');
    expect(live.join(' ')).toContain('-c:a aac -ac 2 -ar 48000 -b:a 192k');
    expect(live.join(' ')).toContain('-hls_segment_type fmp4');
    expect(live[live.indexOf('-hls_list_size') + 1]).toBe('8');
    expect(live[live.indexOf('-hls_flags') + 1]).toContain('program_date_time');
    expect(live).not.toContain('-readrate');
    const vod = relayArgs({
      url: 'http://127.0.0.1:1/x',
      live: false,
      startSec: 125.5,
      probe: { ...probe, video: 'h264' },
      startNumber: 4,
      vodWindowSec: 180,
      discontinuity: true,
    });
    expect(vod).not.toContain('-tag:v');
    expect(vod.join(' ')).toContain('-readrate 1 -readrate_initial_burst 15');
    expect(vod[vod.indexOf('-ss') + 1]).toBe('125.500');
    expect(vod.indexOf('-ss')).toBeLessThan(vod.indexOf('-i'));
    expect(vod[vod.indexOf('-hls_list_size') + 1]).toBe('90');
    expect(vod[vod.indexOf('-hls_flags') + 1]).toBe(
      'delete_segments+independent_segments+temp_file+program_date_time+discont_start',
    );
    expect(vod[vod.indexOf('-start_number') + 1]).toBe('4');
  });

  it('opens only known media containers in ffmpeg and ffprobe', () => {
    const allowed = INPUT_FORMATS.join(',');
    const ffmpeg = relayArgs({
      url: 'http://127.0.0.1:1/x',
      live: false,
      startSec: 0,
      probe: { ...probe, format: 'hls' },
      startNumber: 0,
      vodWindowSec: 180,
      discontinuity: false,
    });
    expect(ffmpeg[ffmpeg.indexOf('-format_whitelist') + 1]).toBe(allowed);
    expect(ffmpeg.indexOf('-format_whitelist')).toBeLessThan(ffmpeg.indexOf('-i'));
    const ffprobe = probeArgs('http://127.0.0.1:1/x');
    expect(ffprobe[ffprobe.indexOf('-format_whitelist') + 1]).toBe(allowed);
    expect(ffprobe.at(-1)).toBe('http://127.0.0.1:1/x');
    expect(ffprobe.join(' ')).toContain('-protocol_whitelist http,tcp,crypto');
    for (const format of ['hls', 'mpegts', 'mov,mp4,m4a,3gp,3g2,mj2', 'matroska,webm', 'aac'])
      expect(allowedInputFormat(format)).toBe(true);
    for (const format of ['dash', 'concat', 'sdp', 'rtsp', 'image2', 'flv', ''])
      expect(allowedInputFormat(format)).toBe(false);
  });

  it('reads the media sequence, durations and the end marker', () => {
    expect(
      playlistSegments(
        '#EXTM3U\n#EXT-X-MEDIA-SEQUENCE:3\n#EXTINF:2.000,\nseg000003.m4s\n#EXTINF:1.5,\nseg000004.m4s\n#EXT-X-ENDLIST\n',
      ),
    ).toEqual({ first: 3, durations: [2, 1.5], ended: true, firstPdtMs: null });
    expect(
      playlistSegments(
        '#EXTM3U\n#EXT-X-MEDIA-SEQUENCE:0\n#EXTINF:2.000,\n#EXT-X-PROGRAM-DATE-TIME:2026-10-17T18:00:00.000+0000\nseg000000.m4s\n',
      ).firstPdtMs,
    ).toBe(Date.UTC(2026, 9, 17, 18));
  });

  it('keeps only the best variant of a master playlist', () => {
    const master = [
      '#EXTM3U',
      '#EXT-X-STREAM-INF:BANDWIDTH=800000',
      'low.m3u8',
      '#EXT-X-I-FRAME-STREAM-INF:BANDWIDTH=100,URI="iframe.m3u8"',
      '#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080',
      'high.m3u8',
    ].join('\n');
    expect(singleVariant(master)).toBe(
      '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080\nhigh.m3u8',
    );
    expect(singleVariant('#EXTM3U\n#EXTINF:2,\na.ts')).toBe('#EXTM3U\n#EXTINF:2,\na.ts');
  });
});

describe('upstream proxy', () => {
  let upstream: Server;
  let base = '';
  const proxies: UpstreamProxy[] = [];
  beforeAll(async () => {
    upstream = createServer((request, response) => {
      if (request.url === '/denied') return void response.writeHead(401).end();
      if (request.url === '/master.m3u8')
        return void response
          .writeHead(200, { 'Content-Type': 'application/vnd.apple.mpegurl' })
          .end(
            '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\nlow.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=9\nhigh.m3u8\n',
          );
      if (request.url === '/high.m3u8')
        return void response
          .writeHead(200, { 'Content-Type': 'text/plain' })
          .end('#EXTM3U\n#EXTINF:2,\n/live/user/secret/seg1.ts\n');
      if (request.url === '/live/user/secret/seg1.ts')
        return void response
          .writeHead(200, { 'Content-Type': 'video/mp2t' })
          .end(Buffer.alloc(376, 0x47));
      response.writeHead(404).end();
    });
    await new Promise<void>((resolve) => upstream.listen(0, '127.0.0.1', resolve));
    const address = upstream.address();
    base = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
  });
  afterAll(() => {
    for (const proxy of proxies) proxy.close();
    upstream.close();
  });
  const start = async (allowPrivateNetwork: boolean) => {
    const proxy = await UpstreamProxy.start({
      userAgent: 'ROOMS-Cinema/test',
      allowPrivateNetwork,
    });
    proxies.push(proxy);
    return proxy;
  };
  const raw = (url: string, headers: Record<string, string>) =>
    new Promise<number>((resolve, reject) => {
      const target = new URL(url);
      httpRequest(
        {
          host: target.hostname,
          port: target.port,
          path: target.pathname,
          headers,
        },
        (response) => {
          response.resume();
          resolve(response.statusCode ?? 0);
        },
      )
        .on('error', reject)
        .end();
    });

  it('reaches loopback in privateFetch only when explicitly allowed', async () => {
    await expect(privateFetch(`${base}/high.m3u8`)).rejects.toThrow(/private or reserved/);
    const response = await privateFetch(`${base}/high.m3u8`, { allowPrivateNetwork: true });
    expect(response.status).toBe(200);
    await response.body?.cancel();
  });

  it('blocks private and loopback upstreams by default', async () => {
    const proxy = await start(false);
    const { scope, url } = proxy.open(`${base}/master.m3u8`);
    expect((await fetch(url)).status).toBe(502);
    expect(proxy.failure(scope)).toBe('unreachable');
  });

  it('rewrites manifests into capabilities and streams segments', async () => {
    const proxy = await start(true);
    const { url } = proxy.open(`${base}/master.m3u8`);
    expect(url.startsWith(proxy.origin)).toBe(true);
    expect(url.endsWith('/master.m3u8')).toBe(true);
    const master = await (await fetch(url)).text();
    expect(master).not.toContain(base);
    expect(master).not.toContain('low.m3u8');
    const child = master.split('\n').find((line) => line.startsWith('http'))!;
    expect(child.endsWith('/high.m3u8')).toBe(true);
    const media = await (await fetch(child)).text();
    expect(media).not.toContain('secret');
    const segment = media.split('\n').find((line) => line.startsWith('http'))!;
    const body = Buffer.from(await (await fetch(segment)).arrayBuffer());
    expect(body.length).toBe(376);
    expect(body[0]).toBe(0x47);
  });

  it('rejects foreign hosts, origins, unknown capabilities and revoked scopes', async () => {
    const proxy = await start(true);
    const { scope, url } = proxy.open(`${base}/master.m3u8`);
    const host = new URL(url).host;
    expect(await raw(url, { Host: 'evil.example' })).toBe(403);
    expect(await raw(url, { Host: host, Origin: 'https://evil.example' })).toBe(403);
    expect((await fetch(url.replace(/\/[a-f0-9]{24}\//, `/${'0'.repeat(24)}/`))).status).toBe(404);
    proxy.revoke(scope);
    expect((await fetch(url)).status).toBe(404);
  });

  it('remembers a provider refusal for error mapping', async () => {
    const proxy = await start(true);
    const { scope, url } = proxy.open(`${base}/denied`);
    expect((await fetch(url)).status).toBe(401);
    expect(proxy.failure(scope)).toBe('denied');
  });
});

class FakeChild extends EventEmitter {
  stderr = new PassThrough();
  exitCode: number | null = null;
  signalCode: NodeJS.Signals | null = null;
  kill(signal: NodeJS.Signals = 'SIGTERM') {
    setImmediate(() => {
      if (this.exitCode !== null || this.signalCode !== null) return;
      this.signalCode = signal;
      this.emit('exit', null, signal);
    });
    return true;
  }
}

describe('relay manager', () => {
  const roots: string[] = [];
  const managers: RelayManager[] = [];
  afterEach(async () => {
    for (const manager of managers.splice(0)) await manager.close();
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  });
  const setup = (options: { probe?: Partial<ProbeResult>; idleMs?: number } = {}) => {
    const root = mkdtempSync(join(tmpdir(), 'rooms-relay-'));
    roots.push(root);
    const spawned: { args: string[]; cwd: string; child: FakeChild }[] = [];
    const logs: string[] = [];
    const manager = new RelayManager({
      directory: join(root, 'hls'),
      userAgent: 'ROOMS-Cinema/test',
      idleMs: options.idleMs,
      log: (line) => logs.push(line),
      probe: async () => ({
        format: 'mpegts',
        video: 'h264',
        audio: 'aac',
        durationSec: 600,
        ...options.probe,
      }),
      spawn: ((_command: string, args: string[], spawnOptions: SpawnOptions) => {
        const child = new FakeChild();
        const cwd = String(spawnOptions.cwd);
        spawned.push({ args, cwd, child });
        setTimeout(
          () =>
            writeFileSync(
              join(cwd, 'index.m3u8'),
              '#EXTM3U\n#EXT-X-MEDIA-SEQUENCE:0\n#EXT-X-MAP:URI="init.mp4"\n#EXTINF:2.0,\nseg000000.m4s\n#EXTINF:2.5,\nseg000001.m4s\n',
            ),
          30,
        );
        return child as unknown as ChildProcess;
      }) as never,
    });
    managers.push(manager);
    return { manager, spawned, logs };
  };
  const source = (url = 'http://provider.example/live/user/secret/1.ts', live = true) => ({
    url,
    headers: {},
    live,
  });

  it('starts once per key, reports production and hides the provider URL', async () => {
    const { manager, spawned, logs } = setup();
    const info = await manager.acquire({
      communityId: 'C',
      key: 'C:l-1',
      source: source(),
      slots: 1,
    });
    expect(info).toMatchObject({ live: true, offsetSec: 0, producedSec: 4.5, windowStartSec: 0 });
    expect(info.session).toMatch(/^[a-f0-9]{32}$/);
    const again = await manager.acquire({
      communityId: 'C',
      key: 'C:l-1',
      source: source(),
      slots: 1,
    });
    expect(again.session).toBe(info.session);
    expect(spawned).toHaveLength(1);
    expect(spawned[0].args.join(' ')).not.toContain('provider.example');
    expect(spawned[0].args.join(' ')).not.toContain('secret');
    expect(logs.join('\n')).not.toContain('provider.example');
    expect(manager.sessionsOf('C')).toHaveLength(1);
  });

  it('evicts the least recently served relay when the slots are full', async () => {
    const { manager, spawned } = setup();
    const first = await manager.acquire({
      communityId: 'C',
      key: 'C:l-1',
      source: source(),
      slots: 1,
    });
    const second = await manager.acquire({
      communityId: 'C',
      key: 'C:l-2',
      source: source(),
      slots: 1,
    });
    expect(second.session).not.toBe(first.session);
    expect(existsSync(spawned[0].cwd)).toBe(false);
    expect(spawned[0].child.signalCode).toBe('SIGTERM');
    expect(manager.sessionsOf('C').map((s) => s.session)).toEqual([second.session]);
    const other = await manager.acquire({
      communityId: 'D',
      key: 'D:l-1',
      source: source(),
      slots: 1,
    });
    expect(manager.sessionsOf('C')).toHaveLength(1);
    expect(manager.sessionsOf('D').map((s) => s.session)).toEqual([other.session]);
    await expect(
      manager.acquire({ communityId: 'C', key: 'C:l-3', source: source(), slots: 0 }),
    ).rejects.toThrow('CINEMA_RELAY_BUSY');
  });

  it('restarts a VOD relay from a new position with a new epoch', async () => {
    const { manager, spawned } = setup({ probe: { audio: null } });
    const vod = source('http://provider.example/movie/u/p/3001.mkv', false);
    const a = await manager.acquire({ communityId: 'C', key: 'C:m-1@0', source: vod, slots: 1 });
    const b = await manager.acquire({
      communityId: 'C',
      key: 'C:m-1@600',
      source: vod,
      startSec: 600,
      slots: 1,
    });
    expect(b.epoch).toBeGreaterThan(a.epoch);
    expect(b).toMatchObject({ live: false, offsetSec: 600, durationSec: 600 });
    expect(spawned[1].args[spawned[1].args.indexOf('-ss') + 1]).toBe('600.000');
  });

  it('refuses unsupported video codecs and cleans up', async () => {
    const { manager, spawned } = setup({ probe: { video: 'mpeg2video' } });
    await expect(
      manager.acquire({ communityId: 'C', key: 'C:l-9', source: source(), slots: 1 }),
    ).rejects.toThrow('CINEMA_CODEC_UNSUPPORTED');
    expect(spawned).toHaveLength(0);
    expect(manager.sessionsOf('C')).toHaveLength(0);
  });

  it('refuses containers outside the input allowlist before starting ffmpeg', async () => {
    const { manager, spawned } = setup({ probe: { format: 'dash' } });
    await expect(
      manager.acquire({ communityId: 'C', key: 'C:l-8', source: source(), slots: 1 }),
    ).rejects.toThrow('CINEMA_STREAM_FAILED');
    expect(spawned).toHaveLength(0);
    expect(manager.sessionsOf('C')).toHaveLength(0);
  });

  it('serves only relay file names and stops idle relays', async () => {
    const { manager } = setup({ idleMs: 500 });
    const info = await manager.acquire({
      communityId: 'C',
      key: 'C:l-1',
      source: source(),
      slots: 1,
    });
    const playlist = await manager.file(info.session, 'index.m3u8');
    expect(playlist?.type).toBe('application/vnd.apple.mpegurl');
    expect(playlist?.body.toString()).toContain('seg000001.m4s');
    for (const name of ['../index.m3u8', 'index.m3u8.tmp', 'seg1.m4s', '/etc/passwd', 'x.ts'])
      expect(await manager.file(info.session, name)).toBeNull();
    expect(await manager.file('b'.repeat(32), 'index.m3u8')).toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 2600));
    expect(manager.sessionsOf('C')).toHaveLength(0);
  });

  it('serves relay files only with a valid ticket for that session', async () => {
    const { manager } = setup();
    const info = await manager.acquire({
      communityId: 'C',
      key: 'C:l-1',
      source: source(),
      slots: 1,
    });
    const server = Fastify();
    registerRelayRoutes(server, { relays: manager, ticketSecret: secret });
    const { ticket } = issueTicket({ session: info.session, userId: 'U', hallId: 'H' }, secret);
    const ok = await server.inject(`/v1/relay/${ticket}/index.m3u8`);
    expect(ok.statusCode).toBe(200);
    expect(ok.headers['cache-control']).toBe('no-store');
    expect(ok.headers['content-type']).toContain('application/vnd.apple.mpegurl');
    expect((await server.inject(`/v1/relay/${ticket}/seg000009.m4s`)).statusCode).toBe(404);
    expect((await server.inject(`/v1/relay/x.y/index.m3u8`)).statusCode).toBe(401);
    const other = issueTicket({ session: 'c'.repeat(32), userId: 'U', hallId: 'H' }, secret);
    expect((await server.inject(`/v1/relay/${other.ticket}/index.m3u8`)).statusCode).toBe(404);
    await server.close();
  });
});

describe('strict HLS rewrite', () => {
  const register = (url: string) => `http://proxy/${encodeURIComponent(url)}`;
  it('rewrites URI lines and every URI= attribute, whatever the line endings', async () => {
    const { rewriteManifest } = await import('../apps/services/cinema/upstream-proxy');
    const text =
      '#EXTM3U\r#EXT-X-KEY:METHOD=AES-128,URI=http://10.0.0.1/key\r\n#EXT-X-MAP:uri="init.mp4"\n#EXTINF:2,\rseg1.ts\r#EXT-X-MEDIA:TYPE=AUDIO,URI="audio.m3u8"\n';
    const out = rewriteManifest(text, 'http://cdn.example/live/', register);
    for (const line of out.split('\n').filter(Boolean)) {
      if (!line.startsWith('#')) expect(line.startsWith('http://proxy/')).toBe(true);
      for (const m of line.matchAll(/URI="([^"]*)"/gi))
        expect(m[1].startsWith('http://proxy/')).toBe(true);
    }
    expect(out).toContain(encodeURIComponent('http://10.0.0.1/key'));
    expect(out).toContain(encodeURIComponent('http://cdn.example/live/seg1.ts'));
    expect(() => rewriteManifest('#EXTM3U\nseg\0.ts', 'http://cdn.example/', register)).toThrow();
    expect(() =>
      rewriteManifest('#EXTM3U\nfile:///etc/passwd', 'http://cdn.example/', register),
    ).toThrow();
    expect(() =>
      rewriteManifest('#EXTM3U\n#EXT-X-KEY:URI="data:,x"', 'http://cdn.example/', register),
    ).toThrow();
  });
});

describe('relay audio streams', () => {
  const tracks = [
    { index: 0, language: 'ger', title: null, isDefault: true },
    { index: 1, language: 'tur', title: 'Dublaj', isDefault: false },
    { index: 2, language: null, title: null, isDefault: false },
  ];

  it('prefers the hall’s choice, then Turkish, then the default stream', () => {
    expect(pickAudio(tracks, null)).toBe(1);
    expect(pickAudio(tracks, 2)).toBe(2);
    // A choice the source does not have falls back like no choice.
    expect(pickAudio(tracks, 7)).toBe(1);
    expect(pickAudio([tracks[2]!, { ...tracks[0]!, index: 1 }], null)).toBe(1);
    expect(pickAudio([], null)).toBe(0);
  });

  it('labels streams in Turkish and maps the chosen one', () => {
    expect(tracks.map(audioLabel)).toEqual(['Almanca', 'Türkçe · Dublaj', 'Ses 3']);
    const args = relayArgs({
      url: 'http://127.0.0.1/movie.mkv',
      live: false,
      startSec: 0,
      probe: { format: 'matroska,webm', video: 'h264', audio: 'ac3', durationSec: 60 },
      startNumber: 0,
      vodWindowSec: 60,
      discontinuity: false,
      audioTrack: 1,
    });
    expect(args.join(' ')).toContain('-map 0:a:1 -c:a aac');
  });
});
