import { describe, expect, it } from 'vitest';
import { okey101Action, startOkey101 } from '../packages/games/src/okey101-table';
import type { OkeyTile } from '../packages/games/src/okey101';
import { blackjackAction, startBlackjack } from '../packages/games/src/blackjack';
import { shuffledDeck, type Card } from '../packages/games/src/cards';
import { legalBatakCards } from '../packages/games/src/batak';
import { holdemAction, startHoldem } from '../packages/games/src/holdem';
const tile = (
  id: string,
  value: number,
  color: OkeyTile['color'] = 'red',
  joker = false,
): OkeyTile => ({ id, value, color, joker });
const card = (id: string, rank: number, suit: Card['suit'] = 'hearts'): Card => ({
  id,
  rank,
  suit,
});
describe('friends table edge cases', () => {
  it('101 resolves real wildcards, permits duplicate physical pairs and enforces discard pickup use', () => {
    let state = startOkey101(false, false, 0);
    state.indicator = tile('indicator', 9, 'blue');
    state.hands[0] = [
      tile('r10', 10),
      tile('wild', 10, 'blue', true),
      tile('r12', 12),
      tile('r13', 13),
      ...[10, 11, 12, 13].map((v) => tile(`black${v}`, v, 'black')),
      ...[10, 11, 12, 13].map((v) => tile(`yellow${v}`, v, 'yellow')),
      tile('discard', 1),
    ];
    state = okey101Action(state, 0, {
      action: 'open',
      melds: [
        ['r10', 'wild', 'r12', 'r13'],
        [10, 11, 12, 13].map((v) => `black${v}`),
        [10, 11, 12, 13].map((v) => `yellow${v}`),
      ],
    });
    expect(state.melds[0].tiles[1]).toMatchObject({ value: 11, color: 'red', joker: true });
    expect(state.highestOpening).toBe(138);
    state.hands[0].push(tile('replace', 11));
    state = okey101Action(state, 0, {
      action: 'process',
      amount: 0,
      cardId: 'wild',
      tileIds: ['replace'],
    });
    expect(state.hands[0].find((t) => t.id === 'wild')).toMatchObject({
      color: 'blue',
      value: 10,
      joker: true,
    });
    expect(state.melds[0].tiles.find((t) => t.id === 'replace')).toBeDefined();
    let pairs = startOkey101(false, false, 0);
    pairs.hands[0] = Array.from({ length: 5 }, (_, i) => [
      tile(`pair${i}a`, i + 1),
      tile(`pair${i}b`, i + 1),
    ])
      .flat()
      .concat(tile('keep', 13));
    pairs = okey101Action(pairs, 0, {
      action: 'open-pairs',
      melds: Array.from({ length: 5 }, (_, i) => [`pair${i}a`, `pair${i}b`]),
    });
    expect(pairs.opened[0]).toBe('pairs');
    pairs = okey101Action(pairs, 0, { action: 'discard', cardId: 'keep' });
    expect(pairs.stage).toBe('ended');
    expect(pairs.scores[0]).toBe(-202);
    // v1 refusal; the v2 default (+101 instead) is covered in okey101-rules-v2.test.ts.
    const picked = startOkey101(false, false, 0, { pickupPenalty: false });
    picked.turn = 1;
    picked.stage = 'draw';
    picked.discards[0] = [tile('pickup', 13)];
    const after = okey101Action(picked, 1, { action: 'draw', cardId: 'discard' });
    expect(() =>
      okey101Action(after, 1, { action: 'discard', cardId: after.hands[1][0].id }),
    ).toThrow('PICKED_DISCARD_MUST_BE_USED');
  });
  it('101 rejects duplicate physical IDs, preserves mode and processes pair-opened player into existing runs', () => {
    const state = startOkey101(false, false, 0);
    state.hands[0] = [tile('one', 10), tile('two', 11), tile('three', 12), tile('keep', 13)];
    expect(() =>
      okey101Action(state, 0, {
        action: 'open',
        melds: [
          ['one', 'two', 'three'],
          ['one', 'two', 'three'],
        ],
      }),
    ).toThrow();
    state.opened[0] = 'pairs';
    state.melds = [{ owner: 1, pairs: false, tiles: [tile('a', 7), tile('b', 8), tile('c', 9)] }];
    const processed = okey101Action(state, 0, { action: 'process', amount: 0, tileIds: ['one'] });
    expect(processed.melds[0].tiles).toHaveLength(4);
    expect(() =>
      okey101Action(state, 0, { action: 'open', melds: [['one', 'two', 'three']] }),
    ).toThrow('OPENING_MODE_LOCKED');
  });
  it('split aces receive exactly one card and do not qualify as naturals; ace and ten cannot split', () => {
    const state = startBlackjack(100, 10, [
      card('a1', 14),
      card('d1', 9, 'clubs'),
      card('a2', 14, 'spades'),
      card('d2', 8, 'clubs'),
      card('h1', 10),
      card('h2', 10, 'spades'),
      ...shuffledDeck(),
    ]);
    const split = blackjackAction(state, 1, 'split');
    expect(split.finished).toBe(true);
    expect(split.hands.every((h) => h.cards.length === 2)).toBe(true);
    expect(split.results.every((r) => r.outcome === 'win')).toBe(true);
    expect(split.credits).toBe(120);
    const unmatched = startBlackjack(100, 10, [
      card('a1', 14),
      card('d1', 9, 'clubs'),
      card('t1', 9),
      card('d2', 8, 'clubs'),
      ...shuffledDeck(),
    ]);
    expect(() => blackjackAction(unmatched, 1, 'split')).toThrow('SPLIT_UNAVAILABLE');
  });
  it('Batak follows suit even when trumped, must overtrump when void, and all-in ties conserve every chip', () => {
    const trick = [
      { seat: 0, card: card('lead', 10) },
      { seat: 1, card: card('trump', 8, 'spades') },
    ];
    const follow = card('follow', 3);
    expect(legalBatakCards([follow, card('high', 14, 'spades')], trick, 'spades')).toEqual([
      follow,
    ]);
    expect(
      legalBatakCards([card('low', 5, 'spades'), card('high', 14, 'spades')], trick, 'spades'),
    ).toEqual([card('high', 14, 'spades')]);
    // A common board straight makes all three players tie; unequal contributions create separate pots.
    const deck = shuffledDeck();
    const boardCards = [
      card('b2', 2, 'clubs'),
      card('b3', 3, 'diamonds'),
      card('b4', 4, 'spades'),
      card('b5', 5),
      card('b6', 6, 'clubs'),
    ];
    const dealt = [
      card('p1', 9),
      card('p2', 10),
      card('p0', 11),
      card('p1b', 12, 'clubs'),
      card('p2b', 13, 'diamonds'),
      card('p0b', 14, 'spades'),
      card('burn1', 8, 'clubs'),
      ...boardCards.slice(0, 3),
      card('burn2', 8, 'diamonds'),
      boardCards[3],
      card('burn3', 8, 'spades'),
      boardCards[4],
    ];
    let hand = startHoldem(
      [
        { userId: 'a', chips: 100 },
        { userId: 'b', chips: 200 },
        { userId: 'c', chips: 300 },
      ],
      0,
      10,
      20,
      [...dealt, ...deck],
    );
    hand = holdemAction(hand, 'a', 1, { type: 'raise', to: 100 });
    hand = holdemAction(hand, 'b', 2, { type: 'raise', to: 200 });
    hand = holdemAction(hand, 'c', 3, { type: 'call' });
    expect(hand.seats.map((s) => s.chips)).toEqual([100, 200, 300]);
    expect(hand.seats.reduce((sum, s) => sum + s.chips, 0)).toBe(600);
  });
});
