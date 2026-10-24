import { legalBatakCards, type BatakRules } from '../../../../../packages/games/src/batak';
import type { Card as EngineCard, Suit } from '../../../../../packages/games/src/cards';
import type { GamePublicState } from '../../../../../packages/activity-protocol/src';
import { t } from '../../i18n';
import { array, object, type Card } from '../shared/model';

/**
 * Client-side reading of the Batak view (`batakView` in packages/games/src/batak-table.ts).
 *
 * Every seat number in the view is a ROUND index (position in the seat-ordered player list), not
 * `game.seats[].seat`: `bids`, `tricks`, `hands[].seat`, `trick[].seat`, `bidLog[].seat`,
 * `completedTricks[].plays[].seat` and `.winner`, `bidder`, `turn` and the scores in history.
 */
export type BatakVariant = 'ihaleli' | 'esli' | 'koz-maca' | 'gommeli';
export type BatakStage = 'bidding' | 'trump' | 'bury' | 'playing' | 'ended';
export interface TrickPlay {
  seat: number;
  card: Card;
}
export interface BidEntry {
  seat: number;
  action: 'bid' | 'pass';
  amount?: number;
}
export interface BatakState {
  variant: BatakVariant;
  stage: BatakStage;
  seats: number;
  viewerSeat: number | null;
  turn: number | null;
  bid: number;
  bids: number[];
  bidder: number;
  passed: number[];
  bidLog: BidEntry[];
  trump: Suit | null;
  trumpBroken: boolean;
  rules: BatakRules;
  tricks: number[];
  trick: TrickPlay[];
  scores: number[];
  completedTricks: { plays: TrickPlay[]; winner: number }[];
  hand: Card[] | null;
  handCounts: number[];
  buried: Card[];
  buriedCount: number;
}

export const BATAK_RULE_DEFAULTS: BatakRules = {
  noTrumpLeadUntilBroken: true,
  defenderBatakPenalty: false,
  writeContract: false,
};
const variants: BatakVariant[] = ['ihaleli', 'esli', 'koz-maca', 'gommeli'];
const stages: BatakStage[] = ['bidding', 'trump', 'bury', 'playing', 'ended'];
const suitList: Suit[] = ['spades', 'hearts', 'clubs', 'diamonds'];

const numbers = (value: unknown) => array<unknown>(value).map((item) => Number(item) || 0);
const card = (value: unknown): Card | null => {
  const item = object(value);
  return typeof item.id === 'string'
    ? { id: item.id, suit: String(item.suit), rank: Number(item.rank) }
    : null;
};
const plays = (value: unknown): TrickPlay[] =>
  array<unknown>(value).flatMap((item) => {
    const play = object(item),
      played = card(play.card);
    return played ? [{ seat: Number(play.seat) || 0, card: played }] : [];
  });
const cards = (value: unknown) =>
  array<unknown>(value)
    .map(card)
    .filter((item): item is Card => !!item);

export type TableSeat = GamePublicState['seats'][number];
/** Round index i is the i-th seated player by seat number (the service's `ordered(table)`). */
export const roundSeats = (game: GamePublicState): TableSeat[] =>
  [...game.seats].sort((a, b) => a.seat - b.seat);

