import { describe, expect, it } from 'vitest';
import {
  extend101Meld,
  okey101Action,
  okey101GostergeTile,
  okey101IsIslek,
  okey101View,
  startOkey101,
  type OkeyRound,
} from '../packages/games/src/okey101-table';
import {
  okeyRuleProfile,
  validate101Meld,
  validate101MeldWith,
  validate101Opening,
  type Okey101Options,
  type OkeyTile,
} from '../packages/games/src/okey101';

const tile = (id: string, value: number, color: OkeyTile['color'] = 'red', joker = false) =>
  ({ id, value, color, ...(joker ? { joker: true } : {}) }) as OkeyTile;
const okey = (id: string) => tile(id, 10, 'black', true);
/** Ten 1-13 fillers in a colour nobody melds with, so they never form or extend a meld by accident. */
const filler = (prefix: string, count: number) =>
  Array.from({ length: count }, (_, i) =>
    tile(`${prefix}${i}`, (i % 2) * 6 + 1, (['yellow', 'blue'] as const)[i % 2]),
  );
/** A round with known hands: indicator black 9, so the okeys are black 10. */
function round(
  hands: OkeyTile[][],
  options: Partial<Okey101Options> = {},
  setup: Partial<OkeyRound> = {},
  folding = false,
  teams = false,
): OkeyRound {
  const state = startOkey101(folding, teams, 0, options);
  state.indicator = tile('indicator', 9, 'black');
  state.hands = hands.map((h) => [...h]);
  state.stock = Array.from({ length: 20 }, (_, i) => tile(`stock${i}`, (i % 13) + 1, 'yellow'));
  return Object.assign(state, setup);
}
const run = (color: OkeyTile['color'], from: number, to: number, prefix: string = color) =>
  Array.from({ length: to - from + 1 }, (_, i) => tile(`${prefix}${from + i}`, from + i, color));
const ids = (tiles: OkeyTile[]) => tiles.map((t) => t.id);
/** 101+ opening: red 10-13, black 10-13 and yellow 10-13 = 138. */
const opening = () => [
  ...run('red', 10, 13, 'r'),
  ...run('blue', 10, 13, 'b'),
  ...run('yellow', 10, 13, 'y'),
];
const openingMelds = [
  ['r10', 'r11', 'r12', 'r13'],
  ['b10', 'b11', 'b12', 'b13'],
  ['y10', 'y11', 'y12', 'y13'],
];

describe('101 v2 rules: O3 okey readings', () => {
  const opened = (hand: OkeyTile[], melds: string[][], kinds?: ('run' | 'group' | null)[]) =>
    okey101Action(round([hand, [], [], []], {}, { opened: ['runs', null, null, null] }), 0, {
      action: 'open',
      melds,
      meldKinds: kinds,
    }).melds[0].tiles;

  it('reads one natural tile with two okeys as a group when the run is impossible', () => {
    const twelve = opened(
      [tile('r12', 12), okey('j1'), okey('j2'), tile('keep', 3)],
      [['r12', 'j1', 'j2']],
    );
    expect(twelve.map((t) => t.value)).toEqual([12, 12, 12]);
    expect(new Set(twelve.map((t) => t.color)).size).toBe(3);
    const one = opened(
      [okey('j1'), tile('r1', 1), okey('j2'), tile('keep', 3)],
      [['j1', 'r1', 'j2']],
    );
    expect(one.map((t) => t.value)).toEqual([1, 1, 1]);
  });

  it('keeps the run reading by default and follows an explicit group hint', () => {
    const hand = [tile('r7', 7), okey('j1'), okey('j2'), tile('keep', 3)];
    expect(opened(hand, [['r7', 'j1', 'j2']]).map((t) => t.value)).toEqual([7, 8, 9]);
    const group = opened(hand, [['r7', 'j1', 'j2']], ['group']);
    expect(group.map((t) => t.value)).toEqual([7, 7, 7]);
    expect(validate101Meld(group)).toBe(21);
    // A hint that cannot validate never beats the only legal reading.
    const twelve = [tile('r12', 12), okey('j1'), okey('j2'), tile('keep', 3)];
    expect(opened(twelve, [['r12', 'j1', 'j2']], ['run']).map((t) => t.value)).toEqual([
      12, 12, 12,
    ]);
  });

  it('counts the chosen reading toward the 101 opening', () => {
    const hand = [
      ...run('red', 10, 13, 'r'),
      ...run('blue', 10, 13, 'b'),
      tile('y12', 12, 'yellow'),
      okey('j1'),
      okey('j2'),
      tile('keep', 3),
    ];
    const state = okey101Action(round([hand, [], [], []]), 0, {
      action: 'open',
      melds: [
        ['r10', 'r11', 'r12', 'r13'],
        ['b10', 'b11', 'b12', 'b13'],
        ['y12', 'j1', 'j2'],
      ],
    });
    expect(state.highestOpening).toBe(46 + 46 + 36);
  });

  it('keeps a table meld’s kind and okeys when processing onto it', () => {
    const group = [tile('r7', 7), tile('j1', 7, 'yellow', true), tile('j2', 7, 'blue', true)];
    const rules = okeyRuleProfile(false, false);
    expect(extend101Meld(group, [tile('r10', 10)], rules)).toBeNull();
    expect(extend101Meld(group, [tile('k7', 7, 'black')], rules)?.map((t) => t.value)).toEqual([
      7, 7, 7, 7,
    ]);
    const runMeld = [tile('r5', 5), tile('j1', 6, 'red', true), tile('r7', 7)];
    expect(extend101Meld(runMeld, [tile('r8', 8)], rules)?.map((t) => t.value)).toEqual([
      5, 6, 7, 8,
    ]);
    expect(extend101Meld(runMeld, [okey('j2')], rules)?.map((t) => t.value)).toEqual([4, 5, 6, 7]);
  });
});

