import { afterEach, expect, it, vi } from 'vitest';
import { mkdtemp, writeFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { MusicWorker } from '../apps/services/music/worker';
const workers: MusicWorker[] = [];
afterEach(async () => {
  for (const worker of workers.splice(0)) await worker.close();
});
async function setup() {
  const publisher = {
    connect: vi.fn(async () => {}),
    play: vi.fn(async () => {}),
    pause: vi.fn(),
    close: vi.fn(async () => {}),
    position: () => 0,
  };
  const lease = {
    leaseId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    url: 'ws://127.0.0.1',
    token: 'test-token',
  };
  const directories: string[] = [];
  const worker = new MusicWorker({
    publisher: () => publisher,
    lease: async () => lease,
    fetchFile: async () => {
      const directory = await mkdtemp(join(tmpdir(), 'rooms-music-test-'));
      directories.push(directory);
      const path = join(directory, 'source.mp3');
      await writeFile(path, 'fixture');
      return { directory, path, bytes: 7, title: 'Song', durationSec: 30 };
    },
  });
  workers.push(worker);
  return { publisher, worker, lease, directories };
}
it('publishes separately, shares a source-free snapshot and keeps control independent of the popup', async () => {
  const { worker, publisher, lease } = await setup();
  const first = await worker.command('room', lease, {
    type: 'add',
    url: 'https://audio.test/private.mp3?token=private',
  });
  expect(first.status).toBe('playing');
  expect(publisher.connect).toHaveBeenCalledTimes(1);
  expect(publisher.play).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(first)).not.toContain('private');
  await worker.command('room', lease, { type: 'pause' });
  expect(worker.snapshot('room').status).toBe('paused');
  await worker.command('room', lease, { type: 'play' });
  expect(publisher.play).toHaveBeenCalledTimes(2);
});
it('enqueue preserves playing or paused music while explicit play-now selects the first new item atomically', async () => {
  const { worker, publisher, lease } = await setup();
  const first = await worker.command('room', lease, {
    type: 'add',
    url: 'https://audio.test/one.mp3',
  });
  await worker.command('room', lease, { type: 'add', url: 'https://audio.test/two.mp3' });
  expect(worker.snapshot('room').currentId).toBe(first.currentId);
  expect(publisher.play).toHaveBeenCalledTimes(1);
  await worker.command('room', lease, { type: 'pause' });
  await worker.command('room', lease, { type: 'add', url: 'https://audio.test/three.mp3' });
  expect(worker.snapshot('room').status).toBe('paused');
  const now = await worker.command('room', lease, {
    type: 'add',
    url: 'https://audio.test/four.mp3',
    playNow: true,
  });
  expect(now.currentId).toBe(now.queue[3].id);
  expect(now.status).toBe('playing');
  expect(publisher.play).toHaveBeenCalledTimes(2);
});
it('next and previous use the server publisher and stop removes cached files', async () => {
  const { worker, publisher, lease, directories } = await setup();
  await worker.command('room', lease, { type: 'add', url: 'https://audio.test/one.mp3' });
  await worker.command('room', lease, { type: 'add', url: 'https://audio.test/two.mp3' });
  const ids = worker.snapshot('room').queue.map((q) => q.id);
  await worker.command('room', lease, { type: 'next' });
  expect(worker.snapshot('room').currentId).toBe(ids[1]);
  await worker.command('room', lease, { type: 'previous' });
  expect(worker.snapshot('room').currentId).toBe(ids[0]);
  await worker.command('room', lease, { type: 'stop' });
  expect(worker.snapshot('room').status).toBe('disconnected');
  expect(publisher.close).toHaveBeenCalled();
  for (const directory of directories) await expect(access(directory)).rejects.toThrow();
});
it('imports YouTube playlist references but downloads only the current audio file', async () => {
  const { publisher, lease } = await setup();
  let downloads = 0;
  const files: string[] = [];
  const worker = new MusicWorker({
    publisher: () => publisher,
    lease: async () => lease,
    youtubeReferences: async () => [
      { source: 'https://www.youtube.com/watch?v=PgHzDZJwGW8', title: 'One', durationSec: 30 },
      { source: 'https://www.youtube.com/watch?v=M7lc1UVf-VE', title: 'Two', durationSec: 40 },
    ],
    youtubeFile: async () => {
      downloads++;
      const directory = await mkdtemp(join(tmpdir(), 'rooms-music-yt-test-'));
      files.push(directory);
      const path = join(directory, 'source.mp3');
      await writeFile(path, 'fixture');
      return { directory, path, bytes: 7, title: 'Song', durationSec: 30 };
    },
  });
  workers.push(worker);
  await worker.command('youtube-room', lease, {
    type: 'add',
    url: 'https://www.youtube.com/playlist?list=PLabcdefgh123',
  });
  expect(downloads).toBe(1);
  expect(worker.snapshot('youtube-room').queue).toHaveLength(2);
  expect(JSON.stringify(worker.snapshot('youtube-room'))).not.toContain('youtube.com');
  await worker.command('youtube-room', lease, { type: 'next' });
  expect(downloads).toBe(2);
  await worker.command('youtube-room', lease, { type: 'previous' });
  expect(downloads).toBe(2);
});
it('starts a long YouTube set through the streaming publisher without a full-file download', async () => {
  const { publisher, lease } = await setup();
  const stream = vi.fn(async () => {});
  const download = vi.fn(async () => {
    throw new Error('Full-set download must not occur');
  });
  const worker = new MusicWorker({
    publisher: () => ({ ...publisher, playYouTube: stream }),
    lease: async () => lease,
    youtubeReferences: async () => [
      {
        source: 'https://www.youtube.com/watch?v=6MAzUT1YhWE',
        title: 'Live set',
        durationSec: 6128,
      },
    ],
    youtubeFile: download,
  });
  workers.push(worker);
  const snapshot = await worker.command('stream-room', lease, {
    type: 'add',
    url: 'https://www.youtube.com/watch?v=6MAzUT1YhWE',
  });
  expect(snapshot.status).toBe('playing');
  expect(snapshot.queue[0]?.durationSec).toBe(6128);
  expect(stream).toHaveBeenCalledTimes(1);
  expect(download).not.toHaveBeenCalled();
});
it('resolves song links once, publishes the matched YouTube source and labels the actual source', async () => {
  const { publisher, lease } = await setup();
  const playYouTube = vi.fn(async () => {}),
    metadata = vi.fn(async () => ({
      provider: 'spotify' as const,
      title: 'Song',
      artists: ['Artist'],
      durationSec: 30,
    })),
    match = vi.fn(async () => ({
      source: 'https://www.youtube.com/watch?v=PgHzDZJwGW8',
      title: 'Artist - Song',
      durationSec: 30,
      requestedProvider: 'spotify' as const,
    }));
  const worker = new MusicWorker({
    publisher: () => ({ ...publisher, playYouTube }),
    lease: async () => lease,
    songMetadata: metadata,
    matchingYouTubeReference: match,
  });
  workers.push(worker);
  const result = await worker.command('mirror-room', lease, {
    type: 'add',
    url: 'https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT',
  });
  expect(metadata).toHaveBeenCalledTimes(1);
  expect(match).toHaveBeenCalledTimes(1);
  expect(playYouTube).toHaveBeenCalledWith(
    'https://www.youtube.com/watch?v=PgHzDZJwGW8',
    0,
    expect.any(Function),
    expect.any(Function),
  );
  expect(result.queue[0]?.title).toBe('Artist - Song · YouTube');
  expect(JSON.stringify(result)).not.toMatch(/spotify.com|youtube.com|test-token/);
  await worker.command('mirror-room', lease, { type: 'pause' });
  await worker.command('mirror-room', lease, { type: 'play' });
  expect(metadata).toHaveBeenCalledTimes(1);
});
it('does not mutate a queue or publish a song on an uncertain match', async () => {
  const { publisher, lease } = await setup();
  const playYouTube = vi.fn(),
    worker = new MusicWorker({
      publisher: () => ({ ...publisher, playYouTube }),
      lease: async () => lease,
      songMetadata: async () => ({ provider: 'soundcloud', title: 'Song', artists: ['Artist'] }),
      matchingYouTubeReference: async () => {
        throw new Error('MUSIC_MIRROR_NOT_FOUND');
      },
    });
  workers.push(worker);
  await expect(
    worker.command('mirror-room', lease, {
      type: 'add',
      url: 'https://soundcloud.com/artist/song',
    }),
  ).rejects.toThrow('MUSIC_MIRROR_NOT_FOUND');
  expect(worker.snapshot('mirror-room').queue).toEqual([]);
  expect(playYouTube).not.toHaveBeenCalled();
});
it('retains an access rejection received after playback starts', async () => {
  const { publisher, lease } = await setup();
  let fail!: (error?: Error) => void;
  const worker = new MusicWorker({
    publisher: () => ({
      ...publisher,
      playYouTube: async (_source, _position, _ended, onError) => {
        fail = onError;
      },
    }),
    lease: async () => lease,
    youtubeReferences: async () => [
      { source: 'https://www.youtube.com/watch?v=PgHzDZJwGW8', title: 'Source', durationSec: 30 },
    ],
  });
  workers.push(worker);
  await worker.command('denied-room', lease, {
    type: 'add',
    url: 'https://www.youtube.com/watch?v=PgHzDZJwGW8',
  });
  fail(new Error('MUSIC_YOUTUBE_ACCESS_REQUIRED'));
  expect(worker.snapshot('denied-room').status).toBe('error');
  expect(worker.snapshot('denied-room').error).toBe('MUSIC_YOUTUBE_ACCESS_REQUIRED');
});
it('starts the newly requested source after the current source failed instead of retrying the failed item', async () => {
  const { publisher, lease } = await setup();
  const rejected = 'https://www.youtube.com/watch?v=PgHzDZJwGW8',
    next = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
  const playYouTube = vi.fn(async (source: string) => {
    if (source === rejected) throw Error('MUSIC_YOUTUBE_ACCESS_REQUIRED');
  });
  const worker = new MusicWorker({
    publisher: () => ({ ...publisher, playYouTube }),
    lease: async () => lease,
    youtubeReferences: async (source) => [
      {
        source,
        title: source === rejected ? 'Unavailable request' : 'New request',
        durationSec: 30,
      },
    ],
  });
  workers.push(worker);
  await expect(
    worker.command('recover-room', lease, { type: 'add', url: rejected }),
  ).rejects.toThrow('MUSIC_YOUTUBE_ACCESS_REQUIRED');
  const value = await worker.command('recover-room', lease, { type: 'add', url: next });
  expect(value.status).toBe('playing');
  expect(value.queue.find((t) => t.id === value.currentId)?.title).toBe('New request');
  expect(playYouTube).toHaveBeenLastCalledWith(next, 0, expect.any(Function), expect.any(Function));
  expect(value.queue).toHaveLength(2);
});
it('ignores a retired decoder failure after selecting another track or pausing', async () => {
  const { publisher, lease } = await setup(),
    failures: Array<(error?: Error) => void> = [];
  const worker = new MusicWorker({
    publisher: () => ({
      ...publisher,
      playYouTube: async (_source, _position, _ended, onError) => {
        failures.push(onError);
      },
    }),
    lease: async () => lease,
    youtubeReferences: async (source) => [{ source, title: 'Request', durationSec: 30 }],
  });
  workers.push(worker);
  await worker.command('race-room', lease, {
    type: 'add',
    url: 'https://www.youtube.com/watch?v=PgHzDZJwGW8',
  });
  await worker.command('race-room', lease, {
    type: 'add',
    url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  });
  await worker.command('race-room', lease, { type: 'next' });
  failures[0]!(Error('MUSIC_YOUTUBE_ACCESS_REQUIRED'));
  expect(worker.snapshot('race-room').status).toBe('playing');
  expect(worker.snapshot('race-room').error).toBeNull();
  await worker.command('race-room', lease, { type: 'pause' });
  failures[1]!(Error('MUSIC_DECODE_FAILED'));
  expect(worker.snapshot('race-room').status).toBe('paused');
  expect(worker.snapshot('race-room').error).toBeNull();
});
it('does not overwrite an immediate source failure with a playing result', async () => {
  const { publisher, lease } = await setup();
  const worker = new MusicWorker({
    publisher: () => ({
      ...publisher,
      playYouTube: async (_source, _position, _ended, onError) => {
        onError(Error('MUSIC_DECODE_FAILED'));
      },
    }),
    lease: async () => lease,
    youtubeReferences: async (source) => [{ source, title: 'Request', durationSec: 30 }],
  });
  workers.push(worker);
  const value = await worker.command('startup-failure-room', lease, {
    type: 'add',
    url: 'https://www.youtube.com/watch?v=PgHzDZJwGW8',
  });
  expect(value.status).toBe('error');
  expect(value.error).toBe('MUSIC_DECODE_FAILED');
});

