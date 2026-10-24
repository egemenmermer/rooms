import {
  BLACKJACK_DEFAULT_RULES,
  blackjackTableAction,
  blackjackTableView,
  startBlackjackTable,
  type BlackjackPlayer,
  type BlackjackRules,
  type BlackjackTableRound,
} from './blackjack-table';
import { blackjackTotal } from './blackjack';
import { caught, parseSwitches, type GameModule } from './module';

const blackjackActions = [
  'hit',
  'stand',
  'double',
  'split',
  'surrender',
  'insurance',
  'decline-insurance',
] as const;
export interface BlackjackCommand {
  action: (typeof blackjackActions)[number];
}
const ruleKeys = Object.keys(BLACKJACK_DEFAULT_RULES) as (keyof BlackjackRules)[];
/** Chips the player put in this round (hands and insurance) and got back, for the round's net. */
const staked = (player: BlackjackPlayer) =>
  player.hands.reduce((sum, hand) => sum + hand.bet, 0) + (player.insurance ?? 0);
const returned = (round: BlackjackTableRound, player: BlackjackPlayer) =>
  round.results
    .filter((result) => result.userId === player.userId)
    .reduce((sum, result) => sum + result.returned, 0) + (player.insuranceReturned ?? 0);

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
  parseOptions: (input) => parseSwitches<BlackjackRules>(input, ruleKeys),
  // The service always deals through `table.chips.start`; this fallback seats default stacks.
  start: (seatCount, rules) =>
    startBlackjackTable(
      Array.from({ length: seatCount }, (_, i) => ({
        userId: `seat-${i}`,
        credits: 1000,
        bet: 10,
      })),
      undefined,
      rules,
    ),
  action: (state, seat, command) =>
    caught(() => blackjackTableAction(state, state.players[seat].userId, command.action)),
  // Player cards are open at a real table; the dealer's hole card and the shoe stay hidden.
  view: (state) => blackjackTableView(state),
  turn: (state) => state.turn,
  botCommand(state, seat) {
    // Insurance is a losing side bet for a player who cannot count cards; bots and timeouts decline it.
    if (state.insurancePending) return { action: 'decline-insurance' };
    const player = state.players[seat];
    return { action: blackjackTotal(player.hands[player.activeHand].cards) < 17 ? 'hit' : 'stand' };
  },
  legalActions(state, seat) {
    const own = state.players[seat],
      hand = own.hands[own.activeHand];
    if (state.insurancePending)
      return own.credits >= own.hands[0].bet / 2
        ? ['insurance', 'decline-insurance']
        : ['decline-insurance'];
    const legal: string[] = ['hit', 'stand'];
    if (state.rules?.surrender && hand.cards.length === 2 && !hand.split) legal.push('surrender');
    if (hand.cards.length === 2 && hand.bet <= own.credits) {
      legal.push('double');
      const point = (rank: number) => (rank === 14 ? 11 : Math.min(rank, 10));
      if (point(hand.cards[0].rank) === point(hand.cards[1].rank) && own.hands.length < 4)
        legal.push('split');
    }
    return legal;
  },
  // Answering the insurance prompt and then playing are separate decisions, each with its own timer.
  phase: (round) => (round.insurancePending ? 'insurance' : 'play'),
  settle: (round) =>
    !round.finished
      ? null
      : {
          points: round.players.map((player) => returned(round, player) - staked(player)),
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
    rules: round.rules ?? BLACKJACK_DEFAULT_RULES,
    players: round.players.map((player) => ({
      userId: player.userId,
      finalChips: player.credits,
      insurance: player.insurance ?? 0,
      insuranceReturned: player.insuranceReturned ?? 0,
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
      net: returned(round, player) - staked(player),
    })),
  }),
  table: {
    stateKey: 'blackjack',
    roundPlayers: (state) => state.players.map((player) => player.userId),
    chips: {
      start: (players, rules) =>
        startBlackjackTable(
          players.map((p) => ({ userId: p.userId, credits: p.chips, bet: p.bet })),
          undefined,
          rules,
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
  Partial<BlackjackRules> | undefined
>;
