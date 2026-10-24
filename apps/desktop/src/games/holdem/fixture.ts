import type { GamePublicState } from '../../../../../packages/activity-protocol/src';
import type { Card } from '../shared/model';
import type { HoldemLogItem } from './model';

/**
 * Hold'em fixture scenes shaped like the server view (`holdemView` + the service's table fields),
 * for the view test and the dev fixture page. Names are labelled examples, never production data.
 * Hand index = seat number here; the viewer ("self") sits at seat 0 unless `spectator`.
 */
export type HoldemScene = 'your-turn' | 'opponent-turn' | 'showdown' | 'spectator';

const card = (suit: string, rank: number): Card => ({ id: `${suit}-${rank}`, suit, rank });
const people = [
  { userId: 'self', name: 'Ece (demo)' },
  { userId: 'demo-ali', name: 'Ali (demo)' },
  { userId: 'demo-zeynep', name: 'Zeynep (demo)' },
  { userId: 'demo-can', name: 'Can (demo)' },
];
const rules = {
  name: 'Cuma pokeri (demo)',
  capacity: 6,
  smallBlind: 10,
  bigBlind: 20,
  minBuyIn: 200,
  maxBuyIn: 2000,
  initialChips: 1000,
  spectatorsAllowed: true,
};
const entry = (
  street: HoldemLogItem['street'],
  userId: string,
  action: HoldemLogItem['action'],
  amount: number,
  to: number,
  allIn = false,
): HoldemLogItem => ({ street, userId, action, amount, to, allIn });
/** Button on Ali: Zeynep small blind, Can big blind, Ece first to act preflop. */
const preflop = [
  entry('preflop', 'demo-zeynep', 'smallBlind', 10, 10),
  entry('preflop', 'demo-can', 'bigBlind', 20, 20),
  entry('preflop', 'self', 'call', 20, 20),
  entry('preflop', 'demo-ali', 'call', 20, 20),
  entry('preflop', 'demo-zeynep', 'call', 10, 20),
  entry('preflop', 'demo-can', 'check', 0, 20),
];
const board = [card('hearts', 14), card('clubs', 9), card('spades', 4)];

