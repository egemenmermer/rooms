import Fastify from 'fastify';
import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import {
  musicCommandSchema,
  musicSearchQuerySchema,
} from '../../../packages/shared-contracts/src/music';
import { searchYouTube } from './youtube-source';
import { MusicWorker, type MusicLease } from './worker';
import { LiveMusicPublisher } from './publisher';
const secret = process.env.ROOMS_MUSIC_SECRET;
if (!secret || secret.length < 32) throw new Error('Music service secret is required');
const server = Fastify({ logger: false, bodyLimit: 4096 });
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
server.post('/v1/search', async (request, reply) => {
  try {
    const body = z.object({ query: musicSearchQuerySchema }).strict().parse(request.body);
    return await searchYouTube(body.query);
  } catch (error) {
    const code =
      error instanceof Error && /^MUSIC_[A-Z_]+$/.test(error.message)
        ? error.message
        : 'MUSIC_SEARCH_UNAVAILABLE';
    return reply.code(400).send({ error: code });
  }
});
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
    const value = error instanceof Error ? error.message : '';
    const code = /^MUSIC_[A-Z_]+$/.test(value) ? value : 'MUSIC_SOURCE_FAILED';
    return reply.code(400).send({ error: code });
  }
});
server.addHook('onClose', () => worker.close());
void server.listen({ host: '0.0.0.0', port: Number(process.env.MUSIC_PORT ?? 3040) }).catch(() => {
  console.error('ROOMS music service failed');
  process.exitCode = 1;
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => void server.close());
