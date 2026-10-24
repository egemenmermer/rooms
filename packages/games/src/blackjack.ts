import { shuffledDeck, type Card } from './cards';
export interface BlackjackHand {
  cards: Card[];
  bet: number;
  state: 'playing' | 'stood' | 'bust';
  split: boolean;
  /** Late surrender: the hand is closed and half the bet comes back (table rule, off by default). */
  surrendered?: boolean;
}
export interface BlackjackRound {
  revision: number;
  shoe: Card[];
  dealer: Card[];
  hands: BlackjackHand[];
  activeHand: number;
  finished: boolean;
  credits: number;
  results: { hand: number; outcome: 'win' | 'lose' | 'push' | 'blackjack'; returned: number }[];
}
export function blackjackTotal(cards: Card[]) {
  let total = 0,
    aces = 0;
  for (const card of cards) {
    if (card.rank === 14) {
      total += 11;
      aces++;
    } else total += Math.min(10, card.rank);
  }
  while (total > 21 && aces--) total -= 10;
  return total;
}
/** A natural is a two-card 21 on an unsplit hand. */
export function isBlackjackNatural(hand: Pick<BlackjackHand, 'cards' | 'split'>) {
  return !hand.split && hand.cards.length === 2 && blackjackTotal(hand.cards) === 21;
}
/** The dealer only plays out when a hand is still contested: not bust, not a paid natural. */
export function hasContestedHand(hands: BlackjackHand[]) {
  return hands.some((h) => h.state !== 'bust' && !h.surrendered && !isBlackjackNatural(h));
}
/** Second card of a split hand, dealt when play reaches it rather than at the split. */
function dealPending(round: BlackjackRound, hand: BlackjackHand) {
  if (hand.cards.length !== 1) return;
  hand.cards.push(draw(round));
  if (hand.cards[0].rank === 14 || blackjackTotal(hand.cards) === 21) hand.state = 'stood';
}
function draw(round: BlackjackRound): Card {
  const card = round.shoe.shift();
  if (!card) throw new Error('SHOE_EMPTY');
  return card;
}
function settle(round: BlackjackRound) {
  if (hasContestedHand(round.hands))
    while (blackjackTotal(round.dealer) < 17) round.dealer.push(draw(round));
  round.finished = true;
  const dealer = blackjackTotal(round.dealer),
    dealerNatural = dealer === 21 && round.dealer.length === 2;
  round.results = round.hands.map((hand, index) => {
    const value = blackjackTotal(hand.cards),
      natural = value === 21 && hand.cards.length === 2 && !hand.split;
    const outcome =
      value > 21
        ? 'lose'
        : natural && !dealerNatural
          ? 'blackjack'
          : dealerNatural && !natural
            ? 'lose'
            : value === dealer
              ? 'push'
              : dealer > 21 || value > dealer
                ? 'win'
                : 'lose';
    const returned =
      outcome === 'blackjack'
        ? hand.bet * 2.5
        : outcome === 'win'
          ? hand.bet * 2
          : outcome === 'push'
            ? hand.bet
            : 0;
    round.credits += returned;
    return { hand: index, outcome, returned };
  });
}
function advance(round: BlackjackRound) {
  while (round.activeHand < round.hands.length) {
    const hand = round.hands[round.activeHand];
    if (hand.state === 'playing') dealPending(round, hand);
    if (hand.state === 'playing') break;
    round.activeHand++;
  }
  if (round.activeHand >= round.hands.length) settle(round);
}
export function startBlackjack(
  credits: number,
  bet: number,
  shoe = shuffledDeck(6),
): BlackjackRound {
  if (
    !Number.isSafeInteger(credits) ||
    !Number.isSafeInteger(bet) ||
    bet < 2 ||
    bet % 2 ||
    bet > credits ||
    shoe.length < 52
  )
    throw new Error('INVALID_VIRTUAL_BET');
  const round: BlackjackRound = {
    revision: 1,
    shoe: [...shoe],
    dealer: [],
    hands: [{ cards: [], bet, state: 'playing', split: false }],
    activeHand: 0,
    finished: false,
    credits: credits - bet,
    results: [],
  };
  round.hands[0].cards.push(draw(round));
  round.dealer.push(draw(round));
  round.hands[0].cards.push(draw(round));
  round.dealer.push(draw(round));
  if (blackjackTotal(round.dealer) === 21 || blackjackTotal(round.hands[0].cards) === 21) {
    round.hands[0].state = 'stood';
    settle(round);
  }
  return round;
}
export function blackjackAction(
  state: BlackjackRound,
  expectedRevision: number,
  action: 'hit' | 'stand' | 'double' | 'split',
): BlackjackRound {
  if (state.revision !== expectedRevision) throw new Error('REVISION_CONFLICT');
  if (state.finished) throw new Error('ROUND_FINISHED');
  const round = structuredClone(state),
    hand = round.hands[round.activeHand];
  if (!hand || hand.state !== 'playing') throw new Error('HAND_NOT_ACTIVE');
  switch (action) {
    case 'hit':
      hand.cards.push(draw(round));
      if (blackjackTotal(hand.cards) >= 21)
        hand.state = blackjackTotal(hand.cards) > 21 ? 'bust' : 'stood';
      break;
    case 'stand':
      hand.state = 'stood';
      break;
    case 'double':
      if (hand.cards.length !== 2 || hand.bet > round.credits)
        throw new Error('DOUBLE_UNAVAILABLE');
      round.credits -= hand.bet;
      hand.bet *= 2;
      hand.cards.push(draw(round));
      hand.state = blackjackTotal(hand.cards) > 21 ? 'bust' : 'stood';
      break;
    case 'split': {
      if (
        hand.cards.length !== 2 ||
        (hand.cards[0].rank === 14 ? 11 : Math.min(hand.cards[0].rank, 10)) !==
          (hand.cards[1].rank === 14 ? 11 : Math.min(hand.cards[1].rank, 10)) ||
        hand.bet > round.credits ||
        round.hands.length >= 4
      )
        throw new Error('SPLIT_UNAVAILABLE');
      round.credits -= hand.bet;
      const card = hand.cards.pop()!;
      hand.split = true;
      hand.cards.push(draw(round));
      const other: BlackjackHand = {
        cards: [card],
        bet: hand.bet,
        state: 'playing',
        split: true,
      };
      round.hands.splice(round.activeHand + 1, 0, other);
      if (card.rank === 14 || blackjackTotal(hand.cards) === 21) hand.state = 'stood';
      break;
    }
  }
  advance(round);
  round.revision++;
  return round;
}
export function blackjackView(round: BlackjackRound) {
  // Neither the shoe nor dealer hole card is sent until the round ends.
  return {
    revision: round.revision,
    dealer: round.finished ? round.dealer : round.dealer.slice(0, 1),
    dealerHiddenCount: round.finished ? 0 : 1,
    hands: round.hands,
    activeHand: round.activeHand,
    finished: round.finished,
    credits: round.credits,
    results: round.results,
  };
}
