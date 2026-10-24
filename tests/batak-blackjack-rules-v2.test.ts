import { describe, expect, it } from 'vitest';
import { shuffledDeck, type Card } from '../packages/games/src/cards';
import {
  BATAK_DEFAULT_RULES,
  batakScores,
  batakWinners,
  legalBatakCards,
  type BatakRules,
  type BatakVariant,
} from '../packages/games/src/batak';
import {
  batakAction,
  batakLegalCards,
  batakRoundWinners,
  batakView,
  startBatak,
  type BatakRound,
} from '../packages/games/src/batak-table';
import { blackjackAction, startBlackjack } from '../packages/games/src/blackjack';
import {
  blackjackTableAction,
  blackjackTableView,
  startBlackjackTable,
} from '../packages/games/src/blackjack-table';

const card = (id: string, rank: number, suit: Card['suit'] = 'hearts'): Card => ({
  id,
  rank,
  suit,
});
const filler = () => shuffledDeck(6);

/** A Batak round already in the playing stage with hand-picked hands. */
function playing(
  hands: Card[][],
  options: { trump?: Card['suit']; turn?: number; rules?: Partial<BatakRules> } = {},
): BatakRound {
  const round = startBatak('ihaleli', 3, undefined, options.rules);
  round.hands = hands;
  round.stage = 'playing';
  round.turn = options.turn ?? 0;
  round.trump = options.trump ?? 'spades';
  round.bid = 5;
  round.bidder = 0;
  return round;
}

