import type { GamePublicState } from '../../../../../packages/activity-protocol/src';
import type { Card } from '../shared/model';
import type { BlackjackHandView, BlackjackPlayerView } from './model';

/**
 * Blackjack fixture scenes shaped like the server view (`blackjackTableView` + `gameView`), for
 * the view test and the dev fixture page. Names are labelled examples, never production data.
 */
export type BlackjackScene =
  | 'your-turn'
  | 'opponent-turn'
  | 'opponent-hit'
  | 'insurance'
  | 'insurance-decline-only'
  | 'insurance-other'
  | 'round-end'
  | 'spectator';

const card = (suit: string, rank: number): Card => ({ id: `${suit}-${rank}-0`, suit, rank });
const hand = (
  cards: Card[],
  state: string,
  extra: Partial<BlackjackHandView> = {},
): BlackjackHandView => ({ cards, bet: 100, state, split: false, ...extra });
const player = (
  userId: string,
  hands: BlackjackHandView[],
  extra: Partial<BlackjackPlayerView> = {},
): BlackjackPlayerView => ({ userId, credits: 900, hands, activeHand: 0, bet: 100, ...extra });

/** Ali plays first (seat 0), Ece is the viewer (seat 1), Zeynep last (seat 2). */
export function blackjackFixture(scene: BlackjackScene): GamePublicState {
  const watcher = scene === 'spectator';
  const people = [
    { userId: 'demo-ali', name: 'Ali (demo)' },
    watcher ? { userId: 'demo-can', name: 'Can (demo)' } : { userId: 'self', name: 'Ece (demo)' },
    { userId: 'demo-zeynep', name: 'Zeynep (demo)' },
  ];
  const middle = people[1].userId;
  const insurance = scene.startsWith('insurance');
  const finished = scene === 'round-end';
  // Ece split eights: the first hand stood on 18, the second (8 + A) is being played.
  const split = [
    hand([card('clubs', 8), card('diamonds', 10)], 'stood', { split: true }),
    hand(
      [card('diamonds', 8), card('spades', 14)],
      scene === 'your-turn' || scene === 'spectator' ? 'playing' : 'stood',
      { split: true },
    ),
  ];
  const zeynep =
    scene === 'opponent-hit' || finished
      ? [
          hand(
            [card('hearts', 14), card('clubs', 6), card('diamonds', 2)],
            finished ? 'stood' : 'playing',
          ),
        ]
      : [hand([card('hearts', 14), card('clubs', 6)], 'playing')];
  const list: BlackjackPlayerView[] = insurance
    ? [
        player('demo-ali', [hand([card('spades', 10), card('hearts', 6)], 'playing')], {
          insuranceDecided: scene !== 'insurance-other',
          insurance: 0,
        }),
        player(middle, [hand([card('clubs', 10), card('hearts', 9)], 'playing')], {
          credits: scene === 'insurance-decline-only' ? 20 : 900,
        }),
        player('demo-zeynep', [hand([card('hearts', 14), card('clubs', 6)], 'playing')]),
      ]
    : [
        player('demo-ali', [
          hand([card('spades', 10), card('hearts', 6), card('clubs', 9)], 'bust'),
        ]),
        player(middle, split, {
          credits: 800,
          activeHand: scene === 'your-turn' || scene === 'spectator' ? 1 : 2,
        }),
        player('demo-zeynep', zeynep),
      ];
  const viewTurn = finished
    ? null
    : insurance
      ? scene === 'insurance-other'
        ? 0
        : 1
      : scene === 'your-turn' || scene === 'spectator'
        ? 1
        : 2;
  const legalActions =
    watcher || finished
      ? finished
        ? ['start']
        : []
      : scene === 'your-turn'
        ? ['hit', 'stand', 'double']
        : scene === 'insurance'
          ? ['insurance', 'decline-insurance']
          : scene === 'insurance-decline-only'
            ? ['decline-insurance']
            : [];
  const results = finished
    ? [
        { userId: 'demo-ali', hand: 0, outcome: 'lose', returned: 0 },
        { userId: middle, hand: 0, outcome: 'win', returned: 200 },
        { userId: middle, hand: 1, outcome: 'win', returned: 200 },
        { userId: 'demo-zeynep', hand: 0, outcome: 'win', returned: 200 },
      ]
    : [];
  // `view.rules` is typed as Hold'em's table rules; Blackjack sends its own switches there.
  return {
    kind: 'blackjack',
    ownerId: watcher ? 'demo-ali' : 'self',
    status: finished ? 'finished' : 'playing',
    seats: people.map((person, seat) => ({
      ...person,
      seat,
      bot: false,
      chips: list[seat].credits,
      connected: true,
    })),
    turn: viewTurn,
    history: finished ? [{ hand: 1, endedAt: Date.now(), result: { results, players: [] } }] : [],
    view: {
      revision: 7,
      dealer: finished
        ? [card('hearts', 9), card('clubs', 8)]
        : insurance
          ? [card('spades', 14)]
          : [card('hearts', 9)],
      dealerHiddenCount: finished ? 0 : 1,
      players: list,
      turn: viewTurn,
      insurancePending: insurance,
      rules: { insurance: true, surrender: false },
      finished,
      results,
      legalActions,
      turnDeadline: finished ? 0 : Date.now() + 30_000,
      capacity: 7,
      watching: watcher,
      spectatorAccess: true,
      spectators: watcher ? [{ userId: 'self', name: 'Ece (demo)' }] : [],
      statistics: {},
      ownRecovery: null,
    },
  } as unknown as GamePublicState;
}
