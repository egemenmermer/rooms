import { shuffledDeck, type Card } from './cards';
import type { GameModule } from './module';

/**
 * Pişti (`rooms-pisti-v1`): 52 cards, 2 players or 4 players in two teams of partners seated across (seats 0+2 vs 1+3).
 * One state is one pass through the deck (a "deal"); the service sums `settle().points` over deals until a side
 * reaches `options.target` (see `pistiMatchWinners`).
 *
 * Ranks follow `cards.ts`: 11 = jack (vale), 14 = ace.
 */


export const PISTI_TARGETS = [101, 151, 251] as const;
export const PISTI_JACK = 11;
export const PISTI_POINTS = { pisti: 10, jackPisti: 20, mostCards: 3 } as const;

export interface PistiOptions {
  /** Match target in points; 101, 151 (default) or 251. Carried in the state, enforced by the service. */
  target: (typeof PISTI_TARGETS)[number];
  /** Shuffle the opening face-up card back into the deck when it is a jack (default true). */
  reshuffleJackTop: boolean;
}

export interface PistiPlay {
  seq: number;
  seat: number;
  card: Card;
  /** Whether the card took the pile. */
  captured: boolean;
}

export interface PistiCapture {
  seq: number;
  seat: number;
  /** Number of cards taken, including the capturing card. */
  count: number;
  kind: 'capture' | 'pisti' | 'jack-pisti' | 'remainder';
  /** The capturing card; null for the end-of-deal remainder. */
  card: Card | null;
}

export interface PistiState {
  seats: number;
  teams: boolean;
  target: number;
  /** Undealt cards (hidden). */
  deck: Card[];
  hands: Card[][];
  /** Bottom to top; the first (up to three) cards of the opening table are face down and stay hidden. */
  table: Card[];
  /** Captured cards per side (side = seat in a 2p game, seat % 2 in a 4p team game). */
  captured: Card[][];
  pisti: number[];
  jackPisti: number[];
  /** Seat that captured last; receives the remaining table at the end of the deal. */
  lastCapturer: number | null;
  turn: number | null;
  plays: number;
  lastPlay: PistiPlay | null;
  lastCapture: PistiCapture | null;
}

export type PistiCommand = { type: 'play'; cardId: string };

export interface PistiView {
  seats: number;
  teams: boolean;
  target: number;
  viewerSeat: number | null;
  turn: number | null;
  /** The viewer's own hand; null for spectators. */
  hand: Card[] | null;
  handCounts: number[];
  tableCount: number;
  /** Only the top card is visible; everything below it stays hidden until captured. */
  tableTop: Card | null;
  deckCount: number;
  /** Per side (see `PistiState.captured`). */
  capturedCounts: number[];
  pisti: number[];
  jackPisti: number[];
  lastPlay: PistiPlay | null;
  lastCapture: PistiCapture | null;
  /** Set once the deal is over. */
  result: { points: number[]; winners: number[] } | null;
}

export function pistiSideCount(seats: number): number {
  return seats === 4 ? 2 : seats;
}

export function pistiSide(state: Pick<PistiState, 'teams' | 'seats'>, seat: number): number {
  return state.teams ? seat % 2 : seat;
}

/** Base point value of a single card (aces, jacks, ♣2, ♦10). */
export function pistiCardPoints(card: Card): number {
  if (card.rank === 14 || card.rank === PISTI_JACK) return 1;
  if (card.rank === 2 && card.suit === 'clubs') return 2;
  if (card.rank === 10 && card.suit === 'diamonds') return 3;
  return 0;
}

function normalizeOptions(options: Partial<PistiOptions> | undefined): PistiOptions {
  const target = PISTI_TARGETS.find((t) => t === options?.target) ?? 151;
  return { target, reshuffleJackTop: options?.reshuffleJackTop !== false };
}

function shuffle<T>(items: T[], rng: () => number): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.floor(rng() * (i + 1)));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

function freshDeck(rng: () => number): Card[] {
  // `shuffledDeck` is crypto-random; sort by id first so the seeded `rng` is the only randomness.
  const cards = shuffledDeck(1).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return shuffle(cards, rng);
}

export function startPisti(
  seatCount: number,
  options: Partial<PistiOptions> | undefined,
  first: number,
  rng: () => number,
): PistiState {
  if (seatCount !== 2 && seatCount !== 4) throw new Error('PISTI_SEATS');
  const opts = normalizeOptions(options),
    deck = freshDeck(rng),
    table = deck.splice(0, 4);
  if (opts.reshuffleJackTop && table[3].rank === PISTI_JACK) {
    // Shuffle the jack back: swap it with a randomly chosen non-jack card of the remaining deck.
    const candidates = deck.flatMap((c, i) => (c.rank === PISTI_JACK ? [] : [i])),
      pick = candidates[Math.min(candidates.length - 1, Math.floor(rng() * candidates.length))];
    [table[3], deck[pick]] = [deck[pick], table[3]];
  }
  const sides = pistiSideCount(seatCount),
    hands: Card[][] = Array.from({ length: seatCount }, () => []);
  for (let i = 0; i < seatCount; i++) hands[i] = deck.splice(0, 4);
  return {
    seats: seatCount,
    teams: seatCount === 4,
    target: opts.target,
    deck,
    hands,
    table,
    captured: Array.from({ length: sides }, () => []),
    pisti: Array.from({ length: sides }, () => 0),
    jackPisti: Array.from({ length: sides }, () => 0),
    lastCapturer: null,
    turn: ((Math.trunc(first) % seatCount) + seatCount) % seatCount,
    plays: 0,
    lastPlay: null,
    lastCapture: null,
  };
}

