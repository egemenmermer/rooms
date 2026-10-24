import { describe, expect, it } from 'vitest';
import type { Card, Suit } from '../packages/games/src/cards';
import {
  actionPisti,
  botPisti,
  parsePistiCommand,
  pistiCardPoints,
  pistiMatchWinners,
  pistiModule,
  pistiSidePoints,
  settlePisti,
  startPisti,
  viewPisti,
  type PistiState,
} from '../packages/games/src/pisti';

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

const card = (rank: number, suit: Suit = 'hearts', copy = 0): Card => ({
  id: `${copy}-${suit}-${rank}`,
  suit,
  rank,
});
/** Move a state into a hand-built scenario; the rest of the deal is irrelevant for these cases. */
function scenario(overrides: Partial<PistiState>, seats = 2): PistiState {
  return { ...startPisti(seats, {}, 0, seeded(1)), ...overrides };
}
function play(state: PistiState, seat: number, c: Card, rng = seeded(0)): PistiState {
  const next = actionPisti(state, seat, { type: 'play', cardId: c.id }, rng);
  if ('error' in next) throw new Error(next.error);
  return next;
}
const allCards = (s: PistiState) => [
  ...s.deck,
  ...s.hands.flat(),
  ...s.table,
  ...s.captured.flat(),
];

describe('pisti dealing', () => {
  it('deals 4 to each player and 4 to the table from one 52-card deck', () => {
    for (const seats of [2, 4]) {
      const s = startPisti(seats, {}, 0, seeded(7));
      expect(s.hands.map((h) => h.length)).toEqual(Array(seats).fill(4));
      expect(s.table).toHaveLength(4);
      expect(s.deck).toHaveLength(52 - 4 - 4 * seats);
      const cards = allCards(s);
      expect(cards).toHaveLength(52);
      expect(new Set(cards.map((c) => c.id)).size).toBe(52);
      expect(s.turn).toBe(0);
      expect(s.teams).toBe(seats === 4);
    }
  });

  it('is deterministic for a seed and honours the first seat', () => {
    expect(startPisti(2, {}, 1, seeded(3))).toEqual(startPisti(2, {}, 1, seeded(3)));
    expect(startPisti(2, {}, 1, seeded(3)).turn).toBe(1);
    expect(startPisti(4, {}, 6, seeded(3)).turn).toBe(2);
    expect(startPisti(2, {}, 0, seeded(3))).not.toEqual(startPisti(2, {}, 0, seeded(4)));
  });

  it('rejects seat counts other than 2 and 4 and defaults odd options', () => {
    expect(() => startPisti(3, {}, 0, seeded(1))).toThrow();
    expect(startPisti(2, { target: 999 as 151 }, 0, seeded(1)).target).toBe(151);
    expect(startPisti(2, { target: 101 }, 0, seeded(1)).target).toBe(101);
    expect(startPisti(2, undefined, 0, seeded(1)).target).toBe(151);
  });

  it('shuffles a jack back when it would be the face-up opening card (option)', () => {
    let jackTopWhenOff = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const on = startPisti(2, { reshuffleJackTop: true }, 0, seeded(seed));
      expect(on.table[3].rank).not.toBe(11);
      expect(allCards(on)).toHaveLength(52);
      expect(new Set(allCards(on).map((c) => c.id)).size).toBe(52);
      const off = startPisti(2, { reshuffleJackTop: false }, 0, seeded(seed));
      if (off.table[3].rank === 11) jackTopWhenOff++;
    }
    expect(jackTopWhenOff).toBeGreaterThan(0);
  });

  it('serialises to JSON without loss', () => {
    const s = startPisti(4, {}, 0, seeded(9));
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
  });
});

