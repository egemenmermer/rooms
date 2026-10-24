import { describe, expect, it } from 'vitest';
import {
  TAVLA_KIND,
  parseTavlaCommand,
  startTavla,
  tavlaAction,
  tavlaBotCommand,
  tavlaLegalMoves,
  tavlaMatchStatus,
  tavlaModule,
  tavlaPips,
  tavlaSettle,
  tavlaView,
  type TavlaCommand,
  type TavlaOptions,
  type TavlaState,
} from '../packages/games/src/tavla';

/** rng that yields the given dice in order. */
const dice =
  (...values: number[]) =>
  () => {
    const next = values.shift();
    if (next === undefined) throw new Error('rng exhausted');
    return (next - 0.5) / 6;
  };

function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function ok(result: TavlaState | { error: string }): TavlaState {
  if ('error' in result) throw new Error(result.error);
  return result;
}

function act(state: TavlaState, seat: number, command: TavlaCommand, rng = dice()) {
  return ok(tavlaAction(state, seat, command, rng));
}

const move = (from: number | 'bar', to: number | 'off'): TavlaCommand => ({
  action: 'move',
  from,
  to,
});

/**
 * A custom position where `seat` is about to roll. `points` maps index -> signed count (+ seat 0,
 * - seat 1); checkers not on the board or bar are borne off.
 */
function position(
  points: Record<number, number>,
  seat: number,
  bar: [number, number] = [0, 0],
  options: TavlaOptions = {},
): TavlaState {
  const state = startTavla(2, options, 0);
  state.points = Array.from({ length: 24 }, (_, i) => points[i] ?? 0);
  state.bar = [...bar];
  const onBoard = (s: number) =>
    state.points.reduce((sum, n) => sum + (s === 0 ? Math.max(0, n) : Math.max(0, -n)), 0) + bar[s];
  state.off = [15 - onBoard(0), 15 - onBoard(1)];
  state.phase = 'roll';
  state.turn = seat;
  return state;
}

function rolled(state: TavlaState, a: number, b: number) {
  return act(state, state.turn!, { action: 'roll' }, dice(a, b));
}

const steps = (state: TavlaState) =>
  tavlaLegalMoves(state).map((s) => `${s.from}>${s.to}:${s.die}`);

function checkersConserved(state: TavlaState) {
  for (const seat of [0, 1]) {
    const board = state.points.reduce(
      (sum, n) => sum + (seat === 0 ? Math.max(0, n) : Math.max(0, -n)),
      0,
    );
    expect(board + state.bar[seat] + state.off[seat]).toBe(15);
  }
}

describe('tavla start and opening roll', () => {
  it('sets up the standard position mirrored for both seats', () => {
    const state = startTavla(2, {}, 0);
    expect(state.points[23]).toBe(2);
    expect(state.points[12]).toBe(5);
    expect(state.points[7]).toBe(3);
    expect(state.points[5]).toBe(5);
    expect(state.points[0]).toBe(-2);
    expect(state.points[11]).toBe(-5);
    expect(state.points[16]).toBe(-3);
    expect(state.points[18]).toBe(-5);
    expect(tavlaPips(state, 0)).toBe(167);
    expect(tavlaPips(state, 1)).toBe(167);
    checkersConserved(state);
    expect(state.phase).toBe('opening');
    expect(tavlaModule.turn(state)).toBe(0);
    expect(tavlaModule.seats).toEqual([2]);
    expect(tavlaModule.kind).toBe(TAVLA_KIND);
    expect(() => startTavla(4, {}, 0)).toThrow('INVALID_SEAT_COUNT');
    expect(startTavla(2, {}, 1).turn).toBe(1);
  });

  it('lets the higher opening die start and play both opening dice', () => {
    let state = startTavla(2, {}, 0);
    state = act(state, 0, { action: 'roll' }, dice(3));
    expect(state.turn).toBe(1);
    expect(tavlaAction(state, 0, { action: 'roll' }, dice(1))).toEqual({ error: 'NOT_YOUR_TURN' });
    state = act(state, 1, { action: 'roll' }, dice(5));
    expect(state.phase).toBe('moving');
    expect(state.turn).toBe(1);
    expect(state.dice).toEqual([5, 3]);
    expect(state.remaining).toEqual([5, 3]);
    expect(tavlaView(state, 0).opening).toEqual([3, 5]);
  });

  it('re-rolls a tied opening roll', () => {
    let state = startTavla(2, {}, 1);
    state = act(state, 1, { action: 'roll' }, dice(4));
    state = act(state, 0, { action: 'roll' }, dice(4));
    expect(state.phase).toBe('opening');
    expect(state.openingTie).toBe(4);
    expect(state.opening).toEqual([null, null]);
    expect(state.turn).toBe(1);
    state = act(state, 1, { action: 'roll' }, dice(2));
    state = act(state, 0, { action: 'roll' }, dice(6));
    expect(state.turn).toBe(0);
    expect(state.dice).toEqual([6, 2]);
  });

  it('optionally lets the starter re-roll both dice', () => {
    let state = startTavla(2, { starterRerolls: true }, 0);
    state = act(state, 0, { action: 'roll' }, dice(6));
    state = act(state, 1, { action: 'roll' }, dice(2));
    expect(state.phase).toBe('roll');
    expect(state.turn).toBe(0);
    expect(state.dice).toBeNull();
    state = act(state, 0, { action: 'roll' }, dice(1, 1));
    expect(state.phase).toBe('moving');
    expect(state.dice).toEqual([1, 1]);
  });
});