describe('Batak K1: trump cannot be led until it has been broken', () => {
  const mixed = [card('s9', 9, 'spades'), card('c4', 4, 'clubs'), card('h2', 2, 'hearts')];
  it('blocks trump leads while the hand holds another suit, and allows them once broken', () => {
    expect(legalBatakCards(mixed, [], 'spades', { trumpBroken: false }).map((c) => c.id)).toEqual([
      'c4',
      'h2',
    ]);
    expect(legalBatakCards(mixed, [], 'spades', { trumpBroken: true })).toHaveLength(3);
  });
  it('lets an all-trump hand lead trump', () => {
    const hand = [card('s9', 9, 'spades'), card('sk', 13, 'spades')];
    expect(legalBatakCards(hand, [], 'spades', { trumpBroken: false })).toHaveLength(2);
  });
  it('is a profile flag: off allows any lead', () => {
    expect(
      legalBatakCards(mixed, [], 'spades', {
        trumpBroken: false,
        rules: { noTrumpLeadUntilBroken: false },
      }),
    ).toHaveLength(3);
  });
  it('defaults the three-argument form to the conservative subset of leads', () => {
    expect(legalBatakCards(mixed, [], 'spades').every((c) => c.suit !== 'spades')).toBe(true);
    // Following is untouched by the lead rule.
    const trick = [{ seat: 3, card: card('lead', 10, 'clubs') }];
    expect(legalBatakCards(mixed, trick, 'spades').map((c) => c.id)).toEqual(['c4']);
  });
  it('the engine rejects an early trump lead and publishes the default rules', () => {
    const round = playing([mixed, [card('x', 5, 'clubs')], [card('y', 5, 'clubs')], []]);
    expect(round.rules).toEqual(BATAK_DEFAULT_RULES);
    expect(() => batakAction(round, 0, { action: 'play', cardId: 's9' })).toThrow('ILLEGAL_CARD');
    expect(() => batakAction(round, 0, { action: 'play', cardId: 'c4' })).not.toThrow();
  });
  it('breaks when trump lands on another suit, then the winner may lead trump', () => {
    let round = playing([
      [card('c4', 4, 'clubs'), card('h2', 2, 'hearts')],
      [card('s3', 3, 'spades'), card('s9', 9, 'spades'), card('h7', 7, 'hearts')],
      [card('c5', 5, 'clubs'), card('h3', 3, 'hearts')],
      [card('c6', 6, 'clubs'), card('h4', 4, 'hearts')],
    ]);
    expect(batakView(round, 0).trumpBroken).toBe(false);
    round = batakAction(round, 0, { action: 'play', cardId: 'c4' });
    round = batakAction(round, 1, { action: 'play', cardId: 's3' });
    expect(round.trumpBroken).toBe(true);
    expect(batakView(round, 0).trumpBroken).toBe(true);
    round = batakAction(round, 2, { action: 'play', cardId: 'c5' });
    round = batakAction(round, 3, { action: 'play', cardId: 'c6' });
    expect(round.turn).toBe(1);
    expect(batakLegalCards(round, 1).map((c) => c.id)).toEqual(['s9', 'h7']);
    expect(() => batakAction(round, 1, { action: 'play', cardId: 's9' })).not.toThrow();
  });
  it('does not break trump when trump itself was led', () => {
    let round = playing([
      [card('s2', 2, 'spades'), card('c4', 4, 'clubs')],
      [card('s3', 3, 'spades'), card('c9', 9, 'clubs')],
      [card('s4', 4, 'spades'), card('c3', 3, 'clubs')],
      [card('s5', 5, 'spades'), card('c2', 2, 'clubs')],
    ]);
    round.trumpBroken = true;
    for (const [seat, id] of [
      [0, 's2'],
      [1, 's3'],
      [2, 's4'],
      [3, 's5'],
    ] as const)
      round = batakAction(round, seat, { action: 'play', cardId: id });
    expect(round.turn).toBe(3);
  });
  it('derives trumpBroken for rounds stored before the field existed', () => {
    const round = playing([[card('a', 5, 'clubs')], [], [], []]);
    round.completedTricks = [
      {
        plays: [
          { seat: 0, card: card('p', 5, 'clubs') },
          { seat: 1, card: card('q', 2, 'spades') },
        ],
        winner: 1,
      },
    ];
    delete (round as { trumpBroken?: boolean }).trumpBroken;
    delete (round as { rules?: BatakRules }).rules;
    expect(batakView(round, 0).trumpBroken).toBe(true);
    expect(batakView(round, 0).rules).toEqual(BATAK_DEFAULT_RULES);
  });
  it.each([
    ['ihaleli', true],
    ['esli', true],
    ['koz-maca', true],
    ['gommeli', true],
    ['ihaleli', false],
    ['gommeli', false],
  ] as [BatakVariant, boolean][])(
    'completes random legal playouts for %s (trump rule %s) without stalling',
    (variant, rule) => {
      for (let game = 0; game < 15; game++) {
        let round = startBatak(variant, game % 3, undefined, { noTrumpLeadUntilBroken: rule });
        for (let i = 0; round.stage !== 'ended' && i < 100; i++) {
          const seat = round.turn!;
          if (round.stage === 'bidding') round = batakAction(round, seat, { action: 'pass' });
          else if (round.stage === 'trump')
            round = batakAction(round, seat, { action: 'trump', trump: 'hearts' });
          else if (round.stage === 'bury')
            round = batakAction(round, seat, {
              action: 'bury',
              tileIds: round.hands[seat].slice(0, 4).map((c) => c.id),
            });
          else {
            const legal = batakLegalCards(round, seat);
            expect(legal.length).toBeGreaterThan(0);
            round = batakAction(round, seat, {
              action: 'play',
              cardId: legal[Math.floor(Math.random() * legal.length)].id,
            });
          }
        }
        expect(round.stage).toBe('ended');
        expect(round.hands.every((h) => !h.length)).toBe(true);
      }
    },
  );
});

