import { describe, expect, it } from 'vitest';
import { shuffledDeck, type Card } from '../packages/games/src/cards';
import {
  holdemAction,
  holdemRestoredStack,
  holdemView,
  isHoldemDealable,
  publicShowdownHands,
  startHoldem,
  type HoldemHand,
} from '../packages/games/src/holdem';

type Spec = [number, Card['suit']];
/**
 * Builds a deck that deals `hole[i]` to seat i (table order, not deal order) and then the five
 * board cards after the burn cards, for a table of hole.length seats with the given button.
 */
function rig(button: number, hole: [Spec, Spec][], board: Spec[]): Card[] {
  const deck = shuffledDeck();
  const find = ([rank, suit]: Spec) => deck.find((c) => c.rank === rank && c.suit === suit)!;
  const n = hole.length;
  const top: Card[] = [];
  for (let round = 0; round < 2; round++)
    for (let offset = 1; offset <= n; offset++)
      top.push(find(hole[(button + offset) % n][round]));
  const [f1, f2, f3, t, r] = board.map(find);
  const spare = deck.filter((c) => ![...top, f1, f2, f3, t, r].includes(c));
  const stack = [...top, spare[0], f1, f2, f3, spare[1], t, spare[2], r];
  return [...stack, ...deck.filter((c) => !stack.includes(c))];
}
const total = (hand: HoldemHand) => hand.seats.reduce((sum, s) => sum + s.chips, 0);
const aceKing: [Spec, Spec] = [
  [14, 'spades'],
  [13, 'spades'],
];
const sevenTwo: [Spec, Spec] = [
  [7, 'clubs'],
  [2, 'diamonds'],
];
const dryBoard: Spec[] = [
  [9, 'hearts'],
  [5, 'clubs'],
  [3, 'diamonds'],
  [12, 'hearts'],
  [10, 'spades'],
];

describe('H4: a short stack posts the blind all-in', () => {
  it('lets a stack below the big blind play and caps its post at the stack', () => {
    const hand = startHoldem(
      [
        { userId: 'a', chips: 1000 },
        { userId: 'b', chips: 30 },
      ],
      0,
      20,
      40,
      rig(0, [aceKing, sevenTwo], dryBoard),
    );
    // Heads-up the button is the small blind; b is the big blind and posts all-in for 30.
    expect(hand.seats.map((s) => s.streetBet)).toEqual([20, 30]);
    expect(hand.seats[1].chips).toBe(0);
    expect(hand.maximumBet).toBe(40);
    expect(hand.turn).toBe(0);
    // a still has to call the full big blind, only 30 of which can be matched.
    const done = holdemAction(hand, 'a', 1, { type: 'call' });
    expect(done.stage).toBe('ended');
    expect(done.board).toHaveLength(5);
    expect(done.seats.map((s) => s.contribution)).toEqual([40, 30]);
    expect(done.settlement!.pots.map((p) => [p.amount, p.eligible])).toEqual([
      [60, ['a', 'b']],
      [10, ['a']],
    ]);
    expect(total(done)).toBe(1030);
    // a (A-K high) beats b (7-2) for the matched 60 and gets the uncalled 10 back.
    expect(done.payouts).toEqual({ a: 70 });
    expect(done.winners).toEqual(['a']);
  });
  it('still lets the covering player fold the short blind in', () => {
    const hand = startHoldem(
      [
        { userId: 'a', chips: 1000 },
        { userId: 'b', chips: 30 },
      ],
      0,
      20,
      40,
    );
    const done = holdemAction(hand, 'a', 1, { type: 'fold' });
    expect(done.settlement!.reason).toBe('uncontested');
    expect(done.payouts).toEqual({ b: 50 });
    expect(total(done)).toBe(1030);
  });
  it('runs the board out at once when the blinds leave nobody to act', () => {
    const hand = startHoldem(
      [
        { userId: 'a', chips: 5 },
        { userId: 'b', chips: 30 },
      ],
      0,
      20,
      40,
      rig(0, [sevenTwo, aceKing], dryBoard),
    );
    expect(hand.stage).toBe('ended');
    expect(hand.turn).toBeNull();
    expect(hand.board).toHaveLength(5);
    expect(hand.runoutFrom).toBe('preflop');
    expect(total(hand)).toBe(35);
    // b wins the 10 both put in and gets its uncalled 25 back.
    expect(hand.payouts).toEqual({ b: 35 });
    expect(hand.winners).toEqual(['b']);
  });
  it('does not make the big blind act when the small blind already covers its short post', () => {
    const hand = startHoldem(
      [
        { userId: 'a', chips: 1000 },
        { userId: 'b', chips: 10 },
      ],
      0,
      20,
      40,
      rig(0, [aceKing, sevenTwo], dryBoard),
    );
    expect(hand.stage).toBe('ended');
    expect(total(hand)).toBe(1010);
    expect(hand.settlement!.pots.map((p) => p.amount)).toEqual([20, 10]);
  });
  it('keeps the full big blind owed by the other players against a short big blind', () => {
    const hand = startHoldem(
      [
        { userId: 'a', chips: 1000 },
        { userId: 'b', chips: 1000 },
        { userId: 'c', chips: 25 },
      ],
      0,
      20,
      40,
    );
    expect(hand.seats.map((s) => s.streetBet)).toEqual([0, 20, 25]);
    expect(hand.turn).toBe(0);
    const next = holdemAction(hand, 'a', 1, { type: 'call' });
    expect(next.seats[0].streetBet).toBe(40);
    const flop = holdemAction(next, 'b', 2, { type: 'call' });
    expect(flop.stage).toBe('flop');
    // c is all-in, so only a and b act on the flop.
    expect(flop.seats[flop.turn!].userId).toBe('b');
  });
  it('rejects empty stacks but accepts any positive stack', () => {
    expect(() =>
      startHoldem(
        [
          { userId: 'a', chips: 1000 },
          { userId: 'b', chips: 0 },
        ],
        0,
        20,
        40,
      ),
    ).toThrow('INVALID_HOLDEM_TABLE');
    expect(isHoldemDealable(1)).toBe(true);
    expect(isHoldemDealable(0)).toBe(false);
    expect(isHoldemDealable(-5)).toBe(false);
    expect(isHoldemDealable(1.5)).toBe(false);
    expect(
      startHoldem(
        [
          { userId: 'a', chips: 1000 },
          { userId: 'b', chips: 1 },
        ],
        0,
        20,
        40,
      ).stage,
    ).toBe('ended');
  });
});