describe('tavla movement rules', () => {
  it('plays doubles as four moves', () => {
    let state = rolled(position({ 23: 2, 12: 5, 7: 3, 5: 5, 0: -2, 18: -13 }, 0), 3, 3);
    expect(state.remaining).toEqual([3, 3, 3, 3]);
    expect(state.maxMoves).toBe(4);
    state = act(state, 0, move(12, 9));
    state = act(state, 0, move(12, 9));
    state = act(state, 0, move(7, 4));
    expect(tavlaAction(state, 0, { action: 'confirm' }, dice())).toEqual({
      error: 'MOVES_REMAINING',
    });
    state = act(state, 0, move(7, 4));
    expect(state.remaining).toEqual([]);
    expect(tavlaView(state, 0).canConfirm).toBe(true);
    state = act(state, 0, { action: 'confirm' });
    expect(state.turn).toBe(1);
    expect(state.phase).toBe('roll');
    expect(state.lastTurn?.moves).toHaveLength(4);
    checkersConserved(state);
  });

  it('requires both dice when possible', () => {
    // Seat 0: one checker on 20, one on 7, 13 on 0. Points 15 and 9 are blocked.
    const state = rolled(position({ 20: 1, 7: 1, 0: 13, 15: -2, 9: -2, 23: -11 }, 0), 6, 5);
    expect(state.maxMoves).toBe(2);
    // 7>1 with the six leaves no five to play, so it is excluded.
    expect(steps(state).sort()).toEqual(['20>14:6', '7>2:5']);
    expect(tavlaAction(state, 0, move(7, 1), dice())).toEqual({ error: 'ILLEGAL_MOVE' });
  });

  it('forces the larger die when only one die can be used', () => {
    const base = { 20: 1, 0: 14, 9: -2, 23: -13 };
    let state = rolled(position(base, 0), 5, 6);
    expect(state.maxMoves).toBe(1);
    expect(steps(state)).toEqual(['20>14:6']);
    expect(tavlaAction(state, 0, move(20, 15), dice())).toEqual({ error: 'ILLEGAL_MOVE' });
    state = act(state, 0, move(20, 14));
    expect(tavlaView(state, 0).canConfirm).toBe(true);

    // The larger die is blocked: the smaller one must be played instead.
    const blocked = rolled(position({ ...base, 14: -2, 23: -11 }, 0), 5, 6);
    expect(steps(blocked)).toEqual(['20>15:5']);
  });

  it('must enter from the bar first, at the mirrored entry points', () => {
    let state = rolled(position({ 12: 14, 18: -2, 0: -13 }, 0, [1, 0]), 4, 1);
    // Seat 0 enters on 24 - die; 18 (die 6) is blocked anyway, 20 and 23 are open.
    expect(steps(state).sort()).toEqual(['bar>20:4', 'bar>23:1']);
    expect(tavlaAction(state, 0, move(12, 8), dice())).toEqual({ error: 'ILLEGAL_MOVE' });
    state = act(state, 0, move('bar', 20));
    expect(steps(state)).toContain('12>11:1');

    let mirrored = rolled(position({ 12: 15, 20: -13 }, 1, [0, 2]), 3, 5);
    expect(steps(mirrored).sort()).toEqual(['bar>2:3', 'bar>4:5']);
    mirrored = act(mirrored, 1, move('bar', 2));
    expect(steps(mirrored)).toEqual(['bar>4:5']);
  });

  it('passes the turn when the bar entry is blocked', () => {
    const closed = { 0: 2, 1: 2, 2: 2, 3: 2, 4: 2, 5: 2, 18: 3, 10: -14 };
    const state = rolled(position(closed, 1, [0, 1]), 6, 2);
    expect(state.phase).toBe('roll');
    expect(state.turn).toBe(0);
    expect(state.lastTurn).toEqual({ seat: 1, dice: [6, 2], moves: [], passed: true });
    expect(state.bar).toEqual([0, 1]);
  });

  it('hits a single checker onto the bar (kırma) and undo restores it', () => {
    let state = rolled(position({ 12: 15, 9: -1, 18: -14 }, 0), 3, 1);
    state = act(state, 0, move(12, 9));
    expect(state.moves[0]).toMatchObject({ from: 12, to: 9, hit: true });
    expect(state.bar).toEqual([0, 1]);
    expect(state.points[9]).toBe(1);
    const undone = act(state, 0, { action: 'undo' });
    expect(undone.bar).toEqual([0, 0]);
    expect(undone.points[9]).toBe(-1);
    expect(undone.points[12]).toBe(15);
    expect(undone.remaining).toEqual([3, 1]);
    state = act(state, 0, move(12, 11));
    state = act(state, 0, { action: 'confirm' });
    // The hit checker must enter before seat 1 moves anything else.
    state = rolled(state, 2, 4);
    expect(steps(state).every((s) => s.startsWith('bar>'))).toBe(true);
  });

  it('cannot move onto a point held by two or more opposing checkers', () => {
    const state = rolled(position({ 12: 15, 9: -2, 18: -13 }, 0), 3, 3);
    expect(steps(state)).toEqual([]);
    expect(state.phase).toBe('roll');
    expect(state.lastTurn?.passed).toBe(true);
  });
});

