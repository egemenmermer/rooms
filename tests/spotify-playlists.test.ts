import { afterEach, expect, it, vi } from 'vitest';
import { resolveSpotifyShortLink, spotifyPlaylist } from '../apps/services/music/spotify-playlist';
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
it('adds only what fits when played and current tracks already occupy the queue', async () => {
  const { worker } = setup();
  await worker.command('room', lease, { type: 'add-list', tracks: Array(99).fill(track) });
  const result = await worker.command('room', lease, { type: 'add', url });
  expect(result.queue).toHaveLength(100);
  expect(result.importNotice).toEqual({ added: 1, skipped: 0, truncated: true });
  await expect(worker.command('room', lease, { type: 'add', url })).rejects.toThrow(
    'MUSIC_QUEUE_FULL',
  );
  expect(worker.snapshot('room').queue).toHaveLength(100);
});
it('fills the room left by a 100-track playlist after one song was added', async () => {
  const hundred = Array.from({ length: 100 }, (_, i) => ({ ...track, title: `Song ${i}` }));
  const publisher = {
    connect: async () => {},
    pause: () => {},
    close: async () => {},
    position: () => 0,
    play: async () => {},
    playYouTube: async () => {},
  };
  const worker = new MusicWorker({
    publisher: () => publisher,
    lease: async () => lease,
    history: new MusicHistory(),
    matchingYouTubeReference: async () => ({
      source: 'https://www.youtube.com/watch?v=abcdefghijk',
      title: 'Matched',
      durationSec: 123,
      requestedProvider: 'spotify' as const,
    }),
    spotifyPlaylist: async () => ({ name: 'Big', tracks: hundred, truncated: true, skipped: 0 }),
  });
  workers.push(worker);
  await worker.command('room', lease, { type: 'add-list', tracks: [track] });
  const result = await worker.command('room', lease, { type: 'add', url });
  expect(result.queue).toHaveLength(100);
  expect(result.importNotice).toEqual({ added: 99, skipped: 0, truncated: true });
});
it('resolves spotify.link short links to playlists and keeps tracks on the song path', async () => {
  const resolve = vi.fn(async (raw: string) =>
    raw.endsWith('/list') ? url : `https://open.spotify.com/track/${'c'.repeat(22)}`,
  );
  const metadata = vi.fn(async () => ({
    provider: 'spotify' as const,
    title: 'One',
    artists: ['A'],
    durationSec: 100,
  }));
  const playlist = vi.fn(async () => ({ name: 'Mix', tracks: [track] }));
  const make = () => {
    const w = new MusicWorker({
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
      resolveSpotifyShortLink: resolve,
      songMetadata: metadata,
      spotifyPlaylist: playlist,
      matchingYouTubeReference: async () => ({
        source: 'https://www.youtube.com/watch?v=abcdefghijk',
        title: 'Matched',
        durationSec: 123,
        requestedProvider: 'spotify' as const,
      }),
    });
    workers.push(w);
    return w;
  };
  const a = make();
  expect(
    (await a.command('r1', lease, { type: 'add', url: 'https://spotify.link/list' })).queue,
  ).toHaveLength(1);
  expect(playlist).toHaveBeenCalledWith(url, undefined, { partial: true });
  expect(metadata).not.toHaveBeenCalled();
  await make().command('r2', lease, { type: 'add', url: 'https://spotify.link/song' });
  expect(metadata).toHaveBeenCalledWith(`https://open.spotify.com/track/${'c'.repeat(22)}`);
});
it('follows spotify.link only to Spotify tracks or playlists on the allowed hosts', async () => {
  const redirect = (to: string, ok = true) =>
    vi.fn(async () =>
      Object.defineProperty(new Response('', { status: ok ? 200 : 404 }), 'url', { value: to }),
    );
  const request = redirect(url + '?si=x');
  expect(await resolveSpotifyShortLink('https://spotify.link/abc', request)).toBe(url);
  expect(request).toHaveBeenCalledWith(
    'https://spotify.link/abc',
    expect.objectContaining({
      allowedHosts: ['open.spotify.com', 'spotify.link'],
      allowedProtocols: ['https:'],
    }),
  );
  for (const bad of [
    redirect(`https://open.spotify.com/album/${id}`),
    redirect('https://evil.test/x'),
    redirect(url, false),
  ])
    await expect(resolveSpotifyShortLink('https://spotify.link/abc', bad)).rejects.toThrow(
      'MUSIC_MIRROR_SINGLE_TRACK_ONLY',
    );
  await expect(resolveSpotifyShortLink('https://on.soundcloud.com/abc', request)).rejects.toThrow(
    'MUSIC_SOURCE_FAILED',
  );
});
