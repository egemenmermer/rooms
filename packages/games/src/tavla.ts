// Turkish tavla (standard backgammon movement) for two seats.
//
// Board: 24 points, index 0..23. Seat 0 moves toward index 0 (home board 0..5, enters from the bar at
// 24 - die); seat 1 moves toward index 23 (home board 18..23, enters at die - 1). In the state a point is
// a signed count: positive = seat 0 checkers, negative = seat 1 checkers.
//
// One state is one round (one game). The match score so far comes in through `options.scores`; the
// service adds `settle().points` and starts the next round until `tavlaMatchStatus()` reports the end.

import type { GameModule } from './module';

export const TAVLA_KIND = 'rooms-tavla-v1';
export const TAVLA_CHECKERS = 15;
export const TAVLA_MATCH_TARGETS = [3, 5, 7] as const;

export type TavlaFrom = number | 'bar';
export type TavlaTo = number | 'off';
export type TavlaPhase = 'opening' | 'roll' | 'moving' | 'over';

export interface TavlaOptions {
  /** Match length in points (3, 5 or 7). Default 5. */
  matchTo?: number;
  /** Opening winner re-rolls both dice instead of playing the two opening dice. Default false. */
  starterRerolls?: boolean;
  /** Match score before this round, per seat. Default [0, 0]. */
  scores?: number[];
}

export interface TavlaStep {
  from: TavlaFrom;
  to: TavlaTo;
  die: number;
  hit: boolean;
}

export interface TavlaPosition {
  points: number[];
  bar: [number, number];
  off: [number, number];
}

export interface TavlaTurnRecord {
  seat: number;
  dice: number[];
  moves: TavlaStep[];
  /** No legal move existed for the roll (for example a blocked bar entry). */
  passed: boolean;
}

export interface TavlaRoundResult {
  winner: number;
  points: number;
  mars: boolean;
}

export interface TavlaState extends TavlaPosition {
  kind: typeof TAVLA_KIND;
  phase: TavlaPhase;
  options: { matchTo: number; starterRerolls: boolean; scores: [number, number] };
  /** Seat that must act, null once the round is over. */
  turn: number | null;
  /** Seat that rolls first in the opening roll-off. */
  first: number;
  opening: [number | null, number | null];
  /** Value of the last tied opening roll (both seats rolled it), null if none. */
  openingTie: number | null;
  dice: number[] | null;
  remaining: number[];
  turnStart: TavlaPosition | null;
  moves: TavlaStep[];
  /** Number of dice the current roll must use (maximum playable). */
  maxMoves: number;
  lastTurn: TavlaTurnRecord | null;
  result: TavlaRoundResult | null;
}

export type TavlaCommand =
  | { action: 'roll' }
  | { action: 'move'; from: TavlaFrom; to: TavlaTo; die?: number }
  | { action: 'undo' }
  | { action: 'confirm' };

export interface TavlaView {
  kind: typeof TAVLA_KIND;
  phase: TavlaPhase;
  you: number | null;
  turn: number | null;
  /** Index 0..23; seat null when empty. */
  points: Array<{ seat: number | null; count: number }>;
  bar: [number, number];
  off: [number, number];
  pips: [number, number];
  opening: [number | null, number | null];
  openingTie: number | null;
  dice: number[] | null;
  remaining: number[];
  /** Steps already played this turn (visible to everyone, can still be undone by the mover). */
  moves: TavlaStep[];
  /** Legal single steps for the seat to act. */
  legalMoves: TavlaStep[];
  canUndo: boolean;
  canConfirm: boolean;
  lastTurn: TavlaTurnRecord | null;
  result: TavlaRoundResult | null;
  match: { matchTo: number; scores: [number, number]; starterRerolls: boolean };
}

const other = (seat: number) => 1 - seat;
const sign = (seat: number) => (seat === 0 ? 1 : -1);
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function own(pos: TavlaPosition, seat: number, index: number): number {
  const value = pos.points[index] * sign(seat);
  return value > 0 ? value : 0;
}

