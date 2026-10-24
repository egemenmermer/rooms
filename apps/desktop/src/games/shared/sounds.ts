import { useEffect, useRef } from 'react';
import { useCommunity } from '../../community';
import { mediaProvider } from '../../runtime-sources';
import { useRooms } from '../../store';
import { encodePersonalSoundWav } from '../../../../../packages/shared-contracts/src/personal-sound-audio';
import { PERSONAL_SOUND_LIMITS } from '../../../../../packages/shared-contracts/src/personal-sounds';
import type { GamePublicState } from '../../../../../packages/activity-protocol/src';
import { array } from './model';

/** Table cues. `play` is a card on the felt, `tile` a stone/tile click, `end` a round lost or drawn. */
export type GameCue = 'deal' | 'play' | 'tile' | 'capture' | 'dice' | 'turn' | 'win' | 'end';

const RATE = PERSONAL_SOUND_LIMITS.sampleRate;

/** A tiny deterministic noise source, so a cue sounds the same on every machine and in tests. */
function noise(seed: number) {
  let value = seed;
  return () => {
    value = (value * 1103515245 + 12345) & 0x7fffffff;
    return value / 0x3fffffff - 1;
  };
}
const tone = (frequency: number, t: number) => Math.sin(2 * Math.PI * frequency * t);
/** Fast attack, exponential decay. */
const pluck = (t: number, decay: number) =>
  t < 0 ? 0 : Math.min(1, t / 0.004) * Math.exp(-t / decay);
/** Notes that each ring for `length` seconds, starting `step` seconds apart. */
const notes = (t: number, frequencies: number[], step: number, length: number, gain: number) =>
  frequencies.reduce((sum, frequency, index) => {
    const local = t - index * step;
    return local < 0 || local > length
      ? sum
      : sum +
          (tone(frequency, local) + 0.3 * tone(frequency * 2, local)) *
            pluck(local, length / 3) *
            gain;
  }, 0);

const recipes: Record<
  GameCue,
  { seconds: number; sample(t: number, random: () => number): number }
> = {
  // A card sliding off the deck: a short airy swish.
  deal: {
    seconds: 0.16,
    sample: (t, random) => random() * Math.sin((Math.PI * t) / 0.16) ** 2 * 0.22,
  },
  // A card slapped on the felt: a noise snap over a low thump.
  play: {
    seconds: 0.12,
    sample: (t, random) => random() * pluck(t, 0.018) * 0.32 + tone(140, t) * pluck(t, 0.03) * 0.25,
  },
  // A tile or stone knocking on the board: a bright, very short click.
  tile: {
    seconds: 0.08,
    sample: (t, random) =>
      (tone(1900, t) * 0.5 + tone(2700, t) * 0.3 + random() * 0.2) * pluck(t, 0.012) * 0.4,
  },
  // Cards swept to a player: a rising two-note figure under a swish.
  capture: {
    seconds: 0.3,
    sample: (t, random) => notes(t, [520, 780], 0.09, 0.2, 0.12) + random() * pluck(t, 0.05) * 0.08,
  },
  // Dice rattling: three uneven knocks.
  dice: {
    seconds: 0.26,
    sample: (t, random) =>
      [0, 0.07, 0.16].reduce(
        (sum, at, index) =>
          sum +
          (random() * 0.6 + tone(900 + index * 260, t - at) * 0.4) * pluck(t - at, 0.014) * 0.36,
        0,
      ),
  },
  // Your turn: a soft two-note chime, close to the room's enter cue.
  turn: { seconds: 0.36, sample: (t) => notes(t, [660, 880], 0.12, 0.24, 0.14) },
  // A won round: a short major arpeggio.
  win: { seconds: 0.62, sample: (t) => notes(t, [523, 659, 784, 1047], 0.1, 0.3, 0.12) },
  // A round that ended without the viewer winning: two falling notes.
  end: { seconds: 0.4, sample: (t) => notes(t, [587, 440], 0.14, 0.26, 0.11) },
};

const sources = new Map<GameCue, string>();
/** Original synthesized PCM cue as a blob URL (no asset, no network); cached per cue. */
export function gameCueSource(cue: GameCue): string {
  const cached = sources.get(cue);
  if (cached) return cached;
  const recipe = recipes[cue],
    random = noise(cue.length * 7919),
    samples = new Float32Array(Math.round(RATE * recipe.seconds));
  for (let i = 0; i < samples.length; i++) samples[i] = recipe.sample(i / RATE, random);
  const bytes = encodePersonalSoundWav(samples);
  const url = URL.createObjectURL(new Blob([bytes.buffer as ArrayBuffer], { type: 'audio/wav' }));
  sources.set(cue, url);
  return url;
}

/** The same switch and level as the room's enter/leave cues; a deafened listener hears nothing. */
export function gameSoundsAudible() {
  const prefs = useRooms.getState().preferences;
  let deafened = false;
  try {
    deafened = mediaProvider().snapshot().deafened;
  } catch {
    /* No media runtime (tests, browser build): nothing to be deafened by. */
  }
  return (
    prefs.roomEventSounds &&
    prefs.soundEffectsLevel > 0 &&
    !deafened &&
    !!useCommunity.getState().user
  );
}

