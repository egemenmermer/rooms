import { isGameError, type GameModule } from './module';

/**
 * Plays a module whose state is one deal/round (Pişti, Tavla) as a match: settled rounds add their points to
 * running totals and the next round is dealt inside `action()` until `winners()` names someone. The service
 * sees one long round, so seats, timers, history and statistics need no match logic of their own.
 */
export interface MatchState<Round, Options = unknown> {
  round: Round;
  /** Table options, kept so every round is dealt with them. */
  options: Options;
  /** The round that just ended, shown until the next one finishes (null before the first). */
  previous: Round | null;
  /** Match points per seat (the sum of every finished round's `settle().points`). */
  totals: number[];
  rounds: { points: number[]; winners: number[] }[];
  seatCount: number;
  first: number;
  /** Set once the match is over. */
  winners: number[] | null;
}
export interface MatchView<View> {
  totals: number[];
  rounds: { points: number[]; winners: number[] }[];
  winners: number[] | null;
  /** The last finished round as this viewer may see it (null before the first one ends). */
  previous: View | null;
}
export interface MatchRules<Round, Options> {
  title: string;
  /** Seats that won the match with these totals, or an empty list to deal another round. */
  winners(totals: number[], finished: Round, options: Options): number[];
  /** Options for the next round (e.g. the score so far). Default: the table options as they are. */
  roundOptions?(options: Options, totals: number[]): Options;
}
/** Safety stop: a match that has not ended after this many rounds goes to the leaders. */
const MAX_ROUNDS = 100;

export function asMatch<Round, Command, View, Options>(
  game: GameModule<Round, Command, View, Options>,
  rules: MatchRules<Round, Options>,
): GameModule<MatchState<Round, Options>, Command, View & { match: MatchView<View> }, Options> {
  const roundOptions = (options: Options, totals: number[]) =>
    rules.roundOptions ? rules.roundOptions(options, totals) : options;
  return {
    kind: game.kind,
    title: rules.title,
    seats: game.seats,
    actions: game.actions,
    ...(game.seatsFor ? { seatsFor: (options: Options) => game.seatsFor!(options) } : {}),
    ...(game.parseOptions ? { parseOptions: game.parseOptions } : {}),
    parseCommand: (input) => game.parseCommand(input),
    start(seatCount, options, first, rng) {
      const totals = Array<number>(seatCount).fill(0);
      return {
        round: game.start(seatCount, roundOptions(options, totals), first, rng),
        previous: null,
        totals,
        rounds: [],
        seatCount,
        first,
        winners: null,
        options,
      };
    },
    action(state, seat, command, rng) {
      if (state.winners) return { error: 'ROUND_FINISHED' };
      const round = game.action(state.round, seat, command, rng);
      if (isGameError(round)) return round;
      const settled = game.settle(round);
      if (!settled) return { ...state, round };
      const totals = state.totals.map((total, index) => total + (settled.points[index] ?? 0)),
        rounds = [...state.rounds, { points: settled.points, winners: settled.winners }];
      let winners = rules.winners(totals, round, state.options);
      if (!winners.length && rounds.length >= MAX_ROUNDS) {
        const best = Math.max(...totals);
        winners = totals.flatMap((total, index) => (total === best ? [index] : []));
      }
      if (winners.length) return { ...state, round, totals, rounds, winners };
      const first = (state.first + 1) % state.seatCount;
      return {
        ...state,
        round: game.start(state.seatCount, roundOptions(state.options, totals), first, rng),
        previous: round,
        totals,
        rounds,
        first,
      };
    },
    view(state, viewerSeat) {
      return {
        ...game.view(state.round, viewerSeat),
        match: {
          totals: [...state.totals],
          rounds: structuredClone(state.rounds),
          winners: state.winners && [...state.winners],
          previous: state.previous === null ? null : game.view(state.previous, viewerSeat),
        },
      };
    },
    turn: (state) => (state.winners ? null : game.turn(state.round)),
    botCommand: (state, seat, rng, context) => game.botCommand(state.round, seat, rng, context),
    legalActions: (state, seat) =>
      state.winners ? [] : (game.legalActions?.(state.round, seat) ?? game.actions),
    // A new round restarts the turn timer even when the same seat acts first.
    phase: (state) => `${state.rounds.length}:${game.phase?.(state.round) ?? ''}`,
    settle: (state) => (state.winners ? { points: state.totals, winners: state.winners } : null),
    summary: (state) => ({
      totals: state.totals,
      winners: state.winners,
      rounds: state.rounds,
      lastRound: game.summary ? game.summary(state.round) : game.settle(state.round),
    }),
  };
}