describe('101 v2 rules: O1 işlek taş', () => {
  const table = [{ owner: 1, pairs: false, tiles: run('red', 5, 7) }];
  const withJoker = [
    {
      owner: 1,
      pairs: false,
      tiles: [tile('b4', 4, 'blue'), tile('j1', 5, 'blue', true), tile('b6', 6, 'blue')],
    },
  ];

  it('charges +101 for a tile that extends a table meld and nothing for a dead tile', () => {
    const state = round(
      [[tile('r8', 8), tile('y2', 2, 'yellow'), tile('x', 12, 'blue')], [], [], []],
      {},
      { melds: table },
    );
    expect(okey101IsIslek(state, tile('r8', 8))).toBe(true);
    const islek = okey101Action(state, 0, { action: 'discard', cardId: 'r8' });
    expect(islek.penalties![0]).toBe(101);
    expect(islek.penaltyLog).toEqual([{ seat: 0, reason: 'islek', amount: 101 }]);
    expect(okey101Action(state, 0, { action: 'discard', cardId: 'y2' }).penalties![0]).toBe(0);
  });

  it('charges the exact natural tile of a table okey and a thrown okey', () => {
    const state = round(
      [[tile('b5', 5, 'blue'), okey('j2'), tile('y2', 2, 'yellow')], [], [], []],
      {},
      { melds: withJoker },
    );
    expect(okey101Action(state, 0, { action: 'discard', cardId: 'b5' }).penalties![0]).toBe(101);
    expect(okey101Action(state, 0, { action: 'discard', cardId: 'j2' }).penalties![0]).toBe(101);
  });

  it('does not charge the finishing tile, pair melds or a table with the switch off', () => {
    const finishing = round(
      [[tile('r8', 8)], [], [], []],
      {},
      {
        melds: table,
        opened: ['runs', 'runs', null, null],
      },
    );
    const done = okey101Action(finishing, 0, { action: 'discard', cardId: 'r8' });
    expect(done.stage).toBe('ended');
    expect(done.scores[0]).toBe(-101);
    const pairs = round(
      [[tile('r5', 5), tile('y2', 2, 'yellow')], [], [], []],
      {},
      {
        melds: [{ owner: 1, pairs: true, tiles: [tile('a', 5), tile('b', 5)] }],
      },
    );
    expect(okey101Action(pairs, 0, { action: 'discard', cardId: 'r5' }).penalties![0]).toBe(0);
    const off = round(
      [[tile('r8', 8), tile('y2', 2, 'yellow')], [], [], []],
      { islekPenalty: false },
      { melds: table },
    );
    expect(okey101Action(off, 0, { action: 'discard', cardId: 'r8' }).penalties![0]).toBe(0);
  });

  it('adds penalties to the final score once, before team totals', () => {
    let state = round(
      [
        [tile('r8', 8), tile('y2', 2, 'yellow')],
        [tile('k1', 1, 'black'), tile('k2', 3, 'black')],
        [],
        [],
      ],
      {},
      { melds: table, opened: [null, 'runs', null, null] },
      false,
      true,
    );
    state = okey101Action(state, 0, { action: 'discard', cardId: 'r8' });
    state = okey101Action(state, 1, { action: 'draw' });
    state.hands[1] = [tile('k1', 1, 'black')];
    state = okey101Action(state, 1, { action: 'discard', cardId: 'k1' });
    // Seat 0 unopened 202 + işlek 101, seat 2 unopened 202; seat 1 wins −101, seat 3 unopened 202.
    expect(state.scores).toEqual([505, 101, 505, 101]);
  });
});

