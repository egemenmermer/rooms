import { describe, expect, it } from 'vitest';
import {
  OKEY_CLASSIC_DEFAULT_OPTIONS,
  okeyClassicArrangement,
  okeyClassicModule,
  resolveOkeyClassicOptions,
  type ClassicTile,
  type OkeyClassicCommand,
  type OkeyClassicState,
} from '../packages/games/src/okey-classic';
import type { TileColor } from '../packages/games/src/okey101';

function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let serial = 0;
const tile = (color: TileColor, value: number): ClassicTile => ({
  id: `${color}-${value}-t${serial++}`,
  color,
  value,
});
const r = (v: number) => tile('red', v);
const y = (v: number) => tile('yellow', v);
const b = (v: number) => tile('blue', v);
const k = (v: number) => tile('black', v);
// Crafted tables use gösterge yellow 6, so the okey is yellow 7.
const okey = (): ClassicTile => ({ ...tile('yellow', 7), joker: true });
const sahte = (): ClassicTile => ({
  id: `false-joker-${serial++}`,
  color: 'yellow',
  value: 7,
  fake: true,
});

const { start, action, view, turn, settle, botCommand, parseCommand } = okeyClassicModule;

function crafted(
  hands: ClassicTile[][],
  overrides: Partial<OkeyClassicState> = {},
  options: Parameters<typeof start>[1] = undefined,
): OkeyClassicState {
  const base = start(4, options, 0, seeded(1));
  return {
    ...base,
    indicator: { id: 'yellow-6-ind', color: 'yellow', value: 6 },
    okey: { color: 'yellow', value: 7 },
    stock: Array.from({ length: 20 }, (_, n) => k(((n % 13) + 1) as number)),
    hands,
    ...overrides,
  };
}

const ok = (result: OkeyClassicState | { error: string }): OkeyClassicState => {
  if ('error' in result) throw new Error(`unexpected ${result.error}`);
  return result;
};
const err = (result: OkeyClassicState | { error: string }) =>
  'error' in result ? result.error : null;
const valid = (tiles: ClassicTile[]) => okeyClassicArrangement(tiles);

/** Pads a set list with natural filler sets so the arrangement has exactly 14 tiles. */
const filler = (count: number): ClassicTile[] => {
  const sets = [
    () => [b(1), b(2), b(3)],
    () => [k(9), k(10), k(11)],
    () => [r(4), b(4), k(4)],
    () => [b(9), b(10), b(11), b(12)],
    () => [k(1), k(2), k(3), k(4), k(5)],
  ];
  const sizes = [3, 3, 3, 4, 5];
  for (let pick = 1; pick < 1 << sets.length; pick++) {
    const chosen = sets.filter((_, n) => pick & (1 << n));
    if (sizes.filter((_, n) => pick & (1 << n)).reduce((a, c) => a + c, 0) === count)
      return chosen.flatMap((make) => make());
  }
  throw new Error(`filler cannot make ${count}`);
};

describe('classic Okey deal', () => {
  it('deals 106 unique tiles: 15 to the first player, 14 to the others, 48 in the middle', () => {
    for (const first of [0, 1, 2, 3]) {
      const state = start(4, undefined, first, seeded(first + 7));
      expect(state.hands.map((h) => h.length)).toEqual(
        [0, 1, 2, 3].map((s) => (s === first ? 15 : 14)),
      );
      expect(state.stock).toHaveLength(48);
      const all = [state.indicator, ...state.stock, ...state.hands.flat()];
      expect(all).toHaveLength(106);
      expect(new Set(all.map((t) => t.id)).size).toBe(106);
      expect(all.filter((t) => t.joker)).toHaveLength(2);
      expect(all.filter((t) => t.fake)).toHaveLength(2);
      expect(state.indicator.joker || state.indicator.fake).toBeFalsy();
      expect([...state.stock, ...state.hands.flat()].some((t) => t.id === state.indicator.id)).toBe(
        false,
      );
      expect(state.okey).toEqual({
        color: state.indicator.color,
        value: (state.indicator.value % 13) + 1,
      });
      for (const t of all.filter((x) => x.joker || x.fake)) expect(t).toMatchObject(state.okey);
      expect(turn(state)).toBe(first);
      expect(state.stage).toBe('discard');
    }
  });

  it('wraps the okey from 13 to 1 and is deterministic for a seed', () => {
    let seed = 1;
    let state = start(4, undefined, 0, seeded(seed));
    while (state.indicator.value !== 13) state = start(4, undefined, 0, seeded(++seed));
    expect(state.okey.value).toBe(1);
    expect(start(4, undefined, 0, seeded(seed))).toEqual(state);
    expect(() => start(3, undefined, 0, seeded(1))).toThrow();
  });

  it('coerces bad options to the documented defaults', () => {
    expect(resolveOkeyClassicOptions(undefined)).toEqual(OKEY_CLASSIC_DEFAULT_OPTIONS);
    expect(
      resolveOkeyClassicOptions({
        scoring: 'x',
        finishPoints: -1,
        stackMultipliers: 'yes',
        indicatorPoints: 0,
      }),
    ).toEqual({ ...OKEY_CLASSIC_DEFAULT_OPTIONS, indicatorPoints: 0 });
  });
});

