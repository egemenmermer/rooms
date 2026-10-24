import type { GamePublicState } from '../../../../../packages/activity-protocol/src';
import { array, object, type Card } from '../shared/model';

/** One hand as `blackjackTableView` sends it (every player's cards are open at a real table). */
export interface BlackjackHandView {
  cards: Card[];
  bet: number;
  state: string;
  split?: boolean;
  surrendered?: boolean;
}
export interface BlackjackPlayerView {
  userId: string;
  credits: number;
  hands: BlackjackHandView[];
  activeHand: number;
  bet: number;
  insurance?: number;
  insuranceDecided?: boolean;
  insuranceReturned?: number;
}
export interface BlackjackResult {
  userId: string;
  hand: number;
  outcome: string;
  returned: number;
}
export interface BlackjackRulesView {
  insurance: boolean;
  surrender: boolean;
}
/** Published defaults (`BLACKJACK_DEFAULT_RULES`): insurance on, late surrender off. */
export const DEFAULT_RULES: BlackjackRulesView = { insurance: true, surrender: false };

const point = (card: Card) => (card.rank === 14 ? 1 : Math.min(card.rank, 10));

/**
 * Presentational total of already-delivered cards; game decisions remain server-owned. `soft` is
 * set while an ace can still count 11 without busting, so the table can show "7/17".
 */
export function handTotal(cards: Card[]) {
  const hard = cards.reduce((sum, card) => sum + point(card), 0),
    soft = cards.some((card) => card.rank === 14) && hard + 10 <= 21 ? hard + 10 : null;
  return { hard, soft, best: soft ?? hard };
}
/** "7/17" for a soft hand that is still open, the single best total otherwise. */
export function totalLabel(cards: Card[], settled = false) {
  const { hard, soft, best } = handTotal(cards);
  return soft !== null && !settled && soft !== 21 ? `${hard}/${soft}` : String(best);
}
export const isNatural = (hand: Pick<BlackjackHandView, 'cards' | 'split'>) =>
  hand.cards.length === 2 && !hand.split && handTotal(hand.cards).best === 21;

export function players(game: GamePublicState): BlackjackPlayerView[] {
  return array<Record<string, unknown>>(game.view.players).map((player) => ({
    userId: String(player.userId),
    credits: Number(player.credits ?? 0),
    hands: array<BlackjackHandView>(player.hands),
    activeHand: Number(player.activeHand ?? 0),
    bet: Number(player.bet ?? 0),
    insurance: typeof player.insurance === 'number' ? player.insurance : undefined,
    insuranceDecided: player.insuranceDecided === true,
    insuranceReturned:
      typeof player.insuranceReturned === 'number' ? player.insuranceReturned : undefined,
  }));
}
export const results = (game: GamePublicState) => array<BlackjackResult>(game.view.results);
export function rulesOf(game: GamePublicState): BlackjackRulesView {
  const rules = object(game.view.rules);
  return {
    insurance: typeof rules.insurance === 'boolean' ? rules.insurance : DEFAULT_RULES.insurance,
    surrender: typeof rules.surrender === 'boolean' ? rules.surrender : DEFAULT_RULES.surrender,
  };
}
export const outcomeOf = (list: BlackjackResult[], userId: string, hand: number) =>
  list.find((result) => result.userId === userId && result.hand === hand)?.outcome ?? null;

/**
 * The userId whose decision the table waits for. `view.turn` indexes `view.players` (round
 * order, not seats); views without it (dev harness) fall back to the seat in `game.turn`.
 */
export function actingUserId(game: GamePublicState): string | null {
  if (game.status !== 'playing') return null;
  const list = players(game),
    turn = game.view.turn;
  if (typeof turn === 'number') return list[turn]?.userId ?? null;
  if (turn === null) return null;
  return game.seats.find((seat) => seat.seat === game.turn)?.userId ?? null;
}

/** Chip colours by value, like a real rack: 1 white, 5 red, 25 green, 100 black, 500 purple. */
export const CHIP_VALUES = [500, 100, 25, 5, 1] as const;
export type ChipValue = (typeof CHIP_VALUES)[number];
/** The chips a stack of `amount` is made of, largest at the bottom. */
export function chipStack(amount: number): ChipValue[] {
  const chips: ChipValue[] = [];
  let left = Math.max(0, Math.floor(amount));
  for (const value of CHIP_VALUES)
    while (left >= value) {
      chips.push(value);
      left -= value;
    }
  return chips;
}
/** Buttons that add to the next bet; all even, so any sum stays a legal (even) bet. */
export const BET_CHIPS = [2, 10, 20, 50, 100] as const;
/** The largest even bet a stack covers (bets are even and at least 2). */
export const maxBet = (chips: number) => Math.max(0, chips - (chips % 2));

export type BlackjackMove =
  | {
      kind: 'hit' | 'stand' | 'double' | 'split' | 'surrender' | 'bust';
      userId: string;
      hand: number;
    }
  | { kind: 'insurance' | 'decline-insurance'; userId: string; hand: number };

/**
 * What each player did between two views of the same round, so the table can name an opponent's
 * last move ("Ali kart aldı"). Pure: the server sends no move events.
 */
export function blackjackMoves(
  previous: GamePublicState | null,
  next: GamePublicState,
): BlackjackMove[] {
  if (!previous || previous.history.length !== next.history.length) return [];
  if (previous.status !== 'playing') return [];
  const before = new Map(players(previous).map((player) => [player.userId, player]));
  const moves: BlackjackMove[] = [];
  for (const player of players(next)) {
    const old = before.get(player.userId);
    if (!old) continue;
    if (!old.insuranceDecided && player.insuranceDecided)
      moves.push({
        kind: player.insurance ? 'insurance' : 'decline-insurance',
        userId: player.userId,
        hand: 0,
      });
    if (player.hands.length > old.hands.length) {
      moves.push({ kind: 'split', userId: player.userId, hand: old.activeHand });
      continue;
    }
    player.hands.forEach((hand, index) => {
      const was = old.hands[index];
      if (!was) return;
      if (hand.surrendered && !was.surrendered)
        moves.push({ kind: 'surrender', userId: player.userId, hand: index });
      else if (hand.bet > was.bet)
        moves.push({ kind: 'double', userId: player.userId, hand: index });
      else if (hand.cards.length > was.cards.length && !(was.split && was.cards.length === 1))
        moves.push({
          kind: handTotal(hand.cards).best > 21 ? 'bust' : 'hit',
          userId: player.userId,
          hand: index,
        });
      else if (
        was.state === 'playing' &&
        hand.state === 'stood' &&
        hand.cards.length === was.cards.length
      )
        moves.push({ kind: 'stand', userId: player.userId, hand: index });
    });
  }
  return moves;
}
