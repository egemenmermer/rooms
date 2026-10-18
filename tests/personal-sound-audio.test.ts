import { describe, expect, it } from 'vitest';
import {
  PersonalSoundAudioError,
  encodePersonalSoundWav,
  fromBase64,
  integratedLoudness,
  parsePersonalSoundWav,
  personalSoundWindow,
  processPersonalSound,
  toBase64,
} from '../packages/shared-contracts/src/personal-sound-audio';
import { renderPersonalSoundPreset } from '../packages/shared-contracts/src/personal-sound-presets';
import {
  PERSONAL_SOUND_LIMITS,
  PERSONAL_SOUND_PRESETS,
  isPersonalSoundId,
} from '../packages/shared-contracts/src/personal-sounds';

const RATE = 48000;
const sine = (seconds: number, amplitude: number, f = 997) =>
  Float32Array.from(
    { length: Math.round(seconds * RATE) },
    (_, i) => Math.sin((2 * Math.PI * f * i) / RATE) * amplitude,
  );
const peakDb = (samples: Float32Array) =>
  20 * Math.log10(samples.reduce((m, v) => Math.max(m, Math.abs(v)), 0));

describe('integrated loudness', () => {
  it('matches the BS.1770 reference for a 997 Hz sine', () => {
    expect(integratedLoudness(sine(3, 1))).toBeCloseTo(-3.01, 1);
    expect(integratedLoudness(sine(3, 0.1))).toBeCloseTo(-23.01, 1);
  });
  it('reports silence as -Infinity and measures sub-block clips whole', () => {
    expect(integratedLoudness(new Float32Array(RATE))).toBe(-Infinity);
    expect(integratedLoudness(sine(0.2, 0.1))).toBeCloseTo(-23.01, 0);
  });
});

describe('processPersonalSound', () => {
  it('brings quiet and loud clips to the same loudness under the peak ceiling', () => {
    for (const amplitude of [0.05, 0.9]) {
      const result = processPersonalSound(sine(2, amplitude));
      expect(result.lufs).toBeCloseTo(-20, 0);
      expect(integratedLoudness(result.samples)).toBeCloseTo(-20, 0);
      expect(peakDb(result.samples)).toBeLessThanOrEqual(-3 + 1e-6);
    }
  });
  it('lowers gain instead of clipping a peaky clip', () => {
    const spiky = sine(2, 0.02);
    spiky[RATE] = 1;
    const result = processPersonalSound(spiky);
    expect(peakDb(result.samples)).toBeLessThanOrEqual(-3 + 1e-6);
    expect(result.lufs).toBeLessThan(-20);
  });
  it('does not boost a very quiet recording by more than 12 dB', () => {
    const result = processPersonalSound(sine(2, 0.01));
    expect(result.lufs).toBeCloseTo(integratedLoudness(sine(2, 0.01)) + 12, 0);
  });
  it('trims silence, caps the duration and fades the edges', () => {
    const padded = new Float32Array(Math.round(7 * RATE));
    padded.set(sine(6, 0.3), Math.round(0.5 * RATE));
    const result = processPersonalSound(padded);
    expect(result.durationSec).toBeCloseTo(PERSONAL_SOUND_LIMITS.maxDurationSec, 3);
    expect(result.samples[0]).toBe(0);
    expect(Math.abs(result.samples.at(-1)!)).toBeLessThan(1e-6);
  });
  it('rejects silence and near-silence', () => {
    expect(() => processPersonalSound(new Float32Array(RATE))).toThrow(PersonalSoundAudioError);
    expect(() => processPersonalSound(sine(1, 0.0005))).toThrow('PERSONAL_SOUND_SILENT');
  });
  it('is stable when the server processes an already processed clip', () => {
    const once = processPersonalSound(sine(3, 0.4, 440));
    const twice = processPersonalSound(parsePersonalSoundWav(encodePersonalSoundWav(once.samples)));
    expect(twice.lufs).toBeCloseTo(once.lufs, 1);
    // Only the faded edges that fall under the trim threshold go again.
    expect(twice.samples.length).toBeGreaterThan(once.samples.length - 0.01 * RATE);
  });
});

describe('canonical WAV', () => {
  it('round-trips mono 48 kHz PCM16 and survives base64', () => {
    const samples = processPersonalSound(sine(1, 0.3)).samples;
    const bytes = fromBase64(toBase64(encodePersonalSoundWav(samples)));
    const back = parsePersonalSoundWav(bytes);
    expect(back.length).toBe(samples.length);
    expect(Math.max(...back.map((v, i) => Math.abs(v - samples[i])))).toBeLessThan(1e-4);
  });
  it('rejects stereo, other rates, long and malformed files', () => {
    const good = encodePersonalSoundWav(sine(1, 0.3));
    const tweak = (offset: number, value: number, size: 16 | 32) => {
      const copy = good.slice(),
        view = new DataView(copy.buffer);
      if (size === 16) view.setUint16(offset, value, true);
      else view.setUint32(offset, value, true);
      return copy;
    };
    for (const bad of [
      tweak(22, 2, 16),
      tweak(24, 44100, 32),
      tweak(20, 3, 16),
      tweak(40, 10, 32),
      good.slice(0, 40),
      encodePersonalSoundWav(new Float32Array(Math.round(4.2 * RATE))),
      new TextEncoder().encode('ID3 not a wav file at all, just some bytes padding padding'),
    ])
      expect(() => parsePersonalSoundWav(bad)).toThrow('PERSONAL_SOUND_INVALID_AUDIO');
  });
  it('downmixes the chosen window from decoded device audio', () => {
    const left = sine(6, 0.5),
      right = new Float32Array(left.length);
    const mono = personalSoundWindow([left, right], RATE, 1);
    expect(mono.length).toBe(4 * RATE);
    expect(mono[100]).toBeCloseTo(left[RATE + 100] / 2, 6);
    expect(() => personalSoundWindow([left], 44100, 0)).toThrow();
  });
});

describe('presets', () => {
  it('render original, deterministic clips that normalize cleanly', () => {
    for (const { id } of PERSONAL_SOUND_PRESETS) {
      expect(isPersonalSoundId(id)).toBe(true);
      const raw = renderPersonalSoundPreset(id);
      expect(raw).toEqual(renderPersonalSoundPreset(id));
      const result = processPersonalSound(raw);
      expect(result.durationSec).toBeGreaterThan(0.1);
      expect(result.durationSec).toBeLessThanOrEqual(2);
      expect(peakDb(result.samples)).toBeLessThanOrEqual(-3 + 1e-6);
    }
  });
  it('accepts uploaded ids and future preset ids but not arbitrary attribute text', () => {
    expect(isPersonalSoundId('6f1c2a3b-1234-4abc-8def-0123456789ab')).toBe(true);
    expect(isPersonalSoundId('p.yeni-ses')).toBe(true);
    for (const bad of ['', 'p.', 'p.Upper', '../etc/passwd', 'https://x', 42])
      expect(isPersonalSoundId(bad)).toBe(false);
  });
});
