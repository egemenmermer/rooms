import { describe, expect, it } from 'vitest';
import {
  evaluateHoldem,
  sidePots,
  shuffledDeck,
  type Card,
  type Suit,
} from '../packages/games/src/cards';
import {
  blackjackAction,
  blackjackTotal,
  blackjackView,
  startBlackjack,
} from '../packages/games/src/blackjack';
import {
  advanceTakeovers,
  applySeatReturns,
  disconnectSeat,
  requestSeatReturn,
} from '../packages/games/src/seats';
import { batakScores, batakTrickWinner, legalBatakCards } from '../packages/games/src/batak';
import {
  okeyRuleProfile,
  validate101Meld,
  validate101Opening,
  type OkeyTile,
} from '../packages/games/src/okey101';
const card = (rank: number, suit: Suit = 'hearts', prefix = ''): Card => ({
  id: `${prefix}${suit}-${rank}`,
  rank,
  suit,
});
describe('versioned game domain rules', () => {
  it('creates unique secure shuffled decks', () => {
    const deck = shuffledDeck(6);
    expect(deck.length).toBe(312);
    expect(new Set(deck.map((c) => c.id)).size).toBe(312);
  });
  it('ranks wheel straight and full house correctly among seven cards', () => {
    expect(
      evaluateHoldem([
        card(14),
        card(2, 'clubs'),
        card(3, 'diamonds'),
        card(4),
        card(5, 'spades'),
        card(9),
        card(10, 'spades'),
      ]),
    ).toEqual([4, 5]);
    expect(
      evaluateHoldem([
        card(14),
        card(14, 'clubs'),
        card(14, 'spades'),
        card(9),
        card(9, 'clubs'),
        card(9, 'spades'),
        card(3),
      ]),
    ).toEqual([6, 14, 9]);
  });
  it('keeps folded chips in all-in side pots while excluding folded winners', () => {
    expect(
      sidePots([
        { userId: 'a', amount: 50, folded: false },
        { userId: 'b', amount: 100, folded: false },
        { userId: 'c', amount: 100, folded: true },
      ]),
    ).toEqual([
      { amount: 150, eligible: ['a', 'b'] },
      { amount: 100, eligible: ['b'] },
    ]);
  });
  it('handles soft aces, S17 dealer and hides dealer hole card/shoe', () => {
    expect(blackjackTotal([card(14), card(14, 'clubs'), card(9)])).toBe(21);
    const shoe = [card(10), card(14, 'clubs'), card(8), card(6, 'clubs'), ...shuffledDeck()];
    const state = startBlackjack(100, 10, shoe);
    expect(blackjackView(state).dealer).toHaveLength(1);
    expect(blackjackView(state)).not.toHaveProperty('shoe');
    const end = blackjackAction(state, 1, 'stand');
    expect(end.finished).toBe(true);
    expect(end.dealer).toHaveLength(2);
    expect(end.credits).toBe(110);
    expect(() => blackjackAction(end, 1, 'hit')).toThrow('REVISION_CONFLICT');
  });
  it('pays natural blackjack 3:2 and preserves total virtual credits', () => {
    const round = startBlackjack(100, 10, [
      card(14),
      card(9, 'clubs'),
      card(10),
      card(8, 'clubs'),
      ...shuffledDeck(),
    ]);
    expect(round.results[0].outcome).toBe('blackjack');
    expect(round.credits).toBe(115);
  });
  it('takes over after 30 seconds then returns same seat at safe boundary', () => {
    const disconnected = disconnectSeat(
      [{ seat: 1, userId: 'alice', bot: false, disconnectedAt: null, pendingReturn: false }],
      'alice',
      100,
    );
    expect(advanceTakeovers(disconnected, 30099)[0].bot).toBe(false);
    const bot = advanceTakeovers(disconnected, 30100);
    expect(bot[0].userId).toBe('alice');
    expect(bot[0].bot).toBe(true);
    expect(applySeatReturns(requestSeatReturn(bot, 'alice'))[0]).toMatchObject({
      seat: 1,
      userId: 'alice',
      bot: false,
    });
  });
  it('enforces Batak follow/overtrump and determines trick winner', () => {
    const trick = [
      { seat: 0, card: card(10) },
      { seat: 1, card: card(6, 'spades') },
    ];
    expect(
      legalBatakCards([card(5, 'clubs'), card(4, 'spades'), card(8, 'spades')], trick, 'spades'),
    ).toEqual([card(8, 'spades')]);
    expect(batakTrickWinner([...trick, { seat: 2, card: card(8, 'spades') }], 'spades')).toBe(2);
    expect(batakScores('esli', [4, 2, 4, 3], 0, 9)).toEqual([-9, 5, -9, 5]);
  });
  it('validates 101 opening tiles, ordered runs and folding threshold', () => {
    const melds: OkeyTile[][] = ['red', 'blue', 'black'].map((color) =>
      [10, 11, 12, 13].map((value) => ({
        id: `${color}-${value}`,
        color: color as OkeyTile['color'],
        value,
      })),
    );
    expect(validate101Meld(melds[0])).toBe(46);
    expect(validate101Opening(melds.flat(), melds, okeyRuleProfile(false, false))).toBe(138);
    expect(() => validate101Opening(melds.flat(), melds, okeyRuleProfile(true, true), 138)).toThrow(
      'OPENING_TOO_LOW',
    );
    expect(() => validate101Opening([], melds, okeyRuleProfile(false, false))).toThrow(
      'TILES_NOT_IN_HAND',
    );
  });
});
