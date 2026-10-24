import {
  blackjackTableAction,
  blackjackTableView,
  startBlackjackTable,
  type BlackjackTableRound,
} from './blackjack-table';
import { blackjackTotal } from './blackjack';
import { caught, type GameModule } from './module';

const blackjackActions = ['hit', 'stand', 'double', 'split'] as const;
export interface BlackjackCommand {
  action: (typeof blackjackActions)[number];
}

/** Blackjack (`rooms-blackjack-v1`) over the existing rules in `blackjack-table.ts`. */
export const blackjackModule = {
  kind: 'blackjack',
  title: 'Blackjack',
  seats: [1, 2, 3, 4, 5, 6, 7],
  actions: blackjackActions,
  parseCommand(input) {
    if (!(blackjackActions as readonly string[]).includes(input.action))
      return { error: 'INVALID_BLACKJACK_ACTION' };
    return { action: input.action as BlackjackCommand['action'] };
  },
  // The service always deals through `table.chips.start`; this fallback seats default stacks.
  start: (seatCount) =>
    startBlackjackTable(
      Array.from({ length: seatCount }, (_, i) => ({ userId: `seat-${i}`, credits: 1000, bet: 10 })),
    ),
  action: (state, seat, command) =>
    caught(() => blackjackTableAction(state, state.players[seat].userId, command.action)),
  // Player cards are open at a real table; the dealer's hole card and the shoe stay hidden.
  view: (state) => blackjackTableView(state),
  turn: (state) => state.turn,
  botCommand(state, seat) {
    const player = state.players[seat];
    return { action: blackjackTotal(player.hands[player.activeHand].cards) < 17 ? 'hit' : 'stand' };
  },
  legalActions(state, seat) {
    const own = state.players[seat],
      hand = own.hands[own.activeHand];
    const legal: string[] = ['hit', 'stand'];
    if (hand.cards.length === 2 && hand.bet <= own.credits) {
      legal.push('double');
      const point = (rank: number) => (rank === 14 ? 11 : Math.min(rank, 10));
      if (point(hand.cards[0].rank) === point(hand.cards[1].rank) && own.hands.length < 4)
        legal.push('split');
    }
    return legal;
  },
  settle: (round) =>
    !round.finished
      ? null
      : {
          points: round.players.map(
            (player) =>
              round.results
                .filter((result) => result.userId === player.userId)
                .reduce((sum, result) => sum + result.returned, 0) -
              player.hands.reduce((sum, hand) => sum + hand.bet, 0),
          ),
          winners: round.players.flatMap((player, index) =>
            round.results.some(
              (r) => r.userId === player.userId && ['win', 'blackjack'].includes(r.outcome),
            )
              ? [index]
              : [],
          ),
        },
  summary: (round) => ({
    results: round.results,
    dealer: round.dealer,
    dealerTotal: blackjackTotal(round.dealer),
    players: round.players.map((player) => ({
      userId: player.userId,
      finalChips: player.credits,
      hands: player.hands.map((hand, index) => ({
        hand: index,
        cards: hand.cards,
        bet: hand.bet,
        total: blackjackTotal(hand.cards),
        split: hand.split,
        outcome:
          round.results.find((result) => result.userId === player.userId && result.hand === index)
            ?.outcome ?? null,
      })),
      net:
        round.results
          .filter((result) => result.userId === player.userId)
          .reduce((sum, result) => sum + result.returned, 0) -
        player.hands.reduce((sum, hand) => sum + hand.bet, 0),
    })),
  }),
  table: {
    stateKey: 'blackjack',
    roundPlayers: (state) => state.players.map((player) => player.userId),
    chips: {
      start: (players) =>
        startBlackjackTable(
          players.map((p) => ({ userId: p.userId, credits: p.chips, bet: p.bet })),
        ),
      finalChips: (round) =>
        round.players.map((player) => ({ userId: player.userId, chips: player.credits })),
      tableBets: true,
    },
  },
} satisfies GameModule<
  BlackjackTableRound,
  BlackjackCommand,
  ReturnType<typeof blackjackTableView>,
  undefined
>;
