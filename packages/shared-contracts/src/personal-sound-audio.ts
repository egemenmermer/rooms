import { PERSONAL_SOUND_LIMITS, PERSONAL_SOUND_LOUDNESS } from './personal-sounds';

export class PersonalSoundAudioError extends Error {
  constructor(readonly code: 'PERSONAL_SOUND_INVALID_AUDIO' | 'PERSONAL_SOUND_SILENT') {
    super(code);
  }
}
const RATE = PERSONAL_SOUND_LIMITS.sampleRate;
const invalid = () => new PersonalSoundAudioError('PERSONAL_SOUND_INVALID_AUDIO');
const dbToGain = (db: number) => 10 ** (db / 20);

/** Canonical 48 kHz mono PCM16 WAV only; anything else is rejected rather than interpreted. */
export function parsePersonalSoundWav(bytes: Uint8Array): Float32Array {
  if (bytes.length < 46 || bytes.length > PERSONAL_SOUND_LIMITS.maxClipBytes) throw invalid();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const text = (offset: number) => String.fromCharCode(...bytes.subarray(offset, offset + 4));
  if (
    text(0) !== 'RIFF' ||
    view.getUint32(4, true) !== bytes.length - 8 ||
    text(8) !== 'WAVE' ||
    text(12) !== 'fmt ' ||
    view.getUint32(16, true) !== 16 ||
    view.getUint16(20, true) !== 1 ||
    view.getUint16(22, true) !== 1 ||
    view.getUint32(24, true) !== RATE ||
    view.getUint32(28, true) !== RATE * 2 ||
    view.getUint16(32, true) !== 2 ||
    view.getUint16(34, true) !== 16 ||
    text(36) !== 'data' ||
    view.getUint32(40, true) !== bytes.length - 44 ||
    (bytes.length - 44) % 2
  )
    throw invalid();
  const count = (bytes.length - 44) / 2;
  if (count / RATE > PERSONAL_SOUND_LIMITS.acceptDurationSec) throw invalid();
  const samples = new Float32Array(count);
  for (let i = 0; i < count; i++) samples[i] = view.getInt16(44 + i * 2, true) / 32768;
  return samples;
}

export function encodePersonalSoundWav(samples: Float32Array): Uint8Array {
  const bytes = new Uint8Array(44 + samples.length * 2),
    view = new DataView(bytes.buffer);
  const text = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) bytes[offset + i] = value.charCodeAt(i);
  };
  text(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, RATE, true);
  view.setUint32(28, RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const value = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(
      44 + i * 2,
      value < 0 ? Math.round(value * 32768) : Math.round(value * 32767),
      true,
    );
  }
  return bytes;
}

/** ITU-R BS.1770-4 integrated loudness of a 48 kHz mono signal, in LUFS (`-Infinity` for silence). */
export function integratedLoudness(samples: Float32Array): number {
  // K-weighting at 48 kHz: high-shelf pre-filter, then the RLB high-pass.
  const stages = [
    [1.53512485958697, -2.69169618940638, 1.19839281085285, -1.69065929318241, 0.73248077421585],
    [1, -2, 1, -1.99004745483398, 0.99007225036621],
  ];
  let weighted = samples;
  for (const [b0, b1, b2, a1, a2] of stages) {
    const out = new Float32Array(weighted.length);
    let x1 = 0,
      x2 = 0,
      y1 = 0,
      y2 = 0;
    for (let i = 0; i < weighted.length; i++) {
      const x = weighted[i],
        y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
      x2 = x1;
      x1 = x;
      y2 = y1;
      y1 = y;
      out[i] = y;
    }
    weighted = out;
  }
  const block = Math.round(0.4 * RATE),
    step = Math.round(0.1 * RATE),
    powers: number[] = [];
  const power = (from: number, to: number) => {
    let sum = 0;
    for (let i = from; i < to; i++) sum += weighted[i] * weighted[i];
    return sum / Math.max(1, to - from);
  };
  // Clips shorter than one gating block are measured whole.
  if (weighted.length < block) powers.push(power(0, weighted.length));
  else
    for (let start = 0; start + block <= weighted.length; start += step)
      powers.push(power(start, start + block));
  const lufs = (value: number) => -0.691 + 10 * Math.log10(value);
  const gated = (threshold: number) => powers.filter((p) => p > 0 && lufs(p) > threshold);
  const absolute = gated(-70);
  if (!absolute.length) return -Infinity;
  const relative = lufs(absolute.reduce((a, b) => a + b, 0) / absolute.length) - 10;
  const kept = gated(Math.max(-70, relative));
  return kept.length ? lufs(kept.reduce((a, b) => a + b, 0) / kept.length) : -Infinity;
}

/**
 * Trims silence, caps the duration, matches loudness, caps the peak by lowering gain only, and
 * fades the edges. The server runs this on every upload, so a client's own levels are never
 * trusted; running it twice changes nothing audible.
 */
export function processPersonalSound(input: Float32Array): {
  samples: Float32Array;
  lufs: number;
  durationSec: number;
} {
  const L = PERSONAL_SOUND_LOUDNESS,
    threshold = dbToGain(L.trimThresholdDbfs);
  let start = 0,
    end = input.length;
  const maxLead = Math.round(L.maxLeadingTrimSec * RATE);
  while (start < end && start < maxLead && Math.abs(input[start]) < threshold) start++;
  while (end > start && Math.abs(input[end - 1]) < threshold) end--;
  end = Math.min(end, start + Math.round(PERSONAL_SOUND_LIMITS.maxDurationSec * RATE));
  if (end - start < Math.round(L.minDurationSec * RATE))
    throw new PersonalSoundAudioError('PERSONAL_SOUND_SILENT');
  const clip = input.slice(start, end),
    loudness = integratedLoudness(clip);
  if (!(loudness >= L.silenceLufs)) throw new PersonalSoundAudioError('PERSONAL_SOUND_SILENT');
  let peak = 0;
  for (const value of clip) peak = Math.max(peak, Math.abs(value));
  const gain = Math.min(
    dbToGain(Math.min(L.targetLufs - loudness, L.maxBoostDb)),
    dbToGain(L.peakCeilingDbfs) / peak,
  );
  const fadeIn = Math.round(L.fadeInSec * RATE),
    fadeOut = Math.round(L.fadeOutSec * RATE);
  for (let i = 0; i < clip.length; i++)
    clip[i] *= gain * Math.min(1, i / fadeIn, (clip.length - 1 - i) / fadeOut);
  return {
    samples: clip,
    lufs: loudness + 20 * Math.log10(gain),
    durationSec: clip.length / RATE,
  };
}

/** Downmixes decoded device audio and picks the window that will be uploaded. */
export function personalSoundWindow(
  channels: Float32Array[],
  sampleRate: number,
  startSec: number,
): Float32Array {
  if (sampleRate !== RATE || !channels.length) throw invalid();
  const length = channels[0].length,
    from = Math.max(0, Math.min(length, Math.round(startSec * RATE))),
    to = Math.min(length, from + Math.round(PERSONAL_SOUND_LIMITS.maxDurationSec * RATE)),
    mono = new Float32Array(to - from);
  for (const channel of channels)
    for (let i = from; i < to; i++) mono[i - from] += channel[i] / channels.length;
  return mono;
}

export function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192)
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary);
}
export function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  if (binary.length > PERSONAL_SOUND_LIMITS.maxClipBytes) throw invalid();
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
