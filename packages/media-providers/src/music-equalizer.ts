/** Personal bass/mid/treble for the DJ, in decibels; it changes only what this listener hears. */
export interface MusicEqualizer {
  bass: number;
  mid: number;
  treble: number;
}
export const FLAT_EQUALIZER: MusicEqualizer = { bass: 0, mid: 0, treble: 0 };
export const EQUALIZER_LIMIT_DB = 12;
const bands = [
  { key: 'bass', type: 'lowshelf', frequency: 180 },
  { key: 'mid', type: 'peaking', frequency: 1000, q: 0.8 },
  { key: 'treble', type: 'highshelf', frequency: 4500 },
] as const;

/** A valid equalizer, or null; values outside ±12 dB or of the wrong type are refused. */
export function parseEqualizer(value: unknown): MusicEqualizer | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const result = { ...FLAT_EQUALIZER };
  for (const { key } of bands) {
    const gain = (value as Record<string, unknown>)[key];
    if (typeof gain !== 'number' || !Number.isFinite(gain) || Math.abs(gain) > EQUALIZER_LIMIT_DB)
      return null;
    result[key] = Math.round(gain * 2) / 2;
  }
  return result;
}
export const isFlat = (eq: MusicEqualizer) => bands.every(({ key }) => eq[key] === 0);

/** Bass shelf, mid bell and treble shelf, in signal order. */
export function equalizerNodes(context: BaseAudioContext): BiquadFilterNode[] {
  return bands.map((band) => {
    const node = context.createBiquadFilter();
    node.type = band.type;
    node.frequency.value = band.frequency;
    if ('q' in band) node.Q.value = band.q;
    return node;
  });
}
export function tuneEqualizer(
  nodes: BiquadFilterNode[],
  eq: MusicEqualizer,
  context: BaseAudioContext,
) {
  // A short glide avoids clicks while a slider moves.
  bands.forEach(({ key }, index) =>
    nodes[index]?.gain.setTargetAtTime(eq[key], context.currentTime, 0.03),
  );
}