/** The view as the client reads it; null before the first deal reached this client. */
export function readBatak(game: GamePublicState, userId?: string): BatakState | null {
  const view = game.view;
  if (typeof view.stage !== 'string' || !Array.isArray(view.hands)) return null;
  const hands = array<Record<string, unknown>>(view.hands),
    seats = hands.length || roundSeats(game).length,
    viewer = roundSeats(game).findIndex((seat) => seat.userId === userId),
    viewerSeat = viewer >= 0 && viewer < seats ? viewer : null,
    rules = object(view.rules);
  const own = hands.find((hand) => Number(hand.seat) === viewerSeat);
  return {
    variant: variants.includes(view.variant as BatakVariant)
      ? (view.variant as BatakVariant)
      : 'ihaleli',
    stage: stages.includes(view.stage as BatakStage) ? (view.stage as BatakStage) : 'playing',
    seats,
    viewerSeat,
    turn: typeof view.turn === 'number' ? view.turn : null,
    bid: Number(view.bid) || 0,
    bids: numbers(view.bids),
    bidder: Number(view.bidder) || 0,
    passed: numbers(view.passed),
    bidLog: array<Record<string, unknown>>(view.bidLog).map((entry) => ({
      seat: Number(entry.seat) || 0,
      action: entry.action === 'pass' ? 'pass' : 'bid',
      ...(typeof entry.amount === 'number' ? { amount: entry.amount } : {}),
    })),
    trump: suitList.includes(view.trump as Suit) ? (view.trump as Suit) : null,
    trumpBroken: view.trumpBroken === true,
    rules: {
      noTrumpLeadUntilBroken:
        typeof rules.noTrumpLeadUntilBroken === 'boolean'
          ? rules.noTrumpLeadUntilBroken
          : BATAK_RULE_DEFAULTS.noTrumpLeadUntilBroken,
      defenderBatakPenalty: rules.defenderBatakPenalty === true,
      writeContract: rules.writeContract === true,
    },
    tricks: numbers(view.tricks),
    trick: plays(view.trick),
    scores: numbers(view.scores),
    completedTricks: array<Record<string, unknown>>(view.completedTricks).map((item) => ({
      plays: plays(item.plays),
      winner: Number(item.winner) || 0,
    })),
    hand: viewerSeat === null ? null : cards(own?.cards),
    handCounts: Array.from({ length: seats }, (_, seat) =>
      Number(hands.find((hand) => Number(hand.seat) === seat)?.count ?? 0),
    ),
    buried: cards(view.buried),
    buriedCount: Number(view.buriedCount) || 0,
  };
}

export type Position = 'bottom' | 'right' | 'top' | 'left' | 'top-right' | 'top-left';
/**
 * Where a round index sits for this viewer: own seat at the bottom, then the turn order
 * counter-clockwise like a Turkish table (the next player on the RIGHT). Three-handed Gömmeli
 * puts the other two at the top corners so the table stays symmetric.
 */
export function relativePosition(state: Pick<BatakState, 'seats' | 'viewerSeat'>, round: number) {
  const offset = (round - (state.viewerSeat ?? 0) + state.seats) % state.seats;
  if (state.seats === 3) return (['bottom', 'top-right', 'top-left'] as const)[offset];
  return (['bottom', 'right', 'top', 'left'] as const)[offset] as Position;
}

const red = (suit: string) => suit === 'hearts' || suit === 'diamonds';
/**
 * The own hand as a player holds it: suits alternate black and red (♠ ♥ ♣ ♦), aces first inside
 * a suit, trump rightmost. Rotating the alternating cycle until trump is last keeps alternation.
 */
export function sortHand(hand: Card[], trump: string | null): Card[] {
  const start = trump && suitList.includes(trump as Suit) ? suitList.indexOf(trump as Suit) + 1 : 0,
    cycle = suitList.map((_, index) => suitList[(start + index) % 4]);
  const held = cycle.filter((suit) => hand.some((item) => item.suit === suit)),
    last = trump && held.includes(trump as Suit) ? [trump] : [],
    free = held.filter((suit) => suit !== trump);
  // A missing suit can put two of one colour together: take the order of the non-trump suits with
  // the fewest same-colour neighbours (the first such order in the cycle on a tie).
  const orders = (list: string[]): string[][] =>
    list.length <= 1
      ? [list]
      : list.flatMap((suit, index) =>
          orders(list.filter((_, other) => other !== index)).map((rest) => [suit, ...rest]),
        );
  const clashes = (list: string[]) =>
    list.slice(1).filter((suit, index) => red(suit) === red(list[index])).length;
  const present = orders(free)
    .map((list) => [...list, ...last])
    .reduce((best, list) => (clashes(list) < clashes(best) ? list : best));
  const order = (suit: string) => {
    const index = present.indexOf(suit);
    return index < 0 ? 9 : index;
  };
  return [...hand].sort((a, b) => order(a.suit) - order(b.suit) || b.rank - a.rank);
}

