import {
  compareScores,
  evaluateHoldemDetailed,
  type EvaluatedHoldemHand,
  shuffledDeck,
  sidePots,
  type Card,
} from './cards';
export interface HoldemSeat {
  userId: string;
  chips: number;
  cards: Card[];
  folded: boolean;
  streetBet: number;
  contribution: number;
  actedAt: number | null;
}
export interface HoldemPotResult {
  kind: 'main' | 'side';
  amount: number;
  eligible: string[];
  winners: string[];
  awards: Record<string, number>;
  split: boolean;
}
export interface HoldemSettlement {
  reason: 'uncontested' | 'showdown';
  pots: HoldemPotResult[];
  hands: Record<string, EvaluatedHoldemHand>;
  /** Showdown players who kept their cards hidden (only with the `muckLosers` option). */
  mucked?: string[];
}
/** One public betting action. Blinds are logged as actions so a hand history can be rebuilt. */
export interface HoldemLogEntry {
  street: 'preflop' | 'flop' | 'turn' | 'river';
  userId: string;
  action: 'smallBlind' | 'bigBlind' | 'fold' | 'check' | 'call' | 'raise';
  /** Chips actually moved by this action (a short stack pays less than asked). */
  amount: number;
  /** The player's total bet on this street after the action. */
  to: number;
  allIn: boolean;
}
export interface HoldemOptions {
  /** Players who win no pot may keep their cards hidden, unless someone is all-in. */
  muckLosers?: boolean;
}
export interface HoldemHand {
  revision: number;
  button: number;
  turn: number | null;
  stage: 'preflop' | 'flop' | 'turn' | 'river' | 'ended';
  deck: Card[];
  board: Card[];
  seats: HoldemSeat[];
  maximumBet: number;
  minimumRaise: number;
  bigBlind: number;
  payouts: Record<string, number>;
  winners: string[];
  settlement?: HoldemSettlement;
  /** Public action log; absent on hands stored before it existed. */
  log?: HoldemLogEntry[];
  /** Stage whose betting was the last one before the board was dealt out with nobody to act. */
  runoutFrom?: 'preflop' | 'flop' | 'turn' | 'river';
  muckLosers?: boolean;
}
export type HoldemAction = { type: 'fold' | 'check' | 'call' } | { type: 'raise'; to: number };
/** A seat can only be dealt in with chips; a stack below the big blind posts all-in for less. */
export const isHoldemDealable = (chips: number) => Number.isSafeInteger(chips) && chips > 0;
/**
 * Stack a player gets when sitting down again: the stack they stood up with, capped at the
 * maximum buy-in; a fresh buy-in for a first visit or a busted player; a stack below the
 * minimum buy-in is topped up with the requested buy-in (same as a seated rebuy).
 */
