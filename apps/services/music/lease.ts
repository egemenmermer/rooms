import type { MusicLease } from './worker';
/**
 * Asks access whether the DJ may stay in the room. Only 401/403 end the lease for good; an
 * access restart, a timeout or an odd reply is passing and the worker asks again.
 */
export async function renewMusicLease(
  base: string,
  secret: string,
  channelId: string,
  leaseId: string,
  request: typeof fetch = fetch,
): Promise<MusicLease> {
  let response: Response;
  try {
    response = await request(`${base}/v1/music/internal/lease`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ channelId, leaseId }),
      redirect: 'error',
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    throw new Error('MUSIC_LEASE_UNAVAILABLE');
  }
  if (response.status === 401 || response.status === 403) throw new Error('MUSIC_LEASE_REVOKED');
  if (!response.ok) throw new Error('MUSIC_LEASE_UNAVAILABLE');
  try {
    return (await response.json()) as MusicLease;
  } catch {
    throw new Error('MUSIC_LEASE_UNAVAILABLE');
  }
}
