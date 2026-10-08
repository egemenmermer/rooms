import { shuffledDeck, type Card, type Suit } from './cards';
import { batakScores, batakTrickWinner, legalBatakCards, type BatakVariant, type TrickPlay } from './batak';
export interface BatakRound { variant: BatakVariant; hands: Card[][]; buried: Card[]; trick: TrickPlay[]; tricks: number[]; stage: 'bidding' | 'trump' | 'bury' | 'playing' | 'ended'; turn: number | null; dealer: number; bid: number; bids: number[]; bidder: number; passed: number[]; trump: Suit; scores: number[]; completedTricks: { plays: TrickPlay[]; winner: number }[] }
export function startBatak(variant: BatakVariant, dealer: number, deck = shuffledDeck()): BatakRound {
  const count = variant === 'gommeli' ? 3 : 4;
  if (deck.length !== 52 || new Set(deck.map(c => c.id)).size !== 52) throw new Error('INVALID_DECK');
  const hands: Card[][] = Array.from({ length: count }, () => []), cards = [...deck];
  const buried = variant === 'gommeli' ? cards.splice(-4) : [];
  while (cards.length) for (let i = 1; i <= count; i++) hands[(dealer + i) % count].push(cards.shift()!);
  return { variant, hands, buried, trick: [], tricks: Array(count).fill(0), stage: 'bidding', turn: (dealer + 1) % count, dealer, bid: 0, bids: Array(count).fill(0), bidder: (dealer + 1) % count, passed: [], trump: 'spades', scores: [], completedTricks: [] };
}
export function batakAction(value: BatakRound, seat: number, action: { action: string; amount?: number; cardId?: string; tileIds?: string[]; trump?: Suit }): BatakRound {
  if (value.stage === 'ended' || value.turn !== seat) throw new Error('NOT_YOUR_TURN');
  const state = structuredClone(value), count = state.hands.length, maximum = state.variant === 'gommeli' ? 16 : 13;
  if (state.stage === 'bidding') {
    if (state.variant === 'koz-maca') {
      if (action.action !== 'bid' && action.action !== 'pass') throw new Error('BID_OR_PASS_REQUIRED');
      const bid = action.action === 'pass' ? 1 : action.amount;
      if (!Number.isInteger(bid) || bid! < 1 || bid! > 13) throw new Error('INVALID_BID');
      state.bids[seat] = bid!; state.passed.push(seat);
      if (state.passed.length === count) { state.stage = 'playing'; state.turn = (state.dealer + 1) % count; } else state.turn = (seat + 1) % count;
      return state;
    }
    if (action.action === 'bid') { const min = state.variant === 'esli' ? 8 : state.variant === 'gommeli' ? 8 : 5; if (!Number.isInteger(action.amount) || action.amount! < min || action.amount! <= state.bid || action.amount! > maximum) throw new Error('INVALID_BID'); state.bid = action.amount!; state.bidder = seat; }
    else if (action.action === 'pass') state.passed.push(seat); else throw new Error('BID_OR_PASS_REQUIRED');
    const remaining = Array.from({ length: count }, (_, index) => index).filter(index => !state.passed.includes(index));
    if (remaining.length <= 1 || state.bid === maximum) {
      if (!state.bid) { state.bid = state.variant === 'esli' || state.variant === 'gommeli' ? 8 : 5; state.bidder = remaining[0] ?? (state.dealer + 1) % count; }
      state.turn = state.bidder;
      state.stage = 'trump';
    } else { do state.turn = (state.turn! + 1) % count; while (state.passed.includes(state.turn)); }
  } else if (state.stage === 'trump') {
    if (action.action !== 'trump' || !action.trump) throw new Error('TRUMP_REQUIRED'); state.trump = action.trump;
    if (state.variant === 'gommeli') { state.hands[seat].push(...state.buried); state.buried = []; state.stage = 'bury'; } else state.stage = 'playing';
  } else if (state.stage === 'bury') {
    if (action.action !== 'bury' || !action.tileIds || action.tileIds.length !== 4 || new Set(action.tileIds).size !== 4 || action.tileIds.some(id => !state.hands[seat].some(c => c.id === id))) throw new Error('FOUR_OWN_CARDS_REQUIRED');
    state.buried = state.hands[seat].filter(c => action.tileIds!.includes(c.id)); state.hands[seat] = state.hands[seat].filter(c => !action.tileIds!.includes(c.id)); state.stage = 'playing';
  } else {
    if (action.action !== 'play') throw new Error('PLAY_CARD_REQUIRED');
    const card = state.hands[seat].find(c => c.id === action.cardId); if (!card || !legalBatakCards(state.hands[seat], state.trick, state.trump).some(c => c.id === card.id)) throw new Error('ILLEGAL_CARD');
    state.hands[seat] = state.hands[seat].filter(c => c.id !== card.id); state.trick.push({ seat, card });
    if (state.trick.length === count) { const winner = batakTrickWinner(state.trick, state.trump); state.tricks[winner]++; state.completedTricks.push({ plays: state.trick, winner }); state.trick = []; state.turn = winner;
      if (!state.hands.some(hand => hand.length)) { state.scores = state.variant === 'koz-maca' ? state.tricks.map((won, index) => won >= state.bids[index] ? won : -state.bids[index]) : batakScores(state.variant, state.tricks, state.bidder, state.bid); state.stage = 'ended'; state.turn = null; }
    } else state.turn = (seat + 1) % count;
  }
  return state;
}
export function batakView(state: BatakRound, viewerSeat: number | null) {
  return { variant: state.variant, stage: state.stage, turn: state.turn, bid: state.bid, bids: state.bids, bidder: state.bidder, trump: state.trump, tricks: state.tricks, trick: state.trick, scores: state.scores, completedTricks: state.completedTricks,
    hands: state.hands.map((hand, index) => ({ seat: index, cards: index === viewerSeat ? hand : [], count: hand.length })), buriedCount: state.buried.length };
}
