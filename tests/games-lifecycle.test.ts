import { describe, expect, it } from 'vitest';
import { holdemAction, holdemView, startHoldem } from '../packages/games/src/holdem';
import {
  startBlackjackTable,
  blackjackTableAction,
  blackjackTableView,
} from '../packages/games/src/blackjack-table';
import { batakAction, batakView, startBatak } from '../packages/games/src/batak-table';
import { legalBatakCards } from '../packages/games/src/batak';
import { okey101Action, okey101View, startOkey101 } from '../packages/games/src/okey101-table';
describe('full table hand lifecycles', () => {
  it('runs Holdem streets, reveals only permitted cards and conserves virtual chips through all-ins', () => {
    let hand = startHoldem(
      [
        { userId: 'a', chips: 1000 },
        { userId: 'b', chips: 1000 },
      ],
      0,
      10,
      20,
    );
    expect(holdemView(hand, 'a').seats[1].cards).toEqual([]);
    expect(holdemView(hand, 'outsider').seats.every((s) => !s.cards.length)).toBe(true);
    for (let count = 0; hand.stage !== 'ended' && count < 50; count++) {
      const seat = hand.seats[hand.turn!];
      hand = holdemAction(hand, seat.userId, hand.revision, {
        type: seat.streetBet < hand.maximumBet ? 'call' : 'check',
      });
    }
    expect(hand.stage).toBe('ended');
    expect(hand.board).toHaveLength(5);
    expect(hand.seats.reduce((sum, seat) => sum + seat.chips, 0)).toBe(2000);
    let allin = startHoldem(
      [
        { userId: 'a', chips: 100 },
        { userId: 'b', chips: 200 },
        { userId: 'c', chips: 300 },
      ],
      0,
      10,
      20,
    );
    allin = holdemAction(allin, 'a', 1, { type: 'raise', to: 100 });
    allin = holdemAction(allin, 'b', 2, { type: 'raise', to: 200 });
    allin = holdemAction(allin, 'c', 3, { type: 'call' });
    expect(allin.stage).toBe('ended');
    expect(allin.seats.reduce((sum, seat) => sum + seat.chips, 0)).toBe(600);
  });
  it('short all-in does not reopen a full raise for a player who already acted', () => {
    let hand = startHoldem(
      [
        { userId: 'a', chips: 1000 },
        { userId: 'b', chips: 1000 },
        { userId: 'c', chips: 130 },
      ],
      0,
      10,
      20,
    );
    hand = holdemAction(hand, 'a', 1, { type: 'raise', to: 100 });
    hand = holdemAction(hand, 'b', 2, { type: 'call' });
    hand = holdemAction(hand, 'c', 3, { type: 'raise', to: 130 });
    expect(() => holdemAction(hand, 'a', 4, { type: 'raise', to: 210 })).toThrow(
      'BETTING_NOT_REOPENED',
    );
  });
  it('runs multiplayer Blackjack against one dealer while keeping hole card hidden', () => {
    let hand = startBlackjackTable([
      { userId: 'a', credits: 1000, bet: 10 },
      { userId: 'b', credits: 1000, bet: 20 },
    ]);
    if (!hand.finished) expect(blackjackTableView(hand).dealer).toHaveLength(1);
    for (let i = 0; !hand.finished && i < 10; i++)
      hand = blackjackTableAction(hand, hand.players[hand.turn!].userId, 'stand');
    expect(hand.finished).toBe(true);
    expect(hand.results).toHaveLength(2);
    expect(blackjackTableView(hand)).not.toHaveProperty('shoe');
  });
  it.each(['ihaleli', 'esli', 'koz-maca', 'gommeli'] as const)(
    'completes %s bidding/burial/playing and hides other hands',
    (variant) => {
      let hand = startBatak(variant, 0);
      expect(batakView(hand, 0).hands[1].cards).toEqual([]);
      for (let i = 0; hand.stage !== 'ended' && i < 100; i++) {
        const seat = hand.turn!;
        if (hand.stage === 'bidding') hand = batakAction(hand, seat, { action: 'pass' });
        else if (hand.stage === 'trump')
          hand = batakAction(hand, seat, { action: 'trump', trump: 'spades' });
        else if (hand.stage === 'bury')
          hand = batakAction(hand, seat, {
            action: 'bury',
            tileIds: hand.hands[seat].slice(0, 4).map((c) => c.id),
          });
        else
          hand = batakAction(hand, seat, {
            action: 'play',
            cardId: legalBatakCards(hand.hands[seat], hand.trick, hand.trump)[0].id,
          });
      }
      expect(hand.stage).toBe('ended');
      expect(hand.tricks.reduce((a, b) => a + b, 0)).toBe(variant === 'gommeli' ? 16 : 13);
      expect(hand.hands.every((h) => !h.length)).toBe(true);
    },
  );
  it.each([
    [false, false],
    [true, false],
    [false, true],
    [true, true],
  ])('runs 101 draw/discard lifecycle with folding=%s teams=%s', (folding, teams) => {
    let hand = startOkey101(folding, teams, 0);
    expect(hand.hands.map((h) => h.length)).toEqual([22, 21, 21, 21]);
    expect(okey101View(hand, 0).hands[1].tiles).toEqual([]);
    const all = [hand.indicator, ...hand.stock, ...hand.hands.flat()];
    expect(all.length).toBe(106);
    expect(new Set(all.map((t) => t.id)).size).toBe(106);
    for (let count = 0; hand.stage !== 'ended' && count < 100; count++) {
      const seat = hand.turn!;
      hand = okey101Action(
        hand,
        seat,
        hand.stage === 'draw'
          ? { action: 'draw' }
          : { action: 'discard', cardId: hand.hands[seat][0].id },
      );
    }
    expect(hand.stage).toBe('ended');
    expect(hand.scores).toHaveLength(4);
  });
});
