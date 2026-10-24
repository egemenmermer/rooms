import {
  batakAction,
  batakLegalCards,
  batakRoundWinners,
  batakView,
  startBatak,
  type BatakRound,
} from './batak-table';
import { BATAK_DEFAULT_RULES, type BatakRules, type BatakVariant } from './batak';
import { caught, parseSwitches, type GameActionInput, type GameModule } from './module';

/** Table settings: the built-in variant field plus the house rules from `game.create.options`. */
export interface BatakTableOptions {
  variant: BatakVariant;
  /** Omitted: the published defaults (`BATAK_DEFAULT_RULES`). */
  rules?: Partial<BatakRules>;
}
const ruleKeys = Object.keys(BATAK_DEFAULT_RULES) as (keyof BatakRules)[];

/** Batak (`rooms-batak-v1`, all four variants) over the existing rules in `batak-table.ts`. */
export const batakModule = {
  kind: 'batak',
  title: 'Batak',
  seats: [3, 4],
  seatsFor: ({ variant }) => (variant === 'gommeli' ? [3] : [4]),
  actions: ['bid', 'pass', 'trump', 'bury', 'play'],
  // The rule function validates every field itself and reports its own error codes.
  parseCommand: (input) => input,
  parseOptions: (input) => parseSwitches<BatakRules>(input, ruleKeys),
  start: (_seatCount, { variant, rules }, first) => startBatak(variant, first, undefined, rules),
  action: (state, seat, command) => caught(() => batakAction(state, seat, command)),
  view: (state, viewerSeat) => batakView(state, viewerSeat),
  turn: (state) => state.turn,
  botCommand(state, index) {
    const cards = state.hands[index];
    if (state.stage === 'bidding') return { action: 'pass' };
    if (state.stage === 'trump')
      return {
        action: 'trump',
        trump: [...new Set(cards.map((c) => c.suit))].sort(
          (a, b) =>
            cards.filter((c) => c.suit === b).length - cards.filter((c) => c.suit === a).length,
        )[0],
      };
    if (state.stage === 'bury')
      return {
        action: 'bury',
        tileIds: [...cards]
          .sort(
            (a, b) =>
              (a.suit === state.trump ? 100 : 0) +
              a.rank -
              ((b.suit === state.trump ? 100 : 0) + b.rank),
          )
          .slice(0, 4)
          .map((c) => c.id),
      };
    return {
      action: 'play',
      // The round's own rules and trump state, so the bot never leads trump before it is broken.
      cardId: batakLegalCards(state, index).sort((a, b) => a.rank - b.rank)[0].id,
    };
  },
  legalActions: (state) =>
    state.stage === 'bidding'
      ? ['bid', 'pass']
      : state.stage === 'trump'
        ? ['trump']
        : state.stage === 'bury'
          ? ['bury']
          : ['play'],
  settle: (round) =>
    round.stage !== 'ended'
      ? null
      : {
          points: round.scores,
          // Made or set the contract (per team in Eşli), not merely a positive score.
          winners: batakRoundWinners(round).flatMap((won, index) => (won ? [index] : [])),
        },
  summary: (round) => ({
    scores: round.scores,
    variant: round.variant,
    rules: round.rules ?? BATAK_DEFAULT_RULES,
    contract: { bid: round.bid, bidder: round.bidder, trump: round.trump },
    bids: round.variant === 'koz-maca' ? round.bids : null,
    tricks: round.tricks,
    teams:
      round.variant === 'esli'
        ? [
            [0, 2],
            [1, 3],
          ]
        : null,
    completedTricks: round.completedTricks,
  }),
  table: {
    stateKey: 'batak',
    tableOptions: (fields) => ({
      variant: fields.variant,
      ...(fields.options ? { rules: fields.options as Partial<BatakRules> } : {}),
    }),
  },
} satisfies GameModule<BatakRound, GameActionInput, ReturnType<typeof batakView>, BatakTableOptions>;
