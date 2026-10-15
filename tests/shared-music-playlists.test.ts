import { afterEach, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  SharedMusicPlaylists,
  registerMusicPlaylists,
} from '../apps/services/access/music-playlists';
const directories: string[] = [];
afterEach(async () => {
  for (const p of directories.splice(0)) await rm(p, { recursive: true, force: true });
});
const track = { videoId: 'abcdefghijk', title: 'Song', durationSec: 120 };
async function directory() {
  const p = await mkdtemp(join(tmpdir(), 'rooms-playlists-'));
  directories.push(p);
  return p;
}
it('persists shared playlists across restart and rejects concurrent stale edits and cross-community IDs', async () => {
  const path = await directory(),
    store = new SharedMusicPlaylists(path),
    check = vi.fn(async () => {});
  const [created] = await store.change(
    'one',
    { op: 'save', name: 'Shared', tracks: [track] },
    check,
  );
  const writes = await Promise.allSettled(
    [1, 2].map((n) =>
      store.change(
        'one',
        {
          op: 'save',
          id: created.id,
          revision: created.revision,
          name: 'Edit ' + n,
          tracks: [track],
        },
        check,
      ),
    ),
  );
  expect(writes.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  expect(writes.filter((r) => r.status === 'rejected')).toHaveLength(1);
  const restored = new SharedMusicPlaylists(path);
  expect((await restored.list('one'))[0].revision).toBe(2);
  expect(await restored.list('two')).toEqual([]);
  await expect(
    restored.change('two', { op: 'remove', id: created.id, revision: 2 }, check),
  ).rejects.toThrow('MUSIC_PLAYLIST_CHANGED');
  expect(await restored.list('one')).toHaveLength(1);
});
it('rechecks actual membership after a slow import and never persists a revoked request', async () => {
  const path = await directory(),
    app = Fastify();
  let allowed = true,
    finish!: (value: unknown) => void;
  const references = vi.fn(
    () =>
      new Promise<unknown>((r) => {
        finish = r;
      }),
  );
  registerMusicPlaylists(app, {
    directory: path,
    authorize: async () => {
      if (!allowed) throw Error('MUSIC_PERMISSION_DENIED');
      return { communityId: 'one', userId: 'alice' };
    },
    references,
  });
  try {
    const pending = app.inject({
      method: 'POST',
      url: '/v1/music/room/playlists',
      headers: { authorization: 'token' },
      payload: {
        op: 'import',
        name: 'Imported',
        url: 'https://www.youtube.com/playlist?list=PLabcdefgh123',
      },
    });
    await vi.waitFor(() => expect(references).toHaveBeenCalledOnce());
    allowed = false;
    finish([track]);
    expect((await pending).statusCode).toBe(403);
    expect(await new SharedMusicPlaylists(path).list('one')).toEqual([]);
  } finally {
    await app.close();
  }
});
it('requires authentication and lets different members manage the same community list', async () => {
  const path = await directory(),
    app = Fastify();
  registerMusicPlaylists(app, {
    directory: path,
    authorize: async (token) => ({ communityId: 'one', userId: token }),
    references: async () => [track],
  });
  try {
    expect((await app.inject('/v1/music/room/playlists')).statusCode).toBe(401);
    const created = await app.inject({
      method: 'POST',
      url: '/v1/music/room/playlists',
      headers: { authorization: 'alice' },
      payload: { op: 'saveQueue', name: 'Shared' },
    });
    expect(created.statusCode).toBe(200);
    const [item] = created.json();
    const changed = await app.inject({
      method: 'POST',
      url: '/v1/music/room/playlists',
      headers: { authorization: 'bob' },
      payload: {
        op: 'save',
        id: item.id,
        revision: item.revision,
        name: 'Edited by Bob',
        tracks: [track],
      },
    });
    expect(changed.statusCode).toBe(200);
    expect(changed.json()[0].name).toBe('Edited by Bob');
  } finally {
    await app.close();
  }
});
it('rejects private sources and reports provider outages separately from invalid input', async () => {
  const app = Fastify();
  registerMusicPlaylists(app, {
    directory: await directory(),
    authorize: async () => ({ communityId: 'one', userId: 'alice' }),
    references: async () => {
      throw Error('MUSIC_PLAYLIST_SOURCE_UNAVAILABLE');
    },
  });
  try {
    const send = (payload: unknown) =>
      app.inject({
        method: 'POST',
        url: '/v1/music/room/playlists',
        headers: { authorization: 'token', 'content-type': 'application/json' },
        payload: JSON.stringify(payload),
      });
    const bad = await send({
      op: 'import',
      name: 'Private',
      url: 'https://example.test/live.m3u?token=secret',
    });
    expect(bad.statusCode).toBe(400);
    expect(bad.json()).toEqual({ error: 'MUSIC_PLAYLIST_INVALID' });
    const down = await send({
      op: 'import',
      name: 'YouTube',
      url: 'https://www.youtube.com/playlist?list=PLabcdefgh123',
    });
    expect(down.statusCode).toBe(503);
    expect(down.json()).toEqual({ error: 'MUSIC_PLAYLIST_SOURCE_UNAVAILABLE' });
    const invalidTrack = await send({
      op: 'save',
      name: 'Private',
      tracks: [{ ...track, source: 'https://example.test/private' }],
    });
    expect(invalidTrack.statusCode).toBe(400);
  } finally {
    await app.close();
  }
});

it('accepts the documented 100-track catalog edit under the production Access body limit', async () => {
  const app = Fastify({ bodyLimit: 16384 });
  registerMusicPlaylists(app, {
    directory: await directory(),
    authorize: async () => ({ communityId: 'one', userId: 'alice' }),
    references: async () => [],
  });
  try {
    const tracks = Array.from({ length: 100 }, () => ({ ...track, title: '曲'.repeat(160) }));
    const result = await app.inject({
      method: 'POST',
      url: '/v1/music/room/playlists',
      headers: { authorization: 'token' },
      payload: { op: 'save', name: 'Full list', tracks },
    });
    expect(result.statusCode).toBe(200);
    expect(result.json()[0].tracks).toHaveLength(100);
  } finally {
    await app.close();
  }
});
it('imports Spotify display references and preserves them across a store restart', async () => {
  const path = await directory(),
    app = Fastify();
  const tracks = [
    { spotifyTrackId: 'a'.repeat(22), title: 'Song', artists: ['Artist'], durationSec: 120 },
  ];
  const references = vi.fn(async () => tracks);
  registerMusicPlaylists(app, {
    directory: path,
    authorize: async () => ({ communityId: 'one', userId: 'alice' }),
    references,
  });
  try {
    const url = 'https://open.spotify.com/playlist/' + 'b'.repeat(22);
    const response = await app.inject({
      method: 'POST',
      url: '/v1/music/room/playlists',
      headers: { authorization: 'Bearer test' },
      payload: { op: 'import', name: 'Mix', url },
    });
    expect(response.statusCode).toBe(200);
    expect(references).toHaveBeenCalledWith('room', { url });
    expect((await new SharedMusicPlaylists(path).list('one'))[0].tracks).toEqual(tracks);
  } finally {
    await app.close();
  }
});