describe('tavla bearing off', () => {
  it('bears off with the exact die or a higher die from the highest point', () => {
    const state = rolled(position({ 3: 2, 1: 1, 20: -15 }, 0), 6, 4);
    // The checker on 1 may not use a higher die while 3 is occupied.
    expect(steps(state).sort()).toEqual(['3>off:4', '3>off:6']);
    const exact = act(state, 0, move(3, 'off'));
    expect(exact.moves[0].die).toBe(4);
    expect(exact.off[0]).toBe(13);
  });

  it('refuses a higher die while a checker sits on a higher point', () => {
    const state = rolled(position({ 5: 1, 2: 1, 20: -15 }, 0), 4, 4);
    expect(steps(state)).toEqual(['5>1:4']);
    const after = act(state, 0, move(5, 1));
    expect(steps(after)).toEqual(['2>off:4']);
  });

  it('allows bearing off only once every checker is home, also mid-turn', () => {
    let state = rolled(position({ 7: 1, 2: 1, 0: 2, 20: -15 }, 0), 2, 3);
    expect(steps(state)).not.toContain('2>off:3');
    state = act(state, 0, move(7, 5));
    expect(steps(state)).toContain('2>off:3');
    state = act(state, 0, move(2, 'off'));
    expect(state.off[0]).toBe(12);
  });

  it('scores mars for 2 points when the loser bore off nothing', () => {
    let state = rolled(position({ 0: 1, 1: 1, 20: -10, 12: -4 }, 0, [0, 1]), 2, 1);
    state = act(state, 0, move(1, 'off'));
    state = act(state, 0, move(0, 'off'));
    expect(tavlaModule.turn(state)).toBe(0);
    expect(tavlaSettle(state)).toBeNull();
    state = act(state, 0, { action: 'confirm' });
    expect(state.phase).toBe('over');
    expect(tavlaModule.turn(state)).toBeNull();
    expect(state.result).toEqual({ winner: 0, points: 2, mars: true });
    expect(tavlaSettle(state)).toEqual({ points: [2, 0], winners: [0] });
    expect(tavlaAction(state, 0, { action: 'roll' }, dice(1, 1))).toEqual({ error: 'ROUND_OVER' });
  });

  it('scores a plain win for 1 point', () => {
    let state = rolled(position({ 22: -1, 1: 5 }, 1), 6, 5);
    state = act(state, 1, move(22, 'off'));
    state = act(state, 1, { action: 'confirm' });
    expect(tavlaSettle(state)).toEqual({ points: [0, 1], winners: [1] });
    expect(state.result?.mars).toBe(false);
  });
});

