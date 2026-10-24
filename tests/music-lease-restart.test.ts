import { afterEach, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { registerMusicGateway } from '../apps/services/access/music-gateway';
import { renewMusicLease } from '../apps/services/music/lease';

const secret = 'a'.repeat(40);
const state = {
  channelId: 'room',
  identity: 'rooms-music-room',
  status: 'paused',
  queue: [],
  currentId: null,
  positionSec: 0,
  error: null,
};
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** One access process: its own Fastify instance and gateway over a shared lease file. */
function boot(
  file: string | null,
  rights: { allowed: boolean; token?: string },
  overrides: { secret?: string } = {},
) {
  const server = Fastify();
  const roomService = {
    getParticipant: vi.fn(async () => ({ identity: 'self' })),
    listParticipants: vi.fn(async () => [{ identity: 'self' }]),
    removeParticipant: vi.fn(async () => {}),
    updateParticipant: vi.fn(async () => {}),
  };
  const authorize = vi.fn(async (token: string) => {
    if (rights.token && token !== rights.token)
      throw Object.assign(new Error('bad token'), { status: 401 });
    return { userId: 'self', canControl: rights.allowed };
  });
  registerMusicGateway(server, {
    url: 'http://worker',
    secret: overrides.secret ?? secret,
    apiKey: 'devkey',
    apiSecret: 'development-secret-at-least-32-characters',
    livekitUrl: 'ws://livekit:7880',
    roomService: roomService as never,
    authorize,
    leaseFile: file,
  });
  // The worker talks to access over HTTP; route its fetch into this instance.
  const viaAccess = (async (url: string, init: RequestInit) => {
    const response = await server.inject({
      method: 'POST',
      url: new URL(url).pathname,
      headers: init.headers as Record<string, string>,
      payload: String(init.body),
    });
    return new Response(response.body, { status: response.statusCode });
  }) as unknown as typeof fetch;
  return { server, roomService, authorize, viaAccess };
}
async function startSession(access: ReturnType<typeof boot>) {
  let leaseId = '';
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, options) => {
    leaseId = JSON.parse(String(options?.body)).lease.leaseId;
    return new Response(JSON.stringify(state));
  });
  const response = await access.server.inject({
    method: 'POST',
    url: '/v1/music/room',
    headers: { authorization: 'user-session' },
    payload: { type: 'play' },
  });
  expect(response.statusCode).toBe(200);
  return leaseId;
}
const renew = (access: ReturnType<typeof boot>, leaseId: string) =>
  renewMusicLease('http://access:3002', secret, 'room', leaseId, access.viaAccess);
const tmp = () => join(mkdtempSync(join(tmpdir(), 'music-leases-')), 'leases.json');

it('keeps a live DJ session through an access restart', async () => {
  const file = tmp();
  const first = boot(file, { allowed: true });
  const leaseId = await startSession(first);
  await expect(renew(first, leaseId)).resolves.toMatchObject({ leaseId });
  await first.server.close();
  // Shutdown must not remove the DJ from the room: the worker is still publishing.
  expect(first.roomService.removeParticipant).not.toHaveBeenCalled();
  // The stored file never holds the user's session token in the clear.
  expect(readFileSync(file, 'utf8')).not.toContain('user-session');

  const second = boot(file, { allowed: true, token: 'user-session' });
  // The very next worker heartbeat succeeds against the restarted service, same lease id.
  const lease = await renew(second, leaseId);
  expect(lease.leaseId).toBe(leaseId);
  expect(second.authorize).toHaveBeenCalledWith('user-session', 'room');
  expect(second.roomService.removeParticipant).not.toHaveBeenCalled();
  await second.server.close();
});

it('still rejects a lease the restarted service never issued', async () => {
  const file = tmp();
  const first = boot(file, { allowed: true });
  const leaseId = await startSession(first);
  await first.server.close();
  const second = boot(file, { allowed: true });
  await expect(renew(second, '11111111-1111-4111-8111-111111111111')).rejects.toThrow(
    'MUSIC_LEASE_REVOKED',
  );
  // Restoring a lease does not let the bot skip the secret.
  const unauthorized = await second.server.inject({
    method: 'POST',
    url: '/v1/music/internal/lease',
    headers: { authorization: 'Bearer nope' },
    payload: { channelId: 'room', leaseId },
  });
  expect(unauthorized.statusCode).toBe(401);
  await second.server.close();
});

it('ends a restored lease when the commander lost the right during the restart', async () => {
  const file = tmp();
  const first = boot(file, { allowed: true });
  const leaseId = await startSession(first);
  await first.server.close();
  const second = boot(file, { allowed: false });
  await expect(renew(second, leaseId)).rejects.toThrow('MUSIC_LEASE_REVOKED');
  expect(second.roomService.removeParticipant).toHaveBeenCalledWith(
    'stoat-channel-room',
    'rooms-music-room',
  );
  await second.server.close();
});

it('ends a restored lease whose user token no longer works', async () => {
  const file = tmp();
  const first = boot(file, { allowed: true });
  const leaseId = await startSession(first);
  await first.server.close();
  const second = boot(file, { allowed: true, token: 'another-session' });
  await expect(renew(second, leaseId)).rejects.toThrow('MUSIC_LEASE_REVOKED');
  await second.server.close();
});

it('does not bring back leases that are stale, damaged or sealed with another secret', async () => {
  const file = tmp();
  const first = boot(file, { allowed: true });
  const leaseId = await startSession(first);
  await first.server.close();
  const saved = readFileSync(file, 'utf8');

  const otherSecret = boot(file, { allowed: true }, { secret: 'b'.repeat(40) });
  await expect(
    renewMusicLease('http://access:3002', 'b'.repeat(40), 'room', leaseId, otherSecret.viaAccess),
  ).rejects.toThrow('MUSIC_LEASE_REVOKED');
  await otherSecret.server.close();

  writeFileSync(file, saved.replace(/.$/, ' '.repeat(0) + 'x'));
  const damaged = boot(file, { allowed: true });
  await expect(renew(damaged, leaseId)).rejects.toThrow('MUSIC_LEASE_REVOKED');
  await damaged.server.close();

  writeFileSync(file, saved);
  // Access was down for far longer than any restart: the old lease must not come back.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(Date.now() + 10 * 60_000);
  const stale = boot(file, { allowed: true });
  await expect(renew(stale, leaseId)).rejects.toThrow('MUSIC_LEASE_REVOKED');
  await stale.server.close();
});

it('keeps the old behavior without a lease file: shutdown removes the bot, restart forgets it', async () => {
  const first = boot(null, { allowed: true });
  const leaseId = await startSession(first);
  await first.server.close();
  expect(first.roomService.removeParticipant).toHaveBeenCalledWith(
    'stoat-channel-room',
    'rooms-music-room',
  );
  const second = boot(null, { allowed: true });
  await expect(renew(second, leaseId)).rejects.toThrow('MUSIC_LEASE_REVOKED');
  await second.server.close();
});

it('forgets a stopped session so a restart cannot revive it', async () => {
  const file = tmp();
  const first = boot(file, { allowed: true });
  const leaseId = await startSession(first);
  const stop = await first.server.inject({
    method: 'POST',
    url: '/v1/music/room',
    headers: { authorization: 'user-session' },
    payload: { type: 'stop' },
  });
  expect(stop.statusCode).toBe(200);
  await first.server.close();
  expect(existsSync(file)).toBe(false);
  const second = boot(file, { allowed: true });
  await expect(renew(second, leaseId)).rejects.toThrow('MUSIC_LEASE_REVOKED');
  await second.server.close();
});
