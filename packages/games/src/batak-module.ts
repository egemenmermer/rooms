import { batakAction, batakView, startBatak, type BatakRound } from './batak-table';
import { legalBatakCards, type BatakVariant } from './batak';
import { caught, type GameActionInput, type GameModule } from './module';

/** Batak (`rooms-batak-v1`, all four variants) over the existing rules in `batak-table.ts`. */
export const batakModule = {
  kind: 'batak',
  title: 'Batak',
  seats: [3, 4],
  seatsFor: (variant) => (variant === 'gommeli' ? [3] : [4]),
  actions: ['bid', 'pass', 'trump', 'bury', 'play'],
  // The rule function validates every field itself and reports its own error codes.
  parseCommand: (input) => input,
  start: (_seatCount, variant, first) => startBatak(variant, first),
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
      cardId: legalBatakCards(cards, state.trick, state.trump).sort((a, b) => a.rank - b.rank)[0]
        .id,
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
          winners: round.scores.flatMap((score, index) => (score > 0 ? [index] : [])),
        },
  summary: (round) => ({
    scores: round.scores,
    variant: round.variant,
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
  table: { stateKey: 'batak', tableOptions: (fields) => fields.variant },
} satisfies GameModule<BatakRound, GameActionInput, ReturnType<typeof batakView>, BatakVariant>;