/** Whether `card` would take the current pile. */
export function pistiCaptures(table: Card[], card: Card): boolean {
  return (
    table.length > 0 && (card.rank === PISTI_JACK || card.rank === table[table.length - 1].rank)
  );
}

/** `pisti` for a single matched card, `jack-pisti` for a jack on a single jack, otherwise none. */
export function pistiKind(table: Card[], card: Card): 'none' | 'pisti' | 'jack-pisti' {
  if (table.length !== 1) return 'none';
  const top = table[0];
  if (card.rank === PISTI_JACK && top.rank === PISTI_JACK) return 'jack-pisti';
  return card.rank === top.rank ? 'pisti' : 'none';
}

export function actionPisti(
  state: PistiState,
  seat: number,
  command: PistiCommand,
  _rng: () => number,
): PistiState | { error: string } {
  if (state.turn === null) return { error: 'ROUND_OVER' };
  if (!Number.isInteger(seat) || seat < 0 || seat >= state.seats) return { error: 'NOT_SEATED' };
  if (seat !== state.turn) return { error: 'NOT_YOUR_TURN' };
  const index = state.hands[seat].findIndex((c) => c.id === command.cardId);
  if (index < 0) return { error: 'CARD_NOT_IN_HAND' };
  const next: PistiState = structuredClone(state),
    [card] = next.hands[seat].splice(index, 1),
    side = pistiSide(next, seat),
    take = pistiCaptures(next.table, card),
    kind = take ? pistiKind(next.table, card) : 'none';
  next.plays++;
  next.lastPlay = { seq: next.plays, seat, card, captured: take };
  if (take) {
    const count = next.table.length + 1;
    next.captured[side].push(...next.table, card);
    next.table = [];
    next.lastCapturer = seat;
    if (kind === 'pisti') next.pisti[side]++;
    if (kind === 'jack-pisti') next.jackPisti[side]++;
    next.lastCapture = {
      seq: next.plays,
      seat,
      count,
      kind: kind === 'none' ? 'capture' : kind,
      card,
    };
  } else next.table.push(card);

  if (next.hands.every((h) => h.length === 0)) {
    if (next.deck.length >= next.seats * 4) {
      for (let i = 0; i < next.seats; i++) next.hands[i] = next.deck.splice(0, 4);
    } else {
      // Deck is out: whatever is left on the table goes to whoever captured last.
      if (next.table.length && next.lastCapturer !== null) {
        next.captured[pistiSide(next, next.lastCapturer)].push(...next.table);
        next.lastCapture = {
          seq: next.plays,
          seat: next.lastCapturer,
          count: next.table.length,
          kind: 'remainder',
          card: null,
        };
        next.table = [];
      }
      next.turn = null;
      return next;
    }
  }
  next.turn = (seat + 1) % next.seats;
  return next;
}

/** Points per side for this deal: card points, 3 for most cards (tie: nobody) and pişti bonuses. */
export function pistiSidePoints(state: PistiState): number[] {
  const counts = state.captured.map((pile) => pile.length),
    most = Math.max(...counts),
    leaders = counts.filter((n) => n === most).length;
  return state.captured.map((pile, side) => {
    let points = pile.reduce((sum, c) => sum + pistiCardPoints(c), 0);
    if (counts[side] === most && leaders === 1) points += PISTI_POINTS.mostCards;
    return (
      points +
      state.pisti[side] * PISTI_POINTS.pisti +
      state.jackPisti[side] * PISTI_POINTS.jackPisti
    );
  });
}

export function settlePisti(state: PistiState): { points: number[]; winners: number[] } | null {
  if (state.turn !== null) return null;
  const sidePoints = pistiSidePoints(state),
    // In a team game both partners carry their team's points.
    points = Array.from({ length: state.seats }, (_, seat) => sidePoints[pistiSide(state, seat)]),
    best = Math.max(...points);
  return {
    points,
    winners: points.flatMap((p, seat) => (p === best ? [seat] : [])),
  };
}

/**
 * Match winners from running totals per seat (as summed from `settle().points`): the seats at the highest total once
 * somebody has reached `target`, otherwise an empty list (play another deal).
 */
