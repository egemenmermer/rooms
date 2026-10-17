// Real ffmpeg/ffprobe relay check. Opt-in: ROOMS_CINEMA_RELAY_NATIVE=1 with ffmpeg and
// ffprobe (libx264, libx265, ac3, eac3, mpeg2video, mp2) on PATH. Media is generated in
// a temp directory and served from 127.0.0.1, so the relay runs with allowPrivateNetwork.
import { execFileSync } from 'node:child_process';
import { createReadStream, existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RelayManager } from '../apps/services/cinema/relay';

const native = process.env.ROOMS_CINEMA_RELAY_NATIVE === '1';

describe.runIf(native)('cinema relay with real ffmpeg', () => {
  let root = '';
  let server: Server;
  let base = '';
  const logs: string[] = [];
  let relays: RelayManager;

  const ffmpeg = (args: string[]) =>
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], {
      cwd: root,
      stdio: 'ignore',
    });
  const probe = (file: string) =>
    JSON.parse(
      execFileSync(
        'ffprobe',
        ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', 'index.m3u8'],
        { cwd: file, encoding: 'utf8' },
      ),
    ) as {
      streams: {
        codec_type: string;
        codec_name: string;
        codec_tag_string: string;
        channels?: number;
      }[];
    };
  const stream = (dir: string, type: string) =>
    probe(dir).streams.find((s) => s.codec_type === type);

  beforeAll(async () => {
    root = mkdtempSync(join(tmpdir(), 'rooms-relay-native-'));
    const video = ['-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=25'];
    const audio = ['-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000'];
    const h264 = ['-c:v', 'libx264', '-preset', 'ultrafast', '-g', '50', '-pix_fmt', 'yuv420p'];
    ffmpeg([...video, ...audio, '-t', '30', ...h264, '-c:a', 'aac', '-f', 'mpegts', 'h264_aac.ts']);
    ffmpeg([
      ...video,
      ...audio,
      '-t',
      '30',
      ...h264,
      '-ac',
      '6',
      '-c:a',
      'ac3',
      '-f',
      'mpegts',
      'h264_ac3.ts',
    ]);
    ffmpeg([
      ...video,
      ...audio,
      '-t',
      '30',
      '-c:v',
      'libx265',
      '-preset',
      'ultrafast',
      '-x265-params',
      'log-level=error:keyint=50',
      '-pix_fmt',
      'yuv420p',
      '-ac',
      '6',
      '-c:a',
      'eac3',
      '-f',
      'mpegts',
      'hevc_eac3.ts',
    ]);
    ffmpeg([
      ...video,
      ...audio,
      '-t',
      '10',
      '-c:v',
      'mpeg2video',
      '-c:a',
      'mp2',
      '-f',
      'mpegts',
      'mpeg2.ts',
    ]);
    ffmpeg([
      ...video,
      ...audio,
      '-t',
      '40',
      '-c:v',
      'libx264',
      '-preset',
      'ultrafast',
      '-g',
      '125',
      '-keyint_min',
      '125',
      '-sc_threshold',
      '0',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      'movie.mp4',
    ]);
    ffmpeg([
      '-i',
      'h264_aac.ts',
      '-c',
      'copy',
      '-f',
      'hls',
      '-hls_time',
      '2',
      '-hls_list_size',
      '0',
      '-hls_segment_filename',
      'hls%03d.ts',
      'hls.m3u8',
    ]);

    // Paths look like Xtream URLs so a leaked URL would show the fake password.
    server = createServer((request, response) => {
      const name = /^\/(?:live|movie)\/user\/secretpass\/([A-Za-z0-9_.]+)$/.exec(
        request.url ?? '',
      )?.[1];
      if (request.url === '/live/user/secretpass/denied.ts')
        return void response.writeHead(401).end();
      if (!name || !existsSync(join(root, name))) return void response.writeHead(404).end();
      const file = join(root, name);
      const size = statSync(file).size;
      if (name.endsWith('.m3u8'))
        return void response
          .writeHead(200, { 'Content-Type': 'application/vnd.apple.mpegurl' })
          .end(readFileSync(file));
      const range = /^bytes=(\d+)-(\d*)$/.exec(request.headers.range ?? '');
      if (name.endsWith('.mp4') && range) {
        const start = Number(range[1]);
        const end = range[2] ? Number(range[2]) : size - 1;
        response.writeHead(206, {
          'Content-Type': 'video/mp4',
          'Content-Range': `bytes ${start}-${end}/${size}`,
          'Content-Length': end - start + 1,
          'Accept-Ranges': 'bytes',
        });
        return void createReadStream(file, { start, end }).pipe(response);
      }
      if (request.url?.startsWith('/live/') && name.endsWith('.ts') && !name.startsWith('hls')) {
        // Paced like a live channel: the 30 s file over 30 s, after a 2 s burst.
        response.writeHead(200, { 'Content-Type': 'video/mp2t' });
        const data = readFileSync(file);
        const perTick = Math.ceil(data.length / 300);
        let offset = Math.min(data.length, perTick * 20);
        response.write(data.subarray(0, offset));
        const timer = setInterval(() => {
          if (offset >= data.length) {
            clearInterval(timer);
            response.end();
            return;
          }
          response.write(data.subarray(offset, offset + perTick));
          offset += perTick;
        }, 100);
        response.on('close', () => clearInterval(timer));
        return;
      }
      response.writeHead(200, {
        'Content-Type': name.endsWith('.mp4') ? 'video/mp4' : 'video/mp2t',
        'Content-Length': size,
        'Accept-Ranges': 'bytes',
      });
      createReadStream(file).pipe(response);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    base = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
    relays = new RelayManager({
      directory: join(root, 'hls-out'),
      userAgent: 'ROOMS-Cinema/test',
      allowPrivateNetwork: true,
      idleMs: 5000,
      log: (line) => logs.push(line),
    });
  }, 120_000);

  afterAll(async () => {
    if (process.env.ROOMS_CINEMA_RELAY_DEBUG === '1') console.log(logs.join('\n'));
    await relays?.close();
    server?.close();
    if (root) rmSync(root, { recursive: true, force: true });
  });

  const live = (name: string) => ({
    url: `${base}/live/user/secretpass/${name}`,
    headers: {},
    live: true,
  });
  const dirOf = (session: string) => join(root, 'hls-out', session);

  it('relays H.264/AAC live TS with video copied', async () => {
    const info = await relays.acquire({
      communityId: 'C1',
      key: 'C1:l-1',
      source: live('h264_aac.ts'),
      slots: 2,
    });
    expect(info.live).toBe(true);
    expect(info.producedSec).toBeGreaterThan(1);
    const playlist = readFileSync(join(dirOf(info.session), 'index.m3u8'), 'utf8');
    expect(playlist).toContain('#EXT-X-MAP:URI="init.mp4"');
    expect(playlist).toContain('#EXT-X-PROGRAM-DATE-TIME');
    expect(stream(dirOf(info.session), 'video')?.codec_name).toBe('h264');
    expect(stream(dirOf(info.session), 'audio')?.codec_name).toBe('aac');
    await relays.stop(info.session);
    expect(existsSync(dirOf(info.session))).toBe(false);
  }, 60_000);

  it('converts AC-3 5.1 to AAC stereo', async () => {
    const info = await relays.acquire({
      communityId: 'C1',
      key: 'C1:l-2',
      source: live('h264_ac3.ts'),
      slots: 2,
    });
    const audio = stream(dirOf(info.session), 'audio');
    expect(audio?.codec_name).toBe('aac');
    expect(audio?.channels).toBe(2);
    await relays.stop(info.session);
  }, 60_000);

  it('copies HEVC with the hvc1 tag and converts E-AC-3', async () => {
    const info = await relays.acquire({
      communityId: 'C1',
      key: 'C1:l-3',
      source: live('hevc_eac3.ts'),
      slots: 2,
    });
    const video = stream(dirOf(info.session), 'video');
    expect(video?.codec_name).toBe('hevc');
    expect(video?.codec_tag_string).toBe('hvc1');
    expect(stream(dirOf(info.session), 'audio')?.codec_name).toBe('aac');
    await relays.stop(info.session);
  }, 60_000);

  it('rejects MPEG-2 video and provider refusals', async () => {
    await expect(
      relays.acquire({ communityId: 'C1', key: 'C1:l-4', source: live('mpeg2.ts'), slots: 2 }),
    ).rejects.toThrow('CINEMA_CODEC_UNSUPPORTED');
    await expect(
      relays.acquire({ communityId: 'C1', key: 'C1:l-5', source: live('denied.ts'), slots: 2 }),
    ).rejects.toThrow('CINEMA_PROVIDER_DENIED');
    await expect(
      relays.acquire({ communityId: 'C1', key: 'C1:l-6', source: live('missing.ts'), slots: 2 }),
    ).rejects.toThrow('CINEMA_PROVIDER_UNREACHABLE');
    expect(relays.sessionsOf('C1')).toHaveLength(0);
  }, 60_000);

  it('follows an HLS source through proxy capabilities', async () => {
    const info = await relays.acquire({
      communityId: 'C2',
      key: 'C2:l-7',
      source: { url: `${base}/live/user/secretpass/hls.m3u8`, headers: {}, live: true },
      slots: 1,
    });
    expect(stream(dirOf(info.session), 'video')?.codec_name).toBe('h264');
    await relays.stop(info.session);
  }, 60_000);

  it('keeps one relay per slot and restarts VOD from a new position', async () => {
    const movie = { url: `${base}/movie/user/secretpass/movie.mp4`, headers: {}, live: false };
    const first = await relays.acquire({
      communityId: 'C3',
      key: 'C3:m-1@0',
      source: movie,
      slots: 1,
    });
    expect(first.durationSec).toBeCloseTo(40, 0);
    expect(first.offsetSec).toBe(0);
    const later = await relays.acquire({
      communityId: 'C3',
      key: 'C3:m-1@7',
      source: movie,
      startSec: 7,
      slots: 1,
    });
    expect(later.epoch).toBeGreaterThan(first.epoch);
    // Keyframes every 5 s: output time 0 is the keyframe at 5 s.
    expect(later.offsetSec).toBeGreaterThan(4.9);
    expect(later.offsetSec).toBeLessThan(5.1);
    expect(relays.sessionsOf('C3').map((s) => s.session)).toEqual([later.session]);
    expect(existsSync(dirOf(first.session))).toBe(false);
    const playlist = readFileSync(join(dirOf(later.session), 'index.m3u8'), 'utf8');
    expect(playlist).not.toContain('#EXT-X-PLAYLIST-TYPE');
  }, 60_000);

  it('stops idle relays and never logs a provider URL', async () => {
    const info = await relays.acquire({
      communityId: 'C4',
      key: 'C4:l-1',
      source: live('h264_aac.ts'),
      slots: 1,
    });
    expect(relays.sessionsOf('C4')).toHaveLength(1);
    await new Promise((resolve) => setTimeout(resolve, 8000));
    expect(relays.sessionsOf('C4')).toHaveLength(0);
    expect(existsSync(dirOf(info.session))).toBe(false);
    const text = logs.join('\n');
    expect(text).toContain('idle');
    expect(text).not.toContain('secretpass');
    expect(text).not.toContain(base);
  }, 60_000);
});
