import { it, expect, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { MusicHistory } from '../apps/services/music/history';
import { MusicWorker } from '../apps/services/music/worker';
it('persists bounded room-scoped sessions without exposing source URLs', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'rooms-music-history-test-'));
  try {
    const path = join(dir, 'history.json'),
      store = new MusicHistory(path),
      id = randomUUID(),
      track = { id: randomUUID(), title: 'Song', durationSec: 200, played: true };
    await store.save(
      'room-a',
      { id, startedAt: new Date().toISOString(), endedAt: null, tracks: [track] },
      ['https://www.youtube.com/watch?v=w2BTr6qsLFc'],
    );
    const restored = new MusicHistory(path);
    expect(await restored.list('room-b')).toEqual([]);
    expect(await restored.replay('room-b', id)).toBeNull();
    expect((await restored.list('room-a'))[0]?.tracks).toEqual([track]);
    expect(JSON.stringify(await restored.list('room-a'))).not.toContain('youtube.com');
    await expect(
      store.save(
        'room-a',
        { id, startedAt: new Date().toISOString(), endedAt: null, tracks: [track] },
        ['https://audio.test/private?token=secret'],
      ),
    ).rejects.toThrow();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
it('reorders without restarting audio, refuses stale membership, selects and replays a saved session', async () => {
  const history = new MusicHistory(),
    lease = { leaseId: randomUUID(), url: 'ws://qa.test', token: 'qa' },
    play = vi.fn(async () => {}),
    publisher = {
      connect: async () => {},
      pause: vi.fn(),
      play: async () => {},
      playYouTube: play,
      close: async () => {},
      position: () => 3,
    };
  const worker = new MusicWorker({
    history,
    publisher: () => publisher,
    lease: async () => lease,
    youtubeReferences: async (source) => [
      { source, title: source.includes('w2B') ? 'One' : 'Two', durationSec: 200 },
    ],
  });
  try {
    await worker.command('room-a', lease, {
      type: 'add',
      url: 'https://www.youtube.com/watch?v=w2BTr6qsLFc',
    });
    await worker.command('room-a', lease, {
      type: 'add',
      url: 'https://www.youtube.com/watch?v=M7lc1UVf-VE',
    });
    const initial = worker.snapshot('room-a'),
      ids = initial.queue.map((t) => t.id);
    const swapped = await worker.command('room-a', lease, {
      type: 'reorder',
      ids: ids.slice().reverse(),
    });
    expect(swapped.currentId).toBe(initial.currentId);
    expect(play).toHaveBeenCalledTimes(1);
    await expect(
      worker.command('room-a', lease, { type: 'reorder', ids: [ids[0]!] }),
    ).rejects.toThrow('MUSIC_QUEUE_CHANGED');
    await worker.command('room-a', lease, { type: 'select', id: ids[1]! });
    expect(play).toHaveBeenCalledTimes(2);
    expect(worker.snapshot('room-a').currentId).toBe(ids[1]);
    const session = (await history.list('room-a'))[0]!;
    await worker.command('room-a', lease, { type: 'stop' });
    expect((await history.list('room-a'))[0]!.endedAt).not.toBeNull();
    await expect(
      worker.command('room-b', lease, { type: 'restore', sessionId: session.id }),
    ).rejects.toThrow('MUSIC_HISTORY_MISSING');
    await worker.command('room-a', lease, { type: 'restore', sessionId: session.id });
    expect(worker.snapshot('room-a').queue.map((t) => t.title)).toEqual(['Two', 'One']);
    expect(play).toHaveBeenCalledTimes(3);
  } finally {
    await worker.close();
  }
});
it('reloads mixed Spotify and YouTube history without exposing metadata references in the public history', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'rooms-spotify-history-test-'));
  try {
    const path = join(dir, 'history.json'),
      id = randomUUID();
    const spotify = {
      spotifyTrackId: 'a'.repeat(22),
      title: 'Song',
      artists: ['Artist'],
      durationSec: 120,
    };
    const tracks = [
      { id: randomUUID(), title: 'Song', durationSec: 120, played: true },
      { id: randomUUID(), title: 'Next', durationSec: 180, played: false },
    ];
    await new MusicHistory(path).save(
      'room',
      { id, startedAt: new Date().toISOString(), endedAt: null, tracks },
      [spotify, 'https://www.youtube.com/watch?v=abcdefghijk'],
    );
    const restored = new MusicHistory(path);
    expect((await restored.replay('room', id))?.sources).toEqual([
      spotify,
      'https://www.youtube.com/watch?v=abcdefghijk',
    ]);
    expect(JSON.stringify(await restored.list('room'))).not.toMatch(/spotifyTrackId|youtube.com/);
    await expect(
      restored.save(
        'room',
        { id, startedAt: new Date().toISOString(), endedAt: null, tracks: [tracks[0]] },
        [{ ...spotify, token: 'private' } as typeof spotify],
      ),
    ).rejects.toThrow();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
