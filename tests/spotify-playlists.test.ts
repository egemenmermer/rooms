import { afterEach, expect, it, vi } from 'vitest';
import { spotifyPlaylist } from '../apps/services/music/spotify-playlist';
import type { matchingYouTubeReference } from '../apps/services/music/youtube-source';
import { MusicWorker } from '../apps/services/music/worker';
import { MusicHistory } from '../apps/services/music/history';
import { playlistChangeSchema } from '../packages/shared-contracts/src/music-playlists';
import { parseSongLink } from '../packages/shared-contracts/src/song-links';
const id = 'a'.repeat(22),
  url = `https://open.spotify.com/playlist/${id}`;
const track = {
  spotifyTrackId: 'b'.repeat(22),
  title: 'Song',
  artists: ['Artist'],
  durationSec: 123,
};
const row = {
  uri: `spotify:track:${track.spotifyTrackId}`,
  title: 'Song',
  subtitle: 'Artist',
  duration: 123000,
  entityType: 'track',
  audioPreview: { url: 'never-read' },
};
const response = (rows: unknown[], extra = {}) =>
  new Response(
    `<script id="__NEXT_DATA__">${JSON.stringify({ props: { pageProps: { state: { data: { entity: { id, type: 'playlist', name: 'Mix', trackList: rows, ...extra } } } } } })}</script>`,
  );