describe('pisti captures', () => {
  it('captures the whole pile when the top card rank matches and leaves the table empty', () => {
    const s = scenario({
      hands: [[card(7, 'spades'), card(3)], [card(9)]],
      table: [card(4), card(12), card(7, 'clubs')],
      deck: [],
    });
    const n = play(s, 0, card(7, 'spades'));
    expect(n.table).toEqual([]);
    expect(n.captured[0]).toHaveLength(4);
    expect(n.lastCapture).toMatchObject({ seat: 0, count: 4, kind: 'capture' });
    expect(n.pisti).toEqual([0, 0]);
    expect(n.turn).toBe(1);
  });

  it('puts a non-matching card on the pile and matches only against the top card', () => {
    const s = scenario({
      hands: [[card(7, 'spades'), card(3)], [card(9)]],
      table: [card(7, 'clubs'), card(12)],
      deck: [],
    });
    const n = play(s, 0, card(7, 'spades'));
    expect(n.table).toHaveLength(3);
    expect(n.captured[0]).toHaveLength(0);
    expect(n.lastPlay).toMatchObject({ seat: 0, captured: false });
    expect(n.lastCapture).toBeNull();
  });

  it('lets a jack capture any non-empty pile, but a jack on an empty table just lies there', () => {
    const jack = card(11, 'spades');
    const s = scenario({
      hands: [[jack, card(3)], [card(9)]],
      table: [card(4), card(12), card(6)],
      deck: [],
    });
    const n = play(s, 0, jack);
    expect(n.table).toEqual([]);
    expect(n.captured[0]).toHaveLength(4);
    expect(n.lastCapture?.kind).toBe('capture');
    const empty = scenario({ hands: [[jack, card(3)], [card(9)]], table: [], deck: [] });
    const e = play(empty, 0, jack);
    expect(e.table).toEqual([jack]);
    expect(e.captured[0]).toHaveLength(0);
  });

  it('scores a pişti (10) for matching a single card, not for matching a larger pile', () => {
    const single = scenario({
      hands: [[card(5, 'spades'), card(3)], [card(9)]],
      table: [card(5)],
      deck: [],
    });
    const n = play(single, 0, card(5, 'spades'));
    expect(n.pisti).toEqual([1, 0]);
    expect(n.lastCapture).toMatchObject({ kind: 'pisti', count: 2 });
    expect(pistiSidePoints({ ...n, turn: null })[0]).toBeGreaterThanOrEqual(10);
    const pair = scenario({
      hands: [[card(5, 'spades'), card(3)], [card(9)]],
      table: [card(8), card(5)],
      deck: [],
    });
    expect(play(pair, 0, card(5, 'spades')).pisti).toEqual([0, 0]);
  });

  it('scores a jack pişti (20) for a jack on a single jack, and a plain capture for a jack on another single card', () => {
    const onJack = scenario({
      hands: [[card(11, 'spades'), card(3)], [card(9)]],
      table: [card(11, 'clubs')],
      deck: [],
    });
    const n = play(onJack, 0, card(11, 'spades'));
    expect(n.jackPisti).toEqual([1, 0]);
    expect(n.pisti).toEqual([0, 0]);
    expect(n.lastCapture).toMatchObject({ kind: 'jack-pisti', count: 2 });
    const onOther = scenario({
      hands: [[card(11, 'spades'), card(3)], [card(9)]],
      table: [card(6)],
      deck: [],
    });
    const o = play(onOther, 0, card(11, 'spades'));
    expect(o.captured[0]).toHaveLength(2);
    expect(o.pisti).toEqual([0, 0]);
    expect(o.jackPisti).toEqual([0, 0]);
  });

  it('does not count the opening table capture by a jack as a pişti (4 cards, even when the top is a jack)', () => {
    const s = scenario({
      hands: [[card(11, 'spades'), card(3)], [card(9)]],
      table: [card(2), card(3, 'clubs'), card(4), card(11, 'clubs')],
      deck: [],
    });
    const n = play(s, 0, card(11, 'spades'));
    expect(n.captured[0]).toHaveLength(5);
    expect(n.pisti).toEqual([0, 0]);
    expect(n.jackPisti).toEqual([0, 0]);
  });

  it('rejects wrong turn, foreign cards and plays after the deal ended without mutating', () => {
    const s = scenario({ hands: [[card(7)], [card(9)]], table: [card(4)], deck: [] });
    const before = JSON.stringify(s);
    expect(actionPisti(s, 1, { type: 'play', cardId: card(9).id }, seeded(0))).toEqual({
      error: 'NOT_YOUR_TURN',
    });
    expect(actionPisti(s, 0, { type: 'play', cardId: card(9).id }, seeded(0))).toEqual({
      error: 'CARD_NOT_IN_HAND',
    });
    expect(actionPisti(s, 5, { type: 'play', cardId: card(7).id }, seeded(0))).toEqual({
      error: 'NOT_SEATED',
    });
    expect(JSON.stringify(s)).toBe(before);
    const over = scenario({ turn: null });
    expect(actionPisti(over, 0, { type: 'play', cardId: 'x' }, seeded(0))).toEqual({
      error: 'ROUND_OVER',
    });
  });
});