describe('classic Okey draw and discard', () => {
  it('enforces turn order, draw-then-discard and the left discard pile', () => {
    let state = start(4, undefined, 0, seeded(3));
    expect(err(action(state, 0, { type: 'draw', from: 'stock' }, seeded(0)))).toBe(
      'DISCARD_REQUIRED',
    );
    expect(err(action(state, 1, { type: 'draw', from: 'stock' }, seeded(0)))).toBe('NOT_YOUR_TURN');
    expect(err(action(state, 0, { type: 'discard', tileId: 'nope' }, seeded(0)))).toBe(
      'TILE_NOT_IN_HAND',
    );
    const thrown = state.hands[0][0];
    state = ok(action(state, 0, { type: 'discard', tileId: thrown.id }, seeded(0)));
    expect(state.discards[0].at(-1)).toEqual(thrown);
    expect(state.hands[0]).toHaveLength(14);
    expect(turn(state)).toBe(1);
    expect(
      err(action(state, 1, { type: 'discard', tileId: state.hands[1][0].id }, seeded(0))),
    ).toBe('DRAW_REQUIRED');
    const taken = ok(action(state, 1, { type: 'draw', from: 'discard' }, seeded(0)));
    expect(taken.hands[1].some((t) => t.id === thrown.id)).toBe(true);
    expect(taken.discards[0]).toHaveLength(0);
    expect(taken.stock).toHaveLength(48);
    expect(err(action(taken, 1, { type: 'draw', from: 'stock' }, seeded(0)))).toBe(
      'DISCARD_REQUIRED',
    );
    // Seat 2's left pile (seat 1) is empty before seat 1 discards.
    const next = ok(action(taken, 1, { type: 'discard', tileId: taken.hands[1][0].id }, seeded(0)));
    const drawn = ok(action(next, 2, { type: 'draw', from: 'stock' }, seeded(0)));
    expect(drawn.stock).toHaveLength(47);
    expect(drawn.hands[2]).toHaveLength(15);
    const discarded = ok(
      action(drawn, 2, { type: 'discard', tileId: drawn.hands[2][3].id }, seeded(0)),
    );
    expect(err(action(discarded, 3, { type: 'draw', from: 'discard' }, seeded(0)))).toBe(null);
    // The original state is never mutated.
    expect(state.hands[1]).toHaveLength(14);
  });

  it('rejects taking from an empty left pile', () => {
    const state = crafted(
      [Array.from({ length: 14 }, (_, n) => r((n % 13) + 1)), [], [], []].map((h) => h),
      { turn: 0, stage: 'draw' },
    );
    expect(err(action(state, 0, { type: 'draw', from: 'discard' }, seeded(0)))).toBe(
      'DISCARD_EMPTY',
    );
  });

  it('ends the round without a winner when a discard leaves the middle empty', () => {
    const hand = Array.from({ length: 14 }, (_, n) =>
      n % 2 ? r(n % 13 || 13) : b((n + 3) % 13 || 13),
    );
    let state = crafted([hand, [], [], []], { turn: 0, stage: 'draw', stock: [k(2)] });
    state = ok(action(state, 0, { type: 'draw', from: 'stock' }, seeded(0)));
    state = ok(action(state, 0, { type: 'discard', tileId: hand[0].id }, seeded(0)));
    expect(turn(state)).toBeNull();
    expect(state.outcome).toBe('stock-exhausted');
    expect(settle(state)).toEqual({ points: [0, 0, 0, 0], winners: [] });
    expect(err(action(state, 1, { type: 'draw', from: 'stock' }, seeded(0)))).toBe('ROUND_OVER');
  });
});