describe('Batak K3/K4/K5: what the view reveals', () => {
  it('hides the trump suit until the bidder has chosen it, except in Koz Maça', () => {
    let round = startBatak('ihaleli', 0);
    expect(batakView(round, 1).trump).toBeNull();
    round = batakAction(round, 1, { action: 'bid', amount: 6 });
    for (const seat of [2, 3, 0]) round = batakAction(round, seat, { action: 'pass' });
    expect(round.stage).toBe('trump');
    expect(batakView(round, 1).trump).toBeNull();
    round = batakAction(round, 1, { action: 'trump', trump: 'hearts' });
    expect(batakView(round, 1).trump).toBe('hearts');
    expect(batakView(startBatak('koz-maca', 0), 1).trump).toBe('spades');
  });
  it('exposes who passed and a public bid log in table order', () => {
    let round = startBatak('ihaleli', 0);
    round = batakAction(round, 1, { action: 'bid', amount: 5 });
    round = batakAction(round, 2, { action: 'pass' });
    round = batakAction(round, 3, { action: 'bid', amount: 7 });
    const view = batakView(round, 0);
    expect(view.passed).toEqual([2]);
    expect(view.bidLog).toEqual([
      { seat: 1, action: 'bid', amount: 5 },
      { seat: 2, action: 'pass' },
      { seat: 3, action: 'bid', amount: 7 },
    ]);
    const koz = batakAction(startBatak('koz-maca', 0), 1, { action: 'bid', amount: 4 });
    expect(batakView(koz, 0).bidLog).toEqual([{ seat: 1, action: 'bid', amount: 4 }]);
    expect(batakView(koz, 0).passed).toEqual([1]);
  });
  it('shows the Gömmeli bidder their own gömü only after burying, and never to others', () => {
    let round = startBatak('gommeli', 0);
    const pool = round.buried.map((c) => c.id);
    for (const seat of [1, 2]) round = batakAction(round, seat, { action: 'pass' });
    expect(round.stage).toBe('trump');
    // Before the bidder takes the pool it must not leak, even to the bidder.
    expect(batakView(round, round.bidder).buried).toEqual([]);
    round = batakAction(round, round.bidder, { action: 'trump', trump: 'clubs' });
    expect(batakView(round, round.bidder).buried).toEqual([]);
    const bidder = round.bidder,
      ids = round.hands[bidder].slice(0, 4).map((c) => c.id);
    round = batakAction(round, bidder, { action: 'bury', tileIds: ids });
    expect(batakView(round, bidder).buried.map((c) => c.id)).toEqual(ids);
    expect(batakView(round, bidder).buriedCount).toBe(4);
    for (const other of [0, 1, 2].filter((seat) => seat !== bidder)) {
      expect(batakView(round, other).buried).toEqual([]);
      expect(batakView(round, other).buriedCount).toBe(4);
    }
    expect(batakView(round, null).buried).toEqual([]);
    expect(pool).toHaveLength(4);
  });
});

describe('Batak K6: win flags for statistics', () => {
  it('Ihaleli/Gömmeli: the bidder wins by making it, every defender wins by setting it', () => {
    expect(batakWinners('ihaleli', [7, 3, 2, 1], 0, 6)).toEqual([true, false, false, false]);
    expect(batakWinners('ihaleli', [4, 5, 2, 2], 0, 6)).toEqual([false, true, true, true]);
    expect(batakWinners('gommeli', [9, 4, 3], 1, 5)).toEqual([true, false, true]);
  });
  it('Eşli works per team', () => {
    expect(batakWinners('esli', [4, 2, 4, 3], 0, 9)).toEqual([false, true, false, true]);
    expect(batakWinners('esli', [5, 1, 4, 3], 2, 9)).toEqual([true, false, true, false]);
  });
  it('Koz Maça: the best score among seats that made their commitment wins; nobody if none did', () => {
    expect(batakWinners('koz-maca', [5, 4, 3, 1], 0, 0, [4, 4, 4, 1])).toEqual([
      true,
      false,
      false,
      false,
    ]);
    expect(batakWinners('koz-maca', [4, 4, 3, 2], 0, 0, [4, 4, 4, 1])).toEqual([
      true,
      true,
      false,
      false,
    ]);
    expect(batakWinners('koz-maca', [3, 3, 3, 4], 0, 0, [5, 5, 5, 5])).toEqual([
      false,
      false,
      false,
      false,
    ]);
  });
  it('batakRoundWinners reads a finished round', () => {
    const round = playing([[], [], [], []]);
    round.tricks = [4, 5, 2, 2];
    round.bid = 6;
    expect(batakRoundWinners(round)).toEqual([false, true, true, true]);
  });
});