export function holdemFixture(scene: HoldemScene): GamePublicState {
  const viewer = scene === 'spectator' ? null : 'self';
  const seats = people.map((person, seat) => ({
    ...person,
    seat,
    bot: false,
    chips: 980,
    connected: true,
  }));
  const game: GamePublicState = {
    kind: 'holdem',
    ownerId: 'self',
    status: 'playing',
    seats: viewer ? seats : seats.slice(1),
    turn: 0,
    history: [],
    view: {
      rules,
      capacity: 6,
      tableName: rules.name,
      stage: 'flop',
      board,
      button: 1,
      maximumBet: 0,
      minimumRaise: 20,
      legalActions: [],
      payouts: {},
      winners: [],
      mucked: [],
      runoutFrom: null,
      settlementReason: null,
      log: preflop,
      turnDeadline: 4_000_000_000_000,
      watching: viewer === null,
      ownRecovery: viewer
        ? { disconnectedAt: null, takeoverAt: null, pendingReturn: false, takeover: false }
        : null,
      seats: (viewer ? people : people.slice(1)).map((person) => ({
        userId: person.userId,
        chips: 980,
        folded: false,
        streetBet: 0,
        contribution: 20,
        cards: person.userId === viewer ? [card('hearts', 13), card('hearts', 12)] : [],
        hiddenCardCount: person.userId === viewer ? 0 : 2,
      })),
      pots: [
        {
          kind: 'main',
          amount: 80,
          eligible: people.map((person) => person.userId),
          winners: [],
          awards: {},
          split: false,
        },
      ],
    },
  };
  const view = game.view as Record<string, unknown> & typeof game.view;
  const projected = view.seats as Record<string, unknown>[];
  const at = (id: string) => projected.find((seat) => seat.userId === id)!;
  if (scene === 'your-turn') {
    // Zeynep bet 40 and Can called; Ece to act, Ali behind her.
    view.log = [
      ...preflop,
      entry('flop', 'demo-zeynep', 'raise', 40, 40),
      entry('flop', 'demo-can', 'call', 40, 40),
    ];
    view.maximumBet = 40;
    view.minimumRaise = 40;
    Object.assign(at('demo-zeynep'), { streetBet: 40, contribution: 60, chips: 940 });
    Object.assign(at('demo-can'), { streetBet: 40, contribution: 60, chips: 940 });
    view.pots![0].amount = 160;
    view.legalActions = ['fold', 'call', 'raise'];
  }
  if (scene === 'opponent-turn' || scene === 'spectator') {
    // Ece checked, Ali raised to 120; Zeynep to act.
    view.log = [
      ...preflop,
      entry('flop', 'demo-zeynep', 'check', 0, 0),
      entry('flop', 'demo-can', 'check', 0, 0),
      ...(viewer ? [entry('flop', 'self', 'check', 0, 0)] : []),
      entry('flop', 'demo-ali', 'raise', 120, 120),
    ];
    view.maximumBet = 120;
    view.minimumRaise = 120;
    Object.assign(at('demo-ali'), { streetBet: 120, contribution: 140, chips: 860 });
    view.pots![0].amount = viewer ? 200 : 180;
    game.turn = 2;
  }
  if (scene === 'showdown') {
    // Can went all-in short on the river: a main pot for all three, a side pot Ece and Ali share.
    game.status = 'finished';
    game.turn = null;
    view.stage = 'ended';
    view.turnDeadline = 0;
    view.legalActions = ['start'];
    view.board = [...board, card('diamonds', 14), card('clubs', 2)];
    view.settlementReason = 'showdown';
    view.mucked = ['demo-ali'];
    view.log = [
      ...preflop,
      entry('flop', 'demo-zeynep', 'fold', 0, 0),
      entry('river', 'self', 'raise', 300, 300),
      entry('river', 'demo-ali', 'call', 300, 300),
      entry('river', 'demo-can', 'call', 160, 160, true),
    ];
    Object.assign(at('demo-zeynep'), { folded: true });
    Object.assign(at('self'), { contribution: 320, chips: 1340 });
    Object.assign(at('demo-ali'), { contribution: 320, chips: 660 });
    Object.assign(at('demo-can'), {
      contribution: 180,
      chips: 0,
      cards: [card('spades', 9), card('diamonds', 9)],
      hiddenCardCount: 0,
    });
    seats[0].chips = 1340;
    seats[1].chips = 660;
    seats[3].chips = 0;
    view.payouts = { self: 840 };
    view.winners = ['self'];
    view.showdown = {
      self: {
        category: 'three-of-a-kind',
        score: [3, 14],
        bestFiveCardIds: ['hearts-14', 'diamonds-14', 'hearts-13', 'hearts-12', 'clubs-9'],
      },
      'demo-can': {
        category: 'three-of-a-kind',
        score: [3, 9],
        bestFiveCardIds: ['spades-9', 'diamonds-9', 'clubs-9', 'hearts-14', 'diamonds-14'],
      },
    } as unknown as GamePublicState['view']['showdown'];
    view.pots = [
      {
        kind: 'main',
        amount: 560,
        eligible: ['self', 'demo-ali', 'demo-can'],
        winners: ['self'],
        awards: { self: 560 },
        split: false,
      },
      {
        kind: 'side',
        amount: 280,
        eligible: ['self', 'demo-ali'],
        winners: ['self'],
        awards: { self: 280 },
        split: false,
      },
    ];
    game.history = [
      {
        hand: 1,
        endedAt: 1,
        result: { payouts: view.payouts, actions: view.log, mucked: view.mucked },
      },
    ];
  }
  return game;
}
