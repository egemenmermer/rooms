import { afterEach, describe, expect, it, vi } from 'vitest';
const sdk = vi.hoisted(() => ({ updateParticipant: vi.fn(async () => ({})) }));
vi.mock('livekit-server-sdk', async () => ({
  ...(await vi.importActual<any>('livekit-server-sdk')),
  RoomServiceClient: class {
    updateParticipant = sdk.updateParticipant;
    getParticipant = vi.fn(async () => null);
    removeParticipant = vi.fn(async () => {});
  },
}));
vi.mock('@rooms/stoat', async () => {
  const real = await vi.importActual<any>('@rooms/stoat');
  return {
    ...real,
    StoatClient: class {
      async getCurrentUser() {
        return { id: 'viewer', displayName: 'Viewer' };
      }
      async getChannel() {
        return { _id: 'room', channel_type: 'TextChannel', voice: {}, server: 'space' };
      }
      async getServer() {
        return {
          _id: 'space',
          owner: 'viewer',
          default_permissions: String((1n << 20n) | (1n << 22n)),
        };
      }
      async getMember() {
        return { _id: { server: 'space', user: 'viewer' }, roles: [] };
      }
    },
  };
});
import Fastify from 'fastify';
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { registerPersonalSounds } from '../apps/services/access/personal-sounds';
import { createAccessServer } from '../apps/services/access/server';
import {
  integratedLoudness,
  parsePersonalSoundWav,
} from '../packages/shared-contracts/src/personal-sound-audio';
import {
  PERSONAL_SOUND_PRESETS,
  personalSoundProfileSchema,
} from '../packages/shared-contracts/src/personal-sounds';