export function holdemRestoredStack(
  saved: number | undefined,
  maxBuyIn: number,
  requested: number,
  minBuyIn = 0,
): number {
  if (saved === undefined || !(saved > 0)) return Math.min(maxBuyIn, requested);
  // Below the minimum the usual rebuy rule applies: the buy-in tops the stack up.
  return saved < minBuyIn ? Math.min(maxBuyIn, saved + requested) : Math.min(saved, maxBuyIn);
}
const next = (state: HoldemHand, seat: number, predicate: (seat: HoldemSeat) => boolean) => {
  for (let offset = 1; offset <= state.seats.length; offset++) {
    const index = (seat + offset) % state.seats.length;
    if (predicate(state.seats[index])) return index;
  }
  return null;
};
function pay(seat: HoldemSeat, amount: number) {
  const paid = Math.min(seat.chips, amount);
  seat.chips -= paid;
  seat.streetBet += paid;
  seat.contribution += paid;
  return paid;
}
function record(
  state: HoldemHand,
  seat: HoldemSeat,
  action: HoldemLogEntry['action'],
  amount: number,
) {
  if (state.stage === 'ended') return;
  (state.log ??= []).push({
    street: state.stage,
    userId: seat.userId,
    action,
    amount,
    to: seat.streetBet,
    allIn: seat.chips === 0,
  });
}
function draw(state: HoldemHand): Card {
  const card = state.deck.shift();
  if (!card) throw new Error('DECK_EMPTY');
  return card;
}
function award(state: HoldemHand, winners: string[], amount: number) {
  // Odd chips go clockwise from the button, deterministic and publicly explainable.
  const ordered = state.seats
    .map((_, index) => (state.button + index + 1) % state.seats.length)
    .filter((index) => winners.includes(state.seats[index].userId));
  if (!ordered.length) throw new Error('POT_WITHOUT_ELIGIBLE_WINNER');
  const share = Math.floor(amount / ordered.length),
    remainder = amount % ordered.length;
  const awards: Record<string, number> = {};
  ordered.forEach((index, order) => {
    const value = share + (order < remainder ? 1 : 0),
      seat = state.seats[index];
    seat.chips += value;
    awards[seat.userId] = value;
    state.payouts[seat.userId] = (state.payouts[seat.userId] ?? 0) + value;
  });
  return awards;
}
function showdown(state: HoldemHand) {
  const remaining = state.seats.filter((s) => !s.folded);
  const settlement: HoldemSettlement = {
    reason: remaining.length === 1 ? 'uncontested' : 'showdown',
    pots: [],
    hands: {},
    mucked: [],
  };
  // An all-in player puts everyone's cards on the table, so nobody may muck then.
  const anyAllIn = remaining.some((s) => s.chips === 0);
  const contested = new Set<string>();
  if (remaining.length === 1) {
    const amount = state.seats.reduce((sum, s) => sum + s.contribution, 0),
      winners = [remaining[0].userId];
    settlement.pots.push({
      kind: 'main',
      amount,
      eligible: winners,
      winners,
      awards: award(state, winners, amount),
      split: false,
    });
  } else {
    for (const seat of remaining)
      settlement.hands[seat.userId] = evaluateHoldemDetailed([...seat.cards, ...state.board]);
    for (const [index, pot] of sidePots(
      state.seats.map((s) => ({ userId: s.userId, amount: s.contribution, folded: s.folded })),
    ).entries()) {
      let best: number[] = [],
        winners: string[] = [];
      for (const userId of pot.eligible) {
        const score = settlement.hands[userId].score;
        const comparison = best.length ? compareScores(score, best) : 1;
        if (comparison > 0) {
          best = score;
          winners = [userId];
        } else if (comparison === 0) winners.push(userId);
      }
      settlement.pots.push({
        kind: index === 0 ? 'main' : 'side',
        ...pot,
        winners,
        awards: award(state, winners, pot.amount),
        split: winners.length > 1,
      });
      if (pot.eligible.length > 1) for (const userId of winners) contested.add(userId);
    }
  }
  state.settlement = settlement;
  // A winner took a pot someone else could also win, or ended up ahead of their own money. Getting
  // back only an uncalled bet is not a win.
  state.winners = Object.keys(state.payouts).filter((userId) => {
    if (!(state.payouts[userId] > 0)) return false;
    if (settlement.reason === 'uncontested' || contested.has(userId)) return true;
    return state.payouts[userId] > state.seats.find((s) => s.userId === userId)!.contribution;
  });
  if (state.muckLosers && settlement.reason === 'showdown' && !anyAllIn) {
    settlement.mucked = remaining
      .filter((s) => !state.winners.includes(s.userId))
      .map((s) => s.userId);
    // The evaluation names the best five cards, i.e. the hole cards, so it goes with the muck.
    for (const userId of settlement.mucked) delete settlement.hands[userId];
  }
  state.stage = 'ended';
  state.turn = null;
}
function progress(state: HoldemHand, previousTurn: number) {
  const live = state.seats.filter((s) => !s.folded);
  if (live.length === 1) {
    showdown(state);
    return;
  }
  const acting = live.filter((s) => s.chips > 0);
  const bettingComplete = acting.every(
    (s) => s.actedAt !== null && s.streetBet === state.maximumBet,
  );
  // With one or no player able to act, betting is over once nobody has put in more than that
  // player. (A blind posted all-in for less than the big blind never has to be out-called.)
  const noFurtherBetting =
    acting.length <= 1 &&
    acting.every((s) => live.every((other) => other === s || other.streetBet <= s.streetBet));
  if (!bettingComplete && !noFurtherBetting) {
    state.turn = next(
      state,
      previousTurn,
      (s) => !s.folded && s.chips > 0 && (s.actedAt === null || s.streetBet < state.maximumBet),
    );
    return;
  }
  if (state.stage === 'river') {
    showdown(state);
    return;
  }
  if (acting.length <= 1 && state.stage !== 'ended') state.runoutFrom ??= state.stage;
  // Burn one card before each community street, as in a physical friends' table.
  draw(state);
  if (state.stage === 'preflop') {
    state.board.push(draw(state), draw(state), draw(state));
    state.stage = 'flop';
  } else {
    state.board.push(draw(state));
    state.stage = state.stage === 'flop' ? 'turn' : 'river';
  }
  state.maximumBet = 0;
  state.minimumRaise = state.bigBlind;
  state.seats.forEach((s) => {
    s.streetBet = 0;
    s.actedAt = null;
  });
  if (acting.length <= 1) {
    progress(state, state.button);
    return;
  }
  state.turn = next(state, state.button, (s) => !s.folded && s.chips > 0);
}
export function startHoldem(
  players: { userId: string; chips: number }[],
  button: number,
  smallBlind: number,
  bigBlind: number,
  deck = shuffledDeck(),
  options: HoldemOptions = {},
): HoldemHand {
  if (
    players.length < 2 ||
    players.length > 9 ||
    new Set(players.map((p) => p.userId)).size !== players.length ||
    players.some((p) => !p.userId || !isHoldemDealable(p.chips)) ||
    !Number.isInteger(button) ||
    button < 0 ||
    button >= players.length ||
    !Number.isSafeInteger(smallBlind) ||
    smallBlind <= 0 ||
    !Number.isSafeInteger(bigBlind) ||
    bigBlind < smallBlind ||
    deck.length < 52 ||
    new Set(deck.map((c) => c.id)).size !== deck.length
  )
    throw new Error('INVALID_HOLDEM_TABLE');
  const state: HoldemHand = {
    revision: 1,
    button,
    turn: null,
    stage: 'preflop',
    deck: [...deck],
    board: [],
    seats: players.map((p) => ({
      ...p,
      cards: [],
      folded: false,
      streetBet: 0,
      contribution: 0,
      actedAt: null,
    })),
    maximumBet: bigBlind,
    minimumRaise: bigBlind,
    bigBlind,
    payouts: {},
    winners: [],
    log: [],
    ...(options.muckLosers ? { muckLosers: true } : {}),
  };
  for (let round = 0; round < 2; round++)
    for (let offset = 1; offset <= players.length; offset++)
      state.seats[(button + offset) % players.length].cards.push(draw(state));
  const small = players.length === 2 ? button : (button + 1) % players.length,
    big = (small + 1) % players.length;
  // A short stack posts what it has, all-in; the others still owe the full big blind.
  record(state, state.seats[small], 'smallBlind', pay(state.seats[small], smallBlind));
  record(state, state.seats[big], 'bigBlind', pay(state.seats[big], bigBlind));
  state.turn = next(state, big, (seat) => seat.chips > 0);
  // Blinds can leave nobody (or only a player who is already covered) with a decision.
  const acting = state.seats.filter((s) => s.chips > 0);
  if (
    state.turn === null ||
    (acting.length <= 1 &&
      acting.every((s) => state.seats.every((o) => o === s || o.streetBet <= s.streetBet)))
  ) {
    state.turn = null;
    progress(state, big);
  }
  return state;
}
export function holdemAction(
  value: HoldemHand,
  userId: string,
  expectedRevision: number,
  action: HoldemAction,
): HoldemHand {
  if (value.revision !== expectedRevision) throw new Error('REVISION_CONFLICT');
  if (value.stage === 'ended' || value.turn === null) throw new Error('HAND_FINISHED');
  if (value.seats[value.turn].userId !== userId) throw new Error('NOT_YOUR_TURN');
  const state = structuredClone(value),
    turn = state.turn!,
    seat = state.seats[turn];
  switch (action.type) {
    case 'fold':
      seat.folded = true;
      record(state, seat, 'fold', 0);
      break;
    case 'check':
      if (seat.streetBet !== state.maximumBet) throw new Error('CHECK_UNAVAILABLE');
      record(state, seat, 'check', 0);
      break;
    case 'call':
      record(state, seat, 'call', pay(seat, state.maximumBet - seat.streetBet));
      break;
    case 'raise': {
      if (
        !Number.isSafeInteger(action.to) ||
        action.to <= state.maximumBet ||
        action.to > seat.streetBet + seat.chips
      )
        throw new Error('INVALID_RAISE');
      if (seat.actedAt !== null && state.maximumBet - seat.actedAt < state.minimumRaise)
        throw new Error('BETTING_NOT_REOPENED');
      const increment = action.to - state.maximumBet,
        allIn = action.to === seat.streetBet + seat.chips;
      if (increment < state.minimumRaise && !allIn) throw new Error('RAISE_TOO_SMALL');
      record(state, seat, 'raise', pay(seat, action.to - seat.streetBet));
      if (increment >= state.minimumRaise) {
        state.minimumRaise = increment;
        state.seats.forEach((s) => {
          if (s !== seat) s.actedAt = null;
        });
      }
      state.maximumBet = action.to;
      break;
    }
  }
  seat.actedAt = state.maximumBet;
  state.revision++;
  progress(state, turn);
  return state;
}
/**
 * While betting is open, a layer only one player can win is an uncalled bet (the big blind
 * before anyone calls), not a side pot; it stays with the pot below it until settlement.
 */
