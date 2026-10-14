// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { SpeakingMeter } from '../packages/media-providers/src/speaking-meter';
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
function fixture() {
  vi.useFakeTimers();
  vi.stubGlobal(
    'MediaStream',
    class {
      constructor(public tracks: unknown[]) {}
    },
  );
  let level = 0;
  const disconnect = vi.fn(),
    analyser = {
      fftSize: 1024,
      smoothingTimeConstant: 0,
      disconnect,
      getFloatTimeDomainData: (data: Float32Array) => data.fill(level),
    };
  const context = {
    state: 'running',
    createMediaStreamSource: vi.fn(() => ({ connect: vi.fn(), disconnect })),
    createAnalyser: () => analyser,
    close: vi.fn(async () => {}),
    resume: vi.fn(async () => {}),
  };
  const changed = vi.fn(),
    meter = new SpeakingMeter(changed, () => context as unknown as AudioContext);
  const track = { readyState: 'live', muted: false } as MediaStreamTrack;
  return {
    meter,
    track,
    context,
    changed,
    level: (value: number) => {
      level = value;
    },
  };
}
it('shows actual speech within one sample and holds short pauses without waiting for server events', async () => {
  const f = fixture();
  f.meter.reconcile(new Map([['owner', f.track]]));
  expect(f.meter.speaking('owner')).toBe(false);
  f.level(0.03);
  await vi.advanceTimersByTimeAsync(40);
  expect(f.meter.speaking('owner')).toBe(true);
  expect(f.changed).toHaveBeenCalledTimes(1);
  f.level(0);
  await vi.advanceTimersByTimeAsync(120);
  expect(f.meter.speaking('owner')).toBe(true);
  await vi.advanceTimersByTimeAsync(80);
  expect(f.meter.speaking('owner')).toBe(false);
  f.meter.stop();
});
it('uses existing tracks, cleans replaced/removed tracks and never carries speech into another room', async () => {
  const f = fixture();
  f.meter.reconcile(new Map([['owner', f.track]]));
  f.level(0.03);
  await vi.advanceTimersByTimeAsync(40);
  f.meter.reconcile(new Map([['owner', { ...f.track } as MediaStreamTrack]]));
  expect(f.meter.speaking('owner')).toBe(false);
  f.meter.reconcile(new Map());
  expect(f.meter.speaking('owner')).toBeUndefined();
  expect(f.context.close).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});
it('falls back when audio context cannot run and stops reporting ended tracks', async () => {
  const f = fixture();
  f.context.state = 'suspended';
  f.meter.reconcile(new Map([['friend', f.track]]));
  expect(f.meter.speaking('friend')).toBeUndefined();
  expect(f.context.resume).toHaveBeenCalled();
  f.context.state = 'running';
  f.level(0.03);
  await vi.advanceTimersByTimeAsync(40);
  expect(f.meter.speaking('friend')).toBe(true);
  Object.assign(f.track, { readyState: 'ended' });
  await vi.advanceTimersByTimeAsync(40);
  expect(f.meter.speaking('friend')).toBe(false);
  f.meter.stop();
});