describe('pisti dealing rounds and the end of the deal', () => {
  it('deals 4 more cards each when all hands are empty and play continues in rotation', () => {
    const deck = Array.from({ length: 8 }, (_, i) => card(2 + i, 'spades', 1));
    const s = scenario({ hands: [[card(7, 'clubs')], [card(9, 'clubs')]], table: [card(3)], deck });
    const a = play(s, 0, card(7, 'clubs'));
    expect(a.hands[0]).toHaveLength(0);
    expect(a.deck).toHaveLength(8);
    const b = play(a, 1, card(9, 'clubs'));
    expect(b.hands.map((h) => h.length)).toEqual([4, 4]);
    expect(b.deck).toHaveLength(0);
    expect(b.turn).toBe(0);
    expect(b.table).toHaveLength(3);
  });

  it('gives the remaining table to the last player who captured, and settles', () => {
    const s = scenario({
      hands: [
        [card(7, 'spades'), card(5)],
        [card(9), card(10, 'spades')],
      ],
      table: [card(7, 'clubs'), card(2, 'hearts')],
      deck: [],
    });
    let n = play(s, 0, card(5)); // lies on the pile
    n = play(n, 1, card(9));
    n = play(n, 0, card(7, 'spades')); // does not match top (9)
    expect(n.captured[0]).toHaveLength(0);
    n = play(n, 1, card(10, 'spades'));
    expect(n.turn).toBeNull();
    expect(n.table).toHaveLength(6); // nobody captured: nothing to award
    expect(n.captured.flat()).toHaveLength(0);
    // Now a deal where seat 1 captures last and keeps the rest.
    const t = scenario({
      hands: [
        [card(3, 'spades'), card(8)],
        [card(4), card(3, 'clubs')],
      ],
      table: [card(12), card(6)],
      deck: [],
    });
    let m = play(t, 0, card(8));
    m = play(m, 1, card(4));
    m = play(m, 0, card(3, 'spades'));
    m = play(m, 1, card(3, 'clubs')); // seat 1 matches the top 3 and takes the pile
    expect(m.turn).toBeNull();
    expect(m.lastCapturer).toBe(1);
    expect(m.captured[1]).toHaveLength(6);
    expect(m.captured[0]).toHaveLength(0);
    expect(settlePisti(m)?.winners).toEqual([1]);
    const rest = scenario({
      hands: [
        [card(3, 'spades'), card(8)],
        [card(8, 'clubs'), card(4)],
      ],
      table: [card(12)],
      deck: [],
    });
    let r = play(rest, 0, card(8));
    r = play(r, 1, card(8, 'clubs')); // seat 1 captures 3 cards, then 2 cards remain for it at the end
    r = play(r, 0, card(3, 'spades'));
    r = play(r, 1, card(4));
    expect(r.turn).toBeNull();
    expect(r.captured[1]).toHaveLength(5);
    expect(r.lastCapture).toMatchObject({ kind: 'remainder', seat: 1, count: 2 });
  });
});

