import { compareScores, evaluateHoldemDetailed, type EvaluatedHoldemHand, shuffledDeck, sidePots, type Card } from './cards';
export interface HoldemSeat { userId: string; chips: number; cards: Card[]; folded: boolean; streetBet: number; contribution: number; actedAt: number | null }
export interface HoldemPotResult { kind: 'main' | 'side'; amount: number; eligible: string[]; winners: string[]; awards: Record<string,number>; split: boolean }
export interface HoldemSettlement { reason: 'uncontested' | 'showdown'; pots: HoldemPotResult[]; hands: Record<string,EvaluatedHoldemHand> }
export interface HoldemHand { revision: number; button: number; turn: number | null; stage: 'preflop' | 'flop' | 'turn' | 'river' | 'ended'; deck: Card[]; board: Card[]; seats: HoldemSeat[]; maximumBet: number; minimumRaise: number; bigBlind: number; payouts: Record<string, number>; winners: string[]; settlement?: HoldemSettlement }
export type HoldemAction = { type: 'fold' | 'check' | 'call' } | { type: 'raise'; to: number };
const next = (state: HoldemHand, seat: number, predicate: (seat: HoldemSeat) => boolean) => {
  for (let offset = 1; offset <= state.seats.length; offset++) { const index = (seat + offset) % state.seats.length; if (predicate(state.seats[index])) return index; }
  return null;
};
function pay(seat: HoldemSeat, amount: number) { const paid = Math.min(seat.chips, amount); seat.chips -= paid; seat.streetBet += paid; seat.contribution += paid; }
function draw(state: HoldemHand): Card { const card = state.deck.shift(); if (!card) throw new Error('DECK_EMPTY'); return card; }
function award(state: HoldemHand, winners: string[], amount: number) {
  // Odd chips go clockwise from the button, deterministic and publicly explainable.
  const ordered = state.seats.map((_, index) => (state.button + index + 1) % state.seats.length).filter(index => winners.includes(state.seats[index].userId));
  if (!ordered.length) throw new Error('POT_WITHOUT_ELIGIBLE_WINNER');
  const share = Math.floor(amount / ordered.length), remainder = amount % ordered.length;
  const awards: Record<string,number> = {};
  ordered.forEach((index, order) => { const value = share + (order < remainder ? 1 : 0), seat = state.seats[index]; seat.chips += value; awards[seat.userId] = value; state.payouts[seat.userId] = (state.payouts[seat.userId] ?? 0) + value; });
  return awards;
}
function showdown(state: HoldemHand) {
  const remaining = state.seats.filter(s => !s.folded);
  const settlement: HoldemSettlement = { reason: remaining.length === 1 ? 'uncontested' : 'showdown', pots: [], hands: {} };
  if (remaining.length === 1) {
    const amount = state.seats.reduce((sum, s) => sum + s.contribution, 0), winners = [remaining[0].userId];
    settlement.pots.push({ kind: 'main', amount, eligible: winners, winners, awards: award(state, winners, amount), split: false });
  } else {
    for (const seat of remaining) settlement.hands[seat.userId] = evaluateHoldemDetailed([...seat.cards, ...state.board]);
    for (const [index,pot] of sidePots(state.seats.map(s => ({ userId: s.userId, amount: s.contribution, folded: s.folded }))).entries()) {
      let best: number[] = [], winners: string[] = [];
      for (const userId of pot.eligible) { const score = settlement.hands[userId].score; const comparison = best.length ? compareScores(score, best) : 1; if (comparison > 0) { best = score; winners = [userId]; } else if (comparison === 0) winners.push(userId); }
      settlement.pots.push({ kind: index === 0 ? 'main' : 'side', ...pot, winners, awards: award(state, winners, pot.amount), split: winners.length > 1 });
    }
  }
  state.settlement = settlement;
  state.winners = Object.keys(state.payouts).filter(userId => state.payouts[userId] > 0); state.stage = 'ended'; state.turn = null;
}
function progress(state: HoldemHand, previousTurn: number) {
  const live = state.seats.filter(s => !s.folded);
  if (live.length === 1) { showdown(state); return; }
  const acting = live.filter(s => s.chips > 0);
  const bettingComplete = acting.every(s => s.actedAt !== null && s.streetBet === state.maximumBet);
  const noFurtherBetting = acting.length <= 1 && acting.every(s => s.streetBet >= state.maximumBet);
  if (!bettingComplete && !noFurtherBetting) {
    state.turn = next(state, previousTurn, s => !s.folded && s.chips > 0 && (s.actedAt === null || s.streetBet < state.maximumBet)); return;
  }
  if (state.stage === 'river') { showdown(state); return; }
  // Burn one card before each community street, as in a physical friends' table.
  draw(state);
  if (state.stage === 'preflop') { state.board.push(draw(state), draw(state), draw(state)); state.stage = 'flop'; }
  else { state.board.push(draw(state)); state.stage = state.stage === 'flop' ? 'turn' : 'river'; }
  state.maximumBet = 0; state.minimumRaise = state.bigBlind;
  state.seats.forEach(s => { s.streetBet = 0; s.actedAt = null; });
  if (acting.length <= 1) { progress(state, state.button); return; }
  state.turn = next(state, state.button, s => !s.folded && s.chips > 0);
}
export function startHoldem(players: { userId: string; chips: number }[], button: number, smallBlind: number, bigBlind: number, deck = shuffledDeck()): HoldemHand {
  if (players.length < 2 || players.length > 9 || new Set(players.map(p => p.userId)).size !== players.length || players.some(p => !p.userId || !Number.isSafeInteger(p.chips) || p.chips < bigBlind) || !Number.isInteger(button) || button < 0 || button >= players.length || !Number.isSafeInteger(smallBlind) || smallBlind <= 0 || !Number.isSafeInteger(bigBlind) || bigBlind < smallBlind || deck.length < 52 || new Set(deck.map(c => c.id)).size !== deck.length) throw new Error('INVALID_HOLDEM_TABLE');
  const state: HoldemHand = { revision: 1, button, turn: null, stage: 'preflop', deck: [...deck], board: [], seats: players.map(p => ({ ...p, cards: [], folded: false, streetBet: 0, contribution: 0, actedAt: null })), maximumBet: bigBlind, minimumRaise: bigBlind, bigBlind, payouts: {}, winners: [] };
  for (let round = 0; round < 2; round++) for (let offset = 1; offset <= players.length; offset++) state.seats[(button + offset) % players.length].cards.push(draw(state));
  const small = players.length === 2 ? button : (button + 1) % players.length, big = (small + 1) % players.length;
  pay(state.seats[small], smallBlind); pay(state.seats[big], bigBlind);
  state.turn = next(state, big, seat => seat.chips > 0);
  return state;
}
export function holdemAction(value: HoldemHand, userId: string, expectedRevision: number, action: HoldemAction): HoldemHand {
  if (value.revision !== expectedRevision) throw new Error('REVISION_CONFLICT');
  if (value.stage === 'ended' || value.turn === null) throw new Error('HAND_FINISHED');
  if (value.seats[value.turn].userId !== userId) throw new Error('NOT_YOUR_TURN');
  const state = structuredClone(value), turn = state.turn!, seat = state.seats[turn];
  switch (action.type) {
    case 'fold': seat.folded = true; break;
    case 'check': if (seat.streetBet !== state.maximumBet) throw new Error('CHECK_UNAVAILABLE'); break;
    case 'call': pay(seat, state.maximumBet - seat.streetBet); break;
    case 'raise': {
      if (!Number.isSafeInteger(action.to) || action.to <= state.maximumBet || action.to > seat.streetBet + seat.chips) throw new Error('INVALID_RAISE');
      if (seat.actedAt !== null && state.maximumBet - seat.actedAt < state.minimumRaise) throw new Error('BETTING_NOT_REOPENED');
      const increment = action.to - state.maximumBet, allIn = action.to === seat.streetBet + seat.chips;
      if (increment < state.minimumRaise && !allIn) throw new Error('RAISE_TOO_SMALL');
      pay(seat, action.to - seat.streetBet);
      if (increment >= state.minimumRaise) { state.minimumRaise = increment; state.seats.forEach(s => { if (s !== seat) s.actedAt = null; }); }
      state.maximumBet = action.to; break;
    }
  }
  seat.actedAt = state.maximumBet; state.revision++; progress(state, turn); return state;
}
export function holdemView(state: HoldemHand, userId: string) {
  const reveal = state.stage === 'ended' && state.seats.filter(s => !s.folded).length > 1;
  const own = state.seats.find(seat => seat.userId === userId);
  const ownHand = own && own.cards.length + state.board.length >= 5 ? evaluateHoldemDetailed([...own.cards, ...state.board]) : null;
  return { ownHand, showdown: reveal ? state.settlement?.hands ?? null : null, settlementReason: state.settlement?.reason ?? null, pots: state.settlement?.pots ?? sidePots(state.seats.map(seat => ({userId:seat.userId,amount:seat.contribution,folded:seat.folded}))).map((pot,index)=>({kind:index===0?'main' as const:'side' as const,...pot,winners:[],awards:{},split:false})), revision: state.revision, button: state.button, turn: state.turn, stage: state.stage, board: state.board, maximumBet: state.maximumBet, minimumRaise: state.minimumRaise, payouts: state.payouts, winners: state.winners,
    seats: state.seats.map(({ cards, actedAt: _actedAt, ...seat }) => ({ ...seat, cards: seat.userId === userId || reveal && !seat.folded ? cards : [], hiddenCardCount: seat.userId === userId || reveal && !seat.folded ? 0 : cards.length })) };
}
