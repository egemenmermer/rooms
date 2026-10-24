import type { GamePublicState } from '../../../../../packages/activity-protocol/src';
import { t } from '../../i18n';
import { array, object, type Card } from '../shared/model';

/**
 * Client-side reading of the `rooms-pisti-v1` view (packages/games/src/pisti.ts + match.ts).
 *
 * Every array in the view is indexed by ROUND index (position in the seat-ordered player list),
 * not by `game.seats[].seat`: `handCounts`, `result.points`, `series.totals` and `series.rounds`
 * per player, `capturedCounts`, `pisti` and `jackPisti` per SIDE (side = round index in a 2-player
 * game, round index % 2 for partners in a 4-player game).
 */
export type PistiCaptureKind = 'capture' | 'pisti' | 'jack-pisti' | 'remainder';
export interface PistiPlay {
  seq: number;
  seat: number;
  card: Card;
  captured: boolean;
}
export interface PistiCapture {
  seq: number;
  seat: number;
  count: number;
  kind: PistiCaptureKind;
  card: Card | null;
}
/** One side's card-point split in a settled deal; absent from servers that predate it. */
export interface PistiBreakdown {
  aces: number;
  jacks: number;
  clubsTwo: number;
  diamondsTen: number;
  cards: number;
  mostCards: boolean;
  pisti: number;
  jackPisti: number;
}
export interface PistiDeal {
  seats: number;
  teams: boolean;
  target: number;
  viewerSeat: number | null;
  turn: number | null;
  hand: Card[] | null;
  handCounts: number[];
  tableCount: number;
  tableTop: Card | null;
  deckCount: number;
  capturedCounts: number[];
  pisti: number[];
  jackPisti: number[];
  lastPlay: PistiPlay | null;
  lastCapture: PistiCapture | null;
  /** House rules; `reshuffleJackTop` is null when an older server does not send it. */
  rules: { target: number; reshuffleJackTop: boolean | null };
  result: { points: number[]; winners: number[]; breakdown: PistiBreakdown[] | null } | null;
}
export interface PistiSeries {
  totals: number[];
  rounds: { points: number[]; winners: number[] }[];
  winners: number[] | null;
  previous: PistiDeal | null;
}
export const PISTI_TARGETS = [101, 151, 251] as const;
export const PISTI_JACK = 11;
export const PISTI_BONUS = { pisti: 10, jackPisti: 20, mostCards: 3 } as const;

const numbers = (value: unknown) => array<unknown>(value).map((item) => Number(item) || 0);
const breakdown = (value: unknown): PistiBreakdown[] | null =>
  Array.isArray(value)
    ? value.map((item) => {
        const side = object(item);
        return {
          aces: Number(side.aces) || 0,
          jacks: Number(side.jacks) || 0,
          clubsTwo: Number(side.clubsTwo) || 0,
          diamondsTen: Number(side.diamondsTen) || 0,
          cards: Number(side.cards) || 0,
          mostCards: side.mostCards === true,
          pisti: Number(side.pisti) || 0,
          jackPisti: Number(side.jackPisti) || 0,
        };
      })
    : null;
const card = (value: unknown): Card | null => {
  const item = object(value);
  return typeof item.id === 'string'
    ? { id: item.id, suit: String(item.suit), rank: Number(item.rank) }
    : null;
};
const play = (value: unknown): PistiPlay | null => {
  const item = object(value),
    played = card(item.card);
  return played
    ? {
        seq: Number(item.seq) || 0,
        seat: Number(item.seat) || 0,
        card: played,
        captured: item.captured === true,
      }
    : null;
};
const capture = (value: unknown): PistiCapture | null => {
  const item = object(value);
  if (typeof item.seq !== 'number') return null;
  const kind = String(item.kind);
  return {
    seq: item.seq,
    seat: Number(item.seat) || 0,
    count: Number(item.count) || 0,
    kind: (['capture', 'pisti', 'jack-pisti', 'remainder'].includes(kind)
      ? kind
      : 'capture') as PistiCaptureKind,
    card: card(item.card),
  };
};

/** One deal as the viewer may see it, from `game.view` or `game.view.series.previous`. */
export function readDeal(value: unknown): PistiDeal | null {
  const view = object(value);
  if (typeof view.seats !== 'number') return null;
  const result = object(view.result),
    rules = object(view.rules);
  return {
    seats: view.seats,
    teams: view.teams === true,
    target: Number(view.target) || 151,
    viewerSeat: typeof view.viewerSeat === 'number' ? view.viewerSeat : null,
    turn: typeof view.turn === 'number' ? view.turn : null,
    hand: Array.isArray(view.hand)
      ? view.hand.map(card).filter((item): item is Card => !!item)
      : null,
    handCounts: numbers(view.handCounts),
    tableCount: Number(view.tableCount) || 0,
    tableTop: card(view.tableTop),
    deckCount: Number(view.deckCount) || 0,
    capturedCounts: numbers(view.capturedCounts),
    pisti: numbers(view.pisti),
    jackPisti: numbers(view.jackPisti),
    lastPlay: play(view.lastPlay),
    lastCapture: capture(view.lastCapture),
    result: Array.isArray(result.points)
      ? {
          points: numbers(result.points),
          winners: numbers(result.winners),
          breakdown: breakdown(result.breakdown),
        }
      : null,
    rules: {
      target: Number(rules.target) || Number(view.target) || 151,
      reshuffleJackTop: typeof rules.reshuffleJackTop === 'boolean' ? rules.reshuffleJackTop : null,
    },
  };
}