/** Pips a checker on `index` still has to travel to bear off. */
function distance(seat: number, index: number): number {
  return seat === 0 ? index + 1 : 24 - index;
}

function inHome(seat: number, index: number): boolean {
  return seat === 0 ? index <= 5 : index >= 18;
}

function allHome(pos: TavlaPosition, seat: number): boolean {
  if (pos.bar[seat]) return false;
  for (let i = 0; i < 24; i++) if (own(pos, seat, i) && !inHome(seat, i)) return false;
  return true;
}

export function tavlaStartPosition(): TavlaPosition {
  const points = Array.from({ length: 24 }, () => 0);
  points[23] = 2;
  points[12] = 5;
  points[7] = 3;
  points[5] = 5;
  points[0] = -2;
  points[11] = -5;
  points[16] = -3;
  points[18] = -5;
  return { points, bar: [0, 0], off: [0, 0] };
}

export function tavlaPips(pos: TavlaPosition, seat: number): number {
  let total = pos.bar[seat] * 25;
  for (let i = 0; i < 24; i++) total += own(pos, seat, i) * distance(seat, i);
  return total;
}

/** The step a single die allows from `from`, or null when it is not legal on its own. */
function stepFor(pos: TavlaPosition, seat: number, from: TavlaFrom, die: number): TavlaStep | null {
  const opponent = other(seat);
  if (pos.bar[seat] > 0) {
    if (from !== 'bar') return null;
    const to = seat === 0 ? 24 - die : die - 1;
    const blockers = own(pos, opponent, to);
    return blockers >= 2 ? null : { from, to, die, hit: blockers === 1 };
  }
  if (from === 'bar' || !own(pos, seat, from)) return null;
  const target = seat === 0 ? from - die : from + die;
  if (target >= 0 && target <= 23) {
    const blockers = own(pos, opponent, target);
    return blockers >= 2 ? null : { from, to: target, die, hit: blockers === 1 };
  }
  if (!allHome(pos, seat)) return null;
  const need = distance(seat, from);
  if (die < need) return null;
  if (die > need) {
    // A higher die bears off only from the highest occupied point.
    for (let i = 0; i < 24; i++)
      if (own(pos, seat, i) && inHome(seat, i) && distance(seat, i) > need) return null;
  }
  return { from, to: 'off', die, hit: false };
}

function applyStep(pos: TavlaPosition, seat: number, step: TavlaStep): TavlaPosition {
  const next: TavlaPosition = {
    points: [...pos.points],
    bar: [...pos.bar] as [number, number],
    off: [...pos.off] as [number, number],
  };
  const s = sign(seat);
  if (step.from === 'bar') next.bar[seat]--;
  else next.points[step.from] -= s;
  if (step.to === 'off') next.off[seat]++;
  else {
    if (step.hit) {
      next.points[step.to] = 0;
      next.bar[other(seat)]++;
    }
    next.points[step.to] += s;
  }
  return next;
}

function uniqueDice(remaining: number[]): number[] {
  return [...new Set(remaining)].sort((a, b) => b - a);
}

function without(remaining: number[], die: number): number[] {
  const index = remaining.indexOf(die);
  return index < 0 ? remaining : [...remaining.slice(0, index), ...remaining.slice(index + 1)];
}

function candidateSteps(pos: TavlaPosition, seat: number, remaining: number[]): TavlaStep[] {
  const froms: TavlaFrom[] = pos.bar[seat] > 0 ? ['bar'] : [];
  if (!froms.length) for (let i = 0; i < 24; i++) if (own(pos, seat, i)) froms.push(i);
  const steps: TavlaStep[] = [];
  for (const die of uniqueDice(remaining))
    for (const from of froms) {
      const step = stepFor(pos, seat, from, die);
      if (step) steps.push(step);
    }
  return steps;
}

