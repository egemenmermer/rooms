import { MusicHistory } from './history';
import { youtubeReferences } from './youtube-source';
import { parseDJLink } from '../../../packages/shared-contracts/src/music-links';
import { spotifyPlaylist } from './spotify-playlist';
import { parseSongLink } from '../../../packages/shared-contracts/src/song-links';
import {
  isPlaylistLink,
  playlistTrackSchema,
} from '../../../packages/shared-contracts/src/music-playlists';
import { matchingResponse } from './matching-response';
import Fastify from 'fastify';
import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import {
  musicCommandSchema,
  musicFailedSongSchema,
} from '../../../packages/shared-contracts/src/music';
import { registerMusicSearch } from './search-route';
import { MusicWorker, type MusicLease } from './worker';
import { LiveMusicPublisher } from './publisher';
const secret = process.env.ROOMS_MUSIC_SECRET;
if (!secret || secret.length < 32) throw new Error('Music service secret is required');
const server = Fastify({ logger: false, bodyLimit: 65536 });
server.addHook('onRequest', async (request, reply) => {
  if (request.url === '/health') return;
  const value = request.headers.authorization?.replace(/^Bearer /, '') ?? '';
  if (
    Buffer.byteLength(value) !== Buffer.byteLength(secret) ||
    !timingSafeEqual(Buffer.from(value), Buffer.from(secret))
  )
    return reply.code(401).send({ error: 'AUTH_REQUIRED' });
});
const worker = new MusicWorker({
  history: new MusicHistory(process.env.ROOMS_MUSIC_HISTORY_FILE ?? '/state/music-history.json'),
  publisher: () => new LiveMusicPublisher(),
  lease: async (channelId, leaseId) => {
    const response = await fetch(
      `${process.env.ROOMS_ACCESS_INTERNAL_URL ?? 'http://access:3002'}/v1/music/internal/lease`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId, leaseId }),
        redirect: 'error',
        signal: AbortSignal.timeout(10000),
      },
    );
    if (!response.ok) throw new Error('Lease revoked');
    return (await response.json()) as MusicLease;
  },
});
const id = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
server.get('/health', async () => ({ service: 'music', status: 'ok' }));
registerMusicSearch(server);
let importing = false;
server.post('/v1/references', async (request, reply) => {
  const body = z
    .object({
      channelId: id,
      sessionId: z.string().uuid().optional(),
      url: z.string().max(2048).refine(isPlaylistLink).optional(),
    })
    .strict()
    .parse(request.body);
  if (!body.url) return worker.references(body.channelId, body.sessionId);
  if (importing) return reply.code(429).send({ error: 'MUSIC_SEARCH_BUSY' });
  importing = true;
  try {
    if (parseSongLink(body.url)?.kind === 'playlist')
      return (await spotifyPlaylist(body.url)).tracks;
    return z
      .array(playlistTrackSchema)
      .max(100)
      .parse(
        (await youtubeReferences(body.url)).map((ref) => ({
          videoId: parseDJLink(ref.source)?.id,
          title: ref.title,
          durationSec: ref.durationSec,
        })),
      );
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    return reply.code(400).send({
      error: /^MUSIC_[A-Z_]+$/.test(message) ? message : 'MUSIC_PLAYLIST_SOURCE_UNAVAILABLE',
    });
  } finally {
    importing = false;
  }
});
server.get('/v1/rooms/:channelId/history', async (request) =>
  worker.history(id.parse((request.params as { channelId: string }).channelId)),
);
server.get('/v1/rooms/:channelId', async (request) =>
  worker.snapshot(id.parse((request.params as { channelId: string }).channelId)),
);
server.post('/v1/rooms/:channelId', async (request, reply) => {
  const channelId = id.parse((request.params as { channelId: string }).channelId);
  const body = z
    .object({
      lease: z
        .object({ leaseId: z.string().uuid(), url: z.string().url(), token: z.string().max(4096) })
        .strict(),
      command: musicCommandSchema,
    })
    .strict()
    .parse(request.body);
  try {
    return await worker.command(channelId, body.lease, body.command);
  } catch (error) {
    const matching = matchingResponse(
      error,
      worker.snapshot(channelId),
      body.command.type === 'add' && body.command.offerCandidates === true,
    );
    if (matching) return matching;
    const value = error instanceof Error ? error.message : '';
    const code = /^MUSIC_[A-Z_]+$/.test(value) ? value : 'MUSIC_SOURCE_FAILED';
    const song = musicFailedSongSchema.safeParse((error as { song?: unknown })?.song);
    return reply.code(400).send({ error: code, ...(song.success ? { song: song.data } : {}) });
  }
});
server.addHook('onClose', () => worker.close());
void server.listen({ host: '0.0.0.0', port: Number(process.env.MUSIC_PORT ?? 3040) }).catch(() => {
  console.error('ROOMS music service failed');
  process.exitCode = 1;
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => void server.close());
