import type { HoldemTableRules } from '../../activity-protocol/src/index';
import { holdemAction, holdemView, startHoldem, type HoldemHand } from './holdem';
import { caught, type GameModule } from './module';

const holdemActions = ['fold', 'check', 'call', 'raise'] as const;
export interface HoldemCommand {
  action: (typeof holdemActions)[number];
  amount?: number;
}
const seatRange = (capacity: number) => Array.from({ length: capacity - 1 }, (_, i) => i + 2);

/** Texas Hold'em (`rooms-holdem-v1`) over the existing rules in `holdem.ts`. */
export const holdemModule = {
  kind: 'holdem',
  title: 'Texas Hold’em',
  seats: seatRange(9),
  seatsFor: (rules) => seatRange(rules.capacity),
  actions: holdemActions,
  parseCommand(input) {
    if (!(holdemActions as readonly string[]).includes(input.action))
      return { error: 'INVALID_HOLDEM_ACTION' };
    return { action: input.action as HoldemCommand['action'], amount: input.amount };
  },
  // The service always deals through `table.chips.start`; this fallback seats default stacks.
  start: (seatCount, rules, first) =>
    startHoldem(
      Array.from({ length: seatCount }, (_, i) => ({ userId: `seat-${i}`, chips: rules.initialChips })),
      first,
      rules.smallBlind,
      rules.bigBlind,
    ),
  action: (state, seat, command) =>
    caught(() =>
      holdemAction(
        state,
        state.seats[seat].userId,
        state.revision,
        command.action === 'raise'
          ? { type: 'raise', to: command.amount ?? 0 }
          : { type: command.action },
      ),
    ),
  view: (state, viewerSeat) =>
    holdemView(state, viewerSeat === null ? '' : (state.seats[viewerSeat]?.userId ?? '')),
  turn: (state) => state.turn,
  phase: (state) => state.stage,
  botCommand(state, seat, _rng, context) {
    // A bot calls to stay in; a timed-out human only checks or folds.
    return {
      action:
        state.seats[seat].streetBet === state.maximumBet
          ? 'check'
          : context?.timedOut
            ? 'fold'
            : 'call',
    };
  },
  legalActions(state, seat) {
    const own = state.seats[seat];
    const legal: string[] = ['fold', own.streetBet === state.maximumBet ? 'check' : 'call'];
    if (
      own.chips + own.streetBet > state.maximumBet &&
      (own.actedAt === null || state.maximumBet - own.actedAt >= state.minimumRaise)
    )
      legal.push('raise');
    return legal;
  },
  settle: (state) =>
    state.stage !== 'ended'
      ? null
      : {
          points: state.seats.map((seat) => (state.payouts[seat.userId] ?? 0) - seat.contribution),
          winners: state.seats.flatMap((seat, index) =>
            state.winners.includes(seat.userId) ? [index] : [],
          ),
        },
  summary(hand) {
    const publicHand = holdemView(hand, '');
    return {
      payouts: hand.payouts,
      board: hand.board,
      pots: hand.settlement?.pots ?? [],
      settlementReason: hand.settlement?.reason ?? null,
      showdown: hand.settlement?.reason === 'showdown' ? hand.settlement.hands : null,
      revealedCards: Object.fromEntries(
        publicHand.seats
          .filter((seat) => seat.cards.length > 0)
          .map((seat) => [seat.userId, seat.cards]),
      ),
      players: hand.seats.map((seat) => ({
        userId: seat.userId,
        contribution: seat.contribution,
        returned: hand.payouts[seat.userId] ?? 0,
        net: (hand.payouts[seat.userId] ?? 0) - seat.contribution,
        finalChips: seat.chips,
        folded: seat.folded,
      })),
    };
  },
  table: {
    stateKey: 'holdem',
    tableOptions: (fields) => fields.holdemRules,
    roundPlayers: (state) => state.seats.map((seat) => seat.userId),
    lateSeating: true,
    chips: {
      start: (players, rules, first) =>
        startHoldem(
          players.map((p) => ({ userId: p.userId, chips: p.chips })),
          first,
          rules.smallBlind,
          rules.bigBlind,
        ),
      finalChips: (state) => state.seats.map((seat) => ({ userId: seat.userId, chips: seat.chips })),
    },
    timeoutDetails: (state, seat) => ({
      toCall: Math.max(0, state.maximumBet - state.seats[seat].streetBet),
    }),
  },
} satisfies GameModule<
  HoldemHand,
  HoldemCommand,
  ReturnType<typeof holdemView>,
  HoldemTableRules
>;