describe('pisti scoring', () => {
  it('values cards: ace 1, jack 1, clubs 2 = 2, diamonds 10 = 3', () => {
    expect(pistiCardPoints(card(14, 'spades'))).toBe(1);
    expect(pistiCardPoints(card(11, 'hearts'))).toBe(1);
    expect(pistiCardPoints(card(2, 'clubs'))).toBe(2);
    expect(pistiCardPoints(card(2, 'hearts'))).toBe(0);
    expect(pistiCardPoints(card(10, 'diamonds'))).toBe(3);
    expect(pistiCardPoints(card(10, 'spades'))).toBe(0);
  });

  it('a full deck carries 13 card points plus 3 for most cards (tie: nobody)', () => {
    const deck = startPisti(2, {}, 0, seeded(1));
    const everything = allCards(deck);
    const base = everything.reduce((sum, c) => sum + pistiCardPoints(c), 0);
    expect(base).toBe(13);
    const split = (n: number): PistiState => ({
      ...deck,
      deck: [],
      hands: [[], []],
      table: [],
      captured: [everything.slice(0, n), everything.slice(n)],
      turn: null,
    });
    const uneven = pistiSidePoints(split(20));
    expect(uneven.reduce((a, b) => a + b, 0)).toBe(16);
    expect(uneven[1]).toBeGreaterThanOrEqual(3);
    const even = pistiSidePoints(split(26));
    expect(even.reduce((a, b) => a + b, 0)).toBe(13);
  });

  it('adds pişti and jack pişti bonuses on top', () => {
    const s = { ...startPisti(2, {}, 0, seeded(1)), turn: null } as PistiState;
    const t: PistiState = {
      ...s,
      captured: [[card(5), card(5, 'spades')], []],
      pisti: [2, 0],
      jackPisti: [0, 1],
      deck: [],
      hands: [[], []],
      table: [],
    };
    expect(pistiSidePoints(t)).toEqual([2 * 10 + 3, 20]);
  });

  it('every played bot deal sums to 16 (or 13 on a card tie) plus its bonuses, over many seeds', () => {
    for (const seats of [2, 4]) {
      for (let seed = 1; seed <= 25; seed++) {
        const rng = seeded(seed * 31 + seats);
        let s = startPisti(seats, {}, 0, rng);
        for (let guard = 0; s.turn !== null && guard < 200; guard++)
          s = play(s, s.turn, cardOf(s, botPisti(s, s.turn, rng).cardId), rng);
        expect(s.turn).toBeNull();
        const sidePoints = pistiSidePoints(s),
          counts = s.captured.map((p) => p.length),
          tie = counts[0] === counts[1];
        // Nobody capturing at all would leave cards outside the piles; that is vanishingly rare for bots.
        if (counts.reduce((a, b) => a + b, 0) !== 52) continue;
        const bonus =
          s.pisti.reduce((a, b) => a + b, 0) * 10 + s.jackPisti.reduce((a, b) => a + b, 0) * 20;
        expect(sidePoints.reduce((a, b) => a + b, 0)).toBe((tie ? 13 : 16) + bonus);
      }
    }
  });
});

function cardOf(s: PistiState, id: string): Card {
  const c = s.hands.flat().find((x) => x.id === id);
  if (!c) throw new Error('missing card');
  return c;
}

describe('pisti 2p and 4p teams', () => {
  it('a 2p game scores each seat on its own', () => {
    const s = scenario({
      hands: [[], []],
      deck: [],
      table: [],
      captured: [[card(14), card(11), card(2, 'clubs')], [card(3)]],
      turn: null,
    });
    const r = settlePisti(s);
    expect(r?.points).toEqual([1 + 1 + 2 + 3, 0]);
    expect(r?.winners).toEqual([0]);
  });

  it('a 4p game pools partners (0+2 vs 1+3) and both partners carry the team points', () => {
    const s = scenario(
      {
        hands: [[], [], [], []],
        deck: [],
        table: [],
        captured: [
          [card(14), card(2, 'clubs')],
          [card(3), card(4), card(5)],
        ],
        pisti: [0, 1],
        jackPisti: [0, 0],
        turn: null,
      },
      4,
    );
    const r = settlePisti(s);
    expect(r?.points).toEqual([3, 13, 3, 13]);
    expect(r?.winners).toEqual([1, 3]);
  });

  it('partners capture into the same pile and the turn rotates around four seats', () => {
    const s = scenario(
      {
        hands: [[card(5, 'spades')], [card(6)], [card(5, 'clubs')], [card(7)]],
        table: [card(5)],
        deck: [],
      },
      4,
    );
    expect(s.teams).toBe(true);
    let n = play(s, 0, card(5, 'spades')); // seat 0 takes the single 5: pişti for team 0
    expect(n.pisti).toEqual([1, 0]);
    n = play(n, 1, card(6));
    n = play(n, 2, card(5, 'clubs'));
    expect(n.turn).toBe(3);
    n = play(n, 3, card(7));
    expect(n.turn).toBeNull();
    expect(n.lastCapturer).toBe(0);
    expect(n.captured[0]).toHaveLength(5); // 2 + remainder of 3
    expect(n.captured[1]).toHaveLength(0);
  });

  it('computes match winners from running totals', () => {
    expect(pistiMatchWinners([100, 90], 151)).toEqual([]);
    expect(pistiMatchWinners([160, 150], 151)).toEqual([0]);
    expect(pistiMatchWinners([151, 160, 160, 151], 151)).toEqual([1, 2]);
  });
});

