import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  PERSONAL_SOUND_CACHE_LIMITS,
  PersonalSoundCache,
} from '../apps/desktop/src/personal-sound-cache';
import {
  encodePersonalSoundWav,
  toBase64,
} from '../packages/shared-contracts/src/personal-sound-audio';

const bytes = encodePersonalSoundWav(new Float32Array(960).fill(0.1)),
  clip = toBase64(bytes);
const at = (sound: string, userId = 'ada') => ({ channelId: 'room', userId, sound });
let urls = 0,
  revoked: string[] = [];
beforeEach(() => {
  urls = 0;
  revoked = [];
  vi.useFakeTimers();
  vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:clip-${++urls}`);
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation((url) => void revoked.push(url));
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
const cacheWith = (read: () => Promise<string>, limits = {}) =>
  new PersonalSoundCache(() => read, { ...PERSONAL_SOUND_CACHE_LIMITS, ...limits });

it('shares one request between callers and serves the clip from memory afterwards', async () => {
  const read = vi.fn(async () => clip),
    cache = cacheWith(read);
  const [first, second] = await Promise.all([
    cache.resolve(at('p.fanfar')),
    cache.resolve(at('p.fanfar', 'bo')),
  ]);
  expect(first).toBe('blob:clip-1');
  expect(second).toBe('blob:clip-1');
  expect(await cache.resolve(at('p.fanfar'))).toBe('blob:clip-1');
  expect(read).toHaveBeenCalledTimes(1);
});
it('evicts the least recently used clip and revokes its URL', async () => {
  const read = vi.fn(async () => clip),
    cache = cacheWith(read, { entries: 2 });
  await cache.resolve(at('p.a'));
  await cache.resolve(at('p.b'));
  await cache.resolve(at('p.a'));
  await cache.resolve(at('p.c'));
  expect(revoked).toEqual(['blob:clip-2']);
  expect(await cache.resolve(at('p.a'))).toBe('blob:clip-1');
  await cache.resolve(at('p.b'));
  expect(read).toHaveBeenCalledTimes(4);
  expect(revoked).toEqual(['blob:clip-2', 'blob:clip-3']);
});
it('keeps the stored bytes under the memory budget', async () => {
  const cache = cacheWith(async () => clip, { bytes: bytes.length * 1.5 });
  await cache.resolve(at('p.a'));
  expect(await cache.resolve(at('p.b'))).toBe('blob:clip-2');
  expect(revoked).toEqual(['blob:clip-1']);
});
it('remembers a failure for a minute and rejects anything but the canonical clip', async () => {
  const read = vi
    .fn<() => Promise<string>>()
    .mockRejectedValueOnce(new Error('PERSONAL_SOUND_NOT_FOUND'))
    .mockResolvedValueOnce(toBase64(new TextEncoder().encode('<html>not a sound</html>')))
    .mockResolvedValue(clip);
  const cache = cacheWith(read);
  expect(await cache.resolve(at('p.a'))).toBeNull();
  expect(await cache.resolve(at('p.a', 'bo'))).toBeNull();
  expect(read).toHaveBeenCalledTimes(1);
  vi.advanceTimersByTime(60_000);
  expect(await cache.resolve(at('p.a'))).toBeNull();
  expect(read).toHaveBeenCalledTimes(2);
  expect(URL.createObjectURL).not.toHaveBeenCalled();
  vi.advanceTimersByTime(60_000);
  expect(await cache.resolve(at('p.a'))).toBe('blob:clip-1');
});
it('an account change revokes every clip and drops answers still on the way', async () => {
  let deliver!: (value: string) => void;
  const read = vi
    .fn<() => Promise<string>>()
    .mockResolvedValueOnce(clip)
    .mockImplementationOnce(() => new Promise((resolve) => (deliver = resolve)))
    .mockResolvedValue(clip);
  const cache = cacheWith(read);
  cache.setScope('a');
  await cache.resolve(at('p.a'));
  const late = cache.resolve(at('p.b'));
  await Promise.resolve();
  cache.setScope('b');
  expect(revoked).toEqual(['blob:clip-1']);
  deliver(clip);
  expect(await late).toBeNull();
  expect(await cache.resolve(at('p.a'))).toBe('blob:clip-2');
  expect(read).toHaveBeenCalledTimes(3);
});
it('is unavailable without the desktop bridge and never throws', async () => {
  const cache = new PersonalSoundCache(() => undefined);
  expect(cache.available).toBe(false);
  expect(await cache.resolve(at('p.a'))).toBeNull();
  cache.prefetch([at('p.a')]);
  await vi.advanceTimersByTimeAsync(5000);
  expect(URL.createObjectURL).not.toHaveBeenCalled();
});
it('warms up one clip at a time and follows the newest list', async () => {
  const pending: ((value: string) => void)[] = [];
  const read = vi.fn(() => new Promise<string>((resolve) => pending.push(resolve))),
    cache = cacheWith(read);
  cache.prefetch([at('p.a'), at('p.b'), at('p.c')]);
  expect(read).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(300);
  expect(read).toHaveBeenCalledTimes(1);
  cache.prefetch([at('p.a'), at('p.c')]);
  await vi.advanceTimersByTimeAsync(5000);
  expect(read).toHaveBeenCalledTimes(1);
  pending[0](clip);
  await vi.advanceTimersByTimeAsync(300);
  expect(read).toHaveBeenCalledTimes(2);
  expect(read.mock.calls.map((call) => (call as unknown as string[])[2])).toEqual(['p.a', 'p.c']);
  pending[1](clip);
  await vi.advanceTimersByTimeAsync(5000);
  expect(read).toHaveBeenCalledTimes(2);
  expect(await cache.resolve(at('p.c'))).toBe('blob:clip-2');
});
