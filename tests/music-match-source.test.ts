import { EventEmitter } from 'node:events';
import { afterEach, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({
  output: '',
  error: '',
  exit: 0,
  queue: [] as string[],
  calls: [] as string[][],
}));
vi.mock('node:child_process', () => ({
  spawn: (_command: string, args: string[]) => {
    mock.calls.push(args);
    const output = mock.queue.shift() ?? mock.output;
    const child = Object.assign(new EventEmitter(), {
      stdout: new EventEmitter(),
      stderr: new EventEmitter(),
      kill: vi.fn(),
    });
    queueMicrotask(() => {
      child.stdout.emit('data', output);
      child.stderr.emit('data', mock.error);
      child.emit('close', mock.exit);
    });
    return child;
  },
}));
import { matchingYouTubeReference } from '../apps/services/music/youtube-source';
const song = {
  provider: 'spotify' as const,
  title: 'Recording',
  artists: ['Artist'],
  durationSec: 120,
};
afterEach(() => {
  vi.unstubAllEnvs();
  mock.error = '';
  mock.exit = 0;
  mock.queue = [];
  mock.calls = [];
});
it('keeps unavailable searches and provider access rejection distinct from musical mismatch', async () => {
  vi.stubEnv('ROOMS_YOUTUBE_COOKIE_FILE', '');
  mock.output = 'not-json';
  await expect(matchingYouTubeReference(song)).rejects.toThrow('MUSIC_SEARCH_UNAVAILABLE');
  mock.output = '{}';
  await expect(matchingYouTubeReference(song)).rejects.toThrow('MUSIC_SEARCH_UNAVAILABLE');
  mock.exit = 1;
  mock.error = 'Sign in to confirm you are not a bot';
  await expect(matchingYouTubeReference(song)).rejects.toThrow('MUSIC_YOUTUBE_ACCESS_REQUIRED');
});
it('offers bounded sanitized choices after a mismatch even when some extractor entries are missing', async () => {
  vi.stubEnv('ROOMS_YOUTUBE_COOKIE_FILE', '');
  mock.output = JSON.stringify({
    entries: [
      null,
      { id: 'abcdefghijk', title: 'Other recording', duration: 150 },
      { id: 'lmnopqrstuv', title: '\u0000', duration: 100 },
      { id: '12345678901', title: 'Live', duration: 100, is_live: true },
    ],
  });
  const result = await matchingYouTubeReference(song).catch((e) => e);
  expect(result.message).toBe('MUSIC_MIRROR_NOT_FOUND');
  expect(result.candidates).toEqual([
    { id: 'abcdefghijk', title: 'Other recording', durationSec: 150 },
  ]);
});
it('lets a playlist search once more with the plain artist and title and take a looser match', async () => {
  vi.stubEnv('ROOMS_YOUTUBE_COOKIE_FILE', '');
  const listed = {
    ...song,
    title: 'Recording (feat. Guest) - Radio Edit',
    artists: ['Artist', 'Guest'],
  };
  const first = JSON.stringify({
    entries: [{ id: 'abcdefghijk', title: 'Unrelated', duration: 120 }],
  });
  const second = JSON.stringify({
    entries: [{ id: 'lmnopqrstuv', title: 'Artist - Recording (Official Video)', duration: 131 }],
  });
  mock.queue = [first, second];
  await expect(matchingYouTubeReference(listed)).rejects.toThrow('MUSIC_MIRROR_NOT_FOUND');
  expect(mock.calls).toHaveLength(1);
  mock.queue = [first, second];
  mock.calls = [];
  await expect(matchingYouTubeReference(listed, { loose: true })).resolves.toMatchObject({
    source: 'https://www.youtube.com/watch?v=lmnopqrstuv',
    durationSec: 131,
  });
  expect(mock.calls.map((args) => args.at(-1))).toEqual([
    'ytsearch5:Artist Guest Recording (feat. Guest) - Radio Edit',
    'ytsearch10:Artist Recording',
  ]);
});