const lastPlayed = new Map<GameCue, number>();
/** Plays one cue now. Repeats of the same cue within 90 ms collapse (a burst of bot moves). */
export function playGameCue(cue: GameCue, gain = 0.8) {
  if (!gameSoundsAudible()) return;
  const now = performance.now();
  if (now - (lastPlayed.get(cue) ?? -Infinity) < 90) return;
  lastPlayed.set(cue, now);
  try {
    const prefs = useRooms.getState().preferences,
      player = new Audio(gameCueSource(cue));
    player.volume = Math.max(0, Math.min(1, gain * prefs.soundEffectsLevel));
    void (async () => {
      try {
        if (prefs.outputId && 'setSinkId' in player)
          await (player as HTMLAudioElement & { setSinkId(id: string): Promise<void> }).setSinkId(
            prefs.outputId,
          );
        await player.play();
      } catch {
        /* A cue must never fail a game action. */
      }
    })();
  } catch {
    /* Same: no audio element, no cue. */
  }
}

/** Per-hand counters a game can expose so its own moves get a precise cue (cards on the felt, captures, rolls). */
export type GameSoundSignals = Partial<Record<'play' | 'tile' | 'capture' | 'dice', number>>;
export interface GameSoundOptions {
  /** The cue for "someone moved" when the game gives no signals: a card game's `play` or a tile game's `tile`. */
  move?: 'play' | 'tile' | 'dice';
  /** Counters read from the view; an increase plays that cue. Replaces the turn-change move cue. */
  signals?(game: GamePublicState): GameSoundSignals;
}

interface CueFrame {
  table: string;
  status: GamePublicState['status'];
  turn: number | null;
  hands: number;
  signals: GameSoundSignals | null;
}
const frameOf = (game: GamePublicState, options: GameSoundOptions): CueFrame => ({
  table: `${game.kind}:${game.ownerId}`,
  status: game.status,
  turn: game.turn,
  hands: game.history.length,
  signals: options.signals ? options.signals(game) : null,
});

/** Whether the viewer's seat won the latest finished hand, from the shapes the built-in games record. */
export function wonLatestHand(game: GamePublicState, userId?: string) {
  const entry = game.history[game.history.length - 1];
  if (!entry || !userId) return false;
  const result = entry.result,
    position =
      entry.seats?.find((seat) => seat.userId === userId)?.position ??
      game.seats.findIndex((seat) => seat.userId === userId);
  const winners = array<unknown>(result.winners);
  if (winners.length) return winners.some((winner) => winner === position || winner === userId);
  if (typeof result.winner === 'number' || typeof result.winner === 'string')
    return result.winner === position || result.winner === userId;
  const player = array<Record<string, unknown>>(result.players).find(
    (item) => item.userId === userId,
  );
  if (player && typeof player.net === 'number') return player.net > 0;
  return false;
}

/**
 * The cues one view change deserves. The first view of a table is a baseline and plays nothing,
 * so opening a running table never bursts every cue at once.
 */
export function gameCues(
  previous: GamePublicState | null,
  next: GamePublicState,
  userId?: string,
  options: GameSoundOptions = {},
): GameCue[] {
  if (!previous) return [];
  const before = frameOf(previous, options),
    after = frameOf(next, options);
  if (before.table !== after.table || after.hands < before.hands) return [];
  const own = next.seats.find((seat) => seat.userId === userId);
  const cues: GameCue[] = [];
  const handEnded =
    after.hands > before.hands || (before.status === 'playing' && after.status === 'finished');
  if (handEnded) cues.push(own && wonLatestHand(next, userId) ? 'win' : 'end');
  const dealt =
    after.status === 'playing' && (before.status !== 'playing' || after.hands > before.hands);
  if (dealt) cues.push('deal');
  if (after.status === 'playing' && before.status === 'playing' && !handEnded) {
    if (after.signals && before.signals) {
      for (const key of ['capture', 'dice', 'play', 'tile'] as const)
        if ((after.signals[key] ?? 0) > (before.signals[key] ?? 0)) cues.push(key);
    } else if (!after.signals && before.turn !== null && after.turn !== before.turn)
      cues.push(options.move ?? 'play');
  }
  const mine =
    !!own &&
    !own.bot &&
    after.status === 'playing' &&
    after.turn === own.seat &&
    (before.turn !== after.turn || before.status !== 'playing' || dealt);
  if (mine) cues.push('turn');
  return cues;
}

/**
 * One line per table: `useGameSounds(game)` plays the deal, move, your-turn and end-of-hand cues
 * as the server view changes. Games with countable moves pass `signals` for exact cues.
 */
export function useGameSounds(game: GamePublicState | null, options: GameSoundOptions = {}) {
  const userId = useCommunity((s) => s.user?.id);
  const previous = useRef<GamePublicState | null>(null),
    latestOptions = useRef(options);
  latestOptions.current = options;
  useEffect(() => {
    if (!game) {
      previous.current = null;
      return;
    }
    const cues = gameCues(previous.current, game, userId, latestOptions.current);
    previous.current = game;
    for (const cue of cues) playGameCue(cue);
  }, [game, userId]);
}
