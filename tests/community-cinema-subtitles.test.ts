import { EventEmitter } from 'node:events';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import type { ChildProcess, SpawnOptions } from 'node:child_process';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  relayArgs,
  RelayManager,
  subtitleLabel,
  textSubtitles,
  type ProbeResult,
  type ProbeSubtitle,
} from '../apps/services/cinema/relay';
import { UpstreamProxy } from '../apps/services/cinema/upstream-proxy';
import { autoSubtitle } from '../apps/desktop/src/cinema/HallPlayer';
import { cueText, formatVtt, parseVtt } from '../packages/community-cinema/src/webvtt';

const sub = (index: number, codec: string, extra: Partial<ProbeSubtitle> = {}): ProbeSubtitle => ({
  index,
  codec,
  language: 'tur',
  title: null,
  isDefault: false,
  forced: false,
  ...extra,
});

describe('WebVTT cues', () => {
  it('reads ffmpeg output with and without hours, skipping headers and notes', () => {
    const text =
      '\uFEFFWEBVTT\r\n\r\nNOTE written by ffmpeg\r\n\r\n00:34.347 --> 00:36.158\r\nİlk satır\r\nikinci\r\n\r\n01:02:03.004 --> 01:02:05.000 align:start\r\n<i>Eğik</i> &amp; düz\r\n\r\n';
    expect(parseVtt(text)).toEqual([
      { start: 34.347, end: 36.158, text: 'İlk satır\nikinci' },
      { start: 3723.004, end: 3725, text: '<i>Eğik</i> &amp; düz' },
    ]);
    expect(cueText('<i>Eğik</i> &amp; düz &lt;3')).toBe('Eğik & düz <3');
    expect(parseVtt('not a subtitle file\n\n00:01.000 --> 00:02.000\nx\n\n')).toEqual([]);
  });

  it('leaves out the cue ffmpeg may still be writing', () => {
    const growing = 'WEBVTT\n\n00:01.000 --> 00:02.000\nbir\n\n00:03.000 --> 00:04.000\nik';
    expect(parseVtt(growing, { complete: true }).map((cue) => cue.text)).toEqual(['bir']);
    expect(parseVtt(growing).map((cue) => cue.text)).toEqual(['bir', 'ik']);
    // ffmpeg's muxer ends a cue with one newline; the blank line opens the next cue.
    const written = 'WEBVTT\n\n00:01.000 --> 00:02.000\nbir\n\n00:03.000 --> 00:04.000\niki\n';
    expect(parseVtt(written, { complete: true }).map((cue) => cue.text)).toEqual(['bir', 'iki']);
    expect(parseVtt('WEBVTT\n\n00:03.000 --> 00:0', { complete: true })).toEqual([]);
  });

  it('writes cues that read back the same', () => {
    const cues = [
      { start: 599.5, end: 601.25, text: 'a\nb' },
      { start: 3725, end: 3726.5, text: 'c' },
    ];
    expect(formatVtt(cues)).toBe(
      'WEBVTT\n\n00:09:59.500 --> 00:10:01.250\na\nb\n\n01:02:05.000 --> 01:02:06.500\nc\n\n',
    );
    expect(parseVtt(formatVtt(cues), { complete: true })).toEqual(cues);
  });
});