it('resumes a stream with unknown provider duration at its actual paused position', async () => {
  const { publisher, lease } = await setup();
  const playYouTube = vi.fn(async () => {});
  const worker = new MusicWorker({
    publisher: () => ({ ...publisher, position: () => 12.5, playYouTube }),
    lease: async () => lease,
    youtubeReferences: async (source) => [{ source, title: 'Unknown duration', durationSec: 0 }],
  });
  workers.push(worker);
  await worker.command('unknown-length', lease, {
    type: 'add',
    url: 'https://www.youtube.com/watch?v=vKHu4uPOJVg',
  });
  await worker.command('unknown-length', lease, { type: 'pause' });
  await worker.command('unknown-length', lease, { type: 'play' });
  expect(playYouTube).toHaveBeenLastCalledWith(
    'https://www.youtube.com/watch?v=vKHu4uPOJVg',
    12.5,
    expect.any(Function),
    expect.any(Function),
  );
});

it('advances exactly once when a stream completes and ignores retired end events', async () => {
  const { publisher, lease } = await setup(),
    ends: Array<() => void> = [];
  const worker = new MusicWorker({
    publisher: () => ({
      ...publisher,
      playYouTube: async (_source, _position, ended) => {
        ends.push(ended);
      },
    }),
    lease: async () => lease,
    youtubeReferences: async () => [
      { source: 'https://www.youtube.com/watch?v=w2BTr6qsLFc', title: 'One', durationSec: 200 },
      { source: 'https://www.youtube.com/watch?v=vKHu4uPOJVg', title: 'Two', durationSec: 203 },
    ],
  });
  workers.push(worker);
  const first = await worker.command('auto-room', lease, {
    type: 'add',
    url: 'https://www.youtube.com/playlist?list=PLabcdefgh123',
  });
  ends[0]!();
  ends[0]!();
  await vi.waitFor(() => expect(worker.snapshot('auto-room').currentId).toBe(first.queue[1]!.id));
  expect(ends).toHaveLength(2);
  ends[0]!();
  await Promise.resolve();
  expect(worker.snapshot('auto-room').currentId).toBe(first.queue[1]!.id);
  ends[1]!();
  await vi.waitFor(() => expect(worker.snapshot('auto-room').status).toBe('paused'));
  expect(worker.snapshot('auto-room').positionSec).toBe(203);
});
it('seeks the active stream, preserves paused seeking, and rejects a retired track or out-of-range position', async () => {
  const { publisher, lease } = await setup(),
    playYouTube = vi.fn(async () => {});
  const worker = new MusicWorker({
    publisher: () => ({ ...publisher, playYouTube }),
    lease: async () => lease,
    youtubeReferences: async (source) => [{ source, title: 'One', durationSec: 200 }],
  });
  workers.push(worker);
  const state = await worker.command('seek-room', lease, {
      type: 'add',
      url: 'https://www.youtube.com/watch?v=w2BTr6qsLFc',
    }),
    id = state.currentId!;
  await worker.command('seek-room', lease, { type: 'seek', id, positionSec: 42.5 });
  expect(playYouTube).toHaveBeenLastCalledWith(
    'https://www.youtube.com/watch?v=w2BTr6qsLFc',
    42.5,
    expect.any(Function),
    expect.any(Function),
  );
  await worker.command('seek-room', lease, { type: 'pause' });
  const count = playYouTube.mock.calls.length;
  const paused = await worker.command('seek-room', lease, { type: 'seek', id, positionSec: 90 });
  expect(paused).toMatchObject({ status: 'paused', positionSec: 90 });
  expect(playYouTube).toHaveBeenCalledTimes(count);
  await worker.command('seek-room', lease, { type: 'play' });
  expect(playYouTube).toHaveBeenLastCalledWith(
    expect.any(String),
    90,
    expect.any(Function),
    expect.any(Function),
  );
  await expect(
    worker.command('seek-room', lease, {
      type: 'seek',
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      positionSec: 5,
    }),
  ).rejects.toThrow('MUSIC_CURRENT_ITEM');
  await expect(
    worker.command('seek-room', lease, { type: 'seek', id, positionSec: 201 }),
  ).rejects.toThrow('MUSIC_SEEK_INVALID');
});
it('rechecks decoder generation after a seek ahead of an already queued end callback', async () => {
  const { publisher, lease } = await setup(),
    ends: Array<() => void> = [];
  let gate: Promise<void> | undefined, release!: () => void;
  const worker = new MusicWorker({
    publisher: () => ({
      ...publisher,
      playYouTube: async (_source, _position, ended) => {
        ends.push(ended);
      },
    }),
    lease: async () => {
      if (gate) await gate;
      return lease;
    },
    youtubeReferences: async () => [
      { source: 'https://www.youtube.com/watch?v=w2BTr6qsLFc', title: 'One', durationSec: 200 },
      { source: 'https://www.youtube.com/watch?v=vKHu4uPOJVg', title: 'Two', durationSec: 203 },
    ],
  });
  workers.push(worker);
  const state = await worker.command('seek-race', lease, {
    type: 'add',
    url: 'https://www.youtube.com/playlist?list=PLabcdefgh123',
  });
  gate = new Promise((resolve) => {
    release = resolve;
  });
  const seeking = worker.command('seek-race', lease, {
    type: 'seek',
    id: state.currentId!,
    positionSec: 15,
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  ends[0]!();
  release();
  await seeking;
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(worker.snapshot('seek-race').currentId).toBe(state.currentId);
  expect(ends).toHaveLength(2);
});

it('restarts a finished last track from zero and starts a newly added track after queue completion', async () => {
  const { publisher, lease } = await setup();
  let end!: () => void;
  const playYouTube = vi.fn(async (_source: string, _offset: number, done: () => void) => {
    end = done;
  });
  const worker = new MusicWorker({
    publisher: () => ({ ...publisher, playYouTube }),
    lease: async () => lease,
    youtubeReferences: async (source) => [{ source, title: 'Song', durationSec: 200 }],
  });
  workers.push(worker);
  await worker.command('finished-room', lease, {
    type: 'add',
    url: 'https://www.youtube.com/watch?v=w2BTr6qsLFc',
  });
  end();
  await vi.waitFor(() => expect(worker.snapshot('finished-room').status).toBe('paused'));
  await worker.command('finished-room', lease, { type: 'play' });
  expect(playYouTube.mock.calls.at(-1)?.[1]).toBe(0);
  end();
  await vi.waitFor(() => expect(worker.snapshot('finished-room').status).toBe('paused'));
  await worker.command('finished-room', lease, {
    type: 'add',
    url: 'https://www.youtube.com/watch?v=M7lc1UVf-VE',
  });
  expect(playYouTube.mock.calls.at(-1)?.[0]).toContain('M7lc1UVf-VE');
  expect(worker.snapshot('finished-room').status).toBe('playing');
});
it('appends shared list references atomically, preserves pause, and rejects overflow without truncating', async () => {
  const { worker, lease } = await setup();
  const first = await worker.command('room', lease, {
    type: 'add',
    url: 'https://audio.test/one.mp3',
  });
  await worker.command('room', lease, { type: 'pause' });
  const tracks = [
    { videoId: 'abcdefghijk', title: 'Shared One', durationSec: 120 },
    { videoId: 'lmnopqrstuv', title: 'Shared Two', durationSec: 150 },
  ];
  const queued = await worker.command('room', lease, { type: 'add-list', tracks });
  expect(queued.currentId).toBe(first.currentId);
  expect(queued.status).toBe('paused');
  expect(queued.queue.map((t) => t.title)).toEqual(['Song', 'Shared One', 'Shared Two']);
  expect(await worker.references('room')).toEqual(tracks);
  await expect(
    worker.command('room', lease, {
      type: 'add-list',
      tracks: Array.from({ length: 98 }, () => tracks[0]),
    }),
  ).rejects.toThrow('MUSIC_QUEUE_FULL');
  expect(worker.snapshot('room').queue).toHaveLength(3);
});
it('picks a stream that broke off mid-song up where it stopped, then moves on', async () => {
  const { publisher, lease } = await setup(),
    failures: Array<(error?: Error) => void> = [];
  const playYouTube = vi.fn(async (_source: string, _position: number, _ended, onError) => {
    failures.push(onError);
  });
  const worker = new MusicWorker({
    publisher: () => ({ ...publisher, position: () => 95, playYouTube }),
    lease: async () => lease,
    youtubeReferences: async () => [
      { source: 'https://www.youtube.com/watch?v=w2BTr6qsLFc', title: 'One', durationSec: 200 },
      { source: 'https://www.youtube.com/watch?v=vKHu4uPOJVg', title: 'Two', durationSec: 203 },
    ],
  });
  workers.push(worker);
  const first = await worker.command('drop-room', lease, {
    type: 'add',
    url: 'https://www.youtube.com/playlist?list=PLabcdefgh123',
  });
  // Twice: the same song again from 95 s.
  for (let retry = 1; retry <= 2; retry++) {
    failures.at(-1)!(Error('MUSIC_YOUTUBE_UNAVAILABLE'));
    await vi.waitFor(() => expect(playYouTube).toHaveBeenCalledTimes(1 + retry));
    expect(playYouTube).toHaveBeenLastCalledWith(
      'https://www.youtube.com/watch?v=w2BTr6qsLFc',
      95,
      expect.any(Function),
      expect.any(Function),
    );
    expect(worker.snapshot('drop-room').status).toBe('playing');
  }
  // A third break skips to the next song and says so.
  failures.at(-1)!(Error('MUSIC_DECODE_FAILED'));
  await vi.waitFor(() => expect(worker.snapshot('drop-room').currentId).toBe(first.queue[1]!.id));
  expect(playYouTube).toHaveBeenLastCalledWith(
    'https://www.youtube.com/watch?v=vKHu4uPOJVg',
    0,
    expect.any(Function),
    expect.any(Function),
  );
  expect(worker.snapshot('drop-room')).toMatchObject({
    status: 'playing',
    error: 'MUSIC_TRACK_SKIPPED',
  });
});
it('skips tracks that cannot start when a song ends, but stops on an access refusal', async () => {
  const { publisher, lease } = await setup(),
    ends: Array<() => void> = [],
    failures: Array<(error?: Error) => void> = [];
  const broken = 'https://www.youtube.com/watch?v=vKHu4uPOJVg';
  const playYouTube = vi.fn(async (source: string, _position: number, ended, onError) => {
    if (source === broken) throw Error('MUSIC_YOUTUBE_UNAVAILABLE');
    ends.push(ended);
    failures.push(onError);
  });
  const worker = new MusicWorker({
    publisher: () => ({ ...publisher, playYouTube }),
    lease: async () => lease,
    youtubeReferences: async () => [
      { source: 'https://www.youtube.com/watch?v=w2BTr6qsLFc', title: 'One', durationSec: 200 },
      { source: broken, title: 'Gone', durationSec: 203 },
      { source: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', title: 'Three', durationSec: 212 },
    ],
  });
  workers.push(worker);
  const first = await worker.command('skip-room', lease, {
    type: 'add',
    url: 'https://www.youtube.com/playlist?list=PLabcdefgh123',
  });
  ends[0]!();
  await vi.waitFor(() => expect(worker.snapshot('skip-room').currentId).toBe(first.queue[2]!.id));
  expect(worker.snapshot('skip-room')).toMatchObject({
    status: 'playing',
    error: 'MUSIC_TRACK_SKIPPED',
  });
  failures.at(-1)!(Error('MUSIC_YOUTUBE_ACCESS_REQUIRED'));
  await Promise.resolve();
  expect(worker.snapshot('skip-room')).toMatchObject({
    status: 'error',
    error: 'MUSIC_YOUTUBE_ACCESS_REQUIRED',
    currentId: first.queue[2]!.id,
  });
});
it('clears the queue but for the current track and removes cached files', async () => {
  const { worker, lease, directories } = await setup();
  await worker.command('clear-room', lease, { type: 'add', url: 'https://audio.test/one.mp3' });
  await worker.command('clear-room', lease, { type: 'add', url: 'https://audio.test/two.mp3' });
  await worker.command('clear-room', lease, { type: 'add', url: 'https://audio.test/three.mp3' });
  const ids = worker.snapshot('clear-room').queue.map((q) => q.id);
  await worker.command('clear-room', lease, { type: 'next' });
  const value = await worker.command('clear-room', lease, { type: 'clear' });
  expect(value.queue.map((q) => q.id)).toEqual([ids[1]]);
  expect(value.currentId).toBe(ids[1]);
  expect(value.status).toBe('playing');
  await expect(access(directories[0]!)).rejects.toThrow();
  await access(directories[1]!);
});
it('starts a track added after an unknown-length last track ended, and Play restarts it', async () => {
  const { publisher, lease } = await setup(),
    ends: Array<() => void> = [];
  const playYouTube = vi.fn(async (_source: string, _position: number, ended: () => void) => {
    ends.push(ended);
  });
  const worker = new MusicWorker({
    publisher: () => ({ ...publisher, position: () => 241.7, playYouTube }),
    lease: async () => lease,
    youtubeReferences: async (source) => [{ source, title: 'Pasted', durationSec: 0 }],
  });
  workers.push(worker);
  await worker.command('unknown-end', lease, {
    type: 'add',
    url: 'https://www.youtube.com/watch?v=vKHu4uPOJVg',
  });
  ends[0]!();
  await vi.waitFor(() => expect(worker.snapshot('unknown-end').status).toBe('paused'));
  // Play at the end starts the track again instead of seeking past its end.
  await worker.command('unknown-end', lease, { type: 'play' });
  expect(playYouTube).toHaveBeenLastCalledWith(
    'https://www.youtube.com/watch?v=vKHu4uPOJVg',
    0,
    expect.any(Function),
    expect.any(Function),
  );
  ends[1]!();
  await vi.waitFor(() => expect(worker.snapshot('unknown-end').status).toBe('paused'));
  const added = await worker.command('unknown-end', lease, {
    type: 'add',
    url: 'https://www.youtube.com/watch?v=w2BTr6qsLFc',
  });
  expect(added.currentId).toBe(added.queue[1]!.id);
  expect(playYouTube).toHaveBeenLastCalledWith(
    'https://www.youtube.com/watch?v=w2BTr6qsLFc',
    0,
    expect.any(Function),
    expect.any(Function),
  );
});
it('keeps the session and its queue when a lease check fails only for a moment', async () => {
  vi.useFakeTimers();
  try {
    const { publisher, lease: grant } = await setup();
    let failure: Error | null = null;
    const worker = new MusicWorker({
      publisher: () => publisher,
      lease: async () => {
        if (failure) throw failure;
        return grant;
      },
      fetchFile: async () => {
        const directory = await mkdtemp(join(tmpdir(), 'rooms-music-test-'));
        const path = join(directory, 'source.mp3');
        await writeFile(path, 'fixture');
        return { directory, path, bytes: 7, title: 'Song', durationSec: 30 };
      },
    });
    workers.push(worker);
    await worker.command('blip', grant, { type: 'add', url: 'https://audio.test/one.mp3' });
    failure = new Error('MUSIC_LEASE_UNAVAILABLE');
    await vi.advanceTimersByTimeAsync(10_500);
    expect(worker.snapshot('blip').queue).toHaveLength(1);
    failure = new Error('MUSIC_LEASE_REVOKED');
    await vi.advanceTimersByTimeAsync(10_500);
    expect(worker.snapshot('blip').queue).toHaveLength(0);
  } finally {
    vi.useRealTimers();
  }
});
