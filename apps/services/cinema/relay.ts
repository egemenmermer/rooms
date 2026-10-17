import { spawn, type ChildProcess, type SpawnOptions } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { maskText } from '../../../packages/community-cinema/src/mask';
import { UpstreamProxy } from './upstream-proxy';

export type RelaySource = { url: string; headers: Record<string, string>; live: boolean };

export type RelayInfo = {
  session: string;
  live: boolean;
  /** Position of the work at output time 0 (VOD; the keyframe at or before `startSec`). */
  offsetSec: number;
  /** Changes on every new relay process, so players know to reload. */
  epoch: number;
  durationSec: number | null;
  startedAt: number;
  /** Seconds of media produced from output time 0 (the newest segment's end). */
  producedSec: number;
  /** Output time of the oldest segment still kept. */
  windowStartSec: number;
  /** EXT-X-PROGRAM-DATE-TIME of output time 0 (epoch ms), once the first playlist is read. */
  originPdtMs: number | null;
};

export type ProbeResult = {
  format: string;
  video: string | null;
  audio: string | null;
  durationSec: number | null;
};

type Spawner = (command: string, args: string[], options: SpawnOptions) => ChildProcess;

type Session = {
  id: string;
  communityId: string;
  key: string;
  live: boolean;
  startSec: number;
  offsetSec: number;
  epoch: number;
  durationSec: number | null;
  startedAt: number;
  dir: string;
  scope: string;
  args: (startNumber: number) => string[];
  process: ChildProcess | null;
  lastServed: number;
  restarts: number;
  state: 'starting' | 'running' | 'finished' | 'stopped';
  exited: boolean;
  durations: number[];
  firstSeq: number;
  stderr: string[];
  originPdtMs: number | null;
};

const FILE = /^(?:index\.m3u8|init\.mp4|seg\d{6,9}\.m4s)$/;
const SEGMENT_SEC = 2;
// The AAC encoder's priming delay: its first output sample is 1024 samples early.
const AAC_PRIMING_SEC = 1024 / 48_000;
const PROXIED = /http:\/\/127\.0\.0\.1:\d+\/[a-f0-9]{64}\/[a-f0-9]{32}\/[a-f0-9]{24}\/\S*/g;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const fail = (code: string) => new Error(code);
export const RELAY_ERRORS = new Set([
  'CINEMA_RELAY_BUSY',
  'CINEMA_CODEC_UNSUPPORTED',
  'CINEMA_PROVIDER_DENIED',
  'CINEMA_PROVIDER_UNREACHABLE',
  'CINEMA_STREAM_FAILED',
]);

