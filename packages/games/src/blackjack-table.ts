import { shuffledDeck, type Card } from './cards';
import {
  blackjackTotal,
  hasContestedHand,
  isBlackjackNatural,
  type BlackjackHand,
} from './blackjack';

/** Table rule switches. Published defaults: insurance on, late surrender off. */
export interface BlackjackRules {
  /** Offer insurance (half the bet, pays 2:1) when the dealer shows an ace, before the peek. */
  insurance: boolean;
  /** Offer late surrender (half the bet back) on the first decision of an unsplit hand. */
  surrender: boolean;
}
export const BLACKJACK_DEFAULT_RULES: Readonly<BlackjackRules> = Object.freeze({
  insurance: true,
  surrender: false,
});
export type BlackjackTableAction =
  'hit' | 'stand' | 'double' | 'split' | 'surrender' | 'insurance' | 'decline-insurance';
export interface BlackjackPlayer {
  userId: string;
  credits: number;
  hands: BlackjackHand[];
  activeHand: number;
  bet: number;
  /** Insurance stake taken this round (0 when declined); absent on rounds stored before insurance. */
  insurance?: number;
  /** True once the player answered the insurance prompt. */
  insuranceDecided?: boolean;
  /** Payout of the insurance side bet at settlement (stake included). */
  insuranceReturned?: number;
}
export interface BlackjackTableRound {
  revision: number;
  shoe: Card[];
  dealer: Card[];
  players: BlackjackPlayer[];
  turn: number | null;
  finished: boolean;
  results: { userId: string; hand: number; outcome: string; returned: number }[];
  /** Table rules for this round; absent on rounds stored before the options existed. */
  rules?: BlackjackRules;
  /** The insurance prompt is open: `turn` is the player who must answer, nobody plays yet. */
  insurancePending?: boolean;
}
const insuranceStake = (player: BlackjackPlayer) => player.hands[0].bet / 2;
const canInsure = (player: BlackjackPlayer) =>
  !player.insuranceDecided && player.credits >= insuranceStake(player);