it('canonicalizes playlists, preserves order and duplicates without fetching previews or credentials', async () => {
  expect(parseSongLink(url + '?si=tracking')?.url).toBe(url);
  expect(parseSongLink(url.replace('/playlist/', '/intl-tr/playlist/'))?.url).toBe(url);
  expect(playlistChangeSchema.parse({ op: 'import', name: 'Mix', url }).op).toBe('import');
  const request = vi.fn(async () => response([row, { ...row, title: 'Second' }, row]));
  const result = await spotifyPlaylist(url, request);
  expect(result.tracks.map((t) => t.title)).toEqual(['Song', 'Second', 'Song']);
  expect(result.tracks[0]).toEqual(track);
  expect(request).toHaveBeenCalledTimes(1);
  expect(request).toHaveBeenCalledWith(
    `https://open.spotify.com/embed/playlist/${id}`,
    expect.objectContaining({ allowedHosts: ['open.spotify.com'], allowedProtocols: ['https:'] }),
  );
  expect(JSON.stringify([result, request.mock.calls])).not.toMatch(
    /never-read|Cookie|Authorization/,
  );
});
it.each([
  [[], {}, 'EMPTY'],
  [Array(100).fill(row), {}, 'LIMIT'],
  [[row], { id: 'wrong' }, 'UNAVAILABLE'],
  [[{ ...row, uri: 'spotify:episode:bad' }], {}, 'INCOMPLETE'],
  [[{ ...row, duration: 8000000 }], {}, 'INCOMPLETE'],
])('rejects empty, truncated or incomplete lists atomically', async (rows, extra, code) => {
  await expect(spotifyPlaylist(url, async () => response(rows, extra))).rejects.toThrow(
    `MUSIC_SPOTIFY_PLAYLIST_${code}`,
  );
});
it('rejects failed/private metadata and invalid source hosts', async () => {
  const request = vi.fn(async () => new Response('', { status: 403 }));
  await expect(spotifyPlaylist(url, request)).rejects.toThrow('MUSIC_SPOTIFY_PLAYLIST_UNAVAILABLE');
  await expect(spotifyPlaylist('https://evil.test/playlist/' + id, request)).rejects.toThrow(
    'MUSIC_PLAYLIST_INVALID',
  );
  expect(request).toHaveBeenCalledTimes(1);
});
const workers: MusicWorker[] = [];
afterEach(async () => {
  for (const w of workers.splice(0)) await w.close();
});
const lease = {
  leaseId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  url: 'ws://127.0.0.1',
  token: 'test',
};
function setup(
  matcher = vi.fn<typeof matchingYouTubeReference>(async () => ({
    source: 'https://www.youtube.com/watch?v=abcdefghijk',
    title: 'Matched',
    durationSec: 123,
    requestedProvider: 'spotify' as const,
  })),
) {
  const publisher = {
    connect: vi.fn(async () => {}),
    pause: vi.fn(),
    close: vi.fn(async () => {}),
    position: () => 0,
    play: vi.fn(async () => {}),
    playYouTube: vi.fn(async (_url: string, _position: number, _ended: () => void) => {}),
  };
  const history = new MusicHistory();
  const worker = new MusicWorker({
    publisher: () => publisher,
    lease: async () => lease,
    history,
    matchingYouTubeReference: matcher,
    spotifyPlaylist: async () => ({
      name: 'Mix',
      tracks: [track, { ...track, title: 'Second' }, track],
    }),
  });
  workers.push(worker);
  return { worker, publisher, matcher, history };
}
it('queues all metadata, resolves only the playing track and advances when audio ends', async () => {
  const { worker, publisher, matcher } = setup();
  const result = await worker.command('room', lease, { type: 'add', url });
  expect(result.status).toBe('playing');
  expect(result.queue).toHaveLength(3);
  expect(matcher).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(result)).not.toMatch(/spotifyTrackId|open.spotify.com/);
  expect(await worker.references('room')).toEqual([track, { ...track, title: 'Second' }, track]);
  publisher.playYouTube.mock.calls[0][2]();
  await vi.waitFor(() => expect(publisher.playYouTube).toHaveBeenCalledTimes(2));
  expect(matcher.mock.calls[1][0]).toMatchObject({ title: 'Second' });
  expect(worker.snapshot('room').currentId).toBe(result.queue[1].id);
});
it('preserves pending Spotify tracks through history and replay', async () => {
  const { worker, history } = setup();
  await worker.command('room', lease, { type: 'add', url });
  await worker.command('room', lease, { type: 'stop' });
  const [session] = await history.list('room');
  expect(await worker.references('room', session.id)).toEqual([
    track,
    { ...track, title: 'Second' },
    track,
  ]);
  const result = await worker.command('room', lease, { type: 'restore', sessionId: session.id });
  expect(result.queue).toHaveLength(3);
  expect(result.status).toBe('playing');
});
it('keeps an imported queue after a matching failure instead of offering an uncommitted candidate', async () => {
  const matcher = vi.fn(async () => {
    throw Error('MUSIC_MIRROR_NOT_FOUND');
  });
  const { worker } = setup(matcher);
  const result = await worker.command('room', lease, { type: 'add', url, offerCandidates: true });
  expect(result.queue).toHaveLength(3);
  expect(result.error).toBe('MUSIC_MIRROR_NOT_FOUND');
  expect(result.status).toBe('error');
  expect(result.matchCandidates).toBeUndefined();
});
it('does not publish after stop while a Spotify match is pending', async () => {
  let finish!: (value: {
    source: string;
    title: string;
    durationSec: number;
    requestedProvider: 'spotify';
  }) => void;
  const matcher = vi.fn(
    () =>
      new Promise<{
        source: string;
        title: string;
        durationSec: number;
        requestedProvider: 'spotify';
      }>((resolve) => {
        finish = resolve;
      }),
  );
  const { worker, publisher } = setup(matcher);
  const adding = worker.command('room', lease, { type: 'add', url });
  await vi.waitFor(() => expect(matcher).toHaveBeenCalledTimes(1));
  await worker.command('room', lease, { type: 'stop' });
  finish({
    source: 'https://www.youtube.com/watch?v=abcdefghijk',
    title: 'Late',
    durationSec: 123,
    requestedProvider: 'spotify',
  });
  await adding;
  expect(publisher.playYouTube).not.toHaveBeenCalled();
  expect(worker.snapshot('room').status).toBe('disconnected');
});
it('rejects queue overflow before resolving or inserting Spotify tracks', async () => {
  const { worker, matcher } = setup();
  await worker.command('room', lease, { type: 'add-list', tracks: Array(99).fill(track) });
  await expect(worker.command('room', lease, { type: 'add', url })).rejects.toThrow(
    'MUSIC_QUEUE_FULL',
  );
  expect(worker.snapshot('room').queue).toHaveLength(99);
  expect(matcher).toHaveBeenCalledTimes(1);
});
it('lets queue adds accept a capped embed or skip non-track rows only when the caller opts in', async () => {
  const capped = () => response(Array(100).fill(row));
  const result = await spotifyPlaylist(url, async () => capped(), { partial: true });
  expect(result).toMatchObject({ truncated: true, skipped: 0 });
  expect(result.tracks).toHaveLength(100);
  const mixed = () =>
    response([row, { ...row, uri: 'spotify:episode:bad' }, { ...row, duration: 0 }]);
  const partial = await spotifyPlaylist(url, async () => mixed(), { partial: true });
  expect(partial).toMatchObject({ truncated: false, skipped: 2 });
  expect(partial.tracks).toEqual([track]);
  await expect(spotifyPlaylist(url, async () => mixed())).rejects.toThrow('INCOMPLETE');
  await expect(
    spotifyPlaylist(url, async () => response([{ ...row, entityType: 'episode' }]), {
      partial: true,
    }),
  ).rejects.toThrow('MUSIC_SPOTIFY_PLAYLIST_INCOMPLETE');
});
it('reports a partial playlist import on the add response only', async () => {
  const { worker } = setup();
  const partial = new MusicWorker({
    publisher: () => ({
      connect: async () => {},
      pause: () => {},
      close: async () => {},
      position: () => 0,
      play: async () => {},
      playYouTube: async () => {},
    }),
    lease: async () => lease,
    history: new MusicHistory(),
    matchingYouTubeReference: async () => ({
      source: 'https://www.youtube.com/watch?v=abcdefghijk',
      title: 'Matched',
      durationSec: 123,
      requestedProvider: 'spotify' as const,
    }),
    spotifyPlaylist: async () => ({ name: 'Mix', tracks: [track], truncated: true, skipped: 1 }),
  });
  workers.push(partial);
  const result = await partial.command('room', lease, { type: 'add', url });
  expect(result.importNotice).toEqual({ added: 1, skipped: 1, truncated: true });
  expect(partial.snapshot('room').importNotice).toBeUndefined();
  expect((await worker.command('room', lease, { type: 'add', url })).importNotice).toBeUndefined();
});