describe('Batak K7: optional scoring variants (both off by default)', () => {
  it('keeps the published scoring when no rules are given', () => {
    expect(batakScores('ihaleli', [7, 0, 4, 2], 0, 6)).toEqual([7, 0, 4, 2]);
    expect(batakScores('esli', [4, 2, 4, 3], 0, 9)).toEqual([-9, 5, -9, 5]);
  });
  it('defender batak: a defender with 0 tricks writes minus the contract', () => {
    const rules = { defenderBatakPenalty: true };
    expect(batakScores('ihaleli', [7, 0, 4, 2], 0, 6, rules)).toEqual([7, -6, 4, 2]);
    expect(batakScores('gommeli', [9, 0, 7], 0, 8, rules)).toEqual([9, -8, 7]);
    // Eşli: only a defending team with no tricks at all is batak.
    expect(batakScores('esli', [7, 0, 6, 0], 0, 8, rules)).toEqual([13, -8, 13, -8]);
    expect(batakScores('esli', [6, 1, 4, 2], 0, 8, rules)).toEqual([10, 3, 10, 3]);
  });
  it('ihale kadar yaz: a successful bidder writes the contract, a failed one still loses it', () => {
    const rules = { writeContract: true };
    expect(batakScores('ihaleli', [9, 2, 1, 1], 0, 6, rules)).toEqual([6, 2, 1, 1]);
    expect(batakScores('ihaleli', [4, 5, 2, 2], 0, 6, rules)).toEqual([-6, 5, 2, 2]);
    expect(batakScores('esli', [5, 2, 4, 2], 0, 8, rules)).toEqual([8, 4, 8, 4]);
  });
  it('is carried by the round and applied when the last trick is played', () => {
    const finish = (rules?: Partial<BatakRules>) => {
      let round = playing(
        [
          [card('a', 14, 'clubs')],
          [card('b', 2, 'clubs')],
          [card('c', 3, 'clubs')],
          [card('d', 4, 'clubs')],
        ],
        { rules },
      );
      round.tricks = [5, 3, 2, 2];
      round.bid = 5;
      for (const [seat, id] of [
        [0, 'a'],
        [1, 'b'],
        [2, 'c'],
        [3, 'd'],
      ] as const)
        round = batakAction(round, seat, { action: 'play', cardId: id });
      return round;
    };
    expect(finish().scores).toEqual([6, 3, 2, 2]);
    expect(finish({ writeContract: true }).scores).toEqual([5, 3, 2, 2]);
  });
});

describe('Blackjack B3: insurance when the dealer shows an ace', () => {
  // Shoe order for one player: player, dealer up, player, dealer hole.
  const aceUp = (hole: number, extra: Card[] = []) => [
    card('p1', 10),
    card('d1', 14, 'spades'),
    card('p2', 9),
    card('d2', hole, 'spades'),
    ...extra,
    ...filler(),
  ];
  const start = (hole: number, credits = 100, rules = {}) =>
    startBlackjackTable([{ userId: 'a', credits, bet: 10 }], aceUp(hole), rules);

  it('opens an insurance prompt before the peek and keeps the hole card hidden', () => {
    const round = start(13);
    expect(round.insurancePending).toBe(true);
    expect(round.finished).toBe(false);
    expect(round.turn).toBe(0);
    const view = blackjackTableView(round);
    expect(view.insurancePending).toBe(true);
    expect(view.dealer).toHaveLength(1);
    expect(view.dealerHiddenCount).toBe(1);
  });
  it('insurance pays 2:1 when the dealer has blackjack, netting the main bet back', () => {
    const round = blackjackTableAction(start(13), 'a', 'insurance');
    expect(round.finished).toBe(true);
    expect(round.players[0].insurance).toBe(5);
    expect(round.players[0].insuranceReturned).toBe(15);
    expect(round.results[0].outcome).toBe('lose');
    expect(round.players[0].credits).toBe(100); // 100 - 10 - 5 + 15
  });
  it('declining loses nothing extra against a dealer blackjack', () => {
    const round = blackjackTableAction(start(13), 'a', 'decline-insurance');
    expect(round.finished).toBe(true);
    expect(round.players[0].credits).toBe(90);
    expect(round.players[0].insurance ?? 0).toBe(0);
  });
  it('the stake is lost when the dealer has no blackjack, and play starts', () => {
    const round = blackjackTableAction(start(6), 'a', 'insurance');
    expect(round.finished).toBe(false);
    expect(round.insurancePending).toBe(false);
    expect(round.players[0].credits).toBe(85);
    expect(round.turn).toBe(0);
    const end = blackjackTableAction(round, 'a', 'stand');
    expect(end.finished).toBe(true);
    expect(end.players[0].insuranceReturned).toBe(0);
  });
  it('rejects plays other than the answer, but hit/stand count as declining (bots, timeouts)', () => {
    const round = start(6);
    expect(() => blackjackTableAction(round, 'a', 'double')).toThrow('INSURANCE_DECISION_REQUIRED');
    expect(() => blackjackTableAction(round, 'a', 'surrender')).toThrow(
      'INSURANCE_DECISION_REQUIRED',
    );
    const stood = blackjackTableAction(round, 'a', 'stand');
    expect(stood.insurancePending).toBe(false);
    expect(stood.players[0].credits).toBe(90);
    expect(stood.finished).toBe(false);
    expect(() => blackjackTableAction(stood, 'a', 'insurance')).toThrow('INSURANCE_UNAVAILABLE');
  });
  it('asks each player in seat order and skips players who cannot afford half a bet', () => {
    const shoe = [
      card('a1', 10),
      card('b1', 10),
      card('c1', 10),
      card('d1', 14, 'spades'),
      card('a2', 9),
      card('b2', 9),
      card('c2', 9),
      card('d2', 6, 'spades'),
      ...filler(),
    ];
    let round = startBlackjackTable(
      [
        { userId: 'a', credits: 100, bet: 10 },
        { userId: 'b', credits: 10, bet: 10 }, // 0 left, cannot insure
        { userId: 'c', credits: 100, bet: 20 },
      ],
      shoe,
    );
    expect(round.turn).toBe(0);
    expect(() => blackjackTableAction(round, 'c', 'insurance')).toThrow('NOT_YOUR_TURN');
    round = blackjackTableAction(round, 'a', 'insurance');
    expect(round.turn).toBe(2);
    round = blackjackTableAction(round, 'c', 'insurance');
    expect(round.players[2].insurance).toBe(10);
    expect(round.insurancePending).toBe(false);
    expect(round.turn).toBe(0);
    expect(round.players[0].credits).toBe(85);
    expect(round.players[1].insurance).toBeUndefined();
  });
  it('can be switched off, and is skipped when nobody can afford it', () => {
    expect(start(13, 100, { insurance: false }).finished).toBe(true);
    const broke = start(13, 10);
    expect(broke.insurancePending).toBeFalsy();
    expect(broke.finished).toBe(true);
  });
  it('a ten showing still peeks immediately without an insurance prompt', () => {
    const round = startBlackjackTable(
      [{ userId: 'a', credits: 100, bet: 10 }],
      [card('p1', 9), card('d1', 13), card('p2', 8), card('d2', 14), ...filler()],
    );
    expect(round.insurancePending).toBeFalsy();
    expect(round.finished).toBe(true);
  });
  it('conserves credits when insurance is mixed with a played-out hand', () => {
    let round = blackjackTableAction(start(7, 100), 'a', 'insurance'); // dealer 18, stake lost
    round = blackjackTableAction(round, 'a', 'stand'); // player 19 beats 18
    expect(round.results[0].outcome).toBe('win');
    expect(round.players[0].credits).toBe(105); // 100 - 10 - 5 + 20
  });
});