/** Most dice playable from `pos`; bearing off the last checker counts as using every remaining die. */
function maxDepth(pos: TavlaPosition, seat: number, remaining: number[]): number {
  if (pos.off[seat] === TAVLA_CHECKERS) return remaining.length;
  let best = 0;
  for (const step of candidateSteps(pos, seat, remaining)) {
    const depth = 1 + maxDepth(applyStep(pos, seat, step), seat, without(remaining, step.die));
    if (depth > best) best = depth;
    if (best === remaining.length) break;
  }
  return best;
}

function rollDie(rng: () => number): number {
  return Math.min(6, Math.max(1, Math.floor(rng() * 6) + 1));
}

function position(state: TavlaState): TavlaPosition {
  return { points: state.points, bar: state.bar, off: state.off };
}

function setPosition(state: TavlaState, pos: TavlaPosition) {
  state.points = [...pos.points];
  state.bar = [...pos.bar] as [number, number];
  state.off = [...pos.off] as [number, number];
}

/** Legal single steps for the seat to act: each one keeps the turn on a maximal dice sequence. */
export function tavlaLegalMoves(state: TavlaState): TavlaStep[] {
  if (state.phase !== 'moving' || state.turn === null || !state.dice) return [];
  const seat = state.turn,
    pos = position(state);
  if (pos.off[seat] === TAVLA_CHECKERS) return [];
  const need = state.maxMoves - state.moves.length;
  if (need <= 0) return [];
  let steps = candidateSteps(pos, seat, state.remaining).filter(
    (step) =>
      1 + maxDepth(applyStep(pos, seat, step), seat, without(state.remaining, step.die)) >= need,
  );
  const [a, b] = state.dice;
  if (state.maxMoves === 1 && a !== b && !state.moves.length) {
    // Only one die can be played: the larger one when it is playable.
    const larger = Math.max(a, b);
    if (steps.some((step) => step.die === larger))
      steps = steps.filter((step) => step.die === larger);
  }
  return steps;
}

function turnComplete(state: TavlaState): boolean {
  return state.turn !== null && tavlaLegalMoves(state).length === 0;
}

function passTurn(state: TavlaState, record: TavlaTurnRecord) {
  state.lastTurn = record;
  state.phase = 'roll';
  state.turn = other(record.seat);
  state.dice = null;
  state.remaining = [];
  state.turnStart = null;
  state.moves = [];
  state.maxMoves = 0;
}

function beginTurn(state: TavlaState, seat: number, dice: [number, number]) {
  const remaining = dice[0] === dice[1] ? [dice[0], dice[0], dice[0], dice[0]] : [...dice];
  const pos = position(state);
  const maxMoves = maxDepth(pos, seat, remaining);
  if (!maxMoves) {
    passTurn(state, { seat, dice: [...dice], moves: [], passed: true });
    return;
  }
  state.phase = 'moving';
  state.turn = seat;
  state.dice = [...dice];
  state.remaining = remaining;
  state.turnStart = clone(pos);
  state.moves = [];
  state.maxMoves = maxMoves;
}

function normalizeOptions(options: TavlaOptions | undefined): TavlaState['options'] {
  const matchTo = (TAVLA_MATCH_TARGETS as readonly number[]).includes(options?.matchTo ?? 5)
    ? (options?.matchTo ?? 5)
    : 5;
  const raw = options?.scores;
  const scores: [number, number] =
    Array.isArray(raw) &&
    raw.length === 2 &&
    raw.every((n) => Number.isInteger(n) && n >= 0 && n < matchTo)
      ? [raw[0], raw[1]]
      : [0, 0];
  return { matchTo, starterRerolls: options?.starterRerolls === true, scores };
}

export function startTavla(seatCount: number, options: TavlaOptions = {}, first = 0): TavlaState {
  if (seatCount !== 2) throw new Error('INVALID_SEAT_COUNT');
  const start = first === 1 ? 1 : 0;
  return {
    kind: TAVLA_KIND,
    phase: 'opening',
    options: normalizeOptions(options),
    ...tavlaStartPosition(),
    turn: start,
    first: start,
    opening: [null, null],
    openingTie: null,
    dice: null,
    remaining: [],
    turnStart: null,
    moves: [],
    maxMoves: 0,
    lastTurn: null,
    result: null,
  };
}