export function readSeries(view: Record<string, unknown>): PistiSeries {
  const series = object(view.series);
  return {
    totals: numbers(series.totals),
    rounds: array<Record<string, unknown>>(series.rounds).map((round) => ({
      points: numbers(round.points),
      winners: numbers(round.winners),
    })),
    winners: Array.isArray(series.winners) ? numbers(series.winners) : null,
    previous: readDeal(series.previous),
  };
}

export type TableSeat = GamePublicState['seats'][number];
/** Round index i is the i-th seated player by seat number (the service's `ordered(table)`). */
export const roundSeats = (game: GamePublicState): TableSeat[] =>
  [...game.seats].sort((a, b) => a.seat - b.seat);
export const sideOf = (deal: Pick<PistiDeal, 'teams'>, round: number) =>
  deal.teams ? round % 2 : round;
export const sideCount = (deal: Pick<PistiDeal, 'seats'>) => (deal.seats === 4 ? 2 : deal.seats);
/** Round indices on one side: [i] alone, or the two partners seated across. */
export const sideMembers = (deal: Pick<PistiDeal, 'teams' | 'seats'>, side: number) =>
  Array.from({ length: deal.seats }, (_, round) => round).filter(
    (round) => sideOf(deal, round) === side,
  );

/**
 * Where a round index sits around the felt for this viewer: 0 bottom (own seat), then the turn
 * order counter-clockwise like a Turkish table (the next player on the right, across at the top).
 */
export function relativePosition(deal: Pick<PistiDeal, 'seats' | 'viewerSeat'>, round: number) {
  const offset = (round - (deal.viewerSeat ?? 0) + deal.seats) % deal.seats;
  if (deal.seats === 2) return offset === 0 ? 'bottom' : 'top';
  return (['bottom', 'right', 'top', 'left'] as const)[offset];
}
export type Position = ReturnType<typeof relativePosition>;

export const sideName = (game: GamePublicState, deal: PistiDeal, side: number) => {
  const seats = roundSeats(game);
  return (
    sideMembers(deal, side)
      .map((round) => seats[round]?.name ?? t('Oyuncu'))
      .join(' + ') || t('Oyuncu')
  );
};

/** Points of one side in a settled deal (both partners carry the same team points). */
export const sidePoints = (deal: PistiDeal, points: number[], side: number) =>
  points[sideMembers(deal, side)[0] ?? side] ?? 0;

export interface SideSummary {
  side: number;
  cards: number;
  mostCards: boolean;
  pisti: number;
  jackPisti: number;
  /** Aces, jacks, ♣2 and ♦10 together: the deal total minus the bonuses. */
  cardPoints: number;
  /** The per-card split; null when an older server only sent the totals. */
  cardsSplit: Pick<PistiBreakdown, 'aces' | 'jacks' | 'clubsTwo' | 'diamondsTen'> | null;
  total: number;
}

/** How a settled deal scored per side, from what the view carries. */
export function dealSummary(deal: PistiDeal, points: number[]): SideSummary[] {
  const split = deal.result?.breakdown ?? null,
    counts = deal.capturedCounts,
    most = Math.max(0, ...counts),
    leaders = counts.filter((count) => count === most).length;
  return Array.from({ length: sideCount(deal) }, (_, side) => {
    const total = sidePoints(deal, points, side),
      mostCards = leaders === 1 && counts[side] === most,
      pisti = deal.pisti[side] ?? 0,
      jackPisti = deal.jackPisti[side] ?? 0,
      detail = split?.[side] ?? null;
    return {
      side,
      cards: counts[side] ?? 0,
      mostCards,
      pisti,
      jackPisti,
      cardsSplit: detail && {
        aces: detail.aces,
        jacks: detail.jacks,
        clubsTwo: detail.clubsTwo,
        diamondsTen: detail.diamondsTen,
      },
      cardPoints: Math.max(
        0,
        total -
          (mostCards ? PISTI_BONUS.mostCards : 0) -
          pisti * PISTI_BONUS.pisti -
          jackPisti * PISTI_BONUS.jackPisti,
      ),
      total,
    };
  });
}

/** Whether `played` would take a pile whose top card is `top`. */
export const takesPile = (top: Card | null, played: Card) =>
  !!top && (played.rank === PISTI_JACK || played.rank === top.rank);
