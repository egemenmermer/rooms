import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { mkdir, readFile, writeFile, rename, unlink, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { StoatError } from '@rooms/stoat';
import {
  PERSONAL_SOUND_ATTRIBUTES,
  PERSONAL_SOUND_EVENTS,
  PERSONAL_SOUND_LIMITS,
  PERSONAL_SOUND_MAX_BASE64,
  PERSONAL_SOUND_PRESETS,
  personalSoundAssignSchema,
  personalSoundIdSchema,
  personalSoundUploadSchema,
  personalSoundUserIdSchema as identifier,
  uploadedSoundIdSchema,
  type PersonalSoundAssign,
  type PersonalSoundProfile,
} from '../../../packages/shared-contracts/src/personal-sounds';
import {
  PersonalSoundAudioError,
  encodePersonalSoundWav,
  parsePersonalSoundWav,
  processPersonalSound,
} from '../../../packages/shared-contracts/src/personal-sound-audio';
import { renderPersonalSoundPreset } from '../../../packages/shared-contracts/src/personal-sound-presets';
const profileSchema = z
  .object({
    version: z.literal(1),
    assign: personalSoundAssignSchema,
    sounds: z
      .array(
        z
          .object({
            id: uploadedSoundIdSchema,
            name: z.string().min(1).max(PERSONAL_SOUND_LIMITS.maxNameLength),
            durationSec: z.number().positive().max(PERSONAL_SOUND_LIMITS.acceptDurationSec),
            lufs: z.number(),
            createdAt: z.string().datetime(),
          })
          .strict(),
      )
      .max(PERSONAL_SOUND_LIMITS.maxSounds),
    rightsAcceptedAt: z.string().datetime().optional(),
  })
  .strict();
type Profile = z.infer<typeof profileSchema>;
export type PersonalSoundAttributes = Record<string, string>;
const missing = (error: unknown) => (error as NodeJS.ErrnoException).code === 'ENOENT';
const storage = () => new StoatError(503, 'PERSONAL_SOUNDS_STORAGE_UNAVAILABLE');
const notFound = () => new StoatError(404, 'PERSONAL_SOUND_NOT_FOUND');
const audio = <T>(work: () => T) => {
  try {
    return work();
  } catch (error) {
    if (error instanceof PersonalSoundAudioError) throw new StoatError(400, error.code);
    throw error;
  }
};
const presets = new Map<string, (typeof PERSONAL_SOUND_PRESETS)[number]>(
  PERSONAL_SOUND_PRESETS.map((p) => [p.id, p]),
);
const rendered = new Map<string, { bytes: Buffer; durationSec: number }>();
const preset = (id: string) => {
  const meta = presets.get(id);
  if (!meta) return null;
  let entry = rendered.get(id);
  if (!entry) {
    const { samples, durationSec } = processPersonalSound(renderPersonalSoundPreset(meta.id));
    entry = { bytes: Buffer.from(encodePersonalSoundWav(samples)), durationSec };
    rendered.set(id, entry);
  }
  return entry;
};
const limit = (max: number, scope: string) => ({
  rateLimit: {
    max,
    timeWindow: '1 minute',
    keyGenerator: (request: FastifyRequest) =>
      `${scope}:` +
      createHash('sha256')
        .update(request.headers.authorization ?? request.ip)
        .digest('hex'),
  },
});
/** Personal entrance/leave sounds; the caller's choice rides on their LiveKit token as attributes. */
export function registerPersonalSounds(
  server: FastifyInstance,
  options: {
    directory?: string;
    uploads: boolean;
    /** Instance-wide cap on stored clip bytes. */
    maxBytes: number;
    currentUser(token: string): Promise<{ id: string }>;
    authorize(token: string, channelId: string): Promise<{ userId: string }>;
    /** Only the changed attributes; a cleared one is `''`, which LiveKit deletes. */
    onAssignChanged?(userId: string, attributes: PersonalSoundAttributes): void;
  },
) {
  const locks = new Map<string, Promise<unknown>>();
  // Rendering every preset takes about half a second, so it happens between requests.
  server.addHook('onReady', async () => {
    if (!options.directory) return;
    void (async () => {
      for (const { id } of PERSONAL_SOUND_PRESETS) {
        await new Promise((resolve) => setImmediate(resolve));
        preset(id);
      }
    })();
  });
  const token = (request: FastifyRequest) => {
    if (!options.directory) throw new StoatError(501, 'PERSONAL_SOUNDS_NOT_CONFIGURED');
    const header = request.headers.authorization;
    if (!header || header.length > 8192) throw new StoatError(401, 'AUTH_REQUIRED');
    const value = header.replace(/^Bearer /, '');
    if (!value) throw new StoatError(401, 'AUTH_REQUIRED');
    return value;
  };
  const me = async (request: FastifyRequest) =>
    identifier.parse((await options.currentUser(token(request))).id);
  const folder = (userId: string) => join(options.directory!, userId);
  const load = async (userId: string): Promise<Profile> => {
    try {
      return profileSchema.parse(
        JSON.parse(await readFile(join(folder(userId), 'profile.json'), 'utf8')),
      );
    } catch (error) {
      if (missing(error)) return { version: 1, assign: { enter: null, leave: null }, sounds: [] };
      throw storage();
    }
  };
  const save = async (userId: string, value: Profile) => {
    await mkdir(folder(userId), { recursive: true, mode: 0o700 });
    const temp = join(folder(userId), `profile.${randomUUID()}.tmp`);
    try {
      await writeFile(temp, JSON.stringify(profileSchema.parse(value)), { mode: 0o600 });
      await rename(temp, join(folder(userId), 'profile.json'));
    } finally {
      await unlink(temp).catch(() => {});
    }
  };
  const locked = async <T>(key: string, work: () => Promise<T>) => {
    const task = (locks.get(key) ?? Promise.resolve()).catch(() => {}).then(work);
    locks.set(key, task);
    try {
      return await task;
    } finally {
      if (locks.get(key) === task) locks.delete(key);
    }
  };
  // Scanned rather than counted so an administrator can delete a person's folder at any time.
  const usage = async () => {
    let total = 0,
      users;
    try {
      users = await readdir(options.directory!, { withFileTypes: true });
    } catch (error) {
      if (missing(error)) return 0;
      throw storage();
    }
    for (const user of users) {
      if (!user.isDirectory() || !identifier.safeParse(user.name).success) continue;
      try {
        for (const file of await readdir(folder(user.name)))
          if (file.endsWith('.wav'))
            total += await stat(join(folder(user.name), file)).then(
              (s) => s.size,
              (error) => {
                if (missing(error)) return 0;
                throw error;
              },
            );
      } catch (error) {
        if (!missing(error)) throw storage();
      }
    }
    return total;
  };
  const known = (value: Profile, id: string | null) =>
    id !== null && (presets.has(id) || value.sounds.some((s) => s.id === id));
  const effective = (value: Profile): PersonalSoundAssign => ({
    enter: known(value, value.assign.enter) ? value.assign.enter : null,
    leave: known(value, value.assign.leave) ? value.assign.leave : null,
  });
  const view = (value: Profile): PersonalSoundProfile => ({
    assign: effective(value),
    sounds: value.sounds.map(({ id, name, durationSec }) => ({ id, name, durationSec })),
    presets: PERSONAL_SOUND_PRESETS.map(({ id, name }) => ({
      id,
      name,
      durationSec: preset(id)!.durationSec,
    })),
    uploads: options.uploads,
  });
  const notify = (userId: string, before: PersonalSoundAssign, after: PersonalSoundAssign) => {
    const changed: PersonalSoundAttributes = {};
    for (const event of PERSONAL_SOUND_EVENTS)
      if (before[event] !== after[event])
        changed[PERSONAL_SOUND_ATTRIBUTES[event]] = after[event] ?? '';
    if (!Object.keys(changed).length) return;
    try {
      options.onAssignChanged?.(userId, changed);
    } catch {
      /* Best effort: the next media grant carries the saved choice. */
    }
  };
  const sound = async (userId: string, id: string) => {
    const builtIn = preset(id);
    if (builtIn) return builtIn.bytes;
    if (!uploadedSoundIdSchema.safeParse(id).success) throw notFound();
    if (!(await load(userId)).sounds.some((s) => s.id === id)) throw notFound();
    let bytes;
    try {
      bytes = await readFile(join(folder(userId), `${id}.wav`));
    } catch (error) {
      if (missing(error)) throw notFound();
      throw storage();
    }
    try {
      parsePersonalSoundWav(bytes);
    } catch {
      throw storage();
    }
    return bytes;
  };
  const send = (reply: FastifyReply, bytes: Buffer) =>
    // Not cached: a deleted clip must stop being served, and uploads never sit in HTTP caches.
    reply.type('audio/wav').header('Cache-Control', 'no-store').send(bytes);
  server.get('/v1/personal-sounds/me', async (request) => {
    const userId = await me(request);
    return view(await load(userId));
  });
  server.post(
    '/v1/personal-sounds/me/sounds',
    { bodyLimit: PERSONAL_SOUND_MAX_BASE64 + 4096, config: limit(6, 'personal-sound-upload') },
    async (request) => {
      const userId = await me(request);
      if (!options.uploads) throw new StoatError(403, 'PERSONAL_SOUND_UPLOADS_DISABLED');
      const body = personalSoundUploadSchema.parse(request.body),
        bytes = Buffer.from(body.audio, 'base64');
      if (bytes.toString('base64') !== body.audio)
        throw new StoatError(400, 'PERSONAL_SOUND_INVALID_AUDIO');
      // The server pass is authoritative; the uploaded bytes are never stored.
      const { samples, lufs, durationSec } = audio(() =>
          processPersonalSound(parsePersonalSoundWav(bytes)),
        ),
        clip = Buffer.from(encodePersonalSoundWav(samples));
      return locked('\0uploads', () =>
        locked(userId, async () => {
          const value = await load(userId);
          if (value.sounds.length >= PERSONAL_SOUND_LIMITS.maxSounds)
            throw new StoatError(409, 'PERSONAL_SOUND_LIBRARY_FULL');
          if (!((await usage()) + clip.length <= options.maxBytes))
            throw new StoatError(409, 'PERSONAL_SOUND_STORAGE_LIMIT');
          const now = new Date().toISOString(),
            entry = { id: randomUUID(), name: body.name, durationSec, lufs, createdAt: now };
          await mkdir(folder(userId), { recursive: true, mode: 0o700 });
          const file = join(folder(userId), `${entry.id}.wav`);
          await writeFile(file, clip, { flag: 'wx', mode: 0o600 });
          try {
            await save(userId, {
              ...value,
              sounds: [...value.sounds, entry],
              rightsAcceptedAt: now,
            });
          } catch (error) {
            await unlink(file).catch(() => {});
            throw error;
          }
          return { id: entry.id, name: entry.name, durationSec };
        }),
      );
    },
  );
  server.delete('/v1/personal-sounds/me/sounds/:soundId', async (request) => {
    const userId = await me(request),
      id = personalSoundIdSchema.parse((request.params as { soundId: string }).soundId);
    return locked(userId, async () => {
      const value = await load(userId);
      if (!value.sounds.some((s) => s.id === id)) throw notFound();
      const next: Profile = {
        ...value,
        assign: {
          enter: value.assign.enter === id ? null : value.assign.enter,
          leave: value.assign.leave === id ? null : value.assign.leave,
        },
        sounds: value.sounds.filter((s) => s.id !== id),
      };
      await save(userId, next);
      await unlink(join(folder(userId), `${id}.wav`)).catch((error) => {
        if (!missing(error)) throw error;
      });
      notify(userId, effective(value), effective(next));
      return view(next);
    });
  });
  server.put('/v1/personal-sounds/me/assign', async (request) => {
    const userId = await me(request),
      assign = personalSoundAssignSchema.parse(request.body);
    return locked(userId, async () => {
      const value = await load(userId);
      for (const id of [assign.enter, assign.leave])
        if (id !== null && !known(value, id)) throw notFound();
      const next = { ...value, assign };
      await save(userId, next);
      notify(userId, effective(value), effective(next));
      return view(next);
    });
  });
  server.get('/v1/personal-sounds/me/sounds/:soundId', async (request, reply) => {
    const userId = await me(request),
      id = personalSoundIdSchema.parse((request.params as { soundId: string }).soundId);
    return send(reply, await sound(userId, id));
  });
  server.get(
    '/v1/personal-sounds/:channelId/:userId/:soundId',
    { config: limit(120, 'personal-sound-read') },
    async (request, reply) => {
      const params = request.params as { channelId: string; userId: string; soundId: string },
        channelId = identifier.parse(params.channelId),
        userId = identifier.parse(params.userId),
        id = personalSoundIdSchema.parse(params.soundId);
      await options.authorize(token(request), channelId);
      return send(reply, await sound(userId, id));
    },
  );
  return {
    /** Non-null choices for a media grant; never throws and never waits long on storage. */
    async attributes(userId: string): Promise<PersonalSoundAttributes> {
      if (!options.directory || !identifier.safeParse(userId).success) return {};
      let timer: NodeJS.Timeout | undefined;
      try {
        const assign = await Promise.race([
          load(userId).then(effective),
          new Promise<null>((resolve) => (timer = setTimeout(resolve, 500, null))),
        ]);
        const attributes: PersonalSoundAttributes = {};
        for (const event of PERSONAL_SOUND_EVENTS)
          if (assign?.[event]) attributes[PERSONAL_SOUND_ATTRIBUTES[event]] = assign[event];
        return attributes;
      } catch {
        return {};
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