describe('pisti bot', () => {
  it('takes a pişti when available, preferring the 20-point jack pişti', () => {
    const s = scenario({
      hands: [[card(11, 'spades'), card(11, 'clubs'), card(5)], [card(9)]],
      table: [card(11, 'hearts')],
      deck: [card(2, 'spades', 1)],
    });
    expect(botPisti(s, 0, seeded(1))).toMatchObject({ type: 'play' });
    const n = play(s, 0, cardOf(s, botPisti(s, 0, seeded(1)).cardId));
    expect(n.jackPisti).toEqual([1, 0]);
    const t = scenario({
      hands: [[card(11, 'spades'), card(8), card(5)], [card(9)]],
      table: [card(8, 'clubs')],
      deck: [card(2, 'spades', 1)],
    });
    const m = play(t, 0, cardOf(t, botPisti(t, 0, seeded(1)).cardId));
    expect(m.pisti).toEqual([1, 0]);
  });

  it('captures with a matching card instead of spending a jack, and keeps jacks for thin piles', () => {
    const s = scenario({
      hands: [[card(11, 'spades'), card(8), card(4)], [card(9)]],
      table: [card(6), card(12), card(8, 'clubs')],
      deck: [card(2, 'spades', 1)],
    });
    expect(cardOf(s, botPisti(s, 0, seeded(1)).cardId).rank).toBe(8);
    const thin = scenario({
      hands: [[card(11, 'spades'), card(4), card(9)], [card(9, 'clubs')]],
      table: [card(6), card(12)],
      deck: [card(2, 'spades', 1)],
    });
    expect(cardOf(thin, botPisti(thin, 0, seeded(1)).cardId).rank).not.toBe(11);
    const big = scenario({
      hands: [[card(11, 'spades'), card(4), card(9)], [card(9, 'clubs')]],
      table: [card(6), card(14), card(12), card(10, 'diamonds')],
      deck: [card(2, 'spades', 1)],
    });
    expect(cardOf(big, botPisti(big, 0, seeded(1)).cardId).rank).toBe(11);
  });

  it('avoids point cards and jacks when discarding', () => {
    const s = scenario({
      hands: [[card(14), card(10, 'diamonds'), card(11), card(9)], [card(3)]],
      table: [card(6), card(12)],
      deck: [card(2, 'spades', 1)],
    });
    expect(cardOf(s, botPisti(s, 0, seeded(1)).cardId).rank).toBe(9);
  });

  it('always returns a legal command', () => {
    const rng = seeded(42);
    let s = startPisti(2, {}, 0, rng);
    while (s.turn !== null) {
      const command = pistiModule.botCommand(s, s.turn, rng);
      const next = pistiModule.action(s, s.turn, command, rng);
      expect('error' in next).toBe(false);
      s = next as PistiState;
    }
  });
});

describe('pisti full seeded games', () => {
  for (const seats of [2, 4]) {
    it(`plays a ${seats}-player bot match to 151 points and ends with winners`, () => {
      const rng = seeded(2024 + seats);
      const totals = Array<number>(seats).fill(0);
      let first = 0,
        deals = 0;
      while (pistiMatchWinners(totals, 151).length === 0) {
        expect(deals++).toBeLessThan(60);
        let s = pistiModule.start(seats, { target: 151 }, first, rng);
        while (pistiModule.turn(s) !== null) {
          const seat = pistiModule.turn(s) as number;
          const result = pistiModule.action(s, seat, pistiModule.botCommand(s, seat, rng), rng);
          if ('error' in result) throw new Error(result.error);
          s = result;
        }
        const settled = pistiModule.settle(s);
        expect(settled).not.toBeNull();
        settled!.points.forEach((p, seat) => (totals[seat] += p));
        if (seats === 4) {
          expect(totals[0]).toBe(totals[2]);
          expect(totals[1]).toBe(totals[3]);
        }
        first = (first + 1) % seats;
      }
      const winners = pistiMatchWinners(totals, 151);
      expect(winners.length).toBeGreaterThan(0);
      expect(Math.max(...totals)).toBeGreaterThanOrEqual(151);
      expect(deals).toBeGreaterThan(1);
    });
  }

  it('settle is null while the deal is running', () => {
    expect(settlePisti(startPisti(2, {}, 0, seeded(5)))).toBeNull();
  });
});