describe('H5: an uncalled bet coming back is not a win', () => {
  const headsUp = (holeA: [Spec, Spec], holeB: [Spec, Spec]) => {
    let hand = startHoldem(
      [
        { userId: 'a', chips: 1000 },
        { userId: 'b', chips: 100 },
      ],
      0,
      20,
      40,
      rig(0, [holeA, holeB], dryBoard),
    );
    hand = holdemAction(hand, 'a', 1, { type: 'raise', to: 300 });
    return holdemAction(hand, 'b', 2, { type: 'call' });
  };
  it('does not list the covering loser, who only gets 200 back, as a winner', () => {
    const hand = headsUp(sevenTwo, aceKing);
    expect(hand.payouts).toEqual({ a: 200, b: 200 });
    expect(hand.winners).toEqual(['b']);
  });
  it('lists the covering player when it wins the contested pot', () => {
    const hand = headsUp(aceKing, sevenTwo);
    expect(hand.payouts).toEqual({ a: 400 });
    expect(hand.winners).toEqual(['a']);
  });
  it('counts a split pot as a win for both players', () => {
    const hand = startHoldem(
      [
        { userId: 'a', chips: 1000 },
        { userId: 'b', chips: 1000 },
      ],
      0,
      20,
      40,
      rig(
        0,
        [
          [
            [2, 'clubs'],
            [3, 'clubs'],
          ],
          [
            [2, 'diamonds'],
            [3, 'diamonds'],
          ],
        ],
        [
          [14, 'hearts'],
          [14, 'spades'],
          [13, 'hearts'],
          [13, 'spades'],
          [12, 'hearts'],
        ],
      ),
    );
    let state = holdemAction(hand, 'a', 1, { type: 'call' });
    state = holdemAction(state, 'b', 2, { type: 'check' });
    for (let street = 0; street < 3; street++) {
      state = holdemAction(state, state.seats[state.turn!].userId, state.revision, {
        type: 'check',
      });
      state = holdemAction(state, state.seats[state.turn!].userId, state.revision, {
        type: 'check',
      });
    }
    expect(state.stage).toBe('ended');
    expect(state.settlement!.pots[0].split).toBe(true);
    expect(state.winners.sort()).toEqual(['a', 'b']);
  });
  it('still credits dead money from a folded player to a covering winner who loses the main pot', () => {
    let hand = startHoldem(
      [
        { userId: 'a', chips: 1000 },
        { userId: 'b', chips: 1000 },
        { userId: 'c', chips: 100 },
      ],
      0,
      20,
      40,
      rig(0, [sevenTwo, [[8, 'hearts'], [4, 'clubs']], aceKing], [
        [14, 'hearts'],
        [13, 'clubs'],
        [3, 'diamonds'],
        [9, 'clubs'],
        [10, 'spades'],
      ]),
    );
    hand = holdemAction(hand, 'a', 1, { type: 'raise', to: 300 });
    hand = holdemAction(hand, 'b', 2, { type: 'call' });
    hand = holdemAction(hand, 'c', 3, { type: 'call' });
    expect(hand.stage).toBe('flop');
    hand = holdemAction(hand, 'b', hand.revision, { type: 'raise', to: 200 });
    hand = holdemAction(hand, 'a', hand.revision, { type: 'raise', to: 500 });
    hand = holdemAction(hand, 'b', hand.revision, { type: 'fold' });
    expect(hand.stage).toBe('ended');
    // c (top pair, top kicker) beats a for the three-way 300; a takes b's folded chips.
    expect(hand.payouts.c).toBe(300);
    expect(hand.payouts.a).toBeGreaterThan(hand.seats[0].contribution);
    expect(hand.winners.sort()).toEqual(['a', 'c']);
    expect(total(hand)).toBe(2100);
  });
});