describe('Blackjack B3: late surrender is an option (off by default)', () => {
  const shoe = () => [
    card('p1', 10),
    card('d1', 10, 'spades'),
    card('p2', 6),
    card('d2', 7, 'spades'),
    ...filler(),
  ];
  it('is refused unless the table enables it', () => {
    const round = startBlackjackTable([{ userId: 'a', credits: 100, bet: 10 }], shoe());
    expect(() => blackjackTableAction(round, 'a', 'surrender')).toThrow('SURRENDER_UNAVAILABLE');
  });
  it('returns half the bet and the dealer does not draw for a lone surrendered hand', () => {
    const round = blackjackTableAction(
      startBlackjackTable([{ userId: 'a', credits: 100, bet: 10 }], shoe(), { surrender: true }),
      'a',
      'surrender',
    );
    expect(round.finished).toBe(true);
    expect(round.results[0]).toMatchObject({ outcome: 'surrender', returned: 5 });
    expect(round.players[0].credits).toBe(95);
    expect(round.dealer).toHaveLength(2);
  });
  it('is only available on the first decision of an unsplit hand', () => {
    let round = startBlackjackTable([{ userId: 'a', credits: 100, bet: 10 }], shoe(), {
      surrender: true,
    });
    round = blackjackTableAction(round, 'a', 'hit');
    if (!round.finished)
      expect(() => blackjackTableAction(round, 'a', 'surrender')).toThrow('SURRENDER_UNAVAILABLE');
  });
});