describe('pisti hidden information', () => {
  it('view() exposes only the own hand, the top table card, counts and the last events', () => {
    for (const seats of [2, 4]) {
      const rng = seeded(11 + seats);
      let s = startPisti(seats, {}, 0, rng);
      for (let step = 0; step < 40 && s.turn !== null; step++) {
        const seat = s.turn;
        for (const viewer of [...Array(seats).keys(), null]) {
          const v = viewPisti(s, viewer);
          const json = JSON.stringify(v);
          const allowed = new Set<string>(
            [
              ...(viewer === null ? [] : s.hands[viewer]),
              ...(s.table.length ? [s.table[s.table.length - 1]] : []),
              ...(s.lastPlay ? [s.lastPlay.card] : []),
              ...(s.lastCapture?.card ? [s.lastCapture.card] : []),
            ].map((c) => c.id),
          );
          const leaked = allCards(s).filter((c) => !allowed.has(c.id) && json.includes(c.id));
          expect(leaked).toEqual([]);
          expect(v.deckCount).toBe(s.deck.length);
          expect(v.hand === null).toBe(viewer === null);
          expect(v.tableCount).toBe(s.table.length);
          expect(v.capturedCounts).toEqual(s.captured.map((p) => p.length));
          expect(v.handCounts).toEqual(s.hands.map((h) => h.length));
          expect(v).not.toHaveProperty('deck');
          expect(v).not.toHaveProperty('hands');
          expect(v).not.toHaveProperty('table');
          expect(v).not.toHaveProperty('captured');
        }
        s = play(s, seat, cardOf(s, botPisti(s, seat, rng).cardId), rng);
      }
    }
  });

  it('keeps the three face-down opening cards hidden', () => {
    const s = startPisti(2, {}, 0, seeded(77));
    const v = viewPisti(s, 0);
    expect(v.tableCount).toBe(4);
    expect(v.tableTop?.id).toBe(s.table[3].id);
    const json = JSON.stringify(v);
    for (const hidden of s.table.slice(0, 3)) expect(json).not.toContain(hidden.id);
  });

  it('exposes the result only after the deal ends and mirrors settle()', () => {
    const rng = seeded(8);
    let s = startPisti(2, {}, 0, rng);
    expect(viewPisti(s, 0).result).toBeNull();
    while (s.turn !== null) s = play(s, s.turn, cardOf(s, botPisti(s, s.turn, rng).cardId), rng);
    expect(viewPisti(s, null).result).toEqual(settlePisti(s));
  });
});

describe('pisti module contract', () => {
  it('declares kind, seats and actions and validates payloads', () => {
    expect(pistiModule.kind).toBe('rooms-pisti-v1');
    expect(pistiModule.seats).toEqual([2, 4]);
    expect(pistiModule.actions).toEqual(['play']);
    expect(parsePistiCommand({ action: 'play', payload: { cardId: '0-hearts-7' } })).toEqual({
      type: 'play',
      cardId: '0-hearts-7',
    });
    for (const bad of [
      { action: 'bid', payload: {} },
      { action: 'play' },
      { action: 'play', payload: null },
      { action: 'play', payload: { cardId: 5 } },
      { action: 'play', payload: { cardId: '' } },
    ])
      expect(parsePistiCommand(bad)).toHaveProperty('error');
  });

  it('never mutates its input state', () => {
    const rng = seeded(21);
    const s = startPisti(2, {}, 0, rng);
    const before = JSON.stringify(s);
    pistiModule.action(s, 0, pistiModule.botCommand(s, 0, rng), rng);
    viewPisti(s, 0);
    expect(JSON.stringify(s)).toBe(before);
  });
});
