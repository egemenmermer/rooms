import { PERSONAL_SOUND_LIMITS, type PersonalSoundPresetId } from './personal-sounds';

const RATE = PERSONAL_SOUND_LIMITS.sampleRate;
type Timbre = 'brass' | 'square' | 'bell' | 'soft';

/** Original synthesized presets: no recordings, no licences, identical on every server. */
function note(out: Float32Array, at: number, length: number, f: number, timbre: Timbre, gain = 1) {
  const first = Math.round(at * RATE),
    release = timbre === 'bell' ? 0 : 0.07,
    tail = timbre === 'bell' ? length : 0,
    count = Math.min(out.length - first, Math.round((length + release + tail) * RATE));
  for (let i = 0; i < count; i++) {
    const t = i / RATE;
    let envelope = Math.min(1, t / (timbre === 'bell' ? 0.003 : 0.012));
    if (timbre === 'bell') envelope *= Math.exp(-t / (length * 0.5));
    else envelope *= t > length ? Math.max(0, 1 - (t - length) / release) : 1 - 0.2 * (t / length);
    let value = 0;
    if (timbre === 'brass')
      for (let h = 1; h <= 7; h++)
        value +=
          (Math.sin(2 * Math.PI * f * h * t) / h ** 1.6) * (h === 1 ? 1 : Math.min(1, t / 0.05));
    else if (timbre === 'square') {
      for (let h = 1; h <= 9; h += 2) value += Math.sin(2 * Math.PI * f * h * t) / h;
      value *= 0.7;
    } else if (timbre === 'bell')
      value = Math.sin(
        2 * Math.PI * f * t + 2.2 * Math.exp(-t / 0.22) * Math.sin(2 * Math.PI * f * 3.5 * t),
      );
    else value = Math.sin(2 * Math.PI * f * t) + 0.18 * Math.sin(4 * Math.PI * f * t);
    out[first + i] += value * envelope * gain;
  }
}
function glide(out: Float32Array, at: number, length: number, from: number, to: number, gain = 1) {
  const first = Math.round(at * RATE),
    count = Math.min(out.length - first, Math.round(length * RATE));
  let phase = 0;
  for (let i = 0; i < count; i++) {
    const t = i / RATE,
      k = t / length,
      f = from * (to / from) ** k * (1 + 0.01 * Math.sin(2 * Math.PI * 7 * t));
    phase += (2 * Math.PI * f) / RATE;
    out[first + i] +=
      (Math.sin(phase) + 0.25 * Math.sin(2 * phase)) *
      Math.min(1, t / 0.01) *
      (1 - k) ** 1.5 *
      gain;
  }
}
const designs: Record<PersonalSoundPresetId, (out: Float32Array) => void> = {
  'p.fanfar': (out) => {
    for (const [at, length, f] of [
      [0, 0.1, 392],
      [0.11, 0.1, 523.25],
      [0.22, 0.1, 659.25],
      [0.33, 0.55, 783.99],
    ])
      note(out, at, length, f, 'brass');
    note(out, 0.33, 0.55, 392, 'brass', 0.5);
  },
  'p.kapi': (out) => {
    note(out, 0, 0.7, 659.25, 'bell');
    note(out, 0.42, 0.9, 523.25, 'bell');
  },
  'p.arcade': (out) =>
    [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) =>
      note(out, i * 0.06, i === 4 ? 0.16 : 0.055, f, 'square', 0.5),
    ),
  'p.portal': (out) => {
    for (const [at, gain] of [
      [0, 1],
      [0.09, 0.35],
      [0.18, 0.15],
    ])
      glide(out, at, 0.6, 220, 880, gain);
  },
  'p.damla': (out) => {
    glide(out, 0, 0.12, 1400, 480);
    glide(out, 0.13, 0.1, 1800, 700, 0.5);
  },
  'p.kristal': (out) => {
    for (const [at, f] of [
      [0, 1046.5],
      [0.07, 1318.5],
      [0.14, 1567.98],
    ])
      note(out, at, 0.7, f, 'bell', 0.6);
  },
  'p.kapanis': (out) => {
    for (const [at, length, f] of [
      [0, 0.1, 783.99],
      [0.11, 0.1, 659.25],
      [0.22, 0.1, 523.25],
      [0.33, 0.5, 392],
    ])
      note(out, at, length, f, 'brass');
  },
  'p.hoscakal': (out) => {
    note(out, 0, 0.16, 587.33, 'soft');
    note(out, 0.2, 0.42, 440, 'soft');
  },
};

/** Raw preset signal; run it through `processPersonalSound` like any upload. */
export function renderPersonalSoundPreset(id: PersonalSoundPresetId): Float32Array {
  const out = new Float32Array(2 * RATE);
  designs[id](out);
  return out;
}
