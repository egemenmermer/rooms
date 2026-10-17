import { expect, it } from 'vitest';
import {
  FLAT_EQUALIZER,
  isFlat,
  parseEqualizer,
} from '../packages/media-providers/src/music-equalizer';

it('accepts three bands within ±12 dB in half-decibel steps and nothing else', () => {
  expect(parseEqualizer({ bass: 4.26, mid: -12, treble: 12 })).toEqual({
    bass: 4.5,
    mid: -12,
    treble: 12,
  });
  for (const value of [
    null,
    [],
    { bass: 1, mid: 0 },
    { bass: 13, mid: 0, treble: 0 },
    { bass: '3', mid: 0, treble: 0 },
    { bass: Number.NaN, mid: 0, treble: 0 },
  ])
    expect(parseEqualizer(value)).toBeNull();
  expect(isFlat(FLAT_EQUALIZER)).toBe(true);
  expect(isFlat({ bass: 0, mid: 0.5, treble: 0 })).toBe(false);
});