function livePots(pots: { amount: number; eligible: string[] }[]) {
  const merged: { amount: number; eligible: string[] }[] = [];
  for (const pot of pots) {
    const below = merged.at(-1);
    if (below && pot.eligible.length < 2) below.amount += pot.amount;
    else merged.push({ ...pot, eligible: [...pot.eligible] });
  }
  return merged;
}
/** Showdown hands every viewer may see: all remaining hands except the ones that were mucked. */
export function publicShowdownHands(state: HoldemHand): Record<string, EvaluatedHoldemHand> | null {
  const settlement = state.settlement;
  if (state.stage !== 'ended' || settlement?.reason !== 'showdown') return null;
  const mucked = settlement.mucked ?? [];
  return Object.fromEntries(
    Object.entries(settlement.hands).filter(([id]) => !mucked.includes(id)),
  );
}
export function holdemView(state: HoldemHand, userId: string) {
  const reveal = state.stage === 'ended' && state.seats.filter((s) => !s.folded).length > 1;
  const mucked = state.settlement?.mucked ?? [];
  const shown = (seat: { userId: string; folded: boolean }) =>
    reveal && !seat.folded && !mucked.includes(seat.userId);
  const own = state.seats.find((seat) => seat.userId === userId);
  const ownHand =
    own && own.cards.length + state.board.length >= 5
      ? evaluateHoldemDetailed([...own.cards, ...state.board])
      : null;
  return {
    ownHand,
    showdown: reveal ? publicShowdownHands(state) : null,
    mucked,
    log: state.log ?? [],
    runoutFrom: state.runoutFrom ?? null,
    settlementReason: state.settlement?.reason ?? null,
    pots:
      state.settlement?.pots ??
      livePots(
        sidePots(
          state.seats.map((seat) => ({
            userId: seat.userId,
            amount: seat.contribution,
            folded: seat.folded,
          })),
        ),
      ).map((pot, index) => ({
        kind: index === 0 ? ('main' as const) : ('side' as const),
        ...pot,
        winners: [],
        awards: {},
        split: false,
      })),
    revision: state.revision,
    button: state.button,
    turn: state.turn,
    stage: state.stage,
    board: state.board,
    maximumBet: state.maximumBet,
    minimumRaise: state.minimumRaise,
    payouts: state.payouts,
    winners: state.winners,
    seats: state.seats.map(({ cards, actedAt: _actedAt, ...seat }) => ({
      ...seat,
      cards: seat.userId === userId || shown(seat) ? cards : [],
      hiddenCardCount: seat.userId === userId || shown(seat) ? 0 : cards.length,
    })),
  };
}