function wav(seconds: number, { rate = 48000, channels = 1, amplitude = 0.5, lead = 0 } = {}) {
  const frames = Math.round(seconds * rate),
    b = Buffer.alloc(44 + frames * channels * 2);
  b.write('RIFF');
  b.writeUInt32LE(b.length - 8, 4);
  b.write('WAVE', 8);
  b.write('fmt ', 12);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(channels, 22);
  b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate * channels * 2, 28);
  b.writeUInt16LE(channels * 2, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36);
  b.writeUInt32LE(b.length - 44, 40);
  for (let i = Math.round(lead * rate); i < frames; i++)
    for (let c = 0; c < channels; c++)
      b.writeInt16LE(
        Math.round(Math.sin((2 * Math.PI * 440 * i) / rate) * amplitude * 32767),
        44 + (i * channels + c) * 2,
      );
  return b;
}
const upload = (audio: Buffer | string, name = 'DEMO sound') => ({
  name,
  audio: typeof audio === 'string' ? audio : audio.toString('base64'),
  rightsAccepted: true,
});
const denied = (status: number, code: string) => Object.assign(Error(code), { status, code });
const cleanup: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  for (const task of cleanup.splice(0).reverse()) await task();
  vi.clearAllMocks();
});
const temp = async () => {
  const directory = await mkdtemp(join(tmpdir(), 'rooms-personal-sounds-'));
  cleanup.push(() => rm(directory, { recursive: true, force: true }));
  return directory;
};
async function open(
  directory: string | undefined,
  options: Partial<Parameters<typeof registerPersonalSounds>[1]> = {},
) {
  const server = Fastify();
  server.setErrorHandler((e, _r, reply) =>
    reply
      .code((e as any).status ?? (e as any).statusCode ?? 400)
      .send({ error: (e as any).status ? (e as any).code : 'INVALID' }),
  );
  const changes: [string, Record<string, string>][] = [];
  const sounds = registerPersonalSounds(server, {
    directory,
    uploads: true,
    maxBytes: 64 * 1024 * 1024,
    currentUser: async (token) => ({ id: token }),
    authorize: async (token, channelId) => {
      if (token === 'outsider' || channelId !== 'DEMO-room')
        throw denied(403, 'ROOM_ACCESS_DENIED');
      return { userId: token };
    },
    onAssignChanged: (userId, attributes) => changes.push([userId, attributes]),
    ...options,
  });
  const base = await server.listen({ host: '127.0.0.1', port: 0 });
  cleanup.push(() => server.close());
  const request = (token: string | null, method: string, path: string, body?: unknown) =>
    fetch(`${base}/v1/personal-sounds/${path}`, {
      method,
      headers: {
        ...(token === null ? {} : { Authorization: token }),
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const send = async (token: string, method: string, path: string, body?: unknown) => {
    const response = await request(token, method, path, body);
    return { status: response.status, body: await response.json() };
  };
  return { server, sounds, changes, request, send };
}

// Audio processing is CPU-bound; parallel workers can stretch it past the default timeout.
describe('personal sound storage', { timeout: 20_000 }, () => {
  it('stores only the server-normalized clip with owner-only permissions and survives restarts', async () => {
    const directory = await temp();
    let app = await open(directory);
    const original = wav(1.5, { amplitude: 0.9, lead: 0.3 });
    const sent = await app.send('alice', 'POST', 'me/sounds', upload(original));
    expect(sent.status).toBe(200);
    expect(Object.keys(sent.body).sort()).toEqual(['durationSec', 'id', 'name']);
    expect(sent.body.durationSec).toBeCloseTo(1.2, 1);
    const folder = join(directory, 'alice');
    expect((await readdir(folder)).sort()).toEqual(['profile.json', `${sent.body.id}.wav`].sort());
    const stored = await readFile(join(folder, `${sent.body.id}.wav`));
    expect(stored.equals(original)).toBe(false);
    expect(integratedLoudness(parsePersonalSoundWav(stored))).toBeCloseTo(-20, 0);
    expect((await stat(folder)).mode & 0o777).toBe(0o700);
    expect((await stat(join(folder, `${sent.body.id}.wav`))).mode & 0o777).toBe(0o600);
    expect((await stat(join(folder, 'profile.json'))).mode & 0o777).toBe(0o600);
    const saved = JSON.parse(await readFile(join(folder, 'profile.json'), 'utf8'));
    expect(Date.parse(saved.rightsAcceptedAt)).toBeGreaterThan(Date.now() - 60000);
    expect(saved.sounds[0]).toMatchObject({ id: sent.body.id, name: 'DEMO sound' });
    expect(saved.sounds[0].lufs).toBeCloseTo(-20, 0);
    // The longest accepted clip is trimmed to the stored maximum.
    const longest = await app.send('alice', 'POST', 'me/sounds', upload(wav(4.05)));
    expect(longest.status).toBe(200);
    expect(longest.body.durationSec).toBeLessThanOrEqual(4);

    await app.server.close();
    app = await open(directory);
    const profile = await app.send('alice', 'GET', 'me');
    expect(personalSoundProfileSchema.parse(profile.body)).toEqual(profile.body);
    expect(profile.body.sounds.map((s: any) => s.id)).toEqual([sent.body.id, longest.body.id]);
    expect(profile.body.presets.map((p: any) => p.id)).toEqual(
      PERSONAL_SOUND_PRESETS.map((p) => p.id),
    );
    expect(profile.body).toMatchObject({ assign: { enter: null, leave: null }, uploads: true });
    expect((await app.request(null, 'GET', 'me')).status).toBe(401);
  });

  it('rejects malformed, unsupported, oversized and silent uploads without storing anything', async () => {
    const directory = await temp();
    const app = await open(directory);
    const post = (body: unknown) => app.send('alice', 'POST', 'me/sounds', body);
    const invalid = { status: 400, body: { error: 'PERSONAL_SOUND_INVALID_AUDIO' } };
    expect(await post(upload(wav(0.5, { channels: 2 })))).toEqual(invalid);
    expect(await post(upload(wav(0.5, { rate: 44100 })))).toEqual(invalid);
    expect(await post(upload('abc'))).toEqual(invalid);
    expect(await post(upload('AAAA'))).toEqual(invalid);
    expect((await post(upload(wav(4.06)))).status).toBe(400);
    expect(await post(upload(wav(1, { amplitude: 0 })))).toEqual({
      status: 400,
      body: { error: 'PERSONAL_SOUND_SILENT' },
    });
    const { rightsAccepted: _, ...unaccepted } = upload(wav(0.5));
    expect((await post(unaccepted)).status).toBe(400);
    expect((await post({ ...unaccepted, rightsAccepted: false })).status).toBe(400);
    expect(await readdir(directory)).toEqual([]);
  });

  it('enforces the per-person library and the instance byte quota', async () => {
    const directory = await temp();
    const app = await open(directory);
    for (let i = 0; i < 6; i++)
      expect((await app.send('alice', 'POST', 'me/sounds', upload(wav(0.2)))).status).toBe(200);
    expect(await app.send('alice', 'POST', 'me/sounds', upload(wav(0.2)))).toEqual({
      status: 409,
      body: { error: 'PERSONAL_SOUND_LIBRARY_FULL' },
    });

    const small = await open(await temp(), { maxBytes: 30000 });
    const first = await small.send('alice', 'POST', 'me/sounds', upload(wav(0.2)));
    expect(first.status).toBe(200);
    expect(await small.send('bob', 'POST', 'me/sounds', upload(wav(0.2)))).toEqual({
      status: 409,
      body: { error: 'PERSONAL_SOUND_STORAGE_LIMIT' },
    });
    expect((await small.send('alice', 'DELETE', `me/sounds/${first.body.id}`)).status).toBe(200);
    expect((await small.send('bob', 'POST', 'me/sounds', upload(wav(0.2)))).status).toBe(200);
  });

  it('keeps presets usable when uploads are off and reports an unconfigured service', async () => {
    const off = await open(await temp(), { uploads: false });
    expect((await off.send('alice', 'GET', 'me')).body.uploads).toBe(false);
    expect(await off.send('alice', 'POST', 'me/sounds', upload(wav(0.5)))).toEqual({
      status: 403,
      body: { error: 'PERSONAL_SOUND_UPLOADS_DISABLED' },
    });
    const assigned = await off.send('alice', 'PUT', 'me/assign', {
      enter: 'p.fanfar',
      leave: null,
    });
    expect(assigned.status).toBe(200);
    expect(assigned.body.assign).toEqual({ enter: 'p.fanfar', leave: null });

    const unconfigured = await open(undefined);
    const missing = { status: 501, body: { error: 'PERSONAL_SOUNDS_NOT_CONFIGURED' } };
    expect(await unconfigured.send('alice', 'GET', 'me')).toEqual(missing);
    expect(await unconfigured.send('bob', 'GET', 'DEMO-room/alice/p.fanfar')).toEqual(missing);
    expect(await unconfigured.sounds.attributes('alice')).toEqual({});
  });

  it('assigns only own uploads or presets, and deleting a sound clears its assignment', async () => {
    const directory = await temp();
    const app = await open(directory);
    const mine = (await app.send('alice', 'POST', 'me/sounds', upload(wav(0.5)))).body.id;
    const theirs = (await app.send('bob', 'POST', 'me/sounds', upload(wav(0.5)))).body.id;
    const assigned = await app.send('Bearer alice', 'PUT', 'me/assign', {
      enter: mine,
      leave: 'p.hoscakal',
    });
    expect(assigned.status).toBe(200);
    expect(assigned.body.assign).toEqual({ enter: mine, leave: 'p.hoscakal' });
    expect(app.changes).toEqual([
      ['alice', { 'rooms.sound.enter': mine, 'rooms.sound.leave': 'p.hoscakal' }],
    ]);
    expect(await app.sounds.attributes('alice')).toEqual({
      'rooms.sound.enter': mine,
      'rooms.sound.leave': 'p.hoscakal',
    });
    const notFound = { status: 404, body: { error: 'PERSONAL_SOUND_NOT_FOUND' } };
    expect(await app.send('alice', 'PUT', 'me/assign', { enter: theirs, leave: null })).toEqual(
      notFound,
    );
    expect(
      await app.send('alice', 'PUT', 'me/assign', { enter: 'p.unknown', leave: null }),
    ).toEqual(notFound);
    expect((await app.send('alice', 'PUT', 'me/assign', { enter: mine })).status).toBe(400);
    expect((await app.send('alice', 'PUT', 'me/assign', assigned.body.assign)).status).toBe(200);
    expect(app.changes).toHaveLength(1);

    expect(await app.send('alice', 'DELETE', `me/sounds/${theirs}`)).toEqual(notFound);
    expect(await app.send('alice', 'DELETE', 'me/sounds/p.hoscakal')).toEqual(notFound);
    const removed = await app.send('alice', 'DELETE', `me/sounds/${mine}`);
    expect(removed.status).toBe(200);
    expect(removed.body.assign).toEqual({ enter: null, leave: 'p.hoscakal' });
    expect(removed.body.sounds).toEqual([]);
    await expect(stat(join(directory, 'alice', `${mine}.wav`))).rejects.toThrow();
    expect(app.changes.at(-1)).toEqual(['alice', { 'rooms.sound.enter': '' }]);
    expect(await app.sounds.attributes('alice')).toEqual({ 'rooms.sound.leave': 'p.hoscakal' });
    expect(await app.send('alice', 'DELETE', `me/sounds/${mine}`)).toEqual(notFound);
    expect(await stat(join(directory, 'bob', `${theirs}.wav`))).toBeTruthy();
  });

  it('serves a sound to listeners who can join the channel only when the owner has it', async () => {
    const directory = await temp();
    const app = await open(directory);
    const id = (await app.send('alice', 'POST', 'me/sounds', upload(wav(0.5)))).body.id;
    const received = await app.request('bob', 'GET', `DEMO-room/alice/${id}`);
    expect(received.status).toBe(200);
    expect(received.headers.get('content-type')).toBe('audio/wav');
    expect(received.headers.get('cache-control')).toBe('no-store');
    expect(Buffer.from(await received.arrayBuffer())).toEqual(
      await readFile(join(directory, 'alice', `${id}.wav`)),
    );
    const preset = await app.request('Bearer bob', 'GET', 'DEMO-room/alice/p.fanfar');
    expect(preset.status).toBe(200);
    expect(
      parsePersonalSoundWav(new Uint8Array(await preset.arrayBuffer())).length,
    ).toBeGreaterThan(0);
    const denial = { status: 403, body: { error: 'ROOM_ACCESS_DENIED' } };
    expect(await app.send('outsider', 'GET', `DEMO-room/alice/${id}`)).toEqual(denial);
    expect(await app.send('bob', 'GET', `DEMO-other/alice/${id}`)).toEqual(denial);
    const notFound = { status: 404, body: { error: 'PERSONAL_SOUND_NOT_FOUND' } };
    expect(await app.send('bob', 'GET', `DEMO-room/bob/${id}`)).toEqual(notFound);
    expect(await app.send('bob', 'GET', `DEMO-room/alice/${randomUUID()}`)).toEqual(notFound);
    expect(await app.send('bob', 'GET', 'DEMO-room/alice/p.unknown')).toEqual(notFound);
    expect((await app.request('bob', 'GET', `DEMO-room/al.ce/${id}`)).status).toBe(400);
    expect((await app.request('bob', 'GET', 'DEMO-room/alice/not-a-sound')).status).toBe(400);
  });

  it('routes me/sounds previews to the caller, never to the channel route', async () => {
    const directory = await temp();
    const app = await open(directory, {
      authorize: async () => {
        throw denied(403, 'ROOM_ACCESS_DENIED');
      },
    });
    const id = (await app.send('alice', 'POST', 'me/sounds', upload(wav(0.5)))).body.id;
    const own = await app.request('alice', 'GET', `me/sounds/${id}`);
    expect(own.status).toBe(200);
    expect(Buffer.from(await own.arrayBuffer())).toEqual(
      await readFile(join(directory, 'alice', `${id}.wav`)),
    );
    expect((await app.request('alice', 'GET', 'me/sounds/p.kapi')).status).toBe(200);
    expect((await app.send('bob', 'GET', `me/sounds/${id}`)).status).toBe(404);
  });

  it('reports unreadable storage and keeps grants free of it', async () => {
    const directory = await temp();
    const app = await open(directory);
    await mkdir(join(directory, 'carol'));
    await writeFile(join(directory, 'carol', 'profile.json'), '{"version":1');
    expect(await app.send('carol', 'GET', 'me')).toEqual({
      status: 503,
      body: { error: 'PERSONAL_SOUNDS_STORAGE_UNAVAILABLE' },
    });
    expect(await app.sounds.attributes('carol')).toEqual({});
    expect(await app.sounds.attributes('../carol')).toEqual({});
  });
});

describe('personal sounds in the access service', { timeout: 20_000 }, () => {
  const claims = (token: string) =>
    JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
  const access = async (directory: string) => {
    const server = await createAccessServer({
      stoatUrl: 'http://test.local',
      livekitUrl: 'http://test.local',
      publicLivekitUrl: 'ws://test.local',
      apiKey: 'test',
      apiSecret: 'test-secret-key-at-least-32-characters',
      personalSoundsDirectory: directory,
    });
    cleanup.push(() => server.close());
    return server;
  };
  it('accepts the largest clip through the service parser and limits upload bursts', async () => {
    const server = await access(await temp());
    const post = (audio: Buffer) =>
      server.inject({
        method: 'POST',
        url: '/v1/personal-sounds/me/sounds',
        headers: { authorization: 'viewer-token' },
        payload: upload(audio),
      });
    expect((await post(wav(4.05))).statusCode).toBe(200);
    for (let i = 0; i < 5; i++) expect((await post(wav(0.2))).statusCode).toBe(200);
    const limited = await post(wav(0.2));
    expect(limited.statusCode).toBe(429);
    expect(limited.json().error).toBe('RATE_LIMITED');
  });
  it('stamps the saved choice on the token, updates live participants and grants despite storage failures', async () => {
    const directory = await temp();
    const server = await access(directory);
    const grant = async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/v1/media/grant',
        headers: { authorization: 'viewer-token' },
        payload: { channelId: 'room' },
      });
      expect(response.statusCode).toBe(200);
      return claims(response.json().token);
    };
    const assign = (payload: { enter: string | null; leave: string | null }) =>
      server.inject({
        method: 'PUT',
        url: '/v1/personal-sounds/me/assign',
        headers: { authorization: 'Bearer viewer-token' },
        payload,
      });
    expect((await grant()).attributes).toBeUndefined();
    expect((await assign({ enter: 'p.fanfar', leave: null })).statusCode).toBe(200);
    expect(sdk.updateParticipant).toHaveBeenLastCalledWith('stoat-channel-room', 'viewer', {
      attributes: { 'rooms.sound.enter': 'p.fanfar' },
    });
    expect((await grant()).attributes).toEqual({ 'rooms.sound.enter': 'p.fanfar' });

    sdk.updateParticipant.mockRejectedValueOnce(Object.assign(Error(), { code: 'not_found' }));
    expect((await assign({ enter: null, leave: 'p.kapanis' })).statusCode).toBe(200);
    expect(sdk.updateParticipant).toHaveBeenLastCalledWith('stoat-channel-room', 'viewer', {
      attributes: { 'rooms.sound.enter': '', 'rooms.sound.leave': 'p.kapanis' },
    });
    expect((await grant()).attributes).toEqual({ 'rooms.sound.leave': 'p.kapanis' });

    await writeFile(join(directory, 'viewer', 'profile.json'), 'not json');
    expect((await grant()).attributes).toBeUndefined();
  });
});