describe('classic Okey finish validation', () => {
  it('accepts runs, including 1 after 13', () => {
    expect(valid([r(12), r(13), r(1), ...filler(11)])).not.toBeNull();
    expect(valid([r(11), r(12), r(13), r(1), ...filler(10)])).not.toBeNull();
    expect(
      valid([
        r(1),
        r(2),
        r(3),
        r(4),
        r(5),
        r(6),
        r(7),
        ...[b(1), b(2), b(3)],
        ...[k(9), k(10), k(11), k(12)],
      ]),
    ).not.toBeNull();
  });

  it('rejects wrapping past 1 and broken runs', () => {
    expect(valid([r(13), r(1), r(2), ...filler(11)])).toBeNull();
    expect(valid([r(12), r(13), r(1), r(2), ...filler(10)])).toBeNull();
    expect(valid([r(3), r(4), b(5), ...filler(11)])).toBeNull();
    expect(valid([r(3), r(5), r(6), ...filler(11)])).toBeNull();
  });

  it('accepts groups of 3-4 different colors and rejects repeated colors', () => {
    expect(valid([r(8), b(8), k(8), y(8), ...filler(10)])).not.toBeNull();
    expect(valid([r(8), b(8), k(8), ...filler(11)])).not.toBeNull();
    expect(valid([r(8), r(8), k(8), ...filler(11)])).toBeNull();
    expect(valid([r(8), b(8), k(8), y(8), r(8), ...filler(9)])).toBeNull();
  });

  it('uses the okey as any tile', () => {
    expect(valid([r(12), r(13), okey(), ...filler(11)])).not.toBeNull(); // okey = red 1 after 13
    expect(valid([r(5), okey(), r(7), ...filler(11)])).not.toBeNull();
    expect(valid([r(8), b(8), okey(), ...filler(11)])).not.toBeNull();
    expect(valid([r(8), okey(), okey(), ...filler(11)])).not.toBeNull();
    expect(valid([r(8), b(9), okey(), ...filler(11)])).toBeNull();
    expect(valid([r(13), r(1), okey(), ...filler(11)])).not.toBeNull(); // okey = red 12
  });

  it('treats the sahte okey as the okey face (yellow 7), not as a wild tile', () => {
    expect(valid([y(5), y(6), sahte(), ...filler(11)])).not.toBeNull();
    expect(valid([r(7), b(7), sahte(), ...filler(11)])).not.toBeNull();
    expect(valid([r(5), r(6), sahte(), ...filler(11)])).toBeNull();
    expect(valid([r(9), b(9), sahte(), ...filler(11)])).toBeNull();
  });

  it('accepts seven pairs, with the okey pairing any tile', () => {
    const pairs = [r(1), r(1), b(5), b(5), k(9), k(9), y(13), y(13), r(4), r(4), b(11), b(11)];
    expect(valid([...pairs, k(3), k(3)])).toMatchObject({ pairs: true });
    expect(valid([...pairs, k(3), okey()])).toMatchObject({ pairs: true });
    expect(valid([...pairs, sahte(), sahte()])).toMatchObject({ pairs: true });
    expect(valid([...pairs, k(3), k(4)])).toBeNull();
    expect(valid([...pairs, k(3), b(3)])).toBeNull();
  });

  it('requires exactly 14 distinct tiles', () => {
    expect(valid(filler(14).slice(0, 13))).toBeNull();
    const set = filler(14);
    expect(valid([...set.slice(0, 13), set[0]])).toBeNull();
  });
});