function rollOpening(state: TavlaState, seat: number, rng: () => number) {
  state.opening[seat] = rollDie(rng);
  const mine = state.opening[seat]!,
    theirs = state.opening[other(seat)];
  if (theirs === null) {
    state.turn = other(seat);
    return;
  }
  if (mine === theirs) {
    state.openingTie = mine;
    state.opening = [null, null];
    state.turn = state.first;
    return;
  }
  const starter = mine > theirs ? seat : other(seat);
  if (state.options.starterRerolls) {
    state.phase = 'roll';
    state.turn = starter;
    return;
  }
  beginTurn(state, starter, [state.opening[starter]!, state.opening[other(starter)]!]);
}

function matchStep(
  legal: TavlaStep[],
  seat: number,
  command: Extract<TavlaCommand, { action: 'move' }>,
): TavlaStep | null {
  const matches = legal.filter(
    (step) =>
      step.from === command.from &&
      step.to === command.to &&
      (command.die === undefined || step.die === command.die),
  );
  if (!matches.length) return null;
  // Only bearing off can match several dice: prefer the exact die, then the smallest one.
  const exact = matches.find(
    (step) => step.from !== 'bar' && step.die === distance(seat, step.from),
  );
  return exact ?? matches.reduce((best, step) => (step.die < best.die ? step : best));
}

export function tavlaAction(
  input: TavlaState,
  seat: number,
  command: TavlaCommand,
  rng: () => number,
): TavlaState | { error: string } {
  if (input.phase === 'over') return { error: 'ROUND_OVER' };
  if (input.turn !== seat) return { error: 'NOT_YOUR_TURN' };
  const state = clone(input);
  switch (command.action) {
    case 'roll':
      if (state.phase === 'opening') rollOpening(state, seat, rng);
      else if (state.phase === 'roll') beginTurn(state, seat, [rollDie(rng), rollDie(rng)]);
      else return { error: 'ALREADY_ROLLED' };
      return state;
    case 'move': {
      if (state.phase !== 'moving') return { error: 'ROLL_REQUIRED' };
      const step = matchStep(tavlaLegalMoves(state), seat, command);
      if (!step) return { error: 'ILLEGAL_MOVE' };
      setPosition(state, applyStep(position(state), seat, step));
      state.moves.push(step);
      state.remaining = without(state.remaining, step.die);
      return state;
    }
    case 'undo': {
      if (state.phase !== 'moving' || !state.turnStart) return { error: 'ROLL_REQUIRED' };
      if (!state.moves.length) return { error: 'NOTHING_TO_UNDO' };
      state.moves.pop();
      let pos = clone(state.turnStart);
      let remaining =
        state.dice![0] === state.dice![1] ? Array(4).fill(state.dice![0]) : [...state.dice!];
      for (const step of state.moves) {
        pos = applyStep(pos, seat, step);
        remaining = without(remaining, step.die);
      }
      setPosition(state, pos);
      state.remaining = remaining;
      return state;
    }
    case 'confirm': {
      if (state.phase !== 'moving') return { error: 'ROLL_REQUIRED' };
      if (!turnComplete(state)) return { error: 'MOVES_REMAINING' };
      const record: TavlaTurnRecord = {
        seat,
        dice: [...state.dice!],
        moves: state.moves,
        passed: false,
      };
      if (state.off[seat] === TAVLA_CHECKERS) {
        const mars = state.off[other(seat)] === 0;
        state.result = { winner: seat, points: mars ? 2 : 1, mars };
        state.lastTurn = record;
        state.phase = 'over';
        state.turn = null;
        state.dice = null;
        state.remaining = [];
        state.turnStart = null;
        state.moves = [];
        state.maxMoves = 0;
        return state;
      }
      passTurn(state, record);
      return state;
    }
    default:
      return { error: 'UNKNOWN_ACTION' };
  }
}

