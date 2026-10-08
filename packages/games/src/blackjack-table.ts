import { shuffledDeck, type Card } from './cards';
import { blackjackTotal, type BlackjackHand } from './blackjack';
export interface BlackjackPlayer { userId: string; credits: number; hands: BlackjackHand[]; activeHand: number; bet: number }
export interface BlackjackTableRound { revision: number; shoe: Card[]; dealer: Card[]; players: BlackjackPlayer[]; turn: number | null; finished: boolean; results: { userId: string; hand: number; outcome: string; returned: number }[] }
function draw(round: BlackjackTableRound) { const card = round.shoe.shift(); if (!card) throw new Error('SHOE_EMPTY'); return card; }
function settle(round: BlackjackTableRound) {
  while (round.players.some(p => p.hands.some(h => h.state !== 'bust')) && blackjackTotal(round.dealer) < 17) round.dealer.push(draw(round));
  const total = blackjackTotal(round.dealer), natural = total === 21 && round.dealer.length === 2;
  for (const player of round.players) for (const [index, hand] of player.hands.entries()) {
    const value = blackjackTotal(hand.cards), blackjack = value === 21 && hand.cards.length === 2 && !hand.split;
    const outcome = value > 21 ? 'lose' : blackjack && !natural ? 'blackjack' : natural && !blackjack ? 'lose' : value === total ? 'push' : total > 21 || value > total ? 'win' : 'lose';
    const returned = outcome === 'blackjack' ? hand.bet * 2.5 : outcome === 'win' ? hand.bet * 2 : outcome === 'push' ? hand.bet : 0;
    player.credits += returned; round.results.push({ userId: player.userId, hand: index, outcome, returned });
  }
  round.finished = true; round.turn = null;
}
function advance(round: BlackjackTableRound) {
  for (let i = 0; i < round.players.length; i++) { const player = round.players[i]; while (player.activeHand < player.hands.length && player.hands[player.activeHand].state !== 'playing') player.activeHand++; if (player.activeHand < player.hands.length) { round.turn = i; return; } }
  settle(round);
}
export function startBlackjackTable(players: { userId: string; credits: number; bet: number }[], shoe = shuffledDeck(6)): BlackjackTableRound {
  if (!players.length || players.length > 7 || new Set(players.map(p => p.userId)).size !== players.length || players.some(p => !Number.isSafeInteger(p.bet) || p.bet < 2 || p.bet % 2 || p.bet > p.credits)) throw new Error('INVALID_BLACKJACK_TABLE');
  const round: BlackjackTableRound = { revision: 1, shoe: [...shoe], dealer: [], players: players.map(p => ({ ...p, credits: p.credits - p.bet, hands: [{ cards: [], bet: p.bet, state: 'playing', split: false }], activeHand: 0 })), turn: 0, finished: false, results: [] };
  for (let i = 0; i < 2; i++) { for (const player of round.players) player.hands[0].cards.push(draw(round)); round.dealer.push(draw(round)); }
  for (const player of round.players) if (blackjackTotal(player.hands[0].cards) === 21) player.hands[0].state = 'stood';
  if (blackjackTotal(round.dealer) === 21) settle(round); else advance(round);
  return round;
}
export function blackjackTableAction(value: BlackjackTableRound, userId: string, action: 'hit' | 'stand' | 'double' | 'split'): BlackjackTableRound {
  if (value.finished || value.turn === null) throw new Error('ROUND_FINISHED');
  if (value.players[value.turn].userId !== userId) throw new Error('NOT_YOUR_TURN');
  const round = structuredClone(value), player = round.players[round.turn!], hand = player.hands[player.activeHand];
  const point = (card: Card) => card.rank === 14 ? 11 : Math.min(10, card.rank);
  switch (action) {
    case 'hit': hand.cards.push(draw(round)); if (blackjackTotal(hand.cards) >= 21) hand.state = blackjackTotal(hand.cards) > 21 ? 'bust' : 'stood'; break;
    case 'stand': hand.state = 'stood'; break;
    case 'double': if (hand.cards.length !== 2 || hand.bet > player.credits) throw new Error('DOUBLE_UNAVAILABLE'); player.credits -= hand.bet; hand.bet *= 2; hand.cards.push(draw(round)); hand.state = blackjackTotal(hand.cards) > 21 ? 'bust' : 'stood'; break;
    case 'split': if (hand.cards.length !== 2 || point(hand.cards[0]) !== point(hand.cards[1]) || hand.bet > player.credits || player.hands.length >= 4) throw new Error('SPLIT_UNAVAILABLE');
      player.credits -= hand.bet; const moved = hand.cards.pop()!; hand.split = true; hand.cards.push(draw(round)); const other: BlackjackHand = { cards: [moved, draw(round)], bet: hand.bet, state: 'playing', split: true }; player.hands.splice(player.activeHand + 1, 0, other); if (moved.rank === 14 || blackjackTotal(hand.cards) === 21) hand.state = 'stood'; if (moved.rank === 14 || blackjackTotal(other.cards) === 21) other.state = 'stood'; break;
  }
  round.revision++; advance(round); return round;
}
export function blackjackTableView(round: BlackjackTableRound) {
  return { revision: round.revision, dealer: round.finished ? round.dealer : round.dealer.slice(0, 1), dealerHiddenCount: round.finished ? 0 : 1, players: round.players.map(({ hands, ...player }) => ({ ...player, hands })), turn: round.turn, finished: round.finished, results: round.results };
}