describe('Blackjack B5: a split hand gets its second card only when play reaches it', () => {
  const splitShoe = () => [
    card('p1', 8),
    card('d1', 10, 'spades'),
    card('p2', 8, 'spades'),
    card('d2', 7, 'spades'),
    card('x1', 3),
    card('x2', 2),
    card('x3', 5),
    ...filler(),
  ];
  it('table: the moved card waits alone, then receives the next card from the shoe', () => {
    let round = startBlackjackTable([{ userId: 'a', credits: 100, bet: 10 }], splitShoe());
    round = blackjackTableAction(round, 'a', 'split');
    const hands = round.players[0].hands;
    expect(hands[0].cards.map((c) => c.id)).toEqual(['p1', 'x1']);
    expect(hands[1].cards.map((c) => c.id)).toEqual(['p2']);
    expect(blackjackTableView(round).players[0].hands[1].cards).toHaveLength(1);
    round = blackjackTableAction(round, 'a', 'stand');
    expect(round.players[0].activeHand).toBe(1);
    expect(round.players[0].hands[1].cards.map((c) => c.id)).toEqual(['p2', 'x2']);
    expect(round.players[0].hands[1].state).toBe('playing');
    expect(round.finished).toBe(false);
  });
  it('table: split aces still get exactly one card each, the second dealt on reaching it', () => {
    let round = startBlackjackTable(
      [{ userId: 'a', credits: 100, bet: 10 }],
      [
        card('p1', 14),
        card('d1', 9, 'clubs'),
        card('p2', 14, 'spades'),
        card('d2', 8, 'clubs'),
        card('h1', 10),
        card('h2', 10, 'spades'),
        ...filler(),
      ],
    );
    round = blackjackTableAction(round, 'a', 'split');
    expect(round.finished).toBe(true);
    expect(round.players[0].hands.every((h) => h.cards.length === 2)).toBe(true);
    expect(round.results.every((r) => r.outcome === 'win')).toBe(true);
    expect(round.players[0].credits).toBe(120);
  });
  it('single-player: same deferral', () => {
    const state = startBlackjack(100, 10, [
      card('p1', 8),
      card('d1', 10, 'spades'),
      card('p2', 8, 'spades'),
      card('d2', 7, 'spades'),
      card('x1', 3),
      card('x2', 2),
      ...filler(),
    ]);
    const split = blackjackAction(state, 1, 'split');
    expect(split.hands[1].cards.map((c) => c.id)).toEqual(['p2']);
    const next = blackjackAction(split, split.revision, 'stand');
    expect(next.hands[1].cards.map((c) => c.id)).toEqual(['p2', 'x2']);
  });
});

describe('Blackjack B6: the dealer only draws when a contested hand remains', () => {
  const natural = (a: string, b: string) => [card(a, 14), card(b, 13)];
  it('table: stays put when every hand is a natural or bust', () => {
    // Dealer shows 6 with a 5 in the hole (11): would draw if any hand were contested.
    const round = startBlackjackTable(
      [
        { userId: 'a', credits: 100, bet: 10 },
        { userId: 'b', credits: 100, bet: 10 },
      ],
      [
        natural('a1', 'a2')[0],
        natural('b1', 'b2')[0],
        card('d1', 6, 'spades'),
        natural('a1', 'a2')[1],
        natural('b1', 'b2')[1],
        card('d2', 5, 'spades'),
        ...filler(),
      ],
    );
    expect(round.finished).toBe(true);
    expect(round.dealer).toHaveLength(2);
    expect(round.results.map((r) => r.outcome)).toEqual(['blackjack', 'blackjack']);
    expect(round.players.map((p) => p.credits)).toEqual([115, 115]);
  });
  it('table: still plays out when a natural sits beside a live hand', () => {
    let round = startBlackjackTable(
      [
        { userId: 'a', credits: 100, bet: 10 },
        { userId: 'b', credits: 100, bet: 10 },
      ],
      [
        card('a1', 14),
        card('b1', 10),
        card('d1', 6, 'spades'),
        card('a2', 13),
        card('b2', 9),
        card('d2', 5, 'spades'),
        ...filler(),
      ],
    );
    round = blackjackTableAction(round, 'b', 'stand');
    expect(round.dealer.length).toBeGreaterThan(2);
  });
  it('single-player: a natural against a low dealer does not draw', () => {
    const round = startBlackjack(100, 10, [
      card('p1', 14),
      card('d1', 6, 'spades'),
      card('p2', 13),
      card('d2', 5, 'spades'),
      ...filler(),
    ]);
    expect(round.finished).toBe(true);
    expect(round.dealer).toHaveLength(2);
    expect(round.results[0].outcome).toBe('blackjack');
  });
});