export function pistiMatchWinners(totals: number[], target: number): number[] {
  const best = Math.max(...totals);
  return best >= target ? totals.flatMap((t, seat) => (t === best ? [seat] : [])) : [];
}

export function viewPisti(state: PistiState, viewerSeat: number | null): PistiView {
  const seated = viewerSeat !== null && viewerSeat >= 0 && viewerSeat < state.seats;
  return {
    seats: state.seats,
    teams: state.teams,
    target: state.target,
    viewerSeat: seated ? viewerSeat : null,
    turn: state.turn,
    hand: seated ? state.hands[viewerSeat].map((c) => ({ ...c })) : null,
    handCounts: state.hands.map((h) => h.length),
    tableCount: state.table.length,
    tableTop: state.table.length ? { ...state.table[state.table.length - 1] } : null,
    deckCount: state.deck.length,
    capturedCounts: state.captured.map((pile) => pile.length),
    pisti: [...state.pisti],
    jackPisti: [...state.jackPisti],
    lastPlay: state.lastPlay && structuredClone(state.lastPlay),
    lastCapture: state.lastCapture && structuredClone(state.lastCapture),
    result: settlePisti(state),
  };
}

/**
 * Bot heuristics: pişti first, then a matching card (keeping jacks), a jack only on a worthwhile pile (or as the last
 * card), otherwise the cheapest card that does not hand the opponent a pişti.
 */
export function botPisti(state: PistiState, seat: number, rng: () => number): PistiCommand {
  const hand = state.hands[seat];
  if (!hand.length) throw new Error('PISTI_EMPTY_HAND');
  const play = (card: Card): PistiCommand => ({ type: 'play', cardId: card.id }),
    table = state.table,
    top = table[table.length - 1],
    jacks = hand.filter((c) => c.rank === PISTI_JACK),
    others = hand.filter((c) => c.rank !== PISTI_JACK);
  if (table.length) {
    // 1. Pişti: a single card matched (a jack on a single jack scores 20).
    if (table.length === 1) {
      const scoring = hand.find((c) => pistiKind(table, c) === 'jack-pisti');
      if (scoring) return play(scoring);
      const matching = hand.find((c) => pistiKind(table, c) === 'pisti');
      if (matching) return play(matching);
    }
    // 2. Capture with a matching card rather than spending a jack.
    const matches = others.filter((c) => c.rank === top.rank);
    if (matches.length) return play(lowest(matches, rng));
    // 3. A jack only for a big pile, a jack on a jack, or as the very last card.
    const pileValue = table.reduce((sum, c) => sum + pistiCardPoints(c), 0),
      lastCard = hand.length === 1 && state.deck.length === 0;
    if (
      jacks.length &&
      (table.length >= 3 || pileValue >= 2 || top.rank === PISTI_JACK || lastCard)
    )
      return play(jacks[0]);
  }
  // 4. Discard: cheapest card, avoiding a pişti gift when the table is empty (the next card would sit alone).
  const pool = others.length ? others : jacks,
    seen = new Map<number, number>();
  for (const c of [...hand, ...table, ...state.captured.flat()])
    seen.set(c.rank, (seen.get(c.rank) ?? 0) + 1);
  const cost = (c: Card) =>
    pistiCardPoints(c) * 2 +
    (c.rank === PISTI_JACK ? 5 : 0) +
    (table.length === 0 ? Math.max(0, 4 - (seen.get(c.rank) ?? 0)) * 2 : 0);
  const best = Math.min(...pool.map(cost));
  return play(
    lowest(
      pool.filter((c) => cost(c) === best),
      rng,
    ),
  );
}

/** Lowest rank first; ties broken by `rng` so equal cards do not always leave the same suit. */
function lowest(cards: Card[], rng: () => number): Card {
  const rank = Math.min(...cards.map((c) => c.rank)),
    ties = cards.filter((c) => c.rank === rank);
  return ties[Math.min(ties.length - 1, Math.floor(rng() * ties.length))];
}

export function parsePistiCommand(input: {
  action: string;
  payload?: unknown;
}): PistiCommand | { error: string } {
  if (input.action !== 'play') return { error: 'UNKNOWN_ACTION' };
  const payload = input.payload;
  if (typeof payload !== 'object' || payload === null) return { error: 'INVALID_PAYLOAD' };
  const cardId = (payload as { cardId?: unknown }).cardId;
  if (typeof cardId !== 'string' || !cardId || cardId.length > 64) return { error: 'INVALID_CARD' };
  return { type: 'play', cardId };
}

export const pistiModule = {
  kind: 'rooms-pisti-v1',
  seats: [2, 4] as const,
  actions: ['play'] as const,
  parseCommand: parsePistiCommand,
  start: startPisti,
  action: actionPisti,
  view: viewPisti,
  turn: (state: PistiState) => state.turn,
  botCommand: botPisti,
  settle: settlePisti,
} satisfies GameModule<PistiState, PistiCommand, PistiView, Partial<PistiOptions> | undefined>;
