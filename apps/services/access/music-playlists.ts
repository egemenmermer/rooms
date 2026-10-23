import { readFile, mkdir, open, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import { StoatError } from '../../../packages/stoat-adapter/src/index';
import {
  playlistCatalogSchema,
  playlistChangeSchema,
  playlistTrackSchema,
  type SharedPlaylist,
} from '../../../packages/shared-contracts/src/music-playlists';
const id = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
export class SharedMusicPlaylists {
  private jobs = new Map<string, Promise<unknown>>();
  constructor(private directory?: string) {}
  private file(community: string) {
    if (!this.directory) throw Error('MUSIC_PLAYLISTS_NOT_CONFIGURED');
    return join(this.directory, id.parse(community) + '.json');
  }
  async list(community: string) {
    try {
      const bytes = await readFile(this.file(community));
      if (bytes.length > 4 * 1024 * 1024) throw Error('MUSIC_PLAYLISTS_UNAVAILABLE');
      return playlistCatalogSchema.parse(JSON.parse(bytes.toString()));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw e;
    }
  }
  async change(
    community: string,
    change:
      | {
          op: 'save';
          id?: string;
          revision?: number;
          name: string;
          tracks: z.infer<typeof playlistTrackSchema>[];
        }
      | { op: 'remove'; id: string; revision: number },
    authorize: () => Promise<void>,
  ) {
    const job = (this.jobs.get(community) ?? Promise.resolve())
      .catch(() => {})
      .then(async () => {
        const items = await this.list(community),
          current = change.id ? items.find((p) => p.id === change.id) : undefined;
        if (change.id && (!current || current.revision !== change.revision))
          throw Error('MUSIC_PLAYLIST_CHANGED');
        let next: SharedPlaylist[];
        if (change.op === 'remove') next = items.filter((p) => p.id !== change.id);
        else {
          if (!current && items.length >= 50) throw Error('MUSIC_PLAYLIST_LIMIT');
          const item = {
            id: current?.id ?? randomUUID(),
            revision: (current?.revision ?? 0) + 1,
            name: change.name,
            tracks: change.tracks,
            updatedAt: new Date().toISOString(),
          };
          next = [item, ...items.filter((p) => p.id !== item.id)];
        }
        next = playlistCatalogSchema.parse(next);
        const bytes = JSON.stringify(next);
        if (Buffer.byteLength(bytes) > 4 * 1024 * 1024) throw Error('MUSIC_PLAYLIST_LIMIT');
        await authorize();
        const file = this.file(community);
        await mkdir(this.directory!, { recursive: true, mode: 0o700 });
        const temporary = file + '.' + randomUUID() + '.stage';
        try {
          const out = await open(temporary, 'wx', 0o600);
          try {
            await out.writeFile(bytes);
            await out.sync();
          } finally {
            await out.close();
          }
          await rename(temporary, file);
          const directory = await open(this.directory!, 'r');
          try {
            await directory.sync();
          } finally {
            await directory.close();
          }
        } finally {
          await unlink(temporary).catch(() => {});
        }
        return next;
      });
    this.jobs.set(community, job);
    try {
      return await job;
    } finally {
      if (this.jobs.get(community) === job) this.jobs.delete(community);
    }
  }
}
export function registerMusicPlaylists(
  server: FastifyInstance,
  options: {
    directory?: string;
    /** `canControl`: may run the DJ (Speak and Listen); needed to change the shared lists. */
    authorize(
      token: string,
      channelId: string,
    ): Promise<{ communityId: string; userId: string; canControl: boolean }>;
    references(channelId: string, source: { sessionId?: string; url?: string }): Promise<unknown>;
  },
) {
  const store = new SharedMusicPlaylists(options.directory);
  const member = async (request: { headers: { authorization?: string }; params: unknown }) => {
    const channel = id.parse((request.params as { channelId: string }).channelId),
      token = request.headers.authorization?.replace(/^Bearer /, '');
    if (!token || token.length > 8192) throw Error('AUTH_REQUIRED');
    const who = await options.authorize(token, channel);
    return { channel, token, ...who };
  };
  const fail = (reply: { code(n: number): { send(x: unknown): unknown } }, error: unknown) => {
    const code =
      error instanceof StoatError && error.status === 401
        ? 'AUTH_REQUIRED'
        : error instanceof StoatError && [403, 404].includes(error.status)
          ? 'MUSIC_PERMISSION_DENIED'
          : error instanceof z.ZodError
            ? 'MUSIC_PLAYLIST_INVALID'
            : error instanceof Error && /^(?:MUSIC_|AUTH_)[A-Z_]+$/.test(error.message)
              ? error.message
              : 'MUSIC_PLAYLISTS_UNAVAILABLE';
    return reply
      .code(
        code === 'AUTH_REQUIRED'
          ? 401
          : code === 'MUSIC_PLAYLIST_CHANGED'
            ? 409
            : code === 'MUSIC_PERMISSION_DENIED'
              ? 403
              : /NOT_CONFIGURED$/.test(code)
                ? 501
                : /(?:UNAVAILABLE|BUSY)$/.test(code)
                  ? 503
                  : 400,
      )
      .send({ error: code });
  };
  server.get('/v1/music/:channelId/playlists', async (req, reply) => {
    try {
      const who = await member(req);
      const result = await store.list(who.communityId);
      const fresh = await member(req);
      if (fresh.communityId !== who.communityId || fresh.userId !== who.userId)
        throw Error('MUSIC_PERMISSION_DENIED');
      return result;
    } catch (e) {
      return fail(reply, e);
    }
  });
  server.post('/v1/music/:channelId/playlists', { bodyLimit: 65536 }, async (req, reply) => {
    try {
      const who = await member(req),
        change = playlistChangeSchema.parse(req.body);
      // Reading needs view and connect; changing the community's lists (and running an
      // import on the music service) needs the same right as running the DJ.
      if (!who.canControl) throw Error('MUSIC_PERMISSION_DENIED');
      const write =
        change.op === 'save' || change.op === 'remove'
          ? change
          : {
              op: 'save' as const,
              name: change.name,
              tracks: z
                .array(playlistTrackSchema)
                .max(100)
                .parse(
                  await options.references(
                    who.channel,
                    change.op === 'import' ? { url: change.url } : { sessionId: change.sessionId },
                  ),
                ),
            };
      if (
        change.op !== 'remove' &&
        change.op !== 'save' &&
        write.op === 'save' &&
        !write.tracks.length
      )
        throw Error('MUSIC_PLAYLIST_EMPTY');
      return await store.change(who.communityId, write, async () => {
        const fresh = await member(req);
        if (
          fresh.userId !== who.userId ||
          fresh.communityId !== who.communityId ||
          !fresh.canControl
        )
          throw Error('MUSIC_PERMISSION_DENIED');
      });
    } catch (e) {
      return fail(reply, e);
    }
  });
}