/**
 * The cards the viewer may play right now: the engine's own `legalBatakCards` with the round's
 * rules and trump state from the view, exactly what the server checks (`batakLegalCards`).
 */
export function legalCardIds(state: BatakState): string[] {
  if (state.stage !== 'playing' || !state.hand?.length || state.trump === null) return [];
  if (state.turn === null || state.turn !== state.viewerSeat) return [];
  return legalBatakCards(
    state.hand as EngineCard[],
    state.trick as { seat: number; card: EngineCard }[],
    state.trump,
    { trumpBroken: state.trumpBroken, rules: state.rules },
  ).map((item) => item.id);
}

/** Smallest and largest bid the viewer may say now. */
export function bidRange(state: Pick<BatakState, 'variant' | 'bid'>) {
  if (state.variant === 'koz-maca') return { minimum: 1, maximum: 13 };
  const floor = state.variant === 'esli' || state.variant === 'gommeli' ? 8 : 5;
  return {
    minimum: Math.max(floor, state.bid + 1),
    maximum: state.variant === 'gommeli' ? 16 : 13,
  };
}

/** Last thing a seat said in the auction (Koz Maça: its prediction; "pass" there means 1). */
export function lastBid(state: Pick<BatakState, 'bidLog' | 'variant'>, seat: number) {
  const entry = [...state.bidLog].reverse().find((item) => item.seat === seat);
  if (!entry) return null;
  if (state.variant === 'koz-maca') return String(entry.amount ?? 1);
  return entry.action === 'pass' ? t('Pas') : String(entry.amount ?? '');
}

export const variantName = (variant: string) =>
  (
    ({
      ihaleli: t('İhaleli'),
      esli: t('Eşli'),
      'koz-maca': t('Koz Maça'),
      gommeli: t('Gömmeli'),
    }) as Record<string, string>
  )[variant] ?? 'Batak';

/** Tricks a seat has to take: the contract for the bidder (team in Eşli), Koz Maça's own call. */
export function target(state: BatakState, seat: number): number | null {
  if (state.variant === 'koz-maca') return state.bids[seat] || null;
  if (state.stage === 'bidding') return null;
  if (state.variant === 'esli') return seat % 2 === state.bidder % 2 ? state.bid : null;
  return seat === state.bidder ? state.bid : null;
}
const teamTricks = (state: BatakState, seat: number) =>
  state.variant === 'esli'
    ? (state.tricks[seat % 2] ?? 0) + (state.tricks[(seat % 2) + 2] ?? 0)
    : (state.tricks[seat] ?? 0);

export type SummaryMark = 'made' | 'set' | 'batak' | null;
export interface SummaryRow {
  seat: number;
  contract: number | null;
  tricks: number;
  points: number;
  mark: SummaryMark;
}
/**
 * One row per seat for a finished round: what it had to take, what it took, the points the server
 * wrote and the mark (made, contract set, or "batak": a defender with no trick under the penalty).
 */
export function roundSummary(state: BatakState): SummaryRow[] {
  return Array.from({ length: state.seats }, (_, seat) => {
    const contract = target(state, seat),
      tricks = state.tricks[seat] ?? 0,
      points = state.scores[seat] ?? 0,
      taken = state.variant === 'koz-maca' ? tricks : teamTricks(state, seat);
    let mark: SummaryMark = null;
    if (contract !== null) mark = taken >= contract ? 'made' : 'set';
    else if (state.rules.defenderBatakPenalty && state.variant !== 'koz-maca' && taken === 0)
      mark = 'batak';
    return { seat, contract, tricks, points, mark };
  });
}

export interface SheetRow {
  hand: number;
  points: number[];
}
/** Running score sheet from the table history (one row per finished round, oldest first). */
export function scoreSheet(game: GamePublicState, seats: number) {
  const rows: SheetRow[] = game.history
    .map((entry, index) => ({
      hand: index + 1,
      points: numbers(object(entry.result).scores),
    }))
    .filter((row) => row.points.length === seats);
  const totals = Array.from({ length: seats }, (_, seat) =>
    rows.reduce((sum, row) => sum + (row.points[seat] ?? 0), 0),
  );
  return { rows, totals };
}