export function tavlaView(state: TavlaState, viewerSeat: number | null): TavlaView {
  const pos = position(state);
  const legalMoves = tavlaLegalMoves(state);
  return {
    kind: TAVLA_KIND,
    phase: state.phase,
    you: viewerSeat === 0 || viewerSeat === 1 ? viewerSeat : null,
    turn: state.turn,
    points: state.points.map((n) => ({ seat: n > 0 ? 0 : n < 0 ? 1 : null, count: Math.abs(n) })),
    bar: [...state.bar] as [number, number],
    off: [...state.off] as [number, number],
    pips: [tavlaPips(pos, 0), tavlaPips(pos, 1)],
    opening: [...state.opening] as [number | null, number | null],
    openingTie: state.openingTie,
    dice: state.dice ? [...state.dice] : null,
    remaining: [...state.remaining],
    moves: clone(state.moves),
    legalMoves,
    canUndo: state.phase === 'moving' && state.moves.length > 0,
    canConfirm: state.phase === 'moving' && legalMoves.length === 0,
    lastTurn: state.lastTurn ? clone(state.lastTurn) : null,
    result: state.result ? { ...state.result } : null,
    match: {
      matchTo: state.options.matchTo,
      scores: [...state.options.scores] as [number, number],
      starterRerolls: state.options.starterRerolls,
    },
  };
}

export function tavlaSettle(state: TavlaState): { points: number[]; winners: number[] } | null {
  if (state.phase !== 'over' || !state.result) return null;
  const points = [0, 0];
  points[state.result.winner] = state.result.points;
  return { points, winners: [state.result.winner] };
}

/** Adds a round's points to the match score and reports whether the match is decided. */
export function tavlaMatchStatus(
  scores: readonly number[],
  roundPoints: readonly number[],
  matchTo: number,
): { scores: [number, number]; over: boolean; winners: number[] } {
  const next: [number, number] = [
    (scores[0] ?? 0) + (roundPoints[0] ?? 0),
    (scores[1] ?? 0) + (roundPoints[1] ?? 0),
  ];
  const winners = [0, 1].filter((seat) => next[seat] >= matchTo);
  return { scores: next, over: winners.length > 0, winners };
}

// --- Bot -------------------------------------------------------------------------------------------

/** Static evaluation of a position for `seat`: race, hits, made points, safe checkers, bearing off. */
function evaluate(pos: TavlaPosition, seat: number): number {
  const opponent = other(seat);
  let score = tavlaPips(pos, opponent) - tavlaPips(pos, seat);
  score += 4 * pos.off[seat] + 14 * pos.bar[opponent] - 14 * pos.bar[seat];
  for (let i = 0; i < 24; i++) {
    const mine = own(pos, seat, i);
    if (mine >= 2) score += inHome(seat, i) ? 5 : 3;
    if (mine !== 1) continue;
    // A blot is exposed when an opponent checker (or bar entry) is behind it within direct-ish range.
    let exposed = false;
    for (let j = 0; j < 24 && !exposed; j++) {
      if (!own(pos, opponent, j)) continue;
      const gap = seat === 0 ? i - j : j - i;
      if (gap >= 1 && gap <= 11) exposed = true;
    }
    if (pos.bar[opponent] && (seat === 0 ? i <= 11 : i >= 12)) exposed = true;
    score -= exposed ? 9 : 1;
  }
  return score;
}

function bestContinuation(
  pos: TavlaPosition,
  seat: number,
  remaining: number[],
  depth: number,
): number {
  if (depth <= 0 || pos.off[seat] === TAVLA_CHECKERS) return evaluate(pos, seat);
  let best = -Infinity;
  for (const step of candidateSteps(pos, seat, remaining)) {
    const value = bestContinuation(
      applyStep(pos, seat, step),
      seat,
      without(remaining, step.die),
      depth - 1,
    );
    if (value > best) best = value;
  }
  return best;
}

