import { shuffledDeck, type Card, type Suit } from './cards';
import {
  batakRules,
  batakScores,
  batakTrickWinner,
  batakWinners,
  legalBatakCards,
  type BatakRules,
  type BatakVariant,
  type TrickPlay,
} from './batak';
export interface BatakRound {
  variant: BatakVariant;
  hands: Card[][];
  buried: Card[];
  trick: TrickPlay[];
  tricks: number[];
  stage: 'bidding' | 'trump' | 'bury' | 'playing' | 'ended';
  turn: number | null;
  dealer: number;
  bid: number;
  bids: number[];
  bidder: number;
  passed: number[];
  trump: Suit;
  scores: number[];
  completedTricks: { plays: TrickPlay[]; winner: number }[];
  /** House rules for this round; absent on rounds stored before the options existed. */
  rules?: BatakRules;
  /** True once trump was played on a non-trump lead; derived for rounds stored without it. */
  trumpBroken?: boolean;
  /** Public bidding history in table order; absent on rounds stored before it existed. */
  bidLog?: { seat: number; action: 'bid' | 'pass'; amount?: number }[];
}
function isTrumpBroken(round: BatakRound): boolean {
  if (round.trumpBroken !== undefined) return round.trumpBroken;
  const plays = [...round.completedTricks.map((t) => t.plays), round.trick];
  return plays.some(
    (trick) =>
      trick.length > 0 &&
      trick[0].card.suit !== round.trump &&
      trick.some((p) => p.card.suit === round.trump),
  );
}
/** Cards `seat` may legally play right now, using the round's own rules and trump state. */
export function batakLegalCards(round: BatakRound, seat: number): Card[] {
  return legalBatakCards(round.hands[seat], round.trick, round.trump, {
    trumpBroken: isTrumpBroken(round),
    rules: round.rules,
  });
}
/** Per-seat win flags for statistics; only meaningful once the round has ended. */
export function batakRoundWinners(round: BatakRound): boolean[] {
  return batakWinners(round.variant, round.tricks, round.bidder, round.bid, round.bids);
}
export function startBatak(
  variant: BatakVariant,
  dealer: number,
  deck = shuffledDeck(),
  rules?: Partial<BatakRules>,
): BatakRound {
  const count = variant === 'gommeli' ? 3 : 4;
  if (deck.length !== 52 || new Set(deck.map((c) => c.id)).size !== 52)
    throw new Error('INVALID_DECK');
  const hands: Card[][] = Array.from({ length: count }, () => []),
    cards = [...deck];
  const buried = variant === 'gommeli' ? cards.splice(-4) : [];
  while (cards.length)
    for (let i = 1; i <= count; i++) hands[(dealer + i) % count].push(cards.shift()!);
  return {
    variant,
    hands,
    buried,
    trick: [],
    tricks: Array(count).fill(0),
    stage: 'bidding',
    turn: (dealer + 1) % count,
    dealer,
    bid: 0,
    bids: Array(count).fill(0),
    bidder: (dealer + 1) % count,
    passed: [],
    trump: 'spades',
    scores: [],
    completedTricks: [],
    rules: batakRules(rules),
    trumpBroken: false,
    bidLog: [],
  };
}
export function batakAction(
  value: BatakRound,
  seat: number,
  action: { action: string; amount?: number; cardId?: string; tileIds?: string[]; trump?: Suit },
): BatakRound {
  if (value.stage === 'ended' || value.turn !== seat) throw new Error('NOT_YOUR_TURN');
  const state = structuredClone(value),
    count = state.hands.length,
    maximum = state.variant === 'gommeli' ? 16 : 13;
  if (state.stage === 'bidding') {
    if (state.variant === 'koz-maca') {
      if (action.action !== 'bid' && action.action !== 'pass')
        throw new Error('BID_OR_PASS_REQUIRED');
      const bid = action.action === 'pass' ? 1 : action.amount;
      if (!Number.isInteger(bid) || bid! < 1 || bid! > 13) throw new Error('INVALID_BID');
      state.bids[seat] = bid!;
      state.passed.push(seat);
      (state.bidLog ??= []).push({
        seat,
        action: action.action === 'pass' ? 'pass' : 'bid',
        amount: bid!,
      });
      if (state.passed.length === count) {
        state.stage = 'playing';
        state.turn = (state.dealer + 1) % count;
      } else state.turn = (seat + 1) % count;
      return state;
    }
    if (action.action === 'bid') {
      const min = state.variant === 'esli' ? 8 : state.variant === 'gommeli' ? 8 : 5;
      if (
        !Number.isInteger(action.amount) ||
        action.amount! < min ||
        action.amount! <= state.bid ||
        action.amount! > maximum
      )
        throw new Error('INVALID_BID');
      state.bid = action.amount!;
      state.bidder = seat;
      (state.bidLog ??= []).push({ seat, action: 'bid', amount: action.amount! });
    } else if (action.action === 'pass') {
      state.passed.push(seat);
      (state.bidLog ??= []).push({ seat, action: 'pass' });
    } else throw new Error('BID_OR_PASS_REQUIRED');
    const remaining = Array.from({ length: count }, (_, index) => index).filter(
      (index) => !state.passed.includes(index),
    );
    if (remaining.length <= 1 || state.bid === maximum) {
      if (!state.bid) {
        state.bid = state.variant === 'esli' || state.variant === 'gommeli' ? 8 : 5;
        state.bidder = remaining[0] ?? (state.dealer + 1) % count;
      }
      state.turn = state.bidder;
      state.stage = 'trump';
    } else {
      do state.turn = (state.turn! + 1) % count;
      while (state.passed.includes(state.turn));
    }
  } else if (state.stage === 'trump') {
    if (action.action !== 'trump' || !action.trump) throw new Error('TRUMP_REQUIRED');
    state.trump = action.trump;
    if (state.variant === 'gommeli') {
      state.hands[seat].push(...state.buried);
      state.buried = [];
      state.stage = 'bury';
    } else state.stage = 'playing';
  } else if (state.stage === 'bury') {
    if (
      action.action !== 'bury' ||
      !action.tileIds ||
      action.tileIds.length !== 4 ||
      new Set(action.tileIds).size !== 4 ||
      action.tileIds.some((id) => !state.hands[seat].some((c) => c.id === id))
    )
      throw new Error('FOUR_OWN_CARDS_REQUIRED');
    state.buried = state.hands[seat].filter((c) => action.tileIds!.includes(c.id));
    state.hands[seat] = state.hands[seat].filter((c) => !action.tileIds!.includes(c.id));
    state.stage = 'playing';
  } else {
    if (action.action !== 'play') throw new Error('PLAY_CARD_REQUIRED');
    const card = state.hands[seat].find((c) => c.id === action.cardId);
    if (!card || !batakLegalCards(state, seat).some((c) => c.id === card.id))
      throw new Error('ILLEGAL_CARD');
    state.hands[seat] = state.hands[seat].filter((c) => c.id !== card.id);
    state.trick.push({ seat, card });
    // Trump is broken once it lands on a trick that was led in another suit.
    if (card.suit === state.trump && state.trick[0].card.suit !== state.trump)
      state.trumpBroken = true;
    if (state.trick.length === count) {
      const winner = batakTrickWinner(state.trick, state.trump);
      state.tricks[winner]++;
      state.completedTricks.push({ plays: state.trick, winner });
      state.trick = [];
      state.turn = winner;
      if (!state.hands.some((hand) => hand.length)) {
        state.scores =
          state.variant === 'koz-maca'
            ? state.tricks.map((won, index) =>
                won >= state.bids[index] ? won : -state.bids[index],
              )
            : batakScores(state.variant, state.tricks, state.bidder, state.bid, state.rules);
        state.stage = 'ended';
        state.turn = null;
      }
    } else state.turn = (seat + 1) % count;
  }
  return state;
}
export function batakView(state: BatakRound, viewerSeat: number | null) {
  // Koz Maça plays spades from the deal; elsewhere trump is the bidder's secret-until-chosen pick.
  const trumpChosen =
    state.variant === 'koz-maca' || (state.stage !== 'bidding' && state.stage !== 'trump');
  return {
    variant: state.variant,
    stage: state.stage,
    turn: state.turn,
    bid: state.bid,
    bids: state.bids,
    bidder: state.bidder,
    passed: state.passed,
    bidLog: state.bidLog ?? [],
    trump: trumpChosen ? state.trump : null,
    trumpBroken: isTrumpBroken(state),
    rules: state.rules ?? batakRules(),
    tricks: state.tricks,
    trick: state.trick,
    scores: state.scores,
    winners: state.stage === 'ended' ? batakRoundWinners(state) : null,
    completedTricks: state.completedTricks,
    hands: state.hands.map((hand, index) => ({
      seat: index,
      cards: index === viewerSeat ? hand : [],
      count: hand.length,
    })),
    buriedCount: state.buried.length,
    // Only the Gömmeli bidder may look at their own gömü, and only after burying it (before that
    // `buried` still holds the undealt pool).
    buried:
      viewerSeat !== null &&
      viewerSeat === state.bidder &&
      (state.stage === 'playing' || state.stage === 'ended')
        ? state.buried
        : [],
  };
}
