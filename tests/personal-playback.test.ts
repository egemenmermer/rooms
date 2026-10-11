import { afterEach, describe, expect, it } from 'vitest';
import { liveWindow, startPersonalPlayback, stopPersonalPlayback, usePersonalPlayback } from '../apps/desktop/src/personal-playback';

afterEach(() => stopPersonalPlayback());
describe('private persistent provider playback', () => {
  it('accepts only opaque provider capabilities and retains the same session until stopped', () => {
    const media = { url: 'rooms-provider://e0536721-3849-40d9-9875-71d72cd19e76/stream', name: 'Authorized source', live: true };
    startPersonalPlayback(media, 'connection-one', 'owner');
    const original = usePersonalPlayback.getState().session;
    stopPersonalPlayback('different-connection');
    expect(usePersonalPlayback.getState().session).toBe(original);
    expect(original?.media.url).toBe(media.url);
    stopPersonalPlayback('connection-one');
    expect(usePersonalPlayback.getState().session).toBeNull();
  });
  it('rejects actual source URLs, browser blobs and external media URLs', () => {
    for (const url of ['https://provider.example/secret.m3u8?token=secret', 'blob:https://app.example/123', 'rooms-provider://opaque/anything']) {
      expect(() => startPersonalPlayback({ url, name: 'Source', live: true }, 'connection', 'owner')).toThrow();
      expect(usePersonalPlayback.getState().session).toBeNull();
    }
  });
});
describe('live DVR window', () => {
  it('uses the last contiguous actual seekable range and clamps a stale position after window movement', () => {
    const range = { length: 2, start: (i: number) => i ? 200 : 0, end: (i: number) => i ? 260 : 10 };
    expect(liveWindow(range, 190)).toEqual({ start: 200, end: 260, canSeek: true, position: 200, lag: 70 });
    expect(liveWindow(range, 257)?.lag).toBe(3);
  });
  it('reports no seek window for absent, invalid or zero duration ranges', () => {
    expect(liveWindow({ length: 0, start: () => 0, end: () => 0 }, 0)).toBeNull();
    expect(liveWindow({ length: 1, start: () => 20, end: () => 20 }, 20)).toBeNull();
    expect(liveWindow({ length: 1, start: () => 0, end: () => Infinity }, 0)).toBeNull();
  });
  it('disables seeking on a short near-live buffer', () => {
    expect(liveWindow({ length: 1, start: () => 100, end: () => 103 }, 102)?.canSeek).toBe(false);
  });
});