describe('tavla turn commands', () => {
  it('enforces roll, undo and confirm legality', () => {
    let state = position({ 23: 2, 12: 5, 7: 3, 5: 5, 0: -2, 18: -13 }, 0);
    expect(tavlaAction(state, 0, move(12, 8), dice())).toEqual({ error: 'ROLL_REQUIRED' });
    expect(tavlaAction(state, 0, { action: 'confirm' }, dice())).toEqual({
      error: 'ROLL_REQUIRED',
    });
    expect(tavlaAction(state, 0, { action: 'undo' }, dice())).toEqual({ error: 'ROLL_REQUIRED' });
    expect(tavlaModule.legalActions(state, 0)).toEqual(['roll']);
    expect(tavlaModule.legalActions(state, 1)).toEqual([]);
    const rollPhase = tavlaModule.phase(state);
    state = rolled(state, 4, 2);
    expect(tavlaModule.phase(state)).not.toBe(rollPhase);
    expect(tavlaModule.legalActions(state, 0)).toEqual(['move']);
    expect(tavlaAction(state, 0, { action: 'roll' }, dice(1, 1))).toEqual({
      error: 'ALREADY_ROLLED',
    });
    expect(tavlaAction(state, 0, { action: 'undo' }, dice())).toEqual({ error: 'NOTHING_TO_UNDO' });
    expect(tavlaAction(state, 0, { action: 'confirm' }, dice())).toEqual({
      error: 'MOVES_REMAINING',
    });
    expect(tavlaAction(state, 1, move(0, 4), dice())).toEqual({ error: 'NOT_YOUR_TURN' });
    state = act(state, 0, move(12, 8));
    state = act(state, 0, move(8, 6));
    expect(tavlaView(state, 1).moves.map((m) => m.to)).toEqual([8, 6]);
    state = act(state, 0, { action: 'undo' });
    expect(state.remaining).toEqual([2]);
    expect(state.points[8]).toBe(1);
    expect(tavlaModule.legalActions(state, 0)).toEqual(['move', 'undo']);
    state = act(state, 0, move(7, 5));
    expect(tavlaModule.legalActions(state, 0)).toEqual(['undo', 'confirm']);
    state = act(state, 0, { action: 'confirm' });
    expect(state.turn).toBe(1);
    expect(tavlaAction(state, 0, { action: 'undo' }, dice())).toEqual({ error: 'NOT_YOUR_TURN' });
    expect(state.lastTurn).toMatchObject({ seat: 0, dice: [4, 2], passed: false });
  });

  it('parses commands and rejects malformed payloads', () => {
    expect(parseTavlaCommand({ action: 'roll' })).toEqual({ action: 'roll' });
    expect(parseTavlaCommand({ action: 'move', payload: { from: 'bar', to: 20 } })).toEqual({
      action: 'move',
      from: 'bar',
      to: 20,
    });
    expect(parseTavlaCommand({ action: 'move', payload: { from: 5, to: 'off', die: 6 } })).toEqual({
      action: 'move',
      from: 5,
      to: 'off',
      die: 6,
    });
    for (const payload of [
      undefined,
      { from: 24, to: 3 },
      { from: 'x', to: 3 },
      { from: 2.5, to: 1 },
    ])
      expect(parseTavlaCommand({ action: 'move', payload })).toEqual({ error: 'INVALID_MOVE' });
    expect(parseTavlaCommand({ action: 'move', payload: { from: 3, to: 1, die: 9 } })).toEqual({
      error: 'INVALID_MOVE',
    });
    expect(parseTavlaCommand({ action: 'double' })).toEqual({ error: 'UNKNOWN_ACTION' });
    expect(tavlaModule.actions).toEqual(['roll', 'move', 'undo', 'confirm']);
    expect(tavlaModule.parseOptions({ matchTo: 7, starterRerolls: true })).toEqual({
      matchTo: 7,
      starterRerolls: true,
    });
    expect(tavlaModule.parseOptions({ matchTo: '3' })).toEqual({ matchTo: 3 });
    expect(tavlaModule.parseOptions(undefined)).toEqual({});
    for (const bad of [{ matchTo: 4 }, { starterRerolls: 'yes' }, { cube: true }])
      expect(tavlaModule.parseOptions(bad)).toEqual({ error: 'INVALID_OPTIONS' });
  });
});

