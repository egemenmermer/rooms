import type { DesktopBridge } from '@rooms/contracts';
import type {
  ActivityResponse,
  GamePublicState,
  Poll,
  RoomSnapshot,
  BoardElement,
} from '@rooms/activity-protocol';
import { installDevelopmentRuntime, mediaBridge, mediaProvider } from '../runtime-sources';
import { installMediaFixture } from './media-fixture';

export const GAME_FIXTURE_LABEL = 'DEMO · Yerel oyun/anket/tahta örneği';
export const GAME_FIXTURE_ROOM = 'demo-channel-salon';
const self = 'demo-deniz',
  epoch = Date.UTC(2026, 9, 10, 18, 47);
const people = [
  { userId: self, name: 'Deniz' },
  { userId: 'demo-ece', name: 'Ece' },
  { userId: 'demo-can', name: 'Can' },
  { userId: 'demo-zeynep', name: 'Zeynep' },
  { userId: 'demo-mert', name: 'Mert' },
];
/** Exact inventory keys. Responsive keys describe viewport evidence, not a game command. */
export const gameFixtureVariants = {
  S40: ['default', 'empty', 'error', 'loading', 'offline'],
  S41: [
    'default',
    'activity_conflict',
    'blackjack',
    'bot_added',
    'full',
    'not_owner',
    'seated',
    'spectator',
  ],
  S42: [
    'default',
    'full_table',
    'heads_up',
    'not_turn',
    'spectator',
    '1280x800',
    '900x700',
    '1920x1080',
  ],
  S43: [
    'default',
    'all_in',
    'buy_in',
    'check',
    'fold',
    'raise',
    'raise_result',
    'raised',
    'showdown',
    'sidepot',
    'split',
  ],
  S44: [
    'default',
    'blackjack',
    'bust',
    'double',
    'hit',
    'pair',
    'result',
    'rules',
    'split',
    'split_double',
    'split_double_resolved_double',
    'split_double_resolved_hit',
    'split_double_resolved_stand',
    'split_played',
    'split_played_resolved_double',
    'split_played_resolved_hit',
    'split_played_resolved_stand',
    'split_second',
    'split_second_resolved_double',
    'split_second_resolved_hit',
    'split_second_resolved_stand',
    'stand',
  ],
  S45: ['default', 'buried', 'pairs', 'rules', 'spades'],
  S46: [
    'default',
    'buried',
    'buried_bid',
    'buried_trump',
    'pairs',
    'pairs_trump',
    'spades',
    'trump',
  ],
  S47: [
    'default',
    'buried',
    'buried_played',
    'ece_bid',
    'game_end',
    'pairs',
    'pairs_result',
    'played',
    'round_end',
    'spades',
  ],
  S48: ['default', 'folded', 'folded_pairs', 'pairs', 'rules'],
  S49: [
    'default',
    'drawn',
    'drawn_folded',
    'drawn_pairs',
    'folded',
    'folded_pairs',
    'pairs',
    'spectator',
    '1280x800',
    '900x700',
    '1920x1080',
  ],
  S50: [
    'default',
    'add',
    'add_done',
    'discarded',
    'doubles',
    'doubles_opened',
    'finish',
    'folded_invalid',
    'invalid',
    'opened',
    'penalty',
    'result',
  ],
  S51: ['default', 'batak', 'blackjack', 'empty', 'error', 'holdem', 'loading', 'okey'],
  S52: ['default', 'bot', 'offline', 'reclaimed', 'return', 'timeout'],
  S53: [
    'default',
    'changed',
    'close_confirm',
    'closed',
    'create',
    'empty',
    'first_vote',
    'not_owner',
    'offline',
    'voted_batak',
  ],
  S54: ['default', 'empty', 'export', 'read_only', 'reconnect', 'saved', 'undo'],
} as const;
export type GameFixtureId = keyof typeof gameFixtureVariants;
export interface GamesFixtureMetadata {
  id: GameFixtureId;
  variant: string;
  demo: true;
  label: typeof GAME_FIXTURE_LABEL;
  route: '/games' | '/games?tab=history' | '/together' | '/together?tab=board';
  status: 'connected' | 'loading' | 'error';
  error: string | null;
  /** Internal integration intent only; never a pretend command response or service event. */
  ui: {
    create: GamePublicState['kind'] | null;
    variant: 'ihaleli' | 'esli' | 'koz-maca' | 'gommeli';
    folding: boolean;
    teams: boolean;
    modal:
      | null
      | 'rules'
      | 'raise'
      | 'buy-in'
      | 'history-detail'
      | 'recovery'
      | 'poll-create'
      | 'poll-close'
      | 'board-export';
    historyKind: GamePublicState['kind'] | null;
    buyInSeat: number | null;
    amount: number | null;
    selectedTileIds: string[];
    groups: string[][];
    pairs: boolean;
    targetMeld: number | null;
    boardTool: 'select' | 'pen';
    readOnly: boolean;
    undoElementId: string | null;
  };
  pendingIntegration: string[];
  unsupportedReason: string | null;
}
function normalize(id: string, value: string): { id: GameFixtureId; variant: string } {
  const key = id
    .trim()
    .toUpperCase()
    .replace(/^S?(\d{2})$/, 'S$1');
  if (!(key in gameFixtureVariants)) throw new Error(`Unsupported game fixture screen: ${id}`);
  const variant = value.trim().toLowerCase() || 'default';
  if (!(gameFixtureVariants[key as GameFixtureId] as readonly string[]).includes(variant))
    throw new Error(`Unsupported ${key} game fixture variant: ${value}`);
  return { id: key as GameFixtureId, variant };
}
export function getGamesFixtureMetadata(id: string, value = 'default'): GamesFixtureMetadata {
  const selected = normalize(id, value),
    { id: screen, variant: v } = selected;
  const result: GamesFixtureMetadata = {
    ...selected,
    demo: true,
    label: GAME_FIXTURE_LABEL,
    route:
      screen === 'S51'
        ? '/games?tab=history'
        : screen === 'S53'
          ? '/together'
          : screen === 'S54'
            ? '/together?tab=board'
            : '/games',
    status:
      v === 'loading'
        ? 'loading'
        : ['error', 'offline', 'reconnect'].includes(v)
          ? 'error'
          : 'connected',
    error: ['error', 'offline', 'reconnect'].includes(v)
      ? 'DEMO · Yerel bağlantı durumu örneği; sunucuya bağlanılmadı.'
      : null,
    ui: {
      create: null,
      variant: v.includes('buried')
        ? 'gommeli'
        : v.includes('pairs')
          ? 'esli'
          : v === 'spades'
            ? 'koz-maca'
            : 'ihaleli',
      folding: v.includes('folded'),
      teams: v.includes('pairs'),
      modal: null,
      historyKind: null,
      buyInSeat: null,
      amount: null,
      selectedTileIds: [],
      groups: [],
      pairs: false,
      targetMeld: null,
      boardTool: 'select',
      readOnly: v === 'read_only',
      undoElementId: null,
    },
    pendingIntegration: [],
    unsupportedReason: null,
  };
  const ui = result.ui;
  if (screen === 'S45' || screen === 'S48') {
    ui.create = screen === 'S45' ? 'batak' : '101';
    if (v === 'rules') ui.modal = 'rules';
  }
  if (screen === 'S43' && v === 'raise') {
    ui.modal = 'raise';
    ui.amount = 160;
  }
  if (screen === 'S43' && v === 'buy_in') {
    ui.modal = 'buy-in';
    ui.buyInSeat = 4;
    ui.amount = 1000;
  }
  if (['S44', 'S48', 'S45'].includes(screen) && v === 'rules') ui.modal = 'rules';
  if (screen === 'S51' && ['holdem', 'blackjack', 'batak', 'okey'].includes(v)) {
    ui.modal = 'history-detail';
    ui.historyKind = v === 'okey' ? '101' : (v as GamePublicState['kind']);
  }
  if (screen === 'S52' && ['default', 'offline'].includes(v)) ui.modal = 'recovery';
  if (screen === 'S53' && v === 'create') ui.modal = 'poll-create';
  if (screen === 'S53' && v === 'close_confirm') ui.modal = 'poll-close';
  if (screen === 'S54' && v === 'export') ui.modal = 'board-export';
  if (screen === 'S54' && v === 'undo') {
    ui.boardTool = 'pen';
    ui.undoElementId = 'demo-board-own-underline';
  }
  if (
    screen === 'S50' &&
    ['default', 'invalid', 'folded_invalid', 'doubles', 'add', 'finish'].includes(v)
  ) {
    ui.pairs = v === 'doubles';
    ui.targetMeld = v === 'add' ? 0 : null;
    ui.selectedTileIds = v === 'add' ? ['demo-blue-9-0'] : v === 'finish' ? ['demo-red-12-0'] : [];
    ui.groups =
      v === 'doubles'
        ? Array.from({ length: 5 }, (_, i) => [`demo-red-${i + 1}-0`, `demo-red-${i + 1}-1`])
        : v === 'finish' || v === 'add'
          ? []
          : [
              ['demo-red-10-0', 'demo-red-11-0', 'demo-red-12-0'],
              ['demo-blue-10-0', 'demo-blue-11-0', 'demo-blue-12-0'],
              ['demo-red-13-0', 'demo-blue-13-0', 'demo-yellow-13-0'],
            ];
  }
  if (screen === 'S50' && ['default', 'folded_invalid'].includes(v)) {
    ui.groups[1] = ['demo-blue-11-0', 'demo-blue-12-0', 'demo-blue-13-0'];
    ui.groups[2] = ['demo-red-11-1', 'demo-blue-11-1', 'demo-yellow-11-0'];
  }
  if (screen === 'S50' && v === 'invalid')
    ui.groups[2] = ['demo-red-11-1', 'demo-blue-11-1', 'demo-yellow-11-0'];
  if (screen === 'S50' && v === 'finish') ui.targetMeld = 2;
  if (result.status !== 'connected') result.pendingIntegration.push('initial-activity-status');
  if (
    ui.modal ||
    ui.create ||
    ui.groups.length ||
    ui.selectedTileIds.length ||
    ui.undoElementId ||
    ui.readOnly
  )
    result.pendingIntegration.push('initial-component-ui');
  if (screen === 'S50' && v === 'penalty')
    result.unsupportedReason =
      'Actual penalty-event projection is not implemented; cannot invent a recorded penalty.';

  if (screen === 'S54' && v === 'saved')
    result.unsupportedReason =
      'Named saved-board archive/title capability is not implemented; current snapshot persistence does not acknowledge archive save.';
  return result;
}

