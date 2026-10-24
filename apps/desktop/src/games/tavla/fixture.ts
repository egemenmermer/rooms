import type { GamePublicState } from '../../../../../packages/activity-protocol/src';
import { tavlaMatchModule } from '../../../../../packages/games/src/matches';
import type { MatchState } from '../../../../../packages/games/src/match';
import {
  tavlaBotCommand,
  type TavlaCommand,
  type TavlaOptions,
  type TavlaState,
} from '../../../../../packages/games/src/tavla';

/**
 * Tavla scenes for tests and the dev fixture page, played through the real engine
 * (`tavlaMatchModule`) so every view field, legal move and legal action is what the service sends.
 * Ece (seat 0, light checkers) is the viewer unless a scene says otherwise; Osman is seat 1.
 */
type Match = MatchState<TavlaState, TavlaOptions>;

const seats = [
  { seat: 0, userId: 'ece', name: 'Ece', bot: false, chips: 0, connected: true },
  { seat: 1, userId: 'osman', name: 'Osman', bot: false, chips: 0, connected: true },
];

/** A queue of dice values for the engine's rng (`floor(rng * 6) + 1`). */
function dice(...values: number[]) {
  const queue = [...values];
  return () => {
    const die = queue.shift() ?? 1;
    return (die - 1) / 6 + 0.01;
  };
}

function act(state: Match, seat: number, command: TavlaCommand, rng = dice()): Match {
  const next = tavlaMatchModule.action(state, seat, command, rng);
  if ('error' in next) throw new Error(`fixture ${command.action}: ${next.error}`);
  return next;
}

/** Plays the seat's bot moves for the rest of its roll (not the confirm). */
function playOut(state: Match, seat: number): Match {
  for (let guard = 0; guard < 8; guard++) {
    const command = tavlaBotCommand(state.round, seat);
    if (command.action !== 'move') return state;
    state = act(state, seat, command);
  }
  return state;
}

function start(options: TavlaOptions = {}): Match {
  return tavlaMatchModule.start(2, options, 0, dice());
}

/** Ece rolls 5, Osman 3: Ece opens with 5-3. */
function eceOpens(): Match {
  return act(act(start(), 0, { action: 'roll' }, dice(5)), 1, { action: 'roll' }, dice(3));
}

/** Osman wins the opening (6 against 2), plays it and confirms: Ece is to roll. */
function osmanPlayed(): Match {
  let state = act(act(start(), 0, { action: 'roll' }, dice(2)), 1, { action: 'roll' }, dice(6));
  state = playOut(state, 1);
  return act(state, 1, { action: 'confirm' });
}

/** Replaces the round's position (and puts `seat` on roll), for bar and bear-off scenes. */
function arrange(
  state: Match,
  seat: number,
  points: number[],
  bar: [number, number],
  off: [number, number],
): Match {
  const next = structuredClone(state);
  Object.assign(next.round, {
    points,
    bar,
    off,
    phase: 'roll',
    turn: seat,
    dice: null,
    remaining: [],
    moves: [],
    turnStart: null,
    maxMoves: 0,
  });
  return next;
}

const empty = () => Array.from({ length: 24 }, () => 0);

/** Ece home with 13 checkers off: one left on her 1-point and one on her 2-point; Osman none off. */
function eceNearlyHome(): Match {
  const points = empty();
  points[0] = 1;
  points[1] = 1;
  points[23] = -5;
  points[22] = -5;
  points[12] = -5;
  return arrange(osmanPlayed(), 0, points, [0, 0], [13, 0]);
}

export const tavlaScenes = {
  /** Opening roll-off: Ece rolls her single die first. */
  opening: () => start(),
  /** Both opening dice came up 4: the roll-off starts again. */
  openingTie: () =>
    act(act(start(), 0, { action: 'roll' }, dice(4)), 1, { action: 'roll' }, dice(4)),
  /** Ece won the opening and plays 5-3; nothing moved yet. */
  yourMove: () => eceOpens(),
  /** One step of 5-3 played: undo open, confirm not yet. */
  yourMovePartial: () => {
    const state = eceOpens();
    return act(state, 0, tavlaBotCommand(state.round, 0));
  },
  /** Both steps played: undo and confirm open. */
  yourConfirm: () => playOut(eceOpens(), 0),
  /** Osman opened and confirmed; Ece must roll and sees his moves. */
  opponentLast: () => osmanPlayed(),
  /** Osman is moving his roll (one step played); Ece waits. */
  opponentMoving: () => {
    let state = act(osmanPlayed(), 0, { action: 'roll' }, dice(4, 2));
    state = playOut(state, 0);
    state = act(state, 0, { action: 'confirm' });
    state = act(state, 1, { action: 'roll' }, dice(6, 1));
    return act(state, 1, tavlaBotCommand(state.round, 1));
  },
  /** Ece has a checker on the bar and rolled 3-5: only bar entries are legal. */
  bar: () => {
    const base = osmanPlayed().round,
      points = [...base.points];
    points[5] -= 1;
    return act(
      arrange(osmanPlayed(), 0, points, [1, 0], [0, 0]),
      0,
      { action: 'roll' },
      dice(3, 5),
    );
  },
  /** Ece on the bar against Osman's closed home board: her roll passes. */
  passed: () => {
    const points = empty();
    for (let i = 18; i < 24; i++) points[i] = -2;
    points[11] = -3;
    points[5] = 14;
    return act(
      arrange(osmanPlayed(), 0, points, [1, 0], [0, 0]),
      0,
      { action: 'roll' },
      dice(4, 2),
    );
  },
  /** Ece bears off with 6-1: checkers can go to the tray. */
  bearOff: () => act(eceNearlyHome(), 0, { action: 'roll' }, dice(6, 1)),
  /** Ece bore off her last checkers with Osman at none off: mars, the next round's roll-off waits. */
  roundEnd: () => {
    let state = act(eceNearlyHome(), 0, { action: 'roll' }, dice(2, 1));
    state = playOut(state, 0);
    return act(state, 0, { action: 'confirm' });
  },
  /** As roundEnd but the mars wins a 3-point match (Ece led 1-0). */
  matchEnd: () => {
    let state = eceNearlyHome();
    state = { ...state, totals: [1, 0], options: { matchTo: 3 } };
    state.round.options = { ...state.round.options, matchTo: 3, scores: [1, 0] };
    state = act(state, 0, { action: 'roll' }, dice(2, 1));
    state = playOut(state, 0);
    return act(state, 0, { action: 'confirm' });
  },
} satisfies Record<string, () => Match>;

export type TavlaScene = keyof typeof tavlaScenes;

/**
 * The table as the service sends it to `viewer` (a seat's userId or a spectator id): the module's
 * view plus the service fields the table reads (legalActions, watching, turnDeadline).
 */
export function tavlaFixtureGame(scene: TavlaScene, viewer = 'ece'): GamePublicState {
  const state = tavlaScenes[scene](),
    seat = seats.find((entry) => entry.userId === viewer)?.seat ?? null,
    turn = tavlaMatchModule.turn(state);
  return {
    kind: 'rooms-tavla-v1',
    ownerId: 'ece',
    status: state.winners ? 'finished' : 'playing',
    seats,
    turn,
    view: {
      ...tavlaMatchModule.view(state, seat),
      legalActions: seat === null ? [] : tavlaMatchModule.legalActions!(state, seat),
      watching: seat === null,
      ownRecovery: null,
      // A live clock on the table in play, like the server sends.
      turnDeadline: state.winners ? 0 : Date.now() + 25_000,
    },
    history: [],
  } as unknown as GamePublicState;
}