function playRound(state: TavlaState, rng: () => number, onStep?: (s: TavlaState) => void) {
  let guard = 0;
  while (tavlaModule.turn(state) !== null) {
    if (++guard > 5000) throw new Error('round did not finish');
    const seat = tavlaModule.turn(state)!;
    const command = tavlaModule.botCommand(state, seat, rng);
    const next = tavlaModule.action(state, seat, command, rng);
    if ('error' in next) throw new Error(`bot command rejected: ${next.error}`);
    state = next;
    onStep?.(state);
  }
  return state;
}

describe('tavla bot and match', () => {
  it('plays a seeded round to the end with only accepted bot commands', () => {
    const rng = seeded(42);
    let turns = 0,
      hits = 0;
    const final = playRound(tavlaModule.start(2, {}, 0, rng), rng, (s) => {
      checkersConserved(s);
      if (s.moves.at(-1)?.hit) hits++;
      if (s.phase === 'roll' || s.phase === 'over') turns++;
    });
    // 167 pips each at most 24 per non-double roll: a real game needs well over a dozen turns.
    expect(turns).toBeGreaterThan(14);
    expect(hits).toBeGreaterThan(0);
    const result = tavlaModule.settle(final)!;
    expect(result.winners).toHaveLength(1);
    expect(final.off[result.winners[0]]).toBe(15);
    expect(result.points[result.winners[0]]).toBe(final.result!.mars ? 2 : 1);
  });

  it('is deterministic for a seed and survives JSON round trips', () => {
    const run = (roundTrip: boolean) => {
      const rng = seeded(7);
      let state = tavlaModule.start(2, {}, 1, rng);
      while (tavlaModule.turn(state) !== null) {
        const seat = tavlaModule.turn(state)!;
        const next = tavlaModule.action(state, seat, tavlaModule.botCommand(state, seat, rng), rng);
        if ('error' in next) throw new Error(next.error);
        state = roundTrip ? (JSON.parse(JSON.stringify(next)) as TavlaState) : next;
      }
      return state;
    };
    expect(run(true)).toEqual(run(false));
  });

  it('plays a match to N points round by round', () => {
    for (const matchTo of [3, 5]) {
      const rng = seeded(matchTo * 101);
      let scores = [0, 0],
        rounds = 0,
        first = 0,
        status = tavlaMatchStatus(scores, [0, 0], matchTo);
      while (!status.over) {
        if (++rounds > 20) throw new Error('match did not finish');
        const start = tavlaModule.start(2, { matchTo, scores }, first, rng);
        expect(tavlaView(start, null).match).toEqual({ matchTo, scores, starterRerolls: false });
        const final = playRound(start, rng);
        status = tavlaMatchStatus(scores, tavlaModule.settle(final)!.points, matchTo);
        scores = status.scores;
        first = 1 - first;
      }
      expect(Math.max(...scores)).toBeGreaterThanOrEqual(matchTo);
      expect(status.winners).toEqual([scores[0] >= matchTo ? 0 : 1]);
      expect(rounds).toBeGreaterThanOrEqual(Math.ceil(matchTo / 2));
    }
    expect(startTavla(2, { matchTo: 4 }).options.matchTo).toBe(5);
  });

  it('bot prefers hitting a blot', () => {
    const state = rolled(position({ 12: 15, 9: -1, 18: -14 }, 0), 3, 1);
    const command = tavlaBotCommand(state, 0);
    const after = act(state, 0, command);
    const finished = act(after, 0, tavlaBotCommand(after, 0));
    expect(finished.bar[1]).toBe(1);
  });
});

describe('tavla hidden information', () => {
  it('shows every seat and spectators the same board and never stores rng state', () => {
    const rng = seeded(3);
    let state = tavlaModule.start(2, {}, 0, rng);
    for (let i = 0; i < 40 && tavlaModule.turn(state) !== null; i++) {
      const seat = tavlaModule.turn(state)!;
      const before = JSON.stringify(state);
      const next = tavlaModule.action(state, seat, tavlaModule.botCommand(state, seat, rng), rng);
      expect(JSON.stringify(state)).toBe(before);
      if ('error' in next) throw new Error(next.error);
      state = next;
      const views = [tavlaView(state, 0), tavlaView(state, 1), tavlaView(state, null)];
      expect(views.map((v) => v.you)).toEqual([0, 1, null]);
      const strip = ({ you: _you, ...rest }: ReturnType<typeof tavlaView>) => rest;
      expect(strip(views[1])).toEqual(strip(views[0]));
      expect(strip(views[2])).toEqual(strip(views[0]));
      expect(JSON.stringify(state)).not.toMatch(/seed|rng|random/i);
      expect(Object.keys(views[0])).not.toContain('turnStart');
    }
  });
});