type DemoCard = { id: string; suit: 'clubs' | 'diamonds' | 'hearts' | 'spades'; rank: number };
const card = (rank: number, suit: DemoCard['suit'], copy = 0): DemoCard => ({
  id: `demo-${copy}-${suit}-${rank}`,
  rank,
  suit,
});
function demoTotal(cards: DemoCard[]) {
  let total = cards.reduce((sum, c) => sum + (c.rank === 14 ? 11 : Math.min(c.rank, 10)), 0),
    aces = cards.filter((c) => c.rank === 14).length;
  while (total > 21 && aces-- > 0) total -= 10;
  return total;
}
const ownCards = [card(14, 'spades'), card(14, 'hearts')];
const communityCards = [card(2, 'hearts'), card(7, 'clubs'), card(9, 'diamonds')];
const seats = (count: number) =>
  Array.from({ length: count }, (_, seat) => ({
    ...people[seat % people.length],
    userId: seat < people.length ? people[seat].userId : `demo-bot-${seat}`,
    name: seat < people.length ? people[seat].name : `Bot ${seat + 1}`,
    seat,
    bot: seat >= people.length,
    chips: 1100,
    connected: true,
  }));
const rules = {
  name: 'Akşam eli',
  capacity: 6,
  smallBlind: 10,
  bigBlind: 20,
  minBuyIn: 200,
  maxBuyIn: 2000,
  initialChips: 1000,
  spectatorsAllowed: true,
};
function baseGame(kind: GamePublicState['kind'], count = 4): GamePublicState {
  return {
    kind,
    ownerId: self,
    status: 'playing',
    seats: seats(count),
    turn: 0,
    history: [],
    view: {
      capacity: count,
      tableName:
        kind === 'holdem'
          ? 'Akşam eli'
          : kind === '101'
            ? 'Son bir el'
            : kind === 'batak'
              ? 'Salon Batak'
              : 'Bir el daha',
      legalActions: [],
      turnDeadline: epoch + 40_000,
      statistics: { [self]: { hands: 0, wins: 0, score: 0 } },
      watching: false,
      spectatorAccess: true,
      spectators: [],
      ownRecovery: {
        disconnectedAt: null,
        takeoverAt: null,
        pendingReturn: false,
        takeover: false,
      },
    },
  };
}
function holdem(v: string): GamePublicState {
  const count = v === 'heads_up' ? 2 : v === 'full_table' ? 9 : 4,
    game = baseGame('holdem', count),
    view = game.view;
  view.rules = { ...rules, capacity: v === 'full_table' ? 9 : 6 };
  view.capacity = view.rules.capacity;
  view.stage = 'flop';
  view.board = communityCards;
  view.maximumBet = 120;
  view.minimumRaise = 80;
  view.button = 1;
  view.legalActions = ['fold', 'call', 'raise'];
  view.payouts = {};
  view.winners = [];
  view.seats = game.seats.map((seat) => ({
    userId: seat.userId,
    chips: seat.chips,
    folded: false,
    streetBet: seat.seat === 0 ? 40 : 120,
    contribution: seat.seat === 0 ? 40 : 120,
    cards: seat.userId === self ? ownCards : [],
    hiddenCardCount: seat.userId === self ? 0 : 2,
  }));
  view.pots = [
    {
      kind: 'main',
      amount: 40 + (count - 1) * 120,
      eligible: game.seats.map((seat) => seat.userId),
      winners: [],
      awards: {},
      split: false,
    },
  ];
  if (v === 'check') {
    view.maximumBet = 0;
    view.minimumRaise = 20;
    view.legalActions = ['fold', 'check', 'raise'];
    view.seats = (view.seats as Record<string, unknown>[]).map((seat) => ({
      ...seat,
      streetBet: 0,
    }));
  }
  if (['raised', 'raise_result'].includes(v)) {
    view.maximumBet = 280;
    view.minimumRaise = 160;
    game.turn = 1;
    view.legalActions = [];
    view.seats = (view.seats as Record<string, unknown>[]).map((seat) =>
      seat.userId === self ? { ...seat, chips: 860, streetBet: 280, contribution: 280 } : seat,
    );
    view.pots[0].amount = 280 + (count - 1) * 120;
  }
  if (v === 'all_in') {
    view.seats = (view.seats as Record<string, unknown>[]).map((seat) =>
      seat.userId === self ? { ...seat, chips: 0, streetBet: 1140, contribution: 1140 } : seat,
    );
    game.seats[0].chips = 0;
    view.maximumBet = 1140;
    view.pots[0].amount = 1140 + (count - 1) * 120;
    game.turn = 1;
    view.legalActions = [];
  }
  if (v === 'not_turn') {
    game.turn = 1;
    view.legalActions = [];
  }
  if (v === 'spectator' || v === 'buy_in') {
    game.seats = game.seats.filter((seat) => seat.userId !== self);
    view.seats = (view.seats as Record<string, unknown>[]).filter((seat) => seat.userId !== self);
    view.watching = true;
    view.legalActions = [];
    view.ownRecovery = null;
  }
  if (v === 'fold') {
    (view.seats as Record<string, unknown>[])[0] = {
      ...(view.seats as Record<string, unknown>[])[0],
      folded: true,
    };
    game.turn = 1;
    view.legalActions = [];
  }
  if (['showdown', 'sidepot', 'split'].includes(v)) {
    game.status = 'finished';
    game.turn = null;
    view.stage = 'ended';
    view.turnDeadline = 0;
    view.legalActions = ['start'];
    view.board = [
      card(9, 'clubs'),
      card(10, 'hearts'),
      card(11, 'diamonds'),
      card(12, 'spades'),
      card(13, 'clubs'),
    ];
    view.settlementReason = 'showdown';
    const ids = game.seats.map((seat) => seat.userId),
      split = v === 'split';
    view.payouts = split ? { [self]: 200, 'demo-ece': 200 } : { [self]: 400 };
    view.winners = split ? [self, 'demo-ece'] : [self];
    view.showdown = {
      [self]: {
        category: 'straight',
        score: [4, 14],
        bestFiveCardIds: [ownCards[0].id, ...(view.board as DemoCard[]).slice(1).map((c) => c.id)],
      },
      'demo-ece': {
        category: 'straight',
        score: [4, 13],
        bestFiveCardIds: (view.board as DemoCard[]).map((c) => c.id),
      },
    };
    if (split) {
      view.showdown[self] = {
        category: 'straight',
        score: [4, 13],
        bestFiveCardIds: (view.board as DemoCard[]).map((c) => c.id),
      };
    }
    view.seats = (view.seats as Record<string, unknown>[]).map((seat, index) => ({
      ...seat,
      folded: index > 1,
      cards:
        index === 0
          ? split
            ? [card(3, 'spades'), card(5, 'hearts')]
            : ownCards
          : index === 1
            ? [card(3, 'diamonds'), card(5, 'clubs')]
            : [],
      hiddenCardCount: index > 1 ? 2 : 0,
    }));
    view.pots = split
      ? [
          {
            kind: 'main',
            amount: 400,
            eligible: ids.slice(0, 2),
            winners: ids.slice(0, 2),
            awards: { [self]: 200, 'demo-ece': 200 },
            split: true,
          },
        ]
      : [
          {
            kind: 'main',
            amount: 400,
            eligible: ids.slice(0, 2),
            winners: [self],
            awards: { [self]: 400 },
            split: false,
          },
        ];
    if (v === 'sidepot') {
      view.board = [...communityCards, card(4, 'spades'), card(11, 'diamonds')];
      const revealed = [
        ownCards,
        [card(13, 'spades'), card(13, 'diamonds')],
        [card(12, 'hearts'), card(12, 'clubs')],
      ];
      view.seats = (view.seats as Record<string, unknown>[]).map((seat, index) => ({
        ...seat,
        folded: index > 2,
        cards: index < 3 ? revealed[index] : [],
        hiddenCardCount: index > 2 ? 2 : 0,
      }));
      view.showdown = Object.fromEntries(
        ids
          .slice(0, 3)
          .map((id, index) => [
            id,
            {
              category: 'one-pair' as const,
              score: [1, 14 - index, 11, 9, 7],
              bestFiveCardIds: [
                ...revealed[index].map((c) => c.id),
                ...(view.board as DemoCard[])
                  .filter((c) => [11, 9, 7].includes(c.rank))
                  .map((c) => c.id),
              ],
            },
          ]),
      );
      view.payouts = { [self]: 400, 'demo-ece': 200 };
      view.pots = [
        {
          kind: 'main',
          amount: 400,
          eligible: ids.slice(0, 3),
          winners: [self],
          awards: { [self]: 400 },
          split: false,
        },
        {
          kind: 'side',
          amount: 200,
          eligible: ['demo-ece', 'demo-can'],
          winners: ['demo-ece'],
          awards: { 'demo-ece': 200 },
          split: false,
        },
      ];
    }
    game.history = [
      {
        hand: 1,
        endedAt: epoch - 60_000,
        result: {
          payouts: view.payouts,
          board: view.board,
          pots: view.pots,
          settlementReason: view.settlementReason,
          showdown: view.showdown,
        },
      },
    ];
    view.statistics = { [self]: { hands: 1, wins: 1, score: 0 } };
  }
  return game;
}
function blackjack(v: string): GamePublicState {
  const game = baseGame('blackjack', 3),
    split = v.startsWith('split'),
    pair = v === 'pair' || split;
  let cards = pair
    ? [card(8, 'clubs'), card(8, 'diamonds')]
    : [card(10, 'spades'), card(6, 'hearts')];
  if (['hit', 'bust'].includes(v)) cards = [...cards, card(v === 'bust' ? 10 : 3, 'diamonds')];
  if (v === 'double') cards = [...cards, card(3, 'diamonds')];
  if (v === 'blackjack') cards = [card(14, 'spades'), card(13, 'hearts')];
  const doubled = v === 'double' || v.includes('double'),
    ended =
      ['result', 'blackjack', 'bust', 'double', 'stand'].includes(v) || v.includes('resolved');
  const hands = split
    ? [
        {
          cards: [card(8, 'clubs'), card(3, 'hearts')],
          bet: 100,
          state:
            ended || v.includes('played') || v.includes('second') || v.includes('double')
              ? 'stood'
              : 'playing',
          split: true,
        },
        {
          cards: [card(8, 'diamonds'), card(10, 'clubs')],
          bet: v.includes('double') ? 200 : 100,
          state: ended ? 'stood' : 'playing',
          split: true,
        },
      ]
    : [
        {
          cards,
          bet: doubled ? 200 : 100,
          state: v === 'bust' ? 'bust' : ended ? 'stood' : 'playing',
          split: false,
        },
      ];
  const results = ended
    ? hands.map((hand, index) => {
        const total = demoTotal(hand.cards),
          outcome =
            total > 21 || total < 17
              ? 'lose'
              : total === 17
                ? 'push'
                : total === 21 && hand.cards.length === 2 && !hand.split
                  ? 'blackjack'
                  : 'win';
        return {
          userId: self,
          hand: index,
          outcome,
          returned:
            outcome === 'lose'
              ? 0
              : outcome === 'push'
                ? hand.bet
                : outcome === 'blackjack'
                  ? hand.bet * 2.5
                  : hand.bet * 2,
        };
      })
    : [];
  const credits =
    1000 -
    hands.reduce((sum, hand) => sum + hand.bet, 0) +
    results.reduce((sum, item) => sum + item.returned, 0);
  game.seats[0].chips = credits;
  game.status = ended ? 'finished' : 'playing';
  game.turn = ended ? null : 0;
  game.view = {
    ...game.view,
    dealer: ended ? [card(10, 'hearts'), card(7, 'spades')] : [card(10, 'hearts')],
    dealerHiddenCount: ended ? 0 : 1,
    players: [
      {
        userId: self,
        credits,
        hands,
        activeHand: split && (v.includes('second') || v.includes('played')) ? 1 : 0,
        bet: 100,
      },
      ...game.seats
        .slice(1)
        .map((seat) => ({
          userId: seat.userId,
          credits: 1000,
          hands: [],
          activeHand: 0,
          bet: 100,
        })),
    ],
    finished: ended,
    results,
    legalActions: ended
      ? ['start']
      : pair
        ? ['hit', 'stand', 'double', 'split']
        : ['hit', 'stand', 'double'],
  };
  if (ended) {
    game.history = [{ hand: 1, endedAt: epoch - 60_000, result: { results } }];
    game.view.statistics = { [self]: { hands: 1, wins: v === 'bust' ? 0 : 1, score: 0 } };
  }
  return game;
}
function batak(screen: GameFixtureId, v: string): GamePublicState {
  const buried = v.includes('buried'),
    variant = buried
      ? 'gommeli'
      : v.includes('pairs')
        ? 'esli'
        : v === 'spades'
          ? 'koz-maca'
          : 'ihaleli',
    count = buried ? 3 : 4,
    game = baseGame('batak', count);
  const bidding = screen === 'S46' && !v.includes('trump') && v !== 'buried',
    bury = screen === 'S46' && v === 'buried',
    trump = screen === 'S46' && v.includes('trump');
  const own = [
    card(14, 'hearts'),
    card(8, 'hearts'),
    card(3, 'hearts'),
    card(13, 'spades'),
    card(11, 'clubs'),
    card(10, 'spades'),
    card(7, 'diamonds'),
    card(6, 'clubs'),
    card(4, 'spades'),
    card(2, 'clubs'),
  ];
  if (bidding || trump) {
    own.push(card(12, 'clubs'), card(9, 'clubs'), card(5, 'diamonds'));
    if (buried) own.push(card(14, 'clubs'), card(12, 'diamonds'), card(6, 'spades'));
  }
  if (bury)
    own.push(
      card(12, 'clubs'),
      card(9, 'clubs'),
      card(5, 'diamonds'),
      card(14, 'spades'),
      card(12, 'hearts'),
      card(11, 'diamonds'),
      card(10, 'clubs'),
      card(9, 'diamonds'),
      card(5, 'spades'),
      card(2, 'diamonds'),
    );
  const ended = ['round_end', 'pairs_result', 'game_end'].includes(v),
    played = v.includes('played'),
    scores = ended ? [70, 20, 10, ...(count === 4 ? [30] : [])] : [];
  game.status = ended ? 'finished' : 'playing';
  game.turn = ended ? null : v === 'ece_bid' || played ? 1 : 0;
  game.view = {
    ...game.view,
    variant,
    stage: ended ? 'ended' : bidding ? 'bidding' : bury ? 'bury' : trump ? 'trump' : 'playing',
    bid: bidding ? 0 : variant === 'esli' || buried ? 8 : 7,
    bids: bidding ? Array(count).fill(0) : [7, 0, 0, ...(count === 4 ? [0] : [])],
    bidder: 0,
    trump: 'spades',
    tricks: ended ? [7, 2, 1, ...(count === 4 ? [3] : [])] : [1, 1, 1, ...(count === 4 ? [0] : [])],
    trick:
      ended || bidding || bury || trump
        ? []
        : [
            { seat: 1, card: card(13, 'hearts') },
            { seat: 2, card: card(7, 'hearts') },
            ...(count === 4 ? [{ seat: 3, card: card(11, 'hearts') }] : []),
            ...(played ? [{ seat: 0, card: card(14, 'hearts') }] : []),
          ],
    buriedCount: buried ? 4 : 0,
    scores,
    completedTricks: [],
    hands: Array.from({ length: count }, (_, seat) => ({
      seat,
      cards: seat === 0 ? (played ? own.slice(1) : own) : [],
      count:
        seat === 0
          ? played
            ? own.length - 1
            : own.length
          : bidding || trump
            ? buried
              ? 16
              : 13
            : buried
              ? 15
              : 10,
    })),
    legalActions: ended
      ? ['start']
      : game.turn !== 0
        ? []
        : bidding
          ? ['bid', 'pass']
          : bury
            ? ['bury']
            : trump
              ? ['trump']
              : ['play'],
  };
  if (ended) {
    game.history = [{ hand: 1, endedAt: epoch - 60_000, result: { scores } }];
    game.view.statistics = { [self]: { hands: 1, wins: 1, score: scores[0] } };
  }
  return game;
}
type DemoTile = {
  id: string;
  color: 'red' | 'yellow' | 'blue' | 'black';
  value: number;
  joker?: boolean;
};
const tile = (value: number, color: DemoTile['color'], copy = 0): DemoTile => ({
  id: `demo-${color}-${value}-${copy}`,
  value,
  color,
});
function okey(screen: GameFixtureId, v: string): GamePublicState {
  const game = baseGame('101'),
    drawn = v.startsWith('drawn') || screen === 'S50',
    opened = ['opened', 'add', 'add_done', 'discarded', 'finish'].includes(v),
    pairs = v.includes('pairs') || v.startsWith('doubles'),
    ended = v === 'result';
  let own = [
    tile(10, 'red'),
    tile(11, 'red'),
    tile(12, 'red'),
    tile(10, 'blue'),
    tile(11, 'blue'),
    tile(12, 'blue'),
    tile(13, 'red'),
    tile(13, 'blue'),
    tile(13, 'yellow'),
    tile(9, 'blue'),
    tile(7, 'black'),
    tile(8, 'black'),
    tile(9, 'black'),
    tile(3, 'red'),
    tile(4, 'red'),
    tile(5, 'yellow'),
    tile(6, 'yellow'),
    tile(1, 'blue'),
    tile(2, 'black'),
    tile(8, 'yellow'),
    tile(9, 'red'),
  ];
  if (screen === 'S50' && ['default', 'folded_invalid'].includes(v)) {
    own[3] = tile(11, 'blue');
    own[4] = tile(12, 'blue');
    own[5] = tile(13, 'blue');
    own[6] = tile(11, 'red', 1);
    own[7] = tile(11, 'blue', 1);
    own[8] = tile(11, 'yellow');
  }
  if (v === 'invalid') {
    own[6] = tile(11, 'red', 1);
    own[7] = tile(11, 'blue', 1);
    own[8] = tile(11, 'yellow');
  }
  if (v === 'doubles')
    own = [
      ...Array.from({ length: 5 }, (_, i) => [tile(i + 1, 'red', 0), tile(i + 1, 'red', 1)]).flat(),
      ...own.filter((t) => t.color !== 'red').slice(0, 12),
    ];
  else if (drawn) own.push(tile(2, 'blue'));
  const melds = [
    { owner: 1, tiles: [tile(6, 'blue', 1), tile(7, 'blue', 1), tile(8, 'blue', 1)], pairs: false },
    {
      owner: 1,
      tiles: [tile(10, 'yellow', 1), tile(11, 'yellow', 1), tile(12, 'yellow', 1)],
      pairs: false,
    },
  ];
  if (opened && v !== 'finish') {
    for (let i = 0; i < 3; i++)
      melds.push({ owner: 0, tiles: own.slice(i * 3, i * 3 + 3), pairs: false });
    own = own.slice(9);
  }
  if (v === 'add_done') {
    melds[0].tiles.push(tile(9, 'blue'));
    own = own.filter((t) => t.id !== 'demo-blue-9-0');
  }
  if (v === 'finish') {
    own = [tile(12, 'red'), tile(2, 'blue')];
    melds.push({
      owner: 0,
      tiles: [tile(9, 'red', 1), tile(10, 'red', 1), tile(11, 'red', 1)],
      pairs: false,
    });
  }
  if (v === 'doubles_opened') {
    own = own.filter((t) => t.color !== 'red');
    for (let i = 0; i < 5; i++)
      melds.push({ owner: 0, tiles: [tile(i + 1, 'red', 0), tile(i + 1, 'red', 1)], pairs: true });
  }
  if (v === 'discarded') own = own.slice(0, -1);
  const scores = ended ? [-101, 42, 19, 76] : [];
  game.status = ended ? 'finished' : 'playing';
  game.turn = ended ? null : v === 'discarded' ? 1 : 0;
  Object.assign(game.view, {
    rules: {
      id: 'rooms-101-v1',
      folding: v.includes('folded'),
      teams: pairs,
      openingMinimum: 101,
      pairsMinimum: 5,
    },
    indicator: tile(4, 'blue', 1),
    remainingStock: drawn ? 18 : 19,
    stage: ended ? 'ended' : drawn && v !== 'discarded' ? 'discard' : 'draw',
    highestOpening: v.includes('folded') ? 118 : 100,
    melds,
    opened: [opened ? 'runs' : v === 'doubles_opened' ? 'pairs' : null, 'runs', null, null],
    discards: [
      v === 'discarded' ? [tile(2, 'blue')] : [],
      [tile(5, 'black')],
      [],
      [tile(9, 'yellow')],
    ],
    scores,
    winner: ended ? 0 : null,
    hands: [
      { seat: 0, tiles: ended ? [] : own, count: ended ? 0 : own.length },
      { seat: 1, tiles: [], count: 15 },
      { seat: 2, tiles: [], count: 21 },
      { seat: 3, tiles: [], count: 21 },
    ],
    legalActions: ended
      ? ['start']
      : game.turn !== 0
        ? []
        : drawn
          ? ['discard', 'open', 'open-pairs', ...(opened ? ['process'] : [])]
          : ['draw'],
  });
  if (v === 'spectator') {
    game.seats = game.seats.filter((seat) => seat.userId !== self);
    game.view.hands = (game.view.hands as Record<string, unknown>[]).map((hand) => ({
      ...hand,
      tiles: [],
    }));
    game.view.watching = true;
    game.view.ownRecovery = null;
    game.view.legalActions = [];
  }
  if (ended) {
    game.history = [{ hand: 1, endedAt: epoch - 60_000, result: { scores } }];
    game.view.statistics = { [self]: { hands: 1, wins: 1, score: -101 } };
  }
  return game;
}
function poll(v: string): Poll[] {
  if (v === 'empty' || v === 'create') return [];
  const votes: Record<string, string> =
    v === 'first_vote'
      ? {}
      : v === 'changed'
        ? { [self]: 'demo-poll-101', 'demo-ece': 'demo-poll-film', 'demo-can': 'demo-poll-101' }
        : v === 'voted_batak'
          ? { [self]: 'demo-poll-batak', 'demo-ece': 'demo-poll-film', 'demo-can': 'demo-poll-101' }
          : { [self]: 'demo-poll-film', 'demo-ece': 'demo-poll-film', 'demo-can': 'demo-poll-101' };
  return [
    {
      id: 'demo-room-poll',
      question: 'Filmden sonra ne oynayalım?',
      options: [
        { id: 'demo-poll-film', label: 'Bir film daha' },
        { id: 'demo-poll-101', label: '101 Okey' },
        { id: 'demo-poll-batak', label: 'Batak' },
      ],
      votes,
      createdBy: v === 'not_owner' ? 'demo-ece' : self,
      closed: v === 'closed',
    },
  ];
}
function board(v: string): BoardElement[] {
  if (v === 'empty') return [];
  return [
    {
      id: 'demo-board-shape-ece',
      authorId: 'demo-ece',
      kind: 'rectangle',
      points: [
        [115, 110],
        [330, 260],
      ],
      color: '#E7B96F',
      width: 2,
    },
    {
      id: 'demo-board-own-title',
      authorId: self,
      kind: 'text',
      points: [[375, 90]],
      text: 'Pazar planı',
      color: '#B8CDFF',
      width: 2,
    },
    {
      id: 'demo-board-note-ece',
      authorId: 'demo-ece',
      kind: 'text',
      points: [[135, 170]],
      text: '11.00 · Kahve?',
      color: '#E7B96F',
      width: 2,
    },
    {
      id: 'demo-board-own-shape',
      authorId: self,
      kind: 'rectangle',
      points: [
        [375, 110],
        [590, 260],
      ],
      color: '#B8CDFF',
      width: 2,
    },
    {
      id: 'demo-board-own-note',
      authorId: self,
      kind: 'text',
      points: [[395, 170]],
      text: '15.00 · Yürüyüş',
      color: '#B8CDFF',
      width: 2,
    },
    {
      id: 'demo-board-can-note',
      authorId: 'demo-can',
      kind: 'text',
      points: [[680, 170]],
      text: '18.30 · Bizde akşam',
      color: '#65BC94',
      width: 2,
    },
    {
      id: 'demo-board-own-underline',
      authorId: self,
      kind: 'stroke',
      points: [
        [375, 290],
        [430, 301],
        [490, 304],
        [585, 292],
      ],
      color: '#B8CDFF',
      width: 3,
    },
  ];
}
/** Public visual projection, not a simulated production game engine or account. */
export function createGamesFixtureProjection(
  id: string,
  value = 'default',
): { metadata: GamesFixtureMetadata; room: RoomSnapshot; serverTimeMs: number } {
  const metadata = getGamesFixtureMetadata(id, value),
    screen = metadata.id,
    v = metadata.variant;
  if (metadata.unsupportedReason)
    throw new Error(`Unsupported ${screen}/${v}: ${metadata.unsupportedReason}`);
  let game: GamePublicState | null = null;
  if (screen === 'S41') {
    if (v !== 'activity_conflict') {
      game = baseGame(
        v === 'blackjack' ? 'blackjack' : 'holdem',
        v === 'full' ? 6 : v === 'bot_added' ? 4 : v === 'seated' || v === 'not_owner' ? 4 : 3,
      );
      game.status = 'waiting';
      game.turn = null;
      game.view = {
        ...game.view,
        turnDeadline: 0,
        legalActions: ['start'],
        capacity: 6,
        ...(game.kind === 'holdem' ? { rules } : {}),
        seats: [],
      };
      if (['default', 'spectator', 'full', 'bot_added'].includes(v))
        game.seats = game.seats.map((seat, index) =>
          index === 0 ? { ...seat, ...people[4] } : seat,
        );
      if (v === 'bot_added')
        game.seats[game.seats.length - 1] = {
          ...game.seats[game.seats.length - 1],
          userId: 'demo-bot-1',
          name: 'Bot 1',
          bot: true,
        };
      if (v === 'not_owner') game.ownerId = 'demo-ece';
      if (!game.seats.some((seat) => seat.userId === self)) game.view.ownRecovery = null;
      if (v === 'spectator') {
        game.view.watching = true;
        game.view.spectators = [{ userId: self, name: 'Deniz' }];
        game.view.ownRecovery = null;
      }
    }
  } else if (screen === 'S42' || screen === 'S43')
    game = holdem(screen === 'S43' && v === 'default' ? 'showdown' : v);
  else if (screen === 'S44') game = blackjack(v);
  else if (['S46', 'S47'].includes(screen)) game = batak(screen, v);
  else if (screen === 'S49' || screen === 'S50') game = okey(screen, v);
  else if (screen === 'S51') {
    game = holdem('showdown');
    const others = [blackjack('result'), batak('S47', 'round_end'), okey('S50', 'result')];
    game.view.previousTables = others.map((item) => ({
      kind: item.kind,
      history: item.history,
      statistics: item.view.statistics,
    }));
    if (v === 'empty') {
      game.history = [];
      game.view.previousTables = [];
      game.view.statistics = {};
    }
  } else if (screen === 'S52') {
    game = holdem('default');
    const own = game.seats[0];
    if (v === 'reclaimed')
      game.view.ownRecovery = {
        disconnectedAt: null,
        takeoverAt: null,
        pendingReturn: false,
        takeover: false,
        events: [
          { id: 'demo-control-returned-1', at: epoch - 2_000, hand: 1, type: 'control-returned' },
        ],
      };
    else if (v === 'timeout') {
      game.turn = 1;
      game.view.ownRecovery = {
        disconnectedAt: null,
        takeoverAt: null,
        pendingReturn: false,
        takeover: false,
        events: [
          {
            id: 'demo-timeout-fold-1',
            at: epoch - 2_000,
            hand: 1,
            type: 'turn-timeout',
            action: 'fold',
            toCall: 80,
          },
        ],
      };
      game.view.seats = (game.view.seats as Record<string, unknown>[]).map((seat) =>
        seat.userId === self ? { ...seat, folded: true } : seat,
      );
      game.view.legalActions = [];
    } else {
      const bot = v === 'bot' || v === 'return';
      own.bot = bot;
      own.connected = v === 'return';
      game.view.ownRecovery = {
        disconnectedAt: epoch - 10_000,
        takeoverAt: epoch + 20_000,
        pendingReturn: v === 'return',
        takeover: bot,
        events: bot
          ? [
              {
                id: 'demo-takeover-started-1',
                at: epoch - 5_000,
                hand: 1,
                type: 'takeover-started',
              },
              ...(v === 'return'
                ? [
                    {
                      id: 'demo-return-requested-1',
                      at: epoch - 2_000,
                      hand: 1,
                      type: 'return-requested' as const,
                    },
                  ]
                : []),
            ]
          : [],
      };
    }
  }
  if (game?.kind === 'holdem' && !game.view.rules) game.view.rules = rules;
  if (game) attachDemoHistoryContext(game);
  const primary: RoomSnapshot['primary'] = game
    ? {
        activity: game.kind,
        title: String(game.view.tableName ?? game.kind),
        hostUserId: game.ownerId,
        startedAt: epoch - 120_000,
        state: 'live',
      }
    : screen === 'S53' || (screen === 'S41' && v === 'activity_conflict')
      ? {
          activity: 'cinema',
          title: 'Gecenin Kıyısında',
          hostUserId: 'demo-ece',
          startedAt: epoch - 120_000,
          state: 'live',
        }
      : null;
  const room: RoomSnapshot = {
    roomId: GAME_FIXTURE_ROOM,
    revision: 1,
    participants: people
      .slice(0, 4)
      .map((person) => ({
        userId: person.userId,
        displayName: person.name,
        joinedAt: epoch - 300_000,
        lastSeenAt: epoch,
        canControl: !(screen === 'S53' && v === 'not_owner' && person.userId === self),
        canCreate: !(screen === 'S53' && v === 'not_owner' && person.userId === self),
      })),
    primary,
    timeline: {
      playing: false,
      positionSec: 0,
      rate: 1,
      effectiveServerTimeMs: epoch,
      epoch: 1,
      itemId: null,
    },
    queue: [],
    polls: screen === 'S53' ? poll(v) : [],
    whiteboard: screen === 'S54' ? board(v) : [],
    game,
  };
  assertPrivateHands(room);
  return { metadata, room, serverTimeMs: epoch };
}
/** A fail-closed shape audit catches accidental fixture leakage before runtime installation. */
function assertPrivateHands(room: RoomSnapshot) {
  const game = room.game;
  if (!game) return;
  if (game.kind === 'holdem')
    for (const seat of (game.view.seats as
      { userId: string; cards: DemoCard[]; folded: boolean }[] | undefined) ?? []) {
      if (
        seat.userId !== self &&
        seat.cards.length &&
        !(game.status === 'finished' && !seat.folded && game.view.showdown?.[seat.userId])
      )
        throw new Error('Fixture contains another player’s unrevealed Holdem cards.');
    }
  if (game.kind === 'batak')
    for (const hand of (game.view.hands as { seat: number; cards: DemoCard[] }[] | undefined) ??
      []) {
      if (hand.seat !== game.seats.find((seat) => seat.userId === self)?.seat && hand.cards.length)
        throw new Error('Fixture contains another player’s Batak cards.');
    }
  if (game.kind === '101')
    for (const hand of (game.view.hands as { seat: number; tiles: DemoTile[] }[] | undefined) ??
      []) {
      if (hand.seat !== game.seats.find((seat) => seat.userId === self)?.seat && hand.tiles.length)
        throw new Error('Fixture contains another player’s 101 rack.');
    }
}
export interface GamesFixtureInstallOptions {
  /** Root must explicitly consume getGamesFixtureMetadata in actual components before enabling these. */
  initialUIIntegrated?: boolean;
  /** Root must install a private DEV projection in useActivityRoom before enabling retained state/status. */
  initialActivityStatusIntegrated?: boolean;
}
/** Installs isolated transports only. Root supplies explicit common social shell first. */
export function installGamesFixture(
  id: string,
  value = 'default',
  options: GamesFixtureInstallOptions = {},
): () => void {
  if (!import.meta.env.DEV)
    throw new Error('Game reference fixtures are unavailable in production.');
  const projection = createGamesFixtureProjection(id, value),
    { metadata } = projection;
  if (metadata.pendingIntegration.includes('initial-component-ui') && !options.initialUIIntegrated)
    throw new Error(
      `Unsupported currently ${metadata.id}/${metadata.variant}: root initial UI integration is pending.`,
    );
  if (
    metadata.pendingIntegration.includes('initial-activity-status') &&
    !options.initialActivityStatusIntegrated
  )
    throw new Error(
      `Unsupported currently ${metadata.id}/${metadata.variant}: root initial activity state integration is pending.`,
    );
  const restoreMedia = installMediaFixture('S19', 'default');
  const previousTag = document.documentElement.dataset.gameFixture;
  document.documentElement.dataset.gameFixture = `${GAME_FIXTURE_LABEL} · ${metadata.id}/${metadata.variant}`;
  let active = true;
  const response = (): ActivityResponse => ({
    protocolVersion: 1,
    serverTimeMs: epoch,
    room: structuredClone(projection.room),
    events: [],
    replayRequired: false,
  });
  const checkRoom = (roomId: string) => {
    if (!active) throw new Error('Game fixture has been disposed.');
    if (roomId !== GAME_FIXTURE_ROOM)
      throw new Error(
        'Fixture supports only its explicit local sample room; no native account was contacted.',
      );
  };
  const activity: DesktopBridge['activity'] = {
    snapshot: async (roomId) => {
      checkRoom(roomId);
      return response();
    },
    command: async (roomId, envelope) => {
      checkRoom(roomId);
      throw new Error(
        `DEMO · ${envelope.command.type} is disabled in this visual fixture; no native operation was attempted.`,
      );
    },
    exportBoard: async () => {
      throw new Error(
        'DEMO · File export is disabled; no native dialog or file write was attempted.',
      );
    },
    youtubePlaylist: async () => {
      throw new Error('Playlist import is unavailable in the visual fixture.');
    },
    youtubePlayer: async () => {
      throw new Error('DEMO · No player service exists in this visual fixture.');
    },
  };
  const restoreRuntime = installDevelopmentRuntime({
    mediaProvider: mediaProvider(),
    mediaBridge: mediaBridge(),
    activityBridge: activity,
    activityState: {
      room: projection.room,
      status: metadata.status,
      error: metadata.error,
      serverTimeMs: projection.serverTimeMs,
    },
  });
  return () => {
    if (!active) return;
    active = false;
    restoreRuntime();
    restoreMedia();
    if (previousTag === undefined) delete document.documentElement.dataset.gameFixture;
    else document.documentElement.dataset.gameFixture = previousTag;
  };
}