describe('101 v2 rules: O2 elden bitme', () => {
  const others = [run('yellow', 1, 3, 'o'), [], []] as OkeyTile[][];

  it('doubles the others when a player opens and finishes in one turn', () => {
    const state = okey101Action(round([[...opening(), tile('last', 2, 'blue')], ...others]), 0, {
      action: 'open',
      melds: openingMelds,
    });
    const done = okey101Action(state, 0, { action: 'discard', cardId: 'last' });
    expect(done.ending).toEqual({ okey: false, pairs: false, elden: true, multiplier: 2 });
    expect(done.scores).toEqual([-101, 404, 404, 404]);
  });

  it('stacks with an okey finish up to ×4', () => {
    const state = okey101Action(round([[...opening(), okey('j1')], ...others]), 0, {
      action: 'open',
      melds: openingMelds,
    });
    const done = okey101Action(state, 0, { action: 'discard', cardId: 'j1' });
    expect(done.ending!.multiplier).toBe(4);
    expect(done.scores).toEqual([-202, 808, 808, 808]);
  });

  it('stacks with a çift finish up to ×4', () => {
    const pairs = Array.from({ length: 5 }, (_, i) => [
      tile(`p${i}a`, i + 1),
      tile(`p${i}b`, i + 1),
    ]);
    const state = okey101Action(
      round([[...pairs.flat(), tile('last', 13, 'blue')], ...others]),
      0,
      {
        action: 'open-pairs',
        melds: pairs.map(ids),
      },
    );
    const done = okey101Action(state, 0, { action: 'discard', cardId: 'last' });
    expect(done.ending).toEqual({ okey: false, pairs: true, elden: true, multiplier: 4 });
    expect(done.scores).toEqual([-202, 808, 808, 808]);
  });

  it('is not elden when the opening was in an earlier turn, or with the switch off', () => {
    const earlier = round(
      [[tile('last', 2, 'blue')], ...others],
      {},
      { opened: ['runs', null, null, null] },
    );
    expect(okey101Action(earlier, 0, { action: 'discard', cardId: 'last' }).scores).toEqual([
      -101, 202, 202, 202,
    ]);
    const off = okey101Action(
      round([[...opening(), tile('last', 2, 'blue')], ...others], { eldenBitme: false }),
      0,
      { action: 'open', melds: openingMelds },
    );
    expect(okey101Action(off, 0, { action: 'discard', cardId: 'last' }).scores).toEqual([
      -101, 202, 202, 202,
    ]);
  });
});