export function tavlaBotCommand(state: TavlaState, seat: number): TavlaCommand {
  if (state.phase !== 'moving') return { action: 'roll' };
  const legal = tavlaLegalMoves(state);
  if (!legal.length) return { action: 'confirm' };
  const pos = position(state),
    need = state.maxMoves - state.moves.length;
  let best = legal[0],
    bestValue = -Infinity;
  for (const step of legal) {
    const value = bestContinuation(
      applyStep(pos, seat, step),
      seat,
      without(state.remaining, step.die),
      need - 1,
    );
    if (value > bestValue) {
      best = step;
      bestValue = value;
    }
  }
  return { action: 'move', from: best.from, to: best.to, die: best.die };
}

// --- Command parsing & module ------------------------------------------------------------------------

const ACTIONS = ['roll', 'move', 'undo', 'confirm'] as const;

export function parseTavlaCommand(input: {
  action: string;
  payload?: unknown;
}): TavlaCommand | { error: string } {
  switch (input.action) {
    case 'roll':
    case 'undo':
    case 'confirm':
      return { action: input.action };
    case 'move': {
      const payload = input.payload as { from?: unknown; to?: unknown; die?: unknown } | undefined;
      if (!payload || typeof payload !== 'object') return { error: 'INVALID_MOVE' };
      const point = (v: unknown) =>
        typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 23;
      const { from, to, die } = payload;
      if (!(from === 'bar' || point(from)) || !(to === 'off' || point(to)))
        return { error: 'INVALID_MOVE' };
      if (
        die !== undefined &&
        !(typeof die === 'number' && Number.isInteger(die) && die >= 1 && die <= 6)
      )
        return { error: 'INVALID_MOVE' };
      return {
        action: 'move',
        from: from as TavlaFrom,
        to: to as TavlaTo,
        ...(die === undefined ? {} : { die: die as number }),
      };
    }
    default:
      return { error: 'UNKNOWN_ACTION' };
  }
}

/** Validates `game.create` options: `matchTo` (3/5/7) and `starterRerolls`. */
export function parseTavlaOptions(
  input: Record<string, string | number | boolean> | undefined,
): TavlaOptions | { error: string } {
  if (!input) return {};
  const options: TavlaOptions = {};
  for (const [key, value] of Object.entries(input)) {
    if (key === 'matchTo') {
      const n = typeof value === 'string' ? Number(value) : value;
      if (!(TAVLA_MATCH_TARGETS as readonly unknown[]).includes(n))
        return { error: 'INVALID_OPTIONS' };
      options.matchTo = n as number;
    } else if (key === 'starterRerolls') {
      if (typeof value !== 'boolean') return { error: 'INVALID_OPTIONS' };
      options.starterRerolls = value;
    } else return { error: 'INVALID_OPTIONS' };
  }
  return options;
}

/** Commands that make sense for `seat` right now (buttons on its own turn). */
export function tavlaLegalActions(state: TavlaState, seat: number): string[] {
  if (state.turn !== seat) return [];
  if (state.phase === 'opening' || state.phase === 'roll') return ['roll'];
  if (state.phase !== 'moving') return [];
  const actions: string[] = [];
  const legal = tavlaLegalMoves(state);
  if (legal.length) actions.push('move');
  if (state.moves.length) actions.push('undo');
  if (!legal.length) actions.push('confirm');
  return actions;
}

export const tavlaModule = {
  kind: TAVLA_KIND,
  seats: [2],
  actions: ACTIONS,
  parseCommand: parseTavlaCommand,
  // Opening dice are rolled by the players' `roll` commands, so start() needs no randomness.
  start: (seatCount, options, first, _rng) => startTavla(seatCount, options, first),
  action: tavlaAction,
  view: tavlaView,
  turn: (state) => state.turn,
  botCommand: (state, seat, _rng) => tavlaBotCommand(state, seat),
  settle: tavlaSettle,
  parseOptions: parseTavlaOptions,
  legalActions: tavlaLegalActions,
  // Each roll and each turn change restarts the timer; single checker steps within a turn do not.
  phase: (state) => `${state.phase}:${state.turn}:${state.dice?.join('') ?? ''}`,
} satisfies GameModule<TavlaState, TavlaCommand, TavlaView, TavlaOptions>;