/** Local DEMO completion records exercise the additive public history schema, never private decks. */
function attachDemoHistoryContext(game: GamePublicState) {
  const view = game.view;
  game.history = game.history.map((entry) => {
    const result = { ...entry.result };
    if (game.kind === 'holdem') {
      const projected = (view.seats as Record<string, unknown>[] | undefined) ?? [];
      result.revealedCards = Object.fromEntries(
        projected
          .filter((seat) => !seat.folded && !!view.showdown?.[String(seat.userId)])
          .map((seat) => [String(seat.userId), seat.cards]),
      );
      result.players = projected.map((seat) => {
        const contribution = Number(seat.contribution ?? 0),
          returned = Number(
            (view.payouts as Record<string, unknown> | undefined)?.[String(seat.userId)] ?? 0,
          );
        return {
          userId: seat.userId,
          contribution,
          returned,
          net: returned - contribution,
          finalChips: seat.chips,
          folded: !!seat.folded,
        };
      });
    } else if (game.kind === 'blackjack') {
      result.dealer = view.dealer;
      result.dealerTotal = 17;
      result.players = ((view.players as Record<string, unknown>[] | undefined) ?? []).map(
        (player) => ({
          userId: player.userId,
          finalChips: player.credits,
          net: Number(player.credits) - 1000,
          hands: ((player.hands as Record<string, unknown>[] | undefined) ?? []).map(
            (hand, index) => ({
              hand: index,
              cards: hand.cards,
              bet: hand.bet,
              total: demoTotal((hand.cards as DemoCard[]) ?? []),
              split: hand.split,
              outcome:
                (
                  (result.results as
                    { userId: string; hand: number; outcome: string }[] | undefined) ?? []
                ).find((item) => item.userId === player.userId && item.hand === index)?.outcome ??
                'pending',
            }),
          ),
        }),
      );
    } else if (game.kind === 'batak')
      Object.assign(result, {
        variant: view.variant,
        contract: { bid: view.bid, bidder: view.bidder, trump: view.trump },
        bids: view.variant === 'koz-maca' ? view.bids : null,
        tricks: view.tricks,
        teams:
          view.variant === 'esli'
            ? [
                [0, 2],
                [1, 3],
              ]
            : null,
        completedTricks: view.completedTricks,
      });
    else
      Object.assign(result, {
        rules: view.rules,
        opened: view.opened,
        highestOpening: view.highestOpening,
        melds: view.melds,
        lastDiscards: view.discards,
        lastDiscard: tile(2, 'blue'),
      });
    return {
      ...entry,
      tableName: String(view.tableName),
      seats: game.seats.map((seat, position) => ({
        seat: seat.seat,
        position,
        userId: seat.userId,
        name: seat.name,
        bot: seat.bot,
        ...(['holdem', 'blackjack'].includes(game.kind) ? { startingChips: 1000 } : {}),
      })),
      result,
    };
  });
}
