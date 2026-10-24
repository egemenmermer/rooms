import { useRooms } from '../../store';

/**
 * Batak table cues, synthesised like `room-event-sounds.tsx` (short low-amplitude PCM, no asset or
 * network) and played at the "Ses efektleri" level on the chosen output device. Same synthesis as
 * `pisti/sounds.ts`; a shared `games/shared/sounds.ts` should replace both.
 */
export type BatakCue = 'play' | 'take' | 'turn';

/** Notes per cue: [frequency Hz, seconds]. */
const notes: Record<BatakCue, [number, number][]> = {
  play: [[330, 0.07]],
  take: [
    [392, 0.08],
    [523, 0.1],
  ],
  turn: [
    [660, 0.08],
    [880, 0.1],
  ],
};
const sources = new Map<BatakCue, string>();

function source(cue: BatakCue): string {
  const cached = sources.get(cue);
  if (cached) return cached;
  const rate = 24000,
    parts = notes[cue],
    count = Math.round(rate * parts.reduce((sum, [, seconds]) => sum + seconds, 0)),
    buffer = new ArrayBuffer(44 + count * 2),
    view = new DataView(buffer);
  const text = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
  };
  text(0, 'RIFF');
  view.setUint32(4, 36 + count * 2, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, count * 2, true);
  let start = 0;
  for (const [frequency, seconds] of parts) {
    const length = Math.round(rate * seconds);
    for (let i = 0; i < length && start + i < count; i++) {
      const time = i / rate,
        envelope = Math.sin(Math.PI * (i / length)) ** 2;
      view.setInt16(
        44 + (start + i) * 2,
        Math.round(Math.sin(2 * Math.PI * frequency * time) * envelope * 0.12 * 32767),
        true,
      );
    }
    start += length;
  }
  const url = URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }));
  sources.set(cue, url);
  return url;
}

/** Plays a cue; never throws (no audio device, jsdom, autoplay policy). */
export function playBatakCue(cue: BatakCue) {
  try {
    const preferences = useRooms.getState().preferences,
      level = preferences.soundEffectsLevel;
    if (!(level > 0) || typeof Audio === 'undefined') return;
    const player = new Audio(source(cue));
    player.volume = Math.min(1, level);
    void (async () => {
      try {
        if (preferences.outputId && 'setSinkId' in player)
          await (player as HTMLAudioElement & { setSinkId(id: string): Promise<void> }).setSinkId(
            preferences.outputId,
          );
        await player.play();
      } catch {
        /* A table cue must never fail the game. */
      }
    })();
  } catch {
    /* No audio support. */
  }
}