describe('classic Okey finishing and scoring', () => {
  const winningRack = () => [r(12), r(13), r(1), ...filler(11)];

  it('finishes by discarding the 15th tile and writes -2 to the others', () => {
    const extra = k(2);
    const state = crafted([[...winningRack(), extra], [], [], []]);
    expect(err(action(state, 0, { type: 'finish', tileId: winningRack()[0].id }, seeded(0)))).toBe(
      'TILE_NOT_IN_HAND',
    );
    const bad = crafted([[r(12), r(13), r(2), ...filler(11), extra], [], [], []]);
    expect(err(action(bad, 0, { type: 'finish', tileId: extra.id }, seeded(0)))).toBe(
      'HAND_NOT_FINISHED',
    );
    const done = ok(action(state, 0, { type: 'finish', tileId: extra.id }, seeded(0)));
    expect(turn(done)).toBeNull();
    expect(done.finish).toMatchObject({
      seat: 0,
      pairs: false,
      okeyDiscard: false,
      discard: extra,
    });
    expect(done.finish!.melds.flat()).toHaveLength(14);
    expect(settle(done)).toEqual({ points: [0, -2, -2, -2], winners: [0] });
  });

  it('doubles for an okey discard and for a çift finish; stacking is an option', () => {
    const throwOkey = okey();
    const okeyDone = ok(
      action(
        crafted([[...winningRack(), throwOkey], [], [], []]),
        0,
        { type: 'finish', tileId: throwOkey.id },
        seeded(0),
      ),
    );
    expect(settle(okeyDone)).toEqual({ points: [0, -4, -4, -4], winners: [0] });

    const pairsRack = [
      r(1),
      r(1),
      b(5),
      b(5),
      k(9),
      k(9),
      y(13),
      y(13),
      r(4),
      r(4),
      b(11),
      b(11),
      k(3),
    ];
    const pairOkey = okey();
    const lone = r(10);
    const pairDone = ok(
      action(
        crafted([[...pairsRack, pairOkey, lone], [], [], []]),
        0,
        { type: 'finish', tileId: lone.id },
        seeded(0),
      ),
    );
    expect(pairDone.finish).toMatchObject({ pairs: true, okeyDiscard: false });
    expect(settle(pairDone)!.points).toEqual([0, -4, -4, -4]);

    const both = [...pairsRack, k(3)];
    const bothOkey = okey();
    const unstacked = ok(
      action(
        crafted([[...both, bothOkey], [], [], []]),
        0,
        { type: 'finish', tileId: bothOkey.id },
        seeded(0),
      ),
    );
    expect(settle(unstacked)!.points).toEqual([0, -4, -4, -4]);
    const stacked = ok(
      action(
        crafted([[...both, bothOkey], [], [], []], {}, { stackMultipliers: true }),
        0,
        { type: 'finish', tileId: bothOkey.id },
        seeded(0),
      ),
    );
    expect(settle(stacked)!.points).toEqual([0, -8, -8, -8]);
  });

  it('scores the winner instead in running-table mode', () => {
    const extra = k(2);
    const done = ok(
      action(
        crafted([[...winningRack(), extra], [], [], []], {}, { scoring: 'winner' }),
        0,
        { type: 'finish', tileId: extra.id },
        seeded(0),
      ),
    );
    expect(settle(done)).toEqual({ points: [2, 0, 0, 0], winners: [0] });
  });

  it('lets the holder show the gösterge only during their own first turn', () => {
    const copy: ClassicTile = { id: 'yellow-6-copy', color: 'yellow', value: 6 };
    const rest = Array.from({ length: 14 }, (_, n) => b((n % 13) + 1));
    const others = [0, 1, 2].map(() => Array.from({ length: 14 }, (_, n) => k((n % 13) + 1)));
    let state = crafted([[copy, ...rest], ...others]);
    expect(err(action(state, 1, { type: 'show-indicator' }, seeded(0)))).toBe('NOT_YOUR_TURN');
    expect(view(state, 0).canShowIndicator).toBe(true);
    state = ok(action(state, 0, { type: 'show-indicator' }, seeded(0)));
    expect(state.indicatorShown).toEqual({ seat: 0, tile: copy });
    expect(err(action(state, 0, { type: 'show-indicator' }, seeded(0)))).toBe(
      'CANNOT_SHOW_INDICATOR',
    );
    // The bonus stands even when the middle runs out.
    state = ok(
      action({ ...state, stock: [] }, 0, { type: 'discard', tileId: rest[0].id }, seeded(0)),
    );
    expect(settle(state)).toEqual({ points: [0, -1, -1, -1], winners: [] });

    // Too late after the first discard, and a sahte okey or an okey is not the gösterge.
    let late = crafted([[...rest, k(1)], [copy, ...others[0].slice(1)], others[1], others[2]]);
    late = ok(action(late, 0, { type: 'discard', tileId: rest[0].id }, seeded(0)));
    late = ok(action(late, 1, { type: 'draw', from: 'stock' }, seeded(0)));
    expect(view(late, 1).canShowIndicator).toBe(true);
    // Simulate a later turn of seat 1, after its first discard.
    late = { ...late, hasDiscarded: [true, true, false, false] };
    expect(err(action(late, 1, { type: 'show-indicator' }, seeded(0)))).toBe(
      'CANNOT_SHOW_INDICATOR',
    );
    const fakeOnly = crafted([[sahte(), okey(), ...rest.slice(0, 13)], ...others]);
    expect(err(action(fakeOnly, 0, { type: 'show-indicator' }, seeded(0)))).toBe(
      'CANNOT_SHOW_INDICATOR',
    );
  });
});

