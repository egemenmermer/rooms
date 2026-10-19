import { describe, expect, it } from 'vitest';
import { vodSeekTo } from '../apps/desktop/src/cinema/HallPlayer';

type Range = { start: number; end: number };
/** The tick's previous decision: clamp to what the relay holds, whatever the direction. */
const previous = (time: number, drift: number, range: Range) =>
  Math.abs(drift) > 0.75 ? Math.min(range.end - 0.5, Math.max(range.start, time + drift)) : null;

/**
 * One viewer, simulated in 100 ms steps, under the player's 1 s sync tick and 1.5 s seek
 * guard. The relay writes 2 s segments at real time (`phaseMs` sets when they land) and its
 * edge starts at `edge`; the hall starts at `hall` and moves at real time. The viewer plays
 * up to the relay's edge and waits there for the next segment. Returns each seek's step.
 */
function watch(
  decide: (time: number, drift: number, range: Range) => number | null,
  {
    edge,
    hall,
    start = Math.min(edge, hall),
    phaseMs = 0,
    seconds = 30,
  }: { edge: number; hall: number; start?: number; phaseMs?: number; seconds?: number },
) {
  let time = start,
    seekAt = -Infinity;
  const seeks: number[] = [];
  for (let ms = 0; ms <= seconds * 1000; ms += 100) {
    if (ms % 1000 === 0) {
      const to = decide(time, hall + ms / 1000 - time, { start: 0, end: edge });
      if (to !== null && ms > seekAt) {
        seekAt = ms + 1500;
        seeks.push(Math.round((to - time) * 10) / 10);
        time = to;
      }
    }
    if (ms > 0 && (ms + phaseMs) % 2000 === 0) edge += 2;
    time = Math.min(edge, time + 0.1);
  }
  return seeks;
}
const phases = Array.from({ length: 20 }, (_, i) => i * 100);

describe('VOD sync with the hall', () => {
  it('leaves a viewer who is in step alone', () => {
    expect(vodSeekTo(100, 0.5, { start: 0, end: 200 })).toBeNull();
    expect(vodSeekTo(100, -0.7, { start: 0, end: 200 })).toBeNull();
  });

  it('moves a viewer forward or back onto the hall inside what the relay holds', () => {
    expect(vodSeekTo(100, 5, { start: 0, end: 200 })).toBe(105);
    expect(vodSeekTo(100, -3, { start: 0, end: 200 })).toBe(97);
    expect(vodSeekTo(100, -3, { start: 98.5, end: 200 })).toBe(98.5);
  });

  it('does not seek before the relay has a range', () => {
    expect(vodSeekTo(0, 10, null)).toBeNull();
  });

  it('never pulls a viewer at the relay edge back while the relay is short of the hall', () => {
    // The hall is 2 s past what the relay holds; the viewer waits at the relay's edge.
    expect(previous(101, 2, { start: 0, end: 101 })).toBe(100.5);
    expect(vodSeekTo(101, 2, { start: 0, end: 101 })).toBeNull();
    expect(vodSeekTo(99, 5, { start: 0, end: 101 })).toBeNull();
    // Far behind the edge: one step up to a little behind it.
    expect(vodSeekTo(80, 25, { start: 0, end: 101 })).toBe(98);
  });

  it('stops re-syncing every two seconds while the relay fills behind the hall', () => {
    for (const start of [100, 96, 80])
      for (const phaseMs of phases) {
        // Before: a seek on every other tick, back, in place or a little forward.
        expect(watch(previous, { edge: 100, hall: 105, start, phaseMs }).length).toBe(16);
        const seeks = watch(vodSeekTo, { edge: 100, hall: 105, start, phaseMs });
        expect(seeks.length).toBeLessThanOrEqual(2);
        expect(seeks.filter((step) => step <= 0)).toEqual([]);
      }
  });

  it('catches a viewer up or back once and then lets them play', () => {
    expect(watch(vodSeekTo, { edge: 400, hall: 104, start: 100 })).toEqual([4]);
    expect(watch(vodSeekTo, { edge: 400, hall: 97, start: 100 })).toEqual([-3]);
    expect(watch(vodSeekTo, { edge: 400, hall: 100.5, start: 100 })).toEqual([]);
  });
});