describe('101 v2 rules: O4 side discard', () => {
  const picked = (options: Partial<Okey101Options> = {}) => {
    const state = round([[], filler('h', 6), [], []], options, {
      turn: 1,
      stage: 'draw',
      discards: [[tile('pickup', 13, 'black')], [], [], []],
    });
    return okey101Action(state, 1, { action: 'draw', cardId: 'discard' });
  };

  it('charges +101 when the picked tile is still in hand at the discard', () => {
    const after = picked();
    const done = okey101Action(after, 1, { action: 'discard', cardId: 'h0' });
    expect(done.penalties![1]).toBe(101);
    expect(done.penaltyLog).toEqual([{ seat: 1, reason: 'pickup', amount: 101 }]);
    expect(okey101Action(after, 1, { action: 'discard', cardId: 'pickup' }).penalties![1]).toBe(
      101,
    );
  });

  it('refuses Çek undo by default: the side tile stays in hand', () => {
    const after = picked();
    expect(() => okey101Action(after, 1, { action: 'draw' })).toThrow('PICKUP_UNDO_DISABLED');
    expect(after.hands[1].some((t) => t.id === 'pickup')).toBe(true);
  });

  it('lets Çek return the tile for the same +101 when undo is enabled', () => {
    const undone = okey101Action(picked({ pickupUndo: true }), 1, { action: 'draw' });
    expect(undone.discards[0].at(-1)?.id).toBe('pickup');
    expect(undone.hands[1].some((t) => t.id === 'pickup')).toBe(false);
    expect(undone.hands[1]).toHaveLength(7);
    expect(undone.penalties![1]).toBe(101);
    expect(undone.penaltyLog).toEqual([{ seat: 1, reason: 'pickup', amount: 101 }]);
  });

  it('charges nothing once the picked tile is melded', () => {
    let state = round(
      [[], [...run('black', 11, 12, 'k'), ...filler('h', 3)], [], []],
      {},
      {
        turn: 1,
        stage: 'draw',
        opened: [null, 'runs', null, null],
        discards: [[tile('pickup', 13, 'black')], [], [], []],
      },
    );
    state = okey101Action(state, 1, { action: 'draw', cardId: 'discard' });
    state = okey101Action(state, 1, { action: 'open', melds: [['k11', 'k12', 'pickup']] });
    expect(okey101Action(state, 1, { action: 'discard', cardId: 'h0' }).penalties![1]).toBe(0);
  });

  it('keeps the v1 refusal and free undo with the switch off, even with undo off', () => {
    // pickupPenalty off + pickupUndo off would leave no way out, so undo stays allowed.
    const after = picked({ pickupPenalty: false, pickupUndo: false });
    expect(() => okey101Action(after, 1, { action: 'discard', cardId: 'h0' })).toThrow(
      'PICKED_DISCARD_MUST_BE_USED',
    );
    expect(okey101Action(after, 1, { action: 'draw' }).penalties![1]).toBe(0);
  });
});

