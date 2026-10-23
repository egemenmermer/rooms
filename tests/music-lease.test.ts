import { expect, it, vi } from 'vitest';
import { renewMusicLease } from '../apps/services/music/lease';

const renew = (request: typeof fetch) =>
  renewMusicLease('http://access:3002', 's'.repeat(32), 'room', 'lease', request);

it('ends the lease only when access refuses it', async () => {
  await expect(renew(async () => new Response('', { status: 403 }))).rejects.toThrow(
    'MUSIC_LEASE_REVOKED',
  );
  await expect(renew(async () => new Response('', { status: 401 }))).rejects.toThrow(
    'MUSIC_LEASE_REVOKED',
  );
});

it('treats an access restart, a timeout or an odd reply as passing', async () => {
  for (const request of [
    async () => {
      throw new TypeError('fetch failed');
    },
    async () => {
      throw new DOMException('The operation timed out.', 'TimeoutError');
    },
    async () => new Response('', { status: 503 }),
    async () => new Response('<html>', { status: 200 }),
  ])
    await expect(renew(request as typeof fetch)).rejects.toThrow('MUSIC_LEASE_UNAVAILABLE');
});

it('renews against the internal lease route with the service secret', async () => {
  const lease = { leaseId: 'lease', url: 'ws://livekit', token: 'token' };
  const request = vi.fn(async () => Response.json(lease));
  await expect(renew(request as unknown as typeof fetch)).resolves.toEqual(lease);
  expect(request).toHaveBeenCalledWith(
    'http://access:3002/v1/music/internal/lease',
    expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ channelId: 'room', leaseId: 'lease' }),
      redirect: 'error',
    }),
  );
});