function draw(round: BlackjackTableRound) {
  const card = round.shoe.shift();
  if (!card) throw new Error('SHOE_EMPTY');
  return card;
}
/** Second card of a split hand, dealt when play reaches it rather than at the split. */
function dealPending(round: BlackjackTableRound, hand: BlackjackHand) {
  if (hand.cards.length !== 1) return;
  hand.cards.push(draw(round));
  if (hand.cards[0].rank === 14 || blackjackTotal(hand.cards) === 21) hand.state = 'stood';
}
function settle(round: BlackjackTableRound) {
  if (hasContestedHand(round.players.flatMap((p) => p.hands)))
    while (blackjackTotal(round.dealer) < 17) round.dealer.push(draw(round));
  const total = blackjackTotal(round.dealer),
    natural = total === 21 && round.dealer.length === 2;
  for (const player of round.players) {
    if (player.insurance) {
      player.insuranceReturned = natural ? player.insurance * 3 : 0;
      player.credits += player.insuranceReturned;
    }
    for (const [index, hand] of player.hands.entries()) {
      const value = blackjackTotal(hand.cards),
        blackjack = isBlackjackNatural(hand);
      const outcome = hand.surrendered
        ? 'surrender'
        : value > 21
          ? 'lose'
          : blackjack && !natural
            ? 'blackjack'
            : natural && !blackjack
              ? 'lose'
              : value === total
                ? 'push'
                : total > 21 || value > total
                  ? 'win'
                  : 'lose';
      const returned =
        outcome === 'blackjack'
          ? hand.bet * 2.5
          : outcome === 'win'
            ? hand.bet * 2
            : outcome === 'push'
              ? hand.bet
              : outcome === 'surrender'
                ? hand.bet / 2
                : 0;
      player.credits += returned;
      round.results.push({ userId: player.userId, hand: index, outcome, returned });
    }
  }
  round.finished = true;
  round.turn = null;
}
function advance(round: BlackjackTableRound) {
  for (let i = 0; i < round.players.length; i++) {
    const player = round.players[i];
    while (player.activeHand < player.hands.length) {
      const hand = player.hands[player.activeHand];
      if (hand.state === 'playing') dealPending(round, hand);
      if (hand.state === 'playing') break;
      player.activeHand++;
    }
    if (player.activeHand < player.hands.length) {
      round.turn = i;
      return;
    }
  }
  settle(round);
}
export function startBlackjackTable(
  players: { userId: string; credits: number; bet: number }[],
  shoe = shuffledDeck(6),
  rules?: Partial<BlackjackRules>,
): BlackjackTableRound {
  if (
    !players.length ||
    players.length > 7 ||
    new Set(players.map((p) => p.userId)).size !== players.length ||
    players.some((p) => !Number.isSafeInteger(p.bet) || p.bet < 2 || p.bet % 2 || p.bet > p.credits)
  )
    throw new Error('INVALID_BLACKJACK_TABLE');
  const round: BlackjackTableRound = {
    revision: 1,
    shoe: [...shoe],
    dealer: [],
    players: players.map((p) => ({
      ...p,
      credits: p.credits - p.bet,
      hands: [{ cards: [], bet: p.bet, state: 'playing', split: false }],
      activeHand: 0,
    })),
    turn: 0,
    finished: false,
    results: [],
    rules: { ...BLACKJACK_DEFAULT_RULES, ...(rules ?? {}) },
  };
  for (let i = 0; i < 2; i++) {
    for (const player of round.players) player.hands[0].cards.push(draw(round));
    round.dealer.push(draw(round));
  }
  for (const player of round.players)
    if (blackjackTotal(player.hands[0].cards) === 21) player.hands[0].state = 'stood';
  // An ace up opens the insurance prompt before the dealer peeks at the hole card.
  const firstInsurer = round.players.findIndex(canInsure);
  if (round.dealer[0].rank === 14 && round.rules!.insurance && firstInsurer >= 0) {
    round.insurancePending = true;
    round.turn = firstInsurer;
  } else if (blackjackTotal(round.dealer) === 21) settle(round);
  else advance(round);
  return round;
}
export function blackjackTableAction(
  value: BlackjackTableRound,
  userId: string,
  action: BlackjackTableAction,
): BlackjackTableRound {
  if (value.finished || value.turn === null) throw new Error('ROUND_FINISHED');
  if (value.players[value.turn].userId !== userId) throw new Error('NOT_YOUR_TURN');
  const round = structuredClone(value),
    player = round.players[round.turn!],
    hand = player.hands[player.activeHand];
  if (round.insurancePending) {
    // Hit/stand count as declining so bots and timeouts (which only know those two) never stall
    // the prompt; any other play is refused until the player has answered.
    if (action === 'insurance') {
      if (!canInsure(player)) throw new Error('INSURANCE_UNAVAILABLE');
      player.credits -= insuranceStake(player);
      player.insurance = insuranceStake(player);
    } else if (action !== 'decline-insurance' && action !== 'hit' && action !== 'stand')
      throw new Error('INSURANCE_DECISION_REQUIRED');
    player.insuranceDecided = true;
    const next = round.players.findIndex(canInsure);
    if (next >= 0) round.turn = next;
    else {
      round.insurancePending = false;
      // The dealer now peeks: a natural ends the round and settles insurance, else play starts.
      if (blackjackTotal(round.dealer) === 21) settle(round);
      else advance(round);
    }
    round.revision++;
    return round;
  }
  if (action === 'insurance' || action === 'decline-insurance')
    throw new Error('INSURANCE_UNAVAILABLE');
  const point = (card: Card) => (card.rank === 14 ? 11 : Math.min(10, card.rank));
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
      if (hand.cards.length !== 2 || hand.bet > player.credits)
        throw new Error('DOUBLE_UNAVAILABLE');
      player.credits -= hand.bet;
      hand.bet *= 2;
      hand.cards.push(draw(round));
      hand.state = blackjackTotal(hand.cards) > 21 ? 'bust' : 'stood';
      break;
    case 'surrender':
      if (!round.rules?.surrender || hand.cards.length !== 2 || hand.split)
        throw new Error('SURRENDER_UNAVAILABLE');
      hand.surrendered = true;
      hand.state = 'stood';
      break;
    case 'split':
      if (
        hand.cards.length !== 2 ||
        point(hand.cards[0]) !== point(hand.cards[1]) ||
        hand.bet > player.credits ||
        player.hands.length >= 4
      )
        throw new Error('SPLIT_UNAVAILABLE');
      player.credits -= hand.bet;
      const moved = hand.cards.pop()!;
      hand.split = true;
      hand.cards.push(draw(round));
      const other: BlackjackHand = {
        cards: [moved],
        bet: hand.bet,
        state: 'playing',
        split: true,
      };
      player.hands.splice(player.activeHand + 1, 0, other);
      if (moved.rank === 14 || blackjackTotal(hand.cards) === 21) hand.state = 'stood';
      break;
  }
  round.revision++;
  advance(round);
  return round;
}
export function blackjackTableView(round: BlackjackTableRound) {
  return {
    revision: round.revision,
    dealer: round.finished ? round.dealer : round.dealer.slice(0, 1),
    dealerHiddenCount: round.finished ? 0 : 1,
    players: round.players.map(({ hands, ...player }) => ({ ...player, hands })),
    turn: round.turn,
    insurancePending: round.insurancePending ?? false,
    rules: round.rules ?? BLACKJACK_DEFAULT_RULES,
    finished: round.finished,
    results: round.results,
  };
}