describe('101 v2 rules: O5 katlamalı pairs and gösterge', () => {
  const pairsOf = (prefix: string, count: number) =>
    Array.from({ length: count }, (_, i) => [
      tile(`${prefix}${i}a`, i + 1),
      tile(`${prefix}${i}b`, i + 1),
    ]);

  it('needs one more pair than the highest pair opening on folding tables', () => {
    const five = pairsOf('a', 5),
      next5 = pairsOf('b', 5),
      next6 = pairsOf('c', 6);
    let state = round(
      [
        [...five.flat(), ...filler('x', 2)],
        [...next5.flat(), ...next6.flat(), ...filler('y', 2)],
        [],
        [],
      ],
      {},
      {},
      true,
    );
    state = okey101Action(state, 0, { action: 'open-pairs', melds: five.map(ids) });
    expect(okey101View(state, 0)).toMatchObject({ highestPairs: 5, requiredPairs: 6 });
    state = okey101Action(state, 0, { action: 'discard', cardId: 'x0' });
    state = okey101Action(state, 1, { action: 'draw' });
    expect(() => okey101Action(state, 1, { action: 'open-pairs', melds: next5.map(ids) })).toThrow(
      'INVALID_PAIRS_OPENING',
    );
    expect(
      okey101Action(state, 1, { action: 'open-pairs', melds: next6.map(ids) }).highestPairs,
    ).toBe(6);
  });

  it('keeps five pairs without folding', () => {
    const five = pairsOf('a', 5),
      next5 = pairsOf('b', 5);
    let state = round([
      [...five.flat(), ...filler('x', 2)],
      [...next5.flat(), ...filler('y', 2)],
      [],
      [],
    ]);
    state = okey101Action(state, 0, { action: 'open-pairs', melds: five.map(ids) });
    state = okey101Action(state, 0, { action: 'discard', cardId: 'x0' });
    state = okey101Action(state, 1, { action: 'draw' });
    expect(okey101Action(state, 1, { action: 'open-pairs', melds: next5.map(ids) }).opened[1]).toBe(
      'pairs',
    );
  });

  it('gives −101 for showing the indicator’s twin on the first turn, once', () => {
    const twin = tile('twin', 9, 'black');
    let state = round([
      [twin, ...filler('x', 3)],
      [tile('t2', 9, 'black'), ...filler('y', 3)],
      [],
      [],
    ]);
    expect(okey101GostergeTile(state, 0)).toBe('twin');
    state = okey101Action(state, 0, { action: 'gosterge' });
    expect(state.penalties![0]).toBe(-101);
    expect(okey101View(state, 1).gostergeShown).toEqual([true, false, false, false]);
    expect(() => okey101Action(state, 0, { action: 'gosterge' })).toThrow('GOSTERGE_NOT_ALLOWED');
    state = okey101Action(state, 0, { action: 'discard', cardId: 'x0' });
    // Seat 1 may show it before or after drawing on its first turn.
    expect(okey101GostergeTile(state, 1)).toBe('t2');
    state = okey101Action(state, 1, { action: 'draw' });
    state = okey101Action(state, 1, { action: 'discard', cardId: 'y0' });
    state.turn = 1;
    state.stage = 'discard';
    expect(() => okey101Action(state, 1, { action: 'gosterge' })).toThrow('GOSTERGE_NOT_ALLOWED');
  });

  it('refuses gösterge without the twin, for the indicator itself or with the switch off', () => {
    const noTwin = round([filler('x', 4), [], [], []]);
    expect(() => okey101Action(noTwin, 0, { action: 'gosterge' })).toThrow('GOSTERGE_NOT_ALLOWED');
    const off = round([[tile('twin', 9, 'black'), ...filler('x', 3)], [], [], []], {
      gostergeBonus: false,
    });
    expect(() => okey101Action(off, 0, { action: 'gosterge' })).toThrow('GOSTERGE_NOT_ALLOWED');
    const fake = round([[tile('indicator', 9, 'black'), ...filler('x', 3)], [], [], []]);
    expect(okey101GostergeTile(fake, 0)).toBeNull();
  });

  it('counts the gösterge bonus in the final score', () => {
    let state = round(
      [[tile('twin', 9, 'black'), tile('last', 2, 'blue')], [], [], []],
      {},
      {
        opened: ['runs', null, null, null],
      },
    );
    state = okey101Action(state, 0, { action: 'gosterge' });
    state.hands[0] = [tile('last', 2, 'blue')];
    expect(okey101Action(state, 0, { action: 'discard', cardId: 'last' }).scores[0]).toBe(-202);
  });
});

describe('101 v2 rules: O6 12-13-1', () => {
  const wrapRules = okeyRuleProfile(false, false, { wrapAround: true });
  const hand = [...run('red', 12, 13, 'r'), tile('r1', 1), tile('keep', 5, 'blue')];

  it('refuses 12-13-1 by default', () => {
    expect(() => validate101Meld([tile('a', 12), tile('b', 13), tile('c', 1)])).toThrow(
      'INVALID_MELD',
    );
    // The client passes validate101Meld straight to forEach, so the index argument must not matter.
    expect(() => [run('red', 3, 5)].forEach(validate101Meld)).not.toThrow();
    expect(() =>
      okey101Action(round([hand, [], [], []], {}, { opened: ['runs', null, null, null] }), 0, {
        action: 'open',
        melds: [['r12', 'r13', 'r1']],
      }),
    ).toThrow('INVALID_MELD');
  });

  it('allows a high 1 worth 11 when enabled, never 13-1-2', () => {
    expect(
      validate101MeldWith([tile('a', 12), tile('b', 13), tile('c', 1)], { wrapAround: true }),
    ).toBe(36);
    expect(
      validate101MeldWith([tile('a', 11), tile('b', 12), tile('c', 13), tile('d', 1)], {
        wrapAround: true,
      }),
    ).toBe(47);
    expect(() =>
      validate101MeldWith([tile('a', 13), tile('b', 1), tile('c', 2)], { wrapAround: true }),
    ).toThrow('INVALID_MELD');
    expect(() =>
      validate101MeldWith([tile('a', 12), tile('b', 13), tile('c', 1), tile('d', 2)], {
        wrapAround: true,
      }),
    ).toThrow('INVALID_MELD');
    const melds = [
      [tile('a', 12), tile('b', 13), tile('c', 1)],
      run('blue', 9, 13),
      run('yellow', 8, 11),
    ];
    expect(validate101Opening(melds.flat(), melds, wrapRules)).toBe(36 + 55 + 38);
  });

  it('resolves okeys and extensions to the high 1', () => {
    const state = okey101Action(
      round(
        [[...run('red', 12, 13, 'r'), okey('j1'), tile('keep', 5, 'blue')], [], [], []],
        { wrapAround: true },
        {
          opened: ['runs', null, null, null],
        },
      ),
      0,
      { action: 'open', melds: [['r12', 'r13', 'j1']] },
    );
    expect(state.melds[0].tiles.map((t) => t.value)).toEqual([12, 13, 1]);
    const natural = extend101Meld(run('red', 11, 13), [tile('r1', 1)], wrapRules);
    expect(natural?.map((t) => t.value)).toEqual([11, 12, 13, 1]);
    expect(validate101MeldWith(natural!, { wrapAround: true })).toBe(47);
    expect(
      extend101Meld(run('red', 11, 13), [tile('r1', 1)], okeyRuleProfile(false, false)),
    ).toBeNull();
  });
});