/** Reads `#EXT-X-MEDIA-SEQUENCE` and segment durations, in sequence order. */
export function playlistSegments(text: string) {
  const first = Number(/#EXT-X-MEDIA-SEQUENCE:(\d+)/.exec(text)?.[1] ?? 0);
  const durations = [...text.matchAll(/#EXTINF:([\d.]+)/g)].map((m) => Number(m[1]));
  // ffmpeg writes each segment's PROGRAM-DATE-TIME between its EXTINF and its URI, so the
  // first one in the list belongs to the first listed segment.
  const pdt = Date.parse(/#EXT-X-PROGRAM-DATE-TIME:(\S+)/.exec(text)?.[1] ?? '');
  return {
    first,
    durations,
    ended: text.includes('#EXT-X-ENDLIST'),
    /** PROGRAM-DATE-TIME of the first listed segment, or null. */
    firstPdtMs: Number.isFinite(pdt) ? pdt : null,
  };
}

/**
 * ffmpeg arguments for one relay process (cwd = the session directory).
 *
 * Video is copied (HEVC gets the `hvc1` tag MSE expects); audio becomes AAC stereo.
 * Output is HLS with fMP4 segments. Live keeps an 8-segment window with
 * program-date-time. VOD is read at real time after a short burst
 * (`-readrate 1`, with catch-up when it lags) and keeps a sliding window of about
 * `vodWindowSec`, so a long film never fills the tmpfs. To hls.js the VOD playlist
 * therefore looks live: no `#EXT-X-PLAYLIST-TYPE`, a moving `#EXT-X-MEDIA-SEQUENCE`,
 * and `#EXT-X-ENDLIST` appended once ffmpeg reaches the end. Players must seek
 * explicitly (hls.js `startPosition`), not rely on live-edge defaults. Output time 0
 * is the keyframe at or before `startSec` (stream copy cannot cut inside a GOP).
 *
 * Track timing lives in each fragment's decode time, never in edit lists: Chromium's
 * MSE ignores the empty edits ffmpeg writes by default, which put the audio (cut
 * exactly at `startSec`) up to one GOP ahead of the video.
 */
export function relayArgs(input: {
  url: string;
  live: boolean;
  startSec: number;
  probe: ProbeResult;
  startNumber: number;
  vodWindowSec: number;
  discontinuity: boolean;
}) {
  const { probe, live } = input;
  const network = [
    '-rw_timeout',
    '15000000',
    '-protocol_whitelist',
    'http,tcp,crypto',
    // HTTP input.
    '-reconnect',
    '1',
    '-reconnect_on_network_error',
    '1',
    '-reconnect_delay_max',
    '5',
    ...(live ? ['-reconnect_streamed', '1'] : []),
    // HLS input (ffmpeg rejects these for other demuxers): one upstream connection,
    // lenient segment names (the proxy already confines every request to the
    // provider), a few segment retries.
    ...(/\bhls\b/.test(probe.format)
      ? [
          '-http_multiple',
          '0',
          '-allowed_extensions',
          'ALL',
          '-allowed_segment_extensions',
          'ALL',
          '-extension_picky',
          '0',
          '-seg_max_retry',
          '3',
        ]
      : []),
  ];
  const pacing = live
    ? ['-fflags', '+genpts+discardcorrupt', '-analyzeduration', '1000000', '-probesize', '1000000']
    : [
        '-readrate',
        '1',
        '-readrate_initial_burst',
        '15',
        '-readrate_catchup',
        '1.5',
        ...(input.startSec > 0 ? ['-ss', input.startSec.toFixed(3)] : []),
      ];
  const flags = [
    'delete_segments',
    'independent_segments',
    'temp_file',
    // Every playlist carries PROGRAM-DATE-TIME: players map it to the work's timeline.
    'program_date_time',
    ...(input.discontinuity ? ['discont_start'] : []),
  ];
  return [
    '-hide_banner',
    '-nostdin',
    '-loglevel',
    'warning',
    ...network,
    ...pacing,
    '-i',
    input.url,
    ...(probe.video ? ['-map', '0:v:0', '-c:v', 'copy'] : []),
    ...(probe.video === 'hevc' ? ['-tag:v', 'hvc1'] : []),
    ...(probe.audio
      ? ['-map', '0:a:0', '-c:a', 'aac', '-ac', '2', '-ar', '48000', '-b:a', '192k']
      : []),
    '-sn',
    '-dn',
    '-f',
    'hls',
    '-hls_time',
    String(SEGMENT_SEC),
    '-hls_segment_type',
    'fmp4',
    '-hls_fmp4_init_filename',
    'init.mp4',
    '-hls_segment_filename',
    'seg%06d.m4s',
    '-hls_list_size',
    String(live ? 8 : Math.max(8, Math.ceil(input.vodWindowSec / SEGMENT_SEC))),
    '-hls_flags',
    flags.join('+'),
    '-hls_segment_options',
    'movflags=+frag_discont+negative_cts_offsets:use_editlist=0',
    '-start_number',
    String(input.startNumber),
    'index.m3u8',
  ];
}

/**
 * Server-side relays: one upstream connection per running item, remuxed by ffmpeg into
 * HLS on the tmpfs and served to every hall member. ffmpeg and ffprobe only reach the
 * provider through {@link UpstreamProxy}, run with an empty environment, and never see
 * a provider URL.
 */
export class RelayManager {
  private readonly sessions = new Map<string, Session>();
  private readonly pending = new Map<string, Promise<RelayInfo>>();
  private readonly lanes = new Map<string, Promise<unknown>>();
  private proxy: Promise<UpstreamProxy> | null = null;
  private epochs = 0;
  private closed = false;
  private readonly ticker: ReturnType<typeof setInterval>;

  constructor(
    private readonly options: {
      directory: string;
      ffmpeg?: string;
      ffprobe?: string;
      idleMs?: number;
      allowPrivateNetwork?: boolean;
      userAgent: string;
      log?: (line: string) => void;
      /** Seconds kept behind the newest VOD segment. */
      vodWindowSec?: number;
      readyTimeoutMs?: number;
      /** Tests replace the ffmpeg process and the probe. */
      spawn?: Spawner;
      probe?: (url: string) => Promise<ProbeResult>;
    },
  ) {
    this.ticker = setInterval(() => void this.tick(), 2000);
    this.ticker.unref?.();
  }

  async acquire(input: {
    communityId: string;
    key: string;
    source: RelaySource;
    startSec?: number;
    slots: number;
  }): Promise<RelayInfo> {
    if (this.closed || input.slots < 1) throw fail('CINEMA_RELAY_BUSY');
    const startSec = input.source.live ? 0 : Math.max(0, input.startSec ?? 0);
    const id = `${input.communityId}\n${input.key}`;
    const pending = this.pending.get(id);
    if (pending) return pending;
    const existing = this.find(input.communityId, input.key);
    if (existing && existing.state !== 'starting' && existing.startSec === startSec) {
      existing.lastServed = Date.now();
      return this.info(existing);
    }
    const lane = this.lanes.get(input.communityId) ?? Promise.resolve();
    const run = lane.catch(() => {}).then(() => this.start({ ...input, startSec }));
    const tracked = run.finally(() => {
      this.pending.delete(id);
      if (this.lanes.get(input.communityId) === tracked) this.lanes.delete(input.communityId);
    });
    this.pending.set(id, tracked);
    this.lanes.set(input.communityId, tracked);
    return tracked;
  }

  touch(session: string) {
    const value = this.sessions.get(session);
    if (value) value.lastServed = Date.now();
  }

  sessionsOf(communityId: string): RelayInfo[] {
    return [...this.sessions.values()]
      .filter((s) => s.communityId === communityId && s.state !== 'starting')
      .map((s) => this.info(s));
  }

  async file(session: string, name: string): Promise<{ body: Buffer; type: string } | null> {
    if (!FILE.test(name)) return null;
    const value = this.sessions.get(session);
    if (!value || value.state === 'starting') return null;
    value.lastServed = Date.now();
    let body: Buffer;
    try {
      body = await readFile(join(value.dir, name));
    } catch {
      return null;
    }
    if (name === 'index.m3u8') this.observe(value, body.toString('utf8'));
    return {
      body,
      type: name.endsWith('.m3u8') ? 'application/vnd.apple.mpegurl' : 'video/mp4',
    };
  }

  async stop(session: string) {
    const value = this.sessions.get(session);
    if (!value) return;
    value.state = 'stopped';
    this.sessions.delete(session);
    await this.kill(value.process);
    value.process = null;
    (await this.proxy)?.revoke(value.scope);
    await rm(value.dir, { recursive: true, force: true });
    this.log(`relay ${value.id.slice(0, 8)} stopped`);
  }

  async stopCommunity(communityId: string) {
    await Promise.all(
      [...this.sessions.values()]
        .filter((s) => s.communityId === communityId)
        .map((s) => this.stop(s.id)),
    );
  }

  async close() {
    this.closed = true;
    clearInterval(this.ticker);
    await Promise.all([...this.sessions.keys()].map((id) => this.stop(id)));
    (await this.proxy)?.close();
  }

  private find(communityId: string, key: string) {
    for (const s of this.sessions.values())
      if (s.communityId === communityId && s.key === key && s.state !== 'stopped') return s;
    return null;
  }

  private info(s: Session): RelayInfo {
    const produced = s.durations.reduce((sum, d) => sum + (d ?? SEGMENT_SEC), 0);
    let windowStart = 0;
    for (let i = 0; i < s.firstSeq; i++) windowStart += s.durations[i] ?? SEGMENT_SEC;
    return {
      session: s.id,
      live: s.live,
      offsetSec: s.offsetSec,
      epoch: s.epoch,
      durationSec: s.durationSec,
      startedAt: s.startedAt,
      producedSec: Math.round(produced * 1000) / 1000,
      windowStartSec: Math.round(windowStart * 1000) / 1000,
      originPdtMs: s.originPdtMs,
    };
  }

  private observe(s: Session, text: string) {
    const { first, durations, firstPdtMs } = playlistSegments(text);
    s.firstSeq = first;
    durations.forEach((d, i) => (s.durations[first + i] = d));
    // ffmpeg stamps each segment at the muxer's start time plus the durations before it.
    if (s.originPdtMs === null && firstPdtMs !== null) {
      let before = 0;
      for (let i = 0; i < first; i++) before += s.durations[i] ?? SEGMENT_SEC;
      s.originPdtMs = Math.round(firstPdtMs - before * 1000);
    }
    return durations.length;
  }

  private async start(input: {
    communityId: string;
    key: string;
    source: RelaySource;
    startSec: number;
    slots: number;
  }): Promise<RelayInfo> {
    const previous = this.find(input.communityId, input.key);
    if (previous) await this.stop(previous.id);
    const running = [...this.sessions.values()]
      .filter((s) => s.communityId === input.communityId)
      .sort((a, b) => a.lastServed - b.lastServed);
    while (running.length >= input.slots) await this.stop(running.shift()!.id);

    this.proxy ??= UpstreamProxy.start({
      userAgent: this.options.userAgent,
      allowPrivateNetwork: this.options.allowPrivateNetwork,
    });
    const proxy = await this.proxy;
    const { scope, url } = proxy.open(input.source.url, input.source.headers);
    const id = randomBytes(16).toString('hex');
    const now = Date.now();
    const session: Session = {
      id,
      communityId: input.communityId,
      key: input.key,
      live: input.source.live,
      startSec: input.startSec,
      offsetSec: input.startSec,
      epoch: ++this.epochs,
      durationSec: null,
      startedAt: now,
      dir: join(this.options.directory, id),
      scope,
      args: () => [],
      process: null,
      lastServed: now,
      restarts: 0,
      state: 'starting',
      exited: false,
      durations: [],
      firstSeq: 0,
      stderr: [],
      originPdtMs: null,
    };
    this.sessions.set(id, session);
    const upstreamError = (fallback: string) => {
      const failure = proxy.failure(scope);
      return fail(
        failure === 'denied'
          ? 'CINEMA_PROVIDER_DENIED'
          : failure === 'unreachable'
            ? 'CINEMA_PROVIDER_UNREACHABLE'
            : fallback,
      );
    };
    try {
      await mkdir(this.options.directory, { recursive: true, mode: 0o700 });
      await mkdir(session.dir, { mode: 0o700 });
      let probe: ProbeResult;
      try {
        probe = await (this.options.probe ?? ((target) => this.probe(target)))(url);
      } catch {
        throw upstreamError('CINEMA_STREAM_FAILED');
      }
      if (probe.video && probe.video !== 'h264' && probe.video !== 'hevc')
        throw fail('CINEMA_CODEC_UNSUPPORTED');
      if (!probe.video && !probe.audio) throw fail('CINEMA_STREAM_FAILED');
      session.durationSec = session.live ? null : probe.durationSec;
      session.args = (startNumber) =>
        relayArgs({
          url,
          live: session.live,
          startSec: session.startSec,
          probe,
          startNumber,
          vodWindowSec: this.options.vodWindowSec ?? 180,
          discontinuity: startNumber > 0,
        });
      this.log(
        `relay ${id.slice(0, 8)} starting ${session.live ? 'live' : `vod@${session.startSec}`} video=${probe.video ?? '-'} audio=${probe.audio ?? '-'}`,
      );
      this.launch(session, 0);
      const ended = await this.ready(session, upstreamError);
      if (!session.exited) session.state = 'running';
      else if (!session.live && ended) session.state = 'finished';
      else throw upstreamError('CINEMA_STREAM_FAILED');
      // Without audio the offset stays `startSec`, up to one GOP late.
      if (!session.live && session.startSec > 0 && probe.audio) {
        const measured = await this.audioStart(session);
        if (measured !== null)
          session.offsetSec = Math.max(0, session.startSec - measured - AAC_PRIMING_SEC);
      }
      this.log(`relay ${id.slice(0, 8)} ready in ${Date.now() - now} ms`);
      return this.info(session);
    } catch (error) {
      this.log(
        `relay ${id.slice(0, 8)} failed: ${error instanceof Error ? error.message : 'error'} ${this.tail(session)}`,
      );
      await this.stop(id);
      const message = error instanceof Error ? error.message : '';
      throw RELAY_ERRORS.has(message) ? error : fail('CINEMA_STREAM_FAILED');
    }
  }

  private launch(session: Session, startNumber: number) {
    session.exited = false;
    const child = (this.options.spawn ?? spawn)(
      this.options.ffmpeg ?? 'ffmpeg',
      session.args(startNumber),
      {
        cwd: session.dir,
        stdio: ['ignore', 'ignore', 'pipe'],
        env: { PATH: process.env.PATH ?? '' },
      },
    );
    session.process = child;
    child.stderr?.setEncoding('utf8');
    child.stderr?.on('data', (chunk: string) => {
      for (const line of chunk.split('\n'))
        if (line.trim()) session.stderr.push(line.trim().slice(0, 300));
      if (session.stderr.length > 20) session.stderr.splice(0, session.stderr.length - 20);
    });
    child.on('error', () => {
      session.exited = true;
    });
    child.on('exit', (code) => {
      if (session.process !== child) return;
      session.process = null;
      session.exited = true;
      if (session.state === 'stopped' || session.state === 'starting') return;
      if (!session.live && code === 0) {
        session.state = 'finished';
        return;
      }
      if (session.live && session.restarts < 1) {
        session.restarts++;
        const next = session.durations.length;
        this.log(`relay ${session.id.slice(0, 8)} restarting at segment ${next}`);
        this.launch(session, next);
        return;
      }
      this.log(`relay ${session.id.slice(0, 8)} ended (${code}) ${this.tail(session)}`);
      void this.stop(session.id);
    });
  }

  private async ready(session: Session, upstreamError: (fallback: string) => Error) {
    const deadline = Date.now() + (this.options.readyTimeoutMs ?? 20_000);
    for (;;) {
      if (session.state === 'stopped') throw fail('CINEMA_STREAM_FAILED');
      let text = '';
      try {
        text = await readFile(join(session.dir, 'index.m3u8'), 'utf8');
      } catch {
        text = '';
      }
      const count = text ? this.observe(session, text) : 0;
      const ended = text.includes('#EXT-X-ENDLIST');
      // One live segment is enough to start: players align to the live edge themselves.
      if (count >= (session.live ? 1 : 2) || (count >= 1 && ended)) return ended;
      if (session.exited) throw upstreamError('CINEMA_STREAM_FAILED');
      if (Date.now() > deadline) throw upstreamError('CINEMA_STREAM_FAILED');
      await sleep(200);
    }
  }

  private run(command: string, args: string[], cwd?: string, timeoutMs = 20_000) {
    return new Promise<string>((resolve, reject) => {
      const child = spawn(command, args, {
        cwd,
        stdio: ['ignore', 'pipe', 'ignore'],
        env: { PATH: process.env.PATH ?? '' },
      });
      let out = '';
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (chunk: string) => {
        out += chunk;
        if (out.length > 1_000_000) child.kill('SIGKILL');
      });
      const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
      child.on('error', reject);
      child.on('exit', (code) => {
        clearTimeout(timer);
        if (code === 0) resolve(out);
        else reject(fail('CINEMA_STREAM_FAILED'));
      });
    });
  }

  private async probe(url: string): Promise<ProbeResult> {
    const out = await this.run(this.options.ffprobe ?? 'ffprobe', [
      '-v',
      'error',
      '-rw_timeout',
      '15000000',
      '-protocol_whitelist',
      'http,tcp,crypto',
      '-http_multiple',
      '0',
      '-allowed_extensions',
      'ALL',
      '-allowed_segment_extensions',
      'ALL',
      '-extension_picky',
      '0',
      // MPEG-TS declares its codecs in the PMT; 1.5 s is plenty and keeps zapping quick
      // (Kanal measured 3.3 s zaps with libavformat's 5 s default).
      '-analyzeduration',
      '1500000',
      '-probesize',
      '3000000',
      '-print_format',
      'json',
      '-show_streams',
      '-show_format',
      url,
    ]);
    const json = JSON.parse(out) as {
      streams?: { codec_type?: string; codec_name?: string }[];
      format?: { format_name?: string; duration?: string };
    };
    const stream = (type: string) =>
      json.streams?.find((s) => s.codec_type === type)?.codec_name ?? null;
    const duration = Number(json.format?.duration);
    return {
      format: json.format?.format_name ?? '',
      video: stream('video'),
      audio: stream('audio'),
      durationSec: Number.isFinite(duration) && duration > 0 ? duration : null,
    };
  }

  /**
   * How far the audio, which ffmpeg cuts exactly at `startSec`, starts after the video
   * in the first segment. Read from the fragments themselves: the HLS demuxer rebases
   * every stream's start time.
   */
  private async audioStart(session: Session) {
    try {
      const playlist = await readFile(join(session.dir, 'index.m3u8'), 'utf8');
      const segment = playlist
        .split('\n')
        .find((line) => FILE.test(line.trim()) && line.endsWith('.m4s'));
      if (!segment) return null;
      const out = await this.run(
        this.options.ffprobe ?? 'ffprobe',
        [
          '-v',
          'error',
          '-protocol_whitelist',
          'file,concat',
          '-show_entries',
          'stream=codec_type,start_time',
          '-of',
          'json',
          `concat:init.mp4|${segment.trim()}`,
        ],
        session.dir,
        10_000,
      );
      const streams = (
        JSON.parse(out) as { streams?: { codec_type?: string; start_time?: string }[] }
      ).streams;
      const start = (type: string) =>
        Number(streams?.find((s) => s.codec_type === type)?.start_time);
      const value = start('audio') - start('video');
      return Number.isFinite(value) && value >= 0 ? value : null;
    } catch {
      return null;
    }
  }

  private async kill(child: ChildProcess | null) {
    if (!child || child.exitCode !== null || child.signalCode !== null) return;
    const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()));
    child.kill('SIGTERM');
    const done = await Promise.race([exited.then(() => true), sleep(3000).then(() => false)]);
    if (!done) {
      child.kill('SIGKILL');
      await Promise.race([exited, sleep(1000)]);
    }
  }

  private async tick() {
    const now = Date.now();
    const idle = this.options.idleMs ?? 60_000;
    for (const session of [...this.sessions.values()]) {
      if (session.state === 'starting') continue;
      if (now - session.lastServed > idle) {
        this.log(`relay ${session.id.slice(0, 8)} idle`);
        await this.stop(session.id);
        continue;
      }
      try {
        this.observe(session, await readFile(join(session.dir, 'index.m3u8'), 'utf8'));
      } catch {
        // Not written yet, or being replaced.
      }
    }
  }

  private tail(session: Session) {
    return session.stderr
      .slice(-3)
      .map((line) => maskText(line.replace(PROXIED, '<upstream>')))
      .join(' | ');
  }

  private log(line: string) {
    this.options.log?.(maskText(line.replace(PROXIED, '<upstream>')));
  }
}