describe('classic Okey bot', () => {
  function playOut(seed: number): { state: OkeyClassicState; steps: number } {
    const rng = seeded(seed);
    let state = start(4, undefined, seed % 4, rng);
    let steps = 0;
    while (turn(state) !== null && steps < 800) {
      const seat = turn(state)!;
      const command = botCommand(state, seat, rng);
      const next = action(state, seat, command, rng);
      if ('error' in next)
        throw new Error(`bot made illegal ${JSON.stringify(command)}: ${next.error}`);
      if (command.type === 'discard' || command.type === 'finish') {
        const thrown = state.hands[seat].find((t) => t.id === command.tileId)!;
        expect(thrown.joker && command.type === 'discard').toBeFalsy();
      }
      state = next;
      steps++;
      const total =
        state.stock.length +
        state.hands.flat().length +
        state.discards.flat().length +
        (state.finish ? 1 : 0);
      expect(total).toBe(105);
    }
    return { state, steps };
  }

  it('plays seeded four-bot rounds to the end with legal commands', () => {
    let winners = 0;
    for (const seed of [11, 12, 13, 14, 15, 16]) {
      const { state, steps } = playOut(seed);
      expect(steps).toBeLessThan(800);
      expect(turn(state)).toBeNull();
      const result = settle(state)!;
      expect(result.points).toHaveLength(4);
      if (state.finish) {
        winners++;
        expect(result.winners).toEqual([state.finish.seat]);
        expect(okeyClassicArrangement(state.finish.melds.flat())).not.toBeNull();
      } else expect(state.stock).toHaveLength(0);
    }
    expect(winners).toBeGreaterThan(0);
  });

  it('keeps the okey, takes a completing left discard and finishes when it can', () => {
    const keep = okey();
    const hand = [
      keep,
      r(3),
      r(4),
      b(9),
      k(9),
      r(11),
      b(1),
      k(5),
      y(2),
      y(10),
      b(13),
      k(12),
      r(8),
      y(4),
    ];
    const left = r(5);
    const state = crafted([hand, [], [], []], {
      turn: 0,
      stage: 'draw',
      discards: [[], [], [], [left]],
    });
    expect(botCommand(state, 0, seeded(0))).toEqual({ type: 'draw', from: 'discard' });
    const useless = crafted([hand, [], [], []], {
      turn: 0,
      stage: 'draw',
      discards: [[], [], [], [y(12)]],
    });
    expect(botCommand(useless, 0, seeded(0))).toEqual({ type: 'draw', from: 'stock' });
    const after = ok(action(state, 0, { type: 'draw', from: 'discard' }, seeded(0)));
    const discard = botCommand(after, 0, seeded(0)) as Extract<
      OkeyClassicCommand,
      { type: 'discard' }
    >;
    expect(discard.type).toBe('discard');
    expect(discard.tileId).not.toBe(keep.id);
    expect(discard.tileId).not.toBe(left.id);

    const extra = y(9);
    const finishing = crafted([[r(12), r(13), r(1), ...filler(11), extra], [], [], []]);
    expect(botCommand(finishing, 0, seeded(0))).toEqual({ type: 'finish', tileId: extra.id });
    // With an okey in a finished rack, the bot throws the okey for the double.
    const spare = okey();
    const doubled = crafted([[r(12), r(13), r(1), ...filler(11), spare], [], [], []]);
    expect(botCommand(doubled, 0, seeded(0))).toEqual({ type: 'finish', tileId: spare.id });
  });
});