describe('H6: public action log', () => {
  it('records blinds and every action with street, chips moved and the street total', () => {
    let hand = startHoldem(
      [
        { userId: 'a', chips: 1000 },
        { userId: 'b', chips: 1000 },
        { userId: 'c', chips: 1000 },
      ],
      0,
      20,
      40,
    );
    hand = holdemAction(hand, 'a', 1, { type: 'raise', to: 100 });
    hand = holdemAction(hand, 'b', 2, { type: 'fold' });
    hand = holdemAction(hand, 'c', 3, { type: 'call' });
    hand = holdemAction(hand, 'c', 4, { type: 'check' });
    hand = holdemAction(hand, 'a', 5, { type: 'raise', to: 500 });
    expect(hand.log).toEqual([
      { street: 'preflop', userId: 'b', action: 'smallBlind', amount: 20, to: 20, allIn: false },
      { street: 'preflop', userId: 'c', action: 'bigBlind', amount: 40, to: 40, allIn: false },
      { street: 'preflop', userId: 'a', action: 'raise', amount: 100, to: 100, allIn: false },
      { street: 'preflop', userId: 'b', action: 'fold', amount: 0, to: 20, allIn: false },
      { street: 'preflop', userId: 'c', action: 'call', amount: 60, to: 100, allIn: false },
      { street: 'flop', userId: 'c', action: 'check', amount: 0, to: 0, allIn: false },
      { street: 'flop', userId: 'a', action: 'raise', amount: 500, to: 500, allIn: false },
    ]);
  });
  it('flags all-in actions and a short blind', () => {
    const hand = startHoldem(
      [
        { userId: 'a', chips: 1000 },
        { userId: 'b', chips: 30 },
      ],
      0,
      20,
      40,
    );
    expect(hand.log!.at(-1)).toMatchObject({ action: 'bigBlind', amount: 30, allIn: true });
  });
  it('is public: every viewer sees the same log, without hidden cards', () => {
    const hand = startHoldem(
      [
        { userId: 'a', chips: 1000 },
        { userId: 'b', chips: 1000 },
      ],
      0,
      20,
      40,
    );
    const next = holdemAction(hand, 'a', 1, { type: 'call' });
    expect(holdemView(next, 'b').log).toEqual(next.log);
    expect(holdemView(next, 'spectator').log).toEqual(next.log);
    expect(Object.keys(holdemView(next, 'spectator').log[0]).sort()).toEqual([
      'action',
      'allIn',
      'amount',
      'street',
      'to',
      'userId',
    ]);
  });
  it('keeps working for a hand stored before the log existed', () => {
    const stored = startHoldem(
      [
        { userId: 'a', chips: 1000 },
        { userId: 'b', chips: 1000 },
      ],
      0,
      20,
      40,
    );
    delete stored.log;
    expect(holdemView(stored, 'a').log).toEqual([]);
    const next = holdemAction(stored, 'a', 1, { type: 'call' });
    expect(next.log).toEqual([
      { street: 'preflop', userId: 'a', action: 'call', amount: 20, to: 40, allIn: false },
    ]);
  });
});