describe('relay subtitle streams', () => {
  const probe: ProbeResult = {
    format: 'matroska,webm',
    video: 'h264',
    audio: 'aac',
    durationSec: 6470,
  };

  it('keeps text subtitles only, sixteen at most', () => {
    const tracks = [
      sub(0, 'subrip'),
      sub(1, 'hdmv_pgs_subtitle'),
      sub(2, 'ass'),
      sub(3, 'dvd_subtitle'),
      ...Array.from({ length: 20 }, (_, i) => sub(4 + i, 'mov_text')),
    ];
    const kept = textSubtitles(tracks);
    expect(kept).toHaveLength(16);
    expect(kept.slice(0, 3).map((t) => t.index)).toEqual([0, 2, 4]);
    expect(textSubtitles(undefined)).toEqual([]);
  });

  it('labels tracks in Turkish and marks forced ones', () => {
    expect(subtitleLabel(sub(0, 'subrip', { title: 'Tam (Türkçe)' }))).toBe(
      'Türkçe · Tam (Türkçe)',
    );
    expect(subtitleLabel(sub(1, 'ass', { language: 'eng', forced: true }))).toBe(
      'İngilizce · Zorunlu',
    );
    expect(subtitleLabel(sub(2, 'ass', { language: null, title: 'Forced', forced: true }))).toBe(
      'Forced',
    );
    expect(subtitleLabel(sub(3, 'subrip', { language: null }))).toBe('Altyazı 4');
  });

  it('writes one WebVTT output per track and leaves pacing to the proxy', () => {
    const args = relayArgs({
      url: 'http://127.0.0.1:1/x',
      live: false,
      startSec: 600,
      probe,
      startNumber: 0,
      vodWindowSec: 60,
      discontinuity: false,
      subtitles: [0, 2],
    });
    const line = args.join(' ');
    expect(args).not.toContain('-readrate');
    expect(args[args.indexOf('-ss') + 1]).toBe('600.000');
    // The HLS output stays subtitle-free; the WebVTT outputs follow it.
    expect(args.indexOf('-sn')).toBeLessThan(args.indexOf('index.m3u8'));
    expect(line).toContain(
      'index.m3u8 -map 0:s:0 -c:s webvtt -flush_packets 1 -f webvtt sub0.vtt -map 0:s:2 -c:s webvtt -flush_packets 1 -f webvtt sub2.vtt',
    );
    expect(args.at(-1)).toBe('sub2.vtt');
  });

  it('keeps -readrate without subtitles, and never adds subtitles to live', () => {
    const vod = relayArgs({
      url: 'http://127.0.0.1:1/x',
      live: false,
      startSec: 0,
      probe,
      startNumber: 0,
      vodWindowSec: 60,
      discontinuity: false,
      subtitles: [],
    });
    expect(vod.join(' ')).toContain('-readrate 1 -readrate_initial_burst 15');
    const live = relayArgs({
      url: 'http://127.0.0.1:1/x',
      live: true,
      startSec: 0,
      probe,
      startNumber: 0,
      vodWindowSec: 60,
      discontinuity: false,
      subtitles: [0],
    });
    expect(live.join(' ')).not.toContain('webvtt');
    expect(live.at(-1)).toBe('index.m3u8');
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

describe('relay manager subtitles', () => {
  const roots: string[] = [];
  const managers: RelayManager[] = [];
  afterEach(async () => {
    for (const manager of managers.splice(0)) await manager.close();
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  });
  const setup = (subtitleTracks: ProbeSubtitle[]) => {
    const root = mkdtempSync(join(tmpdir(), 'rooms-relay-sub-'));
    roots.push(root);
    const spawned: { args: string[]; cwd: string }[] = [];
    const manager = new RelayManager({
      directory: join(root, 'hls'),
      userAgent: 'ROOMS-Cinema/test',
      probe: async () => ({
        format: 'matroska,webm',
        video: 'h264',
        audio: null,
        durationSec: 6470,
        subtitleTracks,
      }),
      spawn: ((_command: string, args: string[], options: SpawnOptions) => {
        const cwd = String(options.cwd);
        spawned.push({ args, cwd });
        setTimeout(() => {
          writeFileSync(
            join(cwd, 'index.m3u8'),
            '#EXTM3U\n#EXT-X-MEDIA-SEQUENCE:0\n#EXTINF:2.0,\nseg000000.m4s\n#EXTINF:2.0,\nseg000001.m4s\n',
          );
          // As ffmpeg leaves it mid-write: the last cue is not finished yet.
          writeFileSync(
            join(cwd, 'sub0.vtt'),
            'WEBVTT\n\n00:34.347 --> 00:36.158\nÖrnek satır\n\n00:36.182 --> 00:37',
          );
        }, 20);
        return new FakeChild() as unknown as ChildProcess;
      }) as never,
    });
    managers.push(manager);
    return { manager, spawned };
  };
  const movie = {
    url: 'http://provider.example/movie/user/secret/208525.mkv',
    headers: {},
    live: false,
  };

  it('serves whole cues on the work timeline and lists the tracks', async () => {
    const { manager, spawned } = setup([
      sub(0, 'subrip', { title: 'Tam (Türkçe)', isDefault: true }),
      sub(1, 'hdmv_pgs_subtitle'),
    ]);
    const info = await manager.acquire({
      communityId: 'C',
      key: 'C:m-208525@600',
      source: movie,
      startSec: 600,
      slots: 1,
    });
    expect(info.subtitleTracks).toEqual([
      { index: 0, label: 'Türkçe · Tam (Türkçe)', language: 'tur', forced: false },
    ]);
    expect(spawned[0].args).not.toContain('-readrate');
    expect(spawned[0].args.at(-1)).toBe('sub0.vtt');
    const file = await manager.file(info.session, 'sub0.vtt');
    expect(file?.type).toBe('text/vtt; charset=utf-8');
    // Production measured: cue 00:34.347 of a relay started at 600 s is the source's 634.347 s.
    expect(parseVtt(file!.body.toString('utf8'))).toEqual([
      { start: 634.347, end: 636.158, text: 'Örnek satır' },
    ]);
    expect(await manager.file(info.session, 'sub1.vtt')).toBeNull();
    expect(await manager.file(info.session, 'sub100.vtt')).toBeNull();
    expect(await manager.file(info.session, '../sub0.vtt')).toBeNull();
  });

  it('keeps -readrate and lists nothing when no text subtitle exists', async () => {
    const { manager, spawned } = setup([sub(0, 'hdmv_pgs_subtitle')]);
    const info = await manager.acquire({
      communityId: 'C',
      key: 'C:m-1',
      source: movie,
      slots: 1,
    });
    expect(info.subtitleTracks).toEqual([]);
    expect(spawned[0].args).toContain('-readrate');
    expect(await manager.file(info.session, 'sub0.vtt')).toBeNull();
  });

  it('never relays subtitles of live channels', async () => {
    const { manager, spawned } = setup([sub(0, 'subrip')]);
    const info = await manager.acquire({
      communityId: 'C',
      key: 'C:l-1',
      source: { ...movie, live: true },
      slots: 1,
    });
    expect(info.subtitleTracks).toEqual([]);
    expect(spawned[0].args.join(' ')).not.toContain('webvtt');
  });
});

describe('proxy pacing', () => {
  let upstream: Server;
  let base = '';
  const proxies: UpstreamProxy[] = [];
  beforeAll(async () => {
    upstream = createServer((request, response) => {
      if (request.url === '/list.m3u8')
        return void response
          .writeHead(200, { 'Content-Type': 'application/vnd.apple.mpegurl' })
          .end('#EXTM3U\n#EXTINF:2,\nseg1.ts\n');
      response.writeHead(200, { 'Content-Type': 'video/x-matroska' });
      let sent = 0;
      const timer = setInterval(() => {
        response.write(Buffer.alloc(1024, 1));
        if (++sent === 3) {
          clearInterval(timer);
          response.end();
        }
      }, 5);
    });
    await new Promise<void>((resolve) => upstream.listen(0, '127.0.0.1', resolve));
    const address = upstream.address();
    base = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
  });
  afterAll(() => {
    for (const proxy of proxies) proxy.close();
    upstream.close();
  });

  it('waits on the relay before passing each media chunk, never for playlists', async () => {
    const proxy = await UpstreamProxy.start({
      userAgent: 'ROOMS-Cinema/test',
      allowPrivateNetwork: true,
    });
    proxies.push(proxy);
    let calls = 0;
    const pace = async () => {
      calls++;
      await new Promise((resolve) => setTimeout(resolve, 30));
    };
    const media = proxy.open(`${base}/movie.mkv`, {}, pace);
    const began = Date.now();
    const body = Buffer.from(await (await fetch(media.url)).arrayBuffer());
    expect(body.length).toBe(3072);
    expect(calls).toBeGreaterThanOrEqual(1);
    expect(Date.now() - began).toBeGreaterThanOrEqual(30 * calls - 5);
    const before = calls;
    const list = proxy.open(`${base}/list.m3u8`, {}, pace);
    expect(await (await fetch(list.url)).text()).toContain('#EXTM3U');
    expect(calls).toBe(before);
  });
});

describe('automatic subtitle choice', () => {
  const tracks = [
    { index: 0, label: 'İngilizce', language: 'eng', forced: false },
    { index: 1, label: 'Türkçe · Zorunlu', language: 'tur', forced: true },
    { index: 2, label: 'Türkçe · Tam', language: 'tur', forced: false },
  ];

  it('turns on full Turkish subtitles over another language', () => {
    expect(autoSubtitle(tracks, 'İngilizce', false)).toBe(2);
    expect(autoSubtitle(tracks, null, false)).toBe(2);
    expect(autoSubtitle([tracks[1]!], 'İngilizce', false)).toBe(1);
    expect(autoSubtitle([tracks[0]!], 'İngilizce', false)).toBeNull();
  });

  it('keeps only forced subtitles over Turkish audio, and nothing once turned off', () => {
    expect(autoSubtitle(tracks, 'Türkçe · Dublaj', false)).toBe(1);
    expect(autoSubtitle([tracks[2]!], 'Türkçe', false)).toBeNull();
    expect(autoSubtitle(tracks, 'İngilizce', true)).toBeNull();
  });
});