describe('classic Okey hidden information', () => {
  const tileIds = (value: unknown, out = new Set<string>()): Set<string> => {
    if (Array.isArray(value)) value.forEach((v) => tileIds(v, out));
    else if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      if (typeof record.id === 'string' && typeof record.color === 'string') out.add(record.id);
      Object.values(record).forEach((v) => tileIds(v, out));
    }
    return out;
  };

  it('never shows other racks or the middle order, during or after the round', () => {
    const rng = seeded(21);
    let state = start(4, undefined, 0, rng);
    // Tiles that went through a discard pile or were shown as the gösterge are public from then on.
    const opened = new Set<string>();
    const check = () => {
      for (const viewer of [0, 1, 2, 3, null] as const) {
        const seen = tileIds(view(state, viewer));
        const secret = new Set(
          [
            ...state.stock.map((t) => t.id),
            ...state.hands.flatMap((h, seat) =>
              seat === viewer || seat === state.finish?.seat ? [] : h.map((t) => t.id),
            ),
          ].filter((id) => !opened.has(id)),
        );
        for (const id of seen) expect(secret.has(id), `${viewer} sees ${id}`).toBe(false);
        const v = view(state, viewer);
        expect(v.stockCount).toBe(state.stock.length);
        expect(Object.keys(v)).not.toContain('stock');
        if (viewer === null) expect(v.hand).toBeNull();
        else expect(v.hand!.map((t) => t.id)).toEqual(state.hands[viewer].map((t) => t.id));
        expect(v.seats.map((s) => s.tileCount)).toEqual(state.hands.map((h) => h.length));
      }
    };
    let steps = 0;
    while (turn(state) !== null && steps < 800) {
      check();
      const seat = turn(state)!;
      const legal = okeyClassicModule.legalActions(state, seat);
      expect(legal).toContain(state.stage === 'draw' ? 'draw' : 'discard');
      expect(okeyClassicModule.legalActions(state, (seat + 1) % 4)).toEqual([]);
      const command = botCommand(state, seat, rng);
      expect(legal).toContain(command.type);
      state = ok(action(state, seat, command, rng));
      if (state.lastAction?.type === 'draw' && state.lastAction.from === 'stock')
        expect('tile' in state.lastAction).toBe(false);
      else if (state.lastAction && 'tile' in state.lastAction) opened.add(state.lastAction.tile.id);
      steps++;
    }
    check();
    const hidden = new Set(
      [
        ...state.stock.map((t) => t.id),
        ...state.hands.flatMap((h, seat) =>
          seat === state.finish?.seat ? [] : h.map((t) => t.id),
        ),
      ].filter((id) => !opened.has(id)),
    );
    const summary = okeyClassicModule.summary(state);
    for (const id of tileIds(summary)) expect(hidden.has(id), `summary shows ${id}`).toBe(false);
    expect(summary).toMatchObject(settle(state)!);
  });
});

describe('classic Okey command parsing', () => {
  it('validates action names and payloads', () => {
    expect(okeyClassicModule.actions).toEqual(['draw', 'discard', 'finish', 'show-indicator']);
    expect(parseCommand({ action: 'draw' })).toEqual({ type: 'draw', from: 'stock' });
    expect(parseCommand({ action: 'draw', payload: { from: 'discard' } })).toEqual({
      type: 'draw',
      from: 'discard',
    });
    expect(parseCommand({ action: 'draw', payload: { from: 'deck' } })).toEqual({
      error: 'INVALID_DRAW_SOURCE',
    });
    expect(parseCommand({ action: 'discard', payload: { tileId: 'red-1-0' } })).toEqual({
      type: 'discard',
      tileId: 'red-1-0',
    });
    expect(parseCommand({ action: 'finish', payload: { tileId: 5 } })).toEqual({
      error: 'TILE_ID_REQUIRED',
    });
    expect(parseCommand({ action: 'finish', payload: { tileId: 'x'.repeat(65) } })).toEqual({
      error: 'TILE_ID_REQUIRED',
    });
    expect(parseCommand({ action: 'show-indicator' })).toEqual({ type: 'show-indicator' });
    expect(parseCommand({ action: 'open' })).toEqual({ error: 'INVALID_OKEY_ACTION' });
    expect(okeyClassicModule.parseOptions({ scoring: 'winner', finishPoints: 'x' })).toEqual({
      ...OKEY_CLASSIC_DEFAULT_OPTIONS,
      scoring: 'winner',
    });
    expect(okeyClassicModule.kind).toBe('rooms-okey-v1');
    expect(okeyClassicModule.seats).toEqual([4]);
  });
});