describe('101 v2 rules: O9 processing', () => {
  const table = () => [{ owner: 1, pairs: false, tiles: run('red', 5, 7) }];

  it('adds tiles to both ends of a run in one action, in either order', () => {
    for (const order of [
      ['r4', 'r8'],
      ['r8', 'r4'],
    ]) {
      const state = round(
        [[tile('r4', 4), tile('r8', 8), tile('keep', 2, 'blue')], [], [], []],
        {},
        {
          opened: ['runs', 'runs', null, null],
          melds: table(),
        },
      );
      const after = okey101Action(state, 0, { action: 'process', amount: 0, tileIds: order });
      expect(after.melds[0].tiles.map((t) => t.value)).toEqual([4, 5, 6, 7, 8]);
      expect(after.hands[0].map((t) => t.id)).toEqual(['keep']);
    }
  });

  it('charges +101 for a reclaimed okey left in hand only when the switch is on', () => {
    const setup = () => ({
      opened: ['runs', 'runs', null, null] as OkeyRound['opened'],
      melds: [
        {
          owner: 1,
          pairs: false,
          tiles: [tile('r5', 5), tile('j1', 6, 'red', true), tile('r7', 7)],
        },
      ],
    });
    const hand = [tile('r6', 6), tile('keep', 2, 'yellow'), tile('other', 12, 'yellow')];
    for (const [options, expected] of [
      [{}, 0],
      [{ reclaimedOkeyMustBeUsed: true }, 101],
    ] as const) {
      let state = round([hand, [], [], []], options, setup());
      state = okey101Action(state, 0, {
        action: 'process',
        amount: 0,
        cardId: 'j1',
        tileIds: ['r6'],
      });
      expect(state.hands[0].some((t) => t.id === 'j1')).toBe(true);
      expect(okey101Action(state, 0, { action: 'discard', cardId: 'keep' }).penalties![0]).toBe(
        expected,
      );
    }
  });
});

describe('101 v2 rules: stored v1 rounds', () => {
  it('keeps v1 behaviour for a round without options or the new fields', () => {
    const state = round(
      [[], filler('h', 4), [], []],
      {},
      {
        turn: 1,
        stage: 'draw',
        discards: [[tile('pickup', 13, 'black')], [], [], []],
      },
    ) as Partial<OkeyRound> & OkeyRound;
    state.rules = {
      id: 'rooms-101-v1',
      folding: false,
      teams: false,
      openingMinimum: 101,
      pairsMinimum: 5,
    };
    for (const key of [
      'penalties',
      'penaltyLog',
      'highestPairs',
      'openedThisTurn',
      'turnsPlayed',
      'gostergeShown',
      'reclaimedOkey',
    ] as const)
      delete state[key];
    const after = okey101Action(state, 1, { action: 'draw', cardId: 'discard' });
    expect(() => okey101Action(after, 1, { action: 'discard', cardId: 'h0' })).toThrow(
      'PICKED_DISCARD_MUST_BE_USED',
    );
    const view = okey101View(okey101Action(after, 1, { action: 'draw' }), 1);
    expect(view.penalties).toEqual([0, 0, 0, 0]);
  });
});
