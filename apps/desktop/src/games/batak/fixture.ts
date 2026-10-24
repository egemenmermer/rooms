import type { GamePublicState } from '../../../../../packages/activity-protocol/src';
import type { Card } from '../shared/model';
import { BATAK_RULE_DEFAULTS } from './model';

/**
 * Batak fixture scenes shaped like the server view (`batakView` + the service's table fields), for
 * the view test and the dev fixture page. Names are labelled examples, never production data.
 * Round index = seat number here; the viewer ("self") sits at round 0 unless `spectator`.
 */
export type BatakScene =
  | 'bidding'
  | 'trump'
  | 'your-turn'
  | 'opponent-turn'
  | 'trick-complete'
  | 'round-end'
  | 'spectator'
  | 'gommeli';

const card = (suit: string, rank: number): Card => ({ id: `${suit}-${rank}`, suit, rank });
const people = [
  { userId: 'self', name: 'Ece (demo)' },
  { userId: 'demo-ali', name: 'Ali (demo)' },
  { userId: 'demo-zeynep', name: 'Zeynep (demo)' },
  { userId: 'demo-can', name: 'Can (demo)' },
];
/** The viewer's 12 cards in deal order (unsorted on purpose). */
const ownHand = [
  card('hearts', 3),
  card('spades', 13),
  card('clubs', 11),
  card('hearts', 14),
  card('diamonds', 7),
  card('spades', 4),
  card('clubs', 2),
  card('hearts', 8),
  card('spades', 10),
  card('clubs', 6),
  card('diamonds', 12),
  card('spades', 14),
];

function base(count: number, viewer: string | null): GamePublicState {
  return {
    kind: 'batak',
    ownerId: 'self',
    status: 'playing',
    seats: people.slice(0, count).map((person, seat) => ({
      ...person,
      seat,
      bot: false,
      chips: 0,
      connected: true,
    })),
    turn: 0,
    history: [],
    view: {
      variant: 'ihaleli',
      stage: 'playing',
      turn: 0,
      bid: 7,
      bids: Array(count).fill(0),
      bidder: 0,
      passed: [1, 2, 3].slice(0, count - 1),
      bidLog: [
        { seat: 1, action: 'bid', amount: 5 },
        { seat: 2, action: 'pass' },
        { seat: 3, action: 'bid', amount: 6 },
        { seat: 0, action: 'bid', amount: 7 },
        { seat: 1, action: 'pass' },
        { seat: 3, action: 'pass' },
      ].filter((entry) => entry.seat < count),
      trump: 'spades',
      trumpBroken: false,
      tricks: Array(count).fill(0),
      trick: [],
      scores: [],
      winners: null,
      completedTricks: [],
      hands: Array.from({ length: count }, (_, seat) => ({
        seat,
        cards: viewer === 'self' && seat === 0 ? ownHand : [],
        count: 12,
      })),
      buriedCount: 0,
      buried: [],
      legalActions: [],
      turnDeadline: Date.now() + 30_000,
      capacity: count,
      statistics: {},
    },
  };
}

const firstTrick = {
  plays: [
    { seat: 0, card: card('diamonds', 14) },
    { seat: 1, card: card('diamonds', 3) },
    { seat: 2, card: card('diamonds', 9) },
    { seat: 3, card: card('diamonds', 13) },
  ],
  winner: 0,
};

export function batakFixture(scene: BatakScene): GamePublicState {
  const game = base(scene === 'gommeli' ? 3 : 4, scene === 'spectator' ? null : 'self');
  const view = game.view;
  // `view.rules` is typed for Hold'em; Batak's view carries its own house rules under that key.
  Object.assign(view, { rules: { ...BATAK_RULE_DEFAULTS } });
  if (scene === 'spectator') {
    game.seats = game.seats.map((seat) =>
      seat.userId === 'self' ? { ...seat, userId: 'demo-deniz', name: 'Deniz (demo)' } : seat,
    );
    Object.assign(view, { watching: true, legalActions: [] });
  }
  if (scene === 'bidding') {
    game.turn = 0;
    Object.assign(view, {
      stage: 'bidding',
      bid: 6,
      bidder: 3,
      trump: null,
      passed: [2],
      bidLog: [
        { seat: 1, action: 'bid', amount: 5 },
        { seat: 2, action: 'pass' },
        { seat: 3, action: 'bid', amount: 6 },
      ],
      legalActions: ['bid', 'pass'],
    });
    return game;
  }
  if (scene === 'trump') {
    Object.assign(view, { stage: 'trump', trump: null, legalActions: ['trump'] });
    return game;
  }
  if (scene === 'gommeli') {
    game.turn = 1;
    Object.assign(view, {
      variant: 'gommeli',
      bid: 9,
      bidder: 0,
      turn: 1,
      trick: [{ seat: 0, card: card('hearts', 13) }],
      buried: [card('clubs', 3), card('diamonds', 2), card('diamonds', 4), card('clubs', 5)],
      buriedCount: 4,
    });
    return game;
  }
  // Playing scenes: one completed trick (taken by the viewer), the viewer led again.
  Object.assign(view, {
    completedTricks: [firstTrick],
    tricks: [1, 0, 0, 0],
  });
  if (scene === 'your-turn') {
    // Ali led clubs, Zeynep followed, Can followed: the viewer must follow clubs (and head it).
    game.turn = 0;
    Object.assign(view, {
      turn: 0,
      trick: [
        { seat: 1, card: card('clubs', 9) },
        { seat: 2, card: card('clubs', 4) },
        { seat: 3, card: card('clubs', 10) },
      ],
      legalActions: ['play'],
    });
  } else if (scene === 'opponent-turn' || scene === 'spectator') {
    game.turn = 1;
    Object.assign(view, {
      turn: 1,
      trick: [{ seat: 0, card: card('hearts', 14) }],
      legalActions: [],
    });
  } else if (scene === 'trick-complete') {
    // Can trumped the hearts lead: trump is broken, Can leads next.
    game.turn = 3;
    Object.assign(view, {
      turn: 3,
      trumpBroken: true,
      trick: [],
      tricks: [1, 0, 0, 1],
      completedTricks: [
        firstTrick,
        {
          plays: [
            { seat: 0, card: card('hearts', 14) },
            { seat: 1, card: card('hearts', 5) },
            { seat: 2, card: card('hearts', 2) },
            { seat: 3, card: card('spades', 2) },
          ],
          winner: 3,
        },
      ],
      legalActions: [],
    });
  } else if (scene === 'round-end') {
    game.status = 'finished';
    game.turn = null;
    Object.assign(view, {
      stage: 'ended',
      turn: null,
      trumpBroken: true,
      rules: { ...BATAK_RULE_DEFAULTS, defenderBatakPenalty: true },
      tricks: [6, 3, 0, 4],
      scores: [-7, 3, -7, 4],
      winners: [false, true, true, true],
      hands: Array.from({ length: 4 }, (_, seat) => ({ seat, cards: [], count: 0 })),
      legalActions: ['start'],
    });
    game.history = [
      {
        hand: 1,
        endedAt: 1,
        result: { scores: [8, -6, 2, 3], variant: 'ihaleli', tricks: [8, 0, 2, 3] },
      },
      {
        hand: 2,
        endedAt: 2,
        result: { scores: [-7, 3, -7, 4], variant: 'ihaleli', tricks: [6, 3, 0, 4] },
      },
    ];
  }
  return game;
}