describe('H8: optional muck and run-out marker', () => {
  const play = (muckLosers: boolean) => {
    let hand = startHoldem(
      [
        { userId: 'a', chips: 1000 },
        { userId: 'b', chips: 1000 },
      ],
      0,
      20,
      40,
      rig(0, [aceKing, sevenTwo], dryBoard),
      muckLosers ? { muckLosers: true } : undefined,
    );
    hand = holdemAction(hand, 'a', 1, { type: 'call' });
    hand = holdemAction(hand, 'b', 2, { type: 'check' });
    for (let street = 0; street < 3; street++) {
      hand = holdemAction(hand, hand.seats[hand.turn!].userId, hand.revision, { type: 'check' });
      hand = holdemAction(hand, hand.seats[hand.turn!].userId, hand.revision, { type: 'check' });
    }
    return hand;
  };
  it('shows every hand at showdown by default', () => {
    const hand = play(false);
    expect(hand.settlement!.mucked ?? []).toEqual([]);
    const view = holdemView(hand, 'spectator');
    expect(Object.keys(view.showdown!).sort()).toEqual(['a', 'b']);
    expect(view.seats.every((s) => s.cards.length === 2)).toBe(true);
  });
  it('lets a player who wins nothing keep their cards hidden when the table muck rule is on', () => {
    const hand = play(true);
    expect(hand.settlement!.mucked).toEqual(['b']);
    const view = holdemView(hand, 'spectator');
    expect(Object.keys(view.showdown!)).toEqual(['a']);
    expect(view.mucked).toEqual(['b']);
    expect(view.seats.find((s) => s.userId === 'b')).toMatchObject({
      cards: [],
      hiddenCardCount: 2,
    });
    expect(view.seats.find((s) => s.userId === 'a')!.cards).toHaveLength(2);
    // The mucking player still sees their own cards and their own hand.
    expect(holdemView(hand, 'b').seats.find((s) => s.userId === 'b')!.cards).toHaveLength(2);
    expect(Object.keys(publicShowdownHands(hand)!)).toEqual(['a']);
  });
  it('never mucks when somebody is all-in', () => {
    let hand = startHoldem(
      [
        { userId: 'a', chips: 1000 },
        { userId: 'b', chips: 100 },
      ],
      0,
      20,
      40,
      rig(0, [aceKing, sevenTwo], dryBoard),
      { muckLosers: true },
    );
    hand = holdemAction(hand, 'a', 1, { type: 'raise', to: 100 });
    hand = holdemAction(hand, 'b', 2, { type: 'call' });
    expect(hand.settlement!.mucked).toEqual([]);
    expect(Object.keys(holdemView(hand, 'spectator').showdown!).sort()).toEqual(['a', 'b']);
  });
  it('never exposes a folded or mucked hand through the public settlement', () => {
    const hand = play(true);
    const text = JSON.stringify({ ...holdemView(hand, 'spectator') });
    for (const card of hand.seats[1].cards) expect(text).not.toContain(card.id);
    // The stored settlement (copied into the hand history) must not name the mucked cards either.
    const stored = JSON.stringify(hand.settlement);
    for (const card of hand.seats[1].cards) expect(stored).not.toContain(card.id);
    expect(Object.keys(hand.settlement!.hands)).toEqual(['a']);
  });
  it('tells the client which stage the board was dealt out from', () => {
    let hand = startHoldem(
      [
        { userId: 'a', chips: 1000 },
        { userId: 'b', chips: 1000 },
      ],
      0,
      20,
      40,
    );
    expect(hand.runoutFrom).toBeUndefined();
    hand = holdemAction(hand, 'a', 1, { type: 'call' });
    hand = holdemAction(hand, 'b', 2, { type: 'check' });
    hand = holdemAction(hand, hand.seats[hand.turn!].userId, hand.revision, {
      type: 'raise',
      to: 960,
    });
    hand = holdemAction(hand, hand.seats[hand.turn!].userId, hand.revision, { type: 'call' });
    expect(hand.stage).toBe('ended');
    expect(hand.runoutFrom).toBe('flop');
    expect(holdemView(hand, 'a').runoutFrom).toBe('flop');
  });
});

describe('H9: stack kept across standing up', () => {
  it('restores the saved stack, capped at the maximum buy-in', () => {
    expect(holdemRestoredStack(undefined, 2000, 1000)).toBe(1000);
    expect(holdemRestoredStack(640, 2000, 1000)).toBe(640);
    expect(holdemRestoredStack(5000, 2000, 1000)).toBe(2000);
    expect(holdemRestoredStack(640, 2000, 1000, 500)).toBe(640);
  });
  it('tops up a stack below the minimum buy-in like a seated rebuy', () => {
    expect(holdemRestoredStack(50, 2000, 1000, 400)).toBe(1050);
    expect(holdemRestoredStack(1500, 2000, 1000, 400)).toBe(1500);
    expect(holdemRestoredStack(1900, 2000, 1000, 2000)).toBe(2000);
  });
  it('gives a busted player a fresh buy-in instead of an unplayable empty seat', () => {
    expect(holdemRestoredStack(0, 2000, 1000)).toBe(1000);
  });
});
